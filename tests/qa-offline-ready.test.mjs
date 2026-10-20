import test from 'node:test';import assert from 'node:assert/strict';
import {waitForOfflineReady} from '../scripts/qa-offline-ready.mjs';
test('offline gate awaits false CacheStorage promises and rejects an incomplete marked shell',async()=>{
 let calls=0;const page={async evaluate(){await new Promise(r=>setTimeout(r,1));calls++;return calls===1?{complete:false,missing:70,controlled:true}:calls===2?{complete:true,missing:1,controlled:true}:{complete:true,missing:0,controlled:true};}};
 const state=await waitForOfflineReady(page,{timeout:1000,interval:1});assert.equal(calls,3);assert.equal(state.missing,0);
 await assert.rejects(waitForOfflineReady({async evaluate(){return {complete:false,missing:70,controlled:true};}},{timeout:5,interval:1}),/OFFLINE_SHELL_NOT_COMPLETE/);
});
