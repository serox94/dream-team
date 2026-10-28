// Retires EXACTLY one user-approved and locally restored empty disposable D1.
// Source PR23 production D1, preview D1, media, backups, Workers and schema32 are immutable.
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha,productionId,wrangler} from './recovery-common.mjs';
import {inspect} from './audit-407032-readonly.mjs';
import {TARGET,keys,assertExactEmptySource,localEmptyRestore} from './backup-407032-disposable.mjs';

export const BACKUP_RUN='40717557385';
export const APPROVAL='DELETE:'+TARGET.name+':'+TARGET.uuid+':BACKUP:'+BACKUP_RUN;
const WORKER='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const check=(ok,code)=>{if(!ok)throw Error(code);};
export function verifyOnlyOneRemoved(before,after){
 check(Array.isArray(before)&&Array.isArray(after)&&before.length===10&&after.length===9,'D1_COUNT_UNVERIFIED');
 check(before.filter(x=>x.uuid===TARGET.uuid&&x.name===TARGET.name).length===1,'TARGET_NOT_IN_ORIGINAL');
 check(!after.some(x=>x.uuid===TARGET.uuid||x.name===TARGET.name),'TARGET_STILL_PRESENT');
 const identity=arr=>JSON.stringify(arr.map(x=>[x.name,x.uuid]).sort((a,b)=>a[0].localeCompare(b[0])));
 check(identity(before.filter(x=>x.uuid!==TARGET.uuid))===identity(after),'OTHER_DATABASE_CHANGED');
}
export function validateReceipt(receipt,bytes){
 const k=keys(BACKUP_RUN);
 check(receipt?.format==='dream-exact-disposable-empty-backup-v1','RECEIPT_FORMAT_MISMATCH');
 check(receipt.source?.uuid===TARGET.uuid&&receipt.source?.name===TARGET.name,'RECEIPT_TARGET_MISMATCH');
 check(receipt.run===BACKUP_RUN&&receipt.key===k.sql,'RECEIPT_BACKUP_PATH_MISMATCH');
 check(receipt.productionWorker===WORKER&&receipt.deletePerformed===false,'RECEIPT_PRODUCTION_OR_DELETE_MISMATCH');
 check(receipt.activeReferences?.length===0&&receipt.historicalReferences?.length===0&&receipt.versionsInspected>=270,'RECEIPT_HISTORY_UNVERIFIED');
 check(receipt.sha256===sha(bytes)&&receipt.bytes===bytes.length,'BACKUP_HASH_MISMATCH');
 const restored=localEmptyRestore(bytes);
 check(receipt.localRestore?.schemaObjects===0&&restored.schemaObjects===0,'RESTORE_EVIDENCE_MISMATCH');
 return restored;
}
export function allowed(method,path){
 if(method==='DELETE')return path==='/d1/database/'+TARGET.uuid;
 if(method!=='GET')return false;
 if(path==='/d1/database?per_page=100'||path==='/d1/database/'+TARGET.uuid||
 path==='/workers/scripts/dream-team/deployments'||path==='/workers/scripts/dream-team/schedules'||
 path==='/workers/scripts/dream-team-d1-backup/schedules'||path==='/r2/buckets?per_page=1000')return true;
 return false;
}
async function main(){
 const report={result:'BLOCKED',mode:'PINNED_OWNER_APPROVED_ONE_D1_DELETE',target:TARGET.name,uuid:TARGET.uuid,
  backupRun:BACKUP_RUN,productionQueries:0,productionDeployments:0,backupWrites:0,otherResourceDeletes:0,
  databaseCreateCalls:0,databaseDeleteCalls:0};
 let dir=null,phase='OWNER_APPROVAL',attempted=false,callCount=0;
 const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 const call=async(method,path)=>{
  check(allowed(method,path),'OUT_OF_SCOPE_API_OPERATION');
  check(/^[a-f0-9]{32}$/.test(account||'')&&Boolean(token),'CLOUDFLARE_CREDENTIALS_REQUIRED');
  check(++callCount<=60,'API_CALL_BUDGET');
  if(method==='DELETE'){check(!attempted,'SECOND_DELETE_FORBIDDEN');attempted=true;report.databaseDeleteCalls=1;}
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,redirect:'error',
   headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(30000)});
  let data;try{data=await response.json();}catch{data=null;}
  if(!response.ok||data?.success!==true){
   const e=Error('CLOUDFLARE_OPERATION_FAILED');e.status=response.status;e.code=Number(data?.errors?.[0]?.code)||null;throw e;
  }
  return data;
 };
 const list=async()=>{
  const r=await call('GET','/d1/database?per_page=100');
  check(Array.isArray(r.result),'D1_LIST_INVALID');
  return r.result;
 };
 const stable=async()=>{
  const deployment=(await call('GET','/workers/scripts/dream-team/deployments')).result?.deployments?.[0];
  check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===WORKER,'PRODUCTION_WORKER_MOVED');
  const main=(await call('GET','/workers/scripts/dream-team/schedules')).result;
  const backup=(await call('GET','/workers/scripts/dream-team-d1-backup/schedules')).result;
  const buckets=(await call('GET','/r2/buckets?per_page=1000')).result?.buckets;
  check(Array.isArray(buckets),'BUCKET_LIST_INVALID');
  return {deployment,main,backup,bucketNames:buckets.map(x=>x.name).sort()};
 };
 const same=a=>JSON.stringify(a);
 try{
  check(process.env.EXACT_407032_DELETE_APPROVAL===APPROVAL,'EXACT_OWNER_APPROVAL_REQUIRED');
  check(TARGET.uuid!==productionId,'PRODUCTION_ID_FORBIDDEN');
  dir=await mkdtemp(join(tmpdir(),'dream-one-d1-delete-'));
  phase='PRIVATE_BACKUP_AND_LOCAL_RESTORE';
  const k=keys(BACKUP_RUN),source=join(dir,'schema.sql'),receiptPath=join(dir,'receipt.json');
  wrangler(['r2','object','get','dream-team-d1-backups/'+k.sql,'--remote','--file',source]);
  wrangler(['r2','object','get','dream-team-d1-backups/'+k.receipt,'--remote','--file',receiptPath]);
  const sql=await readFile(source),receiptBytes=await readFile(receiptPath),receipt=JSON.parse(receiptBytes);
  report.localRestore=validateReceipt(receipt,sql);
  phase='FRESH_EXACT_REFERENCE_AND_SCHEMA_SCAN';
  const evidence=await inspect();assertExactEmptySource(evidence);
  check(evidence.productionDeploymentId===receipt.productionDeploymentId,'PRODUCTION_DEPLOYMENT_CHANGED_FROM_BACKUP');
  const before=await list(),target=before.filter(d=>d.uuid===TARGET.uuid&&d.name===TARGET.name);
  check(before.length===10&&target.length===1&&target[0].file_size===12288,'TARGET_METADATA_MOVED');
  const direct=(await call('GET','/d1/database/'+TARGET.uuid)).result;
  check(direct?.name===TARGET.name&&direct.uuid===TARGET.uuid&&direct.file_size===12288,'DIRECT_TARGET_IDENTITY_MOVED');
  const prodBefore=await stable();
  check(prodBefore.deployment.id===receipt.productionDeploymentId,'PRODUCTION_DEPLOYMENT_CHANGED');
  phase='ONE_OWNER_APPROVED_DELETE';
  try{
   await call('DELETE','/d1/database/'+TARGET.uuid);
   report.deleteResponse='ACCEPTED';
  }catch(e){
   // An uncertain delete is NEVER retried; verify state with GET only.
   report.deleteResponse='UNCERTAIN';
   report.deleteError=e.status||'TRANSPORT';
  }
  phase='GET_ONLY_POST_DELETE_VALIDATION';
  let after;
  for(let i=0;i<5;i++){after=await list();if(!after.some(d=>d.uuid===TARGET.uuid||d.name===TARGET.name))break;
   if(i<4)await new Promise(ok=>setTimeout(ok,1000));
  }
  verifyOnlyOneRemoved(before,after);
  let missing=false;try{await call('GET','/d1/database/'+TARGET.uuid);}catch(e){if(e.status===404)missing=true;else throw e;}
  check(missing,'TARGET_ABSENCE_NOT_CONFIRMED');
  const prodAfter=await stable();
  check(same(prodBefore)===same(prodAfter),'PRODUCTION_SCHEDULE_OR_R2_MOVED');
  const sqlAgain=join(dir,'confirmed.sql'),receiptAgain=join(dir,'confirmed-receipt.json');
  wrangler(['r2','object','get','dream-team-d1-backups/'+k.sql,'--remote','--file',sqlAgain]);
  wrangler(['r2','object','get','dream-team-d1-backups/'+k.receipt,'--remote','--file',receiptAgain]);
  check(sha(await readFile(sqlAgain))===sha(sql)&&sha(await readFile(receiptAgain))===sha(receiptBytes),'PRIVATE_BACKUP_NOT_RETAINED');
  Object.assign(report,{result:'PASS',d1Before:10,d1After:9,targetAbsent:true,otherDatabasesPreserved:'PASS',
   productionUnchanged:'PASS',r2BucketsPreserved:'PASS',privateBackupRetained:'PASS',historicalVersionsInspected:evidence.versionsInspected});
 }catch(e){report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'DELETE_VERIFICATION_FAILED',
  ...(e.status?{httpStatus:e.status}:{})};process.exitCode=1;}
 finally{
  if(dir)await rm(dir,{recursive:true,force:true});
  await mkdir('disposable-delete-status',{recursive:true});
  await writeFile('disposable-delete-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});
  console.log('EXACT_D1_RETIREMENT '+JSON.stringify(report));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
