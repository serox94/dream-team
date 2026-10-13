import test from 'node:test';import assert from 'node:assert/strict';import {database} from './db.mjs';import {verifyCheckpointRestore} from '../scripts/checkpoint-restore.mjs';
test('private recovery reconstruction preserves rows, constraints and deleted high-ID sequences',()=>{
 const DB=database();try{
  DB.sqlite.prepare("INSERT INTO spots(id,trip_id,name) VALUES(9000,'next-trip','disposable')").run();DB.sqlite.prepare('DELETE FROM spots WHERE id=9000').run();
  const schema=DB.sqlite.prepare('SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type,name').all(),rows={};
  for(const item of schema.filter(item=>item.type==='table'&&!item.name.startsWith('sqlite_')))rows[item.name]=DB.sqlite.prepare('SELECT * FROM "'+item.name+'"').all();
  const snapshot={format:'dream-private-d1-checkpoint-v2',schema,rows,sequences:DB.sqlite.prepare('SELECT name,seq FROM sqlite_sequence ORDER BY name').all()};
  const result=verifyCheckpointRestore(snapshot);assert.ok(result.tables>20&&result.sequences&&result.foreignKeys);assert.equal(snapshot.sequences.find(s=>s.name==='spots').seq,9000);
  const corrupt=structuredClone(snapshot);corrupt.rows.trip_participants[0].angler_id='missing-profile';assert.throws(()=>verifyCheckpointRestore(corrupt));
 }finally{DB.close();}
});
