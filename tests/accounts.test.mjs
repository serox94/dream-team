import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../src/worker.js';import {database,initializeTestAccounts} from './db.mjs';
function setup(){const DB=database(),env={DB,INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'legacy',RYBY_LOGIN_PASSWORD:'fixture-only-shared-password',RYBY_SESSION_SECRET:'fixture-account-session-secret-over-32-characters',ASSETS:{fetch:()=>new Response('asset')}};
 const call=(path,method='GET',value,cookie,headers={})=>worker.fetch(new Request('https://dream.test'+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...headers},body:value===undefined?undefined:JSON.stringify(value)}),env);
 const login=async(username,password=env.RYBY_LOGIN_PASSWORD)=>{await initializeTestAccounts(env);const response=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})}),env);return {response,cookie:response.headers.get('set-cookie')?.split(';')[0]};};
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
 const {readFileSync}=await import('node:fs');const {migrateCopy}=await import('../scripts/migration-contract.mjs');migrateCopy(DB.sqlite);await initializeTestAccounts({...env,INDIVIDUAL_ACCOUNTS:'true'});env.INDIVIDUAL_ACCOUNTS='true';assert.equal((await worker.fetch(new Request('https://dream.test/api/bootstrap',{headers:{cookie:'old-unidentified-cookie'}}),env)).status,401);
 assert.deepEqual(DB.sqlite.prepare('SELECT * FROM catches').all(),before);assert.equal(DB.sqlite.prepare('SELECT angler_id FROM auth_accounts WHERE username=?').get('Maciek').angler_id,'maciek');
 }finally{DB.close();}});

test('manual edit to another account adds its trip participation without rewriting historical profiles',async()=>{const s=setup();try{
 const p=await s.login('Patryk'),created=await(await s.call('/api/anglers','POST',{name:'Third',username:'Third'},p.cookie)).json();
 const payload={tripId:'poland-2027',anglerId:'patryk',weightKg:8,caughtAt:'2026-09-01T10:00:00Z'};const row=await(await s.call('/api/catches','POST',payload,p.cookie)).json();
 assert.equal((await s.call(`/api/catches/${row.id}?tripId=poland-2027`,'PUT',{anglerId:created.id},p.cookie)).status,200);
 assert.equal(s.DB.sqlite.prepare('SELECT angler_id FROM trip_participants WHERE trip_id=? AND angler_id=?').get('poland-2027',created.id).angler_id,created.id);
 }finally{s.DB.close();}});

test('profile visibility is separate; account deactivation revokes sessions and reactivation cannot resurrect them',async()=>{const s=setup();try{
 const p=await s.login('Patryk'),m=await s.login('Maciek');const before=s.DB.sqlite.prepare('SELECT * FROM anglers WHERE id=?').get('patryk');
 assert.equal((await s.call('/api/anglers/patryk','PATCH',{active:false},m.cookie)).status,200);assert.ok((await s.login('Patryk')).cookie);
 assert.equal((await s.call('/api/accounts/account-patryk','PATCH',{active:false},m.cookie)).status,200);assert.equal((await s.call('/api/bootstrap','GET',undefined,p.cookie)).status,401);assert.equal((await s.login('Patryk')).cookie,undefined);assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM auth_sessions WHERE account_id=?').get('account-patryk').n,0);
 assert.equal((await s.call('/api/accounts/account-patryk','PATCH',{active:true},m.cookie)).status,200);assert.equal((await s.call('/api/bootstrap','GET',undefined,p.cookie)).status,401);assert.ok((await s.login('Patryk')).cookie);const after=s.DB.sqlite.prepare('SELECT * FROM anglers WHERE id=?').get('patryk');for(const k of ['id','pb_kg','baseline_pb_kg'])assert.equal(after[k],before[k]);
}finally{s.DB.close();}});
test('password rotation physically removes sessions, including for a legacy rollback reader',async()=>{const s=setup();try{
 const p=await s.login('Patryk'),m=await s.login('Maciek');assert.ok(s.DB.sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n>=2);
 assert.equal((await s.call('/api/account/password','POST',{currentPassword:s.env.RYBY_LOGIN_PASSWORD,newPassword:'new-fixture-only-password'},p.cookie)).status,200);assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM auth_sessions').get().n,0);
 const {session}=await import('../src/auth.js');assert.equal(await session(new Request('https://dream.test/',{headers:{cookie:m.cookie}}),{...s.env,INDIVIDUAL_ACCOUNTS:'false'}),null);
 const credential=s.DB.sqlite.prepare('SELECT * FROM auth_credential').get();await initializeTestAccounts(s.env);assert.deepEqual(s.DB.sqlite.prepare('SELECT * FROM auth_credential').get(),credential,'explicit repeated initialization never overwrites changed password');
}finally{s.DB.close();}});

test('deactivation or password rotation between verification and session insert cannot mint a reusable cookie',async()=>{for(const change of ['deactivate','rotate']){const s=setup();try{await s.login('Patryk');const original=s.DB.prepare;let injected=false;s.DB.prepare=sql=>{const statement=original(sql);if(sql==='DELETE FROM auth_login_limits WHERE id_hash=?'){const bind=statement.bind;statement.bind=(...args)=>{const bound=bind.apply(statement,args),run=bound.run;bound.run=async()=>{const result=await run.call(bound);if(!injected){injected=true;s.DB.sqlite.exec(change==='deactivate'?"UPDATE auth_accounts SET active=0 WHERE id='account-patryk'; DELETE FROM auth_sessions WHERE account_id='account-patryk'":"UPDATE auth_credential SET version=version+1; DELETE FROM auth_sessions");}return result;};return bound;};}return statement;};const denied=await s.login('Patryk');assert.equal(denied.cookie,undefined);assert.equal(denied.response.headers.get('location'),'/login?error=credentials');assert.equal(s.DB.sqlite.prepare("SELECT COUNT(*) n FROM auth_sessions WHERE account_id='account-patryk'").get().n,0);}finally{s.DB.close();}}});
