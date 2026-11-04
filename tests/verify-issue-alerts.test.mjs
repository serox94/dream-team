import test from 'node:test';import assert from 'node:assert/strict';import {verifyIssueAlerts} from '../scripts/verify-issue-alerts.mjs';
const context={repository:'serox94/dream-team',workflow:'Isolated alert verification 123-1',url:'https://github.com/serox94/dream-team/actions/runs/123'};
function provider({deny=false}={}){let issue;return {token:'fixture',fetcher:async(url,options)=>{
 if(deny)return Response.json({},{status:403});
 if(options.method==='POST'){issue={number:1,state:'open',user:{type:'Bot',login:'github-actions'},...JSON.parse(options.body)};return Response.json(issue,{status:201})}
 if(options.method==='PATCH'){Object.assign(issue,JSON.parse(options.body));return Response.json(issue)}
 if(new URL(url).pathname.endsWith('/issues/1'))return Response.json(issue);
 const state=new URL(url).searchParams.get('state');return Response.json(issue&&issue.state===state?[issue]:[]);
}}}
test('alert verification exercises create, update, close and closed-issue readback',async()=>{const r=await verifyIssueAlerts(context,provider());assert.equal(r.result,'PASS');assert.deepEqual(r.steps,['CREATED','UPDATED','RESOLVED']);assert.equal(r.issue,1)});
test('Issues permission denial is a failed test with safe HTTP diagnostics',async()=>{const r=await verifyIssueAlerts(context,provider({deny:true}));assert.equal(r.result,'FAIL');assert.equal(r.httpStatus,403);assert.equal(r.error,'ALERT_DELIVERY_FAILED')});

for(const branch of ['ops/universal-release-monitor-20261104','main'])test(`cleanup on ${branch} closes only bot-owned tests from completed failed runs of this exact workflow`,async()=>{
 const {cleanupFailedIssueTests}=await import('../scripts/verify-issue-alerts.mjs');const patches=[];
 const testIssue={number:29,title:'[DreamTeam operations] Isolated alert verification 123-1',body:'Workflow run: https://github.com/serox94/dream-team/actions/runs/123',user:{type:'Bot',login:'github-actions'}};
 const report=await cleanupFailedIssueTests({repository:'serox94/dream-team',branch,currentRun:'456',token:'fixture',fetcher:async(url,options)=>{
  const p=new URL(url).pathname;
  if(p.endsWith('/actions/runs/123'))return Response.json({path:'.github/workflows/isolated-release-drill.yml',head_branch:branch,head_repository:{full_name:'serox94/dream-team'},status:'completed',conclusion:'failure'});
  if(options.method==='PATCH'){patches.push(p);return Response.json({})}
  if(p.endsWith('/issues/29'))return Response.json({state:'closed'});
  return Response.json([testIssue,{...testIssue,number:30,user:{type:'User',login:'github-actions'}},{...testIssue,number:31,title:'[DreamTeam operations] Production release'}]);
 }});
 assert.equal(report.result,'PASS');assert.deepEqual(report.closed,[29]);assert.equal(patches.length,1);
});
