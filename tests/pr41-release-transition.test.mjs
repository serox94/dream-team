import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseCodeOnly,productionGate,planDigest,proveImmutableSourceRollback,PR41_CANDIDATE,PR41_PREVIOUS} from '../scripts/pr41-release-transition.mjs';
const make=()=>{let current='old';const calls=[];return {calls,io:{preflight:async()=>calls.push('preflight'),current:async()=>current,activate:async id=>{calls.push('activate:'+id);current=id},verify:async()=>calls.push('verify'),verifyRecovery:async()=>calls.push('recovery')}}};
const versions={previous:'old',target:'new'};
test('code-only promotion has no database or maintenance operation',async()=>{const {io,calls}=make();assert.equal((await releaseCodeOnly(io,versions)).result,'PASS');assert.deepEqual(calls,['preflight','activate:new','verify'])});
test('preflight failure never activates or rolls back',async()=>{const {io,calls}=make();io.preflight=async()=>{throw Error('STALE_BACKUP')};assert.equal((await releaseCodeOnly(io,versions)).result,'BLOCKED');assert.deepEqual(calls,[])});
for(const failure of ['before-activation','ambiguous-activation','readiness'])test(failure+' recovers only the pinned previous version',async()=>{const {io,calls}=make(),activate=io.activate;let first=true;io.activate=async id=>{if(first){first=false;if(failure==='ambiguous-activation')await activate(id);if(failure!=='readiness')throw Error('ACTIVATION_FAILED')}await activate(id)};if(failure==='readiness')io.verify=async()=>{throw Error('READINESS_FAILED')};const r=await releaseCodeOnly(io,versions);assert.equal(r.result,'ROLLED_BACK');assert.equal(r.recovery,'PASS');assert.equal(await io.current(),'old');assert.ok(!calls.some(x=>/restore|maintenance|delete|migrate/.test(x)))});
for(const failure of ['rollback-activation','rollback-verification','rollback-identity'])test(failure+' remains BLOCKED',async()=>{const {io}=make(),activate=io.activate;io.verify=async()=>{throw Error('READINESS_FAILED')};if(failure==='rollback-activation')io.activate=async id=>{if(id==='old')throw Error('ROLLBACK_FAILED');await activate(id)};if(failure==='rollback-verification')io.verifyRecovery=async()=>{throw Error('RECOVERY_NOT_READY')};if(failure==='rollback-identity')io.verifyRecovery=async()=>activate('new');const r=await releaseCodeOnly(io,versions);assert.equal(r.result,'BLOCKED');assert.equal(r.recovery,'BLOCKED')});
test('unknown concurrent deployment is never overwritten',async()=>{const {io,calls}=make();io.verify=async()=>{io.current=async()=>'foreign';throw Error('CONCURRENT_DEPLOYMENT')};const r=await releaseCodeOnly(io,versions);assert.equal(r.recovery,'BLOCKED');assert.equal(r.recoveryFailure,'UNKNOWN_ACTIVE_VERSION');assert.ok(!calls.includes('activate:old'))});
const gates=Object.fromEntries(['sourceCode','immutableSourceRollback','sourceConfiguration','candidateCode','candidateAssets','candidateConfiguration','restoredD1','restoredR2','sessionContinuity','rollback','failureRecovery'].map(k=>[k,'PASS']));
gates.sourceAssets='UNPROVEN'; // Historical Git files are not the production asset export.
const seal=p=>({...p,digest:planDigest(p)});
const plan=()=>seal({candidate:PR41_CANDIDATE,previous:PR41_PREVIOUS,schema:32,migrations:[],gates:{...gates},backup:{d1:'PASS',r2:'PASS',verifiedAt:new Date().toISOString()}});
const auth=p=>({approved:'yes',approvedPlan:p.digest,protectedReview:true});
test('production requires exact authorization, real protected review, complete evidence and fresh recovery point',()=>{const p=plan();assert.equal(productionGate(p,auth(p)),true);for(const patch of [{approved:'no'},{approved:undefined},{approvedPlan:'b'.repeat(64)},{protectedReview:false}])assert.throws(()=>productionGate(p,{...auth(p),...patch}));for(const key of Object.keys(gates).filter(k=>k!=='sourceAssets')){const p=plan();p.gates[key]='UNPROVEN';const sealed=seal(p);assert.throws(()=>productionGate(sealed,auth(sealed)))}const old=plan();old.backup.verifiedAt=new Date(Date.now()-16*60000).toISOString();const sealed=seal(old);assert.throws(()=>productionGate(sealed,auth(sealed)));const wrong=seal({...plan(),migrations:['0033.sql']});assert.throws(()=>productionGate(wrong,auth(wrong)));const tampered=plan();tampered.gates.immutableSourceRollback='UNPROVEN';assert.throws(()=>productionGate(tampered,auth(tampered)),/EXACT_PLAN_AUTHORIZATION_REQUIRED/)});

test('native rollback uses the original deployable Worker including ASSETS',()=>{
 const v={id:PR41_PREVIOUS,assets:{config:{run_worker_first:true}},bindings:[{name:'ASSETS',type:'assets'}]};
 const versions=[{id:PR41_PREVIOUS}];
 assert.equal(proveImmutableSourceRollback(v,versions).status,'PASS');
 assert.throws(()=>proveImmutableSourceRollback({...v,id:'other'},versions),/ORIGINAL_VERSION_ID_MISMATCH/);
 assert.throws(()=>proveImmutableSourceRollback({...v,bindings:[]},versions),/ORIGINAL_VERSION_ASSETS_MISSING/);
 assert.throws(()=>proveImmutableSourceRollback(v,[]),/ORIGINAL_VERSION_NOT_DEPLOYABLE/);
 const p=plan();assert.equal(productionGate(p,auth(p)),true);
 const forged=seal({...p,gates:{...p.gates,sourceAssets:'PASS'}});assert.throws(()=>productionGate(forged,auth(forged)),/HISTORICAL_ASSET_IDENTITY_MUST_NOT_BE_ASSERTED/);
});
