// Resume the pinned isolated preview only. No deployment rebuild, D1 writes,
// credential/session operations, maintenance changes or production mutations.
import {mkdir,writeFile} from 'node:fs/promises';
import {cf,query} from './recovery-common.mjs';
import {fetchReadiness,versionIdentity,waitForVersionReady} from './schema32-readiness.mjs';
const name='dream-team-research-preview',source='dream-team-preview',version='7fbc50d1-7041-4dc1-ac5d-d106f68e41b1',failed='38bcd078-89c2-4f23-aef5-89c60951cbe5',build='a1c58a91d741da1975baa9003d927e8915e19445',base='https://dream-team-research-preview.sewerynski00.workers.dev',db='190b6a54-919c-4628-98b0-27ab3902bdbd';
const report={result:'BLOCKED',productionWrites:0,productionD1Queries:0,previewD1Writes:0,credentialChanges:0,sessionChanges:0,providerCalls:0},check=(ok,c)=>{if(!ok)throw Error(c);};
const deployment=async n=>(await cf('/workers/scripts/'+n+'/deployments')).deployments[0];
const single=d=>{check(d.versions?.length===1&&d.versions[0].percentage===100,'TRAFFIC_SPLIT');return d.versions[0].version_id;};
try{
 await mkdir('rc-status',{recursive:true});
 const productionBefore=single(await deployment('dream-team')),sourceBefore=single(await deployment(source));
 report.before={active:single(await deployment(name)),routing:await cf('/workers/scripts/'+name+'/subdomain'),sourceRouting:await cf('/workers/scripts/'+source+'/subdomain'),probe:await fetchReadiness(base,{variant:'full'})};
 check([version,failed].includes(report.before.active),'UNEXPECTED_PREVIEW_VERSION');
 const target=await cf('/workers/scripts/'+name+'/versions/'+version),id=versionIdentity(target);check(id.build===build&&id.variant==='full','PINNED_FULL_IDENTITY_MISMATCH');
 report.target={...id,runtime:target.resources.runtime};
 const url=target.resources.bindings.find(b=>b.name==='RESEARCH_VERSION_URL')?.text;check(url==='https://research-a1c58a91d741-dream-team-preview.sewerynski00.workers.dev','PINNED_PRIVATE_TARGET_MISMATCH');
 const schema=(await query(db,"SELECT value FROM app_settings WHERE key='schema_version'")).results;check(schema[0]?.value==='32','EXISTING_PREVIEW_SCHEMA32_REQUIRED');report.previewSchema=32;
 if(report.before.active!==version){await cf('/workers/scripts/'+name+'/deployments','POST',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':'Resume pinned full schema32 isolated preview'}});report.versionRestored=true;}
 // Deployment UUID and route registration are distinct control-plane resources.
 // Re-register ONLY the already-public preview; retain its preview-URL setting.
 const routing=await cf('/workers/scripts/'+name+'/subdomain');
 if(!routing.enabled||report.before.probe.status===404){await cf('/workers/scripts/'+name+'/subdomain','POST',{enabled:true,...(typeof routing.previews_enabled==='boolean'?{previews_enabled:routing.previews_enabled}:{})});report.publicRouteReconciled=true;}
 report.afterRouting=await cf('/workers/scripts/'+name+'/subdomain');check(report.afterRouting.enabled===true,'PREVIEW_ROUTE_DISABLED');
 report.readiness=await waitForVersionReady({expected:{id:version,build,variant:'full'},previousVersionId:failed,readControlPlane:async()=>({versions:(await deployment(name)).versions,identity:versionIdentity(await cf('/workers/scripts/'+name+'/versions/'+version))}),probe:signal=>fetchReadiness(base,{variant:'full',signal})});
 check(single(await deployment('dream-team'))===productionBefore&&single(await deployment(source))===sourceBefore,'PROTECTED_ACTIVE_VERSION_CHANGED');
 report.result='PASS';report.productionUnchanged=true;
 await writeFile('rc-status/preview.json',JSON.stringify({result:'PASS',build,previewUrl:base,worker:version,privateVersionUrl:url,database:{id:db,name:'dream-team-audit-2026102331-db'},schema:32,backgroundSchedule:'*/5 * * * *',retainedFromRun:40325115575},null,2));
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'PREVIEW_RECONCILIATION_FAILED';report.status=e.status;report.code=e.code;if(e.report)report.readiness=e.report;process.exitCode=1;}
finally{await mkdir('schema32-status',{recursive:true});await writeFile('schema32-status/preview-recovery.json',JSON.stringify(report,null,2));console.log('PREVIEW_RECOVERY '+JSON.stringify(report));}
