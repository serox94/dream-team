// Code-only schema32 cutover: never migrates or rolls the database back.
export async function promoteCode32({preflight,activate,ready,verify,recover,verifyRecovery}){
 const report={result:'BLOCKED',schema:32,fullActivationAttempts:0,maintenance:'OFF'};
 try{await preflight();report.fullActivationAttempts=1;await activate();report.readiness=await ready();report.verification=await verify();report.result='PASS';}
 catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'CODE32_RELEASE_FAILED';if(e.report)report.readiness=e.report;if(report.fullActivationAttempts)try{const r=await recover();await verifyRecovery(r);report.recovery='PREVIOUS_FULL_SCHEMA32';}catch{report.recovery='BLOCKED';report.operatorActionRequired=true;}}
 return report;
}
