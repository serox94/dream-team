import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/worker.js';import {database} from './db.mjs';
function setup(){const DB=database(),env={DB,INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'legacy',RYBY_LOGIN_PASSWORD:'fixture-only-shared-password',RYBY_SESSION_SECRET:'fixture-account-session-secret-over-32-characters',ASSETS:{fetch:()=>new Response('asset')}};
 const call=(path,method='GET',value,cookie,headers={})=>worker.fetch(new Request('https://dream.test'+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},body:value===undefined?undefined:JSON.stringify(value)}),env);
 const login=async(username,password=env.RYBY_LOGIN_PASSWORD)=>{const response=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})}),env);return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};};
 return {DB,env,call,login};}
test('individual sessions preserve profiles and PB, three accounts are atomic, no public registration',async()=>{const s=setup();try{
 const before=s.DB.sqlite.prepare('SELECT * FROM anglers ORDER BY id').all();const patryk=await s.login('pAtRyK'),maciek=await s.login('Maciek');assert.ok(patryk.cookie&&maciek.cookie);
 for(const [cookie,id] of [[patryk.cookie,'patryk'],[maciek.cookie,'maciek']]){const model=await(await s.call('/api/bootstrap','GET',undefined,cookie)).json();assert.equal(model.currentUser.anglerId,id);assert.ok(model.anglers.every(a=>a.baselinePbKg===13));}
 assert.equal((await s.call('/api/anglers','POST',{name:'Third',username:'Third'})).status,401);
 const responses=await Promise.all(['Third','Fourth'].map(name=>s.call('/api/anglers','POST',{name,username:name,baselinePbKg:7.5},maciek.cookie)));assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM auth_accounts WHERE active=1').get().n,3);assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM anglers').get().n,3);
 const created=await responses.find(r=>r.status===201).json(),third=await s.login(created.username);assert.equal((await(await s.call('/api/bootstrap','GET',undefined,third.cookie)).json()).currentUser.anglerId,created.id);
 assert.deepEqual(s.DB.sqlite.prepare("SELECT * FROM anglers WHERE id IN ('maciek','patryk') ORDER BY id").all(),before);
 assert.equal((await s.login('legacy')).cookie,undefined,'technical alias disabled outside preview');
 assert.equal((await s.login('Patryk','wrong')).cookie,undefined);
 const serialized=JSON.stringify(await(await s.call('/api/export','GET',undefined,patryk.cookie)).json());for(const key of ['auth_credential','password_hash','auth_sessions','auth_accounts',s.env.RYBY_LOGIN_PASSWORD,s.env.RYBY_SESSION_SECRET])assert.ok(!serialized.includes(key),key);
 const credential=s.DB.sqlite.prepare('SELECT * FROM auth_credential').get();assert.equal(credential.iterations,100000);assert.notEqual(credential.password_hash,s.env.RYBY_LOGIN_PASSWORD);assert.equal(credential.salt.length,64);
 }finally{s.DB.close();}});
test('password rotation revokes sessions; manual authors remain possible; offline ownership is enforced',async()=>{const s=setup();try{
 const p=await s.login('Patryk'),m=await s.login('Maciek');
 const catchPayload={tripId:'next-trip',anglerId:'maciek',weightKg:9,caughtAt:'2026-09-01T10:00:00Z'};
 assert.equal((await s.call('/api/catches','POST',catchPayload,p.cookie)).status,201,'Patryk can manually author a catch for Maciek');
 const op={key:crypto.randomUUID(),accountId:'account-patryk',path:'/api/catches',method:'POST',payload:{...catchPayload,anglerId:'patryk'}};
 assert.equal((await s.call('/api/offline-sync','POST',op,m.cookie)).status,403);assert.equal((await s.call('/api/offline-sync','POST',op,p.cookie)).status,200);assert.equal((await s.call('/api/offline-sync','POST',op,p.cookie)).status,200);assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM catches').get().n,2);
 assert.equal((await s.call('/api/account/password','POST',{currentPassword:'wrong',newPassword:'new-fixture-password'},p.cookie)).status,403);
 assert.equal((await s.call('/api/account/password','POST',{currentPassword:s.env.RYBY_LOGIN_PASSWORD,newPassword:'new-fixture-password'},p.cookie,{origin:'https://other.test'})).status,403);
 assert.equal((await s.call('/api/account/password','POST',{currentPassword:s.env.RYBY_LOGIN_PASSWORD,newPassword:'new-fixture-password'},p.cookie)).status,200);
 for(const cookie of [p.cookie,m.cookie])assert.equal((await s.call('/api/bootstrap','GET',undefined,cookie)).status,401);
 assert.equal((await s.login('Patryk')).cookie,undefined);assert.ok((await s.login('Maciek','new-fixture-password')).cookie);
 }finally{s.DB.close();}});
test('account migration preserves version-27 business rows and rejects old unidentified sessions',async()=>{const s=setup();s.DB.close();const DB=database({through:'0027'}),env={...s.env,DB,INDIVIDUAL_ACCOUNTS:'false'};try{
 DB.sqlite.exec("INSERT INTO catches(trip_id,angler_id,caught_at,weight_kg,species) VALUES('next-trip','maciek','2026-09-01T10:00:00Z',17,'Karp')");const before=DB.sqlite.prepare('SELECT * FROM catches').all();
 const request=new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})});const old=await worker.fetch(request,env),cookie=old.headers.get('set-cookie').split(';')[0];env.INDIVIDUAL_ACCOUNTS='true';assert.equal((await worker.fetch(new Request('https://dream.test/api/bootstrap',{headers:{cookie}}),env)).status,401);
 assert.deepEqual(DB.sqlite.prepare('SELECT * FROM catches').all(),before);assert.equal(DB.sqlite.prepare('SELECT angler_id FROM auth_accounts WHERE username=?').get('Maciek').angler_id,'maciek');
 }finally{DB.close();}});
