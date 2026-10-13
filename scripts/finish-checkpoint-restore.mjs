// Final binding/session/media check. D1/R2 restore evidence already exists; do not replay fixtures.
import {readFile,writeFile,mkdir,mkdtemp,rm,chmod} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {cf,query,remoteDb,configFile,wrangler,assertSandbox,sha,importSandboxSql} from './recovery-common.mjs';import {login,session} from '../src/auth.js';
const name='dream-team-audit-'+process.env.GITHUB_RUN_ID,archive='dream-team-audit-38435939611-archive',media='dream-team-audit-38436517138-media';
const dir=await mkdtemp(join(tmpdir(),'private-restore-finish-')),base=JSON.parse(await readFile('wrangler.jsonc','utf8'));let db,worker=false,phase='read verified private checkpoint';
const result={candidate:process.env.GITHUB_SHA,run:Number(process.env.GITHUB_RUN_ID),at:new Date().toISOString(),result:'FAIL',productionRequests:0,businessWritesToExistingResources:0,providerCalls:0,priorD1Run:38435939611,priorR2Run:38436517138};
const check=(ok,code)=>{if(!ok)throw Error(code);};
try{
 assertSandbox(name);assertSandbox(archive);assertSandbox(media);
 wrangler(['r2','object','get',archive+'/checkpoint.sql','--remote','--file',dir+'/checkpoint.sql']);await chmod(dir+'/checkpoint.sql',0o600);result.privateSqlSha256=sha(await readFile(dir+'/checkpoint.sql'));
 db=await cf('/d1/database','POST',{name:name+'-restored'});assertSandbox(db.name,db.uuid);
 const release=sha(Buffer.from(process.env.GITHUB_SHA+'|'+db.uuid+'|'+media));
 const config={name,workers_dev:true,main:process.cwd()+'/src/worker.js',compatibility_date:base.compatibility_date,assets:{...base.assets,directory:process.cwd()+'/public'},triggers:{crons:[]},d1_databases:[{binding:'DB',database_name:db.name,database_id:db.uuid}],r2_buckets:[{binding:'MEDIA',bucket_name:media}],vars:{APP_ENV:'preview',APP_BUILD:process.env.GITHUB_SHA,APP_RELEASE_ID:release,INDIVIDUAL_ACCOUNTS:'true',AI_FREE_ONLY:'false'}};
 const file=await configFile(dir,config,'app.jsonc');phase='prepare fresh isolated binding from verified SQL';result.restored=await importSandboxSql(db,file,dir+'/checkpoint.sql');
 const snapshotSessions=(await query(db.uuid,'SELECT COUNT(*) n FROM auth_sessions')).results[0].n;check(snapshotSessions>0,'NO_SNAPSHOT_SESSION_PROOF');result.snapshotSessionsPresent=true;
 phase='purge snapshot sessions before opening application';
 const env={DB:remoteDb(db.uuid),APP_ENV:'preview',INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'Patryk',RYBY_LOGIN_PASSWORD:process.env.RYBY_LOGIN_PASSWORD,RYBY_SESSION_SECRET:process.env.RYBY_SESSION_SECRET};
 const issued=await login(new Request('https://isolated.invalid/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cf-connecting-ip':'192.0.2.88'},body:new URLSearchParams({username:'Patryk',password:env.RYBY_LOGIN_PASSWORD})}),env);check(issued.status===303&&issued.headers.get('location')==='/','PRIVATE_LOGIN_FAILED');
 const oldCookie=issued.headers.get('set-cookie')?.split(';')[0];check(oldCookie,'NO_CONTROL_COOKIE');const request=()=>new Request('https://isolated.invalid/api/bootstrap',{headers:{cookie:oldCookie}});check(await session(request(),env),'CONTROL_SESSION_INVALID');
 await query(db.uuid,'DELETE FROM auth_sessions');check((await query(db.uuid,'SELECT COUNT(*) n FROM auth_sessions')).results[0].n===0,'PHYSICAL_SESSION_PURGE_FAILED');check(!await session(request(),env),'CONTROL_SESSION_REUSED');result.sessionsPurged=true;
 phase='atomic secrets behind isolated maintenance';worker=true;
 const maintenance=await configFile(dir,{...config,main:process.cwd()+'/scripts/maintenance-worker.js'},'maintenance.jsonc');wrangler(['deploy','--config',maintenance]);
 wrangler(['secret','bulk','--config',maintenance],JSON.stringify(Object.fromEntries(['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'].map(key=>[key,env[key]]))));
 phase='open only the restored isolated app';const output=wrangler(['deploy','--config',file]),url=output.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(url,'NO_ISOLATED_URL');
 const deadline=Date.now()+120000;while(true){const response=await fetch(url+'/login',{redirect:'manual',signal:AbortSignal.timeout(15000)});const unauthorized=await fetch(url+'/api/bootstrap',{redirect:'manual',signal:AbortSignal.timeout(15000)});result.readinessApiStatus=unauthorized.status;if(response.status===200&&response.headers.get('x-dreamteam-release')===release&&unauthorized.status===401)break;if(Date.now()>deadline)throw Error('RESTORED_AUTH_RELEASE_NOT_READY');await new Promise(r=>setTimeout(r,2000));}
 const denied=await fetch(url+'/api/bootstrap',{redirect:'manual',headers:{cookie:oldCookie},signal:AbortSignal.timeout(25000)});result.purgedCookieHttp=denied.status;check(denied.status===401,denied.status===200?'PURGED_COOKIE_ACCEPTED':'PURGED_COOKIE_CHECK_NOT_READY');
 const fresh=await fetch(url+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:env.RYBY_LOGIN_PASSWORD}),signal:AbortSignal.timeout(25000)});check(fresh.status===303&&fresh.headers.get('location')==='/','RESTORED_LOGIN_FAILED');const c=fresh.headers.get('set-cookie')?.split(';')[0];check(c,'RESTORED_COOKIE_MISSING');
 const response=await fetch(url+'/api/bootstrap',{headers:{cookie:c},signal:AbortSignal.timeout(25000)});check(response.status===200,'RESTORED_BOOTSTRAP_FAILED');const bootstrap=await response.json();check(bootstrap.currentUser.anglerId==='patryk','RESTORED_IDENTITY_MISMATCH');
 const fixture=(await query(db.uuid,"SELECT id FROM deeper_media WHERE name='QA recovery image'")).results[0];check(fixture,'ARCHIVED_IMAGE_MISSING');const image=await fetch(url+'/api/deeper-media/'+fixture.id+'/image',{headers:{cookie:c},signal:AbortSignal.timeout(25000)});check(image.status===200,'RESTORED_MEDIA_FAILED');check(sha(Buffer.from(await image.arrayBuffer()))===sha(await readFile('public/assets/deeper/chirp2/fish-deeper-052509.png')),'RESTORED_MEDIA_HASH_MISMATCH');
 Object.assign(result,{result:'PASS',M04:'PASS',H03:'PASS',H04:'BLOCKED',d1ExportRestore:'PASS',r2BytesMetadataInventory:'PASS',isolatedBindingIdentityImage:'PASS',sourceArchive:archive,restoredMedia:media});
}catch(error){Object.assign(result,{result:error.status===403?'BLOCKED':'FAIL',phase,error:/^[A-Z0-9_]+$/.test(error.message)?error.message:'PRIVATE_RESTORE_ERROR',httpStatus:error.status,code:error.code,stage:error.stage,table:error.table,deployDetail:error.deployDetail});process.exitCode=1;
}finally{
 if(worker)try{assertSandbox(name);await cf('/workers/scripts/'+name,'DELETE');}catch{result.cleanupBlocked=true;}
 if(db)try{assertSandbox(db.name,db.uuid);await cf('/d1/database/'+db.uuid,'DELETE');}catch{result.cleanupBlocked=true;}
 await rm(dir,{recursive:true,force:true});await mkdir('live-preview-qa',{recursive:true});await writeFile('live-preview-qa/audit-fixes-recovery.json',JSON.stringify(result,null,2));console.log('AUDIT FIXES RESTORE FINISH '+JSON.stringify(result));
}
