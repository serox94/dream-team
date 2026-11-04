// Private SQL is inspected locally; remote writes are limited to a NEW audit database.
// Restore schema before rows, parents before children, and triggers after rows.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {assertSandbox,query,productionId} from './recovery-common.mjs';
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
async function readQueries(db,execute,queries){
 if(!execute.readBatch){const rows=[];for(const sql of queries)rows.push((await execute(db.uuid,sql)).results);return rows}
 const rows=[];
 for(let offset=0;offset<queries.length;offset+=16){
  const chunk=queries.slice(offset,offset+16),results=await execute.readBatch(db.uuid,chunk);
  check(Array.isArray(results)&&results.length===chunk.length&&results.every(r=>r.success!==false&&Array.isArray(r.results)),'READ_BATCH_FAILED');
  rows.push(...results.map(r=>r.results));
 }
 return rows;
}
export async function restoreSnapshot(db,snapshot,execute=query,plan=restoreStatements(snapshot)){
 assertSandbox(db.name,db.uuid);
 const existing=(await execute(db.uuid,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*'")).results;
 check(existing.length===0,'RESTORE_TARGET_NOT_EMPTY');
 // Each REST request is an implicit transaction. No foreign-key disabling, SQL splitting,
 // automatic retries, source mutations, or multi-statement trigger parsing by the importer.
 const apply=async items=>{try{
  if(execute.batch&&items.length>1)await execute.batch(db.uuid,items.map(item=>item.sql));
  else for(const item of items)await execute(db.uuid,item.sql,item.params||[]);
 }catch(error){const safe=Error('RESTORE_STATEMENT_FAILED');safe.stage=items.length===1?items[0].stage:'BATCH';safe.table=items.length===1?items[0].table:undefined;safe.status=error.status;safe.code=error.code;throw safe;}};
 let pending=[],bytes=0;
 for(const item of plan){
  if(!execute.batch||item.params?.length){if(pending.length){await apply(pending);pending=[];bytes=0}await apply([item]);continue}
  const size=Buffer.byteLength(item.sql)+2;
  if(pending.length&&(pending.length>=20||bytes+size>60000)){await apply(pending);pending=[];bytes=0}
  pending.push(item);bytes+=size;
 }
 if(pending.length)await apply(pending);
 await verifySnapshot(db,snapshot,execute);
 return {tables:snapshot.tables.length,rows:snapshot.tables.reduce((n,t)=>n+t.rows.length,0),triggers:snapshot.schema.filter(s=>s.type==='trigger').length,foreignKeys:true,sequences:true};
}
export async function verifySnapshot(db,snapshot,execute=query){
 const queries=["SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' AND sql IS NOT NULL ORDER BY type,name",
  ...snapshot.tables.map(t=>'SELECT * FROM '+identifier(t.name)),"SELECT name,seq FROM sqlite_sequence WHERE name NOT GLOB '_cf_*' ORDER BY name",'PRAGMA foreign_key_check','PRAGMA quick_check'];
 const results=await readQueries(db,execute,queries);let index=0;
 check(rowsDigest(results[index++])===rowsDigest(snapshot.schema),'RESTORED_SCHEMA_MISMATCH');
 for(const table of snapshot.tables)check(rowsDigest(results[index++])===rowsDigest(table.rows),'RESTORED_ROWS_MISMATCH');
 check(rowsDigest(results[index++])===rowsDigest(snapshot.sequences),'RESTORED_SEQUENCE_MISMATCH');
 check(results[index++].length===0,'RESTORED_FOREIGN_KEYS');
 check(results[index][0].quick_check==='ok','RESTORED_INTEGRITY');
}

// Caller must hold a verified write barrier while capturing and verifying this view.
export async function captureSnapshot(db,execute=query,{productionRead=false}={}){
 if(productionRead)check(db.name==='dream-team-db'&&db.uuid===productionId,'INVALID_PRODUCTION_READ_TARGET');else assertSandbox(db.name,db.uuid);
 const read=async sql=>(await execute(db.uuid,sql)).results;
 const schema=await read("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' AND sql IS NOT NULL ORDER BY type,name");
 const remaining=new Map(),definitions=schema.filter(r=>r.type==='table');
 const data=await readQueries(db,execute,definitions.flatMap(row=>['PRAGMA table_xinfo('+identifier(row.name)+')','PRAGMA foreign_key_list('+identifier(row.name)+')','SELECT * FROM '+identifier(row.name)]));
 for(let index=0;index<definitions.length;index++){
  const row=definitions[index],[columns,parents,rows]=data.slice(index*3,index*3+3);
  remaining.set(row.name,{name:row.name,sql:row.sql,columns:columns.filter(c=>c.hidden===0).map(c=>c.name),parents:[...new Set(parents.map(f=>f.table))],rows});
 }
 const tables=[];
 while(remaining.size){const ready=[...remaining.values()].filter(t=>t.parents.every(p=>p===t.name||tables.some(o=>o.name===p)));check(ready.length>0,'UNSUPPORTED_FK_CYCLE');for(const t of ready){tables.push(t);remaining.delete(t.name);}}
 const hasSequences=(await read("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'")).length>0;
 const snapshot={schema,tables,sequences:hasSequences?await read("SELECT name,seq FROM sqlite_sequence WHERE name NOT GLOB '_cf_*' ORDER BY name"):[]};
 await verifySnapshot(db,snapshot,execute);
 return snapshot;
}
