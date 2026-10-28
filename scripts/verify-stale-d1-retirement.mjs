// Verification of accepted DELETE run40698850977. Only GET; no SQL or mutations.
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {wrangler,sha} from './recovery-common.mjs';import {TARGET} from './prepare-stale-d1-backup.mjs';import {BACKUP,validateRecovery,guardedClient} from './delete-approved-stale-d1.mjs';
const EXPECTED_WORKER='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const NAMES=['dream-team-audit-4041643103232-db','dream-team-audit-40241458807931-db','dream-team-audit-3990506121731-db','dream-team-audit-2026102331-db','dream-team-audit-2026102231-db','dream-team-audit-39580535456-db','dream-team-audit-39576994645-db','dream-team-preview-db','dream-team-db'].sort();
const check=(ok,code)=>{if(!ok)throw Error(code);};const canon=x=>Array.isArray(x)?x.map(canon):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canon(x[k])])):x;const digest=x=>sha(Buffer.from(JSON.stringify(canon(x))));
export function verifyRemaining(data){
 check(Array.isArray(data?.result)&&data.result.length===9,'EXPECTED_NINE_DATABASES');
 check(!data.result.some(d=>d.uuid===TARGET.id||d.name===TARGET.name),'DELETED_TARGET_PRESENT');
 check(JSON.stringify(data.result.map(d=>d.name).sort())===JSON.stringify(NAMES),'OTHER_DATABASE_NAME_CHANGED');
 check(new Set(data.result.map(d=>d.uuid)).size===9,'DATABASE_IDENTITY_DUPLICATE');
 return {actualCount:9,apiCountMetadata:Number.isInteger(data.result_info?.total_count)?data.result_info.total_count:null,countMetadataConsistent:!Number.isInteger(data.result_info?.total_count)||data.result_info.total_count===9};
}
export function readOnly(client){return async path=>client.request('GET',path);}
async function main(){
 const report={result:'BLOCKED',mode:'POST_DELETE_READ_ONLY',acceptedDeleteRun:'40698850977',deleteRequests:0,sqlQueries:0,productionWrites:0,backupWrites:0,workerDeployments:0,approvalChanges:0};
 const dir=await mkdtemp(join(tmpdir(),'dream-retirement-verify-'));let phase='NINE_DATABASE_INVENTORY';
 const client=guardedClient({account:process.env.CLOUDFLARE_ACCOUNT_ID,token:process.env.CLOUDFLARE_API_TOKEN}),get=readOnly(client);
 const state=async()=>{
  const result=async p=>(await get(p)).result;
  const deployment=(await result('/workers/scripts/dream-team/deployments')).deployments?.[0];
  check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===EXPECTED_WORKER,'PRODUCTION_WORKER_CHANGED');
  return {deployment,settings:await result('/workers/scripts/dream-team/settings'),mainSchedule:await result('/workers/scripts/dream-team/schedules'),backupSchedule:await result('/workers/scripts/dream-team-d1-backup/schedules'),buckets:await result('/r2/buckets?per_page=1000')};
 };
 const backup=async suffix=>{const file=join(dir,suffix);wrangler(['r2','object','get','dream-team-d1-backups/'+BACKUP.prefix+suffix,'--remote','--file',file]);return readFile(file);};
 try{
  const first=await get('/d1/database?per_page=100');report.d1=verifyRemaining(first);
  phase='DIRECT_TARGET_NOT_FOUND';
  let absent=false;try{await get('/d1/database/'+TARGET.id);}catch(e){if(e.status===404){absent=true;report.targetLookup={httpStatus:404,...(Number.isInteger(e.code)?{cloudflareCode:e.code}:{})};}else throw e;}
  check(absent,'DIRECT_TARGET_ABSENCE_NOT_CONFIRMED');
  phase='PRODUCTION_AND_BACKUP';const before=await state();
  const sql=await backup('schema.sql'),receiptBytes=await backup('receipt.json'),receipt=JSON.parse(receiptBytes.toString());
  const restored=validateRecovery(receipt,sql);
  phase='FINAL_READ_ONLY_CONFIRMATION';
  const last=await get('/d1/database?per_page=100');report.finalD1=verifyRemaining(last);
  const ids=data=>data.result.map(d=>({uuid:d.uuid,name:d.name})).sort((a,b)=>a.uuid.localeCompare(b.uuid));
  check(digest(ids(first))===digest(ids(last)),'REMAINING_DATABASE_IDENTITIES_MOVED');
  check(digest(await state())===digest(before),'PRODUCTION_SCHEDULE_OR_BUCKET_CHANGED');
  check(sha(await backup('schema.sql'))===BACKUP.hash&&sha(await backup('receipt.json'))===sha(receiptBytes),'BACKUP_NOT_RETAINED');
  Object.assign(report,{result:'PASS',targetAbsent:true,remainingDatabaseNames:NAMES,d1After:9,privateBackupRetained:'PASS',backupSha256:BACKUP.hash,actualLocalRestore:'PASS',backupTables:restored.summary.tables,backupRows:restored.summary.rows,productionUnchanged:'PASS',activeProductionWorker:EXPECTED_WORKER,schedulesUnchanged:'PASS',r2BucketInventoryUnchanged:'PASS'});
 }catch(e){report.failure={phase,error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'VERIFICATION_FAILED',...(e.status?{httpStatus:e.status}:{}),...(Number.isInteger(e.code)?{cloudflareCode:e.code}:{})};process.exitCode=1;}
 finally{report.operations=client.stats;await rm(dir,{recursive:true,force:true});await mkdir('retirement-verify-status',{recursive:true});await writeFile('retirement-verify-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});console.log('STALE_RETIREMENT_VERIFY '+JSON.stringify(report));}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
