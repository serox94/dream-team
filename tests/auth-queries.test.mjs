import test from 'node:test';import assert from 'node:assert/strict';import worker from '../src/worker.js';import {session} from '../src/auth.js';import {ensureSchema} from '../src/ensure-schema.js';import {database} from './db.mjs';
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
