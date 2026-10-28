// Isolated restore rehearsal; never modifies production or existing R2 objects.
import {readFile,writeFile,mkdir,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cf,query,wrangler,sha,productionId,assertSandbox} from './recovery-common.mjs';
import {inspectSql,restoreStatements,restoreSnapshot} from './d1-snapshot.mjs';
const check=(ok,code)=>{if(!ok)throw Error(code)};
const report={result:'BLOCKED',mode:'REMOTE_D1_RESTORE_ONLY',productionWrites:0,productionExports:0,providerCalls:0,databaseDeletes:0,productionDeployments:0,createdDatabase:null};
let phase='PREFLIGHT',dir;
try {
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team','REPOSITORY_MISMATCH');
 check(process.env.MAIN_SHA==='feb3d463e47bebb094b209f16d96449624848ef5','MAIN_NOT_PINNED');
 const gh=await fetch('https://api.github.com/repos/serox94/dream-team/branches/main',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
 check(gh.ok&&(await gh.json()).commit?.sha===process.env.MAIN_SHA,'MAIN_MOVED');
 const day=new Date().toISOString().slice(0,10),analytics=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({query:'query($a:string!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){d1AnalyticsAdaptiveGroups(limit:100,filter:{date_geq:$d,date_leq:$d}){sum{rowsRead} dimensions{databaseId}}}}}',variables:{a:process.env.CLOUDFLARE_ACCOUNT_ID,d:day}}),signal:AbortSignal.timeout(20000)});
 const stats=await analytics.json(),groups=stats.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;check(analytics.ok&&!stats.errors?.length&&Array.isArray(groups),'D1_BUDGET_UNVERIFIED');
 report.d1DailyReads=groups.reduce((n,x)=>n+x.sum.rowsRead,0);check(report.d1DailyReads+80000<4800000,'D1_HEADROOM_TOO_LOW');
 const dbs=await cf('/d1/database?per_page=100');
 check(Array.isArray(dbs)&&dbs.length===9,'D1_SLOT_UNAVAILABLE');
 check(dbs.some(x=>x.uuid===productionId&&x.name==='dream-team-db'),'PRODUCTION_DB_MISSING');
 const deploy=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];
 check(deploy.versions.length===1&&deploy.versions[0].percentage===100&&deploy.versions[0].version_id==='81f011a2-ba96-4bdf-b199-10e89f8271e4','PRODUCTION_VERSION_MOVED');
 const version=await cf('/workers/scripts/dream-team/versions/'+deploy.versions[0].version_id);
 check(version.resources.bindings.find(x=>x.name==='DB')?.id===productionId,'PRODUCTION_BINDING_MOVED');
 const state=(await query(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).results;
 const settings=Object.fromEntries(state.map(x=>[x.key,x.value]));
 check(settings.schema_version==='32'&&settings.maintenance_mode!=='on','PRODUCTION_SCHEMA_OR_MAINTENANCE');
 const worker=(await cf('/workers/scripts')).find(x=>x.id==='dream-team');check(worker?.tag,'WORKER_TAG_MISSING');
 let builds=[];
 for(let attempt=0;attempt<12;attempt++){
  const raw=await cf('/builds/workers/'+worker.tag+'/builds?per_page=100');builds=Array.isArray(raw)?raw:raw.builds;
  check(Array.isArray(builds),'BUILDS_UNVERIFIED');
  report.activeBuildStatuses=builds.filter(x=>['queued','pending','initializing','running','building'].includes(x.status)).map(x=>({id:x.id,status:x.status}));
  if(!report.activeBuildStatuses.length)break;
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 check(!report.activeBuildStatuses.length,'BUILDS_NOT_IDLE');
 const afterBuild=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];
 check(afterBuild.versions.length===1&&afterBuild.versions[0].percentage===100&&afterBuild.versions[0].version_id===deploy.versions[0].version_id,'PRODUCTION_VERSION_MOVED');
 phase='READ_PRIVATE_SNAPSHOT';dir=await mkdtemp(join(tmpdir(),'restore32-'));const file=join(dir,'snapshot.sql');
 wrangler(['r2','object','get','dream-team-d1-backups/private-releases/code32/40703214121-179da4d9/schema32.sql','--remote','--file',file]);
 const bytes=await readFile(file);check(sha(bytes)==='51fb813a11c3973cfeb356e14d47f88586d12798a3928e7a62ce98558836953b','SNAPSHOT_HASH_MISMATCH');
 const snapshot=inspectSql(bytes),plan=restoreStatements(snapshot);check(snapshot.tables.length===37&&snapshot.tables.reduce((n,t)=>n+t.rows.length,0)===2910,'SNAPSHOT_COUNTS_MISMATCH');
 report.snapshot={sha256:sha(bytes),tables:snapshot.tables.length,rows:2910,statements:plan.length,largeParameterizedRows:plan.filter(x=>x.params?.length).length};
 phase='CREATE_ISOLATED_D1';const name='dream-team-audit-'+process.env.GITHUB_RUN_ID+'32-db';check(/^dream-team-audit-\d+32-db$/.test(name)&&!dbs.some(x=>x.name===name),'TARGET_IDENTITY_INVALID');
 const db=await cf('/d1/database','POST',{name});assertSandbox(db.name,db.uuid);check(db.name===name,'TARGET_NAME_MISMATCH');report.createdDatabase={name:db.name,uuid:db.uuid};
 console.log('ISOLATED_D1_CREATED '+JSON.stringify(report.createdDatabase));
 phase='REMOTE_RESTORE_AND_COMPARE';const result=await restoreSnapshot(db,snapshot,query,plan);
 Object.assign(report,{result:'PASS',remoteRestore:result,comparison:'ALL_TABLE_ROW_DIGESTS_SCHEMA_SEQUENCES_FK_QUICK_CHECK_PASS',productionWorker:deploy.versions[0].version_id,productionSchema:32,maintenance:'OFF',d1CountBefore:dbs.length,d1CountAfter:(await cf('/d1/database?per_page=100')).length});
} catch(e){report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'REHEARSAL_FAILED',stage:e.stage||undefined,table:e.table||undefined,httpStatus:e.status||undefined,cloudflareCode:e.code||undefined};process.exitCode=1;}
finally{if(dir)await rm(dir,{recursive:true,force:true});await mkdir('remote-restore-status',{recursive:true});await writeFile('remote-restore-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('REMOTE_RESTORE '+JSON.stringify(report));}
