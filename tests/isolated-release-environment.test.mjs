import test from 'node:test';import assert from 'node:assert/strict';
import {createIsolatedReleaseEnvironment,safeProviderFailure} from '../scripts/isolated-release-environment.mjs';
const uuid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',name='dream-team-audit-123-db';
function provider(count){let deleted=false;const calls=[];return {calls,request:async(path,method='GET',body)=>{
 calls.push({path,method,body});if(path.includes('?'))return Array.from({length:count},(_,i)=>({name:'historical-'+i}));
 if(path==='/d1/database')return {name,uuid};
 if(method==='DELETE'){deleted=true;return {}};
 if(deleted)throw Object.assign(Error('CLOUDFLARE_ACCESS'),{status:404});return {name,uuid};
}}}
test('nine existing D1 databases allocate exactly one slot and cleanup only that receipt',async()=>{const p=provider(9);const lease=await createIsolatedReleaseEnvironment({runId:'123',request:p.request});assert.equal(lease.databasesBefore,9);assert.equal(p.calls.filter(c=>c.method==='POST').length,1);assert.equal((await lease.cleanup()).result,'PASS');assert.deepEqual(p.calls.filter(c=>c.method==='DELETE').map(c=>c.path),['/d1/database/'+uuid]);assert.equal((await lease.cleanup()).result,'ALREADY_CLEANED')});
test('full account blocks before creating or deleting any resource',async()=>{const p=provider(10);await assert.rejects(createIsolatedReleaseEnvironment({runId:'123',request:p.request}),/D1_CAPACITY_EXHAUSTED/);assert.ok(p.calls.every(c=>c.method==='GET'))});
test('a pre-existing test database is never adopted or deleted',async()=>{const calls=[];await assert.rejects(createIsolatedReleaseEnvironment({runId:'123',request:async(path,method='GET')=>{calls.push(method);return [{name,uuid}]}}),/SANDBOX_ALREADY_EXISTS/);assert.deepEqual(calls,['GET'])});
test('provider HTTP and numeric Cloudflare code survive without response bodies or secrets',async()=>{const error=Object.assign(Error('CLOUDFLARE_ACCESS'),{status:403,code:10000,body:'secret'});assert.deepEqual(safeProviderFailure(error),{error:'CLOUDFLARE_ACCESS',httpStatus:403,cloudflareCode:10000});await assert.rejects(createIsolatedReleaseEnvironment({runId:'123',request:async(path,method)=>{if(method==='POST')throw error;return []}}),e=>e.status===403&&e.code===10000&&e.operation==='D1_CREATE')});
