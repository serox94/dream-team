// Explicitly dispatched disposable D1/Worker drill; no production resources are accepted.
import {mkdtemp,writeFile,rm,mkdir,readFile,readdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,wrangler,configFile,query} from './recovery-common.mjs';
import {captureSnapshot} from './d1-snapshot.mjs';
import {createIsolatedReleaseEnvironment,safeProviderFailure} from './isolated-release-environment.mjs';
import {isolatedCloudflareAdapter,cloudflareReleaseAdapter} from './cloudflare-isolated-adapter.mjs';
import {release} from './universal-release.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
const scenarios=['success','activation-timeout','migration-timeout','readiness-failure'];
const runId=process.env.GITHUB_RUN_ID+'0'+process.env.GITHUB_RUN_ATTEMPT,rehearsalId=runId+'9';
const worker=`dream-team-audit-${runId}-recovery-probe`,probe=`dream-team-audit-${rehearsalId}-recovery-probe`;
const report={result:'FAIL',stage:'PRECHECK',scenarios:[]};let dir,lease;const created=[];
const saveOwnership=async()=>{
 await mkdir('isolated-adapter-status',{recursive:true});
 await writeFile('isolated-adapter-status/ownership.tmp',JSON.stringify({version:1,runId,database:lease.database,workers:created.map(r=>r.path.split('/').pop())}),{mode:0o600});
 await rename('isolated-adapter-status/ownership.tmp','isolated-adapter-status/ownership.json');
};
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&/^[0-9]+$/.test(process.env.GITHUB_RUN_ATTEMPT||'')&&/^\d+$/.test(process.env.GITHUB_RUN_ID||''),'CONTEXT');
 check(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA||''),'INVALID_SHA');
 dir=await mkdtemp(join(tmpdir(),'adapter-drill-'));
 report.stage='ACCOUNT_READ';
 const subdomain=(await cf('/workers/subdomain')).subdomain;check(/^[a-z0-9-]+$/.test(subdomain||''),'INVALID_SUBDOMAIN');
 for(const name of [worker,probe])check(!(await cf('/workers/scripts')).some(x=>x.id===name),'WORKER_EXISTS');
 report.stage='ALLOCATE_SINGLE_D1';
 lease=await createIsolatedReleaseEnvironment({runId});
 await saveOwnership();
 const database=lease.database,restored=database;
 report.d1={databasesBefore:lease.databasesBefore,allocated:1};
 const entry=join(dir,'worker.mjs');
 await writeFile(entry,`export default {async fetch(req,env){
 const rows=(await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')").all()).results;
 const s=Object.fromEntries(rows.map(r=>[r.key,r.value]));
 if(new URL(req.url).pathname==='/api/bootstrap'&&s.maintenance_mode==='on')return new Response('maintenance',{status:503});
 if(s.schema_version!==env.APP_SCHEMA)return new Response('schema mismatch',{status:503});
 const trips=await env.DB.prepare('SELECT count(*) n FROM trips').first();
 return Response.json({schema:s.schema_version,trips:trips.n},{headers:{'x-build':env.APP_BUILD}});
 }};`);
 const initial=join(dir,'initial.sql');
 const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')&&f<'0032').sort();
 let seed=(await Promise.all(files.map(f=>readFile('migrations/'+f,'utf8')))).join('\n');
 seed+="\nCREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE);\n"+files.map(f=>`INSERT INTO d1_migrations(name) VALUES('${f}');`).join('\n');
 seed+="\nINSERT OR REPLACE INTO app_settings(key,value) VALUES('schema_version','31'),('maintenance_mode','off');";
 await writeFile(initial,seed);
 const baseConfig={main:entry,compatibility_date:'2026-09-03',workers_dev:true};
 const cfgFor=async(name,db,build,schema)=>configFile(dir,{...baseConfig,name,vars:{APP_BUILD:build,APP_SCHEMA:String(schema)},d1_databases:[{binding:'DB',database_name:db.name,database_id:db.uuid}]},name+'.jsonc');
 const sourceBuild='1'.repeat(40),fallbackBuild='2'.repeat(40),candidate=process.env.GITHUB_SHA;
 const initialConfig=await cfgFor(worker,database,sourceBuild,31);
 report.stage='SEED_SYNTHETIC_DATA';
 wrangler(['d1','execute',database.name,'--remote','--config',initialConfig,'--file',initial]);
 const upload=async(name,db,build,schema,first=false)=>{
  const cfg=await cfgFor(name,db,build,schema);
  if(first){created.push({path:'/workers/scripts/'+name});await saveOwnership()}
  wrangler(first?['deploy','--config',cfg]:['versions','upload','--config',cfg]);
  const versions=(await cf('/workers/scripts/'+name+'/versions?per_page=5')).items;
  check(versions?.[0]?.id,'VERSION_MISSING');return versions[0].id;
 };
 report.stage='UPLOAD_DISPOSABLE_WORKERS';
 const sourceVersion=await upload(worker,database,sourceBuild,31,true);
 const candidateVersion=await upload(worker,database,candidate,32),fallbackVersion=await upload(worker,database,fallbackBuild,32);
 const rehearsalFallback=await upload(probe,restored,fallbackBuild,32,true),rehearsalCandidate=await upload(probe,restored,candidate,32);
 const baseUrl=`https://${worker}.${subdomain}.workers.dev`,probeUrl=`https://${probe}.${subdomain}.workers.dev`;
 // Explicit HTTP activation is required for version upload / workers.dev routing.
 await cf('/workers/scripts/'+worker+'/subdomain','POST',{enabled:true});
 await cf('/workers/scripts/'+probe+'/subdomain','POST',{enabled:true});
 const migration={name:'0032_lake_manager.sql',sql:await readFile('migrations/0032_lake_manager.sql','utf8')};
 const sourceControl=isolatedCloudflareAdapter({worker,runId,baseUrl});
 const seedSnapshot=await captureSnapshot(database,lease.execute);
 for(const scenario of scenarios){
  await sourceControl.activate(sourceVersion);
  await lease.restore(seedSnapshot);
 const adapter=await cloudflareReleaseAdapter({worker,runId,baseUrl,database,restored,candidateVersion,fallbackVersion,sourceBuild,fallbackBuild,migration,sandboxLease:lease,execute:lease.execute,
 rehearsal:{worker:probe,runId:rehearsalId,baseUrl:probeUrl,candidateVersion:rehearsalCandidate,fallbackVersion:rehearsalFallback}});
 const before=await adapter.current();const rowsBefore=(await query(database.uuid,'SELECT count(*) n FROM trips')).results[0].n;
 // Inject errors only AFTER the real operation, exercising ambiguous provider responses.
 if(scenario==='activation-timeout'){const original=adapter.activate;adapter.activate=async id=>{await original(id);if(id===candidateVersion)throw Error('ACTIVATION_TIMEOUT')}}
 if(scenario==='migration-timeout'){const original=adapter.migrate;adapter.migrate=async(...args)=>{await original(...args);throw Error('MIGRATION_TIMEOUT')}}
 if(scenario==='readiness-failure'){const original=adapter.verify;adapter.verify=async plan=>{await original(plan);throw Error('INJECTED_READINESS_FAILURE')}}
 report.stage='RELEASE_'+scenario.toUpperCase().replaceAll('-','_');
 const outcome=await release({candidate,operator:candidate,approval:`RELEASE:${candidate}:${candidate}`,sourceSchema:31,targetSchema:32,targetVersion:candidateVersion},adapter);
 report.scenarios.push({scenario,release:outcome});
 const after=await adapter.current();
 check(after.schema===32&&!after.maintenance,'FINAL_SCHEMA_OR_BARRIER');
 check(after.activeVersion===(scenario==='success'?candidateVersion:fallbackVersion),'FINAL_WORKER');
 check((await query(database.uuid,'SELECT count(*) n FROM trips')).results[0].n===rowsBefore,'DATA_LOSS');
 check((await query(database.uuid,'PRAGMA foreign_key_check')).results.length===0,'FOREIGN_KEYS');
 check(scenario==='success'?outcome.result==='PASS':outcome.result==='BLOCKED'&&outcome.recovery==='PASS','UNEXPECTED_RELEASE_RESULT');
 }
 report.result='PASS';report.stage='COMPLETE';
}catch(e){Object.assign(report,safeProviderFailure(e));process.exitCode=1}
finally{
 // Cleanup runs after failures too; ownership is established by this run's create receipt.
 report.cleanup=[];
 for(const resource of created.reverse())try{await cf(resource.path,'DELETE');report.cleanup.push({kind:'WORKER',result:'PASS'})}catch(e){report.cleanup.push({kind:'WORKER',...safeProviderFailure(e)});process.exitCode=1;report.result='FAIL'}
 if(lease)try{report.cleanup.push({kind:'D1',...await lease.cleanup()})}catch(e){report.cleanup.push({kind:'D1',...safeProviderFailure(e)});process.exitCode=1;report.result='FAIL'}
 if(dir)await rm(dir,{recursive:true,force:true});await mkdir('isolated-adapter-status',{recursive:true});
 await writeFile('isolated-adapter-status/summary.json',JSON.stringify(report,null,2));console.log('ISOLATED_ADAPTER '+JSON.stringify(report));
 const diagnostic={stage:report.stage,...(report.error?{error:report.error}:{}),...(report.httpStatus?{httpStatus:report.httpStatus}:{}),...(report.cloudflareCode?{cloudflareCode:report.cloudflareCode}:{}),...(report.operation?{operation:report.operation}:{}),scenarios:report.scenarios.map(({scenario,release})=>({scenario,result:release.result,error:release.error,stage:release.failedStage,httpStatus:release.httpStatus,cloudflareCode:release.cloudflareCode,recovery:release.recovery,recoveryError:release.recoveryError}))};
 console.log(`::${report.result==='PASS'?'notice':'error'} title=Isolated release diagnostic::${JSON.stringify(diagnostic)}`);
}
