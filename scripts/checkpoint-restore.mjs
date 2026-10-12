// Reconstruct a private checkpoint in disposable memory. Never prints row contents.
import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
const digest=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])))).sort())).digest('hex');
export function verifyCheckpointRestore(checkpoint){
 assert.equal(checkpoint.format,'dream-private-d1-checkpoint-v2');const db=new DatabaseSync(':memory:');
 const schema=checkpoint.schema.filter(item=>!item.name.startsWith('sqlite_')&&!item.name.startsWith('_cf_'));
 try{
  db.exec('PRAGMA foreign_keys=OFF');
  for(const item of schema.filter(item=>item.type==='table'))db.exec(item.sql);
  for(const [table,rows] of Object.entries(checkpoint.rows)){
   assert.match(table,/^[a-zA-Z0-9_]+$/);
   for(const row of rows){const columns=Object.keys(row);for(const column of columns)assert.match(column,/^[a-zA-Z0-9_]+$/);const sql='INSERT INTO "'+table+'" ('+columns.map(c=>'"'+c+'"').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')';db.prepare(sql).run(...columns.map(c=>row[c]));}
  }
  if(checkpoint.sequences.length){db.exec('DELETE FROM sqlite_sequence');for(const row of checkpoint.sequences)db.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES(?,?)').run(row.name,row.seq);}
  for(const item of schema.filter(item=>item.type!=='table').sort((a,b)=>['index','view','trigger'].indexOf(a.type)-['index','view','trigger'].indexOf(b.type)))db.exec(item.sql);
  db.exec('PRAGMA foreign_keys=ON');assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  for(const [table,rows] of Object.entries(checkpoint.rows))assert.equal(digest(db.prepare('SELECT * FROM "'+table+'"').all()),digest(rows),'restored table digest: '+table);
  assert.equal(digest(db.prepare("SELECT name,seq FROM sqlite_sequence ORDER BY name").all()),digest(checkpoint.sequences),'autoincrement state');
  return {tables:Object.keys(checkpoint.rows).length,rows:Object.values(checkpoint.rows).reduce((n,rows)=>n+rows.length,0),foreignKeys:true,sequences:true};
 }finally{db.close();}
}
