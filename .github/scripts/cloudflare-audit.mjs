// Temporary, read-only account audit. Only curated non-secret values reach Actions logs.
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const database='b64c7a2c-8694-41c6-b54a-857b88bf2c96';
const bucket='dream-team-d1-backups';
if(!account||!token){console.error('Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN secret.');process.exit(1);}

async function get(label,path){
  try{
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}${path}`,{
      headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)
    });
    const body=await response.json();
    if(!response.ok||body.success!==true){
      const codes=(body.errors||[]).map(e=>Number(e.code)).filter(Number.isFinite);
      console.log(`${label}: HTTP ${response.status}, API codes ${codes.join(',')||'none'}`);
      return null;
    }
    return body.result;
  }catch{
    console.log(`${label}: request failed`);
    return null;
  }
}

const d1=await get('D1',`/d1/database/${database}`);
if(!d1||d1.name!=='dream-team-db'||d1.uuid!==database){
  console.error('D1 identity: FAIL; no changes made.');
  process.exit(1);
}
console.log(`D1 identity: PASS; version: ${d1.version==='production'?'production':'other/unknown'}`);
const bookmark=await get('Time Travel',`/d1/database/${database}/time_travel/bookmark`);
console.log(`Time Travel bookmark: ${typeof bookmark?.bookmark==='string'?'PASS':'FAIL/unknown'}`);
const r2=await get('R2 bucket',`/r2/buckets/${bucket}`);
console.log(`R2 bucket exists: ${r2?.name===bucket?'YES':'NO/unknown'}`);
if(r2?.name===bucket){
  const lifecycle=await get('R2 lifecycle',`/r2/buckets/${bucket}/lifecycle`);
  console.log(`R2 lifecycle rules: ${Array.isArray(lifecycle?.rules)?lifecycle.rules.length:'unknown'}`);
}
const subscriptions=await get('Workers subscription',`/subscriptions`);
if(Array.isArray(subscriptions)){
  const workers=subscriptions.filter(x=>JSON.stringify(x?.rate_plan||{}).toLowerCase().includes('worker'));
  console.log(`Workers subscription: ${workers.map(x=>x.rate_plan?.public_name||x.rate_plan?.id||'unknown').join(',')||'not identified'}`);
}else console.log('Workers subscription: unavailable; Billing Read may be required to determine 7/30 day retention.');
