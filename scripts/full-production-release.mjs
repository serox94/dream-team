// One explicit, environment-approved workflow_dispatch operation. Never runs on push.
// The application is checked out at the reviewed commit; only operational files are supplied separately.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright';
import {cf,query,wrangler,sha,productionId,assertSandbox,configFile,exportSql,importSandboxSql,assertReleaseReceipt} from './recovery-common.mjs';
import {inspectSql,verifySnapshot} from './d1-snapshot.mjs';
import {oldManifest,compareManifest,validateMigrationState} from './migration-contract.mjs';
import {privateRestore} from './recovery-transport.mjs';
const candidate='b20be0508b8f2aafdd16f31118ab4dbbae2492a0';
const production='https://dream-team.sewerynski00.workers.dev';
const run=process.env.GITHUB_RUN_ID,name='dream-team-audit-'+run;
const dir=await mkdtemp(join(tmpdir(),'dream-private-release-'));
const status={candidate,run:Number(run),deployment:'BLOCKED',phase:'manual approval',maintenance:'NOT STARTED',productionBusinessWrites:0,productionMediaWrites:0,providerCalls:0};
let phase=status.phase,maintenance=false,barrier=false,opened=false,receipt,source,preservation,r2Manifest,ioUrl,ioCreated=false,canaryCreated=false;
const dbs=[],cookieSessions=new Set();
const check=(ok,code)=>{if(!ok)throw Error(code);};
const bookmark=x=>typeof x==='string'?x:x?.bookmark;
const local=bytes=>{const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});try{db.exec(bytes.toString());return db;}catch(e){db.close();throw e;}};
const http=(base,path,options={})=>fetch(new URL(path,base),{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
async function privatePut(bucket,key,file,digest){wrangler(['r2','object','put',bucket+'/'+key,'--remote','--file',file]);const copy=join(dir,randomUUID());wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',copy]);await chmod(copy,0o600);check(sha(await readFile(copy))===digest,'PRIVATE_CHECKPOINT_ROUNDTRIP');}
async function pause(ms){await new Promise(r=>setTimeout(r,ms));}
async function awaitHttp(base,path,test,headers={}){const end=Date.now()+120000;for(;;){const r=await http(base,path,{headers});if(await test(r))return r;if(Date.now()>end)throw Error('EDGE_STATE_NOT_READY');await pause(2000);}}
async function setMaintenance(value){await query(productionId,"INSERT INTO app_settings(key,value,updated_at) VALUES('maintenance_mode',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[value]);}
async function savedReceipt(){const file=await configFile(dir,receipt,'release.json');assertReleaseReceipt(receipt,candidate);await privatePut('dream-team-d1-backups',process.env.RELEASE_MANIFEST_KEY,file,sha(await readFile(file)));return file;}
async function operator(action){await savedReceipt();execFileSync(process.execPath,['scripts/release-workflow.mjs'],{env:{...process.env,GITHUB_SHA:candidate,RELEASE_ACTION:action,RELEASE_CANDIDATE:candidate},stdio:'pipe',timeout:300000});}
async function unchangedBusiness(){const dump=await exportSql('wrangler.jsonc','dream-team-db',join(dir,'current.sql'));const db=local(dump.bytes);try{check(validateMigrationState(db)===28,'PRODUCTION_SCHEMA_NOT_28');compareManifest(db,preservation);check(db.prepare('PRAGMA foreign_key_check').all().length===0,'PRODUCTION_FOREIGN_KEYS');}finally{db.close();}return dump;}
async function assertBarrier(hosts){for(const host of hosts)for(const [path,method] of [['/login','GET'],['/api/bootstrap','GET'],['/api/catches','POST']])check((await http(host,path,{method})).status===503,'MAINTENANCE_HOST_NOT_BLOCKED');}
async function login(base,username,extra={}){const r=await http(base,'/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...extra},body:new URLSearchParams({username,password:process.env.RYBY_LOGIN_PASSWORD})});const h=r.headers.get('set-cookie');check(r.status===303&&h?.startsWith('__Host-ryby_session=')&&!r.headers.get('location')?.includes('error='),'LOGIN_FAILED');for(const flag of ['HttpOnly','Secure','SameSite=Lax'])check(h.includes(flag),'COOKIE_FLAGS');const cookie=h.split(';')[0];cookieSessions.add(cookie);return cookie;}
async function logout(base,cookie,extra={}){check((await http(base,'/api/logout',{method:'POST',headers:{cookie,...extra}})).status===200,'LOGOUT_FAILED');check((await http(base,'/api/bootstrap',{headers:{cookie,...extra}})).status===401,'REVOKED_COOKIE_REUSED');cookieSessions.delete(cookie);}
async function apiSmoke(base,extra={}){
 for(const path of ['/api/bootstrap','/api/export','/api/health'])check((await http(base,path,{headers:extra})).status===401,'UNAUTHENTICATED_API');
 check((await http(base,'/api/catches',{method:'POST',headers:{...extra,'content-type':'application/json'},body:'{}'})).status===401,'UNAUTHENTICATED_WRITE');
 for(const [username,id] of [['Patryk','patryk'],['Maciek','maciek']]){
  const cookie=await login(base,username,extra),headers={cookie,...extra};
  const boot=await http(base,'/api/bootstrap',{headers});check(boot.status===200,'BOOTSTRAP_FAILED');const model=await boot.json();check(model.currentUser?.anglerId===id&&model.currentUser.username===username,'WRONG_ACCOUNT_IDENTITY');
  check(model.trips.length===preservation.trips.rows.length&&model.anglers.length===preservation.anglers.rows.length,'BOOTSTRAP_DATA_COUNT');
  for(const trip of model.trips)for(const resource of ['catches','checklist']){const r=await http(base,'/api/'+resource+'?tripId='+encodeURIComponent(trip.id),{headers});check(r.status===200,'TRIP_DATA_NOT_READABLE');const data=await r.json();check(Array.isArray(data[resource==='catches'?'catches':'items']),'TRIP_DATA_SHAPE');}
  for(const path of ['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/ustawienia.html'])check((await http(base,path,{headers})).status===200,'PAGE_UNAVAILABLE');
  const cross=await http(base,'/api/catches',{method:'POST',headers:{...headers,origin:'https://example.invalid','content-type':'application/json'},body:'{}'});check(cross.status===403,'CROSS_ORIGIN_WRITE_NOT_BLOCKED');
  await logout(base,cookie,extra);
 }
}
async function uiSmoke(base,extra={}){
 const browser=await chromium.launch({headless:true});
 try{for(const [width,username,id] of [[390,'Patryk','patryk'],[1280,'Maciek','maciek']]){
  const cookie=await login(base,username,extra),context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block',locale:'pl-PL'});
  await context.addCookies([{name:'__Host-ryby_session',value:cookie.slice(cookie.indexOf('=')+1),url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  if(Object.keys(extra).length)await context.route('**/*',async route=>{const request=route.request();await route.continue({headers:new URL(request.url()).origin===base?{...request.headers(),...extra}:request.headers()});});
  const page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  for(const path of ['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/ustawienia.html']){
   check((await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000})).status()===200,'UI_PAGE_HTTP');await page.locator('html[data-ready="true"]').waitFor({timeout:30000});
   const dims=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));check(dims.s<=dims.w+1,'UI_HORIZONTAL_OVERFLOW');
   if(path.includes('polowy')){const person=await page.locator('#person').inputValue();check(person===(id==='patryk'?'Patryk':'Maciek'),'CATCH_AUTHOR_NOT_CURRENT_USER');}
  }
  const control=page.locator('.language-selector select');check(await control.count()===1,'LANGUAGE_CONTROL_COUNT');
  for(const lang of ['en','pl']){await control.selectOption(lang);await page.locator('html[lang="'+lang+'"]').waitFor({timeout:20000});await page.reload({waitUntil:'domcontentloaded',timeout:45000});await page.locator('html[data-ready="true"]').waitFor({timeout:30000});check(await page.locator('html').getAttribute('lang')===lang,'LANGUAGE_NOT_PERSISTENT');}
  check(errors.length===0,'UI_JAVASCRIPT_ERROR');await context.close();await logout(base,cookie,extra);
 }}finally{await browser.close();}
}
try{
 assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.DREAMTEAM_PRODUCTION_APPROVED,'yes');assert.equal(process.env.RELEASE_CANDIDATE,candidate);assert.equal(process.env.RELEASE_ACTION,'deploy');assert.match(run||'',/^\d+$/);assert.match(process.env.RELEASE_MANIFEST_KEY||'',/^private-releases\/[a-f0-9-]+\.json$/);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidate);
 const base=JSON.parse(await readFile('wrangler.jsonc','utf8'));check(base.name==='dream-team'&&base.d1_databases[0].database_id===productionId,'TARGET_CONFIG');
 phase='current deployment queue and active configuration';
 const [settings,deployments,scripts,domains,subdomain]=await Promise.all([cf('/workers/scripts/dream-team/settings'),cf('/workers/scripts/dream-team/deployments'),cf('/workers/scripts'),cf('/workers/domains'),cf('/workers/subdomain')]);
 const worker=scripts.find(w=>w.id==='dream-team');check(worker?.tag,'WORKER_TAG');const builds=await cf('/builds/workers/'+encodeURIComponent(worker.tag)+'/builds?per_page=100'),buildList=Array.isArray(builds)?builds:builds.builds;check(Array.isArray(buildList)&&!buildList.some(b=>['queued','initializing','running'].includes(b.status)),'OTHER_BUILD_ACTIVE');
 const initialState=(await query(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).results;
 const resumeRun=process.env.RESUME_AFTER_RUN;
 check(initialState.find(r=>r.key==='schema_version')?.value==='20'&&(resumeRun==='38459921007'?initialState.find(r=>r.key==='maintenance_mode')?.value==='on':initialState.find(r=>r.key==='maintenance_mode')?.value!=='on'),'PRODUCTION_NOT_AT_APPROVED_START_STATE');
 const active=deployments.deployments[0];check(active.versions.length===1&&active.versions[0].percentage===100,'SPLIT_PRODUCTION_TRAFFIC');status.previousVersion=active.versions[0].version_id;
 const gh=await fetch('https://api.github.com/repos/serox94/dream-team/actions/runs?per_page=100',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});check(gh.ok,'GITHUB_QUEUE_NOT_READABLE');const ghRuns=(await gh.json()).workflow_runs;check(Array.isArray(ghRuns)&&!ghRuns.some(r=>String(r.id)!==run&&r.path==='.github/workflows/deploy-private.yml'&&!['completed'].includes(r.status)),'OTHER_MANUAL_RELEASE_ACTIVE');status.concurrentDeploymentGate='PASS';
 const bindings=settings.bindings;check(bindings.some(b=>b.type==='d1'&&b.name==='DB'&&b.id===productionId),'SOURCE_D1_BINDING');
 for(const [binding,bucket] of [['MEDIA','dream-team-media'],['BACKUP_STATUS','dream-team-d1-backups']])check(bindings.some(b=>b.type==='r2_bucket'&&b.name===binding&&b.bucket_name===bucket),'SOURCE_R2_BINDING');
 for(const k of ['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'])check(bindings.some(b=>b.type==='secret_text'&&b.name===k),'SOURCE_SECRET_MISSING');
 for(const k of ['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'])check(process.env[k],'OPERATOR_AUTH_SECRET_MISSING');check(process.env.RYBY_SESSION_SECRET.length>=32,'OPERATOR_PEPPER_SHORT');
 const hosts=[...new Set([production,'https://dream-team.'+subdomain.subdomain+'.workers.dev',...(Array.isArray(domains)?domains:domains.domains||[]).filter(d=>d.service==='dream-team').map(d=>'https://'+d.hostname)])];
 if(resumeRun==='38459921007'){
  // Resume only this stopped, pre-migration run. The public Worker must still be our no-op barrier.
  phase='verify existing maintenance barrier and retained original Worker configuration';
  const proofLog=await fetch('https://api.github.com/repos/serox94/dream-team/actions/jobs/115512123413/logs',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN},signal:AbortSignal.timeout(20000)});check(proofLog.ok,'RESUME_PROOF_UNAVAILABLE');
  const lines=(await proofLog.text()).split('\n'),proofLine=lines.find(l=>l.includes('PRODUCTION RELEASE BLOCKED '));check(proofLine,'RESUME_STATUS_MISSING');const stopped=JSON.parse(proofLine.slice(proofLine.indexOf('PRODUCTION RELEASE BLOCKED ')+27));
  check(stopped.candidate===candidate&&stopped.run===38459921007&&stopped.credentials==='PASS'&&stopped.reason==='SOURCE_CHANGED_IN_MAINTENANCE'&&stopped.maintenanceWorker===true&&stopped.productionBusinessWrites===0,'RESUME_PROOF_INVALID');
  const originalFile=join(dir,'original-worker.json');wrangler(['r2','object','get','dream-team-audit-38459921007-archive/previous-worker.json','--remote','--file',originalFile]);await chmod(originalFile,0o600);const original=JSON.parse(await readFile(originalFile,'utf8'));check(original.active.versions.length===1&&original.active.versions[0].version_id===stopped.previousVersion,'ORIGINAL_WORKER_PROOF');
  for(const host of hosts){const r=await http(host,'/login');check(r.status===503&&(await r.text())==='Maintenance in progress. Try again later.','RESUME_BARRIER_NOT_INTACT');}
  status.previousVersion=stopped.previousVersion;status.credentials='PASS';status.credentialsVerifiedRun=38459921007;barrier=true;maintenance=true;status.maintenance='ON';
 }else{
 phase='production credential equality without secret disclosure';
 const oldCookie=await login(production,process.env.RYBY_LOGIN_USERNAME),value=oldCookie.slice(oldCookie.indexOf('=')+1),parts=value.split('.');check(parts.length===4,'LEGACY_COOKIE_FORMAT');
 const derived=createHash('sha256').update(process.env.RYBY_SESSION_SECRET+'\0'+process.env.RYBY_LOGIN_USERNAME+'\0'+process.env.RYBY_LOGIN_PASSWORD).digest(),expected=createHmac('sha256',derived).update(parts.slice(0,3).join('.')).digest('base64url');
 check(expected.length===parts[3].length&&timingSafeEqual(Buffer.from(expected),Buffer.from(parts[3])),'PRODUCTION_AUTH_SECRETS_DIFFER');await logout(production,oldCookie);status.credentials='PASS';
 }
 const archive=name+'-archive',restoredMedia=name+'-media';for(const bucket of [archive,restoredMedia]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
 const previousFile=resumeRun==='38459921007'?join(dir,'original-worker.json'):await configFile(dir,{settings,active,hosts,sourceMain:candidate},'previous-worker.json');await privatePut(archive,'previous-worker.json',previousFile,sha(await readFile(previousFile)));
 const live=await cf('/workers/scripts/dream-team/deployments');check(sha(JSON.stringify(live.deployments[0]))===sha(JSON.stringify(active)),'DEPLOYMENT_CHANGED_BEFORE_MAINTENANCE');
 phase='global HTTP/write/cron maintenance';
 const currentVars=Object.fromEntries(bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
 const maintenanceConfig={name:'dream-team',main:process.cwd()+'/scripts/maintenance-worker.js',workers_dev:true,compatibility_date:base.compatibility_date,vars:currentVars,triggers:{crons:[]},d1_databases:base.d1_databases,r2_buckets:base.r2_buckets};
 if(resumeRun!=='38459921007'){const barrierConfig=await configFile(dir,maintenanceConfig,'maintenance.jsonc');wrangler(['deploy','--config',barrierConfig]);barrier=true;maintenance=true;status.maintenance='ON';}
 await awaitHttp(production,'/login',r=>r.status===503);await assertBarrier(hosts);if(resumeRun!=='38459921007')await setMaintenance('on');
 phase='frozen D1 checkpoint and restore proof';
 const checkpointCreatedAt=new Date().toISOString(),before=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));
 source=await exportSql('wrangler.jsonc','dream-team-db',join(dir,'source.sql'));const snapshot=inspectSql(source.bytes),db=local(source.bytes);try{check(validateMigrationState(db)===20,'SOURCE_SCHEMA_NOT_20');preservation=oldManifest(db);}finally{db.close();}
 const exportBookmark=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));
 await verifySnapshot({uuid:productionId},snapshot);const frozenBookmark=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));check(before&&exportBookmark&&exportBookmark===frozenBookmark,'SOURCE_CHANGED_IN_MAINTENANCE');status.exportAdvancedBookmark=before!==exportBookmark;
 const sqlKey=process.env.RELEASE_MANIFEST_KEY.replace(/\.json$/,'.sql');await privatePut('dream-team-d1-backups',sqlKey,join(dir,'source.sql'),source.sha256);await privatePut(archive,'source.sql',join(dir,'source.sql'),source.sha256);
 const checkpointMetadata=await configFile(dir,{format:'dream-private-frozen-release-checkpoint-v1',candidate,createdAt:checkpointCreatedAt,sourceSchema:20,databaseId:productionId,bookmark:frozenBookmark,sqlSha256:source.sha256,sourceSqlBucket:'dream-team-d1-backups',sourceSqlKey:sqlKey,archive,sourceVerified:true,previousWorkerVersion:status.previousVersion,previousWorkerConfigKey:'previous-worker.json',restoration:'NEW_ISOLATED_TARGET_ONLY',automaticRollback:false},'checkpoint.json');await privatePut(archive,'checkpoint.json',checkpointMetadata,sha(await readFile(checkpointMetadata)));
 const proof=await cf('/d1/database','POST',{name:name+'-db'});assertSandbox(proof.name,proof.uuid);dbs.push(proof);const proofConfig=await configFile(dir,{...maintenanceConfig,name,workers_dev:true,d1_databases:[{binding:'DB',database_name:proof.name,database_id:proof.uuid,migrations_dir:process.cwd()+'/migrations'}]},'proof.jsonc');const restored=await importSandboxSql(proof,proofConfig,join(dir,'source.sql'));status.checkpointD1='PASS';status.sqlSha256=source.sha256;status.tables=restored.tables;status.rows=restored.rows;
 phase='frozen R2 checkpoint and restore proof';
 const ioWrapper=join(dir,'verify-source-worker.js');await writeFile(ioWrapper,`import recovery from ${JSON.stringify(process.cwd()+'/scripts/restore-io-worker.js')};
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 export default {async fetch(request,env,ctx){if(new URL(request.url).pathname!=='/verify-source')return recovery.fetch(request,env,ctx);if(!env.RECOVERY_KEY||request.headers.get('x-recovery-key')!==env.RECOVERY_KEY)return new Response('',{status:401});try{const manifest=await(await env.ARCHIVE.get('manifest.json')).json();const seen=[];let cursor;do{const listed=await env.SOURCE.list({cursor});seen.push(...listed.objects.map(o=>o.key));cursor=listed.truncated?listed.cursor:undefined;}while(cursor);if(seen.length!==manifest.entries.length)return new Response('',{status:409});for(const row of manifest.entries){const object=await env.SOURCE.get(row.key);if(!object||object.size!==row.size||await digest(await object.arrayBuffer())!==row.sha256)return new Response('',{status:409});}return Response.json({ok:true,objects:seen.length});}catch{return new Response('',{status:500});}},scheduled(){}};`);
 const ioConfig=await configFile(dir,{name:name+'-io',main:ioWrapper,workers_dev:true,compatibility_date:base.compatibility_date,triggers:{crons:[]},r2_buckets:[{binding:'SOURCE',bucket_name:'dream-team-media'},{binding:'ARCHIVE',bucket_name:archive},{binding:'RESTORED',bucket_name:restoredMedia}]},'io.jsonc');assertSandbox(name+'-io');ioCreated=true;const ioOutput=wrangler(['deploy','--config',ioConfig]);ioUrl=ioOutput.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(ioUrl,'PRIVATE_IO_URL');const ioKey=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',ioConfig],JSON.stringify({RECOVERY_KEY:ioKey}));const ioHeaders={'x-recovery-key':ioKey};await awaitHttp(ioUrl,'/ready',async r=>r.status===200&&(await r.json()).bindingsReady,ioHeaders);
 const backed=await http(ioUrl,'/backup',{method:'POST',headers:ioHeaders,signal:AbortSignal.timeout(120000)}),backup=await backed.json();check(backed.status===200&&backup.ok,'R2_BACKUP');const r2Restore=await privateRestore(ioUrl,ioKey);check(r2Restore.data.objects===backup.objects,'R2_RESTORE_COUNT');wrangler(['r2','object','get',archive+'/manifest.json','--remote','--file',join(dir,'r2.json')]);await chmod(join(dir,'r2.json'),0o600);check(sha(await readFile(join(dir,'r2.json')))===backup.manifestSha256,'R2_MANIFEST_DIGEST');r2Manifest=JSON.parse(await readFile(join(dir,'r2.json'),'utf8'));status.checkpointR2='PASS';status.r2Objects=backup.objects;status.restore='PASS';
 receipt={format:'dream-team-release-v1',candidate,createdAt:checkpointCreatedAt,databaseId:productionId,sourceSchema:20,schema:28,bookmark:frozenBookmark,sqlSha256:source.sha256,sourceSqlKey:sqlKey,previousWorkerVersion:status.previousVersion,previousWorkerConfigBucket:archive,previousWorkerConfigKey:'previous-worker.json',migrationRehearsal:'PASS',migrationRehearsalRun:38452241176,r2Restore:'PASS',r2Archive:archive,r2ManifestSha256:backup.manifestSha256,preMigrationVerified:true,postMigrationVerified:false,maintenance:true,sessionsPurged:false,externalDeployAudit:'PASS',productionChangesAuthorized:true,rollbackAutomatic:false,rollbackSchemaCompatible:false};
 // Runtime configuration preserves provider variables and secrets; only reviewed release flags change.
 base.vars={...currentVars,...base.vars,APP_BUILD:candidate};delete base.vars.AUTH_LEGACY_ALIAS;await writeFile('wrangler.jsonc',JSON.stringify(base,null,2));
 phase='physical legacy session revocation';await query(productionId,'DELETE FROM auth_sessions');check((await query(productionId,'SELECT COUNT(*) n FROM auth_sessions')).results[0].n===0,'SESSION_PURGE');receipt.sessionsPurged=true;await savedReceipt();
 phase='approved explicit D1 migration20to28';await operator('migrate');await unchangedBusiness();receipt.postMigrationVerified=true;status.migration='PASS';status.dataIntegrity='PASS';
 phase='individual account initialization with existing password and pepper';await operator('initialize');await unchangedBusiness();const accounts=(await query(productionId,'SELECT id,username,angler_id,active FROM auth_accounts ORDER BY id')).results;for(const [username,id] of [['Patryk','patryk'],['Maciek','maciek']])check(accounts.some(a=>a.username===username&&a.angler_id===id&&a.active===1),'ACCOUNT_MAPPING');check(accounts.filter(a=>a.active===1).length<=3,'ACCOUNT_LIMIT');await query(productionId,'DELETE FROM auth_sessions');status.accounts='PASS';
 phase='private operator smoke while public traffic stays behind maintenance Worker';
 const gateKey=randomBytes(32).toString('hex'),canary=name;
 const wrapper=join(dir,'private-canary.js');await writeFile(wrapper,`import app from ${JSON.stringify(process.cwd()+'/src/worker.js')};\nexport default {async fetch(request,env,ctx){if(!env.RELEASE_GATE_KEY||request.headers.get('x-release-gate')!==env.RELEASE_GATE_KEY)return new Response('Unavailable',{status:503});const path=new URL(request.url).pathname;if(!['GET','HEAD'].includes(request.method)&&!['/api/login','/api/logout'].includes(path)){if(request.method!=='POST'||path!=='/api/catches'||await request.clone().text()!=='{}')return new Response('Read only',{status:503});}const headers=new Headers(request.headers);headers.delete('x-release-gate');return app.fetch(new Request(request,{headers}),env,ctx);},scheduled(){}};`);
 const canarySettings={...base,name:canary,main:wrapper,workers_dev:true,triggers:{crons:[]},assets:{...base.assets,directory:process.cwd()+'/public'}};delete canarySettings.secrets;const canaryConfig=await configFile(dir,canarySettings,'canary.jsonc');assertSandbox(canary);canaryCreated=true;const canaryOut=wrangler(['deploy','--config',canaryConfig]),canaryUrl=canaryOut.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(canaryUrl,'CANARY_URL');wrangler(['secret','bulk','--config',canaryConfig],JSON.stringify({RELEASE_GATE_KEY:gateKey,RYBY_LOGIN_USERNAME:process.env.RYBY_LOGIN_USERNAME,RYBY_LOGIN_PASSWORD:process.env.RYBY_LOGIN_PASSWORD,RYBY_SESSION_SECRET:process.env.RYBY_SESSION_SECRET}));
 const smokeHeaders={'x-release-gate':gateKey};await setMaintenance('off');await assertBarrier(hosts);check((await http(canaryUrl,'/api/bootstrap')).status===503,'PRIVATE_CANARY_NOT_PROTECTED');await awaitHttp(canaryUrl,'/login',r=>r.status===200&&r.headers.get('x-dreamteam-build')===candidate,smokeHeaders);await apiSmoke(canaryUrl,smokeHeaders);await uiSmoke(canaryUrl,smokeHeaders);await unchangedBusiness();await setMaintenance('on');await query(productionId,'DELETE FROM auth_sessions');status.privateProductionSmoke='PASS';
 phase='exact approved production deployment';await assertBarrier(hosts);receipt.sessionsPurged=true;receipt.maintenance=true;receipt.postMigrationVerified=true;await operator('deploy');barrier=false;
 const deployed=await cf('/workers/scripts/dream-team/deployments');check(deployed.deployments[0].versions.length===1&&deployed.deployments[0].versions[0].percentage===100,'TARGET_TRAFFIC');status.activeVersion=deployed.deployments[0].versions[0].version_id;
 await awaitHttp(production,'/login',r=>r.status===503&&r.headers.get('x-dreamteam-build')===candidate);await assertBarrier(hosts);
 const targetSettings=await cf('/workers/scripts/dream-team/settings');for(const [k,v] of Object.entries(base.vars))check(targetSettings.bindings.some(b=>b.name===k&&b.text===v),'TARGET_VARIABLE_MISMATCH');for(const [binding,bucket] of [['MEDIA','dream-team-media'],['BACKUP_STATUS','dream-team-d1-backups']])check(targetSettings.bindings.some(b=>b.name===binding&&b.bucket_name===bucket),'TARGET_R2_BINDING');check(targetSettings.bindings.some(b=>b.name==='DB'&&b.id===productionId),'TARGET_D1_BINDING');for(const secret of bindings.filter(b=>b.type==='secret_text'))check(targetSettings.bindings.some(b=>b.type==='secret_text'&&b.name===secret.name),'SOURCE_SECRET_REMOVED');await unchangedBusiness();status.configuration='PASS';
 phase='open traffic after successful private production smoke and deployment guards';await setMaintenance('off');opened=true;
 await awaitHttp(production,'/login',r=>r.status===200&&r.headers.get('x-dreamteam-build')===candidate&&r.headers.get('x-dreamteam-auth-mode')==='individual');await apiSmoke(production);await uiSmoke(production);await unchangedBusiness();status.finalSmoke='PASS';
 phase='final private checkpoint and source media preservation';const finalSql=await unchangedBusiness();await privatePut(archive,'released28.sql',join(dir,'current.sql'),finalSql.sha256);
 // Never overwrite the frozen archive while checking current production objects.
 const finalR2=await http(ioUrl,'/verify-source',{headers:ioHeaders,signal:AbortSignal.timeout(120000)}),finalR2Data=await finalR2.json();check(finalR2.status===200&&finalR2Data.ok&&finalR2Data.objects===r2Manifest.entries.length,'PRODUCTION_MEDIA_CHANGED');
 receipt.releasedAt=new Date().toISOString();receipt.activeWorkerVersion=status.activeVersion;receipt.finalSmoke='PASS';receipt.postReleaseDataVerified=true;receipt.releasedSqlSha256=finalSql.sha256;receipt.maintenance=false;const completed=await configFile(dir,receipt,'completed.json');await privatePut(archive,'completed-release.json',completed,sha(await readFile(completed)));status.manifest='PRIVATE_VERIFIED';status.deployment='SUCCESS';status.maintenance='OFF';maintenance=false;
 console.log('PRODUCTION RELEASE SUCCESS '+JSON.stringify(status));
}catch(error){
 if(maintenance||opened||barrier){try{await setMaintenance('on');status.maintenance='ON';}catch{status.maintenance='CHECK REQUIRED';}}
 status.phase=phase;status.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'RELEASE_OPERATION_FAILED';status.httpStatus=error.status||null;status.code=error.code;status.operation=error.operation;status.maintenanceWorker=barrier;status.deployment='BLOCKED';process.exitCode=1;
 console.log('PRODUCTION RELEASE BLOCKED '+JSON.stringify(status));
}finally{
 if(cookieSessions.size)try{await query(productionId,'DELETE FROM auth_sessions');}catch{status.sessionCleanup='BLOCKED';}
 if(canaryCreated)try{assertSandbox(name);await cf('/workers/scripts/'+name,'DELETE');}catch{status.privateCanaryCleanup='BLOCKED';}
 if(ioCreated)try{assertSandbox(name+'-io');await cf('/workers/scripts/'+name+'-io','DELETE');}catch{status.privateIoCleanup='BLOCKED';}
 for(const db of dbs)try{assertSandbox(db.name,db.uuid);await cf('/d1/database/'+db.uuid,'DELETE');}catch{status.privateD1Cleanup='BLOCKED';}
 await rm(dir,{recursive:true,force:true});await mkdir('../release-safe-status',{recursive:true});await writeFile('../release-safe-status/status.json',JSON.stringify(status,null,2));
}
