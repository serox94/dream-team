import test from 'node:test';import assert from 'node:assert/strict';import {verifyIssueAlerts} from '../scripts/verify-issue-alerts.mjs';
const context={repository:'serox94/dream-team',workflow:'Isolated alert verification 123-1',url:'https://github.com/serox94/dream-team/actions/runs/123'};
function provider({deny=false}={}){let issue;return {token:'fixture',fetcher:async(url,options)=>{
 if(deny)return Response.json({},{status:403});
 if(options.method==='POST'){issue={number:1,state:'open',...JSON.parse(options.body)};return Response.json(issue,{status:201})}
 if(options.method==='PATCH'){Object.assign(issue,JSON.parse(options.body));return Response.json(issue)}
 const state=new URL(url).searchParams.get('state');return Response.json(issue&&issue.state===state?[issue]:[]);
}}}
test('alert verification exercises create, update, close and closed-issue readback',async()=>{const r=await verifyIssueAlerts(context,provider());assert.equal(r.result,'PASS');assert.deepEqual(r.steps,['CREATED','UPDATED','RESOLVED']);assert.equal(r.issue,1)});
test('Issues permission denial is a failed test with safe HTTP diagnostics',async()=>{const r=await verifyIssueAlerts(context,provider({deny:true}));assert.equal(r.result,'FAIL');assert.equal(r.httpStatus,403);assert.equal(r.error,'ALERT_DELIVERY_FAILED')});
