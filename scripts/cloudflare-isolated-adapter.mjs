// Cloudflare control-plane adapter for disposable CI Workers only.
// The isolated entry point never accepts production; the production factory is opt-in and library-only.
import {protectedEnvironment} from './production-authorization.mjs';
import {verifyWorkerArtifact} from './worker-artifact-provenance.mjs';
import {configuration,verifyConfiguration,digest} from './release-config-policy.mjs';
import {requireProductionWriteFence} from './d1-write-fence.mjs';
import {requireIdleWorker} from './cloudflare-builds.mjs';
import {cf} from './recovery-common.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(ok,code)=>{if(!ok)throw Error(code)};
export function isolatedCloudflareAdapter({worker,runId,baseUrl,request=cf,fetcher=fetch,wait=sleep}){
 assert(/^[0-9]+$/.test(runId||'')&&worker===`dream-team-audit-${runId}-recovery-probe`,'NON_ISOLATED_WORKER');
 const base=new URL(baseUrl);
 assert(base.protocol==='https:'&&base.hostname.startsWith(worker+'.')&&base.hostname.endsWith('.workers.dev')&&!base.username&&!base.password&&base.pathname==='/','NON_ISOLATED_URL');
 return workerControl({worker,baseUrl,request,fetcher,wait});
}

function workerControl({worker,baseUrl,request,fetcher,wait,path='/',buildHeader='x-build',expectedStatus=()=>200}){
 const base=new URL(baseUrl);
 const prefix='/workers/scripts/'+worker;
 const active=async()=>{
  const d=(await request(prefix+'/deployments')).deployments[0];
  assert(d?.versions?.length===1&&d.versions[0].percentage===100&&uuid.test(d.versions[0].version_id),'UNSAFE_TRAFFIC_SPLIT');
  return d.versions[0].version_id;
 };
 const version=async id=>{assert(uuid.test(id||''),'INVALID_VERSION');const v=await request(prefix+'/versions/'+id);assert(v.id===id,'VERSION_ID_MISMATCH');return v};
 const activate=async id=>{
  await version(id);
  return request(prefix+'/deployments','POST',{strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Disposable isolated release adapter test'}});
 };
 const ready=async(id,expectedBuild)=>{
  assert(/^[a-z0-9-]{1,64}$/i.test(expectedBuild||''),'INVALID_BUILD');
  let last={},consecutive=0;
  for(let i=0;i<16;i++){
   const observed=await active();assert(observed===id,'CONTROL_PLANE_MISMATCH');
   try{const r=await fetcher(new URL(path+'?probe='+i,base),{redirect:'manual',credentials:'omit',cache:'no-store',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(5000)});last={http:r.status,build:r.headers.get(buildHeader)};await r.body?.cancel();if(r.status===await expectedStatus()&&last.build===expectedBuild){if(++consecutive===2)return {result:'PASS',version:id,...last}}else consecutive=0}catch(e){consecutive=0;last={network:e.name}}
   if(i<15)await wait(1500);
  }
  const e=Error('READINESS_DEADLINE');e.safe=last;throw e;
 };
 return {active,version,activate,ready};
}

// Isolated entry point: caller options cannot enable the production capability.
export async function cloudflareReleaseAdapter(options){return scopedReleaseAdapter({...options,productionScope:undefined})}

async function scopedReleaseAdapter({worker,runId,baseUrl,database,restored,rehearsal,
 candidateVersion,fallbackVersion,sourceBuild,fallbackBuild,migration,
 request=cf,fetcher=fetch,wait=sleep,execute,media,sandboxLease,productionScope}){
 database=Object.freeze({...database});restored=Object.freeze({...restored});
 const {assertSandbox,query}=await import('./recovery-common.mjs');
 const {captureSnapshot,restoreSnapshot,verifySnapshot,rowsDigest,identifier}=await import('./d1-snapshot.mjs');
 const control=productionScope?.control||isolatedCloudflareAdapter({worker,runId,baseUrl,request,fetcher,wait});
 for(const db of [database,restored]){
  if(productionScope&&db===database){assert(db.name==='dream-team-db'&&db.uuid===productionScope.databaseId,'PRODUCTION_DATABASE_MISMATCH')}else assertSandbox(db.name,db.uuid);
  if(!(productionScope&&db===database))assert(uuid.test(db.uuid)&&db.name===`dream-team-audit-${runId}-${db===database||sandboxLease||productionScope?'db':'restored'}`,'NON_ISOLATED_DATABASE');
  const actual=await request('/d1/database/'+db.uuid);
  assert(actual.uuid===db.uuid&&actual.name===db.name,'DATABASE_IDENTITY_MISMATCH');
 }
 if(database.uuid===restored.uuid){assert(sandboxLease?.database.uuid===database.uuid,'RESTORE_SOURCE_COLLISION');await sandboxLease.assertOwned()}else assert(!sandboxLease,'INVALID_SANDBOX_LEASE');
 const sql=execute||query;
 const read=async(db,statement,params=[])=>(await sql(db.uuid,statement,params)).results;
 const state=async(db=database)=>{
  const values=Object.fromEntries((await read(db,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).map(r=>[r.key,r.value]));
  assert(/^\d+$/.test(values.schema_version||'')&&['on','off'].includes(values.maintenance_mode),'INVALID_RELEASE_STATE');
  return {schema:Number(values.schema_version),maintenance:values.maintenance_mode==='on'};
 };
 const current=async()=>({...await state(),activeVersion:await control.active()});
 const bindings=async(id,db,build,schema,controller=control)=>{
  const version=await controller.version(id),items=version.resources?.bindings;
  assert(Array.isArray(items),'VERSION_BINDINGS_UNAVAILABLE');
  assert(items.filter(b=>b.type==='d1').length===1&&items.some(b=>b.type==='d1'&&b.name==='DB'&&b.id===db.uuid),'VERSION_DATABASE_MISMATCH');
  assert(items.some(b=>b.type==='plain_text'&&b.name==='APP_BUILD'&&b.text===build),'VERSION_BUILD_MISMATCH');
  assert(items.some(b=>b.type==='plain_text'&&b.name==='APP_SCHEMA'&&b.text===String(schema))||productionScope?.allowLegacySource(id,schema,items),'VERSION_SCHEMA_MISMATCH');
  // A media-bearing release must use the existing, verified R2 recovery gateway.
  const buckets=items.filter(b=>b.type==='r2_bucket');
  if(productionScope)await productionScope.checkBindings(items,db,build,version);
  else if(buckets.length){assert(media&&buckets.length===1&&buckets[0].name==='MEDIA'&&buckets[0].bucket_name===(db.uuid===restored.uuid?media.restored:media.source),'UNVERIFIED_MEDIA_BINDING');}
  assert(!items.some(b=>!(productionScope?['d1','plain_text','r2_bucket','secret_text','ai','assets']:['d1','plain_text','r2_bucket']).includes(b.type)),'UNSUPPORTED_RELEASE_BINDING');
  return version;
 };
 let approved,checkpoint,baseline,migratedSnapshot,sourceVersion;
 const setBarrier=async on=>{
  await sql(database.uuid,"INSERT OR REPLACE INTO app_settings(key,value) VALUES('maintenance_mode',?)",[on?'on':'off']);
  assert((await state()).maintenance===on,'WRITE_BARRIER_NOT_VERIFIED');
 };
 const health=async(controller,id,build,db,schema)=>{
  await controller.ready(id,build);
  const s=await state(db);assert(s.schema===schema&&s.maintenance,'RELEASE_STATE_MISMATCH');
 };
 const preserveRows=async(db)=>{
  for(const table of baseline.tables){
   const expected=table.rows.filter(row=>table.name!=='app_settings'||!['schema_version','maintenance_mode'].includes(row.key));
   const actual=await read(db,'SELECT '+table.columns.map(identifier).join(',')+' FROM '+identifier(table.name));
   const counts=new Map();for(const row of actual){const key=rowsDigest([row]);counts.set(key,(counts.get(key)||0)+1)}
   for(const row of expected){const key=rowsDigest([row]);assert((counts.get(key)||0)>0,'MIGRATION_CHANGED_EXISTING_ROWS');counts.set(key,counts.get(key)-1)}
  }
  assert((await read(db,'PRAGMA foreign_key_check')).length===0,'MIGRATION_FOREIGN_KEYS');
 };
 const migrate=async(db,plan)=>{
  if(plan.targetSchema===plan.sourceSchema)return;
  assert(migration&&typeof migration.sql==='string'&&/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(migration.name||'')&&migration.name.startsWith(String(plan.targetSchema).padStart(4,'0')+'_'),'MIGRATION_REQUIRED');
  // Never split migration SQL or retry an ambiguous provider response.
  // Recovery verifies the actual schema and the original snapshot before reusing source code.
  await sql(db.uuid,migration.sql+"\nINSERT INTO d1_migrations(name) VALUES ('"+migration.name+"');");
  assert((await state(db)).schema===plan.targetSchema,'MIGRATION_NOT_VERIFIED');
 };
 return {
  current,
  async preflight(plan){
   if(productionScope)await productionScope.preflight(plan);
   assert(plan.targetVersion===candidateVersion,'CANDIDATE_VERSION_MISMATCH');approved={...plan};
   const before=await current();
   if(productionScope)assert(before.activeVersion===productionScope.sourceVersion,'SOURCE_STATE_CHANGED');
   sourceVersion=before.activeVersion;
   await bindings(before.activeVersion,database,sourceBuild,plan.sourceSchema);
   await bindings(candidateVersion,database,plan.candidate,plan.targetSchema);
   await bindings(fallbackVersion,database,fallbackBuild,plan.targetSchema);
   if(productionScope){assert(before.schema===plan.sourceSchema&&!before.maintenance,'SOURCE_STATE_CHANGED');productionScope.finishPreflight()}
   return {...before,fallbackVersion,fallbackSchema:plan.targetSchema};
  },
  async quiesce(){
   productionScope?.authorizeMutation();
   await setBarrier(true);
   const r=await fetcher(new URL('/api/bootstrap',baseUrl),{redirect:'manual',signal:AbortSignal.timeout(10000)});
   await r.body?.cancel();assert(r.status===503,'HTTP_WRITE_BARRIER_NOT_VERIFIED');
   return {blocked:true};
  },
  async unquiesce(){
   productionScope?.authorizeMutation();await setBarrier(false);
   if(productionScope)try{
    const id=await control.active();assert([sourceVersion,candidateVersion,fallbackVersion].includes(id),'UNAPPROVED_PRODUCTION_VERSION');
    await control.ready(id,id===candidateVersion?approved.candidate:id===fallbackVersion?fallbackBuild:sourceBuild);
    await productionScope.verifyOpen();
   }catch(e){await setBarrier(true);throw e}
  },
  async backupAndRestore(){
   assert((await state()).maintenance,'WRITE_BARRIER_REQUIRED');
   productionScope?.authorizeMutation();
   baseline=await captureSnapshot(database,sql,{productionRead:!!productionScope});
   let durable;
   if(productionScope){await verifySnapshot(database,baseline,sql);durable=await productionScope.persistCheckpoint(baseline)}
   if(sandboxLease)await sandboxLease.restore(baseline);else await restoreSnapshot(restored,baseline,sql);
   let mediaRestored=true;
   if(media){
    assert(media.url===`https://dream-team-audit-${runId}-io.${new URL(baseUrl).hostname.split('.').slice(1).join('.')}`,'NON_ISOLATED_MEDIA_GATEWAY');
    assert(media.restored===`dream-team-audit-${runId}-restored`&&media.archive===`dream-team-audit-${runId}-archive`,'NON_ISOLATED_MEDIA');
    const gateway=await request(`/workers/scripts/dream-team-audit-${runId}-io/settings`);
    const buckets=gateway.bindings?.filter(b=>b.type==='r2_bucket')||[];
    assert(buckets.length===3&&[['SOURCE',media.source],['ARCHIVE',media.archive],['RESTORED',media.restored]].every(([name,bucket])=>buckets.some(b=>b.name===name&&b.bucket_name===bucket)),'MEDIA_GATEWAY_BINDINGS');
    const {privateRestore}=await import('./recovery-transport.mjs');
    assert(media.source===(productionScope?'dream-team-media':`dream-team-audit-${runId}-media`),'NON_ISOLATED_MEDIA');
    const r=await fetcher(media.url+'/backup',{method:'POST',headers:{'x-recovery-key':media.key},signal:AbortSignal.timeout(120000)});
    const b=await r.json();assert(r.ok&&b.ok===true&&/^[a-f0-9]{64}$/.test(b.manifestSha256),'MEDIA_CHECKPOINT_FAILED');
    const restoredMedia=await privateRestore(media.url,media.key,{fetcher});mediaRestored=restoredMedia.data.verified===true;
   }
   checkpoint={databaseRestored:true,mediaRestored,integrity:true,fresh:true,...(durable?{durable}:{}),createdAt:Date.now(),digest:rowsDigest(baseline.schema)};
   return checkpoint;
  },
  async testIsolated(_before,plan,receipt){
   assert(receipt===checkpoint&&Date.now()-checkpoint.createdAt<900000,'CHECKPOINT_EXPIRED');
   assert(rehearsal&&rehearsal.worker!==worker,'ISOLATED_REHEARSAL_REQUIRED');
   const probe=productionScope?.rehearsalControl||isolatedCloudflareAdapter({...rehearsal,runId:rehearsal.runId,request,fetcher,wait});
   await bindings(rehearsal.candidateVersion,restored,plan.candidate,plan.targetSchema,probe);
   await bindings(rehearsal.fallbackVersion,restored,fallbackBuild,plan.targetSchema,probe);
   try{
   await migrate(restored,plan);
   await preserveRows(restored);
   await probe.activate(rehearsal.candidateVersion);
   await health(probe,rehearsal.candidateVersion,plan.candidate,restored,plan.targetSchema);
   if(productionScope)await productionScope.probeOpen(probe,rehearsal.candidateVersion,plan.candidate);
   await probe.activate(rehearsal.fallbackVersion);
   await health(probe,rehearsal.fallbackVersion,fallbackBuild,restored,plan.targetSchema);
   if(productionScope)await productionScope.probeOpen(probe,rehearsal.fallbackVersion,fallbackBuild);
   }finally{if(sandboxLease)await sandboxLease.restore(baseline)}
   return {candidate:true,fallback:true,recovery:true,migration:true};
  },
  async migrate(plan){
   productionScope?.authorizeMutation();
   assert(approved&&plan.candidate===approved.candidate&&(await state()).maintenance,'WRITE_BARRIER_REQUIRED');
   await verifySnapshot(database,baseline,sql);
   assert(Date.now()-checkpoint.createdAt<900000,'CHECKPOINT_EXPIRED');
   await migrate(database,plan);
   await preserveRows(database);
   migratedSnapshot=await captureSnapshot(database,sql,{productionRead:!!productionScope});
  },
  async activate(id){
   productionScope?.authorizeMutation();
   if(productionScope)assert(approved&&[sourceVersion,candidateVersion,fallbackVersion].includes(id),'UNAPPROVED_PRODUCTION_VERSION');
   if(id===candidateVersion){
    if(productionScope)await productionScope.beforeActivation();
    assert(checkpoint&&Date.now()-checkpoint.createdAt<900000,'CHECKPOINT_EXPIRED');
    const s=await current();
    assert(s.activeVersion===sourceVersion&&s.maintenance&&s.schema===approved.targetSchema,'SOURCE_STATE_CHANGED');
    await verifySnapshot(database,migratedSnapshot||baseline,sql);
   }
   return control.activate(id);
  },
  ready:control.ready,
  async verify(plan){await health(control,plan.targetVersion,plan.candidate,database,plan.targetSchema)},
  async verifyRecovery(id,schema){
   if(schema===approved.sourceSchema&&approved.targetSchema!==approved.sourceSchema)await verifySnapshot(database,baseline,sql);
   await health(control,id,id===fallbackVersion?fallbackBuild:sourceBuild,database,schema);
  }
 };
}

// Production capability: all mutations require independent protected approval and proofs.
// A future operator must prepare one owned recovery DB and isolated versions first.
export async function productionCloudflareAdapter(options={}){
 const {productionId,sha,wrangler}=await import('./recovery-common.mjs');
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises');
 const {join}=await import('node:path');const {tmpdir}=await import('node:os');
 const {plan,sourceVersion,sourceBuild,fallbackVersion,fallbackBuild,recovery,media,
  expectedAccountId,productionApproval,enabled=false,evidenceRunId,currentRunId,
  request=cf,fetcher=fetch,wait=sleep,githubRequest,execute,checkpointWriter}=options;
 const frozen=Object.freeze(structuredClone(plan||{})),migration=options.migration&&Object.freeze({...options.migration});
 const migrationDigest=frozen.sourceSchema===frozen.targetSchema?'none':sha(Buffer.from(migration?.sql||''));
 const authorize=()=>{
  assert(enabled===true&&/^[a-f0-9]{32}$/.test(expectedAccountId||'')&&process.env.CLOUDFLARE_ACCOUNT_ID===expectedAccountId,'PRODUCTION_CAPABILITY_DISABLED');
  assert(/^[a-f0-9]{40}$/.test(frozen.candidate||'')&&/^[a-f0-9]{40}$/.test(frozen.operator||'')&&uuid.test(frozen.targetVersion||'')&&uuid.test(sourceVersion||'')&&/^[a-f0-9]{40}$/.test(sourceBuild||'')&&/^[a-f0-9]{40}$/.test(fallbackBuild||'')&&uuid.test(fallbackVersion||'')&&fallbackVersion!==frozen.targetVersion,'INVALID_PRODUCTION_PLAN');
  assert(frozen.approval===`RELEASE:${frozen.candidate}:${frozen.operator}`&&digest(frozen)===options.planDigest&&productionApproval===`PRODUCTION:${options.planDigest}`,'PRODUCTION_APPROVAL_MISMATCH');
  assert(frozen.sourceVersion===sourceVersion&&frozen.fallbackVersion===fallbackVersion&&frozen.sourceBuild===sourceBuild&&frozen.fallbackBuild===fallbackBuild&&frozen.databaseId===productionId&&frozen.migrationDigest===migrationDigest,'UNBOUND_PRODUCTION_PLAN');
 };
 authorize(); // No provider calls, allocations or writes before this gate.
 assert(recovery?.lease&&recovery.lease.database.uuid!==productionId&&/^\d+$/.test(recovery.runId||'')&&/^\d+$/.test(evidenceRunId||'')&&/^\d+$/.test(currentRunId||''),'PRODUCTION_RECOVERY_REQUIRED');
 await recovery.lease.assertOwned();
 const runId=recovery.runId,restored=Object.freeze({...recovery.lease.database});
 assert(restored.name===`dream-team-audit-${runId}-db`,'NON_ISOLATED_DATABASE');
 assert(media?.source==='dream-team-media'&&media.restored===`dream-team-audit-${runId}-restored`&&media.archive===`dream-team-audit-${runId}-archive`,'PRODUCTION_MEDIA_RECOVERY_REQUIRED');
 const sql=execute|| (async(id,statement,params=[])=>(await request('/d1/database/'+id+'/query','POST',{sql:statement,params}))[0]);
 const status=async db=>{
  const rows=(await sql(db.uuid,"SELECT value FROM app_settings WHERE key='maintenance_mode'")).results;
  assert(rows.length===1&&['on','off'].includes(rows[0].value),'INVALID_RELEASE_STATE');return rows[0].value==='on'?503:200;
 };
 const database={uuid:productionId,name:'dream-team-db'},worker='dream-team',baseUrl='https://dream-team.sewerynski00.workers.dev';
 const control=workerControl({worker,baseUrl,request,fetcher,wait,path:'/login',buildHeader:'x-dreamteam-build',expectedStatus:()=>status(database)});
 const probeScope=isolatedCloudflareAdapter({...recovery,runId:recovery.workerRunId,request,fetcher,wait});
 const rehearsalControl={...probeScope,ready:workerControl({worker:recovery.worker,baseUrl:recovery.baseUrl,request,fetcher,wait,path:'/login',buildHeader:'x-dreamteam-build',expectedStatus:()=>status(restored)}).ready};
 const gh=githubRequest|| (async path=>{
  const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;assert(token,'GITHUB_EVIDENCE_AUTH_REQUIRED');
  const r=await fetcher('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok){const e=Error('GITHUB_EVIDENCE_UNAVAILABLE');e.status=r.status;throw e}return r.json();
 });
 const operations=async()=>{
  const workers=await request('/workers/scripts'),live=workers.find(w=>w.id===worker);assert(live?.tag,'WORKER_IDENTITY_UNAVAILABLE');
  await requireIdleWorker(live.tag,request);
  const raw=await request('/builds/workers/'+live.tag+'/triggers'),triggers=Array.isArray(raw)?raw:raw.triggers;
  assert(Array.isArray(triggers)&&triggers.every(t=>t.deploy_command==='npx wrangler versions upload'),'UNCONTROLLED_BUILD_TRIGGER');
  const hooks=await request('/builds/workers/'+worker+'/deploy_hooks');assert((Array.isArray(hooks)?hooks:hooks.deploy_hooks)?.length===0,'DEPLOY_HOOK_PRESENT');
  for(const status of ['queued','in_progress']){
   const runs=(await gh('/actions/runs?status='+status+'&per_page=100')).workflow_runs;
   assert(Array.isArray(runs)&&runs.length<100,'PRODUCTION_QUEUE_UNAVAILABLE');
   assert(!runs.some(r=>String(r.id)!==currentRunId&&/\/(?:.*release|.*production.*|.*promot.*|deploy-private)\.yml$/.test(r.path||'')),'OTHER_PRODUCTION_OPERATION');
  }
 };
 let verifiedLegacySchema,preflightPassed=false;
 const scope={databaseId:productionId,sourceVersion,control,rehearsalControl,authorize,
  finishPreflight(){requireProductionWriteFence();preflightPassed=true},
  authorizeMutation(){authorize();assert(preflightPassed,'PRODUCTION_PREFLIGHT_REQUIRED')},
  allowLegacySource(id,schema,items){return id===sourceVersion&&verifiedLegacySchema===schema&&!items.some(b=>b.name==='APP_SCHEMA')},
  async checkBindings(items,db,build,version){
   const rehearsal=db.uuid===restored.uuid;
   const buckets=items.filter(b=>b.type==='r2_bucket');
   assert(buckets.length===2&&buckets.some(b=>b.name==='MEDIA'&&b.bucket_name===(rehearsal?media.restored:'dream-team-media'))&&buckets.some(b=>b.name==='BACKUP_STATUS'&&b.bucket_name===(rehearsal?media.archive:'dream-team-d1-backups')),'PRODUCTION_R2_BINDINGS');
   const vars=Object.fromEntries(items.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text]));
   assert(vars.APP_ENV===(rehearsal?'preview':'production')&&vars.INDIVIDUAL_ACCOUNTS==='true','PRODUCTION_RUNTIME_CONFIGURATION');
   const role=rehearsal?(version.id===recovery.candidateVersion?'rehearsalTarget':'rehearsalFallback'):version.id===sourceVersion?'source':version.id===frozen.targetVersion?'target':'fallback';
   const approved=frozen.configuration?.source;
   assert(approved,'APPROVED_CONFIGURATION_REQUIRED');
   verifyConfiguration(configuration(version),approved,frozen.configurationDifferences?.[role]||[]);
   if(role==='target'||role==='fallback'){
    const evidence=options.artifacts?.[role];assert(evidence,'ARTIFACT_PROVENANCE_REQUIRED');
    const proof=await verifyWorkerArtifact({receiptPath:evidence.receiptPath,artifactDirectory:evidence.artifactDirectory,worker,versionId:version.id,sourceSha:role==='target'?frozen.candidate:fallbackBuild,operator:frozen.operator,version});
    assert(proof.artifactSha256===frozen.artifactDigests?.[role],'APPROVED_ARTIFACT_DIGEST_MISMATCH');
   }
  },
  async preflight(actual){
   preflightPassed=false;authorize();
   await protectedEnvironment({github:gh,runId:currentRunId,operator:frozen.operator,plan:frozen,planDigest:options.planDigest,context:options.authorizationContext||process.env});
   assert(digest(actual)===options.planDigest,'PRODUCTION_PLAN_CHANGED');
   for(const key of ['candidate','operator','approval','sourceSchema','targetSchema','targetVersion'])assert(actual[key]===frozen[key],'PRODUCTION_PLAN_CHANGED');
   assert(await control.active()===sourceVersion,'SOURCE_STATE_CHANGED');
   const main=await gh('/git/ref/heads/main'),operatorRun=await gh('/actions/runs/'+currentRunId);
   assert(main.object?.sha===frozen.operator&&operatorRun.head_sha===frozen.operator&&operatorRun.head_branch==='main'&&operatorRun.event==='workflow_dispatch'&&operatorRun.head_repository?.full_name==='serox94/dream-team','OPERATOR_CONTEXT_MISMATCH');
   const sourceFile=await gh('/contents/src/ensure-schema.js?ref='+sourceBuild);
   assert(sourceFile.encoding==='base64'&&typeof sourceFile.content==='string'&&sourceFile.content.length<100000,'SOURCE_SCHEMA_EVIDENCE_UNAVAILABLE');
   const sourceCode=Buffer.from(sourceFile.content,'base64').toString('utf8');
   const required=sourceCode.match(/export const requiredSchema=(\d+);/),registry=sourceCode.match(/const migrations=(\[[^;]+\]);/);
   assert(required&&Number(required[1])===frozen.sourceSchema&&registry,'SOURCE_SCHEMA_EVIDENCE_MISMATCH');
   const expectedMigrations=JSON.parse(registry[1]);
   assert(Array.isArray(expectedMigrations)&&expectedMigrations.every(n=>/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(n)),'SOURCE_SCHEMA_EVIDENCE_MISMATCH');
   const actualMigrations=(await sql(database.uuid,'SELECT name FROM d1_migrations')).results.map(r=>r.name);
   assert(JSON.stringify([...actualMigrations].sort())===JSON.stringify([...expectedMigrations].sort()),'SOURCE_MIGRATION_REGISTRY_MISMATCH');
   verifiedLegacySchema=Number(required[1]);
   if(frozen.targetSchema!==frozen.sourceSchema){
    assert(frozen.targetSchema===frozen.sourceSchema+1&&/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(migration?.name||''),'MIGRATION_REQUIRED');
    const file=await gh('/contents/migrations/'+migration.name+'?ref='+frozen.candidate);
    assert(file.encoding==='base64'&&typeof file.content==='string'&&file.content.length<2000000&&sha(Buffer.from(file.content,'base64'))===migrationDigest,'MIGRATION_CANDIDATE_MISMATCH');
   }
   await control.ready(sourceVersion,sourceBuild);
   const run=await gh('/actions/runs/'+evidenceRunId);
   assert(run.conclusion==='success'&&run.status==='completed'&&run.head_sha===frozen.operator&&run.path==='.github/workflows/isolated-release-drill.yml'&&run.head_repository?.full_name==='serox94/dream-team','RELEASE_EVIDENCE_MISMATCH');
   const checks=(await gh('/actions/runs?head_sha='+frozen.candidate+'&per_page=100')).workflow_runs;
   assert(checks?.some(r=>r.path==='.github/workflows/validate.yml'&&r.status==='completed'&&r.conclusion==='success'&&r.head_sha===frozen.candidate),'CANDIDATE_VALIDATION_REQUIRED');
   await operations();
  },
  async beforeActivation(){authorize();await operations()},
  async persistCheckpoint(snapshot){
   authorize();assert(snapshot.tables.reduce((n,t)=>n+t.rows.length,0)<=15000,'RESTORE_SIZE_BUDGET');
   const bytes=Buffer.from(JSON.stringify(snapshot));assert(bytes.length<=32*1024*1024,'CHECKPOINT_SIZE_BUDGET');
   const key=`private-releases/universal/${currentRunId}/${frozen.candidate}/checkpoint.json`,digest=sha(bytes);
   if(checkpointWriter){
    const receipt=await checkpointWriter({bytes,key,digest});
    assert(receipt?.sha256===digest&&receipt.storage==='PRIVATE_R2'&&receipt.key===key,'CHECKPOINT_ROUNDTRIP_MISMATCH');return receipt;
   }
   const managed=await request('/r2/buckets/dream-team-d1-backups/domains/managed'),custom=await request('/r2/buckets/dream-team-d1-backups/domains/custom');
   assert(managed.enabled===false&&Array.isArray(custom.domains)&&custom.domains.length===0,'CHECKPOINT_BUCKET_NOT_PRIVATE');
   const dir=await mkdtemp(join(tmpdir(),'dreamteam-checkpoint-'));
   try{
    const file=join(dir,'snapshot.json'),roundtrip=join(dir,'roundtrip.json');await writeFile(file,bytes,{mode:0o600});
    wrangler(['r2','object','put','dream-team-d1-backups/'+key,'--remote','--file',file]);
    wrangler(['r2','object','get','dream-team-d1-backups/'+key,'--remote','--file',roundtrip]);
    assert(sha(await readFile(roundtrip))===digest,'CHECKPOINT_ROUNDTRIP_MISMATCH');return {sha256:digest,storage:'PRIVATE_R2',key};
   }finally{await rm(dir,{recursive:true,force:true})}
  },
  async verifyOpen(){
   const r=await fetcher(new URL('/api/bootstrap',baseUrl),{redirect:'manual',signal:AbortSignal.timeout(10000)});await r.body?.cancel();assert(r.status===401,'PRODUCTION_AUTH_NOT_ENFORCED');
  },
  async probeOpen(probe,id,build){
   authorize();await sql(restored.uuid,"UPDATE app_settings SET value='off' WHERE key='maintenance_mode'");
   try{
    await probe.ready(id,build);
    const r=await fetcher(new URL('/api/bootstrap',recovery.baseUrl),{redirect:'manual',signal:AbortSignal.timeout(10000)});await r.body?.cancel();assert(r.status===401,'ISOLATED_AUTH_NOT_ENFORCED');
   }finally{await sql(restored.uuid,"UPDATE app_settings SET value='on' WHERE key='maintenance_mode'")}
  }
 };
 await protectedEnvironment({github:gh,runId:currentRunId,operator:frozen.operator,plan:frozen,planDigest:options.planDigest,context:options.authorizationContext||process.env});
 const adapter=await scopedReleaseAdapter({worker,runId,baseUrl,database,restored,
  candidateVersion:frozen.targetVersion,fallbackVersion,sourceBuild,fallbackBuild,migration,
  rehearsal:{...recovery,runId:recovery.workerRunId},request,fetcher,wait,execute:sql,media,productionScope:scope});
 return adapter;
}
