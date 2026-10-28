// READ-ONLY eligibility verification of failed release disposable D1. NO DELETE.
import {readFile,writeFile,mkdir,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cf,query,wrangler,sha,productionId} from './recovery-common.mjs';
import {inspectSql,verifySnapshot} from './d1-snapshot.mjs';
const target={name:'dream-team-audit-4072485184932-db',uuid:'ee58d26e-26f9-4f25-bbe9-944d6fa91c56'};
const snapshotKey='private-releases/stale-d1/40724851849/40731656739/schema.sql';
const snapshotHash='d03c85717437e1a031eb965d35f31dd0f1420eed23152bdb5227b0ec1851b146';
const expectedWorker='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const check=(ok,code)=>{if(!ok)throw Error(code)};
const report={result:'BLOCKED',mode:'EXACT_D1_RETIREMENT_ELIGIBILITY_READ_ONLY',phase:'PREFLIGHT',target,deleteAttempts:0,productionWrites:0,otherDeletes:0,deployments:0,backupWrites:0,deletionAuthorized:false};
let dir;
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_RUN_ATTEMPT==='1','ONE_SHOT_REQUIRED');
 check(target.uuid!==productionId,'PRODUCTION_ID_FORBIDDEN');
 const list=async()=>{const x=await cf('/d1/database?per_page=100');check(Array.isArray(x),'D1_LIST_INVALID');return x};
 const before=await list();check(before.length===10&&before.filter(x=>x.name===target.name&&x.uuid===target.uuid).length===1,'TARGET_OR_CAPACITY_CHANGED');
 const direct=await cf('/d1/database/'+target.uuid);check(direct.uuid===target.uuid&&direct.name===target.name,'TARGET_IDENTITY_CHANGED');
 const stable=async()=>{
  const deployment=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];
  check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===expectedWorker,'PRODUCTION_WORKER_CHANGED');
  const schedules=await cf('/workers/scripts/dream-team/schedules'),backupSchedules=await cf('/workers/scripts/dream-team-d1-backup/schedules');
  const buckets=await cf('/r2/buckets?per_page=1000');check(Array.isArray(buckets?.buckets)&&!buckets.cursor,'BUCKET_INVENTORY_INCOMPLETE');
  return {deployment,schedules,backupSchedules,buckets:buckets.buckets.map(x=>x.name).sort()};
 };
 const initial=await stable();
 report.phase='ALL_WORKER_BINDINGS_AND_HISTORY';
 const workers=await cf('/workers/scripts');check(Array.isArray(workers)&&workers.length<=100,'WORKER_INVENTORY_INCOMPLETE');
 let versions=0;const references=[];
 const hasTarget=bindings=>{check(Array.isArray(bindings),'BINDINGS_UNAVAILABLE');return bindings.some(b=>(b.type==='d1'&&(b.id===target.uuid||b.database_id===target.uuid||b.database_name===target.name))||(b.type==='plain_text'&&typeof b.text==='string'&&(b.text.includes(target.uuid)||b.text.includes(target.name))));};
 for(const w of workers){
  check(/^[a-zA-Z0-9_-]+$/.test(w.id||''),'WORKER_NAME_UNSUPPORTED');
  if(hasTarget((await cf('/workers/scripts/'+w.id+'/settings')).bindings))references.push({worker:w.id,kind:'active'});
  let complete=false;
  for(let page=1;page<=30;page++){
   // No deployable filter: includes all retained historical versions, with pagination.
   const listVersions=await cf('/workers/scripts/'+w.id+'/versions?per_page=100&page='+page);
   check(Array.isArray(listVersions?.items),'HISTORY_UNAVAILABLE');
   for(const item of listVersions.items){
    check(/^[a-f0-9-]{36}$/.test(item.id||''),'VERSION_ID_INVALID');
    check(++versions<=3000,'HISTORY_BUDGET_EXCEEDED');
    const v=await cf('/workers/scripts/'+w.id+'/versions/'+item.id);
    if(hasTarget(v.resources?.bindings))references.push({worker:w.id,version:item.id,kind:'history'});
   }
   if(listVersions.items.length<100){complete=true;break;}
  }
  check(complete,'HISTORY_PAGINATION_INCOMPLETE');
 }
 report.versionsInspected=versions;report.workersInspected=workers.length;report.references=references;check(references.length===0,'TARGET_HAS_WORKER_REFERENCES');
 report.phase='R2_SNAPSHOT_AND_REMOTE_DIGESTS';dir=await mkdtemp(join(tmpdir(),'dream-retire-restored-'));const file=join(dir,'snapshot.sql');
 wrangler(['r2','object','get','dream-team-d1-backups/'+snapshotKey,'--remote','--file',file]);
 const bytes=await readFile(file);check(sha(bytes)===snapshotHash,'SNAPSHOT_HASH_MISMATCH');
 const snapshot=inspectSql(bytes);check(snapshot.tables.length===37&&snapshot.tables.reduce((n,t)=>n+t.rows.length,0)===2910,'SNAPSHOT_COUNTS_CHANGED');
 await verifySnapshot(target,snapshot,query);report.snapshotComparison='ALL_ROW_DIGESTS_SCHEMA_SEQUENCES_FK_QUICK_CHECK_PASS';
 check(JSON.stringify(initial)===JSON.stringify(await stable()),'PRODUCTION_CONFIGURATION_CHANGED');
 const final=await list();check(final.length===10&&final.filter(x=>x.uuid===target.uuid&&x.name===target.name).length===1,'TARGET_MOVED_BEFORE_DELETE');
 check(JSON.stringify(final.map(x=>[x.uuid,x.name]).sort())===JSON.stringify(before.map(x=>[x.uuid,x.name]).sort()),'DATABASE_INVENTORY_CHANGED');

 report.phase='READ_ONLY_COMPLETE';
 Object.assign(report,{result:'PASS',d1Count:10,snapshotRetained:true,otherDatabasesUnchanged:true,productionAndSchedulesUnchanged:true,
  workerHistoryComplete:true,workerBindingReferences:0,deletionAuthorized:false,deletionStatus:'NOT_PERFORMED'});
}catch(e){report.failure={phase:report.phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'VERIFICATION_FAILED',httpStatus:e.status||undefined,cloudflareCode:e.code||undefined,stage:e.stage||undefined};process.exitCode=1;}
finally{if(dir)await rm(dir,{recursive:true,force:true});await mkdir('retirement-readonly-status',{recursive:true});await writeFile('retirement-readonly-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('RETIRE_ELIGIBILITY_READONLY '+JSON.stringify(report));}
