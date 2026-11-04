// Durable repository alerts. Never includes API response bodies or credentials.
import {pathToFileURL} from 'node:url';
export function alertDetails({repository,workflow,url,failed}){
 if(repository!=='serox94/dream-team'||!/^https:\/\/github\.com\/serox94\/dream-team\/actions\/runs\/\d+$/.test(url||''))throw Error('INVALID_ALERT_CONTEXT');
 if(typeof workflow!=='string'||!workflow.length||workflow.length>150||/[\r\n]/.test(workflow))throw Error('INVALID_ALERT_WORKFLOW');
 return {title:`[DreamTeam operations] ${workflow}`,body:`${failed?'Operation failed; investigation required.':'Operation recovered.'}\n\nWorkflow run: ${url}\n\nThis alert contains no application data. Check the run summary for diagnostic codes.`};
}
export async function syncAlert(context,{token,fetcher=fetch}={}){
 const details=alertDetails(context),api='https://api.github.com/repos/'+context.repository;
 if(!token)throw Error('ALERT_TOKEN_MISSING');
 const request=async(path,method='GET',body)=>{
  const r=await fetcher(api+path,{method,headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('ALERT_DELIVERY_FAILED');return r.status===204?null:r.json();
 };
 let found;
 for(let page=1;page<=10;page++){
  const issues=await request(`/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`);
  if(!Array.isArray(issues))throw Error('ALERT_RESPONSE_INVALID');
  found=issues.find(i=>!i.pull_request&&i.title===details.title);if(found||issues.length<100)break;
  if(page===10)throw Error('ALERT_LOOKUP_LIMIT');
 }
 if(found){await request('/issues/'+found.number,'PATCH',{body:details.body,...(!context.failed?{state:'closed',state_reason:'completed'}:{})});return context.failed?'UPDATED':'RESOLVED'}
 if(context.failed){await request('/issues','POST',details);return 'CREATED'}
 return 'NO_OPEN_ALERT';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await syncAlert({repository:process.env.GITHUB_REPOSITORY,workflow:process.env.ALERT_WORKFLOW,url:process.env.ALERT_RUN_URL,failed:process.env.ALERT_FAILED==='true'},{token:process.env.GITHUB_TOKEN});console.log('DREAMTEAM_ALERT '+result)}
 catch(e){console.error(/^[A-Z_]+$/.test(e.message)?e.message:'ALERT_ERROR');process.exitCode=1}
}
