// Resume ONLY the failed restore using the retained PRIVATE archive. No production/preview bindings.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {cf,query,remoteDb,configFile,wrangler,sha,assertSandbox,exportSql,importSandboxSql} from './recovery-common.mjs';
import {inspectSql,verifySnapshot} from './d1-snapshot.mjs';import {login,session} from '../src/auth.js';
const run=process.env.GITHUB_RUN_ID;assert.match(run||'',/^\d+$/);
const name='dream-team-audit-'+run,archive='dream-team-audit-38410329365-archive';assertSandbox(archive);
const dir=await mkdtemp(join(tmpdir(),'dream-private-resume-')),base=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const databases=[],workers=[],buckets=[];let phase='read retained private checkpoint';
const result={at:new Date().toISOString(),candidate:process.env.GITHUB_SHA,run:Number(run),result:'FAIL',checkpointArchive:archive,productionRequests:0,businessWritesToExistingResources:0,providerCalls:0};
const check=(ok,code)=>{if(!ok)throw Error(code);};
const appConfig=db=>({name,workers_dev:true,main:process.cwd()+'/src/worker.js',compatibility_date:base.compatibility_date,assets:{...base.assets,directory:process.cwd()+'/public'},triggers:{crons:[]},d1_databases:[{binding:'DB',database_name:db.name,database_id:db.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:name+'-media'}],vars:{APP_ENV:'preview',APP_BUILD:process.env.GITHUB_SHA,APP_RELEASE_ID:sha(Buffer.from(process.env.GITHUB_SHA+'|'+db.uuid+'|'+name)),INDIVIDUAL_ACCOUNTS:'true',AI_FREE_ONLY:'false'}});
const createDb=async suffix=>{const db=await cf('/d1/database','POST',{name:name+suffix});assertSandbox(db.name,db.uuid);databases.push(db);return db;};
const createBucket=async suffix=>{const bucket=name+suffix;assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});buckets.push(bucket);return bucket;};
async function deploy(config,fileName){assertSandbox(config.name);const file=await configFile(dir,config,fileName);workers.push(config.name);const output=wrangler(['deploy','--config',file]);const url=output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(url,'NO_ISOLATED_WORKER_URL');return {file,url,release:config.vars?.APP_RELEASE_ID};}
const putSecret=(file,key,value)=>wrangler(['secret','put',key,'--config',file],value);
async function ready(app,key){const deadline=Date.now()+120000;do{const r=await fetch(app.url+(key?'/ready':'/login'),{redirect:'manual',headers:key?{'x-recovery-key':key}:{},signal:AbortSignal.timeout(15000)});if(r.status===200&&(key?(await r.json()).bindingsReady:r.headers.get('x-dreamteam-release')===app.release))return;await new Promise(resolve=>setTimeout(resolve,2000));}while(Date.now()<deadline);throw Error('ISOLATED_RELEASE_NOT_READY');}
try{
 const originalFile=dir+'/retained.sql';wrangler(['r2','object','get',archive+'/checkpoint.sql','--remote','--file',originalFile]);await chmod(originalFile,0o600);
 const original=await readFile(originalFile),snapshot=inspectSql(original);result.retainedSqlSha256=sha(original);
 // Record the local reason the raw dump cannot be loaded with enforced foreign keys.
 const strict=new DatabaseSync(':memory:');try{strict.exec(original.toString());result.rawDumpStrictLoad='PASS';}catch(error){result.rawDumpStrictLoad=/no such table/i.test(error.message)?'REFERENCED_TABLE_NOT_CREATED':/FOREIGN KEY/i.test(error.message)?'FOREIGN_KEY_ORDER':'OTHER_SQL_ERROR';}finally{strict.close();}
 phase='restore retained SQL into unpublished isolated D1';
 const source=await createDb('-db'),sourceConfig=await configFile(dir,appConfig(source),'source.jsonc');result.originalRestore=await importSandboxSql(source,sourceConfig,originalFile);
 phase='private session-bearing checkpoint and revocation';
 const env={DB:remoteDb(source.uuid),INDIVIDUAL_ACCOUNTS:'true',APP_ENV:'preview',RYBY_LOGIN_USERNAME:'Patryk',RYBY_LOGIN_PASSWORD:process.env.RYBY_LOGIN_PASSWORD,RYBY_SESSION_SECRET:process.env.RYBY_SESSION_SECRET};
 const request=new Request('https://isolated.invalid/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cf-connecting-ip':'192.0.2.77'},body:new URLSearchParams({username:'Patryk',password:env.RYBY_LOGIN_PASSWORD})});
 const issued=await login(request,env);check(issued.status===303&&issued.headers.get('location')==='/','PRIVATE_SOURCE_LOGIN_FAILED');
 const oldCookie=issued.headers.get('set-cookie')?.split(';')[0];check(oldCookie,'NO_PRIVATE_SESSION');const sessionRequest=()=>new Request('https://isolated.invalid/api/bootstrap',{headers:{cookie:oldCookie}});check(await session(sessionRequest(),env),'SOURCE_SESSION_MISSING');
 const point=await exportSql(sourceConfig,source.name,dir+'/checkpoint.sql');const pointSnapshot=inspectSql(point.bytes);
 // Verify native export kept all business rows/schema/sequences, with only the issued auth session changed.
 for(const table of snapshot.tables.filter(t=>!['auth_sessions','auth_login_limits'].includes(t.name))){const {rowsDigest}=await import('./d1-snapshot.mjs');check(rowsDigest(table.rows)===rowsDigest(pointSnapshot.tables.find(t=>t.name===table.name)?.rows||[]),'PRIVATE_EXPORT_CHANGED_ROWS');}
 check(sha(Buffer.from(JSON.stringify(snapshot.schema)))===sha(Buffer.from(JSON.stringify(pointSnapshot.schema))),'PRIVATE_EXPORT_CHANGED_SCHEMA');check(JSON.stringify(snapshot.sequences)===JSON.stringify(pointSnapshot.sequences),'PRIVATE_EXPORT_CHANGED_SEQUENCES');
 const privateArchive=await createBucket('-archive');wrangler(['r2','object','put',privateArchive+'/checkpoint.sql','--remote','--file',dir+'/checkpoint.sql','--content-type','application/sql']);
 wrangler(['r2','object','get',privateArchive+'/checkpoint.sql','--remote','--file',dir+'/roundtrip.sql']);await chmod(dir+'/roundtrip.sql',0o600);check(sha(await readFile(dir+'/roundtrip.sql'))===point.sha256,'PRIVATE_SQL_ROUNDTRIP_MISMATCH');
 await query(source.uuid,'DELETE FROM auth_sessions');check(!await session(sessionRequest(),env),'SOURCE_REVOCATION_FAILED');
 phase='restore session-bearing private SQL into second fresh D1';
 const restored=await createDb('-restored'),cfg=appConfig(restored),restoredConfig=await configFile(dir,cfg,'restored.jsonc');result.restored=await importSandboxSql(restored,restoredConfig,dir+'/roundtrip.sql');await verifySnapshot(restored,pointSnapshot);
 // This old cookie really was in the snapshot. Demonstrate the hazard only in an unpublished target.
 check(await session(sessionRequest(),{...env,DB:remoteDb(restored.uuid)}),'RESTORED_SESSION_PROOF_MISSING');
 await query(restored.uuid,'DELETE FROM auth_sessions');check((await query(restored.uuid,'SELECT COUNT(*) n FROM auth_sessions')).results[0].n===0,'SESSION_PURGE_FAILED');
 phase='restore existing private R2 objects and exact metadata into fresh bucket';
 const media=await createBucket('-media'),key=randomBytes(32).toString('hex');
 const io=await deploy({name:name+'-io',workers_dev:true,main:process.cwd()+'/scripts/restore-io-worker.js',compatibility_date:base.compatibility_date,triggers:{crons:[]},r2_buckets:[{binding:'SOURCE',bucket_name:archive},{binding:'ARCHIVE',bucket_name:archive},{binding:'RESTORED',bucket_name:media}]},'io.jsonc');putSecret(io.file,'RECOVERY_KEY',key);await ready(io,key);
 const r=await fetch(io.url+'/restore',{method:'POST',headers:{'x-recovery-key':key},signal:AbortSignal.timeout(120000)});const restoredR2=await r.json().catch(()=>({error:'NON_JSON'}));check(r.status===200&&restoredR2.verified===true,'R2_RESTORE_'+(restoredR2.error||r.status));result.r2Objects=restoredR2.objects;result.r2HashesMetadataInventory='PASS';
 phase='rebind isolated app after physical session purge';
 check(pointSnapshot.tables.find(t=>t.name==='app_settings')?.rows.find(r=>r.key==='maintenance_mode')?.value!=='on','ARCHIVE_REQUIRES_MAINTENANCE_RECONCILIATION');
 const app=await deploy(cfg,'app.jsonc');for(const [k,v] of Object.entries({RYBY_LOGIN_USERNAME:'Patryk',RYBY_LOGIN_PASSWORD:env.RYBY_LOGIN_PASSWORD,RYBY_SESSION_SECRET:env.RYBY_SESSION_SECRET}))putSecret(app.file,k,v);await ready(app);
 const denied=await fetch(app.url+'/api/bootstrap',{headers:{cookie:oldCookie},signal:AbortSignal.timeout(25000)});check(denied.status===401,'OLD_RESTORED_COOKIE_ACCEPTED');
 const fresh=await fetch(app.url+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:env.RYBY_LOGIN_PASSWORD}),signal:AbortSignal.timeout(25000)});check(fresh.status===303&&fresh.headers.get('location')==='/','RESTORED_APP_LOGIN_FAILED');const freshCookie=fresh.headers.get('set-cookie')?.split(';')[0];check(freshCookie,'RESTORED_APP_COOKIE_MISSING');
 const bootstrap=await fetch(app.url+'/api/bootstrap',{headers:{cookie:freshCookie},signal:AbortSignal.timeout(25000)});check(bootstrap.status===200&&(await bootstrap.json()).currentUser.anglerId==='patryk','RESTORED_IDENTITY_FAILED');
 const fixture=pointSnapshot.tables.find(t=>t.name==='deeper_media')?.rows.find(row=>row.name==='QA recovery image');check(fixture,'EXISTING_ARCHIVED_IMAGE_MISSING');
 const image=await fetch(app.url+'/api/deeper-media/'+fixture.id+'/image',{headers:{cookie:freshCookie},signal:AbortSignal.timeout(25000)});check(image.status===200,'RESTORED_IMAGE_UNAVAILABLE');check(sha(Buffer.from(await image.arrayBuffer()))===sha(await readFile('public/assets/deeper/chirp2/fish-deeper-052509.png')),'RESTORED_IMAGE_HASH_MISMATCH');
 Object.assign(result,{result:'PASS',M04:'PASS',H03:'PASS',exportRoundtrip:'PASS',allTablesSchemaIndexesTriggers:'PASS',foreignKeysIntegritySequences:'PASS',revokedRestoredCookie:'DENIED_401',restoredIdentityImage:'PASS',sessionsPurged:true,privateSqlSha256:point.sha256,recoveryArchive:privateArchive});
}catch(error){Object.assign(result,{result:error.status===403?'BLOCKED':'FAIL',phase,error:error.stage?'RESTORE_STATEMENT_FAILED':/^[A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_RESTORE_ERROR',stage:error.stage,table:error.table,httpStatus:error.status||null,code:error.code,importDetail:error.importDetail,deployDetail:error.deployDetail});process.exitCode=1;
}finally{
 for(const worker of workers)try{assertSandbox(worker);await cf('/workers/scripts/'+worker,'DELETE');}catch{result.cleanupBlocked=true;}
 for(const db of databases)try{assertSandbox(db.name,db.uuid);await cf('/d1/database/'+db.uuid,'DELETE');}catch{result.cleanupBlocked=true;}
 // Keep the new private SQL proof. Media clone can be removed after the protected fetch proof.
 for(const bucket of buckets.filter(b=>b.endsWith('-media')))try{assertSandbox(bucket);await cf('/r2/buckets/'+bucket,'DELETE');}catch{result.mediaCloneRetained=true;}
 await rm(dir,{recursive:true,force:true});await mkdir('live-preview-qa',{recursive:true});await writeFile('live-preview-qa/audit-fixes-recovery.json',JSON.stringify(result,null,2));console.log('AUDIT FIXES SAVED RESTORE '+JSON.stringify(result));
}
