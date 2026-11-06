import {assertSandbox} from './recovery-common.mjs';
// Wrangler may rewrite even a no_bundle entry. Transport exact module bytes;
// keep the audit Worker's just-uploaded asset namespace, never a service binding.
export async function uploadExactAuditVersion(worker,source,bindings,modules) {
 assertSandbox(worker);
 const form=new FormData();
 form.set('metadata',JSON.stringify({main_module:source.main_module,compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags||[],usage_model:source.usage_model,bindings,keep_assets:true}));
 for(const m of modules)form.set(m.name,new File([Buffer.from(m.content_base64,'base64')],m.name,{type:m.content_type}));
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/'+worker+'/versions',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},body:form,signal:AbortSignal.timeout(60000)});
 const body=await r.json();
 if(!r.ok||!body.success){const e=Error('EXACT_AUDIT_UPLOAD_FAILED');e.status=r.status;e.code=body.errors?.[0]?.code;throw e;}
 if(!/^[a-f0-9-]{36}$/.test(body.result.id||''))throw Error('EXACT_AUDIT_VERSION_REQUIRED');
 return body.result.id;
}
