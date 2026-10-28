import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../scripts/retire-407248-once.mjs',import.meta.url),'utf8');
test('one exact authorized D1, one DELETE and no automatic retry',()=>{
 assert.match(src,/dream-team-audit-4072485184932-db/);
 assert.match(src,/ee58d26e-26f9-4f25-bbe9-944d6fa91c56/);
 assert.doesNotMatch(src,/4592a157-9eba-449f-98d0-255061c1fa47/);
 assert.equal((src.match(/method:'DELETE'/g)||[]).length,1);
 assert.match(src,/GITHUB_RUN_ATTEMPT==='1'/);
 assert.match(src,/RETIRE_APPROVAL==='DELETE:'/);
 assert.match(src,/report.deleteAttempts=1/);
 assert.doesNotMatch(src,/wrangler\(\['d1','delete'/);
});
test('fresh active and historical references, source equality, snapshot and receipt must precede DELETE',()=>{
 for(const marker of ['TARGET_HAS_WORKER_REFERENCES_OR_HISTORY_INCOMPLETE','versions>=1287',
   'verifySnapshot(target,snapshot,query)','BACKUP_RECEIPT_DIGEST_MISMATCH',
   'PRODUCTION_CONFIGURATION_CHANGED','DATABASE_INVENTORY_CHANGED'])
  assert.ok(src.includes(marker),marker);
 const ix=src.indexOf("report.phase='EXACTLY_ONE_DELETE'");
 for(const marker of ['versions>=1287','verifySnapshot(target,snapshot,query)',
   'BACKUP_RECEIPT_DIGEST_MISMATCH','PRODUCTION_CONFIGURATION_CHANGED','DATABASE_INVENTORY_CHANGED'])
  assert.ok(src.indexOf(marker)<ix,marker+' should be before DELETE');
});
test('retains private R2 backup and checks other 9 D1, Worker deployment and schedules',()=>{
 assert.match(src,/d03c85717437e1a031eb965d35f31dd0f1420eed23152bdb5227b0ec1851b146/);
 assert.match(src,/snapshotRetained:true,backupReceiptRetained:true/);
 assert.match(src,/after.length===9/);
 assert.match(src,/PRODUCTION_OR_BUCKETS_CHANGED/);
 assert.match(src,/OTHER_DATABASE_CHANGED/);
 assert.match(src,/CLOUDFLARE_ACCESS|PRODUCTION_WORKER_CHANGED/);
});
