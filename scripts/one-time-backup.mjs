import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account&&token,'Missing administrative deployment credentials');
const headers={Authorization:`Bearer ${token}`,'content-type':'application/json'};
const exportUrl=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/b64c7a2c-8694-41c6-b54a-857b88bf2c96/export`;
const r2base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/r2/buckets/dream-team-d1-backups/objects`;
const pause=()=>new Promise(done=>setTimeout(done,5000));
async function poll(body){const r=await fetch(exportUrl,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(r.status,200,`Production D1 read-only export returned HTTP ${r.status}`);const x=await r.json();assert.equal(x.success,true,'D1 export failed');return x.result;}
const deadline=Date.now()+180000;
let bookmark;
while(Date.now()<deadline&&!bookmark){const result=await poll({output_format:'polling'});bookmark=result?.at_bookmark;if(!bookmark)await pause();}
assert.ok(bookmark,'D1 export did not provide a bookmark');
let signedUrl;
while(Date.now()<deadline&&!signedUrl){const result=await poll({current_bookmark:bookmark});signedUrl=result?.result?.signed_url||result?.signed_url;if(!signedUrl)await pause();}
assert.ok(signedUrl&&new URL(signedUrl).protocol==='https:','D1 export did not finish');
const download=await fetch(signedUrl);assert.equal(download.status,200,'D1 signed download failed');
const bytes=new Uint8Array(await download.arrayBuffer());
const sql=new TextDecoder().decode(bytes);
assert.ok(bytes.length>1000&&/CREATE TABLE/i.test(sql)&&/checklist_items/i.test(sql)&&/trips/i.test(sql),'D1 SQL export incomplete');
const key=`dream-team-db/${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.sql`;
const objectUrl=r2base+'/'+key.split('/').map(encodeURIComponent).join('/');
const upload=await fetch(objectUrl,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'content-type':'application/sql'},body:bytes});
assert.ok(upload.ok,`Private R2 upload returned HTTP ${upload.status}`);
const read=await fetch(objectUrl,{headers:{Authorization:`Bearer ${token}`}});assert.equal(read.status,200,'R2 backup readback failed');
const restored=new Uint8Array(await read.arrayBuffer());
const hash=x=>createHash('sha256').update(x).digest('hex');
assert.equal(hash(restored),hash(bytes),'R2 backup differs from D1 export');
writeFileSync('/tmp/ryby-restore-test.sql',restored,{mode:0o600});
console.log(`Production D1 backup stored in private R2: ${key}, ${bytes.length} bytes, ${new Date().toISOString()}; SHA-256 readback PASS.`);
