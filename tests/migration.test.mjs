import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
test('upgrade preserves pre-existing catches, checklist state, spots, documents and Supabase marker',()=>{
 const db=new DatabaseSync(':memory:');
 const dir=new URL('../migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(f=>f.endsWith('.sql')&&f.slice(0,4)<'0017').sort())db.exec(readFileSync(new URL(file,dir),'utf8'));
 db.exec("INSERT INTO spots(trip_id,name,depth_m) VALUES('next-trip','Saved spot',4); INSERT INTO catches(trip_id,angler_id,caught_at,weight_kg,species,spot_id) VALUES('next-trip','maciek','2026-09-03T11:00:00Z',18,'Karp',1); INSERT INTO checklist_items(trip_id,category,label,packed,quantity) VALUES('next-trip','sprzęt','Saved item',1,'2 szt.'); INSERT OR REPLACE INTO app_settings(key,value) VALUES('supabase_import_v2','{\"done\":true}'); UPDATE anglers SET pb_kg=18 WHERE id='maciek';");
 const tables=['catches','spots','checklist_items','trip_documents','trips','anglers'];
 const before=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]));
 db.exec(readFileSync(new URL('0017_trip_management_and_recovery.sql',dir),'utf8'));
 for(const table of tables){const after=db.prepare(`SELECT * FROM ${table}`).all();assert.equal(after.length,before[table].length,table);for(let i=0;i<after.length;i++)for(const [key,value] of Object.entries(before[table][i]))assert.equal(after[i][key],value,table+'.'+key);}
 assert.equal(db.prepare("SELECT value FROM app_settings WHERE key='supabase_import_v2'").get().value,'{"done":true}');
 assert.equal(db.prepare('SELECT count(*) n FROM trip_participants').get().n,8);db.close();
});

test('Worker upgrades a real version-16 database on first API request, once, retaining legacy rows',async()=>{
 const {database}=await import('./db.mjs');const {default:worker}=await import('../src/worker.js');
 const DB=database({through:'0016'});
 DB.sqlite.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO catches(trip_id,angler_id,caught_at,weight_kg,species) VALUES('next-trip','maciek','2026-09-03T10:00:00Z',18,'Karp'); INSERT INTO checklist_items(trip_id,category,label,packed) VALUES('next-trip','sprzęt','Historyczny wpis',1);");
 const env={DB,ASSETS:{fetch:()=>new Response('asset')},RYBY_LOGIN_USERNAME:'migration-user',RYBY_LOGIN_PASSWORD:'migration-fixture-password',RYBY_SESSION_SECRET:'migration-session-secret-for-tests-only-32'};
 const signed=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})}),env);
 assert.equal(signed.status,303);const cookie=signed.headers.get('set-cookie').split(';')[0];
 const call=async()=>{const response=await worker.fetch(new Request('https://dream.test/api/bootstrap',{headers:{cookie}}),env);assert.equal(response.status,200);return response.json();};
 const before={fish:DB.sqlite.prepare('SELECT count(*) n FROM catches').get().n,packed:DB.sqlite.prepare('SELECT sum(packed) n FROM checklist_items').get().n};
 const model=await call();assert.equal(model.app.version,'1.2.0');assert.equal(model.anglers.find(a=>a.id==='maciek').pbKg,18);
 assert.deepEqual({fish:DB.sqlite.prepare('SELECT count(*) n FROM catches').get().n,packed:DB.sqlite.prepare('SELECT sum(packed) n FROM checklist_items').get().n},before);
 assert.equal(DB.sqlite.prepare("SELECT value FROM app_settings WHERE key='schema_version'").get().value,'26');
 assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM d1_migrations WHERE name=?').get('0017_trip_management_and_recovery.sql').n,1);
 assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM d1_migrations WHERE name=?').get('0018_private_sessions.sql').n,1);
 assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM trip_participants').get().n,8);
 await call();assert.equal(DB.sqlite.prepare('SELECT count(*) n FROM trip_participants').get().n,8);DB.close();
});
