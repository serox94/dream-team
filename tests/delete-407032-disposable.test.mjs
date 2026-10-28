import test from 'node:test';
import assert from 'node:assert/strict';
const {TARGET}=await import('../scripts/backup-407032-disposable.mjs');
const {BACKUP_RUN,APPROVAL,allowed,verifyOnlyOneRemoved,validateReceipt}=await import('../scripts/delete-407032-disposable.mjs');
import {createHash} from 'node:crypto';
const id=TARGET.uuid;
test('delete guard permits exactly one pinned UUID and never production, preview, R2 or other D1',()=>{
 assert.equal(allowed('DELETE','/d1/database/'+id),true);
 for(const path of ['/d1/database/b64c7a2c-8694-41c6-b54a-857b88bf2c96','/d1/database/other','/workers/scripts/dream-team','/r2/buckets/dream-team-d1-backups'])assert.equal(allowed('DELETE',path),false);
 assert.equal(allowed('POST','/d1/database/'+id+'/query'),false);
 assert.equal(allowed('GET','/d1/database/'+id),true);
 assert.equal(APPROVAL,'DELETE:'+TARGET.name+':'+id+':BACKUP:'+BACKUP_RUN);
});
test('one exact identity removed, with all other databases unchanged',()=>{
 const target={name:TARGET.name,uuid:id};
 const other=Array.from({length:9},(_,i)=>({name:'other'+i,uuid:'other-'+i}));
 assert.doesNotThrow(()=>verifyOnlyOneRemoved([target,...other],other));
 assert.throws(()=>verifyOnlyOneRemoved([target,...other],other.slice(1)),/D1_COUNT_UNVERIFIED/);
 assert.throws(()=>verifyOnlyOneRemoved([target,...other],[...other.slice(0,8),{name:'changed',uuid:'changed'}]),/OTHER_DATABASE_CHANGED/);
});
test('backup receipt must be pinned, hash verified, and actually restore to empty SQLite',()=>{
 const sql=Buffer.from('-- genuinely empty user-schema SQL export\nPRAGMA foreign_keys=OFF;\n');
 const digest=createHash('sha256').update(sql).digest('hex');
 const receipt={format:'dream-exact-disposable-empty-backup-v1',source:TARGET,run:BACKUP_RUN,
 key:'private-releases/stale-d1/4070321412132/'+BACKUP_RUN+'/schema.sql',
 sha256:digest,bytes:sql.length,localRestore:{schemaObjects:0},activeReferences:[],historicalReferences:[],
 versionsInspected:271,productionWorker:'81f011a2-ba96-4bdf-b199-10e89f8271e4',deletePerformed:false};
 assert.equal(validateReceipt(receipt,sql).integrity,'PASS');
 assert.throws(()=>validateReceipt({...receipt,sha256:'bad'},sql),/BACKUP_HASH_MISMATCH/);
 assert.throws(()=>validateReceipt({...receipt,source:{...TARGET,uuid:'bad'}},sql),/RECEIPT_TARGET_MISMATCH/);
 assert.throws(()=>validateReceipt({...receipt,deletePerformed:true},sql),/RECEIPT_PRODUCTION_OR_DELETE_MISMATCH/);
});
