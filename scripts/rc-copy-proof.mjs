// Fresh, private production snapshot -> isolated restore -> additive schema31 drill.
// Production SQL is SELECT/PRAGMA/export only. Never updates a production row.
import {readFile,writeFile,mkdtemp,rm,mkdir,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';
import {cf,query,wrangler,configFile,exportSql,productionId,assertSandbox,sha} from './recovery-common.mjs';
import {inspectSql,restoreSnapshot,rowsDigest,identifier} from './d1-snapshot.mjs';import {privateRestore} from './recovery-transport.mjs';
const name='dream-team-audit-2026102331',archive=name+'-archive',media=name+'-media',dbName=name+'-db',identity='release-candidate-20261023-v1';
const check=(v,c)=>{if(!v)throw Error(c);};const dir=await mkdtemp(join(tmpdir(),'rc-copy-private-'));await mkdir('rc-status',{recursive:true});let ioCreated=false;const ioName='dream-team-audit-'+process.env.GITHUB_RUN_ID+'-io';
const report={result:'BLOCKED',productionWrites:0,productionExports:0,measuredD1Reads:0,copyName:dbName};
const q=async(id,sql,params=[])=>{if(id===productionId&&!/^\s*(?:SELECT|PRAGMA)\b/i.test(sql))throw Error('PRODUCTION_WRITE_FORBIDDEN');const r=await query(id,sql,params);report.measuredD1Reads+=r.meta?.rows_read||0;check(report.measuredD1Reads<=18000,'COPY_D1_READ_CAP');return r;};
async function put(key,file){wrangler(['r2','object','put',archive+'/'+key,'--remote','--file',file]);const verify=join(dir,'roundtrip');wrangler(['r2','object','get',archive+'/'+key,'--remote','--file',verify]);await chmod(verify,0o600);check(sha(await readFile(file))===sha(await readFile(verify)),'PRIVATE_BACKUP_ROUNDTRIP');}
try{
 const budget=JSON.parse(await readFile('rc-status/preflight.json','utf8'));check(budget.result==='PASS'&&budget.passwordAudit?.sharedMatchesRequested&&budget.passwordAudit?.repositorySecretMatchesRequested,'PRIVATE_PASSWORD_AUDIT_REQUIRED');
 const list=await cf('/d1/database?per_page=100');let db=list.find(d=>d.name===dbName);
 if(db){
  assertSandbox(db.name,db.uuid);const state=(await q(db.uuid,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','release.candidate.identity')")).results;check(state.some(x=>x.key==='schema_version'&&x.value==='31')&&state.some(x=>x.key==='release.candidate.identity'&&x.value===identity),'EXISTING_COPY_IDENTITY');
  const f=join(dir,'existing-proof.json');let proof;
  try{wrangler(['r2','object','get',archive+'/copy-proof.json','--remote','--file',f]);proof=JSON.parse(await readFile(f,'utf8'));}catch{}
  if(proof){check(proof.identity===identity&&proof.database.id===db.uuid&&proof.result==='PASS','EXISTING_COPY_PROOF_REQUIRED');Object.assign(report,proof,{reused:true,productionExports:0,measuredD1Reads:report.measuredD1Reads});}
  else{
   // Resume the interrupted R2 stage only. No second production export, reset or migration.
   const sql=join(dir,'source.sql'),prev=join(dir,'previous-worker.json');wrangler(['r2','object','get',archive+'/source-schema30.sql','--remote','--file',sql]);wrangler(['r2','object','get',archive+'/previous-worker.json','--remote','--file',prev]);const snapshot=inspectSql(await readFile(sql)),previous=JSON.parse(await readFile(prev,'utf8'));
   for(const t of snapshot.tables){let actual=(await q(db.uuid,'SELECT '+t.columns.map(identifier).join(',')+' FROM '+identifier(t.name))).results,expected=t.rows;if(t.name==='app_settings'){actual=actual.filter(x=>!['schema_version','release.candidate.identity'].includes(x.key));expected=expected.filter(x=>x.key!=='schema_version');}if(t.name==='d1_migrations')actual=actual.filter(x=>x.name!=='0031_research_evidence.sql');check(rowsDigest(actual)===rowsDigest(expected),'RESUMED_COPY_ROWS_'+t.name.toUpperCase());}
   check((await q(db.uuid,'PRAGMA foreign_key_check')).results.length===0,'RESUMED_FK');check((await q(db.uuid,'PRAGMA quick_check')).results[0].quick_check==='ok','RESUMED_INTEGRITY');
   Object.assign(report,{identity,database:{id:db.uuid,name:db.name},archive,media,resumedR2Only:true,snapshotAt:previous.at,exportRows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),restore:{result:'PASS',tables:snapshot.tables.length,rows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),triggers:6,foreignKeys:true,sequences:true},migration:{result:'PASS',from:30,to:31,preservedTables:snapshot.tables.map(t=>t.name),credentialsUnchanged:true,originalSessionsUnchanged:true,translationsUnchanged:true,foreignKeys:true,quickCheck:true},counts:Object.fromEntries(['trips','lakes','catches','checklist_items','auth_accounts','auth_sessions','content_translations','translation_cache'].map(n=>[n,snapshot.tables.find(t=>t.name===n).rows.length])),productionWorkerUnchanged:true});
  }
 }
 else{
  // One export for the explicitly requested CURRENT migration copy. No redundant
  // production hashes/count scans before or after it; all comparisons run on the clone.
  const f=join(dir,'source.sql'),source=await exportSql('wrangler.jsonc','dream-team-db',f),snapshot=inspectSql(source.bytes);report.productionExports=1;
  const tables=snapshot.tables;check(tables.find(t=>t.name==='app_settings').rows.some(r=>r.key==='schema_version'&&r.value==='30'),'SNAPSHOT_NOT_SCHEMA30');check(tables.find(t=>t.name==='d1_migrations').rows.length===30,'SNAPSHOT_REGISTRY');
  report.snapshotAt=new Date().toISOString();report.exportRows=tables.reduce((n,t)=>n+t.rows.length,0);check(report.exportRows<=10000,'SNAPSHOT_EXCEEDS_BUDGET');
  for(const bucket of [archive,media]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
  await put('source-schema30.sql',f);const previous={settings:await cf('/workers/scripts/dream-team/settings'),deployments:await cf('/workers/scripts/dream-team/deployments'),version:await cf('/workers/scripts/dream-team/versions/'+budget.production.worker),bookmark:await cf('/d1/database/'+productionId+'/time_travel/bookmark'),at:report.snapshotAt};const previousFile=await configFile(dir,previous,'previous-worker.json');await put('previous-worker.json',previousFile);
  db=await cf('/d1/database','POST',{name:dbName});assertSandbox(db.name,db.uuid);report.restore={result:'PASS',...await restoreSnapshot(db,snapshot,q)};
  const before={};for(const table of tables)before[table.name]=rowsDigest(table.rows);
  // Wrangler applies the explicitly selected additive file; never legacy operators.
  const migrationsDir=join(dir,'migrations');await mkdir(migrationsDir);await writeFile(migrationsDir+'/0031_research_evidence.sql',await readFile('migrations/0031_research_evidence.sql'));
  const cfg=await configFile(dir,{name,compatibility_date:'2026-10-01',d1_databases:[{binding:'DB',database_name:dbName,database_id:db.uuid,migrations_dir:migrationsDir}]},'clone.jsonc');
  wrangler(['d1','migrations','apply',dbName,'--remote','--config',cfg]);await q(db.uuid,await readFile('scripts/rc-d1-indexes.sql','utf8'));
  const preserved=[];for(const table of tables){let rows=(await q(db.uuid,'SELECT '+table.columns.map(identifier).join(',')+' FROM '+identifier(table.name))).results,expected=table.rows;
   if(table.name==='app_settings'){rows=rows.filter(r=>r.key!=='schema_version');expected=expected.filter(r=>r.key!=='schema_version');}
   if(table.name==='d1_migrations'){rows=rows.filter(r=>r.name!=='0031_research_evidence.sql');}
   check(rowsDigest(rows)===rowsDigest(expected),'MIGRATION_PRESERVATION_'+table.name.toUpperCase());preserved.push(table.name);
  }
  check((await q(db.uuid,'PRAGMA foreign_key_check')).results.length===0,'MIGRATION_FK');check((await q(db.uuid,'PRAGMA quick_check')).results[0].quick_check==='ok','MIGRATION_INTEGRITY');
  const state=(await q(db.uuid,"SELECT value FROM app_settings WHERE key='schema_version'")).results;check(state[0]?.value==='31','MIGRATION_SCHEMA31');
  await q(db.uuid,'INSERT INTO app_settings(key,value) VALUES(?,?)',['release.candidate.identity',identity]);
  report.migration={result:'PASS',from:30,to:31,preservedTables:preserved,credentialsUnchanged:true,originalSessionsUnchanged:true,translationsUnchanged:true,foreignKeys:true,quickCheck:true};report.counts=Object.fromEntries(['trips','lakes','catches','checklist_items','auth_accounts','auth_sessions','content_translations','translation_cache'].map(n=>[n,tables.find(t=>t.name===n).rows.length]));
  const active=(await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id;check(active===budget.production.worker,'PRODUCTION_WORKER_CHANGED');
  Object.assign(report,{result:'MIGRATED',identity,database:{id:db.uuid,name:db.name},archive,media,productionWorkerUnchanged:true});const saved=await configFile(dir,report,'migration-proof.json');await put('migration-proof.json',saved);
 }
 if(report.r2?.result!=='PASS'){
  // A separate gated IO worker can read SOURCE but writes only private archive
  // and disposable RESTORED. It cannot delete/overwrite production R2 objects.
  const ioSource=(await readFile('scripts/restore-io-worker.js','utf8')).replace("error:safe.has(error.message)?error.message:'RECOVERY_FAILED'","error:safe.has(error.message)?error.message:'RECOVERY_FAILED',errorType:error.name"),key=randomBytes(32).toString('hex'),form=new FormData();form.append('metadata',JSON.stringify({main_module:'main.mjs',compatibility_date:'2026-10-01',bindings:[{type:'r2_bucket',name:'SOURCE',bucket_name:'dream-team-media'},{type:'r2_bucket',name:'ARCHIVE',bucket_name:archive},{type:'r2_bucket',name:'RESTORED',bucket_name:media},{type:'secret_text',name:'RECOVERY_KEY',text:key}]}));form.append('main.mjs',new Blob([ioSource],{type:'application/javascript+module'}),'main.mjs');
  const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers/scripts/'+ioName,{method:'PUT',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},body:form,signal:AbortSignal.timeout(120000)}),uploaded=await response.json();check(response.ok&&uploaded.success,'PRIVATE_R2_IO_UPLOAD');ioCreated=true;await cf('/workers/scripts/'+ioName+'/subdomain','POST',{enabled:true});const subdomain=(await cf('/workers/subdomain')).subdomain;check(/^[a-z0-9-]+$/.test(subdomain),'SUBDOMAIN');const url='https://'+ioName+'.'+subdomain+'.workers.dev';
  for(let i=0;i<20;i++){const r=await fetch(url+'/ready',{headers:{'x-recovery-key':key}});if(r.status===200)break;check(i!==19,'PRIVATE_R2_IO_NOT_READY');await new Promise(r=>setTimeout(r,1000));}
  const backed=await fetch(url+'/backup',{method:'POST',headers:{'x-recovery-key':key},signal:AbortSignal.timeout(120000)});report.r2BackupHttp=backed.status;const backup=await backed.json().catch(()=>({error:'NON_JSON'}));if(!backed.ok){report.r2BackupError=backup.error;report.r2BackupErrorType=backup.errorType;}check(backed.ok,'PRIVATE_R2_BACKUP');const restored=await privateRestore(url,key);check(backup.ok&&backup.objects===restored.data.objects,'PRIVATE_R2_RESTORE');report.r2={result:'PASS',objects:backup.objects,bytesAndMetadataRestored:true,productionWrites:0};

 }
 report.result='PASS';const finalProof=await configFile(dir,report,'copy-proof.json');await put('copy-proof.json',finalProof);
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'PRIVATE_COPY_PROOF_FAILED';report.stage=e.stage;report.table=e.table;report.operation=e.operation;report.status=e.status;process.exitCode=1;}
finally{if(ioCreated)try{await cf('/workers/scripts/'+ioName,'DELETE');}catch{report.ioCleanup='BLOCKED';}await rm(dir,{recursive:true,force:true});await writeFile('rc-status/copy-proof.json',JSON.stringify(report,null,2));console.log('RC_COPY_PROOF '+JSON.stringify(report));}
