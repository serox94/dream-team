// Read-only retirement evidence for the aborted PR23 release's disposable D1.
// No DELETE, database creation, production query, export, R2 write or deploy.
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const TARGET_NAME='dream-team-audit-4070321412132-db';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const PREFIX='/accounts/'+ACCOUNT;
const SQL="SELECT type,name FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY type,name";
const BACKUP_PREFIX='private-releases/code32/40703214121-179da4d9/';
const check=(ok,code)=>{if(!ok)throw Error(code);};
const uuidPattern=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

export function referencesTarget(bindings,uuid,name=TARGET_NAME){
 return Array.isArray(bindings)&&bindings.some(b=>
   (b.type==='d1'&&(b.id===uuid||b.database_id===uuid||b.database_name===name))||
   (b.type==='plain_text'&&typeof b.text==='string'&&(b.text.includes(uuid)||b.text.includes(name)))
 );
}
export function requestAllowed(method,path,body,uuid){
 if(method==='POST')return uuidPattern.test(uuid||'')&&path===PREFIX+'/d1/database/'+uuid+'/query'&&body?.sql===SQL&&Array.isArray(body.params)&&body.params.length===0;
 if(method!=='GET'||body!==undefined)return false;
 if(path===PREFIX+'/d1/database?per_page=100'||path===PREFIX+'/d1/database/'+uuid||path===PREFIX+'/workers/scripts'||path===PREFIX+'/workers/scripts/dream-team/deployments')return true;
 if(path===PREFIX+'/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix='+encodeURIComponent(BACKUP_PREFIX))return true;
 const base=PREFIX+'/workers/scripts/';
 return /^dream-team[a-z0-9-]*$/.test(path.slice(base.length).split('/')[0])&&
  (new RegExp('^'+base+'dream-team[a-z0-9-]*/settings$').test(path)||
   new RegExp('^'+base+'dream-team[a-z0-9-]*/versions\\?deployable=true$').test(path)||
   new RegExp('^'+base+'dream-team[a-z0-9-]*/versions/[a-f0-9-]{36}$').test(path));
}

export async function inspect({fetcher=fetch,account=ACCOUNT,token=TOKEN,maxCalls=750}={}){
 check(/^[a-f0-9]{32}$/.test(account||'')&&Boolean(token),'CREDENTIALS_REQUIRED');
 // This script is intentionally pinned to this Cloudflare account's existing token;
 // tests inject a fetcher, not a different account.
 check(account===ACCOUNT,'ACCOUNT_CHANGED');
 let calls=0,reads=0,targetId=null;
 const request=async(method,path,body)=>{
  check(requestAllowed(method,path,body,targetId),'READ_ONLY_ENDPOINT_REQUIRED');
  check(++calls<=maxCalls,'CONTROL_PLANE_BUDGET');
  if(method==='POST')reads++;
  const res=await fetcher('https://api.cloudflare.com/client/v4'+path,{method,redirect:'error',
   headers:{authorization:'Bearer '+token,accept:'application/json','content-type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const json=await res.json();
  check(res.ok&&json.success===true,'CLOUDFLARE_READ_FAILED');
  return json.result;
 };
 const list=await request('GET',PREFIX+'/d1/database?per_page=100');
 check(Array.isArray(list)&&list.length===10,'D1_CAPACITY_CHANGED');
 const matches=list.filter(x=>x.name===TARGET_NAME);
 check(matches.length===1&&uuidPattern.test(matches[0].uuid),'TARGET_IDENTITY_UNCONFIRMED');
 targetId=matches[0].uuid;
 const detail=await request('GET',PREFIX+'/d1/database/'+targetId);
 check(detail.uuid===targetId&&detail.name===TARGET_NAME,'TARGET_METADATA_MOVED');
 const workers=await request('GET',PREFIX+'/workers/scripts');
 check(Array.isArray(workers)&&workers.length<=20,'WORKER_LIST_UNVERIFIED');
 const active=[],history=[];let planned=0;
 const selected=workers.filter(x=>/^dream-team[a-z0-9-]*$/.test(x.id||''));
 check(selected.length===workers.length,'WORKER_LIST_INCOMPLETE');
 for(const w of selected){
  const settings=await request('GET',PREFIX+'/workers/scripts/'+w.id+'/settings');
  check(Array.isArray(settings?.bindings),'ACTIVE_BINDINGS_UNVERIFIED');
  if(referencesTarget(settings.bindings,targetId))active.push(w.id);
 }
 for(const w of selected){
  const result=await request('GET',PREFIX+'/workers/scripts/'+w.id+'/versions?deployable=true');
  check(Array.isArray(result?.items)&&result.items.length<=100,'VERSION_LIST_UNVERIFIED');
  planned+=result.items.length;check(planned<=700,'HISTORY_BUDGET');
  for(const ver of result.items){
   check(uuidPattern.test(ver.id||''),'HISTORY_ID_UNVERIFIED');
   const full=await request('GET',PREFIX+'/workers/scripts/'+w.id+'/versions/'+ver.id);
   check(Array.isArray(full?.resources?.bindings),'HISTORY_BINDINGS_UNVERIFIED');
   if(referencesTarget(full.resources.bindings,targetId))history.push({worker:w.id,version:ver.id});
  }
 }
 const schema=await request('POST',PREFIX+'/d1/database/'+targetId+'/query',{sql:SQL,params:[]});
 check(Array.isArray(schema)&&Array.isArray(schema[0]?.results),'TARGET_SCHEMA_UNVERIFIED');
 const rows=schema[0].results;
 const backups=await request('GET',PREFIX+'/r2/buckets/dream-team-d1-backups/objects?per_page=100&prefix='+encodeURIComponent(BACKUP_PREFIX));
 const objects=Array.isArray(backups?.objects)?backups.objects:Array.isArray(backups)?backups:null;
 check(Array.isArray(objects)&&!backups?.cursor,'SOURCE_BACKUP_INVENTORY_INCOMPLETE');
 const production=await request('GET',PREFIX+'/workers/scripts/dream-team/deployments');
 const deployment=production?.deployments?.[0];
 check(deployment?.versions?.length===1&&deployment.versions[0].percentage===100,'PRODUCTION_DEPLOYMENT_UNVERIFIED');
 return {result:'PASS',mode:'TARGETED_READ_ONLY',target:{name:TARGET_NAME,uuid:targetId,sizeBytes:detail.file_size},
  d1Count:list.length,activeReferences:active,historicalReferences:history,versionsInspected:planned,
  schemaObjects:rows.map(x=>({type:x.type,name:x.name})),schemaObjectsCount:rows.length,
  sourceReleaseBackup:{run:'40703214121',schemaSqlListed:objects.some(x=>x.key===BACKUP_PREFIX+'schema32.sql'),targetDatabaseBackup:false},
  productionWorker:deployment.versions[0].version_id,productionDeploymentId:deployment.id,
  safeToDelete:'NOT_AUTHORIZED',requiresSeparateTargetBackup:true,
  operations:{controlPlaneCalls:calls,targetReadOnlySqlCalls:reads,productionSqlCalls:0,deleteCalls:0,createCalls:0,deployCalls:0,backupWrites:0}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let report;
 try{report=await inspect();}
 catch(error){report={result:'BLOCKED',mode:'TARGETED_READ_ONLY',error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'UNVERIFIED',targetName:TARGET_NAME,deleteCalls:0,createCalls:0,deployCalls:0};process.exitCode=1;}
 await mkdir('readonly-target-status',{recursive:true});
 await writeFile('readonly-target-status/summary.json',JSON.stringify(report,null,2),{mode:0o600});
 console.log('TARGETED_D1_READONLY '+JSON.stringify(report));
}
