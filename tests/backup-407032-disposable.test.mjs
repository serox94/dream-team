import test from 'node:test';
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
const {TARGET,keys,assertExactEmptySource,localEmptyRestore}=await import('../scripts/backup-407032-disposable.mjs');
const evidence={result:'PASS',mode:'TARGETED_READ_ONLY',target:TARGET,d1Count:10,schemaObjects:[],schemaObjectsCount:0,activeReferences:[],historicalReferences:[],versionsInspected:271,productionWorker:'81f011a2-ba96-4bdf-b199-10e89f8271e4',operations:{deleteCalls:0,productionSqlCalls:0}};
test('exact empty source and all 271 historical versions required',()=>{
 assert.doesNotThrow(()=>assertExactEmptySource(evidence));
 for(const bad of [
  {target:{...TARGET,uuid:'wrong'}},{schemaObjectsCount:1},{activeReferences:['one']},
  {historicalReferences:[{worker:'previous',version:'one'}]},{versionsInspected:0},
  {productionWorker:'unexpected'},{d1Count:9}
 ])assert.throws(()=>assertExactEmptySource({...evidence,...bad}));
});
test('private backup paths include pinned disposable name and immutable run number',()=>{
 assert.deepEqual(keys('123456789'),{prefix:'private-releases/stale-d1/4070321412132/123456789/',sql:'private-releases/stale-d1/4070321412132/123456789/schema.sql',receipt:'private-releases/stale-d1/4070321412132/123456789/receipt.json'});
 assert.throws(()=>keys('../etc'));
});
test('SQLite restore is actually attempted, accepts empty export, checks integrity',()=>{
 assert.deepEqual(localEmptyRestore(Buffer.from('-- empty D1 user schema\nPRAGMA foreign_keys=OFF;\n')),{schemaObjects:0,rows:0,foreignKeys:'PASS',integrity:'PASS',restoreMethod:'LOCAL_SQLITE'});
 assert.throws(()=>localEmptyRestore(Buffer.from('CREATE TABLE sneaky(id INTEGER);')),/BACKUP_RESTORE_SCHEMA_MISMATCH/);
 assert.throws(()=>localEmptyRestore(Buffer.from('NOT SQLite;')));
});
