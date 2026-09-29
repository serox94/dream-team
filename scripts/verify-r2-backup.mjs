import assert from 'node:assert/strict';
import {writeFileSync,appendFileSync} from 'node:fs';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account&&token,'Cloudflare deployment credentials missing');
const base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets/dream-team-d1-backups/objects`;
const headers={Authorization:`Bearer ${token}`};
const since=Date.now()-15*60*1000,deadline=Date.now()+180000;
let object;
while(Date.now()<deadline){
 const r=await fetch(base+'?prefix=dream-team-db%2F&per_page=100',{headers});
 assert.equal(r.status,200,`R2 object listing returned ${r.status}; check R2 Object Read permission`);
 const data=await r.json();assert.equal(data.success,true,'R2 listing failed');
 const objects=data.result?.objects??data.result;
 assert.ok(Array.isArray(objects),'Unexpected R2 object listing response');
 object=objects.filter(o=>o.key?.startsWith('dream-team-db/')&&o.size>0&&Date.parse(o.uploaded||o.last_modified||o.lastModified||'')>=since).sort((a,b)=>Date.parse(b.uploaded||b.last_modified||b.lastModified||0)-Date.parse(a.uploaded||a.last_modified||a.lastModified||0))[0];
 if(object)break;
 await new Promise(done=>setTimeout(done,5000));
}
assert.ok(object,'No new, nonempty D1 backup appeared in R2 within 3 minutes');
const key=object.key,encoded=key.split('/').map(encodeURIComponent).join('/');
const response=await fetch(base+'/'+encoded,{headers});
assert.equal(response.status,200,`R2 object download returned ${response.status}`);
const sql=await response.text();
assert.ok(sql.length>1000&&/CREATE TABLE/i.test(sql)&&/checklist_items/i.test(sql)&&/trips/i.test(sql),'Backup SQL is incomplete');
writeFileSync('/tmp/ryby-restore-test.sql',sql,{mode:0o600});
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`key=${key}\nsize=${object.size}\n`);
console.log(`First D1 backup validated in private R2: ${key}, ${object.size} bytes, ${object.uploaded||object.last_modified||object.lastModified||'timestamp unavailable'}.`);
