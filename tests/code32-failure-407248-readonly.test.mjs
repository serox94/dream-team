import test from 'node:test';
import assert from 'node:assert/strict';
const {TARGET,RUN,sqlAllowed,readAllowed,classifyState,inspect}=await import('../scripts/code32-failure-407248-readonly.mjs');
const account='0123456789abcdef0123456789abcdef',uuid='f1c3776c-841e-4185-8600-bc92711cd268',base='/accounts/'+account;
const schema="SELECT name,type FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY type,name";
test('exactly scoped GET and fixed read-only SQLite statements',()=>{
 assert.equal(sqlAllowed(schema),true);
 assert.equal(sqlAllowed('SELECT COUNT(*) AS n FROM "app_settings"'),true);
 assert.equal(sqlAllowed("SELECT value FROM app_settings WHERE key='schema_version'"),true);
 for(const sql of ['DELETE FROM users','PRAGMA writable_schema=ON','SELECT * FROM user_sessions','SELECT COUNT(*) AS n FROM "x"; DROP TABLE trips'])
  assert.equal(sqlAllowed(sql),false);
 assert.equal(readAllowed('DELETE',base+'/d1/database/'+uuid,undefined,uuid,account),false);
 assert.equal(readAllowed('POST',base+'/workers/scripts/dream-team/deployments',{},uuid,account),false);
 assert.equal(readAllowed('GET',base+'/d1/database/'+uuid,undefined,uuid,account),true);
});
test('incomplete release resources never imply a proven phase',()=>{
 const f=classifyState({tables:37,rows:2910,objects:[{name:'schema32.sql'}],buckets:[]});
 assert.equal(f.snapshotSqlInR2,true);
 assert.equal(f.receiptInR2,false);
 assert.equal(f.exactFailurePhase,'NOT_PROVEN_BY_METADATA');
});
function mock(){
 const calls=[];
 const fetcher=async(url,opts)=>{
  const u=new URL(url),path=u.pathname+u.search;const method=opts.method;calls.push({method,path,sql:method==='POST'?JSON.parse(opts.body).sql:null});
  let result;
  if(path.endsWith('/d1/database?per_page=100'))result=[{name:TARGET,uuid,file_size:1867776},...Array.from({length:9},(_,i)=>({name:'other'+i,uuid:'other'+i}))];
  else if(path.endsWith('/d1/database/'+uuid))result={name:TARGET,uuid,file_size:1867776};
  else if(path.endsWith('/workers/scripts/dream-team/deployments'))result={deployments:[{id:'old',versions:[{version_id:'81f011a2-ba96-4bdf-b199-10e89f8271e4',percentage:100}]}]};
  else if(path.endsWith('/workers/scripts/dream-team/settings'))result={bindings:[]};
  else if(method==='POST'&&path.endsWith('/d1/database/'+uuid+'/query')){
   const sql=JSON.parse(opts.body).sql;
   result=[{results:sql===schema?[{name:'trips',type:'table'},{name:'app_settings',type:'table'}]:
    sql.startsWith('SELECT COUNT')?[{n:sql.includes('trips')?5:7}]:[{value:'32'}]}];
  }else if(path.includes('/r2/buckets/dream-team-d1-backups/objects'))result={objects:[{key:'private-releases/code32/40724851849-179da4d9/schema32.sql',size:100}]};
  else if(path.endsWith('/r2/buckets?per_page=1000'))result={buckets:[]};
  else if(path.endsWith('/workers/scripts'))result=[{id:'dream-team'}];
  else throw Error('Unexpected '+method+' '+path);
  return {ok:true,json:async()=>({success:true,result})};
 };
 return {fetcher,calls};
}
test('live flow checks UUID, production, schema counts, R2 without writes',async()=>{
 const m=mock(),r=await inspect({account,token:'fake-token',fetcher:m.fetcher});
 assert.equal(r.result,'PASS');assert.equal(r.tableCount,2);assert.equal(r.totalUserRows,12);
 assert.equal(r.schemaVersion,'32');assert.equal(r.findings.snapshotSqlInR2,true);
 assert.equal(r.findings.exactFailurePhase,'NOT_PROVEN_BY_METADATA');
 assert.ok(m.calls.every(c=>c.method==='GET'||(c.method==='POST'&&c.path.includes('/d1/database/'+uuid+'/query')&&sqlAllowed(c.sql))));
 assert.equal(r.limits.databaseDeletes,0);assert.equal(r.limits.productionSqlQueries,0);
});
test('rejects incorrect target identity before SQL',async()=>{
 const m=mock();
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/d1/database?per_page=100'))return {ok:true,json:async()=>({success:true,result:[{name:'different',uuid}]})};
  return m.fetcher(url,opts);
 };
 await assert.rejects(inspect({account,token:'fake-token',fetcher}),/D1_LIST_MOVED/);
 assert.equal(m.calls.length,0);
});
