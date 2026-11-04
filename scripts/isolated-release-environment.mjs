// Own exactly one newly-created audit database. Never adopt or delete an existing DB.
import {cf} from './recovery-common.mjs';
import {identifier,restoreSnapshot} from './d1-snapshot.mjs';
const check=(v,c)=>{if(!v)throw Error(c)};
export function safeProviderFailure(error){
 return {error:/^[A-Z0-9_]+$/.test(error?.message||'')?error.message:'OPERATION_FAILED',
  ...(Number.isInteger(error?.status)?{httpStatus:error.status}:{}),
  ...(Number.isInteger(error?.code)||/^[A-Z0-9_]+$/.test(String(error?.code||''))?{cloudflareCode:error.code}:{}),
  ...(/^[A-Z0-9_]{1,64}$/.test(error?.operation||'')?{operation:error.operation}:{})};
}
export async function createIsolatedReleaseEnvironment({runId,request=cf,capacity=10}){
 check(/^\d+$/.test(runId||'')&&capacity===10,'INVALID_SANDBOX_CONTEXT');
 const name=`dream-team-audit-${runId}-db`;
 const existing=[];
 for(let page=1;;page++){
  check(page<=100,'DATABASE_DISCOVERY_LIMIT');
  const rows=await request(`/d1/database?per_page=100&page=${page}`);
  check(Array.isArray(rows),'DATABASE_DISCOVERY_FAILED');existing.push(...rows);
  if(rows.length<100)break;
 }
 check(!existing.some(db=>db.name===name),'SANDBOX_ALREADY_EXISTS');
 check(existing.length<capacity,'D1_CAPACITY_EXHAUSTED');
 let created;
 try{created=await request('/d1/database','POST',{name})}catch(e){e.operation='D1_CREATE';throw e}
 check(created?.name===name&&/^[a-f0-9-]{36}$/i.test(created.uuid||''),'SANDBOX_IDENTITY_MISMATCH');
 const database={name,uuid:created.uuid};let disposed=false;
 const assertOwned=async()=>{
  check(!disposed,'SANDBOX_DISPOSED');
  const actual=await request('/d1/database/'+database.uuid);
  check(actual.uuid===database.uuid&&actual.name===name,'SANDBOX_IDENTITY_MISMATCH');
 };
 const execute=async(id,sql,params=[])=>{
  check(id===database.uuid&&!disposed,'NOT_OWNED_SANDBOX');
  return (await request('/d1/database/'+id+'/query','POST',{sql,params}))[0];
 };
 return {database,databasesBefore:existing.length,execute,assertOwned,
  async restore(snapshot){
   await assertOwned();
   // This reset is confined to the DB successfully created above in this process.
   const schema=(await execute(database.uuid,"SELECT type,name FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' AND sql IS NOT NULL")).results;
   for(const type of ['trigger','view','index'])for(const row of schema.filter(r=>r.type===type))await execute(database.uuid,`DROP ${type.toUpperCase()} ${identifier(row.name)}`);
   const remaining=new Set(schema.filter(r=>r.type==='table').map(r=>r.name));
   // Use the current FK graph, including tables added by a failed migration.
   const parents=new Map();
   for(const table of remaining)parents.set(table,new Set((await execute(database.uuid,'PRAGMA foreign_key_list('+identifier(table)+')')).results.map(r=>r.table).filter(p=>p!==table)));
   while(remaining.size){
    const children=[...remaining].filter(name=>![...remaining].some(other=>other!==name&&parents.get(other).has(name)));
    check(children.length>0,'SANDBOX_FK_CYCLE');
    for(const table of children){await execute(database.uuid,'DROP TABLE '+identifier(table));remaining.delete(table)}
   }
   await restoreSnapshot(database,snapshot,execute);
  },
  async cleanup(){
   if(disposed)return {result:'ALREADY_CLEANED'};
   await assertOwned();await request('/d1/database/'+database.uuid,'DELETE');disposed=true;
   try{await request('/d1/database/'+database.uuid);throw Error('SANDBOX_DELETE_NOT_VERIFIED')}catch(e){if(e.status!==404)throw e}
   return {result:'PASS'};
  }
 };
}
