// Release guard primitives. No Cloudflare API calls and no automatic deployment.
const fail=code=>{throw Error(code)};
const sha=/^[a-f0-9]{40}$/i,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateReleaseGate(x,now=Date.now()){
 if(!sha.test(x.candidate||'')||!sha.test(x.operator||''))fail('INVALID_COMMIT');
 if(!uuid.test(x.sourceWorker||'')||!uuid.test(x.targetWorker||'')||x.sourceWorker===x.targetWorker)fail('INVALID_WORKER');
 if(x.ownerApproval!==`RELEASE:${x.candidate}:${x.operator}`)fail('APPROVAL_MISMATCH');
 if(x.currentWorker!==x.sourceWorker)fail('SOURCE_CHANGED');
 if(!Number.isSafeInteger(x.schema)||x.schema<1||x.sourceCompatibleSchema!==x.schema||x.targetCompatibleSchema!==x.schema)fail('SCHEMA_INCOMPATIBLE');
 if(x.backupRestore!=='PASS'||x.mediaRestore!=='PASS'||x.canary!=='PASS'||x.rollbackRehearsal!=='PASS')fail('EVIDENCE_MISSING');
 let at=Date.parse(x.backupAt);if(!Number.isFinite(at)||now-at<0||now-at>15*60*1000)fail('BACKUP_NOT_FRESH');
 return true;
}
// Only invoke after caller validates versions, bindings, backup, and explicit approval.
export async function transitionWithRecovery({activate,ready,verify,current,restore,verifyRestore,sourceWorker,targetWorker}){
 const r={status:'BLOCKED',stage:'ACTIVATE',activationAttempts:0,recoveryAttempts:0};
 try{
  r.activationAttempts++;await activate(targetWorker);r.stage='READINESS';await ready(targetWorker);r.stage='VERIFY';await verify(targetWorker);r.status='PASS';r.stage='COMPLETE';
 }catch(e){
  r.error=/^[A-Z0-9_]+$/.test(e?.message||'')?e.message:'RELEASE_FAILURE';
  let active;try{active=await current()}catch{r.recovery='UNKNOWN_ACTIVE';return r}
  if(active===sourceWorker){r.recovery='SOURCE_ACTIVE';return r}
  if(active!==targetWorker){r.recovery='UNEXPECTED_ACTIVE';return r}
  r.stage='RECOVERY';r.recoveryAttempts++;
  try{await restore(sourceWorker);r.stage='RECOVERY_VERIFY';await verifyRestore(sourceWorker);r.recovery='PASS'}
  catch(err){r.recovery='FAILED';r.recoveryError=/^[A-Z0-9_]+$/.test(err?.message||'')?err.message:'RECOVERY_FAILURE'}
 }
 return r;
}
