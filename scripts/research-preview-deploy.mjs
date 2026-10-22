// Separate public Worker -> private inactive version, retaining the existing Tavily
// secret in its original preview Worker. Production and active previews are read-only.
import {mkdtemp,readFile,writeFile,mkdir,rm,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
import {cf,query,productionId,wrangler,configFile,exportSql,assertSandbox,importSandboxSql,sha} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest} from './d1-snapshot.mjs';
const name='dream-team-research-preview',sourceWorker='dream-team-preview',dbName='dream-team-audit-2026102231-db',archive='dream-team-audit-2026102231-archive',media='dream-team-audit-2026102231-media',identity='research-preview-20261022-v1';
const check=(x,c)=>{if(!x)throw Error(c);},q=async(id,sql,args=[])=>(await query(id,sql,args)).results;
const deployment=async n=>(await cf('/workers/scripts/'+n+'/deployments')).deployments[0].versions[0].version_id;
const counts=async id=>{const out={};for(const t of ['trips','lakes','catches','checklist_items','content_translations','content_sources','translation_jobs','translation_cache']){const rows=await q(id,'SELECT * FROM '+t);out[t]={count:rows.length,digest:rowsDigest(rows)};}return out;};
async function privatePut(bucket,key,file,dir){wrangler(['r2','object','put',bucket+'/'+key,'--remote','--file',file]);const copy=join(dir,'verify-'+key.replaceAll('/','-'));wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',copy]);await chmod(copy,0o600);check(sha(await readFile(copy))===sha(await readFile(file)),'PRIVATE_BACKUP_MISMATCH');}
let report={result:'BLOCKED',productionWrites:0,activePreviewWrites:0,providerPaidCalls:0},phase='isolation gate';const dir=await mkdtemp(join(tmpdir(),'research-isolation-'));
try{
 check(process.env.GITHUB_REF==='refs/heads/experiment/lake-research-20261022','WRONG_RESEARCH_BRANCH');
 const productionBefore=await deployment('dream-team'),sourceBefore=await deployment(sourceWorker),pro2Before=await deployment('dream-team-pro2-preview'),pro2Id='c45a6a34-3ca4-46fb-bef5-ff17b8d9caee',preserved=await counts(productionId),pro2Preserved=await counts(pro2Id);
 const sourceVersion=await cf('/workers/scripts/'+sourceWorker+'/versions/'+sourceBefore);check(sourceVersion.resources.bindings.some(b=>b.name==='TAVILY_API_KEY'&&b.type==='secret_text'),'EXISTING_TAVILY_KEY_NOT_AVAILABLE');
 const base=JSON.parse(await readFile('wrangler.jsonc','utf8')),domain=await cf('/workers/subdomain');check(/^[a-z0-9-]+$/.test(domain.subdomain),'SUBDOMAIN');const publicUrl='https://'+name+'.'+domain.subdomain+'.workers.dev';
 const dbs=await cf('/d1/database?per_page=100');let clone=dbs.find(d=>d.name===dbName);
 if(clone){assertSandbox(clone.name,clone.uuid);check((await q(clone.uuid,"SELECT value FROM app_settings WHERE key='research.preview.identity'"))[0]?.value===identity,'EXISTING_RESEARCH_DB_NOT_OWNED');report.cloneReused=true;}
 else{
  phase='private source checkpoint and verified new clone';console.log('RESEARCH_PHASE '+phase);
  const dump=await exportSql('wrangler.jsonc','dream-team-db',join(dir,'source.sql')),snapshot=inspectSql(dump.bytes);await verifySnapshot({uuid:productionId},snapshot);
  const buckets=(await cf('/r2/buckets')).buckets;for(const bucket of [archive,media]){assertSandbox(bucket);check(!buckets.some(b=>b.name===bucket),'NEW_RESEARCH_BUCKET_ALREADY_EXISTS');await cf('/r2/buckets','POST',{name:bucket});}
  await privatePut(archive,'source.sql',join(dir,'source.sql'),dir);clone=await cf('/d1/database','POST',{name:dbName});assertSandbox(clone.name,clone.uuid);
  const restoreConfig=await configFile(dir,{name:'dream-team-audit-2026102231',compatibility_date:base.compatibility_date,d1_databases:[{binding:'DB',database_name:dbName,database_id:clone.uuid}]},'restore.jsonc');
  report.restore={result:'PASS',...await importSandboxSql(clone,restoreConfig,join(dir,'source.sql'))};
  check(rowsDigest(await q(clone.uuid,'SELECT * FROM content_translations'))===rowsDigest(snapshot.tables.find(t=>t.name==='content_translations').rows),'CLONED_TRANSLATIONS_CHANGED');
  await query(clone.uuid,'DELETE FROM auth_sessions');await query(clone.uuid,'DELETE FROM auth_login_limits');
  await query(clone.uuid,"INSERT INTO app_settings(key,value) VALUES('research.preview.identity',?)",[identity]);report.snapshotSha256=dump.sha256;
 }
 check(clone.uuid!==productionId&&clone.uuid!==pro2Id&&clone.uuid!=='5d32f54f-f953-463f-8519-745e51417986','PROTECTED_DB');
 const schema=(await q(clone.uuid,"SELECT value FROM app_settings WHERE key='schema_version'"))[0]?.value;
 if(schema==='30'){
  const migration='0031_research_evidence.sql',migrateConfig=await configFile(dir,{name:'dream-team-audit-2026102231',compatibility_date:base.compatibility_date,d1_databases:[{binding:'DB',database_name:dbName,database_id:clone.uuid}]},'migration.jsonc');
  wrangler(['d1','execute',dbName,'--remote','--config',migrateConfig,'--file','migrations/'+migration]);
  await query(clone.uuid,'INSERT INTO d1_migrations(name) VALUES(?)',[migration]);
 }
 check((await q(clone.uuid,"SELECT value FROM app_settings WHERE key='schema_version'"))[0]?.value==='31','RESEARCH_SCHEMA_NOT_READY');
 check((await q(clone.uuid,'PRAGMA foreign_key_check')).length===0,'RESEARCH_FOREIGN_KEY_CHECK');
 const gate=randomBytes(32).toString('hex'),secretsFile=await configFile(dir,{RESEARCH_PROXY_KEY:gate,...Object.fromEntries(['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'].map(k=>[k,process.env[k]]))},'secrets.json');
 const wrapper=join(dir,'version.mjs');await writeFile(wrapper,`import app from ${JSON.stringify(process.cwd()+'/src/worker.js')};export default{async fetch(r,e,c){if(!e.RESEARCH_PROXY_KEY||r.headers.get('x-research-proxy-key')!==e.RESEARCH_PROXY_KEY)return new Response('Unavailable',{status:503});const u=new URL(r.url),origin=new URL(${JSON.stringify(publicUrl)});u.protocol=origin.protocol;u.host=origin.host;const h=new Headers(r.headers);h.delete('x-research-proxy-key');return app.fetch(new Request(u,new Request(r,{headers:h})),e,c);},scheduled(){}};`);
 phase='upload private version with isolated bindings; no active deployment';console.log('RESEARCH_PHASE '+phase);
 const alias='research-'+process.env.GITHUB_SHA.slice(0,12),cfg={...base,name:sourceWorker,main:wrapper,workers_dev:true,preview_urls:true,triggers:{crons:[]},assets:{...base.assets,directory:process.cwd()+'/public'},vars:{APP_ENV:'preview',APP_BUILD:process.env.GITHUB_SHA,INDIVIDUAL_ACCOUNTS:'true',AI_FREE_ONLY:'false',TRANSLATION_ENABLED:'false',TRANSLATION_FREE_CONFIRMED:'false',RESEARCH_PREVIEW:'true'},d1_databases:[{binding:'DB',database_name:dbName,database_id:clone.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:media}]};delete cfg.ai;
 const file=await configFile(dir,cfg,'research-version.jsonc'),out=wrangler(['versions','upload','--config',file,'--preview-alias',alias,'--secrets-file',secretsFile]);
 const urls=out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/g)||[],versionUrl=urls.find(u=>u.startsWith('https://'+alias+'-'+sourceWorker+'.'));check(versionUrl,'PRIVATE_VERSION_URL_NOT_RETURNED');
 check(await deployment(sourceWorker)===sourceBefore&&await deployment('dream-team')===productionBefore&&await deployment('dream-team-pro2-preview')===pro2Before,'ACTIVE_VERSION_CHANGED');
 for(let n=0;n<25;n++){const ready=await fetch(versionUrl+'/login',{headers:{'x-research-proxy-key':gate},signal:AbortSignal.timeout(15000)});if(ready.status===200&&ready.headers.get('x-dreamteam-build')===process.env.GITHUB_SHA)break;if(n===24)throw Error('PRIVATE_VERSION_NOT_READY');await new Promise(r=>setTimeout(r,1500));}
 const noKey=await fetch(versionUrl+'/login');check(noKey.status===503,'PRIVATE_VERSION_NOT_GATED');
 phase='deploy separate research Worker';console.log('RESEARCH_PHASE '+phase);
 const proxy=join(dir,'proxy.mjs');await writeFile(proxy,`export default{async fetch(r,e){const target=new URL(e.RESEARCH_VERSION_URL);if(!/^research-[a-f0-9]+-dream-team-preview\\.[a-z0-9-]+\\.workers\\.dev$/.test(target.host)||!e.RESEARCH_PROXY_KEY)return new Response('Unavailable',{status:503});const u=new URL(r.url);target.pathname=u.pathname;target.search=u.search;const h=new Headers(r.headers);h.delete('host');h.set('x-research-proxy-key',e.RESEARCH_PROXY_KEY);return fetch(new Request(target,new Request(r,{headers:h})),{redirect:'manual'});}};`);
 const proxyConfig=await configFile(dir,{name,main:proxy,workers_dev:true,compatibility_date:base.compatibility_date,compatibility_flags:['global_fetch_strictly_public'],triggers:{crons:[]},vars:{RESEARCH_VERSION_URL:versionUrl}},'proxy.jsonc');const proxySecrets=await configFile(dir,{RESEARCH_PROXY_KEY:gate},'proxy-secrets.json');wrangler(['deploy','--config',proxyConfig,'--secrets-file',proxySecrets]);
 const worker=await deployment(name),v=await cf('/workers/scripts/'+name+'/versions/'+worker);check(!v.resources.bindings.some(b=>['d1','r2_bucket','ai'].includes(b.type)),'PROXY_UNEXPECTED_STORAGE');
 let response;for(let n=0;n<25;n++){response=await fetch(publicUrl+'/login',{redirect:'manual',signal:AbortSignal.timeout(15000)});if(response.status===200&&response.headers.get('x-dreamteam-build')===process.env.GITHUB_SHA)break;if(n===24){const body=await response.text();report.previewProbe={http:response.status,build:response.headers.get('x-dreamteam-build'),contentType:response.headers.get('content-type'),cfError:body.match(/(?:error code:|Error)\s*\d+/i)?.[0]||null};throw Error('RESEARCH_PREVIEW_NOT_READY');}await new Promise(r=>setTimeout(r,1500));}
 const login=await fetch(publicUrl+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD})});check(login.status===303&&login.headers.get('set-cookie'),'RESEARCH_PREVIEW_LOGIN');const cookie=login.headers.get('set-cookie').split(';')[0];
 try{const result=await fetch(publicUrl+'/api/research-provider-status',{headers:{cookie},signal:AbortSignal.timeout(30000)});check(result.ok,'PROVIDER_STATUS_ROUTE');report.tavily=await result.json();}finally{await fetch(publicUrl+'/api/logout',{method:'POST',headers:{cookie,origin:publicUrl}});}
 check(JSON.stringify(await counts(productionId))===JSON.stringify(preserved),'PRODUCTION_ROWS_CHANGED');check(JSON.stringify(await counts(pro2Id))===JSON.stringify(pro2Preserved),'RETAINED_PRO2_ROWS_CHANGED');check(await deployment('dream-team')===productionBefore&&await deployment(sourceWorker)===sourceBefore&&await deployment('dream-team-pro2-preview')===pro2Before,'FINAL_ACTIVE_VERSION_CHANGED');
 report={...report,result:'PASS',previewUrl:publicUrl,worker,privateVersionUrl:versionUrl,database:{id:clone.uuid,name:clone.name},counts:await counts(clone.uuid),sourceWorkerActiveUnchanged:true,productionUnchanged:true,retainedPro2Unchanged:true};
}catch(e){report.phase=phase;report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'RESEARCH_DEPLOY_FAILED';report.status=e.status;report.code=e.code;report.operation=e.operation;report.deployDetail=e.deployDetail;process.exitCode=1;}
finally{await mkdir('research-status',{recursive:true});await writeFile('research-status/deploy.json',JSON.stringify(report,null,2));console.log('RESEARCH_DEPLOY '+JSON.stringify(report));await rm(dir,{recursive:true,force:true});}
