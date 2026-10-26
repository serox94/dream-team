// Exactly one full activation. A migrated DB may recover ONLY to schema32.
export async function transitionSchema32({preflight,maintenanceOn,migrate,verifyMigration,activate,maintenanceOff,ready,verify,recover31,recover32,verifyRecovery,onState=()=>{}}){
 const report={result:'BLOCKED',fullActivationAttempts:0};let barrier=false,migrated=false;
 try{await preflight();barrier=true;await maintenanceOn();onState('MAINTENANCE_ON');await migrate();migrated=true;report.schema=32;await verifyMigration();report.fullActivationAttempts=1;await activate();await maintenanceOff();barrier=false;report.readiness=await ready();report.verification=await verify();report.result='PASS';report.maintenance='OFF';}
 catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:'SCHEMA32_RELEASE_FAILED';if(e.report)report.readiness=e.report;
  if(barrier||migrated||report.fullActivationAttempts)try{const actual=await (migrated?recover32():recover31());report.schema=actual.schema;report.recovery=actual.variant;await maintenanceOff();barrier=false;await verifyRecovery(actual);report.maintenance='OFF';}catch{report.recovery='BLOCKED';report.maintenance=barrier?'ON':'UNKNOWN';report.operatorActionRequired=true;}
 }
 return report;
}
