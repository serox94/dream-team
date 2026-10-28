import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseErrorSummary,validateMediaInventory,requireUnchangedEmptyMedia} from '../scripts/code32-release-safety.mjs';
test('stage-specific diagnostics retain safe phase, operation and numeric API code only',()=>{
 const e=Error('PRIVATE_MEDIA_IO_UPLOAD');e.status=403;e.code=10042;
 e.unsafe='secret';e.url='https://private.example.com';e.body='sensitive';
 assert.deepEqual(releaseErrorSummary(e,'MEDIA_GATEWAY_UPLOAD','WORKER_UPLOAD'),
 {phase:'MEDIA_GATEWAY_UPLOAD',operation:'WORKER_UPLOAD',code:'PRIVATE_MEDIA_IO_UPLOAD',httpStatus:403,cloudflareCode:10042});
 assert.ok(!JSON.stringify(releaseErrorSummary(e,'MEDIA_GATEWAY_UPLOAD','WORKER_UPLOAD')).includes('secret'));
});
test('unknown exceptions never leak messages, URLs or source rows',()=>{
 const e=Error('Permission denied at https://my.example.com/private?token=abc');
 assert.deepEqual(releaseErrorSummary(e,'MEDIA_BACKUP','WORKER_BACKUP'),
 {phase:'MEDIA_BACKUP',operation:'WORKER_BACKUP',code:'SCHEMA32_GATE_FAILED'});
});
test('restore stage metadata are safe and bounded',()=>{
 const e=Error('PRIVATE_R2_RESTORE_FAILED');e.status=500;e.recoveryCode='NO_MANIFEST';
 assert.deepEqual(releaseErrorSummary(e,'MEDIA_RESTORE','WORKER_RESTORE'),
 {phase:'MEDIA_RESTORE',operation:'WORKER_RESTORE',code:'PRIVATE_R2_RESTORE_FAILED',httpStatus:500,recoveryCode:'NO_MANIFEST'});
 const bad=Error('db row leaked');bad.stage='users-secret';bad.code='https://malicious';
 const s=releaseErrorSummary(bad,'bad phase','secret-operation');
 assert.equal(s.phase,'UNKNOWN');assert.equal(s.operation,'UNKNOWN');assert.ok(!('stage' in s));
 assert.ok(!('cloudflareCode' in s));
 assert.equal(releaseErrorSummary(Error('SECRETKEYABCDEF'), 'PREPARE', 'OP').code,'SCHEMA32_GATE_FAILED');
});
test('an empty media inventory requires no independent archive objects',()=>{
 assert.deepEqual(validateMediaInventory([]),{objects:0,totalBytes:0,empty:true});
 assert.equal(requireUnchangedEmptyMedia({snapshotKind:'VERIFIED_EMPTY_R2',objects:0},[]),true);
 assert.throws(()=>requireUnchangedEmptyMedia({snapshotKind:'VERIFIED_EMPTY_R2',objects:0},[{key:'new.png',size:2}]),/MEDIA_SNAPSHOT_CHANGED/);
 assert.throws(()=>requireUnchangedEmptyMedia({snapshotKind:'COPIED_R2',objects:0},[]),/MEDIA_EMPTY_RECEIPT_REQUIRED/);
});
test('reject unsupported or oversized media before creating a new D1',()=>{
 assert.throws(()=>validateMediaInventory(null),/MEDIA_INVENTORY_INVALID/);
 assert.throws(()=>validateMediaInventory([{key:'photo',size:-1}]),/MEDIA_INVENTORY_INVALID/);
 assert.throws(()=>validateMediaInventory([{key:'photo',size:2},{key:'photo',size:2}]),/MEDIA_INVENTORY_INVALID/);
 assert.throws(()=>validateMediaInventory([{key:'huge',size:201*1024*1024}]),/MEDIA_BACKUP_BUDGET/);
 assert.throws(()=>validateMediaInventory(Array.from({length:101},(_,i)=>({key:String(i),size:1}))),/MEDIA_BACKUP_BUDGET/);
 assert.deepEqual(validateMediaInventory([{key:'test.png',size:50}]),{objects:1,totalBytes:50,empty:false});
});
