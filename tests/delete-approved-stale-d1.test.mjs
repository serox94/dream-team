import {test} from 'node:test';import assert from 'node:assert/strict';
import {APPROVAL,BACKUP,allowedOperation,guardedClient,validateRecovery,verifyOnlyTargetRemoved} from '../scripts/delete-approved-stale-d1.mjs';
import {TARGET} from '../scripts/prepare-stale-d1-backup.mjs';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const account='a'.repeat(32),token='NEVER_LOG_THIS';
test('approval names only the exact old DB UUID and verified recovery run',()=>{assert.ok(APPROVAL.includes(TARGET.name)&&APPROVAL.includes(TARGET.id)&&APPROVAL.endsWith(BACKUP.run));});
test('no operation may write production or another test database',()=>{
  assert.equal(allowedOperation('DELETE','/d1/database/'+TARGET.id),true);
  for(const id of ['b64c7a2c-8694-41c6-b54a-857b88bf2c96','other'])for(const method of ['DELETE','POST','PUT','PATCH'])assert.equal(allowedOperation(method,'/d1/database/'+id),false);
  assert.equal(allowedOperation('POST','/workers/scripts/dream-team/deployments',{}),false);
  assert.equal(allowedOperation('DELETE','/r2/buckets/dream-team-d1-backups'),false);
});
test('only read-only SQL can query the pinned test DB',()=>{
  const path='/d1/database/'+TARGET.id+'/query';
  for(const sql of ['SELECT * FROM "auth_accounts"','PRAGMA foreign_key_check','PRAGMA quick_check'])assert.equal(allowedOperation('POST',path,{sql}),true);
  for(const sql of ['DELETE FROM auth_accounts','SELECT 1; DELETE FROM trips','PRAGMA writable_schema=ON','SELECT 1 -- comment'])assert.equal(allowedOperation('POST',path,{sql}),false);
});
test('transport sends at most one DELETE, including after a timeout',async()=>{
  let calls=0;const c=guardedClient({account,token,fetcher:async()=>{calls++;throw Error(token);}});
  await assert.rejects(c.request('DELETE','/d1/database/'+TARGET.id),/DELETE_TRANSPORT_UNCERTAIN/);
  await assert.rejects(c.request('DELETE','/d1/database/'+TARGET.id),/SECOND_DELETE_FORBIDDEN/);assert.equal(calls,1);
});
test('API failures expose only HTTP status and numeric Cloudflare code',async()=>{
  const c=guardedClient({account,token,fetcher:async()=>({ok:false,status:403,json:async()=>({success:false,errors:[{code:9109,message:token}]})})});
  await assert.rejects(c.request('DELETE','/d1/database/'+TARGET.id),e=>{assert.equal(e.status,403);assert.equal(e.code,9109);assert.ok(!JSON.stringify(e).includes(token));return true;});
});
test('quota check proves that only the approved target disappeared',()=>{
  const before=[{uuid:TARGET.id,name:TARGET.name},...Array.from({length:9},(_,i)=>({uuid:'db'+i,name:'db'+i}))];
  verifyOnlyTargetRemoved(before,before.slice(1));
  assert.throws(()=>verifyOnlyTargetRemoved(before,[...before.slice(2),{uuid:'new',name:'new'}]),/OTHER_DATABASE_INVENTORY_CHANGED/);
  assert.throws(()=>verifyOnlyTargetRemoved(before,before.slice(0,9)),/TARGET_STILL_PRESENT/);
});
test('wrong target, missing recovery evidence or altered SQL cannot authorize deletion',()=>{
  assert.throws(()=>validateRecovery({},Buffer.from('secret')),/BACKUP_RECEIPT_TARGET_MISMATCH/);
  assert.throws(()=>validateRecovery({format:'dream-stale-test-backup-v1',source:TARGET,privateSqlKey:'wrong'},Buffer.from('secret')),/BACKUP_RECEIPT_HASH_MISMATCH/);
});
test('missing owner approval blocks the executable before any API request',()=>{
  const dir=mkdtempSync(join(tmpdir(),'delete-guard-test-'));
  try{
    const env={...process.env};delete env.STALE_D1_DELETE_APPROVAL;delete env.CLOUDFLARE_API_TOKEN;delete env.CLOUDFLARE_ACCOUNT_ID;
    const child=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/delete-approved-stale-d1.mjs',import.meta.url))],{cwd:dir,env,encoding:'utf8'});
    assert.equal(child.status,1);
    const report=JSON.parse(readFileSync(join(dir,'approved-delete-status/summary.json'),'utf8'));
    assert.equal(report.failure.error,'EXACT_TARGET_OWNER_APPROVAL_REQUIRED');assert.equal(report.operations.calls,0);assert.equal(report.deleteRequests,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
