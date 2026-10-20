// Operational helpers: private bound SQL never contains a plaintext password.
const check=(ok,code)=>{if(!ok)throw Error(code);};
export function wrapLocal(db){
 const prepare=(sql,args=[])=>({bind(...next){return prepare(sql,next);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};}});
 return {prepare:sql=>prepare(sql),async batch(stmts){db.exec('BEGIN');try{const out=[];for(const statement of stmts)out.push(await statement.run());db.exec('COMMIT');return out;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
const sqlLiteral=value=>value===null?'NULL':typeof value==='number'?String(value):"CAST(X'"+Buffer.from(value).toString('hex')+"' AS TEXT)";
export function insertSql(db,table,key,value){const rows=db.prepare('SELECT * FROM "'+table+'" WHERE "'+key+'"=?').all(value);check(rows.length===1,'INITIALIZATION_ROW_COUNT');const row=rows[0];return 'INSERT INTO "'+table+'" ('+Object.keys(row).map(k=>'"'+k+'"').join(',')+') VALUES ('+Object.values(row).map(sqlLiteral).join(',')+');';}

// A private data restore proof remains valid across documentation/test-only commits.
// Every runtime, migration, dependency and workflow change requires a new proof.
export function assertPreparedFiles(files){
 for(const file of files)check(/^(?:tests\/|scripts\/(?:qa-astra-browser|qa-offline-ready|responsive-qa)\.mjs$|DREAMTEAM_AUDIT_FIXES_REPORT\.md$)/.test(file),'PREFLIGHT_RUNTIME_CHANGED');
 return true;
}
