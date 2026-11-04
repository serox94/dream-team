// Actual Issue lifecycle test, isolated by run ID/attempt. Never touches incident alerts.
import {mkdir,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
import {syncAlert} from './infra-monitor-alert.mjs';
import {safeProviderFailure} from './isolated-release-environment.mjs';
export async function verifyIssueAlerts(context,options){
 const report={result:'FAIL',steps:[]};let cleanup=false;
 try{
  const created=await syncAlert({...context,failed:true},options);cleanup=true;report.steps.push(created);
  if(created!=='CREATED')throw Error('ALERT_TEST_NOT_ISOLATED');
  report.steps.push(await syncAlert({...context,failed:true},options));
  report.steps.push(await syncAlert({...context,failed:false},options));
  if(report.steps.join(',')!=='CREATED,UPDATED,RESOLVED')throw Error('ALERT_LIFECYCLE_FAILED');
  const r=await options.fetcher(`https://api.github.com/repos/${context.repository}/issues?state=closed&creator=github-actions%5Bbot%5D&per_page=100`,{headers:{authorization:'Bearer '+options.token,accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Object.assign(Error('ALERT_READBACK_FAILED'),{status:r.status});
  const closed=(await r.json()).find(i=>!i.pull_request&&i.title===`[DreamTeam operations] ${context.workflow}`&&i.state==='closed');
  if(!closed||!closed.body?.includes(context.url))throw Error('ALERT_READBACK_FAILED');
  report.issue=closed.number;report.result='PASS';cleanup=false;
 }catch(e){Object.assign(report,safeProviderFailure(e))}
 finally{if(cleanup)try{report.cleanup=await syncAlert({...context,failed:false},options)}catch(e){report.cleanup=safeProviderFailure(e)}}
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
 let report;
 if(!/^\d+$/.test(run||'')||!/^\d+$/.test(attempt||'')||process.env.GITHUB_REPOSITORY!=='serox94/dream-team')report={result:'FAIL',error:'INVALID_ALERT_TEST_CONTEXT'};
 else report=await verifyIssueAlerts({repository:process.env.GITHUB_REPOSITORY,workflow:`Isolated alert verification ${run}-${attempt}`,url:`https://github.com/serox94/dream-team/actions/runs/${run}`},{token:process.env.GITHUB_TOKEN,fetcher:fetch});
 await mkdir('isolated-alert-status',{recursive:true});await writeFile('isolated-alert-status/summary.json',JSON.stringify(report,null,2));console.log('DREAMTEAM_ALERT_VERIFICATION '+JSON.stringify(report));if(report.result!=='PASS')process.exitCode=1;
}
