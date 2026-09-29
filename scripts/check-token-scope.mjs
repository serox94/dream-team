import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,admin=process.env.CLOUDFLARE_API_TOKEN,limited=process.env.D1_EXPORT_TOKEN;
assert.ok(account&&admin&&limited,'Missing deployment configuration');
const verify=await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify',{headers:{Authorization:`Bearer ${limited}`}});
const verified=await verify.json();
console.log(`Limited token verification: HTTP ${verify.status}; status: ${verified.result?.status||'unknown'}.`);
if(!verified.success||!verified.result?.id)process.exit(1);
const id=verified.result.id;
for(const path of [`accounts/${encodeURIComponent(account)}/tokens/${encodeURIComponent(id)}`,`user/tokens/${encodeURIComponent(id)}`]){
 const r=await fetch('https://api.cloudflare.com/client/v4/'+path,{headers:{Authorization:`Bearer ${admin}`}});
 if(r.status!==200){console.log(`Token metadata ${path.startsWith('accounts/')?'account':'user'} scope: HTTP ${r.status}.`);continue;}
 const body=await r.json(),policies=body.result?.policies||[];
 const names=[...new Set(policies.flatMap(p=>(p.permission_groups||[]).map(g=>g.name)))];
 console.log(`Limited token permissions: ${names.join(', ')||'none visible'}.`);
 console.log(`Policies scoped to expected account: ${policies.some(p=>JSON.stringify(p.resources||{}).includes(account))}.`);
 break;
}
