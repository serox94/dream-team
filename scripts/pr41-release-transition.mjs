// Code-only schema32 release. No migration, maintenance switch or database restore.
import {createHash} from 'node:crypto';
export const PR41_CANDIDATE='5c38a2cc69657fb5ad8c2df3c716a90439688e34';
export const PR41_PREVIOUS='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d';
const check=(v,c)=>{if(!v)throw Error(c)};
export async function releaseCodeOnly(io,{previous,target}) {
 check(previous&&target&&previous!==target,'DISTINCT_PINNED_VERSIONS_REQUIRED');
 const report={result:'BLOCKED',stage:'PREFLIGHT',recovery:'NOT_NEEDED'};
 let attempted=false;
 try {
  await io.preflight();check(await io.current()===previous,'SOURCE_CHANGED');
  report.stage='ACTIVATE';attempted=true;await io.activate(target);
  report.stage='VERIFY';await io.verify(target);
  check(await io.current()===target,'TARGET_CHANGED');
  report.result='PASS';report.stage='COMPLETE';
 }catch(e) {
  report.failure={stage:report.stage,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:'OPERATION_FAILED'};
  if(attempted) {
   report.recovery='BLOCKED';
   try {
    const active=await io.current();check([previous,target].includes(active),'UNKNOWN_ACTIVE_VERSION');
    if(active===target)await io.activate(previous);
    await io.verifyRecovery(previous);
    check(await io.current()===previous,'RECOVERY_VERSION_CHANGED');
    report.recovery='PASS';report.result='ROLLED_BACK';
   }catch(e){report.recoveryFailure=/^[A-Z0-9_]+$/.test(e.message)?e.message:'RECOVERY_FAILED';}
  }
 }
 return report;
}

// A successful rehearsal is insufficient when exact source/static identity or
// owner authorization is absent. Call before any production mutation.
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export function planDigest(plan){const {digest,...contents}=plan;return createHash('sha256').update(JSON.stringify(canonical(contents))).digest('hex');}
// The native rollback target is the original immutable Worker version UUID,
// with its Cloudflare-stored assets. Git history is NOT an asset export.
export function proveImmutableSourceRollback(source,deployableVersions) {
 check(source?.id===PR41_PREVIOUS,'ORIGINAL_VERSION_ID_MISMATCH');
 check(source?.assets?.config&&source?.bindings?.some(b=>b.type==='assets'&&b.name==='ASSETS'),'ORIGINAL_VERSION_ASSETS_MISSING');
 const versions=Array.isArray(deployableVersions)?deployableVersions:deployableVersions?.items;
 check(Array.isArray(versions)&&versions.some(v=>v.id===PR41_PREVIOUS),'ORIGINAL_VERSION_NOT_DEPLOYABLE');
 return {status:'PASS',version:PR41_PREVIOUS,method:'DEPLOY_ORIGINAL_CLOUDFLARE_VERSION_UUID',gitRebuiltStaticEquality:'NOT_CLAIMED'};
}
export function authorizeEvidence(plan,{approved,approvedPlan,protectedReview}) {
 check(approved==='yes','PRODUCTION_APPROVAL_REQUIRED');
 check(protectedReview===true,'PROTECTED_ENVIRONMENT_REVIEW_REQUIRED');
 check(plan.candidate===PR41_CANDIDATE&&plan.previous===PR41_PREVIOUS&&plan.schema===32&&plan.migrations?.length===0,'PINNED_CODE_ONLY_PLAN_REQUIRED');
 check(plan.digest===approvedPlan&&plan.digest===planDigest(plan),'EXACT_PLAN_AUTHORIZATION_REQUIRED');
 check(plan.gates?.sourceAssets==='UNPROVEN','HISTORICAL_ASSET_IDENTITY_MUST_NOT_BE_ASSERTED');
 for(const gate of ['sourceCode','immutableSourceRollback','sourceConfiguration','candidateCode','candidateAssets','candidateConfiguration','restoredD1','restoredR2','sessionContinuity','rollback','failureRecovery'])check(plan.gates?.[gate]==='PASS','UNPROVEN_'+gate.toUpperCase());
 return true;
}
export function productionGate(plan,authorization) {
 authorizeEvidence(plan,authorization);
 const backup=authorization.backup??plan.backup;
 check(backup?.d1==='PASS'&&backup?.r2==='PASS','VERIFIED_BACKUP_REQUIRED');
 const now=authorization.now??Date.now();
 const age=now-Date.parse(backup.verifiedAt);
 check(Number.isFinite(age)&&age>=0&&age<15*60*1000,'FRESH_BACKUP_REQUIRED');
 return true;
}
