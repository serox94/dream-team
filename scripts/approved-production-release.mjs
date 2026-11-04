// Manual authorization entry point. Intentionally cannot deploy the current app.
import {appendFile} from 'node:fs/promises';
import {protectedEnvironment} from './production-authorization.mjs';import {digest} from './release-config-policy.mjs';import {requireProductionWriteFence} from './d1-write-fence.mjs';import {productionId} from './recovery-common.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
try{
 const text=process.env.RELEASE_PLAN_JSON||'';check(text.length<1000000,'PLAN_SIZE_LIMIT');const plan=JSON.parse(text),planDigest=process.env.RELEASE_PLAN_SHA256;
 check(digest(plan)===planDigest,'PLAN_DIGEST_MISMATCH');
 for(const key of ['candidate','operator','sourceBuild','fallbackBuild'])check(/^[a-f0-9]{40}$/.test(plan[key]||''),'PLAN_SHA_REQUIRED');
 for(const key of ['sourceVersion','targetVersion','fallbackVersion'])check(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(plan[key]||''),'PLAN_VERSION_REQUIRED');
 check(plan.databaseId===productionId&&Number.isInteger(plan.sourceSchema)&&Number.isInteger(plan.targetSchema)&&[0,1].includes(plan.targetSchema-plan.sourceSchema),'PLAN_SCHEMA_REQUIRED');
 check(plan.sourceSchema===plan.targetSchema?plan.migrationDigest==='none':/^[a-f0-9]{64}$/.test(plan.migrationDigest||''),'PLAN_MIGRATION_REQUIRED');
 check(plan.configuration?.source&&plan.configurationDifferences&&['target','fallback'].every(r=>/^[a-f0-9]{64}$/.test(plan.artifactDigests?.[r]||'')),'PLAN_ARTIFACT_CONFIGURATION_REQUIRED');
 check(process.env.OPERATOR_CONFIRMATION==='PRODUCTION:'+planDigest,'OPERATOR_CONFIRMATION_REQUIRED');
 const github=async path=>{const r=await fetch('https://api.github.com/repos/serox94/dream-team'+path,{headers:{authorization:'Bearer '+process.env.GITHUB_TOKEN,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});check(r.ok,'GITHUB_AUTHORIZATION_UNAVAILABLE');return r.json()};
 await protectedEnvironment({github,operator:plan.operator,runId:process.env.GITHUB_RUN_ID,plan,planDigest,requireApproval:process.argv[2]!=='preflight'});
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'## Exact production plan awaiting owner approval\n\n'+[['Plan SHA256',planDigest],['Candidate SHA',plan.candidate],['Operator SHA',plan.operator],['Source version',plan.sourceVersion],['Target version',plan.targetVersion],['Fallback version',plan.fallbackVersion],['D1 schema',plan.sourceSchema+' → '+plan.targetSchema],['Migration SHA256',plan.migrationDigest],['Target artifact SHA256',plan.artifactDigests.target],['Fallback artifact SHA256',plan.artifactDigests.fallback],['Configuration and exceptions SHA256',digest({configuration:plan.configuration,differences:plan.configurationDifferences})]].map(([k,v])=>'- '+k+': `'+v+'`').join('\n')+'\n\nProduction remains blocked until all writers are fenced.\n');
 console.log('::notice title=Approved plan::'+JSON.stringify({planDigest,candidate:plan.candidate,operator:plan.operator,sourceVersion:plan.sourceVersion,targetVersion:plan.targetVersion,fallbackVersion:plan.fallbackVersion,sourceSchema:plan.sourceSchema,targetSchema:plan.targetSchema,migrationDigest:plan.migrationDigest}));
 if(process.argv[2]!=='preflight')requireProductionWriteFence();
}catch(e){console.log('::error title=Production gate::'+(/^[A-Z_]+$/.test(e.message)?e.message:'INVALID_RELEASE_PLAN'));process.exitCode=1}
