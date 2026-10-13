// Read-only deployment gate. No SQL mutations, Worker deploys, backups or provider calls.
import {writeFile,mkdir} from 'node:fs/promises';
import {cf,query,productionId} from './recovery-common.mjs';
const candidate='b20be0508b8f2aafdd16f31118ab4dbbae2492a0';
const result={candidate,run:Number(process.env.GITHUB_RUN_ID),result:'BLOCKED',productionWrites:0,workerDeployments:0,maintenanceStarted:false};
let phase='production configuration';
try {
 const [settings,deployments,scripts,state]=await Promise.all([
  cf('/workers/scripts/dream-team/settings'),cf('/workers/scripts/dream-team/deployments'),
  cf('/workers/scripts'),query(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")
 ]);
 if(!settings.bindings.some(b=>b.type==='d1'&&b.name==='DB'&&b.id===productionId))throw Error('D1_BINDING_MISMATCH');
 result.activeVersions=deployments.deployments[0].versions.map(v=>({id:v.version_id,percentage:v.percentage}));
 result.schema=Number(state.results.find(x=>x.key==='schema_version')?.value);
 result.maintenance=state.results.find(x=>x.key==='maintenance_mode')?.value||'off';
 result.requiredSecretsPresent=['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'].every(name=>settings.bindings.some(b=>b.name===name&&b.type==='secret_text'));
 result.operatorCredentialsPresent=Boolean(process.env.RYBY_LOGIN_PASSWORD)&&typeof process.env.RYBY_SESSION_SECRET==='string'&&process.env.RYBY_SESSION_SECRET.length>=32;
 if(!result.requiredSecretsPresent||!result.operatorCredentialsPresent)throw Error('REQUIRED_CREDENTIALS_MISSING');
 const worker=scripts.find(s=>s.id==='dream-team');if(!worker?.tag)throw Error('WORKER_TAG_MISSING');
 phase='current Cloudflare build/deployment queue';
 const builds=await cf('/builds/workers/'+encodeURIComponent(worker.tag)+'/builds?per_page=100');
 const list=Array.isArray(builds)?builds:builds.builds;
 if(!Array.isArray(list))throw Error('BUILD_QUEUE_RESPONSE_UNRECOGNIZED');
 result.pendingBuilds=list.filter(b=>['queued','initializing','running'].includes(b.status)).length;
 if(result.pendingBuilds)throw Error('OTHER_PRODUCTION_BUILD_ACTIVE');
 result.buildQueue='PASS';
 phase='current Cloudflare build triggers';
 const triggers=await cf('/builds/workers/'+encodeURIComponent(worker.tag)+'/triggers');
 const listT=Array.isArray(triggers)?triggers:triggers.triggers;
 if(!Array.isArray(listT))throw Error('BUILD_TRIGGER_RESPONSE_UNRECOGNIZED');
 result.triggerCount=listT.length;
 result.triggerStates=listT.map(t=>({is_builds_disabled:t.is_builds_disabled,builds_enabled:t.builds_enabled}));
 result.result='PASS';
} catch(error) {
 result.phase=phase;result.httpStatus=error.status||null;result.code=error.code;
 result.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'READONLY_GATE_FAILED';
 process.exitCode=1;
}
await mkdir('preflight-safe-status',{recursive:true});
await writeFile('preflight-safe-status/status.json',JSON.stringify(result,null,2));
console.log('PRODUCTION CURRENT GATE '+JSON.stringify(result));
