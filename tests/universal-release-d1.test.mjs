// SQLite integration of the actual adapter and repository migrations. Cloudflare REST
// and version traffic are simulated here; the opt-in Actions drill uses actual D1.
import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';
import {database as seed} from './db.mjs';
import {cloudflareReleaseAdapter} from '../scripts/cloudflare-isolated-adapter.mjs';
import {createIsolatedReleaseEnvironment} from '../scripts/isolated-release-environment.mjs';
import {release} from '../scripts/universal-release.mjs';
const ids=['a','b','c','d','e','f','0'].map(c=>`${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`);
const [source,target,fallback,probeTarget,probeFallback,dbId,restoreId]=ids;
const candidate='a'.repeat(40),operator='b'.repeat(40),sourceBuild='c'.repeat(40),fallbackBuild='d'.repeat(40);
const worker='dream-team-audit-123-recovery-probe',probe='dream-team-audit-1239-recovery-probe';
const plan={candidate,operator,approval:`RELEASE:${candidate}:${operator}`,sourceSchema:31,targetSchema:32,targetVersion:target};
async function fixture(t,{badBindings=false,codeOnly=false,shared=false}={}){
 const original=seed({through:codeOnly?'0032':'0031'}),restored=new DatabaseSync(':memory:');t.after(()=>{original.close();restored.close()});
 original.sqlite.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES('schema_version',?)").run(codeOnly?'32':'31');original.sqlite.exec("INSERT OR REPLACE INTO app_settings(key,value) VALUES('maintenance_mode','off')");
 const dbs={[dbId]:original.sqlite,[restoreId]:restored};
 const versions={[source]:[dbId,sourceBuild,codeOnly?32:31],[target]:[dbId,candidate,32],[fallback]:[dbId,fallbackBuild,32],[probeTarget]:[shared?dbId:restoreId,candidate,32],[probeFallback]:[shared?dbId:restoreId,fallbackBuild,32]};
 const active={[worker]:source,[probe]:probeFallback};let writes=0;
 const execute=async(id,sql,params=[])=>{
  if(/^SELECT|^PRAGMA/.test(sql))return {results:dbs[id].prepare(sql).all(...params)};
  writes++;if(params.length)dbs[id].prepare(sql).run(...params);else dbs[id].exec(sql);return {results:[]};
 };
 const request=async(path,method='GET',body)=>{
  if(path.startsWith('/d1/database?'))return [];
  if(path==='/d1/database')return {uuid:dbId,name:'dream-team-audit-123-db'};
  if(path.endsWith('/query'))return [await execute(path.split('/')[3],body.sql,body.params)];
  if(path.startsWith('/d1/database/')){const uuid=path.split('/').pop();return {uuid,name:`dream-team-audit-123-${uuid===dbId?'db':'restored'}`}}
  const [,name,op,id]=path.match(/^\/workers\/scripts\/([^/]+)\/(deployments|versions)(?:\/([^/]+))?$/)||[];
  assert.ok(name,'unexpected API path');
  if(op==='deployments'){if(method==='POST')active[name]=body.versions[0].version_id;return {deployments:[{versions:[{version_id:active[name],percentage:100}]}]}}
  const [database,build,schema]=versions[id];
  return {id,resources:{bindings:[{type:'d1',name:'DB',id:badBindings&&id===target?restoreId:database},{type:'plain_text',name:'APP_BUILD',text:build},{type:'plain_text',name:'APP_SCHEMA',text:String(schema)}]}};
 };
 const fetcher=async url=>{
  const u=new URL(url),name=u.hostname.split('.')[0],[id,build,schema]=versions[active[name]];
  const settings=Object.fromEntries(dbs[id].prepare('SELECT key,value FROM app_settings').all().map(r=>[r.key,r.value]));
  const blocked=u.pathname==='/api/bootstrap'&&settings.maintenance_mode==='on';
  return new Response('',{status:blocked||Number(settings.schema_version)!==schema?503:200,headers:{'x-build':build}});
 };
 const sandboxLease=shared?await createIsolatedReleaseEnvironment({runId:'123',request}):undefined;
 const adapter=await cloudflareReleaseAdapter({worker,runId:'123',baseUrl:`https://${worker}.example.workers.dev`,database:{uuid:dbId,name:'dream-team-audit-123-db'},restored:shared?sandboxLease.database:{uuid:restoreId,name:'dream-team-audit-123-restored'},candidateVersion:target,fallbackVersion:fallback,sourceBuild,fallbackBuild,migration:{name:'0032_lake_manager.sql',sql:readFileSync(new URL('../migrations/0032_lake_manager.sql',import.meta.url),'utf8')},rehearsal:{worker:probe,runId:'1239',baseUrl:`https://${probe}.example.workers.dev`,candidateVersion:probeTarget,fallbackVersion:probeFallback},execute,request,fetcher,sandboxLease,wait:async()=>{}});
 return {adapter,original,restored,active,get writes(){return writes}};
}
for(const failure of ['none','activation','migration','verify'])test(`real schema31 snapshot, restore, migration32 and recovery: ${failure}`,async t=>{
 const f=await fixture(t);const before=f.original.sqlite.prepare('SELECT * FROM catches').all();
 if(failure==='activation'){const call=f.adapter.activate;f.adapter.activate=async id=>{await call(id);if(id===target)throw Error('ACTIVATION_TIMEOUT')}}
 if(failure==='migration'){const call=f.adapter.migrate;f.adapter.migrate=async(...args)=>{await call(...args);throw Error('MIGRATION_TIMEOUT')}}
 if(failure==='verify')f.adapter.verify=async()=>{throw Error('READINESS_FAILED')};
 const report=await release(plan,f.adapter);
 assert.equal(report.result,failure==='none'?'PASS':'BLOCKED');
 if(failure!=='none')assert.equal(report.recovery,'PASS');
 assert.equal(f.active[worker],failure==='none'?target:fallback);
 assert.equal((await f.adapter.current()).maintenance,false);
 assert.equal((await f.adapter.current()).schema,32);
 assert.deepEqual(f.original.sqlite.prepare('SELECT * FROM catches').all(),before);
 assert.equal(f.restored.prepare('SELECT count(*) n FROM trips').get().n,4);
 assert.equal(f.original.sqlite.prepare("SELECT count(*) n FROM d1_migrations WHERE name='0032_lake_manager.sql'").get().n,1);
 assert.deepEqual(f.original.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
});
test('wrong candidate database binding is rejected before any write',async t=>{const f=await fixture(t,{badBindings:true});const r=await release(plan,f.adapter);assert.equal(r.error,'VERSION_DATABASE_MISMATCH');assert.equal(f.writes,0)});
test('partial migration retains the write barrier and rejects source recovery',async t=>{
 const f=await fixture(t);f.adapter.migrate=async()=>{f.original.sqlite.exec('CREATE TABLE partial_migration(id TEXT)');throw Error('MIGRATION_TIMEOUT')};
 const r=await release(plan,f.adapter);assert.equal(r.recovery,'BLOCKED');assert.equal(r.barrier,'RETAINED');assert.equal((await f.adapter.current()).maintenance,true);
});

test('code-only release restores a consistent checkpoint without applying migration again',async t=>{
 const f=await fixture(t,{codeOnly:true});f.adapter.migrate=async()=>{throw Error('MUST_NOT_MIGRATE')};
 const r=await release({...plan,sourceSchema:32},f.adapter);assert.equal(r.result,'PASS');assert.equal((await f.adapter.current()).maintenance,false);
 assert.equal(f.original.sqlite.prepare("SELECT count(*) n FROM d1_migrations WHERE name='0032_lake_manager.sql'").get().n,1);
});
test('migration failure before any schema mutation recovers original version',async t=>{
 const f=await fixture(t);f.adapter.migrate=async()=>{throw Error('MIGRATION_TIMEOUT')};
 const r=await release(plan,f.adapter);assert.equal(r.recovery,'PASS');assert.equal(f.active[worker],source);assert.equal((await f.adapter.current()).schema,31);assert.equal((await f.adapter.current()).maintenance,false);
});

test('single owned D1 is restored, rehearsed, reset and released without a second database',async t=>{
 const f=await fixture(t,{shared:true});const r=await release(plan,f.adapter);assert.equal(r.result,'PASS',JSON.stringify(r));
 assert.equal((await f.adapter.current()).schema,32);assert.equal((await f.adapter.current()).maintenance,false);
 assert.equal(f.original.sqlite.prepare('SELECT count(*) n FROM trips').get().n,4);
});
