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

test('HTTP and cron never migrate schema 20, partial 27 or unsupported 29',async()=>{
 const {database}=await import('./db.mjs');const {default:worker}=await import('../src/worker.js');
 for(const version of [20,27,29]){
  const DB=database({through:version===29?'0028':String(version).padStart(4,'0')});if(version===29)DB.sqlite.exec("UPDATE app_settings SET value='29' WHERE key='schema_version'");
  const before=DB.sqlite.prepare("SELECT name,type,sql FROM sqlite_master ORDER BY name").all(),rows=DB.sqlite.prepare('SELECT * FROM anglers').all();const env={DB,ASSETS:{fetch:()=>new Response('asset')},RYBY_LOGIN_USERNAME:'fixture',RYBY_LOGIN_PASSWORD:'fixture-password',RYBY_SESSION_SECRET:'fixture-session-secret-over-32-characters'};
  try{for(const path of ['/login','/api/bootstrap']){const response=await worker.fetch(new Request('https://dream.test'+path),env);assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'60');}
   let ran=false;await worker.scheduled({},env,{waitUntil(){ran=true;}});assert.equal(ran,false);assert.deepEqual(DB.sqlite.prepare("SELECT name,type,sql FROM sqlite_master ORDER BY name").all(),before);assert.deepEqual(DB.sqlite.prepare('SELECT * FROM anglers').all(),rows);assert.equal(DB.sqlite.prepare("SELECT value FROM app_settings WHERE key='schema_version'").get().value,String(version));
  }finally{DB.close();}
 }
});
