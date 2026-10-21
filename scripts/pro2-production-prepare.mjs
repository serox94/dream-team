// Fresh recovery proof before any production maintenance; imports only hash-matched translations.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm,chmod} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {randomUUID,randomBytes} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {cf,query,productionId,sha,wrangler,configFile,exportSql,assertSandbox,importSandboxSql,remoteDb} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest} from './d1-snapshot.mjs';
import {validateMigrationState,oldManifest,compareManifest,migrateCopy} from './migration-contract.mjs';
import {originals,entities} from '../src/content-translations.js';
import {privateRestore} from './recovery-transport.mjs';
const previewId='c45a6a34-3ca4-46fb-bef5-ff17b8d9caee';
const q=async(id,sql,args=[])=>(await query(id,sql,args)).results;
const check=(x,code)=>{if(!x)throw Error(code);};
export const wrap=db=>({prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}};}});
export async function matchedImport(db){
 const input=new Map();for(const entity of Object.keys(entities))for(const s of await originals({DB:wrap(db)},entity))input.set([s.entity,s.recordId,s.field,s.sourceHash].join('|'),s);
 const [translations,sources,jobs,cache]=await Promise.all([q(previewId,'SELECT * FROM content_translations'),q(previewId,'SELECT * FROM content_sources'),q(previewId,"SELECT * FROM translation_jobs WHERE status='complete'"),q(previewId,'SELECT * FROM translation_cache')]);
 const selected=[];
 for(const t of translations){
  if(!input.has([t.entity,t.record_id,t.field,t.source_hash].join('|')))continue;
  const s=sources.find(s=>s.entity===t.entity&&s.record_id===t.record_id&&s.field===t.field&&s.source_hash===t.source_hash&&s.source_language!==t.language),j=jobs.find(j=>j.entity===t.entity&&j.record_id===t.record_id&&j.field===t.field&&j.language===t.language&&j.source_hash===t.source_hash);if(!s||!j)continue;
  // An existing production translation, including a manual correction, always wins.
  if(db.prepare('SELECT 1 FROM content_translations WHERE entity=? AND record_id=? AND field=? AND language=?').get(t.entity,t.record_id,t.field,t.language))continue;
  selected.push({translation:{...t,updated_by:null},source:s,job:j});
 }
 // Copy only cache entries for selected full-field hashes and their actual chunk keys.
 const keys=new Set(selected.map(r=>r.translation.source_hash));const {chunks}=await import('../src/m2m100.js');const {hash}=await import('../src/content-translations.js');
 for(const r of selected){const s=input.get([r.translation.entity,r.translation.record_id,r.translation.field,r.translation.source_hash].join('|'));for(const c of chunks(s.sourceText))if(c.text?.trim())for(const prefix of ['m2m100-chunk-v1:','m2m100-reviewed-70b-chunk-v1:'])keys.add(await hash(prefix+c.text.trim()));}
 const selectedCache=cache.filter(c=>keys.has(c.source_hash));
 return {records:selected,cache:selectedCache,matched:selected.length,eligible:input.size,excluded:translations.length-selected.length};
}
export function applyMatchedLocal(db,transfer){
 const insert=(table,row)=>{const cols=Object.keys(row);db.prepare('INSERT OR IGNORE INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')').run(...cols.map(k=>row[k]));};
 for(const r of transfer.records){insert('content_sources',r.source);insert('content_translations',r.translation);insert('translation_jobs',r.job);}for(const c of transfer.cache)insert('translation_cache',c);
 db.prepare("INSERT INTO app_settings(key,value) VALUES('translation.pipeline-version','m2m100-reviewed-70b-v1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
}
export async function privatePut(bucket,key,file,dir){wrangler(['r2','object','put',bucket+'/'+key,'--remote','--file',file]);const copy=join(dir,randomUUID()+'.verify');wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',copy]);await chmod(copy,0o600);check(sha(await readFile(copy))===sha(await readFile(file)),'PRIVATE_BACKUP_ROUNDTRIP');return sha(await readFile(file));}
export async function prepare(status){
 const candidate=process.env.RELEASE_CANDIDATE,run=process.env.GITHUB_RUN_ID,name='dream-team-audit-'+run,dir=await mkdtemp(join(tmpdir(),'pro2-release-private-'));
 const base=JSON.parse(await readFile('wrangler.jsonc','utf8')),dbs=[];let ioCreated=false,canaryCreated=false,phase='fresh source checkpoint';
 const archive=name+'-archive',restoredMedia=name+'-media';
 try{
  check(/^private-releases\/[a-f0-9-]+\.json$/.test(process.env.RELEASE_MANIFEST_KEY||''),'PRIVATE_MANIFEST_KEY_REQUIRED');
  const version=status.production.worker;const [settings,deployment,activeVersion]=await Promise.all([cf('/workers/scripts/dream-team/settings'),cf('/workers/scripts/dream-team/deployments'),cf('/workers/scripts/dream-team/versions/'+version)]);
  const source=await exportSql('wrangler.jsonc','dream-team-db',join(dir,'source.sql')),snapshot=inspectSql(source.bytes),db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});db.exec(source.bytes.toString());check(validateMigrationState(db)===29,'SOURCE_SCHEMA_NOT_29');const preservation=oldManifest(db);const beforeAuth=Object.fromEntries(snapshot.tables.filter(t=>t.name.startsWith('auth_')).map(t=>[t.name,rowsDigest(t.rows)]));
  await verifySnapshot({uuid:productionId},snapshot);const bookmark=await cf('/d1/database/'+productionId+'/time_travel/bookmark');check(bookmark,'TIME_TRAVEL_BOOKMARK');
  for(const bucket of [archive,restoredMedia]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
  await privatePut(archive,'source.sql',join(dir,'source.sql'),dir);
  const previousFile=await configFile(dir,{settings,deployment,activeVersion,createdAt:new Date().toISOString(),sourceCommit:status.production.commit,sourceSchema:29},'previous-worker.json');await privatePut(archive,'previous-worker.json',previousFile,dir);
  status.backupD1={result:'PASS',sha256:source.sha256,bookmarkSaved:true};
  phase='isolated D1 restore and migration rehearsal';
  const clone=await cf('/d1/database','POST',{name:name+'-db'});assertSandbox(clone.name,clone.uuid);dbs.push(clone);
  const cloneConfig=await configFile(dir,{name,compatibility_date:base.compatibility_date,d1_databases:[{binding:'DB',database_name:clone.name,database_id:clone.uuid,migrations_dir:process.cwd()+'/migrations'}]},'clone.jsonc');
  const restored=await importSandboxSql(clone,cloneConfig,join(dir,'source.sql'));status.restore29={result:'PASS',...restored};
  wrangler(['d1','migrations','apply',clone.name,'--remote','--config',cloneConfig]);const migrated=await exportSql(cloneConfig,clone.name,join(dir,'migrated.sql')),rehearsal=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});
  rehearsal.exec(migrated.bytes.toString());check(validateMigrationState(rehearsal)===30,'ISOLATED_SCHEMA_NOT_30');compareManifest(rehearsal,preservation);for(const [table,hash] of Object.entries(beforeAuth))check(rowsDigest(rehearsal.prepare('SELECT * FROM '+table).all())===hash,'AUTH_CHANGED_BY_MIGRATION');
  const transfer=await matchedImport(rehearsal);check(transfer.matched===400,'ORIGINAL_TRANSLATION_IMPORT_COUNT_CHANGED');applyMatchedLocal(rehearsal,transfer);
  const france=rehearsal.prepare("SELECT * FROM trips WHERE id='next-trip'").get();check(france.start_at.startsWith('2026-11-14')&&france.end_at.startsWith('2026-11-21'),'FRANCE_ID_MISMATCH');rehearsal.prepare('UPDATE trips SET google_photos_url=? WHERE id=?').run('https://photos.app.goo.gl/THtvVFEPAogMtsuG7','next-trip');
  const transferFile=await configFile(dir,transfer,'approved-translations.json');const transferSha=await privatePut(archive,'approved-translations.json',transferFile,dir);status.translationImport={matched:transfer.matched,eligible:transfer.eligible,excluded:transfer.excluded,cache:transfer.cache.length,sha256:transferSha};
  status.migrationRehearsal={result:'PASS',from:29,to:30,accountRowsUnchanged:true};
  // The fresh clone is disposable; remove copied sessions before any candidate exposure.
  await query(clone.uuid,'DELETE FROM auth_sessions');await query(clone.uuid,'DELETE FROM auth_login_limits');
  const insert=async(table,row)=>{const cols=Object.keys(row);await query(clone.uuid,'INSERT OR IGNORE INTO '+table+'('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')',cols.map(k=>row[k]));};
  for(const r of transfer.records){await insert('content_sources',r.source);await insert('content_translations',r.translation);await insert('translation_jobs',r.job);}for(const c of transfer.cache)await insert('translation_cache',c);
  await query(clone.uuid,"INSERT INTO app_settings(key,value) VALUES('translation.pipeline-version','m2m100-reviewed-70b-v1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");await query(clone.uuid,'UPDATE trips SET google_photos_url=? WHERE id=?',['https://photos.app.goo.gl/THtvVFEPAogMtsuG7','next-trip']);
  status.importRehearsal={result:'PASS',completed:(await q(clone.uuid,"SELECT COUNT(*) n FROM translation_jobs WHERE status='complete'"))[0].n};
  phase='private R2 backup and restore';
  const ioConfig=await configFile(dir,{name:name+'-io',main:process.cwd()+'/scripts/restore-io-worker.js',workers_dev:true,compatibility_date:base.compatibility_date,triggers:{crons:[]},r2_buckets:[{binding:'SOURCE',bucket_name:'dream-team-media'},{binding:'ARCHIVE',bucket_name:archive},{binding:'RESTORED',bucket_name:restoredMedia}]},'io.jsonc');ioCreated=true;
  const output=wrangler(['deploy','--config',ioConfig]),ioUrl=output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(ioUrl,'IO_URL');const key=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',ioConfig],JSON.stringify({RECOVERY_KEY:key}));
  let response;for(let n=0;n<20;n++){response=await fetch(ioUrl+'/ready',{headers:{'x-recovery-key':key},signal:AbortSignal.timeout(15000)});if(response.status===200)break;await new Promise(r=>setTimeout(r,1500));}check(response.status===200,'IO_NOT_READY');
  const backup=await fetch(ioUrl+'/backup',{method:'POST',headers:{'x-recovery-key':key},signal:AbortSignal.timeout(120000)}),r2=await backup.json();check(backup.ok&&r2.ok,'R2_BACKUP_FAILED');const restore=await privateRestore(ioUrl,key);check(restore.data.objects===r2.objects,'R2_RESTORE_FAILED');
  status.backupR2={result:'PASS',objects:r2.objects,manifestSha256:r2.manifestSha256};status.restoreR2='PASS';
  phase='isolated candidate API smoke before maintenance';
  const wrapper=join(dir,'canary.mjs');await writeFile(wrapper,`import app from ${JSON.stringify(process.cwd()+'/src/worker.js')};export default {async fetch(request,env,ctx){if(!env.RELEASE_GATE_KEY||request.headers.get('x-release-gate')!==env.RELEASE_GATE_KEY)return new Response('Unavailable',{status:503});return app.fetch(request,env,ctx);},scheduled(){}};`);
  const cfg={...base,name,main:wrapper,workers_dev:true,triggers:{crons:[]},assets:{...base.assets,directory:process.cwd()+'/public'},secrets:undefined,vars:{APP_ENV:'preview',APP_BUILD:candidate,INDIVIDUAL_ACCOUNTS:'true',AI_FREE_ONLY:'false',TRANSLATION_ENABLED:'false',TRANSLATION_FREE_CONFIRMED:'false'},d1_databases:[{binding:'DB',database_name:clone.name,database_id:clone.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:restoredMedia}]};delete cfg.ai;
  const canaryConfig=await configFile(dir,cfg,'canary.jsonc');canaryCreated=true;const out=wrangler(['deploy','--config',canaryConfig]),url=out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(url,'CANARY_URL');const gate=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',canaryConfig],JSON.stringify({RELEASE_GATE_KEY:gate,...Object.fromEntries(['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'].map(k=>[k,process.env[k]]))}));
  const request=(path,options={})=>fetch(url+path,{redirect:'manual',signal:AbortSignal.timeout(45000),...options,headers:{'x-release-gate':gate,...options.headers}});
  for(let n=0;n<20;n++){const r=await request('/login');if(r.status===200)break;if(n===19)throw Error('CANARY_NOT_READY');await new Promise(r=>setTimeout(r,1500));}
  status.isolatedAccounts=[];for(const username of ['Patryk','Maciek']){const login=await request('/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password:process.env.RYBY_LOGIN_PASSWORD})});check(login.status===303&&login.headers.get('set-cookie'),'CANARY_LOGIN');const cookie=login.headers.get('set-cookie').split(';')[0];
   for(const path of ['/api/bootstrap','/api/health','/api/content-translations?tripId=next-trip&language=en','/api/content-translations?tripId=la-plaine-2026&language=en','/api/water-measurements?tripId=next-trip','/pages/pogoda.html','/pages/polowy.html','/pages/wyjazdy.html'])check((await request(path,{headers:{cookie}})).status===200,'ISOLATED_CANDIDATE_ROUTE');status.isolatedAccounts.push({username,result:'PASS'});}
  status.isolatedCandidate='PASS';
  // No production mutation has occurred; reverify the original checkpoint and source Worker.
  await verifySnapshot({uuid:productionId},snapshot);check((await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id===version,'SOURCE_WORKER_CHANGED');
  const manifest={format:'dream-team-pro2-release-v1',candidate,preparedAt:new Date().toISOString(),databaseId:productionId,sourceSchema:29,targetSchema:30,sourceArchive:archive,sourceSqlKey:'source.sql',sourceSqlSha256:source.sha256,bookmark,previousWorkerVersion:version,previousCommit:status.production.commit,previousWorkerConfigKey:'previous-worker.json',r2Archive:archive,r2RestoredBucket:restoredMedia,r2ManifestSha256:r2.manifestSha256,r2Objects:r2.objects,migrationRehearsal:'PASS',restoreD1:'PASS',restoreR2:'PASS',isolatedCandidateSmoke:'PASS',translationImportKey:'approved-translations.json',translationImportSha256:transferSha,translationCount:transfer.matched,accountRowsUnchanged:true,sessionPurge:false,productionWrites:0,automaticRollbackAfterMigration:false};
  const manifestFile=await configFile(dir,manifest,'release-manifest.json');status.manifest={bucket:'dream-team-d1-backups',key:process.env.RELEASE_MANIFEST_KEY,sha256:await privatePut('dream-team-d1-backups',process.env.RELEASE_MANIFEST_KEY,manifestFile,dir)};status.sourceArchive=archive;status.result='PASS';db.close();rehearsal.close();
 }catch(e){status.phase=phase;throw e;}finally{
  if(canaryCreated)try{await cf('/workers/scripts/'+name,'DELETE');}catch{status.canaryCleanup='BLOCKED';}
  if(ioCreated)try{await cf('/workers/scripts/'+name+'-io','DELETE');}catch{status.ioCleanup='BLOCKED';}
  for(const db of dbs)try{await cf('/d1/database/'+db.uuid,'DELETE');}catch{status.cloneCleanup='BLOCKED';}await rm(dir,{recursive:true,force:true});
 }
}
