// Exact owner-approved 407248 disposable D1 retirement: one DELETE maximum, no retries.
// Historic Worker reference scan, R2 backup hash+receipt and D1 row digest equality are mandatory.
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
const report={result:'BLOCKED',mode:'OWNER_APPROVED_EXACT_407248_D1_RETIREMENT',phase:'PREFLIGHT',target,deleteAttempts:0,productionWrites:0,otherDeletes:0,deployments:0,backupWrites:0,approvalChanges:0};
let dir;
let getRetries=0;
const read=async path=>{
 for(let attempt=0;attempt<3;attempt++){
  try{return await cf(path);}catch(e){
   if(![500,502,503,504].includes(e.status)||attempt===2)throw e;
   getRetries++;await new Promise(r=>setTimeout(r,500*(attempt+1)));
  }
 }
};
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&process.env.GITHUB_RUN_ATTEMPT==='1','ONE_SHOT_REQUIRED');
 check(process.env.RETIRE_APPROVAL==='DELETE:'+target.name+':'+target.uuid,'EXACT_APPROVAL_REQUIRED');
 check(target.uuid!==productionId,'PRODUCTION_ID_FORBIDDEN');
 const list=async()=>{const x=await read('/d1/database?per_page=100');check(Array.isArray(x),'D1_LIST_INVALID');return x};
 const before=await list();check(before.length===10&&before.filter(x=>x.name===target.name&&x.uuid===target.uuid).length===1,'TARGET_OR_CAPACITY_CHANGED');
 const direct=await read('/d1/database/'+target.uuid);check(direct.uuid===target.uuid&&direct.name===target.name,'TARGET_IDENTITY_CHANGED');
 const stable=async()=>{
  const deployment=(await read('/workers/scripts/dream-team/deployments')).deployments[0];
  check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===expectedWorker,'PRODUCTION_WORKER_CHANGED');
  const schedules=await read('/workers/scripts/dream-team/schedules'),backupSchedules=await read('/workers/scripts/dream-team-d1-backup/schedules');
  const buckets=await read('/r2/buckets?per_page=1000');check(Array.isArray(buckets?.buckets)&&!buckets.cursor,'BUCKET_INVENTORY_INCOMPLETE');
  return {deployment,schedules,backupSchedules,buckets:buckets.buckets.map(x=>x.name).sort()};
 };
 const initial=await stable();
 report.phase='ALL_WORKER_BINDINGS_AND_HISTORY';
 const workers=await read('/workers/scripts');check(Array.isArray(workers)&&workers.length===7,'WORKER_INVENTORY_CHANGED');
 let versions=0;const references=[];
 const hasTarget=bindings=>{check(Array.isArray(bindings),'BINDINGS_UNAVAILABLE');return bindings.some(b=>(b.type==='d1'&&(b.id===target.uuid||b.database_id===target.uuid||b.database_name===target.name))||(b.type==='plain_text'&&typeof b.text==='string'&&(b.text.includes(target.uuid)||b.text.includes(target.name))));};
 for(const w of workers){
  check(/^[a-zA-Z0-9_-]+$/.test(w.id||''),'WORKER_NAME_UNSUPPORTED');
  if(hasTarget((await read('/workers/scripts/'+w.id+'/settings')).bindings))references.push({worker:w.id,kind:'active'});
  let complete=false;
  for(let page=1;page<=30;page++){
   // No deployable filter: includes all retained historical versions, with pagination.
   const listVersions=await read('/workers/scripts/'+w.id+'/versions?per_page=100&page='+page);
   check(Array.isArray(listVersions?.items),'HISTORY_UNAVAILABLE');
   for(const item of listVersions.items){
    check(/^[a-f0-9-]{36}$/.test(item.id||''),'VERSION_ID_INVALID');
    check(++versions<=3000,'HISTORY_BUDGET_EXCEEDED');
    const v=await read('/workers/scripts/'+w.id+'/versions/'+item.id);
    if(hasTarget(v.resources?.bindings))references.push({worker:w.id,version:item.id,kind:'history'});
   }
   if(listVersions.items.length<100){complete=true;break;}
  }
  check(complete,'HISTORY_PAGINATION_INCOMPLETE');
 }
 report.versionsInspected=versions;report.workersInspected=workers.length;report.references=references;check(versions>=1287&&references.length===0,'TARGET_HAS_WORKER_REFERENCES_OR_HISTORY_INCOMPLETE');
 report.phase='R2_SNAPSHOT_AND_REMOTE_DIGESTS';dir=await mkdtemp(join(tmpdir(),'dream-retire-restored-'));const file=join(dir,'snapshot.sql');
 wrangler(['r2','object','get','dream-team-d1-backups/'+snapshotKey,'--remote','--file',file]);
 const bytes=await readFile(file);check(sha(bytes)===snapshotHash,'SNAPSHOT_HASH_MISMATCH');
 const snapshot=inspectSql(bytes);check(snapshot.tables.length===37&&snapshot.tables.reduce((n,t)=>n+t.rows.length,0)===2910,'SNAPSHOT_COUNTS_CHANGED');
 await verifySnapshot(target,snapshot,query);report.snapshotComparison='ALL_ROW_DIGESTS_SCHEMA_SEQUENCES_FK_QUICK_CHECK_PASS';
 // The R2 receipt is separate from the SQL backup. Verify its source UUID, hash and roundtrip evidence.
 const receiptPath='private-releases/stale-d1/40724851849/40731656739/receipt.json';
 const receiptFile=join(dir,'backup-receipt.json');
 wrangler(['r2','object','get','dream-team-d1-backups/'+receiptPath,'--remote','--file',receiptFile]);
 const receipt=JSON.parse(await readFile(receiptFile,'utf8'));
 check(receipt.format==='failed-release-407248-d1-snapshot-v1'&&receipt.target?.name===target.name&&receipt.target?.uuid===target.uuid,'BACKUP_RECEIPT_TARGET_MISMATCH');
 check(receipt.sqlKey===snapshotKey&&receipt.sqlSha256===snapshotHash&&receipt.tables===37&&receipt.rows===2910,'BACKUP_RECEIPT_DIGEST_MISMATCH');
 check(receipt.privateRoundtrip==='PASS'&&receipt.localRestore==='PASS'&&receipt.integrity==='PASS'&&receipt.foreignKeys==='PASS'&&receipt.validatedRows===2910&&receipt.sqlBytes===bytes.length&&receipt.deletePerformed===false,'BACKUP_RECEIPT_VERIFICATION_MISSING');
 report.backupReceiptVerified=true;
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
 const afterReceipt=join(dir,'verify-receipt.json');wrangler(['r2','object','get','dream-team-d1-backups/'+receiptPath,'--remote','--file',afterReceipt]);
 check(sha(await readFile(afterReceipt))===sha(await readFile(receiptFile)),'BACKUP_RECEIPT_NOT_RETAINED');
 Object.assign(report,{result:'PASS',d1Before:10,d1After:9,targetAbsent:true,otherDatabasesPreserved:true,productionAndSchedulesUnchanged:true,r2BucketsPreserved:true,snapshotRetained:true,backupReceiptRetained:true,phase:'COMPLETE'});
}catch(e){report.failure={phase:report.phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'VERIFICATION_FAILED',httpStatus:e.status||undefined,cloudflareCode:e.code||undefined,stage:e.stage||undefined};process.exitCode=1;}
finally{report.controlPlaneGetRetries=getRetries;if(dir)await rm(dir,{recursive:true,force:true});await mkdir('retire-407248-status',{recursive:true});await writeFile('retire-407248-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('RETIRE_EXACT_407248_D1 '+JSON.stringify(report));}
