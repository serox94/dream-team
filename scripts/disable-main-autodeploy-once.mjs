// Single authorized Cloudflare Workers Builds configuration repair.
// PATCH exactly one previously verified main-branch production deploy command.
// Never creates a build, D1/R2 resource, or deploys a Worker.
import {mkdir,writeFile} from 'node:fs/promises';
const check=(p,code)=>{if(!p)throw Error(code);};
const isUuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const urlRoot='https://api.cloudflare.com/client/v4/accounts/';
const report={result:'BLOCKED',mode:'OWNER_APPROVED_DISABLE_AUTOMATIC_MAIN_PROMOTION',
 mutationCount:0,workerDeployments:0,d1Calls:0,r2Calls:0,approvalChanges:0,buildsStarted:0};
try{
 check(process.env.GITHUB_REPOSITORY==='serox94/dream-team','REPO_MISMATCH');
 check(process.env.GITHUB_REF==='refs/heads/fix/code32-cloudflare-recovery-diagnostics-20261027','BRANCH_MISMATCH');
 check(process.env.CLOUDFLARE_AUTODEPLOY_GUARD_APPROVED==='yes','OWNER_APPROVAL_REQUIRED');
 const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 check(token&&/^[0-9a-f]{32}$/.test(account||''),'CREDENTIALS_MISSING');
 let controlCalls=0;
 const cf=async(path,method='GET',body)=>{
  check(++controlCalls<=9,'CLOUDFLARE_REQUEST_BUDGET');
  check(method==='GET'||
   (method==='PATCH'&&/^\/builds\/triggers\/[a-f0-9-]{36}$/.test(path)&&
    Object.keys(body||{}).length===1&&body.deploy_command==='npx wrangler versions upload'),
   'FORBIDDEN_CF_OPERATION');
  const r=await fetch(urlRoot+account+path,{method,headers:{
   authorization:'Bearer '+token,accept:'application/json',...(body?{'content-type':'application/json'}:{})},
   body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(25000)});
  const j=await r.json().catch(()=>null);
  if(!r.ok||j?.success!==true){const e=Error('CLOUDFLARE_API_DENIED');e.status=r.status;e.code=Number(j?.errors?.[0]?.code)||null;throw e;}
  return j.result;
 };
 const scripts=await cf('/workers/scripts');check(Array.isArray(scripts),'WORKER_INVENTORY_UNAVAILABLE');
 const script=scripts.find(x=>x.id==='dream-team');check(/^[a-f0-9-]{20,64}$/.test(script?.tag||''),'WORKER_TAG_UNVERIFIED');
 const path='/builds/workers/'+script.tag;
 const current=(await cf('/workers/scripts/dream-team/deployments'))?.deployments?.[0];
 check(current?.versions?.length===1&&current.versions[0].percentage===100&&current.versions[0].version_id==='81f011a2-ba96-4bdf-b199-10e89f8271e4','PRODUCTION_CHANGED');
 const t=await cf(path+'/triggers');const triggers=Array.isArray(t)?t:t?.triggers;
 check(Array.isArray(triggers)&&triggers.length===2,'TRIGGER_COUNT_CHANGED');
 const main=t=>Array.isArray(t.branch_includes)&&t.branch_includes.includes('main')&&
  Array.isArray(t.branch_excludes)&&!t.branch_excludes.includes('main');
 const prod=triggers.filter(x=>main(x)&&x.deploy_command==='npm run deploy:production');
 const preview=triggers.filter(x=>x.deploy_command==='npx wrangler versions upload'&&
  Array.isArray(x.branch_excludes)&&x.branch_excludes.includes('main'));
 check(prod.length===1&&preview.length===1,'UNEXPECTED_TRIGGERS');
 const id=prod[0].uuid??prod[0].trigger_uuid??prod[0].id;
 check(isUuid(id),'TRIGGER_UUID_UNVERIFIED');
 const hookData=await cf(path+'/deploy_hooks');
 const hooks=Array.isArray(hookData)?hookData:hookData?.deploy_hooks;
 check(Array.isArray(hooks)&&hooks.length===0,'DEPLOY_HOOKS_PRESENT');
 const b=await cf(path+'/builds?per_page=100');const builds=Array.isArray(b)?b:b?.builds;
 check(Array.isArray(builds),'BUILD_STATE_UNVERIFIED');
 const productionActive=builds.some(x=>['queued','pending','initializing','running','building'].includes(x.status)&&
  (x.branch==='main'||x.build_trigger_metadata?.branch==='main'));
 check(!productionActive,'ACTIVE_PRODUCTION_BUILD');
 // PATCH only this verified main trigger's deploy_command; do not touch other settings.
 report.mutationCount=1;
 await cf('/builds/triggers/'+id,'PATCH',{deploy_command:'npx wrangler versions upload'});
 const reread=await cf(path+'/triggers');const after=Array.isArray(reread)?reread:reread?.triggers;
 check(Array.isArray(after)&&after.length===2,'POSTPATCH_TRIGGERS_UNKNOWN');
 const updated=after.find(x=>(x.uuid??x.trigger_uuid??x.id)===id);
 check(updated?.deploy_command==='npx wrangler versions upload','PRODUCTION_TRIGGER_UNCHANGED');
 for(const key of ['branch_includes','branch_excludes','build_command','root_directory','path_includes','path_excludes','build_token_uuid']){
  check(JSON.stringify(updated[key]??null)===JSON.stringify(prod[0][key]??null),'NON_COMMAND_SETTING_CHANGED');
 }
 const other=after.find(x=>(x.uuid??x.trigger_uuid??x.id)!==id);
 check(other?.deploy_command==='npx wrangler versions upload'&&
  JSON.stringify(other?.branch_includes)===JSON.stringify(preview[0].branch_includes)&&
  JSON.stringify(other?.branch_excludes)===JSON.stringify(preview[0].branch_excludes),'PREVIEW_TRIGGER_CHANGED');
 const last=(await cf('/workers/scripts/dream-team/deployments'))?.deployments?.[0];
 check(last?.id===current.id&&last.versions?.[0]?.version_id==='81f011a2-ba96-4bdf-b199-10e89f8271e4','PRODUCTION_DEPLOYMENT_MOVED');
 Object.assign(report,{result:'PASS',triggerCount:2,mainDeployCommand:'VERSION_UPLOAD_ONLY',
  previewDeployCommand:'VERSION_UPLOAD_ONLY',productionWorkerUnchanged:true,remainingOtherTriggerUnchanged:true,
  controlCalls});
}catch(e){
 report.error=/^[A-Z0-9_]+$/.test(e?.message||'')?e.message:'UNEXPECTED_FAILURE';
 if(Number.isInteger(e.status))report.httpStatus=e.status;
 if(Number.isInteger(e.code))report.cloudflareCode=e.code;
 process.exitCode=1;
}finally{
 await mkdir('cloudflare-autodeploy-guard',{recursive:true});
 await writeFile('cloudflare-autodeploy-guard/summary.json',JSON.stringify(report,null,2));
 console.log('AUTODEPLOY_GUARD '+JSON.stringify(report));
}
