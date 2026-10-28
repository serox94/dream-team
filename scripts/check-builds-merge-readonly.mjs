// Metadata-only proof of Cloudflare Builds auto deployment behavior before PR26 merge.
// No uploads, no triggers, no permission changes. Never print raw hook/command metadata.
import {mkdir,writeFile} from 'node:fs/promises';
const BASE='https://api.cloudflare.com/client/v4/accounts/';
const check=(x,code)=>{if(!x)throw Error(code);};
const report={result:'BLOCKED',mode:'CLOUDFLARE_BUILDS_MERGE_SAFETY_READ_ONLY',
  mutations:0,buildTriggersChanged:0,productionDeployments:0,approvalChanges:0};
try{
 const id=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
 check(/^[a-f0-9]{32}$/.test(id||'')&&token,'CREDENTIALS_MISSING');
 let count=0;
 const get=async path=>{
  check(++count<=7,'REQUEST_BUDGET');
  check(['/workers/scripts','/workers/scripts/dream-team/deployments'].includes(path)||/^\/builds\/workers\/[a-z0-9-]+\/(triggers|deploy_hooks|builds\?per_page=100)$/.test(path),'ENDPOINT_NOT_ALLOWED');
  const r=await fetch(BASE+id+path,{headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(30000)});
  const j=await r.json();
  if(!r.ok||j.success!==true){const e=Error('READ_ONLY_CF_API_FAILED');e.httpStatus=r.status;e.cfCode=Number(j.errors?.[0]?.code)||null;throw e;}
  return j.result;
 };
 const workers=await get('/workers/scripts');check(Array.isArray(workers),'WORKERS_MISSING');
 const target=workers.find(w=>w.id==='dream-team');
 check(target?.tag&&/^[a-f0-9-]{20,64}$/.test(target.tag),'WORKER_TAG_INVALID');
 const path='/builds/workers/'+target.tag;
 const [triggersRaw,hooksRaw,buildsRaw,deployment]=await Promise.all([
  get(path+'/triggers'),get(path+'/deploy_hooks'),get(path+'/builds?per_page=100'),
  get('/workers/scripts/dream-team/deployments')
 ]);
 const triggers=Array.isArray(triggersRaw)?triggersRaw:triggersRaw?.triggers;
 const hooks=Array.isArray(hooksRaw)?hooksRaw:hooksRaw?.deploy_hooks;
 const builds=Array.isArray(buildsRaw)?buildsRaw:buildsRaw?.builds;
 check(Array.isArray(triggers)&&Array.isArray(hooks)&&Array.isArray(builds),'BUILD_METADATA_UNVERIFIED');
 const classified=triggers.map(t=>{
  const cmd=t.deploy_command;
  return {commandType:cmd==='npx wrangler versions upload'?'VERSION_UPLOAD_ONLY':
   cmd==='npm run deploy:production'?'PRODUCTION_DEPLOY_COMMAND':'UNKNOWN',
   enabled:t.enabled===true||t.enabled===false?t.enabled:null,
   branchFilterPresent:Boolean(t.branch_filters||t.branch_filter)};
 });
 check(deployment?.deployments?.[0]?.versions?.[0]?.version_id==='81f011a2-ba96-4bdf-b199-10e89f8271e4','PRODUCTION_WORKER_MOVED');
 Object.assign(report,{result:'PASS',triggerCount:triggers.length,hookCount:hooks.length,
   triggers:classified,activeBuilds:builds.filter(b=>['queued','pending','initializing','running','building'].includes(b.status)).length,
   productionWorker:deployment.deployments[0].versions[0].version_id,apiRequests:count});
 report.safeToMergeWithoutAutoDeploy=hooks.length===0&&classified.length>0&&classified.every(t=>t.commandType==='VERSION_UPLOAD_ONLY');
 if(!report.safeToMergeWithoutAutoDeploy)report.mergeGate='HOLD_FOR_CLOUDFLARE_BUILDS_REVIEW';
}catch(e){
 report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'SAFE_READ_FAILED';
 if(Number.isInteger(e.httpStatus))report.httpStatus=e.httpStatus;
 if(Number.isInteger(e.cfCode))report.cloudflareCode=e.cfCode;
 process.exitCode=1;
}finally{
 await mkdir('builds-merge-status',{recursive:true});
 await writeFile('builds-merge-status/summary.json',JSON.stringify(report,null,2));
 console.log('BUILDS_MERGE_CHECK '+JSON.stringify(report));
}
