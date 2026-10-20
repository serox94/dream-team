// One explicit, environment-approved workflow_dispatch operation. Never runs on push.
// The application is checked out at the reviewed commit; only operational files are supplied separately.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHmac,createHash,timingSafeEqual,privateDecrypt,constants} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright';
import {cf,query,wrangler,sha,productionId,assertSandbox,configFile,exportSql,importSandboxSql} from './recovery-common.mjs';
import {inspectSql,verifySnapshot} from './d1-snapshot.mjs';
import {oldManifest,validateMigrationState,compareManifest} from './migration-contract.mjs';
import {privateRestore} from './recovery-transport.mjs';
import {wrapLocal,insertSql,assertPreparedFiles} from './astra-release-model.mjs';
import {initializeProtectedAccount} from '../src/auth.js';
const candidate=process.env.RELEASE_CANDIDATE;
const production='https://dream-team.sewerynski00.workers.dev';
const run=process.env.GITHUB_RUN_ID,name='dream-team-audit-'+run;
const dir=await mkdtemp(join(tmpdir(),'dream-private-release-'));
const status={candidate,run:Number(run),deployment:'BLOCKED',phase:'manual approval',maintenance:'NOT STARTED',productionBusinessWrites:0,productionMediaWrites:0,providerCalls:0};
let phase=status.phase,maintenance=false,barrier=false,opened=false,receipt,source,preservation,snapshot,originalMaintenance,preflight,protectedPassword,expectedSnapshot,initializationSql,r2Manifest,ioUrl,ioCreated=false,canaryCreated=false,barrierConfig,barrierVersion,continuityCookie;
const cookieHash=cookie=>sha(cookie.slice(cookie.indexOf('=')+1).split('.')[1]);
const ownSessionHashes=new Set();
const dbs=[],cookieSessions=new Set();
const check=(ok,code)=>{if(!ok)throw Error(code);};
const bookmark=x=>typeof x==='string'?x:x?.bookmark;
const local=bytes=>{const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});try{db.exec(bytes.toString());return db;}catch(e){db.close();throw e;}};
const http=(base,path,options={})=>fetch(new URL(path,base),{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
async function privatePut(bucket,key,file,digest){wrangler(['r2','object','put',bucket+'/'+key,'--remote','--file',file]);const copy=join(dir,randomUUID());wrangler(['r2','object','get',bucket+'/'+key,'--remote','--file',copy]);await chmod(copy,0o600);check(sha(await readFile(copy))===digest,'PRIVATE_CHECKPOINT_ROUNDTRIP');}
async function pause(ms){await new Promise(r=>setTimeout(r,ms));}
async function awaitHttp(base,path,test,headers={}){const end=Date.now()+120000;for(;;){const r=await http(base,path,{headers});if(await test(r))return r;if(Date.now()>end)throw Error('EDGE_STATE_NOT_READY');await pause(2000);}}
async function setMaintenance(value){await query(productionId,"INSERT INTO app_settings(key,value,updated_at) VALUES('maintenance_mode',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[value]);}
async function assertUnchanged({final=false}={}){
 const sourceExpected=expectedSnapshot||snapshot;
 const expected={...sourceExpected,tables:sourceExpected.tables.map(t=>({...t,rows:t.rows.filter(r=>t.name!=='auth_sessions'||!ownSessionHashes.has(r.id_hash)).flatMap(r=>t.name==='app_settings'&&r.key==='maintenance_mode'&&final?(originalMaintenance?[originalMaintenance]:[]):[r])}))};
 await verifySnapshot({uuid:productionId},expected,async(id,sql,params)=>{
  const result=await query(id,sql,params);
  if(sql==='SELECT * FROM "auth_sessions"')result.results=result.results.filter(r=>!ownSessionHashes.has(r.id_hash));
  if(expectedSnapshot&&sql==='SELECT * FROM "app_settings"')for(const row of result.results)if(row.key==='schema_version'){check(row.value==='29','TARGET_SCHEMA_VERSION');row.updated_at=expected.tables.find(t=>t.name==='app_settings').rows.find(r=>r.key==='schema_version').updated_at;}
  if(expectedSnapshot&&sql==='SELECT * FROM "d1_migrations"')for(const row of result.results)if(row.name==='0029_audit_account_guards.sql')row.applied_at=expected.tables.find(t=>t.name==='d1_migrations').rows.find(r=>r.name===row.name).applied_at;
  return result;
 });
}
async function saveReceipt(){
 check(receipt.format==='dream-team-astra-release-v1'&&receipt.sourceSchema===28&&receipt.schema===29,'AUDIT_RELEASE_RECEIPT_SCHEMA');
 check(receipt.candidate===candidate&&receipt.databaseId===productionId&&receipt.restore==='PASS'&&receipt.r2Restore==='PASS','AUDIT_RELEASE_RECEIPT_PROOF');
 check(receipt.migrations===1&&receipt.accountInitializations===1&&receipt.globalSessionPurges===0&&receipt.maintenance===true,'AUDIT_RELEASE_SCOPE');
 check(Date.now()-Date.parse(receipt.createdAt)<35*60*1000,'STALE_CHECKPOINT');
 const file=await configFile(dir,receipt,'release.json');await privatePut('dream-team-d1-backups',process.env.RELEASE_MANIFEST_KEY,file,sha(await readFile(file)));
}
async function restoreMaintenanceSetting(){
 if(originalMaintenance)await query(productionId,'UPDATE app_settings SET value=?,updated_at=? WHERE key=?',[originalMaintenance.value,originalMaintenance.updated_at,'maintenance_mode']);
 else await query(productionId,"DELETE FROM app_settings WHERE key='maintenance_mode'");
}
async function assertBarrier(hosts){for(const host of hosts)for(const [path,method] of [['/login','GET'],['/api/bootstrap','GET'],['/api/catches','POST']])check((await http(host,path,{method})).status===503,'MAINTENANCE_HOST_NOT_BLOCKED');}
async function login(base,username,extra={}){const r=await http(base,'/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...extra},body:new URLSearchParams({username,password:process.env.RYBY_LOGIN_PASSWORD})});const h=r.headers.get('set-cookie');check(r.status===303&&h?.startsWith('__Host-ryby_session=')&&!r.headers.get('location')?.includes('error='),'LOGIN_FAILED');for(const flag of ['HttpOnly','Secure','SameSite=Lax'])check(h.includes(flag),'COOKIE_FLAGS');const cookie=h.split(';')[0];cookieSessions.add(cookie);ownSessionHashes.add(cookieHash(cookie));return cookie;}
async function logout(base,cookie,extra={}){check((await http(base,'/api/logout',{method:'POST',headers:{cookie,...extra}})).status===200,'LOGOUT_FAILED');check((await http(base,'/api/bootstrap',{headers:{cookie,...extra}})).status===401,'REVOKED_COOKIE_REUSED');cookieSessions.delete(cookie);}
async function apiSmoke(base,extra={}){
 for(const path of ['/api/bootstrap','/api/export','/api/health'])check((await http(base,path,{headers:extra})).status===401,'UNAUTHENTICATED_API');
 check((await http(base,'/api/catches',{method:'POST',headers:{...extra,'content-type':'application/json'},body:'{}'})).status===401,'UNAUTHENTICATED_WRITE');
 for(const {username,angler_id:id} of snapshot.tables.find(t=>t.name==='auth_accounts').rows.filter(a=>a.active===1)){
  const cookie=await login(base,username,extra),headers={cookie,...extra};
  const boot=await http(base,'/api/bootstrap',{headers});check(boot.status===200,'BOOTSTRAP_FAILED');const model=await boot.json();check(model.currentUser?.anglerId===id&&model.currentUser.username===username,'WRONG_ACCOUNT_IDENTITY');
  check(model.trips.length===preservation.trips.rows.length&&model.anglers.length===preservation.anglers.rows.length,'BOOTSTRAP_DATA_COUNT');
  for(const trip of model.trips)for(const resource of ['catches','checklist']){const r=await http(base,'/api/'+resource+'?tripId='+encodeURIComponent(trip.id),{headers});check(r.status===200,'TRIP_DATA_NOT_READABLE');const data=await r.json();check(Array.isArray(data[resource==='catches'?'catches':'items']),'TRIP_DATA_SHAPE');}
  for(const path of ['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/ustawienia.html','/pages/pogoda.html']){const r=await http(base,path,{headers});check(r.status===200,'PAGE_UNAVAILABLE');check(r.headers.get('x-frame-options')==='DENY'&&/frame-ancestors 'none'/.test(r.headers.get('content-security-policy')||''),'PRIVATE_PAGE_FRAME_PROTECTION');}
  const cross=await http(base,'/api/catches',{method:'POST',headers:{...headers,origin:'https://example.invalid','content-type':'application/json'},body:'{}'});check(cross.status===403,'CROSS_ORIGIN_WRITE_NOT_BLOCKED');
  await logout(base,cookie,extra);
 }
}
async function protectedSmoke(base,extra={}){
 const r=await http(base,'/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',...extra},body:new URLSearchParams({username:'ryby',password:protectedPassword})});
 check(r.status===303&&r.headers.get('location')==='/','PROTECTED_INITIAL_LOGIN');const h=r.headers.get('set-cookie');check(h,'PROTECTED_COOKIE');const cookie=h.split(';')[0];cookieSessions.add(cookie);ownSessionHashes.add(cookieHash(cookie));
 const redirect=await http(base,'/',{headers:{cookie,...extra}});check(redirect.status===303&&new URL(redirect.headers.get('location'),base).pathname==='/account-password.html','INITIAL_ACCOUNT_NOT_FORCED_TO_CHANGE');check((await http(base,'/api/bootstrap',{headers:{cookie,...extra}})).status===403,'INITIAL_ACCOUNT_PRIVATE_DATA_EXPOSED');
 const forced=await http(base,'/account-password.html',{headers:{cookie,...extra}});check(forced.status===200&&(await forced.text()).includes('sharedPassword'),'FORCED_PASSWORD_PAGE');await logout(base,cookie,extra);
}
async function uiSmoke(base,extra={}){
 const browser=await chromium.launch({headless:true});
 try{for(const [width,username,id] of [[390,'Patryk','patryk'],[1280,'Maciek','maciek']]){
  const cookie=await login(base,username,extra),context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block',locale:'pl-PL'});
  await context.addCookies([{name:'__Host-ryby_session',value:cookie.slice(cookie.indexOf('=')+1),url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  if(Object.keys(extra).length)await context.route('**/*',async route=>{const request=route.request();await route.continue({headers:new URL(request.url()).origin===base?{...request.headers(),...extra}:request.headers()});});
  const page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('PAGE_ERROR'));
  for(const path of ['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html','/pages/ustawienia.html']){
   status.uiCheckpoint={target:base===production?'production':'isolated',width,path};
   check((await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000})).status()===200,'UI_PAGE_HTTP');await page.locator('html[data-ready="true"]').waitFor({timeout:30000});
   if(path.includes('pogoda')){
    await page.locator('#weather-source-status').filter({hasText:'Open-Meteo'}).waitFor({timeout:45000});
    const headline=await page.locator('#carp-weather-headline').innerText();check(headline.length>12&&!/Analizuję|Analy[sz]ing/.test(headline),'WEATHER_ANALYSIS_NOT_RENDERED');
    for(const id of ['carp-pressure','carp-wind','carp-rain','carp-air','carp-window'])check(!['—','--',''].includes((await page.locator('#'+id).innerText()).trim()),'WEATHER_FIELD_EMPTY');
    check(await page.locator('#carp-weather-actions li').count()>0,'WEATHER_ACTIONS_EMPTY');
   }
   const dims=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth}));check(dims.s<=dims.w+1,'UI_HORIZONTAL_OVERFLOW');
   if(path.includes('polowy')){const person=await page.locator('#person').inputValue();check(person===preservation.anglers.rows.find(a=>a.id===id)?.name,'CATCH_AUTHOR_NOT_CURRENT_USER');}
  }
  const control=page.locator('.language-selector select');check(await control.count()===1,'LANGUAGE_CONTROL_COUNT');
  for(const lang of ['en','pl']){await control.selectOption(lang);await page.locator('html[lang="'+lang+'"]').waitFor({timeout:20000});await page.reload({waitUntil:'domcontentloaded',timeout:45000});await page.locator('html[data-ready="true"]').waitFor({timeout:30000});check(await page.locator('html').getAttribute('lang')===lang,'LANGUAGE_NOT_PERSISTENT');}
  check(errors.length===0,'UI_JAVASCRIPT_ERROR');await context.close();await logout(base,cookie,extra);
 }}finally{await browser.close();}
}
try{
 assert.match(candidate||'',/^[a-f0-9]{40}$/);assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.DREAMTEAM_PRODUCTION_APPROVED,'yes');assert.equal(process.env.RELEASE_CANDIDATE,candidate);assert.equal(process.env.RELEASE_ACTION,'deploy');assert.match(run||'',/^\d+$/);assert.match(process.env.RELEASE_MANIFEST_KEY||'',/^private-releases\/[a-f0-9-]+\.json$/);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),candidate);
 const base=JSON.parse(await readFile('wrangler.jsonc','utf8'));check(base.name==='dream-team'&&base.d1_databases[0].database_id===productionId,'TARGET_CONFIG');
 phase='current deployment queue, schema28 and configuration';console.log('RELEASE PHASE: '+phase);
 const [settings,deployments,scripts,domains,subdomain]=await Promise.all([cf('/workers/scripts/dream-team/settings'),cf('/workers/scripts/dream-team/deployments'),cf('/workers/scripts'),cf('/workers/domains'),cf('/workers/subdomain')]);
 const worker=scripts.find(w=>w.id==='dream-team');check(worker?.tag,'WORKER_TAG');
 async function queueGate(){
  const builds=await cf('/builds/workers/'+encodeURIComponent(worker.tag)+'/builds?per_page=100'),list=Array.isArray(builds)?builds:builds.builds;
  check(Array.isArray(list)&&!list.some(b=>['queued','pending','initializing','running','building'].includes(b.status)),'OTHER_BUILD_ACTIVE');
  const gh=await fetch('https://api.github.com/repos/serox94/dream-team/actions/runs?per_page=100',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});check(gh.ok,'GITHUB_QUEUE_NOT_READABLE');
  check(!(await gh.json()).workflow_runs.some(r=>String(r.id)!==run&&r.path==='.github/workflows/deploy-private.yml'&&r.status!=='completed'),'OTHER_MANUAL_RELEASE_ACTIVE');
 }
 await queueGate();status.concurrentDeploymentGate='PASS';
 const state=(await query(productionId,"SELECT * FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).results;
 originalMaintenance=state.find(r=>r.key==='maintenance_mode');check(state.find(r=>r.key==='schema_version')?.value==='28'&&originalMaintenance?.value!=='on','SOURCE_NOT_OPEN_SCHEMA28');
 const active=deployments.deployments[0];check(active.versions.length===1&&active.versions[0].percentage===100,'SPLIT_PRODUCTION_TRAFFIC');status.previousVersion=active.versions[0].version_id;
 const activeVersion=await cf('/workers/scripts/dream-team/versions/'+encodeURIComponent(status.previousVersion));check(Array.isArray(activeVersion.resources?.bindings),'ACTIVE_VERSION_BINDINGS_UNAVAILABLE');
 const bindings=activeVersion.resources.bindings,currentVars=Object.fromEntries(bindings.filter(b=>['plain_text','json'].includes(b.type)).map(b=>[b.name,b.type==='json'?b.json:b.text]));
 status.sourceFlags=Object.fromEntries(['APP_BUILD','APP_ENV','INDIVIDUAL_ACCOUNTS','AI_FREE_ONLY'].map(k=>[k,currentVars[k]??'ABSENT']));check(/^[a-f0-9]{40}$/.test(currentVars.APP_BUILD)&&currentVars.INDIVIDUAL_ACCOUNTS==='true'&&[false,true,'false','true'].includes(currentVars.AI_FREE_ONLY),'SOURCE_RELEASE_FLAGS');status.previousCommit=currentVars.APP_BUILD;
 check(bindings.some(b=>b.type==='d1'&&b.name==='DB'&&b.id===productionId),'SOURCE_D1_BINDING');
 for(const [binding,bucket] of [['MEDIA','dream-team-media'],['BACKUP_STATUS','dream-team-d1-backups']])check(bindings.some(b=>b.type==='r2_bucket'&&b.name===binding&&b.bucket_name===bucket),'SOURCE_R2_BINDING');
 for(const k of ['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'])check(bindings.some(b=>b.type==='secret_text'&&b.name===k),'SOURCE_SECRET_MISSING');
 for(const k of ['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'])check(process.env[k],'OPERATOR_AUTH_SECRET_MISSING');
 const hosts=[...new Set([production,'https://dream-team.'+subdomain.subdomain+'.workers.dev',...(Array.isArray(domains)?domains:domains.domains||[]).filter(d=>d.service==='dream-team').map(d=>'https://'+d.hostname)])];
 phase='verify private preflight receipt and encrypted bootstrap credential';console.log('RELEASE PHASE: '+phase);
 const receiptFile=join(dir,'preflight.json');wrangler(['r2','object','get','dream-team-d1-backups/'+process.env.RELEASE_MANIFEST_KEY,'--remote','--file',receiptFile]);await chmod(receiptFile,0o600);preflight=JSON.parse(await readFile(receiptFile,'utf8'));
 check(preflight.format==='dream-team-astra-preflight-v1'&&/^[a-f0-9]{40}$/.test(preflight.candidate||'')&&preflight.sourceSchema===28&&preflight.schema===29,'PREFLIGHT_RECEIPT_MISMATCH');if(preflight.candidate!==candidate){execFileSync('git',['fetch','--no-tags','--depth=1','origin',preflight.candidate],{stdio:['ignore','pipe','pipe']});const files=execFileSync('git',['diff','--name-only','--no-renames','-z',preflight.candidate,candidate],{encoding:'utf8'}).split('\0').filter(Boolean);assertPreparedFiles(files);status.preflightSourceCommit=preflight.candidate;status.preflightRuntimeEquivalence='PASS';}
 check(preflight.productionD1Writes===0&&preflight.sqlSha256&&preflight.bookmark,'PREFLIGHT_CHECKPOINT_MISSING');check(preflight.migrationRehearsal==='PASS'&&preflight.r2Restore==='PASS'&&preflight.previousWorkerVersion===status.previousVersion,'PREFLIGHT_PROOF_MISMATCH');check(Date.now()-Date.parse(preflight.createdAt)<12*60*60*1000,'PREFLIGHT_TOO_OLD');assertSandbox(preflight.bootstrapPrivateKeyBucket);
 const privateKeyFile=join(dir,'bootstrap-private.pem');wrangler(['r2','object','get',preflight.bootstrapPrivateKeyBucket+'/'+preflight.bootstrapPrivateKeyKey,'--remote','--file',privateKeyFile]);await chmod(privateKeyFile,0o600);
 const envelope=JSON.parse(privateDecrypt({key:await readFile(privateKeyFile),oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(process.env.PROTECTED_BOOTSTRAP_ENVELOPE||'','base64')).toString('utf8'));
 check(envelope.candidate===candidate&&envelope.preflightRun===preflight.run&&envelope.expiresAt>Date.now()&&typeof envelope.password==='string'&&envelope.password.length>0&&envelope.password.length<=256,'BOOTSTRAP_ENVELOPE_MISMATCH');protectedPassword=envelope.password;
 const proofRuns=await fetch('https://api.github.com/repos/serox94/dream-team/actions/runs?head_sha='+candidate+'&per_page=100',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(20000)});check(proofRuns.ok,'CANDIDATE_CI_NOT_READABLE');const candidateRuns=(await proofRuns.json()).workflow_runs;
 for(const path of ['.github/workflows/validate.yml','.github/workflows/responsive-qa.yml'])check(candidateRuns.some(r=>r.head_sha===candidate&&r.path===path&&r.conclusion==='success'),'CANDIDATE_CI_NOT_PASS');
 check((await query(productionId,"SELECT id FROM auth_accounts WHERE username='ryby' COLLATE NOCASE")).results.length===0&&(await query(productionId,"SELECT id FROM anglers WHERE id='system-ryby'")).results.length===0,'SYSTEM_ACCOUNT_COLLISION');
 phase='existing credentials and session continuity baseline';console.log('RELEASE PHASE: '+phase);
 const health=await http(production,'/login');check(health.status===200&&health.headers.get('x-dreamteam-build')===currentVars.APP_BUILD&&health.headers.get('x-dreamteam-auth-mode')==='individual','SOURCE_BUILD_NOT_VERIFIED');
 continuityCookie=await login(production,'Patryk');const parts=continuityCookie.slice(continuityCookie.indexOf('=')+1).split('.');check(parts.length===4,'COOKIE_FORMAT');
 const derived=createHash('sha256').update(process.env.RYBY_SESSION_SECRET+'\0'+process.env.RYBY_LOGIN_USERNAME+'\0'+process.env.RYBY_LOGIN_PASSWORD).digest(),signature=createHmac('sha256',derived).update(parts.slice(0,3).join('.')).digest('base64url');
 check(signature.length===parts[3].length&&timingSafeEqual(Buffer.from(signature),Buffer.from(parts[3])),'PRODUCTION_AUTH_SECRETS_DIFFER');status.credentials='PASS';
 const archive=name+'-archive',restoredMedia=name+'-media';for(const bucket of [archive,restoredMedia]){assertSandbox(bucket);await cf('/r2/buckets','POST',{name:bucket});}
 const previousFile=await configFile(dir,{settings,activeVersion,active,hosts,sourceMain:currentVars.APP_BUILD,sourceSchema:28},'previous-worker.json');await privatePut(archive,'previous-worker.json',previousFile,sha(await readFile(previousFile)));
 check(sha(JSON.stringify((await cf('/workers/scripts/dream-team/deployments')).deployments[0]))===sha(JSON.stringify(active)),'DEPLOYMENT_CHANGED_BEFORE_MAINTENANCE');
 phase='global HTTP/write/cron maintenance';console.log('RELEASE PHASE: '+phase);
 const maintenanceConfig={name:'dream-team',main:process.cwd()+'/scripts/maintenance-worker.js',workers_dev:true,compatibility_date:base.compatibility_date,vars:currentVars,triggers:{crons:[]},d1_databases:base.d1_databases,r2_buckets:base.r2_buckets};
 barrierConfig=await configFile(dir,maintenanceConfig,'maintenance.jsonc');wrangler(['deploy','--config',barrierConfig]);barrier=true;maintenance=true;status.maintenance='ON';
 await awaitHttp(production,'/login',r=>r.status===503);await assertBarrier(hosts);await setMaintenance('on');
 barrierVersion=(await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id;
 phase='fresh frozen schema28 D1 checkpoint and isolated restore';console.log('RELEASE PHASE: '+phase);
 const checkpointCreatedAt=new Date().toISOString();source=await exportSql('wrangler.jsonc','dream-team-db',join(dir,'source.sql'));snapshot=inspectSql(source.bytes);
 const db=local(source.bytes);try{check(validateMigrationState(db)===28,'SOURCE_SCHEMA_NOT_28');preservation=oldManifest(db);}finally{db.close();}
 const frozenBookmark=bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark'));await verifySnapshot({uuid:productionId},snapshot);
 check(frozenBookmark&&frozenBookmark===bookmark(await cf('/d1/database/'+productionId+'/time_travel/bookmark')),'SOURCE_CHANGED_IN_MAINTENANCE');
 const sqlKey=process.env.RELEASE_MANIFEST_KEY.replace(/\.json$/,'.sql');await privatePut('dream-team-d1-backups',sqlKey,join(dir,'source.sql'),source.sha256);await privatePut(archive,'source.sql',join(dir,'source.sql'),source.sha256);
 const checkpoint=await configFile(dir,{format:'dream-private-astra-checkpoint-v1',candidate,createdAt:checkpointCreatedAt,sourceSchema:28,databaseId:productionId,bookmark:frozenBookmark,sqlSha256:source.sha256,sourceSqlBucket:'dream-team-d1-backups',sourceSqlKey:sqlKey,archive,previousWorkerVersion:status.previousVersion,previousWorkerConfigKey:'previous-worker.json',restoration:'NEW_ISOLATED_TARGET_ONLY',automaticRollback:false},'checkpoint.json');await privatePut(archive,'checkpoint.json',checkpoint,sha(await readFile(checkpoint)));
 const proof=await cf('/d1/database','POST',{name:name+'-db'});assertSandbox(proof.name,proof.uuid);dbs.push(proof);
 const proofConfig=await configFile(dir,{...maintenanceConfig,name,d1_databases:[{binding:'DB',database_name:proof.name,database_id:proof.uuid,migrations_dir:process.cwd()+'/migrations'}]},'proof.jsonc');
 const restored=await importSandboxSql(proof,proofConfig,join(dir,'source.sql'));status.checkpointD1='PASS';status.sqlSha256=source.sha256;status.tables=restored.tables;status.rows=restored.rows;
 phase='frozen R2 checkpoint and restore proof';console.log('RELEASE PHASE: '+phase);
 const ioWrapper=join(dir,'verify-source-worker.js');await writeFile(ioWrapper,`import recovery from ${JSON.stringify(process.cwd()+'/scripts/restore-io-worker.js')};
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
 export default {async fetch(request,env,ctx){if(new URL(request.url).pathname!=='/verify-source')return recovery.fetch(request,env,ctx);if(!env.RECOVERY_KEY||request.headers.get('x-recovery-key')!==env.RECOVERY_KEY)return new Response('',{status:401});try{const manifest=await(await env.ARCHIVE.get('manifest.json')).json();const seen=[];let cursor;do{const listed=await env.SOURCE.list({cursor});seen.push(...listed.objects.map(o=>o.key));cursor=listed.truncated?listed.cursor:undefined;}while(cursor);if(seen.length!==manifest.entries.length)return new Response('',{status:409});for(const row of manifest.entries){const object=await env.SOURCE.get(row.key);if(!object||object.size!==row.size||await digest(await object.arrayBuffer())!==row.sha256)return new Response('',{status:409});}return Response.json({ok:true,objects:seen.length});}catch{return new Response('',{status:500});}},scheduled(){}};`);
 const ioConfig=await configFile(dir,{name:name+'-io',main:ioWrapper,workers_dev:true,compatibility_date:base.compatibility_date,triggers:{crons:[]},r2_buckets:[{binding:'SOURCE',bucket_name:'dream-team-media'},{binding:'ARCHIVE',bucket_name:archive},{binding:'RESTORED',bucket_name:restoredMedia}]},'io.jsonc');assertSandbox(name+'-io');ioCreated=true;const ioOutput=wrangler(['deploy','--config',ioConfig]);ioUrl=ioOutput.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(ioUrl,'PRIVATE_IO_URL');const ioKey=randomBytes(32).toString('hex');wrangler(['secret','bulk','--config',ioConfig],JSON.stringify({RECOVERY_KEY:ioKey}));const ioHeaders={'x-recovery-key':ioKey};await awaitHttp(ioUrl,'/ready',async r=>r.status===200&&(await r.json()).bindingsReady,ioHeaders);
 const backed=await http(ioUrl,'/backup',{method:'POST',headers:ioHeaders,signal:AbortSignal.timeout(120000)}),backup=await backed.json();check(backed.status===200&&backup.ok,'R2_BACKUP');const r2Restore=await privateRestore(ioUrl,ioKey);check(r2Restore.data.objects===backup.objects,'R2_RESTORE_COUNT');wrangler(['r2','object','get',archive+'/manifest.json','--remote','--file',join(dir,'r2.json')]);await chmod(join(dir,'r2.json'),0o600);check(sha(await readFile(join(dir,'r2.json')))===backup.manifestSha256,'R2_MANIFEST_DIGEST');r2Manifest=JSON.parse(await readFile(join(dir,'r2.json'),'utf8'));status.checkpointR2='PASS';status.r2Objects=backup.objects;status.restore='PASS';
 receipt={format:'dream-team-astra-release-v1',candidate,createdAt:checkpointCreatedAt,databaseId:productionId,sourceSchema:28,schema:29,bookmark:frozenBookmark,sqlSha256:source.sha256,sourceSqlKey:sqlKey,previousWorkerVersion:status.previousVersion,previousCommit:currentVars.APP_BUILD,previousWorkerConfigBucket:archive,previousWorkerConfigKey:'previous-worker.json',restore:'PASS',r2Restore:'PASS',r2Archive:archive,r2ManifestSha256:backup.manifestSha256,migrations:1,accountInitializations:1,globalSessionPurges:0,maintenance:true,externalDeployAudit:'PASS',automaticRollback:false};
 // Never alter provider settings or production secrets. The candidate only changes APP_BUILD.
 check(base.vars.INDIVIDUAL_ACCOUNTS===currentVars.INDIVIDUAL_ACCOUNTS&&String(base.vars.AI_FREE_ONLY)===String(currentVars.AI_FREE_ONLY),'CANDIDATE_FLAGS_CHANGED');
 base.vars={...currentVars,APP_BUILD:candidate};
 phase='isolated schema29 migration, protected initialization and candidate smoke';console.log('RELEASE PHASE: '+phase);
 wrangler(['d1','migrations','apply',proof.name,'--remote','--config',proofConfig]);
 const migrated=await exportSql(proofConfig,proof.name,join(dir,'migrated.sql')),migratedLocal=local(migrated.bytes);
 try{
  check(validateMigrationState(migratedLocal)===29,'ISOLATED_SCHEMA_NOT_29');compareManifest(migratedLocal,preservation);
  check(!migratedLocal.prepare("SELECT id FROM auth_accounts WHERE username='ryby' COLLATE NOCASE").get()&&!migratedLocal.prepare("SELECT id FROM anglers WHERE id='system-ryby'").get(),'SYSTEM_ACCOUNT_COLLISION');
  const initialized=await initializeProtectedAccount({DB:wrapLocal(migratedLocal),RYBY_SESSION_SECRET:process.env.RYBY_SESSION_SECRET},protectedPassword);check(initialized.initialized,'SYSTEM_INITIALIZATION_FAILED');
  initializationSql=[insertSql(migratedLocal,'anglers','id','system-ryby'),insertSql(migratedLocal,'auth_accounts','id','account-system-ryby'),insertSql(migratedLocal,'auth_account_credentials','account_id','account-system-ryby')].join('\n');
 }finally{migratedLocal.close();}
 const initFile=join(dir,'protected-initialization.sql');await writeFile(initFile,initializationSql,{mode:0o600});wrangler(['d1','execute',proof.name,'--remote','--config',proofConfig,'--file',initFile]);
 const expected=await exportSql(proofConfig,proof.name,join(dir,'expected29.sql'));expectedSnapshot=inspectSql(expected.bytes);
 await privatePut(archive,'expected29.sql',join(dir,'expected29.sql'),expected.sha256);status.isolatedMigration='PASS';
 await query(proof.uuid,"UPDATE app_settings SET value='off' WHERE key='maintenance_mode'");
 const gateKey=randomBytes(32).toString('hex'),canary=name,wrapper=join(dir,'private-canary.js');
 await writeFile(wrapper,`import app from ${JSON.stringify(process.cwd()+'/src/worker.js')};
 export default {async fetch(request,env,ctx){if(!env.RELEASE_GATE_KEY||request.headers.get('x-release-gate')!==env.RELEASE_GATE_KEY)return new Response('Unavailable',{status:503});const path=new URL(request.url).pathname;if(!['GET','HEAD'].includes(request.method)&&!['/api/login','/api/logout'].includes(path)&&!(request.method==='POST'&&path==='/api/catches'&&await request.clone().text()==='{}'))return new Response('Read only',{status:503});const headers=new Headers(request.headers);headers.delete('x-release-gate');return app.fetch(new Request(request,{headers}),env,ctx);},scheduled(){}};`);
 const canarySettings={...base,name:canary,main:wrapper,workers_dev:true,triggers:{crons:[]},assets:{...base.assets,directory:process.cwd()+'/public'},d1_databases:[{binding:'DB',database_name:proof.name,database_id:proof.uuid,migrations_dir:process.cwd()+'/migrations'}],r2_buckets:[{binding:'MEDIA',bucket_name:restoredMedia},{binding:'BACKUP_STATUS',bucket_name:archive}]};delete canarySettings.secrets;
 const canaryConfig=await configFile(dir,canarySettings,'canary.jsonc');assertSandbox(canary);canaryCreated=true;const out=wrangler(['deploy','--config',canaryConfig]),canaryUrl=out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];check(canaryUrl,'CANARY_URL');
 wrangler(['secret','bulk','--config',canaryConfig],JSON.stringify({RELEASE_GATE_KEY:gateKey,RYBY_LOGIN_USERNAME:process.env.RYBY_LOGIN_USERNAME,RYBY_LOGIN_PASSWORD:process.env.RYBY_LOGIN_PASSWORD,RYBY_SESSION_SECRET:process.env.RYBY_SESSION_SECRET}));
 const smokeHeaders={'x-release-gate':gateKey};check((await http(canaryUrl,'/api/bootstrap')).status===503,'PRIVATE_CANARY_NOT_PROTECTED');
 await awaitHttp(canaryUrl,'/login',r=>r.status===200&&r.headers.get('x-dreamteam-build')===candidate,smokeHeaders);await apiSmoke(canaryUrl,smokeHeaders);await protectedSmoke(canaryUrl,smokeHeaders);await uiSmoke(canaryUrl,smokeHeaders);
 expectedSnapshot=null;await assertUnchanged();expectedSnapshot=inspectSql(expected.bytes);status.isolatedCandidateSmoke='PASS';
 phase='receipt-gated explicit schema29 migration and protected initialization';console.log('RELEASE PHASE: '+phase);
 await saveReceipt();await queueGate();await assertBarrier(hosts);await verifySnapshot({uuid:productionId},snapshot);
 const lastDeployment=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(lastDeployment.versions.length===1&&lastDeployment.versions[0].version_id===barrierVersion,'CONCURRENT_PRODUCTION_CHANGE');
 wrangler(['d1','migrations','apply','dream-team-db','--remote','--config','wrangler.jsonc']);
 wrangler(['d1','execute','dream-team-db','--remote','--config','wrangler.jsonc','--file',initFile]);
 await assertUnchanged();status.migration='PASS';status.protectedAccount='INITIALIZED / MUST_CHANGE';
 phase='deploy exact verified candidate';console.log('RELEASE PHASE: '+phase);
 base.main=process.cwd()+'/src/worker.js';base.assets.directory=process.cwd()+'/public';const target=await configFile(dir,base,'candidate.jsonc');
 wrangler(['deploy','--config',target]);barrier=false;
 const deployed=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(deployed.versions.length===1&&deployed.versions[0].percentage===100,'TARGET_TRAFFIC');status.activeVersion=deployed.versions[0].version_id;
 await awaitHttp(production,'/login',r=>r.status===503&&r.headers.get('x-dreamteam-build')===candidate);await assertBarrier(hosts);
 const targetVersion=await cf('/workers/scripts/dream-team/versions/'+encodeURIComponent(status.activeVersion));check(Array.isArray(targetVersion.resources?.bindings),'TARGET_VERSION_BINDINGS_UNAVAILABLE');const targetSettings={bindings:targetVersion.resources.bindings};
 for(const [k,v] of Object.entries(base.vars))check(targetSettings.bindings.some(b=>b.name===k&&(b.type==='json'?b.json:b.text)===v),'TARGET_VARIABLE_MISMATCH');
 for(const [binding,bucket] of [['MEDIA','dream-team-media'],['BACKUP_STATUS','dream-team-d1-backups']])check(targetSettings.bindings.some(b=>b.name===binding&&b.bucket_name===bucket),'TARGET_R2_BINDING');
 check(targetSettings.bindings.some(b=>b.name==='DB'&&b.id===productionId),'TARGET_D1_BINDING');for(const secret of bindings.filter(b=>b.type==='secret_text'))check(targetSettings.bindings.some(b=>b.type==='secret_text'&&b.name===secret.name),'SOURCE_SECRET_REMOVED');
 await assertUnchanged();status.configuration='PASS';status.dataIntegrity='PASS';
 phase='open candidate after isolated smoke, verify production and pre-release session';console.log('RELEASE PHASE: '+phase);
 await restoreMaintenanceSetting();opened=true;
 await awaitHttp(production,'/login',r=>r.status===200&&r.headers.get('x-dreamteam-build')===candidate&&r.headers.get('x-dreamteam-auth-mode')==='individual');
 const continued=await http(production,'/api/bootstrap',{headers:{cookie:continuityCookie}});check(continued.status===200&&(await continued.json()).currentUser?.anglerId==='patryk','PRE_RELEASE_SESSION_REVOKED');
 await logout(production,continuityCookie);await apiSmoke(production);await protectedSmoke(production);await uiSmoke(production);await assertUnchanged({final:true});status.finalSmoke='PASS';status.existingSessionsPreserved='PASS';status.accounts='EXISTING PRESERVED / LOGIN PASS; SYSTEM MUST_CHANGE';
 phase='final media preservation and private manifest';console.log('RELEASE PHASE: '+phase);
 const finalR2=await http(ioUrl,'/verify-source',{headers:ioHeaders,signal:AbortSignal.timeout(120000)}),finalData=await finalR2.json();check(finalR2.status===200&&finalData.ok&&finalData.objects===r2Manifest.entries.length,'PRODUCTION_MEDIA_CHANGED');
 receipt.releasedAt=new Date().toISOString();receipt.activeWorkerVersion=status.activeVersion;receipt.finalSmoke='PASS';receipt.postReleaseDataVerified=true;receipt.existingSessionsPreserved=true;receipt.maintenance=false;
 const completed=await configFile(dir,receipt,'completed.json');await privatePut(archive,'completed-release.json',completed,sha(await readFile(completed)));
 status.manifest='PRIVATE_VERIFIED';status.schema=29;status.migrations=1;status.accountInitializations=1;status.globalSessionPurges=0;status.deployment='SUCCESS';status.maintenance='OFF';maintenance=false;
}catch(error){
 if(maintenance||opened||barrier){try{await setMaintenance('on');status.maintenance='ON';}catch{try{if(barrierConfig){wrangler(['deploy','--config',barrierConfig]);barrier=true;status.maintenance='ON';}}catch{status.maintenance='CHECK REQUIRED';}}}
 status.phase=phase;status.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'RELEASE_OPERATION_FAILED';status.httpStatus=error.status||null;status.code=error.code;status.operation=error.operation;status.maintenanceWorker=barrier;status.deployment='BLOCKED';process.exitCode=1;
}finally{
 // Delete only sessions minted by this release, never any pre-existing session.
 for(const cookie of cookieSessions)try{await query(productionId,'DELETE FROM auth_sessions WHERE id_hash=?',[cookieHash(cookie)]);}catch{status.testSessionCleanup='BLOCKED';}
 if(canaryCreated)try{assertSandbox(name);await cf('/workers/scripts/'+name,'DELETE');}catch{status.privateCanaryCleanup='BLOCKED';}
 if(ioCreated)try{assertSandbox(name+'-io');await cf('/workers/scripts/'+name+'-io','DELETE');}catch{status.privateIoCleanup='BLOCKED';}
 for(const db of dbs)try{assertSandbox(db.name,db.uuid);await cf('/d1/database/'+db.uuid,'DELETE');}catch{status.privateD1Cleanup='BLOCKED';}
 await rm(dir,{recursive:true,force:true});await mkdir('astra-release-status',{recursive:true});await writeFile('astra-release-status/release.json',JSON.stringify(status,null,2));
 console.log('ASTRA RELEASE '+JSON.stringify(status));
}
