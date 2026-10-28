// Read-only Cloudflare D1 inventory diagnostic; NEVER creates/deletes DBs,
// runs SQL, reads credentials from Cloudflare, or changes production resources.
import {classifyCloudflareOperation,redactedReleaseFailure} from './code32-diagnostic-details.mjs';
const report={result:'BLOCKED',mode:'READ_ONLY',cloudflareOperation:'D1_LIST',productionWrites:0,databasesCreated:0,databasesDeleted:0};
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token){report.error='CLOUDFLARE_CREDENTIALS_UNAVAILABLE';process.exitCode=1;}
else try{
 const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/d1/database?per_page=100';
 const response=await fetch(url,{method:'GET',headers:{authorization:'Bearer '+token,accept:'application/json'},signal:AbortSignal.timeout(20000)});
 let body;try{body=await response.json();}catch{body=null;}
 if(!response.ok||body?.success!==true){
  const error=Error('CLOUDFLARE_ACCESS');
  error.status=response.status;
  error.code=body?.errors?.[0]?.code;
  error.safeOperation=classifyCloudflareOperation('/d1/database','GET');
  report.failure=redactedReleaseFailure(error,'D1_READONLY_INVENTORY');
  process.exitCode=1;
 }else{
  const list=Array.isArray(body.result)?body.result:[];
  const count=Number.isInteger(body.result_info?.total_count)?body.result_info.total_count:list.length;
  report.result='PASS';
  report.databasesVisible=count;
  report.disposableAuditDatabasesVisible=list.filter(db=>/^dream-team-audit-\d+32-db$/.test(db.name||'')).length;
  report.paginationComplete=count<=list.length;
  report.freePlanDatabaseLimit=10;
  report.freePlanLimitWouldBeReached=count>=10;
  report.accountPlan='NOT_VERIFIED';
  report.d1WritePermission='NOT_VERIFIED_BY_READ_ONLY_CALL';
  // Names, UUIDs, account identifiers and API responses are never logged.
 }
}catch(error){
 report.failure=redactedReleaseFailure(error,'D1_READONLY_INVENTORY');
 process.exitCode=1;
}
console.log('CODE32_D1_READONLY_DIAGNOSTIC '+JSON.stringify(report));
