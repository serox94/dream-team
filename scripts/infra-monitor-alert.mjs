// Durable repository alerts. Never includes API response bodies or credentials.
import {pathToFileURL} from 'node:url';
export function alertDetails({repository,workflow,url,failed}){
 if(repository!=='serox94/dream-team'||!/^https:\/\/github\.com\/serox94\/dream-team\/actions\/runs\/\d+$/.test(url||''))throw Error('INVALID_ALERT_CONTEXT');
 if(typeof workflow!=='string'||!workflow.length||workflow.length>150||/[\r\n]/.test(workflow))throw Error('INVALID_ALERT_WORKFLOW');
 return {title:`[DreamTeam operations] ${workflow}`,body:`${failed?'Operation failed; investigation required.':'Operation recovered.'}\n\nWorkflow run: ${url}\n\nThis alert contains no application data. Check the run summary for diagnostic codes.`};
}
export const actionsBot=user=>user?.type==='Bot'&&['github-actions','github-actions[bot]'].includes(user.login);
export async function syncAlert(context,{token,fetcher=fetch,onIssue,receipt}={}){
 const details=alertDetails(context),api='https://api.github.com/repos/'+context.repository;
 if(!token)throw Error('ALERT_TOKEN_MISSING');
 const request=async(path,method='GET',body)=>{
  const r=await fetcher(api+path,{method,cache:'no-store',headers:{'cache-control':'no-cache',authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!r.ok){const e=Error('ALERT_DELIVERY_FAILED');e.status=r.status;throw e}return r.status===204?null:r.json();
 };
 let found;
 const remember=number=>{if(!Number.isSafeInteger(number)||number<1)throw Error('ALERT_RESPONSE_INVALID');if(receipt)receipt.number=number;onIssue?.(number)};
 if(receipt?.number){
  found=await request('/issues/'+receipt.number);
  if(found?.number!==receipt.number||found.pull_request||!actionsBot(found.user)||found.title!==details.title)throw Error('ALERT_RECEIPT_MISMATCH');
 }
 for(let page=1;!found&&page<=10;page++){
  const issues=await request(`/issues?state=open&per_page=100&page=${page}`);
  if(!Array.isArray(issues))throw Error('ALERT_RESPONSE_INVALID');
  found=issues.find(i=>!i.pull_request&&actionsBot(i.user)&&i.title===details.title);if(found||issues.length<100)break;
  if(page===10)throw Error('ALERT_LOOKUP_LIMIT');
 }
 if(found){remember(found.number);await request('/issues/'+found.number,'PATCH',{body:details.body,...(!context.failed?{state:'closed',state_reason:'completed'}:found.state==='closed'?{state:'open'}:{})});return context.failed?'UPDATED':'RESOLVED'}
 if(context.failed){const created=await request('/issues','POST',details);if(!Number.isSafeInteger(created?.number))throw Error('ALERT_RESPONSE_INVALID');remember(created.number);return 'CREATED'}
 return 'NO_OPEN_ALERT';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await syncAlert({repository:process.env.GITHUB_REPOSITORY,workflow:process.env.ALERT_WORKFLOW,url:process.env.ALERT_RUN_URL,failed:process.env.ALERT_FAILED==='true'},{token:process.env.GITHUB_TOKEN});console.log('DREAMTEAM_ALERT '+result)}
 catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'ALERT_ERROR');process.exitCode=1}
}
