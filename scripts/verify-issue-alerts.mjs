// Actual Issue lifecycle test, isolated by run ID/attempt. Never touches incident alerts.
import {mkdir,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {syncAlert,actionsBot} from './infra-monitor-alert.mjs';
import {safeProviderFailure} from './isolated-release-environment.mjs';
export async function verifyIssueAlerts(context,options){
 const report={result:'FAIL',steps:[]};let cleanup=false,issueNumber;
 options={...options,receipt:{},onIssue:number=>{issueNumber=number}};
 try{
  const created=await syncAlert({...context,failed:true},options);cleanup=true;report.steps.push(created);
  if(created!=='CREATED')throw Error('ALERT_TEST_NOT_ISOLATED');
  report.steps.push(await syncAlert({...context,failed:true},options));
  report.steps.push(await syncAlert({...context,failed:false},options));
  if(report.steps.join(',')!=='CREATED,UPDATED,RESOLVED')throw Error('ALERT_LIFECYCLE_FAILED');
  const r=await options.fetcher(`https://api.github.com/repos/${context.repository}/issues/${issueNumber}`,{cache:'no-store',headers:{'cache-control':'no-cache',authorization:'Bearer '+options.token,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Object.assign(Error('ALERT_READBACK_FAILED'),{status:r.status});
  const closed=await r.json();
  if(!closed||closed.number!==issueNumber||closed.state!=='closed'||closed.title!==`[DreamTeam operations] ${context.workflow}`||!closed.body?.includes(context.url))throw Error('ALERT_READBACK_FAILED');
  report.issue=closed.number;report.result='PASS';cleanup=false;
 }catch(e){Object.assign(report,safeProviderFailure(e))}
 finally{if(cleanup)try{report.cleanup=await syncAlert({...context,failed:false},options)}catch(e){report.cleanup=safeProviderFailure(e)}}
 return report;
}
export async function cleanupFailedIssueTests({repository,branch,currentRun,token,fetcher=fetch}){
 const report={result:'FAIL',closed:[]};
 try{
  if(repository!=='serox94/dream-team'||!['main','ops/universal-release-monitor-20261104'].includes(branch))throw Error('INVALID_ALERT_TEST_CONTEXT');
  const api='https://api.github.com/repos/'+repository;
  const request=async(path,method='GET',body)=>{
   const r=await fetcher(api+path,{method,headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Object.assign(Error('ALERT_CLEANUP_FAILED'),{status:r.status});return r.json();
  };
  const candidates=[];
  for(let page=1;page<=10;page++){
   const issues=await request('/issues?state=open&per_page=100&page='+page);
   if(!Array.isArray(issues))throw Error('ALERT_RESPONSE_INVALID');
   for(const issue of issues){
    const match=issue.title?.match(/^\[DreamTeam operations\] Isolated alert verification (\d+)-(\d+)$/);
    if(match&&!issue.pull_request&&actionsBot(issue.user)&&match[1]!==currentRun&&issue.body?.includes(`https://github.com/${repository}/actions/runs/${match[1]}`))candidates.push({issue,runId:match[1]});
   }
   if(issues.length<100)break;if(page===10)throw Error('ALERT_LOOKUP_LIMIT');
  }
  const runs=new Map();
  for(const {issue,runId} of candidates){
   if(!runs.has(runId))runs.set(runId,await request('/actions/runs/'+runId));
   const run=runs.get(runId);
   if(run.path!=='.github/workflows/isolated-release-drill.yml'||run.head_branch!==branch||run.head_repository?.full_name!==repository)continue;
   let failed=run.status==='completed'&&['failure','timed_out','cancelled'].includes(run.conclusion);
   if(!failed&&run.status==='in_progress'){
    const jobs=(await request('/actions/runs/'+runId+'/jobs?per_page=100')).jobs;
    failed=Array.isArray(jobs)&&jobs.some(j=>j.name==='alert-verification'&&j.status==='completed'&&['failure','timed_out','cancelled'].includes(j.conclusion));
   }
   if(!failed)continue;
   await request('/issues/'+issue.number,'PATCH',{state:'closed',state_reason:'not_planned'});
   if((await request('/issues/'+issue.number)).state!=='closed')throw Error('ALERT_CLEANUP_FAILED');
   report.closed.push(issue.number);
  }
  report.result='PASS';
 }catch(e){Object.assign(report,safeProviderFailure(e))}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
 let report;
 if(!/^\d+$/.test(run||'')||!/^\d+$/.test(attempt||'')||process.env.GITHUB_REPOSITORY!=='serox94/dream-team')report={result:'FAIL',error:'INVALID_ALERT_TEST_CONTEXT'};
 else {
  const previous=await cleanupFailedIssueTests({repository:process.env.GITHUB_REPOSITORY,branch:process.env.GITHUB_REF_NAME,currentRun:run,token:process.env.GITHUB_TOKEN});
  report=previous.result==='PASS'?await verifyIssueAlerts({repository:process.env.GITHUB_REPOSITORY,workflow:`Isolated alert verification ${run}-${attempt}`,url:`https://github.com/serox94/dream-team/actions/runs/${run}`},{token:process.env.GITHUB_TOKEN,fetcher:fetch}):{result:'FAIL',error:'ALERT_CLEANUP_FAILED'};
  report.previousTestCleanup=previous;
 }
 await mkdir('isolated-alert-status',{recursive:true});await writeFile('isolated-alert-status/summary.json',JSON.stringify(report,null,2));console.log('DREAMTEAM_ALERT_VERIFICATION '+JSON.stringify(report));console.log(`::${report.result==='PASS'?'notice':'error'} title=Issue alert diagnostic::${JSON.stringify(report)}`);if(report.result!=='PASS')process.exitCode=1;
}
