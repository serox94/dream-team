// Owner-approved single-run isolated probe of PR23 private R2 gateway.
// Mutations: create + delete ONE newly named temporary Worker; writes only to
// dream-team-audit-4072485184932-media / dream-team-audit-4072485184932-archive.
// Neither production R2 nor any D1 is bound, queried or modified.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const MEDIA='dream-team-audit-4072485184932-media';
export const ARCHIVE='dream-team-audit-4072485184932-archive';
export const SOURCE_WORKER='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const UUID=/^[0-9a-f]{32}$/;
const check=(ok,code)=>{if(!ok)throw Error(code);};
const SHA=b=>createHash('sha256').update(b).digest('hex');
const ioName=run=>'dream-team-audit-'+run+'-io';
const permittedCodes=new Set(['SOURCE_CHANGED','COPY_MISMATCH','NO_MANIFEST','ARCHIVE_MISMATCH','RESTORE_MISMATCH','RECOVERY_FAILED']);
const safeValue=s=>typeof s==='string'&&/^[A-Z0-9_]{1,64}$/.test(s)?s:null;
const safeStatus=v=>Number.isInteger(v)&&v>=100&&v<=599?v:null;
const safeNumber=v=>Number.isSafeInteger(Number(v))&&Number(v)>=0?Number(v):null;

export function allowedApi({method,path,account,name}){
 const p='/accounts/'+account;
 if(method==='GET')return [
  p+'/workers/scripts',p+'/workers/scripts/'+name+'/settings',
  p+'/workers/scripts/dream-team/deployments',p+'/workers/subdomain',
  p+'/r2/buckets?per_page=1000',
  p+'/r2/buckets/'+MEDIA+'/objects?per_page=100',
  p+'/r2/buckets/'+ARCHIVE+'/objects?per_page=100'
 ].includes(path);
 if(method==='PUT')return path===p+'/workers/scripts/'+name;
 if(method==='POST')return path===p+'/workers/scripts/'+name+'/subdomain';
 if(method==='DELETE')return path===p+'/workers/scripts/'+name;
 return false;
}
export function metadataBindings(media=MEDIA,archive=ARCHIVE,key){
 check(media===MEDIA&&archive===ARCHIVE,'ONLY_APPROVED_TEST_BUCKETS');
 check(typeof key==='string'&&/^[a-f0-9]{64}$/.test(key),'RANDOM_GATE_REQUIRED');
 return [
  {type:'r2_bucket',name:'SOURCE',bucket_name:media},
  {type:'r2_bucket',name:'ARCHIVE',bucket_name:archive},
  {type:'r2_bucket',name:'RESTORED',bucket_name:media},
  {type:'secret_text',name:'RECOVERY_KEY',text:key}
 ];
}
export function verifyR2Bindings(bindings){
 check(Array.isArray(bindings),'WORKER_SETTINGS_MISSING');
 const actual=bindings.filter(b=>b.type==='r2_bucket').map(b=>[b.name,b.bucket_name]).sort((a,b)=>a[0].localeCompare(b[0]));
 check(JSON.stringify(actual)===JSON.stringify([
  ['ARCHIVE',ARCHIVE],['RESTORED',MEDIA],['SOURCE',MEDIA]
 ]),'DISALLOWED_R2_BINDING');
 check(!bindings.some(b=>b.type==='d1'),'NO_D1_BINDINGS_ALLOWED');
 check(!bindings.some(b=>b.type==='r2_bucket'&&b.bucket_name!==MEDIA&&b.bucket_name!==ARCHIVE),'PRODUCTION_BUCKET_FORBIDDEN');
}
export function assertInitialInventory({buckets,scripts,name}){
 check(Array.isArray(buckets?.buckets)&&Array.isArray(scripts),'INVENTORY_INVALID');
 check([MEDIA,ARCHIVE].every(n=>buckets.buckets.some(b=>b.name===n)),'TEST_BUCKET_ABSENT');
 check(!scripts.some(w=>w.id===name),'TEMP_WORKER_ALREADY_EXISTS');
}
export function assertEmptyBucket(record){
 const a=Array.isArray(record?.objects)?record.objects:Array.isArray(record)?record:null;
 check(Array.isArray(a)&&a.length===0&&!record?.cursor&&!record?.truncated,'TEST_BUCKET_NOT_EMPTY');
}
function summarizeError(e,phase){
 return {phase,error:safeValue(e?.message)||'ISOLATED_PROBE_FAILED',
  ...(safeStatus(e?.httpStatus??e?.status)?{httpStatus:safeStatus(e.httpStatus??e.status)}:{}),
  ...(safeNumber(e?.cloudflareCode)!==null?{cloudflareCode:safeNumber(e.cloudflareCode)}:{})};
}
export async function probe({run=process.env.GITHUB_RUN_ID,account=process.env.CLOUDFLARE_ACCOUNT_ID,
 token=process.env.CLOUDFLARE_API_TOKEN,fetcher=fetch,workerSource=undefined,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 check(/^\d{6,20}$/.test(String(run||'')),'RUN_ID_REQUIRED');
 check(UUID.test(account||'')&&Boolean(token),'CREDENTIALS_REQUIRED');
 const name=ioName(run), p='/accounts/'+account,endpoint='https://api.cloudflare.com/client/v4';
 let phase='PRECHECK',calls=0,uploaded=false,uploadAttempted=false,deleteAttempts=0,originalDeployment=null,cleanup=null;
 let succeeded=false,body,workerUrl,backupResult;
 const operations={workerUploads:0,workerDeletes:0,workerSubdomainUpdates:0,
  productionD1Queries:0,databaseCreates:0,databaseDeletes:0,productionWorkerUpdates:0,productionR2Reads:0,productionR2Writes:0};
 const control=async(method,path,{payload=undefined,form=undefined}={})=>{
  check(allowedApi({method,path,account,name}),'UNAPPROVED_CONTROL_OPERATION');
  check(++calls<=40,'CONTROL_CALL_BUDGET');
  const headers={authorization:'Bearer '+token,accept:'application/json'};
  if(payload!==undefined)headers['content-type']='application/json';
  const opts={method,redirect:'error',headers,body:form??(payload===undefined?undefined:JSON.stringify(payload)),signal:AbortSignal.timeout(30000)};
  let response;
  try{response=await fetcher(endpoint+path,opts);}catch{throw Error('CONTROL_TRANSPORT_FAILED');}
  let json;try{json=await response.json();}catch{json=null;}
  if(!response.ok||json?.success!==true){
   const e=Error('CONTROL_API_FAILURE');e.httpStatus=response.status;
   e.cloudflareCode=safeNumber(json?.errors?.[0]?.code);throw e;
  }
  return json.result;
 };
 const findWorker=async()=>{
  const scripts=await control('GET',p+'/workers/scripts');
  check(Array.isArray(scripts),'WORKER_LIST_MISSING');
  return scripts.some(w=>w.id===name);
 };
 const deployment=async()=>{
  const d=(await control('GET',p+'/workers/scripts/dream-team/deployments'))?.deployments?.[0];
  check(d?.versions?.length===1&&d.versions[0].percentage===100&&d.versions[0].version_id===SOURCE_WORKER,
   'PRODUCTION_DEPLOYMENT_CHANGED');
  return d.id;
 };
 const listBucket=async(bucket)=>control('GET',p+'/r2/buckets/'+bucket+'/objects?per_page=100');
 const response=async(path,method,key)=>{
  const opts={method,redirect:'error',headers:{'x-recovery-key':key},signal:AbortSignal.timeout(12000)};
  let r;try{r=await fetcher(workerUrl+path,opts);}catch{const e=Error('WORKER_HTTP_TRANSPORT_FAILED');throw e;}
  let json;try{json=await r.json();}catch{json=null;}
  if(!r.ok||!json?.ok){const e=Error('WORKER_RESPONSE_FAILED');e.httpStatus=r.status;
   e.safeWorkerCode=permittedCodes.has(json?.error)?json.error:null;throw e;}
  return json;
 };
 const report={result:'BLOCKED',mode:'APPROVED_TWO_BUCKET_ISOLATED_R2_PROBE',
  fromFailedRun:'40724851849',temporaryWorker:name,approvedBuckets:[MEDIA,ARCHIVE],
  productionWorker:SOURCE_WORKER,initialTestBucketsEmpty:null,
  phase:'PRECHECK',operations,backupResult:null,failure:null,cleanup:null};
 try{
  originalDeployment=await deployment();
  const [buckets,scripts,mediaBefore,archiveBefore]=await Promise.all([
   control('GET',p+'/r2/buckets?per_page=1000'),
   control('GET',p+'/workers/scripts'),
   listBucket(MEDIA),listBucket(ARCHIVE)
  ]);
  assertInitialInventory({buckets,scripts,name});
  assertEmptyBucket(mediaBefore);assertEmptyBucket(archiveBefore);report.initialTestBucketsEmpty=true;
  phase='PREPARE_EXACT_SOURCE';
  const source=workerSource??await readFile(new URL('./restore-io-worker.js',import.meta.url));
  check(SHA(source)==='f79f147cf0c7f2507f54ce153a2b5936e456902435a95f6a4e775c513ee6549ec','SOURCE_WORKER_SCRIPT_CHANGED');
  const key=randomBytes(32).toString('hex');
  const metadata={main_module:'main.mjs',compatibility_date:'2026-10-01',
   bindings:metadataBindings(MEDIA,ARCHIVE,key)};
  const form=new FormData();
  form.append('metadata',JSON.stringify(metadata));
  form.append('main.mjs',new Blob([source],{type:'application/javascript+module'}),'main.mjs');
  phase='WORKER_UPLOAD';uploadAttempted=true;operations.workerUploads++;
  await control('PUT',p+'/workers/scripts/'+name,{form});uploaded=true;
  phase='WORKER_BINDINGS';
  verifyR2Bindings((await control('GET',p+'/workers/scripts/'+name+'/settings'))?.bindings);
  phase='WORKER_SUBDOMAIN';
  operations.workerSubdomainUpdates++;
  await control('POST',p+'/workers/scripts/'+name+'/subdomain',{payload:{enabled:true}});
  phase='WORKER_DOMAIN';
  const subdomain=(await control('GET',p+'/workers/subdomain'))?.subdomain;
  check(typeof subdomain==='string'&&/^[a-z0-9-]+$/.test(subdomain),'SUBDOMAIN_UNAVAILABLE');
  workerUrl='https://'+name+'.'+subdomain+'.workers.dev';
  phase='WORKER_READY';
  let ready=false,last;
  for(let i=0;i<6;i++){
   try{last=await response('/ready','GET',key);if(last.bindingsReady===true){ready=true;break;}}
   catch(e){if(i===5)throw e;}
   if(i<5)await pause(1000);
  }
  check(ready,'WORKER_NOT_READY');
  phase='EMPTY_MEDIA_BACKUP';
  backupResult=await response('/backup','POST',key);
  check(backupResult.objects===0&&/^[a-f0-9]{64}$/.test(backupResult.manifestSha256),'BACKUP_RESPONSE_INVALID');
  phase='R2_MANIFEST_CHECK';
  const a=await listBucket(ARCHIVE);
  check(Array.isArray(a?.objects)&&a.objects.length===1&&a.objects[0].key==='manifest.json'&&!a.cursor,
   'MANIFEST_NOT_CREATED');
  const m=await listBucket(MEDIA);assertEmptyBucket(m);
  report.backupResult={emptyObjects:0,manifestWrittenToApprovedArchive:true};
  succeeded=true;
 }catch(e){report.failure=summarizeError(e,phase);
  if(e?.safeWorkerCode)report.failure.safeWorkerCode=e.safeWorkerCode;
 }finally{
  // Try to delete this exact new Worker even if upload threw after partial creation.
  phase='CLEANUP_TEMP_WORKER';
  try{
   const exists=await findWorker();
   if(exists){
    check(uploadAttempted,'UNAPPROVED_PREEXISTING_WORKER');
    check(++deleteAttempts===1,'SECOND_WORKER_DELETE_FORBIDDEN');
    operations.workerDeletes++;
    await control('DELETE',p+'/workers/scripts/'+name);
   }
   const stillExists=await findWorker();
   check(!stillExists,'TEMP_WORKER_STILL_PRESENT');
   cleanup={result:'PASS',temporaryWorkerRemoved:true,deleteAttempts};
  }catch(e){cleanup={result:'BLOCKED',...summarizeError(e,'CLEANUP_TEMP_WORKER'),deleteAttempts};}
  try{
   const after=await deployment();
   check(after===originalDeployment,'PRODUCTION_DEPLOYMENT_CHANGED');
   cleanup.productionUnchanged=true;
  }catch(e){cleanup.productionUnchanged=false;cleanup.verificationError=summarizeError(e,'VERIFY_PRODUCTION');}
  report.cleanup=cleanup;
  report.phase=report.failure?.phase??'COMPLETE';
  report.operations.controlPlaneCalls=calls;
  report.result=succeeded&&cleanup.result==='PASS'&&cleanup.productionUnchanged?'PASS':'BLOCKED';
 }
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let report;
 try{report=await probe();}catch(e){report={result:'BLOCKED',error:safeValue(e.message)||'PRECHECK_FAILED',workerCreated:'NOT_ATTEMPTED'};process.exitCode=1;}
 if(report.result!=='PASS')process.exitCode=1;
 await mkdir('r2-gateway-probe-status',{recursive:true});
 await writeFile('r2-gateway-probe-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log('R2_GATEWAY_PROBE '+JSON.stringify(report));
}
