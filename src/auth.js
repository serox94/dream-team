import {body,fail,text} from './validation.js';
const encoder=new TextEncoder();
const cookieName='__Host-ryby_session';
const ageSeconds=730*24*60*60;
const renewalSeconds=24*60*60;
const formatCookie=(value,maxAge)=>`${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const digest=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;};
const now=()=>Math.floor(Date.now()/1000);
const response=(status,body,headers={})=>new Response(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const redirect=path=>response(303,null,{location:path});

export function authConfigured(env){
  return typeof env.RYBY_LOGIN_USERNAME==='string'&&env.RYBY_LOGIN_USERNAME.length>0&&
    typeof env.RYBY_LOGIN_PASSWORD==='string'&&env.RYBY_LOGIN_PASSWORD.length>0&&
    typeof env.RYBY_SESSION_SECRET==='string'&&env.RYBY_SESSION_SECRET.length>=32;
}
async function signingKey(env){
  const derived=await digest(`${env.RYBY_SESSION_SECRET}\0${env.RYBY_LOGIN_USERNAME}\0${env.RYBY_LOGIN_PASSWORD}`);
  return crypto.subtle.importKey('raw',derived,{name:'HMAC',hash:'SHA-256'},false,['sign']);
}
async function signature(key,data){return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(data))));}
async function issue(key,id,expires){const payload=`v1.${id}.${expires}`;return `${payload}.${await signature(key,payload)}`;}
function cookie(request){
  const raw=request.headers.get('cookie')||'';
  return raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
}
export async function session(request,env){
  const value=cookie(request);
  if(!value||value.length>256)return null;
  const parts=value.split('.');
  if(parts.length!==4||parts[0]!=='v1'||!(/^[\w-]{43}$/).test(parts[1])||!(/^\d{10}$/).test(parts[2])||!(/^[\w-]{43}$/).test(parts[3]))return null;
  const expires=Number(parts[2]),current=now();
  if(expires<=current||expires>current+ageSeconds+60)return null;
  const key=await signingKey(env),expected=await signature(key,parts.slice(0,3).join('.'));
  if(!equal(encoder.encode(parts[3]),encoder.encode(expected)))return null;
  const idHash=hex(await digest(parts[1]));
  const individual=individualAccounts(env);
  const row=await env.DB.prepare(individual?
    'SELECT s.expires_at,u.id,u.username,u.angler_id anglerId,u.protected,a.name,a.default_language defaultLanguage,COALESCE(p.must_change,0) mustChangePassword FROM auth_sessions s JOIN auth_accounts u ON u.id=s.account_id AND u.active=1 JOIN anglers a ON a.id=u.angler_id JOIN auth_credential c ON c.id=1 LEFT JOIN auth_account_credentials p ON p.account_id=u.id WHERE s.id_hash=? AND s.auth_version=COALESCE(p.version,c.version)':
    'SELECT expires_at FROM auth_sessions WHERE id_hash=?').bind(idHash).first();
  if(!row||row.expires_at<current||row.expires_at<expires)return null;
  const account=individual?{id:row.id,username:row.username,anglerId:row.protected?null:row.anglerId,name:row.name,defaultLanguage:row.defaultLanguage,protected:Boolean(row.protected),mustChangePassword:Boolean(row.mustChangePassword)}:null;
  let refreshCookie=null;
  if(expires-current<ageSeconds-renewalSeconds){
    const next=current+ageSeconds;
    await env.DB.prepare('UPDATE auth_sessions SET expires_at=MAX(expires_at,?) WHERE id_hash=?').bind(next,idHash).run();
    refreshCookie=formatCookie(await issue(key,parts[1],next),ageSeconds);
  }
  return {idHash,refreshCookie,account};
}

export async function login(request,env){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))return response(415,JSON.stringify({ok:false,error:'Wymagany Content-Type: application/x-www-form-urlencoded.'}),{'content-type':'application/json'});
  if(Number(request.headers.get('content-length')||0)>4096)return response(413,JSON.stringify({ok:false,error:'Żądanie jest zbyt duże.'}),{'content-type':'application/json'});
  const raw=await request.text();if(raw.length>4096)return response(413,JSON.stringify({ok:false,error:'Żądanie jest zbyt duże.'}),{'content-type':'application/json'});
  const data=new URLSearchParams(raw),username=data.get('username')||'',password=data.get('password')||'';
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  const ipHash=hex(await digest(`${env.RYBY_SESSION_SECRET}\0${ip}`)),current=now();
  // Reserve a slot atomically before the expensive password check. Parallel
  // failures must not all read zero and overwrite the counter with one.
  const slot=await env.DB.prepare('INSERT INTO auth_login_limits(id_hash,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(id_hash) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN ? ELSE reset_at END WHERE reset_at<=? OR attempts<8').bind(ipHash,current+900,current,current,current+900,current).run();
  if(!slot.meta.changes)return redirect('/login?error=limit');
  let account,credential,valid;
  if(individualAccounts(env)){
    credential=await sharedCredential(env);
    const loginName=env.APP_ENV==='preview'&&env.AUTH_LEGACY_ALIAS&&username===env.RYBY_LOGIN_USERNAME?env.AUTH_LEGACY_ALIAS:username.trim();
    account=await env.DB.prepare('SELECT id FROM auth_accounts WHERE username=? COLLATE NOCASE AND active=1').bind(loginName).first();
    if(account){const own=await env.DB.prepare('SELECT * FROM auth_account_credentials WHERE account_id=?').bind(account.id).first();if(own)credential={...own,individual:true};}
    valid=await verifyPassword(env,password,credential);
    valid=Boolean(account)&&valid;
  }else{
  const [userExpected,userActual,passExpected,passActual]=await Promise.all([
    digest(env.RYBY_LOGIN_USERNAME),digest(username),digest(env.RYBY_LOGIN_PASSWORD),digest(password)
  ]);
  valid=equal(userExpected,userActual)&&equal(passExpected,passActual);
  }
  if(!valid){
    return redirect('/login?error=credentials');
  }
  await env.DB.prepare('DELETE FROM auth_login_limits WHERE id_hash=?').bind(ipHash).run();
  const id=b64(crypto.getRandomValues(new Uint8Array(32))),expires=current+ageSeconds;
  const stored=individualAccounts(env)?await env.DB.prepare('INSERT INTO auth_sessions(id_hash,expires_at,account_id,auth_version) SELECT ?,?,u.id,COALESCE(p.version,c.version) FROM auth_accounts u JOIN auth_credential c ON c.id=1 LEFT JOIN auth_account_credentials p ON p.account_id=u.id WHERE u.id=? AND u.active=1 AND COALESCE(p.version,c.version)=? AND COALESCE(p.salt,c.salt)=?').bind(hex(await digest(id)),expires,account.id,credential.version,credential.salt).run():await env.DB.prepare('INSERT INTO auth_sessions(id_hash,expires_at,account_id,auth_version) VALUES(?,?,NULL,NULL)').bind(hex(await digest(id)),expires).run();
  if(!stored.meta.changes)return redirect('/login?error=credentials');
  const result=redirect('/');result.headers.set('set-cookie',formatCookie(await issue(await signingKey(env),id,expires),ageSeconds));return result;
}
export async function logout(env,active){
  await env.DB.prepare('DELETE FROM auth_sessions WHERE id_hash=?').bind(active.idHash).run();
  return response(200,JSON.stringify({ok:true}),{'content-type':'application/json; charset=utf-8','set-cookie':formatCookie('',0)});
}
export const loginAssets=new Set(['/login','/login.html','/login.css','/login.js','/i18n.js','/language-preference.js','/locales/pl.json','/locales/en.json','/locales/runtime.en.json','/manifest.webmanifest','/icons/ryby-192.png','/icons/ryby-512.png']);

export const individualAccounts=env=>env.INDIVIDUAL_ACCOUNTS==='true';
const iterations=100000;
async function passwordHash(env,password,salt){
  // Pepper is a Workers secret, independent of the private D1 salt/hash.
  const material=await digest(`${password}\0${env.RYBY_SESSION_SECRET}`);
  const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations,salt:encoder.encode(salt)},key,256)));
}
async function sharedCredential(env){
 const row=await env.DB.prepare('SELECT * FROM auth_credential WHERE id=1').first();
 if(!row)fail('Przerwa serwisowa. Spróbuj ponownie później.',503);
 return row;
}
// Explicit CLI/test initialization. Never called by login, HTTP or cron.
export async function initializeAccounts(env){
 const mappings=await accountList(env);
 for(const [username,id] of [['Patryk','patryk'],['Maciek','maciek']]){
  const profile=await env.DB.prepare('SELECT id FROM anglers WHERE id=?').bind(id).first();
  if(!profile||!mappings.some(a=>a.username===username&&a.anglerId===id))throw Error('ACCOUNT_PREFLIGHT');
 }
 if(mappings.filter(a=>a.active&&!a.protected).length>3)throw Error('ACCOUNT_PREFLIGHT');
 const existing=await env.DB.prepare('SELECT id FROM auth_credential WHERE id=1').first();
 if(existing)return {initialized:false};
 if(typeof env.RYBY_LOGIN_PASSWORD!=='string'||!env.RYBY_LOGIN_PASSWORD||typeof env.RYBY_SESSION_SECRET!=='string'||env.RYBY_SESSION_SECRET.length<32)throw Error('ACCOUNT_SECRET_PREFLIGHT');
 const salt=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await passwordHash(env,env.RYBY_LOGIN_PASSWORD,salt);
 const inserted=await env.DB.prepare('INSERT OR IGNORE INTO auth_credential(id,salt,password_hash,iterations,version) VALUES(1,?,?,?,1)').bind(salt,hash,iterations).run();
 if(inserted.meta.changes)await env.DB.prepare('DELETE FROM auth_sessions').run();
 return {initialized:Boolean(inserted.meta.changes)};
}
export async function updateAccountAccess(request,env,id){
 const x=await body(request);if(typeof x.active!=='boolean')fail('Nieprawidłowy status lub język.');
 const account=await env.DB.prepare('SELECT id,active,protected FROM auth_accounts WHERE id=?').bind(id).first();if(!account)fail('Nie znaleziono uczestnika.',404);
 if(account.protected&&!x.active)fail('Konto chronione nie może zostać wyłączone.',409,'PROTECTED_ACCOUNT');
 const statements=[env.DB.prepare('UPDATE auth_accounts SET active=? WHERE id=?').bind(x.active?1:0,id)];
 if(!x.active)statements.push(env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=?').bind(id));
 try{await env.DB.batch(statements);}catch(error){if(/LAST_ACTIVE_ACCOUNT/.test(error.message))fail('Nie można wyłączyć ostatniego aktywnego konta.',409,'LAST_ACTIVE_ACCOUNT');if(/PROTECTED_ACCOUNT/.test(error.message))fail('Konto chronione nie może zostać wyłączone.',409,'PROTECTED_ACCOUNT');if(/MAX_ACTIVE_ACCOUNTS/.test(error.message))fail('Maksymalnie trzy aktywne konta.',409,'MAX_ACTIVE_ACCOUNTS');throw error;}
 return response(200,JSON.stringify({ok:true}),{'content-type':'application/json'});
}
async function verifyPassword(env,password,row){return equal(encoder.encode(await passwordHash(env,password,row.salt)),encoder.encode(row.password_hash));}
export function accountUsername(value){
  const name=text(value,'Login',32,true);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,31}$/.test(name))fail('Login: 2–32 znaki, litery bez akcentów, cyfry, kropka, myślnik lub podkreślenie.');
  return name;
}
export async function accountList(env){return (await env.DB.prepare('SELECT u.id,u.username,u.angler_id anglerId,u.active,u.protected,a.name FROM auth_accounts u JOIN anglers a ON a.id=u.angler_id ORDER BY u.username').all()).results;}
// Operator only, after the private checkpoint. Never called by HTTP or cron.
// Initial password is supplied privately by the operator, never derived from the login.
export async function initializeProtectedAccount(env,password,{reset=false,expectedVersion=null}={}){
 const account=await env.DB.prepare('SELECT id,protected,angler_id FROM auth_accounts WHERE username=? COLLATE NOCASE').bind('ryby').first();
 if(account&&(!account.protected||account.id!=='account-system-ryby'||account.angler_id!=='system-ryby'))throw Error('PROTECTED_ACCOUNT_COLLISION');
 if(!account&&await env.DB.prepare('SELECT id FROM anglers WHERE id=?').bind('system-ryby').first())throw Error('PROTECTED_PROFILE_COLLISION');
 const existing=account?await env.DB.prepare('SELECT version FROM auth_account_credentials WHERE account_id=?').bind(account.id).first():null;
 if(existing&&!reset)return {initialized:false};
 if(typeof password!=='string'||!password||password.length>256)throw Error('PROTECTED_ACCOUNT_SECRET_REQUIRED');
 const salt=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await passwordHash(env,password,salt),id='account-system-ryby';
 if(reset){
  if(!existing||existing.version!==expectedVersion)throw Error('PROTECTED_RESET_VERSION');
  const changed=await env.DB.batch([
   env.DB.prepare('UPDATE auth_account_credentials SET salt=?,password_hash=?,version=version+1,must_change=1 WHERE account_id=? AND version=?').bind(salt,hash,id,expectedVersion),
   env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM auth_account_credentials WHERE account_id=? AND salt=?)').bind(id,id,salt)
  ]);if(!changed[0].meta.changes)throw Error('PROTECTED_RESET_VERSION');return {initialized:false,reset:true};
 }
 await env.DB.batch([
  env.DB.prepare("INSERT INTO anglers(id,name,pb_kg,baseline_pb_kg,active,default_language) VALUES('system-ryby','Ryby',0,0,0,'pl') ON CONFLICT(id) DO NOTHING"),
  env.DB.prepare('INSERT INTO auth_accounts(id,username,angler_id,active,protected) VALUES(?,?,?,1,1) ON CONFLICT(id) DO NOTHING').bind(id,'ryby','system-ryby'),
  env.DB.prepare('INSERT INTO auth_account_credentials(account_id,salt,password_hash,iterations,version,must_change) VALUES(?,?,?,?,1,1) ON CONFLICT(account_id) DO NOTHING').bind(id,salt,hash,iterations)
 ]);
 return {initialized:true};
}
export async function changeSharedPassword(request,env,active){
  const x=await body(request),current=x.currentPassword,next=x.newPassword;
  if(typeof current!=='string'||typeof next!=='string'||!current.length||current.length>256||next.length>256)fail('Nieprawidłowe hasło.');
  if(next.length<8)fail('Nowe hasło musi mieć co najmniej 8 znaków.');
  const own=await env.DB.prepare('SELECT * FROM auth_account_credentials WHERE account_id=?').bind(active.account.id).first();
  const row=own||await sharedCredential(env);
  if(!await verifyPassword(env,current,row))fail('Obecne hasło jest nieprawidłowe.',403);
  if(own?.must_change&&!(typeof x.sharedPassword==='string'&&x.sharedPassword.length<=256&&await verifyPassword(env,x.sharedPassword,await sharedCredential(env))))fail('Potwierdź obecne wspólne hasło zespołu.',403,'BOOTSTRAP_CONFIRMATION_REQUIRED');
  if(next===current)fail('Nowe hasło musi różnić się od obecnego.',400,'PASSWORD_UNCHANGED');
  const salt=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await passwordHash(env,next,salt);
  if(own){
    const changed=await env.DB.batch([
      env.DB.prepare('UPDATE auth_account_credentials SET salt=?,password_hash=?,version=version+1,must_change=0 WHERE account_id=? AND version=?').bind(salt,hash,active.account.id,row.version),
      env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=? AND EXISTS(SELECT 1 FROM auth_account_credentials WHERE account_id=? AND salt=?)').bind(active.account.id,active.account.id,salt)
    ]);
    if(!changed[0].meta.changes)fail('Hasło zmieniło się w międzyczasie. Zaloguj się ponownie.',409,'CREDENTIAL_CHANGED');
    return response(200,JSON.stringify({ok:true}),{'content-type':'application/json','set-cookie':formatCookie('',0)});
  }
  // Compare-and-swap avoids a simultaneous rotation overwriting a newer password.
  const changed=await env.DB.batch([
    env.DB.prepare('UPDATE auth_credential SET salt=?,password_hash=?,version=version+1 WHERE id=1 AND version=?').bind(salt,hash,row.version),
    env.DB.prepare('DELETE FROM auth_sessions WHERE EXISTS(SELECT 1 FROM auth_credential WHERE id=1 AND version=? AND salt=?)').bind(row.version+1,salt)
  ]);
  if(!changed[0].meta.changes)fail('Hasło zmieniło się w międzyczasie. Zaloguj się ponownie.',409);
  // Version check revokes every earlier session, without deleting pending device queues.
  return response(200,JSON.stringify({ok:true}),{'content-type':'application/json','set-cookie':formatCookie('',0)});
}
