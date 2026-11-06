import {assertSandbox} from './recovery-common.mjs';
import {productionGate} from './pr41-release-transition.mjs';
// Wrangler may rewrite even a no_bundle entry. Transport exact module bytes;
// keep the audit Worker's just-uploaded asset namespace, never a service binding.
export async function uploadExactAuditVersion(worker,source,bindings,modules) {
 assertSandbox(worker);
 return upload(worker,source,bindings,modules,false);
}
export async function uploadExactApprovedProductionVersion(source,bindings,modules,plan,authorization) {
 productionGate(plan,authorization);
 if(process.env.DREAMTEAM_PRODUCTION_APPROVED!=='yes'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'||process.env.GITHUB_REF!=='refs/heads/ops/pr41-safe-release-20261106')throw Error('PRODUCTION_UPLOAD_CONTEXT');
 if(bindings.some(b=>b.type==='secret_text'))throw Error('PRODUCTION_SECRET_OVERWRITE_FORBIDDEN');
 return upload('dream-team',source,bindings,modules,true);
}
async function upload(worker,source,bindings,modules,keepSecrets) {
 const form=new FormData();
 form.set('metadata',JSON.stringify({main_module:source.main_module,compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags||[],usage_model:source.usage_model,bindings,keep_assets:true,...(keepSecrets?{keep_bindings:['secret_text','secret_key']}:{})}));
 for(const m of modules)form.set(m.name,new File([Buffer.from(m.content_base64,'base64')],m.name,{type:m.content_type}));
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/'+worker+'/versions',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},body:form,signal:AbortSignal.timeout(60000)});
 const body=await r.json();
 if(!r.ok||!body.success){const e=Error('EXACT_VERSION_UPLOAD_FAILED');e.status=r.status;e.code=body.errors?.[0]?.code;throw e;}
 if(!/^[a-f0-9-]{36}$/.test(body.result.id||''))throw Error('EXACT_VERSION_REQUIRED');
 return body.result.id;
}
