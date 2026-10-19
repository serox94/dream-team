// Manual read-only production identity/queue inspection. Never deploys or mutates D1/R2.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {cf,query,productionId} from './recovery-common.mjs';
const result={result:'BLOCKED',at:new Date().toISOString(),productionWrites:0,maintenanceChanged:false};
try{
 assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(process.env.RELEASE_ACTION,'inspect');
 const deployments=await cf('/workers/scripts/dream-team/deployments'),active=deployments.deployments?.[0];assert.equal(active?.versions?.length,1);assert.equal(active.versions[0].percentage,100);
 const version=await cf('/workers/scripts/dream-team/versions/'+active.versions[0].version_id),bindings=version.resources?.bindings;assert.ok(Array.isArray(bindings));
 const variables=Object.fromEntries(bindings.filter(b=>['plain_text','json'].includes(b.type)).map(b=>[b.name,b.type==='json'?b.json:b.text]));
 result.sourceCommit=variables.APP_BUILD;result.sourceVersion=active.versions[0].version_id;assert.equal(variables.INDIVIDUAL_ACCOUNTS,'true');assert.equal(variables.APP_ENV,'production');
 assert.ok(bindings.some(b=>b.name==='DB'&&b.id===productionId));for(const [name,bucket] of [['MEDIA','dream-team-media'],['BACKUP_STATUS','dream-team-d1-backups']])assert.ok(bindings.some(b=>b.name===name&&b.bucket_name===bucket));
 result.requiredSecretBindings=Object.fromEntries(['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET','TAVILY_API_KEY'].map(name=>[name,bindings.some(b=>b.name===name&&b.type==='secret_text')]));assert.ok(Object.values(result.requiredSecretBindings).every(Boolean));
 result.operatorCredentialsReady=['RYBY_LOGIN_USERNAME','RYBY_LOGIN_PASSWORD','RYBY_SESSION_SECRET'].every(key=>Boolean(process.env[key]));assert.equal(result.operatorCredentialsReady,true);
 const state=(await query(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).results;result.schema=Number(state.find(r=>r.key==='schema_version')?.value);result.maintenance=state.find(r=>r.key==='maintenance_mode')?.value==='on'?'ON':'OFF';assert.equal(result.schema,28);assert.equal(result.maintenance,'OFF');
 const migrations=(await query(productionId,'SELECT COUNT(*) n FROM d1_migrations')).results[0];assert.equal(migrations.n,28);
 const worker=(await cf('/workers/scripts')).find(w=>w.id==='dream-team');assert.ok(worker?.tag);const builds=await cf('/builds/workers/'+encodeURIComponent(worker.tag)+'/builds?per_page=100');const list=Array.isArray(builds)?builds:builds.builds;assert.ok(Array.isArray(list));result.pendingCloudflareBuilds=list.filter(b=>['queued','pending','initializing','running','building'].includes(b.status)).length;assert.equal(result.pendingCloudflareBuilds,0);
 const response=await fetch('https://api.github.com/repos/serox94/dream-team/actions/runs?per_page=100',{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'}});assert.equal(response.status,200);const runs=(await response.json()).workflow_runs;result.otherManualReleases=runs.filter(r=>String(r.id)!==process.env.GITHUB_RUN_ID&&r.path==='.github/workflows/deploy-private.yml'&&r.status!=='completed').length;assert.equal(result.otherManualReleases,0);
 const publicResponse=await fetch('https://dream-team.sewerynski00.workers.dev/login',{cache:'no-store',redirect:'manual'});assert.equal(publicResponse.status,200);assert.equal(publicResponse.headers.get('x-dreamteam-build'),result.sourceCommit);
 result.result='PASS';
}catch(error){result.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'INSPECTION_GATE_FAILED';result.httpStatus=error.status||null;result.code=error.code||null;process.exitCode=1;}
await mkdir('astra-release-status',{recursive:true});await writeFile('astra-release-status/inspection.json',JSON.stringify(result,null,2));console.log('ASTRA INSPECTION '+JSON.stringify(result));
