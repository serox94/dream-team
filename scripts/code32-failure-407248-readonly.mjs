// Narrow read-only triage of failed PR23 schema32 prepare (run 40724851849).
// Only exact D1 SELECTs and control-plane GETs. No export, creation, deletion or deployment.
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const TARGET='dream-team-audit-4072485184932-db';
export const RUN='40724851849';
const ROOT='https://api.cloudflare.com/client/v4';
const PREFIX='private-releases/code32/'+RUN+'-179da4d9/';
const ALLOWED_PRODUCTION='81f011a2-ba96-4bdf-b199-10e89f8271e4';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const IDENT=/^[A-Za-z_][A-Za-z0-9_]*$/;
const SCHEMA="SELECT name,type FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY type,name";
const check=(v,code)=>{if(!v)throw Error(code);};
const escapeId=s=>'"'+s.replaceAll('"','""')+'"';
export function readAllowed(method,path,body,id,account){
 const base='/accounts/'+account;
 if(method==='GET'&&body===undefined){
  if([base+'/d1/database?per_page=100',base+'/d1/database/'+id,base+'/workers/scripts',
   base+'/workers/scripts/dream-team/deployments',base+'/r2/buckets?per_page=1000',
   base+'/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix='+encodeURIComponent(PREFIX)].includes(path))return true;
  if(path===base+'/workers/scripts/dream-team/settings')return true;
  if([base+'/r2/buckets/dream-team-audit-'+RUN+'32-media/objects?per_page=100',
      base+'/r2/buckets/dream-team-audit-'+RUN+'32-archive/objects?per_page=100',
      base+'/r2/buckets/dream-team-media/objects?per_page=100'].includes(path))return true;
  return false;
 }
 if(method!=='POST'||path!==base+'/d1/database/'+id||!UUID.test(id||''))return false;
 return false;
}
export function sqlAllowed(sql){
 return sql===SCHEMA||/^SELECT COUNT\(\*\) AS n FROM "[A-Za-z_][A-Za-z0-9_]*"$/.test(sql)||
  sql==="SELECT value FROM app_settings WHERE key='schema_version'";
}
export function classifyState({tables,rows,objects,buckets}){
 // Observational classification only; NEVER infer an exact failure site from this.
 return {
  snapshotSqlInR2:objects.some(x=>x.name==='schema32.sql'),
  receiptInR2:objects.some(x=>x.name==='receipt.json'),
  userTables:tables,
  countedRows:rows,
  mediaBucketPresent:buckets.includes('dream-team-audit-'+RUN+'32-media'),
  archiveBucketPresent:buckets.includes('dream-team-audit-'+RUN+'32-archive'),
  exactFailurePhase:'NOT_PROVEN_BY_METADATA'
 };
}
export async function inspect({account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,fetcher=fetch}={}){
 check(/^[a-f0-9]{32}$/.test(account||'')&&Boolean(token),'CREDENTIALS_REQUIRED');
 let calls=0,sqlReads=0,target=null;
 const req=async(method,path,body)=>{
  const base='/accounts/'+account;
  const isQuery=method==='POST'&&path===base+'/d1/database/'+target+'/query'&&
    UUID.test(target||'')&&body&&Array.isArray(body.params)&&body.params.length===0&&sqlAllowed(body.sql);
  check(isQuery||readAllowed(method,path,body,target,account),'UNAPPROVED_OPERATION');
  check(++calls<=105,'REQUEST_BUDGET');
  if(isQuery)sqlReads++;
  const response=await fetcher(ROOT+path,{method,redirect:'error',headers:{authorization:'Bearer '+token,accept:'application/json','content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  let json;try{json=await response.json();}catch{json=null;}
  if(!response.ok||json?.success!==true){let e=Error('CLOUDFLARE_READ_FAILED');e.status=response.status;e.cloudflareCode=Number(json?.errors?.[0]?.code)||null;throw e;}
  return json.result;
 };
 const base='/accounts/'+account;
 const dbs=await req('GET',base+'/d1/database?per_page=100');
 check(Array.isArray(dbs)&&dbs.length===10,'D1_LIST_MOVED');
 const matches=dbs.filter(d=>d.name===TARGET);
 check(matches.length===1&&UUID.test(matches[0].uuid),'TARGET_IDENTITY_UNCONFIRMED');
 target=matches[0].uuid;
 const meta=await req('GET',base+'/d1/database/'+target);
 check(meta.name===TARGET&&meta.uuid===target,'D1_TARGET_MOVED');
 const deployment=(await req('GET',base+'/workers/scripts/dream-team/deployments')).deployments?.[0];
 check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100&&deployment.versions[0].version_id===ALLOWED_PRODUCTION,'PRODUCTION_WORKER_MOVED');
 const settings=await req('GET',base+'/workers/scripts/dream-team/settings');
 check(Array.isArray(settings?.bindings)&&!settings.bindings.some(b=>b.type==='d1'&&b.id===target),'TARGET_BOUND_TO_PRODUCTION');
 const q=async sql=>{
  const raw=await req('POST',base+'/d1/database/'+target+'/query',{sql,params:[]});
  check(Array.isArray(raw)&&Array.isArray(raw[0]?.results),'D1_QUERY_SHAPE_CHANGED');
  return raw[0].results;
 };
 const schema=await q(SCHEMA),tables=schema.filter(x=>x.type==='table').map(x=>x.name);
 check(tables.length<=80&&tables.every(x=>IDENT.test(x)),'D1_SCHEMA_UNEXPECTED');
 const counts={};
 for(const table of tables){const r=await q('SELECT COUNT(*) AS n FROM '+escapeId(table));check(Number.isSafeInteger(r[0]?.n),'D1_ROWCOUNT_UNVERIFIED');counts[table]=r[0].n;}
 let schemaVersion=null;if(tables.includes('app_settings')){
  const v=await q("SELECT value FROM app_settings WHERE key='schema_version'");
  schemaVersion=v[0]?.value??null;
 }
 const obj=await req('GET',base+'/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix='+encodeURIComponent(PREFIX));
 const entries=Array.isArray(obj?.objects)?obj.objects:Array.isArray(obj)?obj:null;
 check(Array.isArray(entries)&&!obj?.cursor,'BACKUP_LIST_INCOMPLETE');
 const objects=entries.filter(o=>[PREFIX+'schema32.sql',PREFIX+'receipt.json'].includes(o.key))
  .map(o=>({name:o.key.slice(PREFIX.length),sizeBytes:Number(o.size)||0}));
 const b=await req('GET',base+'/r2/buckets?per_page=1000');
 check(Array.isArray(b?.buckets),'R2_BUCKETS_UNVERIFIED');
 const buckets=b.buckets.filter(x=>x.name?.startsWith('dream-team-audit-'+RUN)).map(x=>x.name);
 const bucketInventory={};
 for(const kind of ['media','archive']){
  const name='dream-team-audit-'+RUN+'32-'+kind;
  if(!buckets.includes(name)){bucketInventory[kind]={present:false};continue;}
  const listing=await req('GET',base+'/r2/buckets/'+name+'/objects?per_page=100');
  const records=Array.isArray(listing?.objects)?listing.objects:Array.isArray(listing)?listing:null;
  check(Array.isArray(records),'R2_OBJECTS_UNVERIFIED');
  bucketInventory[kind]={present:true,objectsOnFirstPage:records.length,
   totalBytesOnFirstPage:records.reduce((n,x)=>n+Number(x.size||0),0),
   manifestPresent:records.some(x=>x.key==='manifest.json'||x.name==='manifest.json'),
   returnedObjectFieldNames:records.length?Object.keys(records[0]).sort():[],
   completeFirstPage:!listing?.cursor&&!listing?.truncated};
 }
 const sourcePage=await req('GET',base+'/r2/buckets/dream-team-media/objects?per_page=100');
 const sourceItems=Array.isArray(sourcePage?.objects)?sourcePage.objects:Array.isArray(sourcePage)?sourcePage:null;
 check(Array.isArray(sourceItems),'SOURCE_MEDIA_METADATA_UNAVAILABLE');
 const mediaReadOnly={firstPageObjects:sourceItems.length,firstPageBytes:sourceItems.reduce((n,x)=>n+Number(x.size||0),0),
   morePages:Boolean(sourcePage?.cursor||sourcePage?.truncated),
   releaseObjectLimit:100,releaseSizeLimitBytes:200*1024*1024};
 mediaReadOnly.firstPageExceedsSizeLimit=mediaReadOnly.firstPageBytes>mediaReadOnly.releaseSizeLimitBytes;
 mediaReadOnly.objectLimitPotentiallyExceeded=sourceItems.length===100&&mediaReadOnly.morePages;
 const workers=await req('GET',base+'/workers/scripts');
 check(Array.isArray(workers),'WORKERS_UNVERIFIED');
 const total=Object.values(counts).reduce((a,b)=>a+b,0);
 return {result:'PASS',mode:'FAILED_RELEASE_READ_ONLY',failedRun:RUN,
  target:{name:TARGET,uuid:target,sizeBytes:meta.file_size},d1Count:dbs.length,
  productionWorker:deployment.versions[0].version_id,productionDeploymentId:deployment.id,
  schemaVersion,tableCount:tables.length,tableRowCounts:counts,totalUserRows:total,
  schemaObjectCount:schema.length,backupObjects:objects,bucketsCreatedByRun:buckets,bucketInventory,productionMediaMetadataOnly:mediaReadOnly,
  privateIoWorkerStillPresent:workers.some(x=>x.id==='dream-team-audit-'+RUN+'-io'),
  findings:classifyState({tables:tables.length,rows:total,objects,buckets}),
  limits:{controlPlaneRequests:calls,targetSelectQueries:sqlReads,productionSqlQueries:0,databaseCreates:0,databaseDeletes:0,r2Writes:0,workerDeployments:0}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=await inspect();}catch(e){result={result:'BLOCKED',mode:'FAILED_RELEASE_READ_ONLY',failedRun:RUN,
  error:/^[A-Z0-9_]+$/.test(e.message)?e.message:'UNSPECIFIED_READ_ERROR',status:e.status||undefined,cloudflareCode:e.cloudflareCode||undefined,
  writes:0,deletes:0,deployments:0};process.exitCode=1;}
 await mkdir('code32-failure-triage',{recursive:true});
 await writeFile('code32-failure-triage/summary.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log('CODE32_FAILURE_TRIAGE '+JSON.stringify(result));
}
