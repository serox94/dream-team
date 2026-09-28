import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function database({through="9999"}={}){
 const db=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql') && f.slice(0,4)<=through).sort())db.exec(readFileSync(new URL('../migrations/'+f,import.meta.url),'utf8'));
 const wrap=(sql,args=[])=>({bind(...next){return wrap(sql,next);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const r=db.prepare(sql).run(...args);return {success:true,meta:{last_row_id:Number(r.lastInsertRowid),changes:r.changes}};}});
 return {sqlite:db,prepare:sql=>wrap(sql),async batch(stmts){db.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}},close(){db.close();}};
}
