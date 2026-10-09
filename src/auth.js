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
  const row=await env.DB.prepare('SELECT expires_at FROM auth_sessions WHERE id_hash=?').bind(idHash).first();
  if(!row||row.expires_at<current||row.expires_at<expires)return null;
  let refreshCookie=null;
  if(expires-current<ageSeconds-renewalSeconds){
    const next=current+ageSeconds;
    await env.DB.prepare('UPDATE auth_sessions SET expires_at=MAX(expires_at,?) WHERE id_hash=?').bind(next,idHash).run();
    refreshCookie=formatCookie(await issue(key,parts[1],next),ageSeconds);
  }
  return {idHash,refreshCookie};
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
  const [userExpected,userActual,passExpected,passActual]=await Promise.all([
    digest(env.RYBY_LOGIN_USERNAME),digest(username),digest(env.RYBY_LOGIN_PASSWORD),digest(password)
  ]);
  if(!equal(userExpected,userActual)||!equal(passExpected,passActual)){
    const attempts=limit&&limit.reset_at>current?limit.attempts+1:1;
    await env.DB.prepare('INSERT INTO auth_login_limits(id_hash,attempts,reset_at) VALUES(?,?,?) ON CONFLICT(id_hash) DO UPDATE SET attempts=excluded.attempts,reset_at=excluded.reset_at').bind(ipHash,attempts,limit&&limit.reset_at>current?limit.reset_at:current+900).run();
    return redirect('/login?error=credentials');
  }
  await env.DB.prepare('DELETE FROM auth_login_limits WHERE id_hash=?').bind(ipHash).run();
  const id=b64(crypto.getRandomValues(new Uint8Array(32))),expires=current+ageSeconds;
  await env.DB.prepare('INSERT INTO auth_sessions(id_hash,expires_at) VALUES(?,?)').bind(hex(await digest(id)),expires).run();
  const result=redirect('/');result.headers.set('set-cookie',formatCookie(await issue(await signingKey(env),id,expires),ageSeconds));return result;
}
export async function logout(env,active){
  await env.DB.prepare('DELETE FROM auth_sessions WHERE id_hash=?').bind(active.idHash).run();
  return response(200,JSON.stringify({ok:true}),{'content-type':'application/json; charset=utf-8','set-cookie':formatCookie('',0)});
}
export const loginAssets=new Set(['/login','/login.html','/login.css','/login.js','/i18n.js','/locales/pl.json','/locales/en.json','/locales/runtime.en.json','/manifest.webmanifest','/icons/ryby-192.png','/icons/ryby-512.png']);
