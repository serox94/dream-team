import test from 'node:test';import assert from 'node:assert/strict';import worker from '../src/worker.js';import {session,login} from '../src/auth.js';import {ensureSchema} from '../src/ensure-schema.js';import {database} from './db.mjs';
test('parallel logins reserve at most eight slots per IP; expiration and successful reset still work',async()=>{
 const DB=database(),env={DB,INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'fixture',RYBY_LOGIN_PASSWORD:'fixture-password',RYBY_SESSION_SECRET:'fixture-session-secret-at-least-32-characters'};
 const attempt=(password,ip='203.0.113.20')=>login(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cf-connecting-ip':ip},body:new URLSearchParams({username:'Patryk',password})}),env);
 try{
  // Initialize only the private credential; concurrent attempts exercise the real D1 counter.
  await attempt(env.RYBY_LOGIN_PASSWORD,'203.0.113.21');
  const responses=await Promise.all(Array.from({length:12},()=>attempt('wrong')));
  assert.equal(responses.filter(r=>r.headers.get('location')==='/login?error=credentials').length,8);assert.equal(responses.filter(r=>r.headers.get('location')==='/login?error=limit').length,4);assert.ok(responses.every(r=>!r.headers.get('set-cookie')));
  assert.equal(DB.sqlite.prepare('SELECT attempts FROM auth_login_limits').get().attempts,8);assert.equal((await attempt(env.RYBY_LOGIN_PASSWORD)).headers.get('location'),'/login?error=limit');
  const now=Math.floor(Date.now()/1000);DB.sqlite.prepare('UPDATE auth_login_limits SET reset_at=?').run(now-1);assert.equal((await attempt('wrong')).headers.get('location'),'/login?error=credentials');assert.equal(DB.sqlite.prepare('SELECT attempts FROM auth_login_limits').get().attempts,1);
  const accepted=await attempt(env.RYBY_LOGIN_PASSWORD);assert.equal(accepted.headers.get('location'),'/');assert.ok(accepted.headers.get('set-cookie'));assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM auth_login_limits').get().n,0);
 }finally{DB.close();}
});
test('schema check is scoped to its binding and sessions use one fresh joined authorization read',async()=>{
 const DB=database(),env={DB,INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'fixture',RYBY_LOGIN_PASSWORD:'fixture-password',RYBY_SESSION_SECRET:'fixture-session-secret-at-least-32-characters'};
 try{
  let schemaReads=0;const original=DB.prepare;DB.prepare=sql=>{if(sql.includes("key='schema_version'"))schemaReads++;return original(sql);};
  await Promise.all([ensureSchema(env),ensureSchema(env)]);await ensureSchema(env);assert.equal(schemaReads,1);
  const login=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=Patryk&password=fixture-password'}),env),cookie=login.headers.get('set-cookie').split(';')[0];
  let queries=0;DB.prepare=sql=>{queries++;return original(sql);};const request=new Request('https://dream.test/',{headers:{cookie}});
  const active=await session(request,env);assert.equal(queries,1);assert.equal(active.account.anglerId,'patryk');
  DB.sqlite.prepare('UPDATE auth_credential SET version=version+1 WHERE id=1').run();assert.equal(await session(request,env),null,'joined read sees immediate password revocation');
  const other=database();try{await ensureSchema({DB:other});}finally{other.close();}
 }finally{DB.close();}
});
