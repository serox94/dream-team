import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {acquireD1Fence,requireProductionWriteFence} from '../scripts/d1-write-fence.mjs';import {captureSnapshot} from '../scripts/d1-snapshot.mjs';
test('a statement prepared before the fence and delayed background writes cannot succeed after it',async()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE entries(id INTEGER PRIMARY KEY AUTOINCREMENT,value TEXT); INSERT INTO entries(value) VALUES(\'before\');');
  const oldStatement=db.prepare('INSERT INTO entries(value) VALUES(?)');let release;
  const admitted=new Promise(r=>{release=r});const delayed=admitted.then(()=>oldStatement.run('delayed'));
  const execute=async(_,sql,params=[])=>{if(/^SELECT|^PRAGMA/.test(sql))return {results:db.prepare(sql).all(...params)};db.exec(sql);return {results:[]}};
  const target={name:'dream-team-audit-123-db',uuid:'audit'};const fence=await acquireD1Fence(target,execute);
  release();await assert.rejects(delayed,/RELEASE_WRITE_FENCED/);
  const snapshot=await captureSnapshot(target,execute);assert.deepEqual(snapshot.tables.find(t=>t.name==='entries').rows.map(r=>r.value),['before']);
  assert.throws(()=>db.prepare('UPDATE entries SET value=\'background\'').run(),/RELEASE_WRITE_FENCED/);
  await fence.verify();await fence.release();oldStatement.run('after');assert.equal(db.prepare('SELECT count(*) n FROM entries').get().n,2);
 }finally{db.close()}
});
test('missing all-writer/R2 enforcement blocks production instead of treating a sleep as drain proof',()=>assert.throws(()=>requireProductionWriteFence(),/ALL_WRITERS_FENCE_NOT_PROVEN/));
