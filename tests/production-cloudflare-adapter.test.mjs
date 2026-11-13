// No provider writes in these tests. Successful production execution is deliberately
// impossible until the application's complete writer protocol is proven.
import test from 'node:test';import assert from 'node:assert/strict';
import {productionCloudflareAdapter} from '../scripts/cloudflare-isolated-adapter.mjs';
import {release} from '../scripts/universal-release.mjs';import {digest} from '../scripts/release-config-policy.mjs';import {productionId} from '../scripts/recovery-common.mjs';
const candidate='a'.repeat(40),operator='b'.repeat(40),sourceBuild='c'.repeat(40),fallbackBuild='d'.repeat(40);
const ids=['a','b','c'].map(c=>`${c.repeat(8)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(12)}`);
const plan={candidate,operator,approval:`RELEASE:${candidate}:${operator}`,sourceSchema:31,targetSchema:31,targetVersion:ids[0],sourceVersion:ids[1],fallbackVersion:ids[2],sourceBuild,fallbackBuild,databaseId:productionId,migrationDigest:'none'};
async function fixture(t){const previous=process.env.CLOUDFLARE_ACCOUNT_ID;process.env.CLOUDFLARE_ACCOUNT_ID='9'.repeat(32);t.after(()=>{if(previous===undefined)delete process.env.CLOUDFLARE_ACCOUNT_ID;else process.env.CLOUDFLARE_ACCOUNT_ID=previous});
 let calls=0;const transport=async()=>{calls++;throw Error('UNEXPECTED_PROVIDER_ACCESS')};
 const options={enabled:true,expectedAccountId:process.env.CLOUDFLARE_ACCOUNT_ID,plan,planDigest:digest(plan),productionApproval:'PRODUCTION:'+digest(plan),sourceVersion:ids[1],fallbackVersion:ids[2],sourceBuild,fallbackBuild,currentRunId:'456',evidenceRunId:'789',
 recovery:{runId:'123',workerRunId:'1239',worker:'dream-team-audit-1239-recovery-probe',baseUrl:'https://dream-team-audit-1239-recovery-probe.sewerynski00.workers.dev',lease:{database:{name:'dream-team-audit-123-db',uuid:'e'.repeat(8)+'-eeee-eeee-eeee-'+ 'e'.repeat(12)},assertOwned:async()=>{}}},
 media:{source:'dream-team-media',restored:'dream-team-audit-123-restored',archive:'dream-team-audit-123-archive'},request:transport,execute:transport,githubRequest:transport,fetcher:transport};
 return {options,calls:()=>calls};}
test('production disabled before any provider access by default',async()=>{await assert.rejects(productionCloudflareAdapter(),/PRODUCTION_CAPABILITY_DISABLED/)});
test('text approval without protected workflow context cannot even construct production capability',async t=>{const f=await fixture(t);await assert.rejects(productionCloudflareAdapter(f.options),/PROTECTED_OPERATOR_CONTEXT_REQUIRED/);assert.equal(f.calls(),0)});
test('exact approval cannot be reused for a changed version, schema or migration',async t=>{const f=await fixture(t);for(const change of [{targetVersion:ids[2]},{sourceSchema:32},{migrationDigest:'changed'}])await assert.rejects(productionCloudflareAdapter({...f.options,plan:{...plan,...change}}),/PRODUCTION_APPROVAL_MISMATCH|INVALID_PRODUCTION_PLAN/);assert.equal(f.calls(),0)});
