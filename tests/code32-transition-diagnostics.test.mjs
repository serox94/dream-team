import test from 'node:test';
import assert from 'node:assert/strict';
import {promoteCode32} from '../scripts/code32-transition.mjs';
function inputs(){const fn=async()=>({schema:32});return {preflight:fn,activate:fn,ready:fn,verify:async()=>{throw Error('TEST_GATE_FAILED')},recover:fn,verifyRecovery:fn};}
test('records rollout and redacted rollback API failure without retry',async()=>{
 let n=0;const x=inputs();x.recover=async()=>{n++;const e=Error('CLOUDFLARE_ACCESS');e.status=403;e.code=10042;throw e};
 const r=await promoteCode32(x);assert.equal(n,1);assert.equal(r.result,'BLOCKED');assert.equal(r.recovery,'BLOCKED');assert.equal(r.failure.phase,'PROMOTE_VERIFY');assert.deepEqual(r.recoveryFailure,{phase:'PROMOTE_RECOVER',operation:'WORKER_ROLLBACK',code:'CLOUDFLARE_ACCESS',httpStatus:403,cloudflareCode:10042});
});
test('distinguishes readiness failure after successful recovery without leaking error text',async()=>{
 let n=0;const x=inputs();x.recover=async()=>{n++;return {schema:32}};x.verifyRecovery=async()=>{throw Error('private token and URL')};
 const r=await promoteCode32(x);assert.equal(n,1);assert.equal(r.recovery,'BLOCKED');assert.equal(r.recoveryFailure.phase,'RECOVERY_VERIFY');assert.ok(!JSON.stringify(r).includes('private token'));
});
test('preflight rejection never attempts activation or recovery',async()=>{
 let n=0;const x=inputs();x.preflight=async()=>{throw Error('TEST_GATE_FAILED')};x.recover=async()=>{n++};const r=await promoteCode32(x);assert.equal(n,0);assert.equal(r.fullActivationAttempts,0);assert.equal(r.failure.phase,'PROMOTE_PREFLIGHT');
});
