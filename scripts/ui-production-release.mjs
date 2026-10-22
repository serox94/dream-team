// Schema30 UI-only recovery/deploy operator. No migration, inference or production session purge.
import {readFile,writeFile,mkdtemp,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {randomBytes,randomUUID} from 'node:crypto';
import {cf,query,productionId,sha,wrangler,configFile,exportSql,assertSandbox,importSandboxSql} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest,identifier} from './d1-snapshot.mjs';
import {privateRestore} from './recovery-transport.mjs';
import {APPROVED,PRODUCTION,check,git,tree,gh,queueGate,requireApproval} from './ui-release-core.mjs';
import {smoke} from './ui-smoke.mjs';
const q=async(id,sql,args=[])=>(await query(id,sql,args)).results;
async function privatePut(bucket,key,file,dir){wrangler(['r2','object','put',bucket+'/'+key,'--remote','--file',file]);const copy=join(dir,randomUUID()+'.verify');wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',copy]);await chmod(copy,0o600);check(sha(await readFile(copy))===sha(await readFile(file)),'PRIVATE_BACKUP_ROUNDTRIP');return sha(await readFile(file));}
export async function verifyRows(snapshot,{maintenance=false,operational=false}={}){
 for(const t of snapshot.tables){if(operational&&['auth_sessions','auth_login_limits'].includes(t.name))continue;let a=await q(productionId,'SELECT * FROM '+identifier(t.name)),b=t.rows;if(maintenance&&t.name==='app_settings'){a=a.filter(r=>r.key!=='maintenance_mode');b=b.filter(r=>r.key!=='maintenance_mode');}check(rowsDigest(a)===rowsDigest(b),'PRESERVATION_'+t.name.toUpperCase());}
 if(operational){const existing=await q(productionId,'SELECT * FROM auth_sessions');for(const s of snapshot.tables.find(t=>t.name==='auth_sessions').rows)check(existing.some(r=>rowsDigest([r])===rowsDigest([s])),'PREEXISTING_SESSION_CHANGED');}
}
export async function execute(status,action){
 const candidate=process.env.RELEASE_CANDIDATE,run=process.env.GITHUB_RUN_ID,name='dream-team-audit-'+run,dir=await mkdtemp(join(tmpdir(),'ui-release-private-')),base=JSON.parse(await readFile('wrangler.jsonc','utf8'));
 const archive=name+'-archive',media=name+'-media';let clone,ioCreated=false,canaryCreated=false,maintenance=false,deployed=false,originalMaintenance,sourceVersion;let phase='release gates';
 const http=(path,options={})=>fetch(PRODUCTION+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(45000),...options});
 const off=async()=>{if(originalMaintenance)await query(productionId,'UPDATE app_settings SET value=?,updated_at=? WHERE key=?',[originalMaintenance.value,originalMaintenance.updated_at,'maintenance_mode']);else await query(productionId,"DELETE FROM app_settings WHERE key='maintenance_mode'");maintenance=false;status.maintenance='OFF';};
 const setPhase=x=>{phase=x;console.log('UI_PHASE '+x);};
 try{
  check(/^private-releases\/[a-f0-9-]+\.json$/.test(process.env.RELEASE_MANIFEST_KEY||''),'PRIVATE_MANIFEST_KEY_REQUIRED');
  if(action==='deploy'){requireApproval(process.env.DREAMTEAM_PRODUCTION_APPROVED);check(status.pr15.merged&&status.pr16.merged,'APPROVED_PRS_NOT_MERGED');check(status.main===candidate,'MAIN_MOVED');check(tree(candidate)===tree(APPROVED),'MERGED_TREE_CHANGED');}
  sourceVersion=status.worker;check(/^[a-f0-9]{40}$/.test(status.sourceCommit),'SOURCE_COMMIT_UNKNOWN');check(/export const requiredSchema=30;/.test(git('show',status.sourceCommit+':src/ensure-schema.js')),'SOURCE_ROLLBACK_SCHEMA_NOT_PROVEN');
  setPhase('fresh private checkpoint');
  const [settings,deployments,version]=await Promise.all([cf('/workers/scripts/dream-team/settings'),cf('/workers/scripts/dream-team/deployments'),cf('/workers/scripts/dream-team/versions/'+sourceVersion)]);
  const source=await exportSql('wrangler.jsonc','dream-team-db',join(dir,'source.sql')),snapshot=inspectSql(source.bytes);
  check(snapshot.tables.find(t=>t.name==='app_settings').rows.find(r=>r.key==='schema_version')?.value==='30','CHECKPOINT_SCHEMA_NOT_30');check(snapshot.tables.find(t=>t.name==='d1_migrations').rows.length===30,'CHECKPOINT_REGISTRY');
  originalMaintenance=snapshot.tables.find(t=>t.name==='app_settings').rows.find(r=>r.key==='maintenance_mode');check(originalMaintenance?.value!=='on','SOURCE_MAINTENANCE_ON');await verifySnapshot({uuid:productionId},snapshot);
  const bookmark=await cf('/d1/database/'+productionId+'/time_travel/bookmark');check(bookmark,'TIME_TRAVEL_BOOKMARK');
  for(const bucket of [archive,media]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
  await privatePut(archive,'source.sql',join(dir,'source.sql'),dir);status.backupD1={result:'PASS',sha256:source.sha256,bookmarkSaved:true,archive};
  const previous=await configFile(dir,{settings,deployments,version,sourceCommit:status.sourceCommit,sourceSchema:30,createdAt:new Date().toISOString()},'previous-worker.json');await privatePut(archive,'previous-worker.json',previous,dir);
  setPhase('real isolated D1 restore, schema30 without migrations');
  clone=await cf('/d1/database','POST',{name:name+'-db'});assertSandbox(clone.name,clone.uuid);
  const cloneConfig=await configFile(dir,{name,compatibility_date:base.compatibility_date,d1_databases:[{binding:'DB',database_name:clone.name,database_id:clone.uuid}]},'clone.jsonc');
  status.restoreD1={result:'PASS',...await importSandboxSql(clone,cloneConfig,join(dir,'source.sql'))};
  setPhase('private R2 backup and verified restore');
  let ioSource=await readFile('scripts/restore-io-worker.js','utf8');ioSource=ioSource.replace("if(path==='/backup'",`if(path==='/verify'&&request.method==='GET'){
   const m=await(await env.ARCHIVE.get('manifest.json')).json(),keys=[];let cursor;do{const x=await env.SOURCE.list({cursor});keys.push(...x.objects.map(o=>o.key));cursor=x.truncated?x.cursor:undefined;}while(cursor);if(keys.length!==m.entries.length)throw Error('SOURCE_CHANGED');for(const x of m.entries){const o=await env.SOURCE.get(x.key);if(!o||o.size!==x.size||await digest(await o.arrayBuffer())!==x.sha256||metadata(o.httpMetadata)!==metadata(x.httpMetadata)||metadata(o.customMetadata)!==metadata(x.customMetadata))throw Error('SOURCE_CHANGED');}return response({ok:true,objects:keys.length});
  }
  if(path==='/backup'`);
  await writeFile(join(dir,'io.mjs'),ioSource);const ioConfig=await configFile(dir,{name:name+'-io',main:join(dir,'io.mjs'),workers_dev:true,compatibility_date:base.compatibility_date,triggers:{crons:[]},r2_buckets:[{binding:'SOURCE',bucket_name:'dream-team-media'},{binding:'ARCHIVE',bucket_name:archive},{binding:'RESTORED',bucket_name:media}]},'io.jsonc');ioCreated=true;
  const ioOut=wrangler(['deploy','--config',ioConfig]),ioUrl=ioOut.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(ioUrl,'IO_URL');const key=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',ioConfig],JSON.stringify({RECOVERY_KEY:key}));
  async function io(path,method='GET'){for(let i=0;i<20;i++){const r=await fetch(ioUrl+path,{method,headers:{'x-recovery-key':key},signal:AbortSignal.timeout(120000)});if(r.status===200){const d=await r.json();check(d.ok,'R2_OPERATION_FAILED');return d;}if(![401,404,502,503,504].includes(r.status)||i===19)throw Error('R2_OPERATION_FAILED');await new Promise(r=>setTimeout(r,1500));}}
  await io('/ready');const r2=await io('/backup','POST'),restored=await privateRestore(ioUrl,key);check(restored.data.objects===r2.objects,'R2_RESTORE_COUNT');status.backupR2={result:'PASS',objects:r2.objects,manifestSha256:r2.manifestSha256,restore:'PASS'};
  setPhase('isolated candidate smoke before maintenance');
  // Only the NEW disposable clone loses copied sessions; production's session table is never purged.
  await query(clone.uuid,'DELETE FROM auth_sessions');await query(clone.uuid,'DELETE FROM auth_login_limits');
  const wrapper=join(dir,'canary.mjs');await writeFile(wrapper,`import app from ${JSON.stringify(process.cwd()+'/src/worker.js')};export default {async fetch(r,e,c){if(!e.RELEASE_GATE_KEY||r.headers.get('x-release-gate')!==e.RELEASE_GATE_KEY)return new Response('Unavailable',{status:503});return app.fetch(r,e,c);},scheduled(){}};`);
  const cfg={...base,name,main:wrapper,workers_dev:true,triggers:{crons:[]},secrets:undefined,assets:{...base.assets,directory:process.cwd()+'/public'},vars:{APP_ENV:'preview',APP_BUILD:candidate,INDIVIDUAL_ACCOUNTS:'true',AI_FREE_ONLY:'false',TRANSLATION_ENABLED:'false',TRANSLATION_FREE_CONFIRMED:'false'},d1_databases:[{binding:'DB',database_name:clone.name,database_id:clone.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:media}]};delete cfg.ai;
  const canaryConfig=await configFile(dir,cfg,'canary.jsonc');canaryCreated=true;const canaryOut=wrangler(['deploy','--config',canaryConfig]),canaryUrl=canaryOut.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(canaryUrl,'CANARY_URL');const gate=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',canaryConfig],JSON.stringify({RELEASE_GATE_KEY:gate,...Object.fromEntries(['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'].map(k=>[k,process.env[k]]))}));
  for(let i=0;i<20;i++){const r=await fetch(canaryUrl+'/login',{headers:{'x-release-gate':gate}});if(r.status===200)break;if(i===19)throw Error('CANARY_NOT_READY');await new Promise(r=>setTimeout(r,1500));}
  status.isolatedSmoke=await smoke(canaryUrl,candidate,{gate});
  await verifySnapshot({uuid:productionId},snapshot);await io('/verify');check((await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id===sourceVersion,'SOURCE_WORKER_CHANGED');
  const manifest={format:'dream-team-ui-schema30-v1',candidate,approvedTree:tree(APPROVED),createdAt:new Date().toISOString(),databaseId:productionId,schema:30,migrations:0,sessionPurge:false,productionWrites:0,sourceArchive:archive,sqlSha256:source.sha256,bookmark,previousWorkerVersion:sourceVersion,previousCommit:status.sourceCommit,restoreD1:status.restoreD1,restoreR2:status.backupR2,isolatedSmoke:status.isolatedSmoke.result};
  const mf=await configFile(dir,manifest,'manifest.json');status.manifest={key:process.env.RELEASE_MANIFEST_KEY,sha256:await privatePut('dream-team-d1-backups',process.env.RELEASE_MANIFEST_KEY,mf,dir)};
  if(action==='prepare'){status.result='PASS';status.productionWrites=0;return;}
  setPhase('fresh release gate and write barrier');await queueGate();check((await gh('/git/ref/heads/main')).object.sha===candidate,'MAIN_MOVED');check(Date.now()-Date.parse(manifest.createdAt)<15*60000,'RECOVERY_POINT_EXPIRED');await verifySnapshot({uuid:productionId},snapshot);await io('/verify');
  await query(productionId,"INSERT INTO app_settings(key,value) VALUES('maintenance_mode','on') ON CONFLICT(key) DO UPDATE SET value='on'");maintenance=true;status.maintenance='ON';
  for(const[path,method]of[['/login','GET'],['/api/bootstrap','GET'],['/api/checklist','POST']])check((await http(path,{method})).status===503,'MAINTENANCE_BARRIER');await verifyRows(snapshot,{maintenance:true});
  setPhase('deploy identical approved application, zero migrations');
  const target=await configFile(dir,{...base,main:process.cwd()+'/src/worker.js',assets:{...base.assets,directory:process.cwd()+'/public'},vars:{...status.vars,APP_BUILD:candidate}},'production.jsonc');
  deployed=true;wrangler(['deploy','--config',target]);const active=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(active.versions.length===1&&active.versions[0].percentage===100,'TARGET_TRAFFIC');status.activeWorker=active.versions[0].version_id;
  const activeVersion=await cf('/workers/scripts/dream-team/versions/'+status.activeWorker),bindings=activeVersion.resources.bindings;
  for(const b of version.resources.bindings){const wanted=b.type==='plain_text'&&b.name==='APP_BUILD'?{...b,text:candidate}:b;check(bindings.some(x=>x.name===b.name&&x.type===b.type&&['text','id','bucket_name'].every(k=>wanted[k]===undefined||x[k]===wanted[k])),'BINDING_OR_CONFIG_CHANGED');}
  check(rowsDigest((await cf('/workers/scripts/dream-team/schedules')).schedules.map(s=>({cron:s.cron})))===rowsDigest(status.cron.schedules.map(s=>({cron:s.cron}))),'CRON_CHANGED');await verifyRows(snapshot,{maintenance:true});
  for(let i=0;i<25;i++){const r=await http('/login');if(r.status===503&&r.headers.get('x-dreamteam-build')===candidate)break;if(i===24)throw Error('DEPLOYMENT_NOT_READY');await new Promise(r=>setTimeout(r,1500));}
  await off();setPhase('real production themes, language, sessions, weather, Photos, checklist and PWA smoke');
  status.productionSmoke=await smoke(PRODUCTION,candidate,{pwa:true});await verifyRows(snapshot,{operational:true});await io('/verify');
  check((await q(productionId,'PRAGMA foreign_key_check')).length===0,'FINAL_FOREIGN_KEYS');check((await q(productionId,'PRAGMA quick_check'))[0].quick_check==='ok','FINAL_INTEGRITY');
  status.originalSessionsPreserved=snapshot.tables.find(t=>t.name==='auth_sessions').rows.length;status.accountsUnchanged=true;status.schema=30;status.migrations=0;status.productionWrites='maintenance and own authentication only';status.translations=await q(productionId,'SELECT status,COUNT(*) n FROM translation_jobs GROUP BY status');
  status.counts={};for(const t of ['trips','lakes','catches','checklist_items','auth_accounts','auth_sessions','content_translations'])status.counts[t]=(await q(productionId,'SELECT COUNT(*) n FROM '+identifier(t)))[0].n;
  status.deployment='SUCCESS';status.result='PASS';status.activeCommit=candidate;status.productionUrl=PRODUCTION;const final=await configFile(dir,{...manifest,finishedAt:new Date().toISOString(),status},'completed.json');await privatePut(archive,'completed-release.json',final,dir);
 }catch(e){status.phase=phase;status.deployment='BLOCKED';status.operation=e.operation;status.safeReason=e.safeReason;status.stage=e.stage;status.table=e.table;status.deployDetail=e.deployDetail;
  if(maintenance||deployed){try{check((await q(productionId,"SELECT value FROM app_settings WHERE key='schema_version'"))[0]?.value==='30','ROLLBACK_SCHEMA_CHANGED');if(deployed){wrangler(['rollback',sourceVersion,'--name','dream-team','--message','UI release safe schema30 rollback']);status.rollback='PASS';}await off();check((await http('/login')).status===200,'RECOVERY_PUBLIC_UNAVAILABLE');status.previousWorkerRetained=true;}catch{status.recovery='BLOCKED';status.maintenance=maintenance?'ON':'OFF';}}
  throw e;
 }finally{
  if(canaryCreated)try{await cf('/workers/scripts/'+name,'DELETE');}catch{status.canaryCleanup='BLOCKED';}
  if(ioCreated)try{await cf('/workers/scripts/'+name+'-io','DELETE');}catch{status.ioCleanup='BLOCKED';}
  if(clone)try{await cf('/d1/database/'+clone.uuid,'DELETE');}catch{status.cloneCleanup='BLOCKED';}await rm(dir,{recursive:true,force:true});
 }
}
