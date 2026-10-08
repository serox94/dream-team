// Production preflight: create only the dedicated DreamTeam media bucket if missing.
// Never mutates D1, backup objects, secrets, billing, or a Workers subscription.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account&&token,'Cloudflare deployment credentials missing');
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
assert.equal(config.name,'dream-team');
assert.equal(config.vars?.AI_FREE_ONLY,'false','AI remains disabled until the free plan and allowance are affirmatively verified.');

const root=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;
async function api(path,method='GET',body){
 const response=await fetch(root+path,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok||!data.success)throw new Error(`Cloudflare ${method} ${path} failed (${response.status}; ${data.errors?.[0]?.message||'unknown error'}).`);
 return data.result;
}

const expectedMedia='dream-team-media',expectedBackup='dream-team-d1-backups';
let buckets=(await api('/r2/buckets')).buckets||[];
assert.ok(buckets.some(b=>b.name===expectedBackup),'Existing D1 backup bucket is missing; refusing production deploy.');
if(!buckets.some(b=>b.name===expectedMedia)){
 await api('/r2/buckets','POST',{name:expectedMedia});
 buckets=(await api('/r2/buckets')).buckets||[];
}
assert.ok(buckets.some(b=>b.name===expectedMedia),'Dedicated DreamTeam media bucket is unavailable.');

console.log('Production resources: media R2 present, backup R2 preserved; AI remains disabled pending free allowance verification.');
