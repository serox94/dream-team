// Cloudflare control-plane adapter for disposable CI Workers only.
// Production activation is deliberately unsupported until full release safety is verified.
import {cf} from './recovery-common.mjs';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const assert=(ok,code)=>{if(!ok)throw Error(code)};
export function isolatedCloudflareAdapter({worker,runId,baseUrl,request=cf,fetcher=fetch,wait=sleep}){
 assert(/^[0-9]+$/.test(runId||'')&&worker===`dream-team-audit-${runId}-recovery-probe`,'NON_ISOLATED_WORKER');
 const base=new URL(baseUrl);
 assert(base.protocol==='https:'&&base.hostname.startsWith(worker+'.')&&base.hostname.endsWith('.workers.dev')&&!base.username&&!base.password&&base.pathname==='/','NON_ISOLATED_URL');
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
   try{const r=await fetcher(new URL('/?probe='+i,base),{redirect:'manual',signal:AbortSignal.timeout(5000)});last={http:r.status,build:r.headers.get('x-build')};await r.body?.cancel();if(r.status===200&&last.build===expectedBuild){if(++consecutive===2)return {result:'PASS',version:id,...last}}else consecutive=0}catch(e){consecutive=0;last={network:e.name}}
   if(i<15)await wait(1500);
  }
  const e=Error('READINESS_DEADLINE');e.safe=last;throw e;
 };
 return {active,version,activate,ready};
}

// Complete release capability, deliberately restricted to disposable resources.
// It never accepts production/preview names or a caller-supplied boolean proof.
export async function cloudflareReleaseAdapter({worker,runId,baseUrl,database,restored,rehearsal,
 candidateVersion,fallbackVersion,sourceBuild,fallbackBuild,migration,
 request=cf,fetcher=fetch,wait=sleep,execute,media,sandboxLease}){
 const {assertSandbox,query}=await import('./recovery-common.mjs');
 const {captureSnapshot,restoreSnapshot,verifySnapshot,rowsDigest}=await import('./d1-snapshot.mjs');
 const control=isolatedCloudflareAdapter({worker,runId,baseUrl,request,fetcher,wait});
 for(const db of [database,restored]){
  assertSandbox(db.name,db.uuid);
  assert(uuid.test(db.uuid)&&db.name===`dream-team-audit-${runId}-${db===database||sandboxLease?'db':'restored'}`,'NON_ISOLATED_DATABASE');
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
  assert(items.some(b=>b.type==='plain_text'&&b.name==='APP_SCHEMA'&&b.text===String(schema)),'VERSION_SCHEMA_MISMATCH');
  // A media-bearing release must use the existing, verified R2 recovery gateway.
  const buckets=items.filter(b=>b.type==='r2_bucket');
  if(buckets.length){assert(media&&buckets.length===1&&buckets[0].name==='MEDIA'&&buckets[0].bucket_name===(db.uuid===restored.uuid?media.restored:media.source),'UNVERIFIED_MEDIA_BINDING');}
  assert(!items.some(b=>!['d1','plain_text','r2_bucket'].includes(b.type)),'UNSUPPORTED_RELEASE_BINDING');
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
   assert(plan.targetVersion===candidateVersion,'CANDIDATE_VERSION_MISMATCH');approved={...plan};
   const before=await current();sourceVersion=before.activeVersion;
   await bindings(before.activeVersion,database,sourceBuild,plan.sourceSchema);
   await bindings(candidateVersion,database,plan.candidate,plan.targetSchema);
   await bindings(fallbackVersion,database,fallbackBuild,plan.targetSchema);
   return {...before,fallbackVersion,fallbackSchema:plan.targetSchema};
  },
  async quiesce(){
   await setBarrier(true);
   const r=await fetcher(new URL('/api/bootstrap',baseUrl),{redirect:'manual',signal:AbortSignal.timeout(10000)});
   await r.body?.cancel();assert(r.status===503,'HTTP_WRITE_BARRIER_NOT_VERIFIED');
   return {blocked:true};
  },
  async unquiesce(){await setBarrier(false)},
  async backupAndRestore(){
   assert((await state()).maintenance,'WRITE_BARRIER_REQUIRED');
   baseline=await captureSnapshot(database,sql);
   if(sandboxLease)await sandboxLease.restore(baseline);else await restoreSnapshot(restored,baseline,sql);
   let mediaRestored=true;
   if(media){
    assert(media.url===`https://dream-team-audit-${runId}-io.${new URL(baseUrl).hostname.split('.').slice(1).join('.')}`,'NON_ISOLATED_MEDIA_GATEWAY');
    assert(media.restored===`dream-team-audit-${runId}-restored`&&media.archive===`dream-team-audit-${runId}-archive`,'NON_ISOLATED_MEDIA');
    const gateway=await request(`/workers/scripts/dream-team-audit-${runId}-io/settings`);
    const buckets=gateway.bindings?.filter(b=>b.type==='r2_bucket')||[];
    assert(buckets.length===3&&[['SOURCE',media.source],['ARCHIVE',media.archive],['RESTORED',media.restored]].every(([name,bucket])=>buckets.some(b=>b.name===name&&b.bucket_name===bucket)),'MEDIA_GATEWAY_BINDINGS');
    const {privateRestore}=await import('./recovery-transport.mjs');
    assert(media.source===`dream-team-audit-${runId}-media`,'NON_ISOLATED_MEDIA');
    const r=await fetcher(media.url+'/backup',{method:'POST',headers:{'x-recovery-key':media.key},signal:AbortSignal.timeout(120000)});
    const b=await r.json();assert(r.ok&&b.ok===true&&/^[a-f0-9]{64}$/.test(b.manifestSha256),'MEDIA_CHECKPOINT_FAILED');
    const restoredMedia=await privateRestore(media.url,media.key,{fetcher});mediaRestored=restoredMedia.data.verified===true;
   }
   checkpoint={databaseRestored:true,mediaRestored,integrity:true,fresh:true,createdAt:Date.now(),digest:rowsDigest(baseline.schema)};
   return checkpoint;
  },
  async testIsolated(_before,plan,receipt){
   assert(receipt===checkpoint&&Date.now()-checkpoint.createdAt<900000,'CHECKPOINT_EXPIRED');
   assert(rehearsal&&rehearsal.worker!==worker,'ISOLATED_REHEARSAL_REQUIRED');
   const probe=isolatedCloudflareAdapter({...rehearsal,runId:rehearsal.runId,request,fetcher,wait});
   await bindings(rehearsal.candidateVersion,restored,plan.candidate,plan.targetSchema,probe);
   await bindings(rehearsal.fallbackVersion,restored,fallbackBuild,plan.targetSchema,probe);
   try{
   await migrate(restored,plan);
   await probe.activate(rehearsal.candidateVersion);
   await health(probe,rehearsal.candidateVersion,plan.candidate,restored,plan.targetSchema);
   await probe.activate(rehearsal.fallbackVersion);
   await health(probe,rehearsal.fallbackVersion,fallbackBuild,restored,plan.targetSchema);
   }finally{if(sandboxLease)await sandboxLease.restore(baseline)}
   return {candidate:true,fallback:true,recovery:true,migration:true};
  },
  async migrate(plan){
   assert(approved&&plan.candidate===approved.candidate&&(await state()).maintenance,'WRITE_BARRIER_REQUIRED');
   await verifySnapshot(database,baseline,sql);
   assert(Date.now()-checkpoint.createdAt<900000,'CHECKPOINT_EXPIRED');
   await migrate(database,plan);
   migratedSnapshot=await captureSnapshot(database,sql);
  },
  async activate(id){
   if(id===candidateVersion){
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
