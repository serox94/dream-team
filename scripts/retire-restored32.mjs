// Owner-approved retirement of exactly one isolated, restored D1. No retries of DELETE.
import {readFile,writeFile,mkdir,rm,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cf,query,wrangler,sha,productionId} from './recovery-common.mjs';
import {inspectSql,verifySnapshot} from './d1-snapshot.mjs';
const target={name:'dream-team-audit-4071995755632-db',uuid:'4592a157-9eba-449f-98d0-255061c1fa47'};
const snapshotKey='private-releases/code32/40703214121-179da4d9/schema32.sql';
const snapshotHash='51fb813a11c3973cfeb356e14d47f88586d12798a3928e7a62ce98558836953b';
const expectedWorker='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const check=(ok,code)=>{if(!ok)throw Error(code)};
const report={result:'BLOCKED',phase:'PREFLIGHT',target,deleteAttempts:0,productionWrites:0,otherDeletes:0,deployments:0,backupWrites:0};
let dir;
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_RUN_ATTEMPT==='1','ONE_SHOT_REQUIRED');
 check(process.env.RETIRE_APPROVAL==='DELETE:'+target.name+':'+target.uuid,'EXACT_APPROVAL_REQUIRED');
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
 report.phase='EXACTLY_ONE_DELETE';report.deleteAttempts=1;
 let deleteStatus='UNCERTAIN';
 try{
  const resp=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+target.uuid,{method:'DELETE',redirect:'error',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,accept:'application/json'},signal:AbortSignal.timeout(30000)});
  const data=await resp.json();if(resp.ok&&data.success===true)deleteStatus='ACCEPTED';else report.deleteHttpStatus=resp.status;
 }catch{report.deleteError='TRANSPORT_OR_RESPONSE_ERROR';}
 report.deleteResponse=deleteStatus;
 report.phase='GET_ONLY_VERIFY';let after;
 for(let i=0;i<5;i++){after=await list();if(!after.some(x=>x.uuid===target.uuid||x.name===target.name))break;if(i<4)await new Promise(r=>setTimeout(r,1000));}
 check(after.length===9&&!after.some(x=>x.uuid===target.uuid||x.name===target.name),'DELETION_UNCONFIRMED');
 check(JSON.stringify(after.map(x=>[x.uuid,x.name]).sort())===JSON.stringify(before.filter(x=>x.uuid!==target.uuid).map(x=>[x.uuid,x.name]).sort()),'OTHER_DATABASE_CHANGED');
 check(JSON.stringify(initial)===JSON.stringify(await stable()),'PRODUCTION_OR_BUCKETS_CHANGED');
 const afterFile=join(dir,'verify.sql');wrangler(['r2','object','get','dream-team-d1-backups/'+snapshotKey,'--remote','--file',afterFile]);check(sha(await readFile(afterFile))===snapshotHash,'SNAPSHOT_NOT_RETAINED');
 Object.assign(report,{result:'PASS',d1Before:10,d1After:9,targetAbsent:true,otherDatabasesPreserved:true,productionAndSchedulesUnchanged:true,r2BucketsPreserved:true,snapshotRetained:true,phase:'COMPLETE'});
}catch(e){report.failure={phase:report.phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'VERIFICATION_FAILED',httpStatus:e.status||undefined,cloudflareCode:e.code||undefined,stage:e.stage||undefined};process.exitCode=1;}
finally{if(dir)await rm(dir,{recursive:true,force:true});await mkdir('retire-restored-status',{recursive:true});await writeFile('retire-restored-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('RETIRE_RESTORED_D1 '+JSON.stringify(report));}
