import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.D1_EXPORT_TOKEN;
assert.ok(account&&token,'Missing limited D1 export token');
const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/b64c7a2c-8694-41c6-b54a-857b88bf2c96/export`;
let bookmark;
const deadline=Date.now()+120000;
while(Date.now()<deadline){
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({output_format:'polling',...(bookmark?{current_bookmark:bookmark}:{})})});
  const data=await response.json();
  if(response.status!==200||!data.success){
    const codes=(data.errors||[]).map(e=>e.code).filter(x=>typeof x==='number');
    console.error(`D1 export with limited token: HTTP ${response.status}; API error codes: ${codes.join(',')||'none'}.`);
    console.error('Check Account → D1 → Edit (also called D1 Write) and scope it to the production account. Do not install the deployment token in the backup Worker.');
    process.exit(1);
  }
  const result=data.result;
  if(result?.status==='error'||result?.success===false)throw Error('D1 export returned an error.');
  if(result?.status==='complete'&&(result.result?.signed_url||result.signed_url)){
    console.log('D1 export with limited token completed successfully.');
    process.exit(0);
  }
  bookmark=result?.at_bookmark||bookmark;
  assert.ok(bookmark,'D1 export returned no polling bookmark');
  await new Promise(done=>setTimeout(done,1500));
}
throw Error('D1 export did not complete within two minutes; limited token was not installed.');
