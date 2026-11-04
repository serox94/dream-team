// Zero D1 allocations. Only this run's newly created disposable Worker is mutable.
import {mkdir,writeFile,readFile,copyFile,rename} from 'node:fs/promises';import {resolve} from 'node:path';
import {cf,wrangler} from './recovery-common.mjs';import {safeProviderFailure} from './isolated-release-environment.mjs';import {uploadWorkerArtifact} from './upload-worker-artifact.mjs';import {verifyWorkerArtifact} from './worker-artifact-provenance.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};const directory='isolated-artifact-status',statePath=directory+'/ownership.json',runId=process.env.GITHUB_RUN_ID,sha=process.env.GITHUB_SHA,worker=`dream-team-audit-${runId}-artifact-probe`;
check(process.env.GITHUB_REPOSITORY==='serox94/dream-team'&&/^\d+$/.test(runId||'')&&/^[a-f0-9]{40}$/.test(sha||''),'CONTEXT');
await mkdir(directory,{recursive:true});const mode=process.argv[2];let stage=mode;
try{
 if(mode==='prepare'){
  check(!(await cf('/workers/scripts')).some(w=>w.id===worker),'WORKER_EXISTS');
  // Persist intent before upload; cleanup never adopts a previously existing Worker.
  await writeFile(statePath+'.tmp',JSON.stringify({runId,attempt:process.env.GITHUB_RUN_ATTEMPT,worker}),{mode:0o600});await rename(statePath+'.tmp',statePath);
  const artifact=resolve(directory+'/artifact');await mkdir(artifact);await copyFile('scripts/artifact-probe-worker.mjs',artifact+'/worker.mjs');
  const config=resolve(directory+'/wrangler.json');await writeFile(config,JSON.stringify({name:worker,main:artifact+'/worker.mjs',compatibility_date:'2026-09-03',workers_dev:false,vars:{APP_BUILD:sha}}));
  stage='BOOTSTRAP';wrangler(['deploy','--no-bundle','--config',config]);
  for(const role of ['target','fallback']){stage='UPLOAD_'+role;await uploadWorkerArtifact({directory:artifact,configPath:config,sourceSha:sha,operator:sha,runId,receiptPath:directory+'/'+role+'.json'})}
 }else if(mode==='verify'){
  for(const role of ['target','fallback']){
   stage='VERIFY_'+role;const receipt=JSON.parse(await readFile(directory+'/'+role+'.json','utf8')),version=await cf('/workers/scripts/'+worker+'/versions/'+receipt.versionId);
   await verifyWorkerArtifact({receiptPath:directory+'/'+role+'.json',artifactDirectory:directory+'/artifact',worker,versionId:receipt.versionId,sourceSha:sha,operator:sha,version,signerWorkflow:'serox94/dream-team/.github/workflows/isolated-release-drill.yml'});
  }
  const receipt=JSON.parse(await readFile(directory+'/fallback.json','utf8'));let rejected=false;
  try{await verifyWorkerArtifact({receiptPath:directory+'/target.json',artifactDirectory:directory+'/artifact',worker,versionId:receipt.versionId,sourceSha:sha,operator:sha,version:await cf('/workers/scripts/'+worker+'/versions/'+receipt.versionId),signerWorkflow:'serox94/dream-team/.github/workflows/isolated-release-drill.yml'})}catch(e){check(e.message==='ARTIFACT_PROVENANCE_MISMATCH','UNEXPECTED_PROVENANCE_REJECTION');rejected=true}
  check(rejected,'WRONG_VERSION_ACCEPTED');console.log('::notice title=Artifact provenance::'+JSON.stringify({result:'PASS',target:true,fallback:true,wrongVersionRejected:true,d1Allocated:0}));
 }else if(mode==='cleanup'){
  let state;try{state=JSON.parse(await readFile(statePath,'utf8'))}catch(e){if(e.code==='ENOENT')process.exit(0);throw e}
  check(state.runId===runId&&state.attempt===process.env.GITHUB_RUN_ATTEMPT&&state.worker===worker,'OWNERSHIP_MISMATCH');
  if((await cf('/workers/scripts')).some(w=>w.id===worker))await cf('/workers/scripts/'+worker,'DELETE');
  check(!(await cf('/workers/scripts')).some(w=>w.id===worker),'CLEANUP_NOT_VERIFIED');console.log('::notice title=Artifact cleanup::PASS');
 }else throw Error('INVALID_MODE');
}catch(e){console.log('::error title=Artifact probe::'+JSON.stringify({stage,error:/^[A-Z_]+$/.test(e.message)?e.message:'PROBE_FAILED',...safeProviderFailure(e)}));process.exitCode=1}
