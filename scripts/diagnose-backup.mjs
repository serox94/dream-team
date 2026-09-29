import assert from 'node:assert/strict';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
assert.ok(account&&token,'Missing Cloudflare deployment credentials');
const base=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workflows/dream-team-d1-backup-daily/instances`;
const headers={Authorization:`Bearer ${token}`};
async function get(url){const r=await fetch(url,{headers});assert.equal(r.status,200,`Workflow inspection returned HTTP ${r.status}; check Workers Scripts Read`);const x=await r.json();assert.equal(x.success,true,'Workflow inspection API failed');return x.result;}
const list=await get(base+'?per_page=10');
const items=Array.isArray(list)?list:list.instances;
assert.ok(Array.isArray(items)&&items.length,'No backup Workflow instances');
const latest=items.sort((a,b)=>Date.parse(b.created_on||b.queued||0)-Date.parse(a.created_on||a.queued||0))[0];
const detail=await get(base+'/'+encodeURIComponent(latest.id));
const safe=value=>String(value||'').replace(/https?:\/\/\S+/g,'[URL]').replace(/Bearer\s+\S+/gi,'[redacted]').slice(0,240);
console.log(`Backup Workflow instance: ${latest.id}; status: ${detail.status||latest.status}.`);
const errors=[];
const walk=(x)=>{if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(k==='error'&&v){errors.push(typeof v==='string'?v:v.message||v.name||'error');continue;}if(typeof v==='object')walk(v);}};
walk(detail);
for(const error of [...new Set(errors)])console.log(`Workflow error: ${safe(error)}`);
