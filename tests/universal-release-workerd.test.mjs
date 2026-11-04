import test from 'node:test';import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFileSync,readdirSync} from 'node:fs';
import {createIsolatedReleaseEnvironment} from '../scripts/isolated-release-environment.mjs';
import {captureSnapshot,restoreSnapshot,verifySnapshot} from '../scripts/d1-snapshot.mjs';
test('workerd D1: restore schema31, apply actual migration32, preserve business rows and registry',async()=>{
 const logs=await mkdtemp(join(tmpdir(),'dreamteam-d1-test-'));
 process.env.WRANGLER_LOG_PATH=join(logs,'wrangler.log');process.env.WRANGLER_SEND_METRICS='false';
 const {unstable_splitSqlQuery}=await import('wrangler');
 const m=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response()}}',compatibilityDate:'2026-09-03',d1Databases:['SOURCE','RESTORED']}));
 try{
  const source=await m.getD1Database('SOURCE'),restored=await m.getD1Database('RESTORED');
  const apply=async(db,sql)=>db.batch(unstable_splitSqlQuery(sql).map(part=>db.prepare(part)));
  for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')&&f<'0032').sort())await apply(source,readFileSync('migrations/'+file,'utf8'));
  await apply(source,"CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE); INSERT OR REPLACE INTO app_settings(key,value) VALUES('schema_version','31'),('maintenance_mode','on');");
  const dbs={source,restored};
  const execute=async(id,sql,params=[])=>{
   if(/^SELECT|^PRAGMA/.test(sql))return dbs[id].prepare(sql).bind(...params).all();
   if(params.length)return dbs[id].prepare(sql).bind(...params).run();
   await apply(dbs[id],sql);return {results:[]};
  };
  const db={name:'dream-team-audit-123-db',uuid:'source'},target={name:'dream-team-audit-123-restored',uuid:'restored'};
  const snapshot=await captureSnapshot(db,execute);await restoreSnapshot(target,snapshot,execute);await verifySnapshot(target,snapshot,execute);
  await apply(restored,readFileSync('migrations/0032_lake_manager.sql','utf8')+"\nINSERT INTO d1_migrations(name) VALUES('0032_lake_manager.sql');");
  assert.equal((await restored.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first()).value,'32');
  assert.equal((await restored.prepare("SELECT value FROM app_settings WHERE key='maintenance_mode'").first()).value,'on');
  assert.equal((await restored.prepare('SELECT count(*) n FROM trips').first()).n,4);
  assert.deepEqual((await restored.prepare('PRAGMA foreign_key_check').all()).results,[]);
  assert.equal((await source.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first()).value,'31');
  // Exercise the one-slot reset against workerd D1, including guards/triggers/FKs.
  const ownedId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';dbs[ownedId]=source;
  let deleted=false;
  const lease=await createIsolatedReleaseEnvironment({runId:'123',request:async(path,method='GET',body)=>{
   if(path.includes('?'))return Array.from({length:9},(_,i)=>({name:'historical-'+i}));
   if(path==='/d1/database')return {name:'dream-team-audit-123-db',uuid:ownedId};
   if(path.endsWith('/query'))return [await execute(ownedId,body.sql,body.params)];
   if(method==='DELETE'){deleted=true;return {}};
   if(deleted)throw Object.assign(Error('CLOUDFLARE_ACCESS'),{status:404});
   return {name:'dream-team-audit-123-db',uuid:ownedId};
  }});
  const checkpoint=await captureSnapshot(lease.database,lease.execute);
  await lease.restore(checkpoint);
  await apply(source,readFileSync('migrations/0032_lake_manager.sql','utf8'));
  await lease.restore(checkpoint);
  await verifySnapshot(lease.database,checkpoint,lease.execute);
  assert.equal((await source.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first()).value,'31');
  assert.equal((await lease.cleanup()).result,'PASS');

 }finally{await m.dispose();await rm(logs,{recursive:true,force:true})}
});
