import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCloudflareOperation,redactedReleaseFailure} from '../scripts/code32-diagnostic-details.mjs';

test('diagnostics distinguish private D1 database creation from query failures',()=>{
 assert.equal(classifyCloudflareOperation('/d1/database','POST'),'D1_CREATE_DISPOSABLE');
 assert.equal(classifyCloudflareOperation('/d1/database','GET'),'D1_LIST');
 assert.equal(classifyCloudflareOperation('/d1/database/12345678-abcd-1234-aaaa-123456789012/query','POST'),'D1_QUERY');
});

test('release error preserves only safe HTTP status, Cloudflare code, operation and stage',()=>{
 const err=new Error('CLOUDFLARE_ACCESS');
 err.status=403;err.code=10042;err.safeOperation='D1_CREATE_DISPOSABLE';
 err.token='SECRET_TOKEN';err.response={body:'password=SECRET_PASSWORD'};err.url='https://api.cloudflare.com/client/v4/accounts/SECRET_ACCOUNT';
 const report=redactedReleaseFailure(err,'DISPOSABLE_D1_CREATE');
 assert.deepEqual(report,{phase:'DISPOSABLE_D1_CREATE',type:'CLOUDFLARE_ACCESS',httpStatus:403,cloudflareCode:10042,operation:'D1_CREATE_DISPOSABLE'});
 assert.doesNotMatch(JSON.stringify(report),/SECRET_TOKEN|SECRET_PASSWORD|SECRET_ACCOUNT/);
});

test('arbitrary error fields, messages and unchecked endpoints cannot reach persisted evidence',()=>{
 const report=redactedReleaseFailure({message:'Bearer private_token',status:999,code:'Bearer',safeOperation:'POST /d1/database/secret'},'GET https://private.example');
 assert.deepEqual(report,{phase:'UNKNOWN',type:'RELEASE_GATE'});
});

test('404 and 429 retain actionable status with no raw response',()=>{
 assert.deepEqual(redactedReleaseFailure({message:'CLOUDFLARE_ACCESS',status:429,code:'9999',safeOperation:'D1_LIST'},'DISPOSABLE_D1_CREATE'),{
  phase:'DISPOSABLE_D1_CREATE',type:'CLOUDFLARE_ACCESS',httpStatus:429,cloudflareCode:9999,operation:'D1_LIST'
 });
});
