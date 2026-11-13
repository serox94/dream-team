// Database-enforced DML fence for owned audit DBs. No claim about external/R2 writers.
import {assertSandbox} from './recovery-common.mjs';import {identifier} from './d1-snapshot.mjs';import {createHash} from 'node:crypto';
const check=(v,c)=>{if(!v)throw Error(c)};
export async function acquireD1Fence(database,execute){
 assertSandbox(database.name,database.uuid);
 const tables=(await execute(database.uuid,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY name")).results;
 check(tables.length>0,'FENCE_TABLES_REQUIRED');const triggers=[];
 for(const {name} of tables)for(const operation of ['INSERT','UPDATE','DELETE']){
  const trigger='release_fence_'+createHash('sha256').update(name+':'+operation).digest('hex').slice(0,24);
  const sql=`CREATE TRIGGER ${identifier(trigger)} BEFORE ${operation} ON ${identifier(name)} BEGIN SELECT RAISE(ABORT,'RELEASE_WRITE_FENCED'); END`;
  triggers.push({name:trigger,sql});
 }
 if(execute.batch)await execute.batch(database.uuid,triggers.map(t=>t.sql));else for(const t of triggers)await execute(database.uuid,t.sql);
 const verify=async()=>{
  const current=(await execute(database.uuid,"SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'release_fence_%'")).results;
  check(current.length===triggers.length&&triggers.every(t=>current.some(c=>c.name===t.name&&c.sql.trim().replace(/;$/,'')===t.sql)),'D1_FENCE_NOT_VERIFIED');
  const now=(await execute(database.uuid,"SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY name")).results;
  check(JSON.stringify(now)===JSON.stringify(tables),'FENCE_SCHEMA_CHANGED');return {result:'PASS',tables:tables.length};
 };
 await verify();
 return {verify,async release(){const sql=triggers.map(t=>'DROP TRIGGER '+identifier(t.name));if(execute.batch)await execute.batch(database.uuid,sql);else for(const statement of sql)await execute(database.uuid,statement)}};
}
// Existing application has R2/media and background writers without an enforceable
// shared admission/epoch protocol. Neither HTTP 503 nor elapsed time proves drain.
export function requireProductionWriteFence(){throw Error('ALL_WRITERS_FENCE_NOT_PROVEN')}
