// Private SQL is inspected locally; remote writes are limited to a NEW audit database.
// Restore schema before rows, parents before children, and triggers after rows.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {assertSandbox,query} from './recovery-common.mjs';
const check=(ok,code)=>{if(!ok)throw Error(code);};
// D1: SQL statements <=100 KB, string/BLOB/row <=2 MB and <=100 bind parameters.
// Use a conservative SQL ceiling; long TEXT goes into REST query params, not SQL literals.
const RESTORE_SQL_BYTES=75000,RESTORE_VALUE_BYTES=2000000;
export const identifier=name=>'"'+name.replaceAll('"','""')+'"';
const canonical=value=>value instanceof Uint8Array?Array.from(value):value;
export const rowsDigest=rows=>createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,canonical(row[key])])))).sort())).digest('hex');
const literal=value=>value===null?'NULL':typeof value==='string'?`CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`:value instanceof Uint8Array?`X'${Buffer.from(value).toString('hex')}'`:typeof value==='number'&&Number.isFinite(value)?String(value):(()=>{throw Error('UNSUPPORTED_SQL_VALUE');})();
export function inspectSql(bytes){
 const db=new DatabaseSync(':memory:',{enableForeignKeyConstraints:false});
 try{
  db.exec(bytes.toString());check(db.prepare('PRAGMA foreign_key_check').all().length===0,'CHECKPOINT_FOREIGN_KEYS');
  check(db.prepare('PRAGMA integrity_check').get().integrity_check==='ok','CHECKPOINT_INTEGRITY');
  const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' AND sql IS NOT NULL ORDER BY type,name").all();
  const tables=schema.filter(row=>row.type==='table').map(row=>({name:row.name,sql:row.sql,columns:db.prepare('PRAGMA table_xinfo('+identifier(row.name)+')').all().filter(c=>c.hidden===0).map(c=>c.name),parents:[...new Set(db.prepare('PRAGMA foreign_key_list('+identifier(row.name)+')').all().map(f=>f.table))],rows:db.prepare('SELECT * FROM '+identifier(row.name)).all()}));
  const sequences=db.prepare("SELECT name,seq FROM sqlite_sequence WHERE name NOT GLOB '_cf_*' ORDER BY name").all();
  const ordered=[],remaining=new Map(tables.map(t=>[t.name,t]));
  while(remaining.size){const ready=[...remaining.values()].filter(t=>t.parents.every(p=>p===t.name||ordered.some(o=>o.name===p)));check(ready.length>0,'UNSUPPORTED_FK_CYCLE');for(const t of ready){ordered.push(t);remaining.delete(t.name);}}
  return {schema,tables:ordered,sequences};
 }finally{db.close();}
}
export function restoreStatements(snapshot){
 const statements=snapshot.tables.map(t=>({stage:'schema',table:t.name,sql:t.sql}));
 for(const table of snapshot.tables){
  const prefix='INSERT INTO '+identifier(table.name)+' ('+table.columns.map(identifier).join(',')+') VALUES ';
  let values=[],size=Buffer.byteLength(prefix),batches=0;
  const flush=()=>{if(values.length){statements.push({stage:'rows',table:table.name,sql:prefix+values.join(',')+';'});values=[];size=Buffer.byteLength(prefix);batches++;}};
  for(const row of table.rows){
   const value='('+table.columns.map(c=>literal(row[c])).join(',')+')';
   if(Buffer.byteLength(prefix+value)>=RESTORE_SQL_BYTES){
    // The export's HEX form of long TEXT is roughly 2x its real size. Keep the
    // original string byte-for-byte as a bound value, including UTF-8 and NUL.
    // BLOBs remain HEX literals to preserve their exact SQLite type over REST.
    flush();const params=[];
    const terms=table.columns.map(c=>{
     const cell=row[c];
     if(typeof cell!=='string')return literal(cell);
     check(Buffer.byteLength(cell)<=RESTORE_VALUE_BYTES,'ROW_EXCEEDS_D1_VALUE_LIMIT');
     params.push(cell);return '?';
    });
    const sql=prefix+'('+terms.join(',')+');';
    check(Buffer.byteLength(sql)<RESTORE_SQL_BYTES,'OVERSIZE_NON_TEXT_RESTORE_LIMIT');
    check(params.length<=100,'RESTORE_BOUND_PARAMETER_LIMIT');
    check(Buffer.byteLength(JSON.stringify({sql,params}))<=RESTORE_VALUE_BYTES,'ROW_EXCEEDS_D1_VALUE_LIMIT');
    statements.push({stage:'rows',table:table.name,sql,params});batches++;continue;
   }
   if(size+Buffer.byteLength(value)+1>=RESTORE_SQL_BYTES||values.length>=50)flush();
   values.push(value);size+=Buffer.byteLength(value)+1;
  }
  flush();check(!table.parents.includes(table.name)||batches<=1,'SELF_FK_REQUIRES_SINGLE_BATCH');
 }
 statements.push({stage:'sequences',sql:'DELETE FROM sqlite_sequence;'});
 for(const row of snapshot.sequences)statements.push({stage:'sequences',sql:'INSERT INTO sqlite_sequence(name,seq) VALUES('+literal(row.name)+','+literal(row.seq)+');'});
 for(const object of snapshot.schema.filter(o=>o.type!=='table').sort((a,b)=>['index','view','trigger'].indexOf(a.type)-['index','view','trigger'].indexOf(b.type)))statements.push({stage:object.type,table:object.tbl_name,sql:object.sql});
 return statements;
}
export async function restoreSnapshot(db,snapshot,execute=query,plan=restoreStatements(snapshot)){
 assertSandbox(db.name,db.uuid);
 const existing=(await execute(db.uuid,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*'")).results;
 check(existing.length===0,'RESTORE_TARGET_NOT_EMPTY');
 // Each REST request is an implicit transaction. No foreign-key disabling, SQL splitting,
 // automatic retries, source mutations, or multi-statement trigger parsing by the importer.
 for(const item of plan)try{await execute(db.uuid,item.sql,item.params||[]);}catch(error){const safe=Error('RESTORE_STATEMENT_FAILED');safe.stage=item.stage;safe.table=item.table;safe.status=error.status;safe.code=error.code;throw safe;}
 await verifySnapshot(db,snapshot,execute);
 return {tables:snapshot.tables.length,rows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),triggers:snapshot.schema.filter(s=>s.type==='trigger').length,foreignKeys:true,sequences:true};
}
export async function verifySnapshot(db,snapshot,execute=query){
 const read=async(stage,sql,table)=>{try{return await execute(db.uuid,sql);}catch(error){error.stage=stage;error.table=table;throw error;}};
 const schema=(await read('verify-schema',"SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' AND sql IS NOT NULL ORDER BY type,name")).results;
 check(rowsDigest(schema)===rowsDigest(snapshot.schema),'RESTORED_SCHEMA_MISMATCH');
 for(const table of snapshot.tables){const rows=(await read('verify-rows','SELECT * FROM '+identifier(table.name),table.name)).results;check(rowsDigest(rows)===rowsDigest(table.rows),'RESTORED_ROWS_MISMATCH');}
 const sequences=(await read('verify-sequences',"SELECT name,seq FROM sqlite_sequence WHERE name NOT GLOB '_cf_*' ORDER BY name")).results;
 check(rowsDigest(sequences)===rowsDigest(snapshot.sequences),'RESTORED_SEQUENCE_MISMATCH');
 check((await read('verify-FK','PRAGMA foreign_key_check')).results.length===0,'RESTORED_FOREIGN_KEYS');
 // D1 supports quick_check, not SQLite's full integrity_check (which is used locally).
 check((await read('verify-quick-check','PRAGMA quick_check')).results[0].quick_check==='ok','RESTORED_INTEGRITY');
}
