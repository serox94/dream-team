import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TARGET,assertPinnedTarget,backupKey,checkedSnapshot,targetReference,dependencyInventory} from '../scripts/prepare-stale-d1-backup.mjs';

test('only the exact old test database can be exported',()=>{
  assertPinnedTarget({name:TARGET.name,uuid:TARGET.id,file_size:573440});
  assert.throws(()=>assertPinnedTarget({name:'dream-team-db',uuid:TARGET.id,file_size:573440}),/PINNED_TEST_DATABASE_REQUIRED/);
  assert.throws(()=>assertPinnedTarget({name:TARGET.name,uuid:'b64c7a2c-8694-41c6-b54a-857b88bf2c96',file_size:573440}),/PINNED_TEST_DATABASE_REQUIRED/);
  assert.throws(()=>assertPinnedTarget({name:TARGET.name,uuid:TARGET.id,file_size:3e6}),/TEST_DATABASE_SIZE_BUDGET/);
});
test('backup location cannot be redirected outside the private pinned prefix',()=>{
  assert.equal(backupKey('40531123753'),'private-releases/stale-d1/39575383767/40531123753/schema.sql');
  assert.throws(()=>backupKey('../production'),/ACTIONS_RUN_REQUIRED/);
});
const sql=Buffer.from("CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id)); INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1,1);");
test('SQL is actually restored with foreign-key and integrity checks, without persisting rows in summary',()=>{
  const {summary}=checkedSnapshot(sql); assert.equal(summary.tables,2); assert.equal(summary.rows,2); assert.equal(summary.foreignKeys,'PASS'); assert.equal(summary.integrity,'PASS');
  assert.ok(!('rows' in summary.tableCounts[0]&&typeof summary.tableCounts[0].rows!=='number'));
});
test('foreign-key corruption blocks the backup readiness claim',()=>{
  const broken=Buffer.from("CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT); CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(1,999);");
  assert.throws(()=>checkedSnapshot(broken),/CHECKPOINT_FOREIGN_KEYS/);
});
test('database references are detected in both D1 bindings and metadata configuration',()=>{
  assert.equal(targetReference([{type:'d1',id:TARGET.id}]),true);
  assert.equal(targetReference([{type:'plain_text',text:'https://x/'+TARGET.id}]),true);
  assert.equal(targetReference([{type:'secret_text',text:TARGET.id}]),false);
});
test('current and historical bindings remain separate and visible',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const r=await dependencyInventory(async p=>p==='/workers/scripts'?[{id:'dream-team-pro2-preview'}]:p.endsWith('/settings')?{bindings:[]}:p.endsWith('/versions?deployable=true')?{items:[{id,number:1}]}:{resources:{bindings:[{type:'d1',id:TARGET.id}]}});
  assert.deepEqual(r.activeReferences,[]); assert.equal(r.historicalReferences.length,1); assert.equal(r.historicalReadsComplete,true);
});
test('unsupported history cannot be reported complete',async()=>{
  const r=await dependencyInventory(async p=>p==='/workers/scripts'?[{id:'dream-team-pro2-preview'}]:p.endsWith('/settings')?{bindings:[]}:{});
  assert.equal(r.historicalReadsComplete,false); assert.equal(r.failures[0].error,'VERSION_LIST_FORMAT');
});
test('every current binding is checked before any historical inventory',async()=>{
  const calls=[];
  const r=await dependencyInventory(async p=>{
    calls.push(p);
    if(p==='/workers/scripts')return [{id:'dream-team'},{id:'dream-team-pro2-preview'}];
    if(p.endsWith('/settings'))return {bindings:[]};
    assert.ok(calls.includes('/workers/scripts/dream-team/settings'));
    assert.ok(calls.includes('/workers/scripts/dream-team-pro2-preview/settings'));
    return {items:[]};
  });
  assert.equal(r.historicalReadsComplete,true); assert.equal(r.plannedVersionReads,0);
});
