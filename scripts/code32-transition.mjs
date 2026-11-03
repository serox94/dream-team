// Code-only schema32 cutover: never migrates or rolls the database back.
import {releaseErrorSummary} from './code32-release-safety.mjs';
export async function promoteCode32({preflight,activate,ready,verify,recover,verifyRecovery}){
 const report={result:'BLOCKED',schema:32,fullActivationAttempts:0,maintenance:'OFF'};
 let phase='PROMOTE_PREFLIGHT';
 try{
  await preflight();phase='PROMOTE_ACTIVATE';report.fullActivationAttempts=1;await activate();
  phase='PROMOTE_READY';report.readiness=await ready();phase='PROMOTE_VERIFY';report.verification=await verify();report.result='PASS';
 }catch(e){
  report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'CODE32_RELEASE_FAILED';
  report.failure=releaseErrorSummary(e,phase,'WORKER_RELEASE');if(e.report)report.readiness=e.report;
  if(report.fullActivationAttempts){
   let previous;
   try{previous=await recover();}
   catch(error){report.recovery='BLOCKED';report.operatorActionRequired=true;report.recoveryFailure=releaseErrorSummary(error,'PROMOTE_RECOVER','WORKER_ROLLBACK');return report;}
   try{await verifyRecovery(previous);report.recovery='PREVIOUS_FULL_SCHEMA32';}
   catch(error){report.recovery='BLOCKED';report.operatorActionRequired=true;report.recoveryFailure=releaseErrorSummary(error,'RECOVERY_VERIFY','WORKER_READINESS');}
  }
 }
 return report;
}
