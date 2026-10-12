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
  const row=await env.DB.prepare('SELECT expires_at,account_id,auth_version FROM auth_sessions WHERE id_hash=?').bind(idHash).first();
  if(!row||row.expires_at<current||row.expires_at<expires)return null;
  let account=null;
  if(individualAccounts(env)){
    account=await env.DB.prepare('SELECT u.id,u.username,u.angler_id anglerId,a.name,a.default_language defaultLanguage FROM auth_accounts u JOIN anglers a ON a.id=u.angler_id WHERE u.id=? AND u.active=1').bind(row.account_id).first();
    const credential=await env.DB.prepare('SELECT version FROM auth_credential WHERE id=1').first();
    if(!account||!credential||credential.version!==row.auth_version)return null;
  }
  let refreshCookie=null;
  if(expires-current<ageSeconds-renewalSeconds){
    const next=current+ageSeconds;
    await env.DB.prepare('UPDATE auth_sessions SET expires_at=MAX(expires_at,?) WHERE id_hash=?').bind(next,idHash).run();
    refreshCookie=formatCookie(await issue(key,parts[1],next),ageSeconds);
  }
  return {idHash,refreshCookie,account};
}

export async function login(request,env){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded'))return response(415,'Unsupported Media Type');
  if(Number(request.headers.get('content-length')||0)>4096)return response(413,'Payload Too Large');
  const raw=await request.text();if(raw.length>4096)return response(413,'Payload Too Large');
  const data=new URLSearchParams(raw),username=data.get('username')||'',password=data.get('password')||'';
  const ip=request.headers.get('cf-connecting-ip')||'unknown';
  const ipHash=hex(await digest(`${env.RYBY_SESSION_SECRET}\0${ip}`)),current=now();
  const limit=await env.DB.prepare('SELECT attempts,reset_at FROM auth_login_limits WHERE id_hash=?').bind(ipHash).first();
  if(limit&&limit.reset_at>current&&limit.attempts>=8)return redirect('/login?error=limit');
  let account,credential,valid;
  if(individualAccounts(env)){
    credential=await sharedCredential(env);
    const loginName=env.APP_ENV==='preview'&&env.AUTH_LEGACY_ALIAS&&username===env.RYBY_LOGIN_USERNAME?env.AUTH_LEGACY_ALIAS:username.trim();
    account=await env.DB.prepare('SELECT id FROM auth_accounts WHERE username=? COLLATE NOCASE AND active=1').bind(loginName).first();
    valid=await verifyPassword(env,password,credential);
    valid=Boolean(account)&&valid;
  }else{
  const [userExpected,userActual,passExpected,passActual]=await Promise.all([
    digest(env.RYBY_LOGIN_USERNAME),digest(username),digest(env.RYBY_LOGIN_PASSWORD),digest(password)
  ]);
  valid=equal(userExpected,userActual)&&equal(passExpected,passActual);
  }
  if(!valid){
    const attempts=limit&&limit.reset_at>current?limit.attempts+1:1;
    await env.DB.prepare('INSERT INTO auth_login_limits(id_hash,attempts,reset_at) VALUES(?,?,?) ON CONFLICT(id_hash) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at').bind(ipHash,attempts,limit&&limit.reset_at>current?limit.reset_at:current+900).run();
    return redirect('/login?error=credentials');
  }
  await env.DB.prepare('DELETE FROM auth_login_limits WHERE id_hash=?').bind(ipHash).run();
  const id=b64(crypto.getRandomValues(new Uint8Array(32))),expires=current+ageSeconds;
  await env.DB.prepare('INSERT INTO auth_sessions(id_hash,expires_at,account_id,auth_version) VALUES(?,?,?,?)').bind(hex(await digest(id)),expires,account?.id||null,credential?.version||null).run();
  const result=redirect('/');result.headers.set('set-cookie',formatCookie(await issue(await signingKey(env),id,expires),ageSeconds));return result;
}
export async function logout(env,active){
  await env.DB.prepare('DELETE FROM auth_sessions WHERE id_hash=?').bind(active.idHash).run();
  return response(200,JSON.stringify({ok:true}),{'content-type':'application/json; charset=utf-8','set-cookie':formatCookie('',0)});
}
export const loginAssets=new Set(['/login','/login.html','/login.css','/login.js','/i18n.js','/locales/pl.json','/locales/en.json','/locales/runtime.en.json','/manifest.webmanifest','/icons/ryby-192.png','/icons/ryby-512.png']);

export const individualAccounts=env=>env.INDIVIDUAL_ACCOUNTS==='true';
const iterations=100000;
async function passwordHash(env,password,salt){
  // Pepper is a Workers secret, independent of the private D1 salt/hash.
  const material=await digest(`${password}\0${env.RYBY_SESSION_SECRET}`);
  const key=await crypto.subtle.importKey('raw',material,'PBKDF2',false,['deriveBits']);
  return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations,salt:encoder.encode(salt)},key,256)));
}
async function sharedCredential(env){
  let row=await env.DB.prepare('SELECT * FROM auth_credential WHERE id=1').first();
  if(!row){
    const salt=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await passwordHash(env,env.RYBY_LOGIN_PASSWORD,salt);
    await env.DB.prepare('INSERT OR IGNORE INTO auth_credential(id,salt,password_hash,iterations,version) VALUES(1,?,?,?,1)').bind(salt,hash,iterations).run();
    row=await env.DB.prepare('SELECT * FROM auth_credential WHERE id=1').first();
  }
  return row;
}
async function verifyPassword(env,password,row){return equal(encoder.encode(await passwordHash(env,password,row.salt)),encoder.encode(row.password_hash));}
export function accountUsername(value){
  const name=text(value,'Login',32,true);
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,31}$/.test(name))fail('Login: 2–32 znaki, litery bez akcentów, cyfry, kropka, myślnik lub podkreślenie.');
  return name;
}
export async function accountList(env){return (await env.DB.prepare('SELECT u.id,u.username,u.angler_id anglerId,u.active,a.name FROM auth_accounts u JOIN anglers a ON a.id=u.angler_id ORDER BY u.username').all()).results;}
export async function changeSharedPassword(request,env,active){
  const x=await body(request),current=x.currentPassword,next=x.newPassword;
  if(typeof current!=='string'||typeof next!=='string'||!current.length||current.length>256||next.length>256)fail('Nieprawidłowe hasło.');
  if(next.length<8)fail('Nowe hasło musi mieć co najmniej 8 znaków.');
  const row=await sharedCredential(env);
  if(!await verifyPassword(env,current,row))fail('Obecne hasło jest nieprawidłowe.',403);
  const salt=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await passwordHash(env,next,salt);
  // Compare-and-swap avoids a simultaneous rotation overwriting a newer password.
  const changed=await env.DB.prepare('UPDATE auth_credential SET salt=?,password_hash=?,version=version+1 WHERE id=1 AND version=?').bind(salt,hash,row.version).run();
  if(!changed.meta.changes)fail('Hasło zmieniło się w międzyczasie. Zaloguj się ponownie.',409);
  // Version check revokes every earlier session, without deleting pending device queues.
  return response(200,JSON.stringify({ok:true}),{'content-type':'application/json','set-cookie':formatCookie('',0)});
}
