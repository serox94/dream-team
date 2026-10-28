import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {inspectSql,restoreStatements,restoreSnapshot,verifySnapshot} from '../scripts/d1-snapshot.mjs';

const target={name:'dream-team-audit-98765432-db',uuid:'disposable'};
const note='Łowisko 🎣, ważny regulamin, apostrof \' i NUL \0.\n'.repeat(4500);
const binary=Uint8Array.from([0,255,0,128,42,1]);
const sqlDump=()=>`CREATE TABLE large_research(id INTEGER PRIMARY KEY AUTOINCREMENT,content TEXT,raw BLOB);
INSERT INTO large_research(id,content,raw) VALUES(1,CAST(X'${Buffer.from(note,'utf8').toString('hex')}' AS TEXT),X'${Buffer.from(binary).toString('hex')}');`;
const executeLocal=db=>async(id,sql,params=[])=>{
 assert.equal(id,target.uuid);
 if(/^SELECT|^PRAGMA/.test(sql))return {results:db.prepare(sql).all()};
 if(params.length)db.prepare(sql).run(...params);else db.exec(sql);
 return {results:[]};
};

test('restores long Polish/Unicode/NUL research via parameter, preserving binary and exact row digest',async()=>{
 const snapshot=inspectSql(Buffer.from(sqlDump()));
 const plan=restoreStatements(snapshot);
 const insert=plan.find(x=>x.table==='large_research'&&x.stage==='rows');
 assert.ok(insert,'oversized INSERT must exist');
 assert.ok(Buffer.byteLength(insert.sql)<75000,'SQL remains below conservative D1 query cap');
 assert.deepEqual(insert.params,[note],'long content is bound, not embedded in SQL');
 assert.ok(!insert.sql.includes('Łowisko'));
 const db=new DatabaseSync(':memory:');
 try{
  const result=await restoreSnapshot(target,snapshot,executeLocal(db),plan);
  assert.equal(result.rows,1);
  const row=db.prepare('SELECT content,raw,typeof(raw) kind FROM large_research').get();
  assert.equal(row.content,note);
  assert.equal(row.kind,'blob');
  assert.deepEqual(Buffer.from(row.raw),Buffer.from(binary));
  await verifySnapshot(target,snapshot,executeLocal(db));
 }finally{db.close();}
});

test('unrepresentable giant binary literal is rejected before ANY remote database request',async()=>{
 const snapshot=inspectSql(Buffer.from(sqlDump()));
 const row=snapshot.tables.find(t=>t.name==='large_research').rows[0];
 row.content=null;
 row.raw=new Uint8Array(45000);
 let remoteCalls=0;
 await assert.rejects(restoreSnapshot(target,snapshot,async()=>{remoteCalls++;return {results:[]};}),/OVERSIZE_NON_TEXT_RESTORE_LIMIT/);
 assert.equal(remoteCalls,0);
});

test('unsupported >2MB bound value fails without any remote query',async()=>{
 const snapshot=inspectSql(Buffer.from(sqlDump()));
 const row=snapshot.tables.find(t=>t.name==='large_research').rows[0];
 row.content='x'.repeat(2000001);
 let remoteCalls=0;
 await assert.rejects(restoreSnapshot(target,snapshot,async()=>{remoteCalls++;return {results:[]};}),/ROW_EXCEEDS_D1_VALUE_LIMIT/);
 assert.equal(remoteCalls,0);
});

test('code32 release checks free D1 slot and constructs restore plan before allocating recovery D1',()=>{
 const code=readFileSync('scripts/code32-release.mjs','utf8');
 const inventory=code.indexOf("cf('/d1/database?per_page=100')");
 const exportAt=code.indexOf("exportSql(cfg,'dream-team-db',sqlFile)");
 const planAt=code.indexOf('restorePlan=restoreStatements(snapshot)');
 const createAt=code.indexOf("cf('/d1/database','POST'");
 assert.ok(inventory>=0 && exportAt>inventory,'inventory before expensive snapshot export');
 assert.ok(planAt>exportAt&&createAt>planAt,'plan validation before any create');
 assert.match(code,/D1_RECOVERY_SLOT_UNAVAILABLE/);
 assert.match(code,/restoreSnapshot\(restore,snapshot,measuredQuery,restorePlan\)/);
});
