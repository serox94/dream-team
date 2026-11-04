// All control-plane and HTTP transports are injected. Never contacts production.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {DatabaseSync} from 'node:sqlite';
import {productionCloudflareAdapter} from '../scripts/cloudflare-isolated-adapter.mjs';import {release} from '../scripts/universal-release.mjs';
import {database as seed} from './db.mjs';import {productionId,sha} from '../scripts/recovery-common.mjs';
const ids=['a','b','c','d','e','f'].map(c=>`${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`);
const [sourceVersion,target,fallbackVersion,probeTarget,probeFallback,restoredId]=ids;
const candidate='a'.repeat(40),operator='b'.repeat(40),sourceBuild='c'.repeat(40),fallbackBuild='d'.repeat(40);
const plan={candidate,operator,approval:`RELEASE:${candidate}:${operator}`,sourceSchema:31,targetSchema:32,targetVersion:target};
const account='9'.repeat(32),runId='123',probe='dream-team-audit-1239-recovery-probe';
async function fixture(t,{fail=false,destructive=false,legacy=false,staleMain=false}={}){
 const old=process.env.CLOUDFLARE_ACCOUNT_ID;process.env.CLOUDFLARE_ACCOUNT_ID=account;t.after(()=>{if(old===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=old});
 const db=seed({through:'0031'}),restored=new DatabaseSync(':memory:');t.after(()=>{db.close();restored.close()});
 db.sqlite.exec("INSERT OR REPLACE INTO app_settings(key,value) VALUES('schema_version','31'),('maintenance_mode','off')");
 const dbs={[productionId]:db.sqlite,[restoredId]:restored},active={'dream-team':sourceVersion,[probe]:probeFallback};const calls=[];
 const versions={[sourceVersion]:[productionId,sourceBuild,31],[target]:[productionId,candidate,32],[fallbackVersion]:[productionId,fallbackBuild,32],[probeTarget]:[restoredId,candidate,32],[probeFallback]:[restoredId,fallbackBuild,32]};
 const execute=async(id,sql,params=[])=>{calls.push({id,sql});if(/^SELECT|^PRAGMA/.test(sql))return {results:dbs[id].prepare(sql).all(...params)};if(params.length)dbs[id].prepare(sql).run(...params);else dbs[id].exec(sql);return {results:[]}};
 const request=async(path,method='GET',body)=>{
  if(path==='/workers/scripts')return [{id:'dream-team',tag:'fixture'}];
  if(path.startsWith('/builds/builds'))return {builds:[]};if(path.endsWith('/triggers')||path.endsWith('/deploy_hooks'))return [];
  if(path==='/d1/database/'+productionId)return {uuid:productionId,name:'dream-team-db'};
  if(path==='/d1/database/'+restoredId)return {uuid:restoredId,name:'dream-team-audit-123-db'};
  if(path.includes('/settings'))return {bindings:[{name:'SOURCE',type:'r2_bucket',bucket_name:'dream-team-media'},{name:'ARCHIVE',type:'r2_bucket',bucket_name:'dream-team-audit-123-archive'},{name:'RESTORED',type:'r2_bucket',bucket_name:'dream-team-audit-123-restored'}]};
  const [,name,op,id]=path.match(/^\/workers\/scripts\/([^/]+)\/(deployments|versions)(?:\/([^/]+))?$/)||[];assert.ok(name,'unexpected API request');
  if(op==='deployments'){if(method==='POST')active[name]=body.versions[0].version_id;return {deployments:[{versions:[{version_id:active[name],percentage:100}]}]}}
  const [database,build,schema]=versions[id],audit=database===restoredId;
  return {id,resources:{bindings:[{name:'DB',type:'d1',id:database},{name:'APP_BUILD',type:'plain_text',text:build},{name:'APP_SCHEMA',type:'plain_text',text:String(schema)},{name:'APP_ENV',type:'plain_text',text:audit?'preview':'production'},{name:'INDIVIDUAL_ACCOUNTS',type:'plain_text',text:'true'},{name:'MEDIA',type:'r2_bucket',bucket_name:audit?'dream-team-audit-123-restored':'dream-team-media'},{name:'BACKUP_STATUS',type:'r2_bucket',bucket_name:audit?'dream-team-audit-123-archive':'dream-team-d1-backups'},{name:'ASSETS',type:'assets'},{name:'AI',type:'ai'},{name:'RYBY_SESSION_SECRET',type:'secret_text'}].filter(b=>!(legacy&&id===sourceVersion&&b.name==='APP_SCHEMA'))}};
 };
 const fetcher=async(url,opts)=>{
  const u=new URL(url);
  if(u.pathname==='/backup')return Response.json({ok:true,manifestSha256:'a'.repeat(64)});
  if(u.pathname==='/restore')return Response.json({ok:true,verified:true});
  const name=u.hostname.split('.')[0],[id,build,schema]=versions[active[name]],settings=Object.fromEntries(dbs[id].prepare('SELECT key,value FROM app_settings').all().map(r=>[r.key,r.value]));
  const status=settings.maintenance_mode==='on'||Number(settings.schema_version)!==schema?503:u.pathname==='/api/bootstrap'?401:200;
  return new Response('',{status,headers:{'x-dreamteam-build':build}});
 };
 const migrationSql=readFileSync('migrations/0032_lake_manager.sql','utf8')+(destructive?"\nUPDATE anglers SET name='tampered';":'');
 const options={enabled:true,expectedAccountId:account,plan,sourceVersion,sourceBuild,fallbackVersion,fallbackBuild,productionApproval:`PRODUCTION:${candidate}:${operator}:${sourceVersion}:${target}:${productionId}:31:32:${sha(Buffer.from(migrationSql))}`,currentRunId:'456',evidenceRunId:'789',
 recovery:{runId,workerRunId:'1239',worker:probe,baseUrl:`https://${probe}.sewerynski00.workers.dev`,candidateVersion:probeTarget,fallbackVersion:probeFallback,lease:{database:{uuid:restoredId,name:'dream-team-audit-123-db'},assertOwned:async()=>{}}},
 media:{source:'dream-team-media',archive:'dream-team-audit-123-archive',restored:'dream-team-audit-123-restored',url:'https://dream-team-audit-123-io.sewerynski00.workers.dev',key:'fixture'},migration:{name:'0032_lake_manager.sql',sql:migrationSql},
 execute,request,fetcher,wait:async()=>{},checkpointWriter:async({key,digest})=>({key,sha256:digest,storage:'PRIVATE_R2'}),githubRequest:async path=>path==='/git/ref/heads/main'?{object:{sha:staleMain?'0'.repeat(40):operator}}:path==='/actions/runs/456'?{head_sha:operator,head_branch:'main',event:'workflow_dispatch',head_repository:{full_name:'serox94/dream-team'}}:path.startsWith('/contents/src/ensure-schema.js')?{encoding:'base64',content:Buffer.from('export const requiredSchema=31; const migrations='+JSON.stringify(db.sqlite.prepare('SELECT name FROM d1_migrations').all().map(r=>r.name))+';').toString('base64')}:path.startsWith('/contents/')?{encoding:'base64',content:Buffer.from(migrationSql).toString('base64')}:path==='/actions/runs/789'?{conclusion:'success',status:'completed',head_sha:operator,path:'.github/workflows/isolated-release-drill.yml',head_repository:{full_name:'serox94/dream-team'}}:{workflow_runs:path.includes('head_sha')?[{path:'.github/workflows/validate.yml',conclusion:'success',status:'completed',head_sha:candidate}]:[]}};
 const adapter=await productionCloudflareAdapter(options);if(fail)adapter.verify=async()=>{throw Error('INJECTED_FAILURE')};return {adapter,db,restored,calls,active,options};
}
test('production capability is disabled before any provider access by default',async()=>{let called=false;await assert.rejects(productionCloudflareAdapter({request:()=>{called=true}}),/PRODUCTION_CAPABILITY_DISABLED/);assert.equal(called,false)});
test('future production adapter executes the existing controller through injected transports',async t=>{const f=await fixture(t);const r=await release(plan,f.adapter);assert.equal(r.result,'PASS',JSON.stringify(r));assert.equal(f.active['dream-team'],target);assert.equal((await f.adapter.current()).maintenance,false);assert.ok(!f.calls.some(c=>c.id===productionId&&/(^|;)\s*(DROP|DELETE)\b/i.test(c.sql)));assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM trips').get().n,4)});
test('future production failure recovers only a compatible fallback and reopens after verification',async t=>{const f=await fixture(t,{fail:true});const r=await release(plan,f.adapter);assert.equal(r.recovery,'PASS',JSON.stringify(r));assert.equal(f.active['dream-team'],fallbackVersion);assert.equal((await f.adapter.current()).maintenance,false)});
test('a different plan and arbitrary production version cannot reuse approval',async t=>{const f=await fixture(t);const r=await release({...plan,targetSchema:33},f.adapter);assert.equal(r.error,'PRODUCTION_PLAN_CHANGED');assert.equal(f.calls.filter(c=>!/^SELECT|^PRAGMA/.test(c.sql)).length,0);await assert.rejects(f.adapter.activate('00000000-0000-0000-0000-000000000000'),/PRODUCTION_PREFLIGHT_REQUIRED/)});

test('historical source without APP_SCHEMA is checked against immutable Git schema and D1 registry',async t=>{const f=await fixture(t,{legacy:true});assert.equal((await release(plan,f.adapter)).result,'PASS')});
test('changed main blocks before production mutation',async t=>{const f=await fixture(t,{staleMain:true});const r=await release(plan,f.adapter);assert.equal(r.error,'OPERATOR_CONTEXT_MISMATCH');assert.equal(f.calls.filter(c=>!/^SELECT|^PRAGMA/.test(c.sql)).length,0)});
test('migration that changes existing business data is rejected in isolation before source migration',async t=>{const f=await fixture(t,{destructive:true});const original=f.db.sqlite.prepare('SELECT * FROM anglers').all();const r=await release(plan,f.adapter);assert.equal(r.error,'MIGRATION_CHANGED_EXISTING_ROWS',JSON.stringify(r));assert.equal((await f.adapter.current()).schema,31);assert.equal(f.active['dream-team'],sourceVersion);assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM anglers').all(),original)});

test('direct production mutation methods cannot bypass preflight evidence',async t=>{const f=await fixture(t);await assert.rejects(f.adapter.quiesce(),/PRODUCTION_PREFLIGHT_REQUIRED/);await assert.rejects(f.adapter.unquiesce(),/PRODUCTION_PREFLIGHT_REQUIRED/);assert.equal(f.calls.filter(c=>!/^SELECT|^PRAGMA/.test(c.sql)).length,0)});
