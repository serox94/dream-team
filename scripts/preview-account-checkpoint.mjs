// Private preview-only recovery point. Never upload this file as a CI artifact.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const config=JSON.parse(await readFile('wrangler.preview.generated.jsonc','utf8'));
assert.equal(config.name,'dream-team-preview');assert.equal(config.d1_databases[0].database_name,'dream-team-preview-db');assert.equal(config.r2_buckets[0].bucket_name,'dream-team-preview-media');assert.notEqual(config.d1_databases[0].database_id,'b64c7a2c-8694-41c6-b54a-857b88bf2c96');
const root=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${config.d1_databases[0].database_id}`;
async function api(path,body){const response=await fetch(root+path,{method:body?'POST':'GET',headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const data=await response.json();assert.ok(response.ok()&&data.success,`preview D1 recovery request failed (${response.status})`);return data.result;}
const query=async sql=>(await api('/query',{sql,params:[]}))[0].results;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const tables=['anglers','lakes','trips','trip_participants','catches','spots','checklist_items','checklist_categories','lake_sources','lake_facts','lake_fact_changes','lake_research_runs','lake_candidate_searches','deeper_media','deeper_ai_attempts','checklist_templates','checklist_template_items','trip_documents','trip_notes'];
async function integrity(){assert.equal((await query('PRAGMA foreign_key_check')).length,0,'foreign key integrity');const result={};for(const table of tables){const rows=await query(`SELECT * FROM ${table}`);result[table]={count:rows.length,sha256:hash(rows.map(row=>JSON.stringify(row)).sort())};}return result;}
const filename='.preview-account-integrity.json';
if(process.argv.includes('--verify')){
 const before=JSON.parse(await readFile(filename,'utf8'));assert.deepEqual(await integrity(),before.integrity,'migration must preserve every existing business row and ID');console.log('PREVIEW ACCOUNT MIGRATION INTEGRITY: PASS all business rows unchanged.');
}else{
 const dir=await mkdtemp(join(tmpdir(),'dream-private-checkpoint-'));
 try{
  const bookmark=await api('/time_travel/bookmark');
  const schema=await query("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name");
  const rows={};for(const table of schema.filter(row=>row.type==='table'&&!row.name.startsWith('sqlite_')&&!row.name.startsWith('_cf_'))){assert.match(table.name,/^[a-zA-Z0-9_]+$/);rows[table.name]=await query(`SELECT * FROM "${table.name}"`);}
  const checkpoint={format:'dream-private-d1-checkpoint-v1',createdAt:new Date().toISOString(),database:config.d1_databases[0].database_id,bookmark,schema,rows,integrity:await integrity()};
  const bytes=JSON.stringify(checkpoint),file=join(dir,'checkpoint.json'),verify=join(dir,'verify.json'),key=`private-checkpoints/accounts-${process.env.GITHUB_SHA||'manual'}-${Date.now()}.json`;
  await writeFile(file,bytes,{mode:0o600});
  execFileSync('npx',['wrangler','r2','object','put',`dream-team-preview-media/${key}`,'--remote','--file',file,'--content-type','application/json'],{stdio:'pipe'});
  execFileSync('npx',['wrangler','r2','object','get',`dream-team-preview-media/${key}`,'--remote','--file',verify],{stdio:'pipe'});
  assert.equal(hash(await readFile(verify,'utf8')),hash(bytes),'private checkpoint R2 round trip');
  await writeFile(filename,JSON.stringify({integrity:checkpoint.integrity}),{mode:0o600});
  console.log(`PRIVATE PREVIEW CHECKPOINT: PASS R2 round trip + Time Travel bookmark; sha256=${hash(bytes)}; business counts=${JSON.stringify(Object.fromEntries(Object.entries(checkpoint.integrity).map(([t,v])=>[t,v.count])))}`);
 }finally{await rm(dir,{recursive:true,force:true});}
}
