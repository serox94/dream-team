import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.D1_EXPORT_TOKEN;
assert.ok(account&&token,'Missing limited D1 export token');
const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/b64c7a2c-8694-41c6-b54a-857b88bf2c96/export`;
const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({output_format:'polling'})});
const data=await response.json();
const codes=(data.errors||[]).map(e=>e.code).filter(x=>typeof x==='number');
console.log(`D1 export with limited token: HTTP ${response.status}; API error codes: ${codes.join(',')||'none'}.`);
if(response.status!==200||!data.success){
  console.error('The limited runtime token cannot start D1 export. Check Account → D1 → Edit (also called D1 Write) and scope it to the production account. Do not install the deployment token in the backup Worker.');
  process.exitCode=1;
}
