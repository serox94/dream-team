// Backup/restore rehearsal only. Production is read-only. No release operator, auth reset or app deploy.
import {readFile,writeFile,mkdtemp,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes,randomUUID} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {cf,query,wrangler,sha,productionId,assertSandbox,configFile,exportSql,importSandboxSql} from './recovery-common.mjs';
import {inspectSql,verifySnapshot,rowsDigest} from './d1-snapshot.mjs';
import {oldManifest,compareManifest,validateMigrationState} from './migration-contract.mjs';
import {privateRestore} from './recovery-transport.mjs';
const candidate='b20be0508b8f2aafdd16f31118ab4dbbae2492a0',run=process.env.GITHUB_RUN_ID;
const check=(ok,code)=>{if(!ok)throw Error(code);};check(/^\d+$/.test(run||''),'RUN_REQUIRED');
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
 phase='read deployed production Worker configuration';
 const settings=await cf('/workers/scripts/dream-team/settings');
 const bindings=settings.bindings||[],sourceDb=bindings.find(b=>b.name==='DB'&&b.type==='d1'),sourceMedia=bindings.find(b=>b.name==='MEDIA'&&b.type==='r2_bucket');
 check(sourceDb?.id===productionId,'DEPLOYED_D1_BINDING_MISMATCH');check(sourceMedia?.bucket_name===base.r2_buckets.find(b=>b.binding==='MEDIA').bucket_name,'DEPLOYED_R2_BINDING_MISMATCH');
 const deployments=await cf('/workers/scripts/dream-team/deployments'),active=deployments.deployments?.[0];
 check(active?.versions?.length>0,'ACTIVE_PRODUCTION_VERSION_UNAVAILABLE');
 const activeVersions=active.versions.map(v=>({id:v.version_id,percentage:v.percentage}));check(activeVersions.every(v=>v.id),'ACTIVE_VERSION_ID_MISSING');
 const requiredSecrets=['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'];
 const secrets=Object.fromEntries(requiredSecrets.map(key=>[key,bindings.some(b=>b.name===key&&b.type==='secret_text')]));
 result.requiredSecretBindings=secrets;result.githubAuthSecretPresence={password:!!process.env.RYBY_LOGIN_PASSWORD,sessionSecret:typeof process.env.RYBY_SESSION_SECRET==='string'&&process.env.RYBY_SESSION_SECRET.length>=32};
 const flagNames=['APP_ENV','APP_BUILD','INDIVIDUAL_ACCOUNTS','AI_FREE_ONLY'];
 const currentFlags=Object.fromEntries(bindings.filter(b=>b.type==='plain_text'&&flagNames.includes(b.name)).map(b=>[b.name,b.text]));
 result.configuration='PASS';result.sourceIdentity='DEPLOYED_BINDINGS_VERIFIED';result.secretValuesVerified=false;
 const sourceD1Metadata=await cf('/d1/database/'+productionId);check(sourceD1Metadata.name===base.d1_databases[0].database_name,'PRODUCTION_DATABASE_NAME_MISMATCH');
 phase='fresh private production SQL and Time Travel bookmark';
 const bookmarkBefore=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));check(bookmarkBefore,'TIME_TRAVEL_BOOKMARK_MISSING');
 const source=await exportSql('wrangler.jsonc','dream-team-db',dir+'/source.sql'),snapshot=inspectSql(source.bytes),sourceLocal=localDb(source.bytes);let sourceSchema,preservation;
 try{sourceSchema=validateMigrationState(sourceLocal);preservation=oldManifest(sourceLocal);}finally{sourceLocal.close();}
 check(sourceSchema===20,'SOURCE_SCHEMA_NOT_20');
 const bookmarkExport=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));
 // Read-only equality check proves IDs, PB, catches, all checklist/archive rows, schema and counters.
 await verifySnapshot({uuid:productionId},snapshot);
 const bookmarkVerified=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));check(bookmarkExport&&bookmarkExport===bookmarkVerified,'SOURCE_CHANGED_DURING_BACKUP_VERIFY');
 const archive=name+'-archive',restoredMedia=name+'-media';for(const bucket of [archive,restoredMedia]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
 await privateStore(archive,'source.sql',dir+'/source.sql',source.sha256);
 const sourceMeta={format:'dream-private-production-checkpoint-v1',candidate,createdAt:new Date().toISOString(),databaseId:productionId,sourceSchema,bookmarkBefore,bookmark:bookmarkVerified,sqlSha256:source.sha256,sqlBytes:source.bytes.length,tables:snapshot.tables.map(t=>({name:t.name,rows:t.rows.length,sha256:rowsDigest(t.rows)})),sequences:snapshot.sequences,sourceVerifiedUnchanged:true,currentWorker:{settings,activeDeployment:active},currentFlags};
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
 phase='restore fresh schema20 D1 into empty Cloudflare database';
 const clone=await createDb('-db'),cloneConfig=await configFile(dir,dbConfig(clone),'clone.jsonc');const restored20=await importSandboxSql(clone,cloneConfig,dir+'/source.sql');result.restore20='PASS';result.restoredTables=restored20.tables;result.restoredRows=restored20.rows;
 phase='rehearse explicit Cloudflare D1 migration20to28';wrangler(['d1','migrations','apply',clone.name,'--remote','--config',cloneConfig]);
 const migrated=await exportSql(cloneConfig,clone.name,dir+'/migrated.sql'),migratedLocal=localDb(migrated.bytes);try{check(validateMigrationState(migratedLocal)===28,'REHEARSAL_SCHEMA_NOT_28');compareManifest(migratedLocal,preservation);check(migratedLocal.prepare('PRAGMA foreign_key_check').all().length===0,'MIGRATION_FOREIGN_KEYS');}finally{migratedLocal.close();}
 await privateStore(archive,'migrated.sql',dir+'/migrated.sql',migrated.sha256);result.migration='PASS';result.data='PASS';
 phase='second restore of migrated D1 and full table/schema verification';
 const second=await createDb('-restored'),secondConfig=await configFile(dir,dbConfig(second),'second.jsonc');await importSandboxSql(second,secondConfig,dir+'/migrated.sql');
 const reexport=await exportSql(secondConfig,second.name,dir+'/restored28.sql'),finalLocal=localDb(reexport.bytes);try{check(validateMigrationState(finalLocal)===28,'RESTORED_SCHEMA_NOT_28');compareManifest(finalLocal,preservation);}finally{finalLocal.close();}
 await verifySnapshot(second,inspectSql(migrated.bytes));result.restore='PASS';result.restore28='PASS';
 // Only sanitize the disposable copies; production sessions and passwords remain untouched.
 for(const db of [clone,second]){assertSandbox(db.name,db.uuid);await query(db.uuid,'DELETE FROM auth_sessions');check((await query(db.uuid,'SELECT COUNT(*) n FROM auth_sessions')).results[0].n===0,'ISOLATED_SESSION_PURGE_FAILED');}
 phase='prepare private non-executable release manifest and rollback instructions';
 const manifest={format:'dream-team-release-v1',preparedOnly:true,candidate,createdAt:new Date().toISOString(),databaseId:productionId,sourceSchema,schema:28,bookmark:bookmarkVerified,sqlSha256:source.sha256,sourceSqlKey:'source.sql',sourceArchive:archive,sourceSqlBucket:archive,previousWorkerVersion:activeVersions.length===1?activeVersions[0].id:null,previousWorkerVersions:activeVersions,previousWorkerConfigKey:'source-metadata.json',migrationRehearsal:'PASS',r2Restore:'PASS',r2Source:sourceMedia.bucket_name,r2Archive:archive,r2ManifestSha256:r2Backup.manifestSha256,preMigrationVerified:true,postMigrationVerified:false,maintenance:false,sessionsPurged:false,isolatedSessionsPurged:true,externalDeployAudit:'MANUAL_EVIDENCE_ONLY',productionChangesAuthorized:false,requiredSecretBindings:secrets,secretValueEquality:'NOT TESTED',targetFlags:{...base.vars,APP_BUILD:candidate},rollback:{automatic:false,rollbackDataReconciled:false,rollbackSchemaCompatible:false,rollbackCodeHasMaintenanceGuard:'NOT VERIFIED FOR LEGACY VERSION',procedure:['Keep all traffic and cron in explicit maintenance.','Before each production operation, capture new private SQL/bookmark/R2 inventory and configuration.','Preserve and reconcile all writes made after the recovery point; never rewind production blindly.','Code rollback only after schema/config/global-maintenance compatibility proof; otherwise keep maintenance and restore into a fresh isolated target first.','Physically purge restored sessions before any traffic is reopened; retain password pepper and verified account mappings.']},requiredReleaseActions:['Confirm Cloudflare current full deployment/build queue is empty; keep Builds/hooks and production workflow disabled.','Obtain separate explicit production approval.','Install a maintenance Worker covering every host/route and cron, then turn the database maintenance flag on.','Take a fresh frozen production checkpoint and verified private receipt (<15 minutes old).','Perform only the approved explicit production20to28 migration and compare original rows/IDs/PB/FK.','Initialize individual credentials once from existing secrets, preserving identities/PB; never overwrite an existing credential.','Physically purge production sessions; verify target flags and post-migration schema28.','Prepare the operator-required manifest under dream-team-d1-backups/private-releases/<uuid>.json with matching SQL key there.','Publish exact candidate only after all release gates pass, then perform agreed read-only smoke before opening traffic.']};
 const manifestFile=await configFile(dir,manifest,'release-manifest-draft.json');await privateStore(archive,'release-manifest-draft.json',manifestFile,sha(await readFile(manifestFile)));result.manifest='PRIVATE_DRAFT_SAVED';result.manifestSha256=sha(await readFile(manifestFile));result.previousVersionCaptured=true;result.rollback='MANUAL_MAINTENANCE_AND_RECONCILIATION_REQUIRED';result.result='PASS';
 result.remaining=['CURRENT_CLOUDFLARE_QUEUE_NOT_VERIFIED','SEPARATE_PRODUCTION_APPROVAL','FROZEN_CHECKPOINT_AND_OPERATOR_MANIFEST','EXPLICIT_PRODUCTION_MIGRATION_INIT_PURGE','LEGACY_ROLLBACK_COMPATIBILITY_NOT_VERIFIED'];
}catch(error){result.result=error.status===403||error.code===10042||error.message==='CLOUDFLARE_CREDENTIALS_UNAVAILABLE'?'BLOCKED':'FAIL';result.phase=phase;result.httpStatus=error.status||null;result.code=error.code;result.stage=error.stage;result.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'PREFLIGHT_OPERATION_FAILED';result.operation=error.operation;result.readyToDeployProduction=false;process.exitCode=1;
}finally{
 if(ioCreated)try{assertSandbox(name+'-io');await cf('/workers/scripts/'+name+'-io','DELETE');}catch{result.privateWorkerCleanup='BLOCKED';}
 for(const db of dbs)try{assertSandbox(db.name,db.uuid);await cf('/d1/database/'+db.uuid,'DELETE');}catch{result.privateD1Cleanup='BLOCKED';}
 // Preserve dedicated private archive and restored R2 evidence, never publish SQL/config/keys.
 await rm(dir,{recursive:true,force:true});await mkdir('preflight-safe-status',{recursive:true});await writeFile('preflight-safe-status/status.json',JSON.stringify(result,null,2));console.log('PRODUCTION PREFLIGHT '+JSON.stringify(result));
}
