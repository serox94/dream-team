// Owner-authorized ONE-TIME cleanup of a single orphan schema31 test D1.
// All non-target Cloudflare resources are read-only. No Worker deployments or D1 mutations.
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cf,query,wrangler,sha,exportSql,configFile,productionId} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest} from './d1-snapshot.mjs';

const target=Object.freeze({name:'dream-team-audit-40241458807931-db',uuid:'fd253e14-747b-415d-8e4e-f39ffc4119b5'});
const productionWorker='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d';
const productionDatabase='b64c7a2c-8694-41c6-b54a-857b88bf2c96';
const previewDatabase='5d32f54f-f953-463f-8519-745e51417986';
const mainSha='d39ddf632b2279573216ac81d536a7e6f0fcc240';
const approval='DELETE:'+target.name+':'+target.uuid+':AFTER_VERIFIED_BACKUP';
const check=(ok,code)=>{if(!ok)throw Error(code)};
let dir;
const report={result:'BLOCKED',phase:'OWNER_SCOPE',target,productionWrites:0,otherDatabaseDeletes:0,workerDeployments:0,approvalChanges:0,deleteAttempts:0,backupWrites:0};
const reportDir='retire-402414-status';
let deleteIssued=false;
const list=async()=>{
 const result=await cf('/d1/database?per_page=100');
 check(Array.isArray(result)&&result.length<=10,'D1_LIST_INCOMPLETE');
 return result;
};
const identity=d=>JSON.stringify(d.map(x=>[x.uuid,x.name]).sort((a,b)=>a[0].localeCompare(b[0])));
const hasReference=bindings=>{
 check(Array.isArray(bindings),'WORKER_BINDINGS_UNAVAILABLE');
 return bindings.some(b=>(b.type==='d1'&&[b.id,b.database_id,b.database_name].some(x=>x===target.uuid||x===target.name))||
   (b.type==='plain_text'&&typeof b.text==='string'&&(b.text.includes(target.uuid)||b.text.includes(target.name))));
};
const bytesFile=async path=>readFile(path);
const getBackup=async(key,file)=>{
 wrangler(['r2','object','get','dream-team-d1-backups/'+key,'--remote','--file',file]);
 return bytesFile(file);
};
async function scanResources(){
 const deployment=(await cf('/workers/scripts/dream-team/deployments')).deployments?.[0];
 check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===productionWorker,'PRODUCTION_VERSION_CHANGED');
 const version=await cf('/workers/scripts/dream-team/versions/'+productionWorker);
 check(version.resources?.bindings?.some(b=>b.type==='d1'&&b.id===productionDatabase),'PRODUCTION_DB_BINDING_CHANGED');
 const schedules=await cf('/workers/scripts/dream-team/schedules');
 const backups=await cf('/workers/scripts/dream-team-d1-backup/schedules');
 check(backups.schedules?.some(x=>x.cron==='17 3 * * *'),'BACKUP_CRON_CHANGED');
 const r2=(await cf('/r2/buckets?per_page=1000'));
 check(Array.isArray(r2.buckets)&&!r2.cursor,'R2_BUCKET_INVENTORY_INCOMPLETE');
 check(r2.buckets.some(x=>x.name==='dream-team-d1-backups'),'PRIVATE_BACKUP_BUCKET_MISSING');
 const workers=await cf('/workers/scripts');
 check(Array.isArray(workers)&&workers.length===7,'WORKER_LIST_CHANGED');
 const activeWorkers=[];
 const references=[];
 let versionsScanned=0;
 for(const worker of workers){
  const id=worker.id;
  check(/^[A-Za-z0-9_-]+$/.test(id),'WORKER_ID_INVALID');
  const settings=await cf('/workers/scripts/'+id+'/settings');
  if(hasReference(settings.bindings))references.push({worker:id,kind:'settings'});
  const live=(await cf('/workers/scripts/'+id+'/deployments')).deployments?.[0];
  check(live?.versions?.length>=1,'WORKER_DEPLOYMENT_UNAVAILABLE');
  activeWorkers.push([id,live.versions.map(x=>[x.version_id,x.percentage])]);
  for(const part of live.versions){
   const v=await cf('/workers/scripts/'+id+'/versions/'+part.version_id);
   if(hasReference(v.resources?.bindings))references.push({worker:id,kind:'active',version:part.version_id});
  }
  let complete=false;
  for(let page=1;page<=40;page++){
   const batch=(await cf('/workers/scripts/'+id+'/versions?per_page=100&page='+page))?.items;
   check(Array.isArray(batch),'VERSION_PAGE_UNAVAILABLE');
   for(let offset=0;offset<batch.length;offset+=8){
    const chunk=batch.slice(offset,offset+8);
    const checks=await Promise.all(chunk.map(async v=>{
     check(/^[0-9a-f-]{36}$/.test(v.id||''),'WORKER_VERSION_INVALID');
     const full=await cf('/workers/scripts/'+id+'/versions/'+v.id);
     return hasReference(full.resources?.bindings)?{worker:id,kind:'retained',version:v.id}:null;
    }));
    for(const item of checks)if(item)references.push(item);
    versionsScanned+=chunk.length;
    check(versionsScanned<=2500,'HISTORY_READ_LIMIT');
   }
   if(batch.length<100){complete=true;break;}
  }
  check(complete,'WORKER_HISTORY_INCOMPLETE');
 }
 check(versionsScanned>=1250,'WORKER_HISTORY_UNEXPECTEDLY_SHORT');
 check(references.length===0,'TARGET_STILL_REFERENCED_BY_WORKER');
 return {productionWorker,productionDatabase,mainSha,
   deployment,productionSchedule:schedules,backupSchedule:backups,
   buckets:r2.buckets.map(x=>x.name).sort(),
   activeWorkers:activeWorkers.sort((a,b)=>a[0].localeCompare(b[0])),
   workersInspected:workers.length,versionsScanned,references};
}
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team','WRONG_REPOSITORY');
 check(process.env.GITHUB_REF==='refs/heads/fix/code32-cloudflare-recovery-diagnostics-20261027','WRONG_BRANCH');
 check(process.env.GITHUB_RUN_ATTEMPT==='1','ONE_TIME_RUN_NO_RETRY');
 check(process.env.RETIRE_APPROVAL===approval,'EXACT_OWNER_APPROVAL_MISSING');
 check(productionId===productionDatabase&&target.uuid!==productionId&&target.uuid!==previewDatabase,'PROTECTED_DATABASE');
 check(process.env.GITHUB_RUN_ID&&/^\d+$/.test(process.env.GITHUB_RUN_ID),'RUN_ID_REQUIRED');
 const beginning=await list();
 check(beginning.length===10&&beginning.filter(x=>x.name===target.name&&x.uuid===target.uuid).length===1,'EXACT_TARGET_OR_CAPACITY_CHANGED');
 check(beginning.some(x=>x.uuid===productionDatabase&&x.name==='dream-team-db'),'PRODUCTION_DB_ABSENT');
 check(beginning.some(x=>x.uuid===previewDatabase&&x.name==='dream-team-preview-db'),'PREVIEW_DB_ABSENT');
 const meta=await cf('/d1/database/'+target.uuid);
 check(meta.uuid===target.uuid&&meta.name===target.name,'TARGET_METADATA_CHANGED');
 report.phase='WORKER_HISTORY_AND_R2';
 const original=await scanResources();
 report.history={workers:original.workersInspected,versions:original.versionsScanned,references:original.references};
 dir=await mkdtemp(join(tmpdir(),'dream-one-d1-retire-'));
 report.phase='PINNED_D1_EXPORT_AND_LOCAL_RESTORE';
 const config=await configFile(dir,{name:'one-db-retire',compatibility_date:'2026-10-01',
  d1_databases:[{binding:'DB',database_name:target.name,database_id:target.uuid}]},'backup-config.jsonc');
 const sqlPath=join(dir,'schema.sql');
 const exported=await exportSql(config,target.name,sqlPath);
 check(exported.bytes.length>1000&&exported.bytes.length<10*1024*1024,'SNAPSHOT_SIZE_INVALID');
 // inspectSql REALLY executes the SQL in a fresh in-memory SQLite and validates FK+integrity.
 const snapshot=inspectSql(exported.bytes);
 const rowCount=snapshot.tables.reduce((sum,t)=>sum+t.rows.length,0);
 check(snapshot.tables.length>=30&&rowCount>=5&&rowCount<12000,'SNAPSHOT_STRUCTURE_UNEXPECTED');
 check(snapshot.tables.find(t=>t.name==='app_settings')?.rows.some(x=>x.key==='schema_version'&&x.value==='31'),'SCHEMA31_EXPECTED');
 const readonlyQuery=async(id,sql,params=[])=>{
  check(id===target.uuid&&(/^\s*SELECT\b/i.test(sql)||/^\s*PRAGMA (foreign_key_check|quick_check)\s*$/i.test(sql)),'READ_ONLY_SOURCE_QUERY_REQUIRED');
  return query(id,sql,params);
 };
 await verifySnapshot(target,snapshot,readonlyQuery);
 report.localRestore='PASS';
 report.remoteRowsAndSchema='ALL_DIGESTS_MATCH';
 report.integrity='PASS';
 report.schema='31';
 report.tables=snapshot.tables.length;
 report.rows=rowCount;
 report.phase='R2_PRIVATE_SNAPSHOT_ROUNDTRIP';
 const prefix='private-releases/one-time-retire/40241458807931/'+process.env.GITHUB_RUN_ID+'/';
 const sqlKey=prefix+'schema.sql',receiptKey=prefix+'receipt.json';
 wrangler(['r2','object','put','dream-team-d1-backups/'+sqlKey,'--remote','--file',sqlPath]);report.backupWrites++;
 const sqlCopy=await getBackup(sqlKey,join(dir,'roundtrip.sql'));
 check(sha(sqlCopy)===exported.sha256,'BACKUP_R2_SQL_HASH_MISMATCH');
 const reread=inspectSql(sqlCopy);
 check(rowsDigest(reread.schema)===rowsDigest(snapshot.schema)&&
   reread.tables.length===snapshot.tables.length&&reread.tables.every((table,i)=>table.name===snapshot.tables[i].name&&rowsDigest(table.rows)===rowsDigest(snapshot.tables[i].rows)),'BACKUP_LOCAL_RESTORE_MISMATCH');
 const receipt={format:'dream-team-orphan-d1-retire-v1',target,createdAt:new Date().toISOString(),
  sqlKey,sha256:exported.sha256,sqlBytes:sqlCopy.length,tables:snapshot.tables.length,rows:rowCount,
  productionWorker,productionDatabase,mainSha,workerVersionsChecked:original.versionsScanned,
  targetReferences:0,localSqliteRestore:'PASS',snapshotRemoteDigest:'PASS',privateRoundtrip:'PASS',
  operation:'DELETE_ONLY_EXACT_TARGET_AFTER_ALL_GATES',deletionPerformed:false};
 const receiptPath=await configFile(dir,receipt,'receipt.json');
 wrangler(['r2','object','put','dream-team-d1-backups/'+receiptKey,'--remote','--file',receiptPath]);report.backupWrites++;
 const receiptCopy=await getBackup(receiptKey,join(dir,'receipt-copy.json'));
 check(sha(receiptCopy)===sha(await readFile(receiptPath)),'BACKUP_RECEIPT_ROUNDTRIP_MISMATCH');
 report.backup={sqlKey,receiptKey,sha256:exported.sha256,bytes:sqlCopy.length};
 report.phase='FINAL_NO_DELETE_IF_CHANGED';
 // A second full Worker history scan intentionally closes the live-binding race before DELETE.
 const afterScan=await scanResources();
 check(JSON.stringify({
  deployment:original.deployment,productionSchedule:original.productionSchedule,
  backupSchedule:original.backupSchedule,buckets:original.buckets,activeWorkers:original.activeWorkers
 })===JSON.stringify({
  deployment:afterScan.deployment,productionSchedule:afterScan.productionSchedule,
  backupSchedule:afterScan.backupSchedule,buckets:afterScan.buckets,activeWorkers:afterScan.activeWorkers
 }),'WORKER_OR_R2_CONFIGURATION_CHANGED');
 const beforeDeletion=await list();
 check(identity(beginning)===identity(beforeDeletion),'D1_INVENTORY_CHANGED');
 check((await cf('/d1/database/'+target.uuid)).name===target.name,'TARGET_CHANGED_BEFORE_DELETE');
 await verifySnapshot(target,snapshot,readonlyQuery);
 check(sha(await getBackup(sqlKey,join(dir,'immediately-before.sql')))===exported.sha256,'SQL_BACKUP_NOT_RETAINED');
 check(sha(await getBackup(receiptKey,join(dir,'immediately-before.json')))===sha(receiptCopy),'RECEIPT_NOT_RETAINED');
 report.phase='EXACT_SINGLE_DELETE';
 check(!deleteIssued,'DOUBLE_DELETE_FORBIDDEN');
 deleteIssued=true;report.deleteAttempts=1;
 // NEVER RETRY ambiguous DELETE response. Verify exclusively via GET.
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/d1/database/'+target.uuid,{
  method:'DELETE',redirect:'error',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,accept:'application/json'},signal:AbortSignal.timeout(30000)
 }).catch(e=>{report.deleteTransport='UNCERTAIN';return null});
 if(response){
  const result=await response.json().catch(()=>null);
  report.deleteHttpStatus=response.status;
  report.deleteAccepted=response.ok&&result?.success===true;
 }
 report.phase='VERIFY_GET_ONLY';
 let remaining;
 for(let i=0;i<7;i++){
  remaining=await list();
  if(!remaining.some(x=>x.uuid===target.uuid||x.name===target.name))break;
  if(i<6)await new Promise(resolve=>setTimeout(resolve,1000));
 }
 check(remaining.length===9&&identity(remaining)===identity(beginning.filter(x=>x.uuid!==target.uuid)),'DELETION_NOT_CONFIRMED');
 const final=await scanResources();
 check(JSON.stringify(final.activeWorkers)===JSON.stringify(original.activeWorkers),'WORKER_DEPLOYMENT_CHANGED');
 check(JSON.stringify(final.buckets)===JSON.stringify(original.buckets),'R2_BUCKETS_CHANGED');
 check(sha(await getBackup(sqlKey,join(dir,'after-delete.sql')))===exported.sha256,'SNAPSHOT_NOT_RETAINED');
 check(sha(await getBackup(receiptKey,join(dir,'after-delete.json')))===sha(receiptCopy),'RECEIPT_NOT_RETAINED');
 Object.assign(report,{result:'PASS',phase:'COMPLETE',d1Before:10,d1After:9,targetAbsent:true,
   productionUnchanged:true,previewRetained:true,allOtherD1Retained:true,backupRetained:true,
   activeWorker:productionWorker,workerVersionsScanned:final.versionsScanned});
}catch(error){
 report.failure={phase:report.phase,code:/^[A-Z0-9_]+$/.test(String(error?.message||''))?error.message:'CHECK_FAILED',
  ...(error.status?{httpStatus:error.status}:{}),...(Number.isInteger(error.code)?{cloudflareCode:error.code}:{})};
 process.exitCode=1;
}finally{
 if(dir)await rm(dir,{recursive:true,force:true});
 await mkdir(reportDir,{recursive:true});
 await writeFile(join(reportDir,'summary.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log('RETIRE_402414_EXACT '+JSON.stringify(report));
}
