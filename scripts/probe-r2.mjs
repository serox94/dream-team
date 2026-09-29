import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account&&token,'Cloudflare deployment credentials missing');
const output=(key,value)=>{if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);};
const base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets`;
const result=await fetch(base,{headers:{Authorization:`Bearer ${token}`}});
const payload=await result.json();
if(result.status===403&&payload.errors?.some(x=>x.code===10042)){
  console.log('R2 unavailable: account is NotEntitled (10042); subscription activation required.');
  output('ready','false');
}else{
  assert.equal(result.status,200,`R2 list failed with HTTP ${result.status}; check R2 Read permission and account entitlement`);
  assert.equal(payload.success,true,'R2 list failed');
  const buckets=payload.result?.buckets??payload.result;
  assert.ok(Array.isArray(buckets),'Unexpected R2 list response');
  const exists=buckets.some(b=>b.name==='dream-team-d1-backups');
  output('ready','true');output('exists',String(exists));
  console.log(`R2 available; private backup bucket ${exists?'already exists':'does not exist yet'}.`);
}
