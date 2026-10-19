// Backup/restore rehearsal only. Production is read-only. No release operator, auth reset or app deploy.
import {readFile,writeFile,mkdtemp,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';import {execFileSync} from 'node:child_process';
import {cf,query,wrangler,sha,productionId,assertSandbox,configFile,exportSql,importSandboxSql} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest} from './d1-snapshot.mjs';
import {oldManifest,compareManifest,validateMigrationState} from './migration-contract.mjs';
import {privateRestore} from './recovery-transport.mjs';
const candidate=process.env.RELEASE_CANDIDATE,run=process.env.GITHUB_RUN_ID;
const check=(ok,code)=>{if(!ok)throw Error(code);};check(/^\d+$/.test(run||''),'RUN_REQUIRED');check(/^[a-f0-9]{40}$/.test(candidate||''),'CANDIDATE_REQUIRED');check(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.RELEASE_ACTION==='prepare','MANUAL_PREPARE_REQUIRED');check(/^private-releases\/[a-f0-9-]+\.json$/.test(process.env.RELEASE_MANIFEST_KEY||''),'PRIVATE_MANIFEST_REQUIRED');
const name='dream-team-audit-'+run,dir=await mkdtemp(join(tmpdir(),'dream-private-preflight-'));
const base=JSON.parse(await readFile('wrangler.jsonc','utf8')),dbs=[];let ioCreated=false,phase='required credential presence';
const result={candidate,executionSha:process.env.GITHUB_SHA,run:Number(run),at:new Date().toISOString(),result:'FAIL',productionD1Writes:0,productionWorkerDeployments:0,productionMediaWrites:0,providerCalls:0,backupD1:'NOT TESTED',backupR2:'NOT TESTED',restore:'NOT TESTED',migration:'NOT TESTED',data:'NOT TESTED',configuration:'NOT TESTED',manifest:'NOT CREATED',readyToDeployProduction:false};
const bookmark=x=>typeof x==='string'?x:x?.bookmark;
const localDb=bytes=>{const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});try{db.exec(bytes.toString());return db;}catch(error){db.close();throw error;}};
const privateStore=async(bucket,key,file,expected)=>{assertSandbox(bucket);wrangler(['r2','object','put',bucket+'/'+key,'--remote','--file',file]);const copy=join(dir,randomUUID()+'.verify');wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',copy]);await chmod(copy,0o600);check(sha(await readFile(copy))===expected,'PRIVATE_BACKUP_ROUNDTRIP_FAILED');};
const dbConfig=db=>({name,main:process.cwd()+'/scripts/maintenance-worker.js',compatibility_date:base.compatibility_date,triggers:{crons:[]},d1_databases:[{binding:'DB',database_name:db.name,database_id:db.uuid,migrations_dir:process.cwd()+'/migrations'}]});
const createDb=async suffix=>{const db=await cf('/d1/database','POST',{name:name+suffix});assertSandbox(db.name,db.uuid);dbs.push(db);return db;};
try{
 check(process.env.CLOUDFLARE_API_TOKEN&&process.env.CLOUDFLARE_ACCOUNT_ID,'CLOUDFLARE_CREDENTIALS_UNAVAILABLE');
 check(base.name==='dream-team'&&base.d1_databases[0].database_id===productionId,'UNEXPECTED_PRODUCTION_CONFIG');
 check(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===candidate,'CHECKOUT_NOT_CANDIDATE');
 phase='read deployed production Worker configuration';
 const settings=await cf('/workers/scripts/dream-team/settings');
 const deployments=await cf('/workers/scripts/dream-team/deployments'),active=deployments.deployments?.[0];check(active?.versions?.length===1&&active.versions[0].percentage===100,'SPLIT_PRODUCTION_TRAFFIC');
 const activeVersion=await cf('/workers/scripts/dream-team/versions/'+active.versions[0].version_id);
 const bindings=activeVersion.resources?.bindings||[],sourceDb=bindings.find(b=>b.name==='DB'&&b.type==='d1'),deployedMedia=bindings.find(b=>b.name==='MEDIA'&&b.type==='r2_bucket');
 check(sourceDb?.id===productionId,'DEPLOYED_D1_BINDING_MISMATCH');
 const plannedMedia=base.r2_buckets.find(b=>b.binding==='MEDIA').bucket_name;
 result.deployedR2Bindings=bindings.filter(b=>b.type==='r2_bucket').map(b=>({binding:b.name,bucket:b.bucket_name||null}));
 result.mediaBindingState=deployedMedia?.bucket_name===plannedMedia?'MATCHES_TARGET':deployedMedia?'DIFFERS_FROM_TARGET':'NOT_BOUND_IN_CURRENT_WORKER';
 // A legacy Worker may have no MEDIA binding yet. Inventory the existing intended bucket,
 // record the gap, and require explicit binding reconciliation during the approved release.
 const sourceMedia={bucket_name:deployedMedia?.bucket_name||plannedMedia};
 const mediaInfo=await cf('/r2/buckets/'+encodeURIComponent(sourceMedia.bucket_name));check(mediaInfo.name===sourceMedia.bucket_name,'MEDIA_BUCKET_IDENTITY_MISMATCH');
 check(active?.versions?.length>0,'ACTIVE_PRODUCTION_VERSION_UNAVAILABLE');
 const activeVersions=active.versions.map(v=>({id:v.version_id,percentage:v.percentage}));check(activeVersions.every(v=>v.id),'ACTIVE_VERSION_ID_MISSING');
 const requiredSecrets=['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'];
 const secrets=Object.fromEntries(requiredSecrets.map(key=>[key,bindings.some(b=>b.name===key&&b.type==='secret_text')]));
 result.requiredSecretBindings=secrets;result.githubAuthSecretPresence={password:!!process.env.RYBY_LOGIN_PASSWORD,sessionSecret:typeof process.env.RYBY_SESSION_SECRET==='string'&&process.env.RYBY_SESSION_SECRET.length>=32};
 const flagNames=['APP_ENV','APP_BUILD','INDIVIDUAL_ACCOUNTS','AI_FREE_ONLY'];
 const currentFlags=Object.fromEntries(bindings.filter(b=>b.type==='plain_text'&&flagNames.includes(b.name)).map(b=>[b.name,b.text]));
 result.configuration='DEPLOYED_STATE_CAPTURED';result.sourceIdentity='DEPLOYED_D1_AND_EXISTING_R2_VERIFIED';result.secretValuesVerified=false;
 const sourceD1Metadata=await cf('/d1/database/'+productionId);check(sourceD1Metadata.name===base.d1_databases[0].database_name,'PRODUCTION_DATABASE_NAME_MISMATCH');
 phase='fresh private production SQL and Time Travel bookmark';
 const workers=await cf('/workers/scripts'),worker=workers.find(w=>w.id==='dream-team');check(worker?.tag,'WORKER_TAG');const builds=await cf('/builds/workers/'+worker.tag+'/builds?per_page=100'),buildList=Array.isArray(builds)?builds:builds.builds;check(Array.isArray(buildList)&&!buildList.some(b=>['queued','pending','running','initializing','building'].includes(b.status)),'OTHER_BUILD_ACTIVE');
 const maintenance=(await query(productionId,"SELECT value FROM app_settings WHERE key='maintenance_mode'")).results[0];check(maintenance?.value!=='on','SOURCE_IN_MAINTENANCE');
 const bookmarkBefore=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));check(bookmarkBefore,'TIME_TRAVEL_BOOKMARK_MISSING');
 const source=await exportSql('wrangler.jsonc','dream-team-db',dir+'/source.sql'),snapshot=inspectSql(source.bytes),sourceLocal=localDb(source.bytes);let sourceSchema,preservation;
 try{sourceSchema=validateMigrationState(sourceLocal);preservation=oldManifest(sourceLocal);}finally{sourceLocal.close();}
 check(sourceSchema===28,'SOURCE_SCHEMA_NOT_28');
 const bookmarkExport=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));
 // Read-only equality check proves IDs, PB, catches, all checklist/archive rows, schema and counters.
 await verifySnapshot({uuid:productionId},snapshot);
 const bookmarkVerified=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));check(bookmarkExport&&bookmarkExport===bookmarkVerified,'SOURCE_CHANGED_DURING_BACKUP_VERIFY');
 const archive=name+'-archive',restoredMedia=name+'-media';for(const bucket of [archive,restoredMedia]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
 await privateStore(archive,'source.sql',dir+'/source.sql',source.sha256);
 const sourceMeta={format:'dream-private-production-checkpoint-v1',candidate,createdAt:new Date().toISOString(),databaseId:productionId,sourceSchema,bookmarkBefore,bookmark:bookmarkVerified,sqlSha256:source.sha256,sqlBytes:source.bytes.length,tables:snapshot.tables.map(t=>({name:t.name,rows:t.rows.length,sha256:rowsDigest(t.rows)})),sequences:snapshot.sequences,sourceVerifiedUnchanged:true,currentWorker:{settings,activeVersion,activeDeployment:active},currentFlags};
 const metaFile=await configFile(dir,sourceMeta,'source-metadata.json');await privateStore(archive,'source-metadata.json',metaFile,sha(await readFile(metaFile)));result.backupD1='PASS';result.sourceSchema=sourceSchema;result.sourceBookmarkSaved=true;result.privateSqlSha256=source.sha256;
 phase='complete private R2 inventory and recoverable object copy';
 const gateway={name:name+'-io',workers_dev:true,main:process.cwd()+'/scripts/restore-io-worker.js',compatibility_date:base.compatibility_date,triggers:{crons:[]},r2_buckets:[{binding:'SOURCE',bucket_name:sourceMedia.bucket_name},{binding:'ARCHIVE',bucket_name:archive},{binding:'RESTORED',bucket_name:restoredMedia}]};
 const ioConfig=await configFile(dir,gateway,'gateway.jsonc');assertSandbox(gateway.name);ioCreated=true;const output=wrangler(['deploy','--config',ioConfig]),url=output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(url,'PRIVATE_GATEWAY_URL_MISSING');
 const key=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',ioConfig],JSON.stringify({RECOVERY_KEY:key}));
 const deadline=Date.now()+120000;while(true){const response=await fetch(url+'/ready',{headers:{'x-recovery-key':key},signal:AbortSignal.timeout(15000)});const value=await response.json().catch(()=>null);if(response.status===200&&value?.bindingsReady)break;if(Date.now()>deadline)throw Error('PRIVATE_GATEWAY_NOT_READY');await new Promise(r=>setTimeout(r,2000));}
 const backup=await fetch(url+'/backup',{method:'POST',headers:{'x-recovery-key':key},signal:AbortSignal.timeout(120000)}),r2Backup=await backup.json().catch(()=>null);check(backup.status===200&&r2Backup?.ok===true,'PRIVATE_R2_BACKUP_FAILED');
 wrangler(['r2','object','get',archive+'/manifest.json','--remote','--file',dir+'/r2-manifest.json']);await chmod(dir+'/r2-manifest.json',0o600);check(sha(await readFile(dir+'/r2-manifest.json'))===r2Backup.manifestSha256,'R2_MANIFEST_DIGEST_MISMATCH');
 const r2Manifest=JSON.parse(await readFile(dir+'/r2-manifest.json','utf8'));check(r2Manifest.entries.length===r2Backup.objects,'R2_INVENTORY_COUNT_MISMATCH');result.backupR2='PASS';result.r2Objects=r2Backup.objects;result.r2ManifestSha256=r2Backup.manifestSha256;
 phase='restore fresh R2 snapshot in isolated bucket';const r2Restore=await privateRestore(url,key);check(r2Restore.data.objects===r2Backup.objects,'R2_RESTORE_INVENTORY_MISMATCH');result.r2Restore='PASS';
 phase='restore fresh schema28 D1 into empty Cloudflare database';
 const clone=await createDb('-db'),cloneConfig=await configFile(dir,dbConfig(clone),'clone.jsonc');const restored20=await importSandboxSql(clone,cloneConfig,dir+'/source.sql');result.restore28='PASS';result.restoredTables=restored20.tables;result.restoredRows=restored20.rows;
 phase='rehearse explicit Cloudflare D1 migration28to29';wrangler(['d1','migrations','apply',clone.name,'--remote','--config',cloneConfig]);
 const migrated=await exportSql(cloneConfig,clone.name,dir+'/migrated.sql'),migratedLocal=localDb(migrated.bytes);try{check(validateMigrationState(migratedLocal)===29,'REHEARSAL_SCHEMA_NOT_29');compareManifest(migratedLocal,preservation);check(migratedLocal.prepare('PRAGMA foreign_key_check').all().length===0,'MIGRATION_FOREIGN_KEYS');}finally{migratedLocal.close();}
 await privateStore(archive,'migrated.sql',dir+'/migrated.sql',migrated.sha256);result.migration='PASS';result.data='PASS';
 phase='second restore of migrated D1 and full table/schema verification';
 const second=await createDb('-restored'),secondConfig=await configFile(dir,dbConfig(second),'second.jsonc');await importSandboxSql(second,secondConfig,dir+'/migrated.sql');
 const reexport=await exportSql(secondConfig,second.name,dir+'/restored28.sql'),finalLocal=localDb(reexport.bytes);try{check(validateMigrationState(finalLocal)===29,'RESTORED_SCHEMA_NOT_29');compareManifest(finalLocal,preservation);}finally{finalLocal.close();}
 await verifySnapshot(second,inspectSql(migrated.bytes));result.restore='PASS';result.restore29='PASS';
 phase='prepare private non-executable release manifest and rollback instructions';
 const keys=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const privateKeyFile=join(dir,'bootstrap-private.pem');await writeFile(privateKeyFile,keys.privateKey,{mode:0o600});await privateStore(archive,'bootstrap-private.pem',privateKeyFile,sha(await readFile(privateKeyFile)));
 const manifest={format:'dream-team-astra-preflight-v1',candidate,run:Number(run),createdAt:new Date().toISOString(),databaseId:productionId,sourceSchema:28,schema:29,bookmark:bookmarkVerified,sqlSha256:source.sha256,sourceArchive:archive,sourceSqlKey:'source.sql',previousWorkerVersion:activeVersions[0].id,previousCommit:currentFlags.APP_BUILD,previousWorkerConfigKey:'source-metadata.json',migrationRehearsal:'PASS',r2Restore:'PASS',r2Source:sourceMedia.bucket_name,r2Archive:archive,r2ManifestSha256:r2Backup.manifestSha256,bootstrapPrivateKeyBucket:archive,bootstrapPrivateKeyKey:'bootstrap-private.pem',bootstrapPublicKey:keys.publicKey,productionD1Writes:0,automaticRollback:false,rollback:{schema:28,procedure:['Keep global HTTP and cron maintenance enabled.','Restore source.sql and the verified R2 snapshot only into new isolated resources first.','Reconcile any post-checkpoint writes; never rewind production blindly.','Old Worker is compatible only with verified schema28 data; keep schema29 in maintenance until a compatible version is available.','Never restore revoked sessions without explicit reconciliation.']}};
 const manifestFile=await configFile(dir,manifest,'release-manifest-draft.json');await privateStore(archive,'release-manifest-draft.json',manifestFile,sha(await readFile(manifestFile)));result.manifest='PRIVATE_DRAFT_SAVED';result.manifestSha256=sha(await readFile(manifestFile));result.previousVersionCaptured=true;result.rollback='MANUAL_MAINTENANCE_AND_RECONCILIATION_REQUIRED';result.result='PASS';
 result.sourceArchive=archive;result.manifestKey=process.env.RELEASE_MANIFEST_KEY;result.bootstrapPublicKey=keys.publicKey;result.remaining=['FRESH_FROZEN_CHECKPOINT','SCHEMA28_TO_29_APPROVED_RELEASE','PRIVATE_PROTECTED_ACCOUNT_INITIALIZATION','PRODUCTION_SMOKE'];
 const published=await configFile(dir,manifest,'preflight-receipt.json');wrangler(['r2','object','put','dream-team-d1-backups/'+process.env.RELEASE_MANIFEST_KEY,'--remote','--file',published]);const verify=join(dir,'verify-receipt.json');wrangler(['r2','object','get','dream-team-d1-backups/'+process.env.RELEASE_MANIFEST_KEY,'--remote','--file',verify]);check(sha(await readFile(verify))===sha(await readFile(published)),'PRIVATE_RECEIPT_ROUNDTRIP');
}catch(error){result.result=error.status===403||error.code===10042||error.message==='CLOUDFLARE_CREDENTIALS_UNAVAILABLE'?'BLOCKED':'FAIL';result.phase=phase;result.httpStatus=error.status||null;result.code=error.code;result.stage=error.stage;result.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PREFLIGHT_OPERATION_FAILED';result.operation=error.operation;result.readyToDeployProduction=false;process.exitCode=1;
}finally{
 if(ioCreated)try{assertSandbox(name+'-io');await cf('/workers/scripts/'+name+'-io','DELETE');}catch{result.privateWorkerCleanup='BLOCKED';}
 for(const db of dbs)try{assertSandbox(db.name,db.uuid);await cf('/d1/database/'+db.uuid,'DELETE');}catch{result.privateD1Cleanup='BLOCKED';}
 // Preserve dedicated private archive and restored R2 evidence, never publish SQL/config/keys.
 await rm(dir,{recursive:true,force:true});await mkdir('astra-release-status',{recursive:true});await writeFile('astra-release-status/preflight.json',JSON.stringify(result,null,2));console.log('ASTRA PREFLIGHT '+JSON.stringify(result));
}
