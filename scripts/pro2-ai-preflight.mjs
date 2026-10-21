// Read-only account/model check. No inference, subscription or production changes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {cf} from './recovery-common.mjs';
assert.equal(process.env.GITHUB_REF,'refs/heads/feat/pro2-i18n-photos-20261021');
const report={at:new Date().toISOString(),build:process.env.GITHUB_SHA,inferenceCalls:0,productionWrites:0,checks:{}};
for(const [name,path] of Object.entries({workersSettings:'/workers/account-settings',subscriptions:'/subscriptions',entitlements:'/entitlements',model:'/ai/models/search?search=m2m100&per_page=10'})){
 try{const data=await cf(path);report.checks[name]={status:'PASS',data:name==='subscriptions'?data.map(x=>({state:x.state,price:x.price,currency:x.currency,rate_plan:x.rate_plan})):data};}
 catch(e){report.checks[name]={status:'BLOCKED',http:e.status,code:e.code};}
}
const deployment=await cf('/workers/scripts/dream-team/deployments');report.productionWorker=deployment.deployments[0].versions[0].version_id;
const preview=(await cf('/workers/scripts/dream-team-pro2-preview/deployments')).deployments[0].versions[0].version_id;
const version=await cf('/workers/scripts/dream-team-pro2-preview/versions/'+preview);report.preview={version:preview,bindings:version.resources.bindings.map(b=>({name:b.name,type:b.type,...(b.type==='d1'?{id:b.id}:{}),...(b.type==='r2_bucket'?{bucket_name:b.bucket_name}:{})}))};
await mkdir('pro2-ai-status',{recursive:true});await writeFile('pro2-ai-status/preflight.json',JSON.stringify(report,null,2));console.log('PRO2_AI_PREFLIGHT '+JSON.stringify(report));
