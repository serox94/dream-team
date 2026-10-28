import test from 'node:test';
import assert from 'node:assert/strict';
process.env.CLOUDFLARE_ACCOUNT_ID='0123456789abcdef0123456789abcdef';
const {referencesTarget,requestAllowed,inspect}=await import('../scripts/audit-407032-readonly.mjs');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,base='/accounts/'+account;
const UUID='36f63ef7-2df9-40ed-9a00-000000000001';
const VERSION='cafe1234-5555-4444-8888-123456789abc';
const NAME='dream-team-audit-4070321412132-db';
const SQL="SELECT type,name FROM sqlite_master WHERE name NOT GLOB '_cf_*' AND name NOT GLOB 'sqlite_*' ORDER BY type,name";
test('only the fixed target schema read and named control-plane GETs are allowed',()=>{
 assert.equal(requestAllowed('DELETE',base+'/d1/database/'+UUID,undefined,UUID),false);
 assert.equal(requestAllowed('POST',base+'/d1/database/'+UUID+'/query',{sql:'DELETE FROM trips',params:[]},UUID),false);
 assert.equal(requestAllowed('POST',base+'/d1/database/'+UUID+'/query',{sql:SQL,params:[]},UUID),true);
 assert.equal(requestAllowed('POST',base+'/d1/database/99999999-0000-0000-0000-000000000000/query',{sql:SQL,params:[]},UUID),false);
 assert.equal(requestAllowed('GET',base+'/workers/scripts/dream-team/versions?deployable=true',undefined,UUID),true);
 assert.equal(requestAllowed('GET',base+'/workers/scripts/evil-other/settings',undefined,UUID),false);
});
test('exact target D1 bindings, even retained historical versions, are discovered',()=>{
 assert.equal(referencesTarget([{type:'d1',id:UUID}],UUID),true);
 assert.equal(referencesTarget([{type:'plain_text',text:'recover:'+NAME}],UUID),true);
 assert.equal(referencesTarget([{type:'d1',id:'different'}],UUID),false);
});
function mock({ref=false}={}){
 const calls=[];
 const fetcher=async(url,options)=>{
  const method=options.method,path=new URL(url).pathname+new URL(url).search;
  calls.push({method,path,body:options.body});
  let result;
  if(path.endsWith('/d1/database?per_page=100'))result=[{name:NAME,uuid:UUID,file_size:12288},...Array.from({length:9},(_,i)=>({name:'other-'+i,uuid:'id-'+i}))];
  else if(path.endsWith('/d1/database/'+UUID))result={name:NAME,uuid:UUID,file_size:12288};
  else if(path.endsWith('/workers/scripts'))result=[{id:'dream-team'}];
  else if(path.endsWith('/settings'))result={bindings:ref?[{type:'d1',id:UUID}]:[]};
  else if(path.endsWith('/versions?deployable=true'))result={items:[{id:VERSION}]};
  else if(path.endsWith('/versions/'+VERSION))result={resources:{bindings:ref?[{type:'d1',id:UUID}]:[]}};
  else if(method==='POST'&&path.endsWith('/d1/database/'+UUID+'/query'))result=[{results:[]}];
  else if(path.includes('/r2/buckets/dream-team-d1-backups/objects'))result={objects:[]};
  else if(path.endsWith('/workers/scripts/dream-team/deployments'))result={deployments:[{id:'stable-deployment',versions:[{version_id:'stable-worker',percentage:100}]}]};
  else throw Error('Unexpected request '+method+' '+path);
  return {ok:true,json:async()=>({success:true,result})};
 };
 return {fetcher,calls};
}
test('empty disposable D1 inspection is read-only and never authorizes deletion',async()=>{
 const m=mock(),r=await inspect({fetcher:m.fetcher,account,token:'mock-token'});
 assert.equal(r.result,'PASS');
 assert.equal(r.target.uuid,UUID);
 assert.equal(r.schemaObjectsCount,0);
 assert.equal(r.versionsInspected,1);
 assert.deepEqual(r.activeReferences,[]);
 assert.deepEqual(r.historicalReferences,[]);
 assert.equal(r.operations.targetReadOnlySqlCalls,1);
 assert.equal(r.operations.deleteCalls,0);
 assert.equal(r.operations.productionSqlCalls,0);
 assert.equal(r.safeToDelete,'NOT_AUTHORIZED');
 assert.ok(m.calls.every(c=>c.method==='GET'||(c.method==='POST'&&c.path.endsWith('/d1/database/'+UUID+'/query'))));
});
test('historical references remain visible and block claims of orphan safety',async()=>{
 const m=mock({ref:true}),r=await inspect({fetcher:m.fetcher,account,token:'mock-token'});
 assert.deepEqual(r.activeReferences,['dream-team']);
 assert.deepEqual(r.historicalReferences,[{worker:'dream-team',version:VERSION}]);
 assert.equal(r.safeToDelete,'NOT_AUTHORIZED');
});
test('changed D1 inventory stops before any target SQL query',async()=>{
 const m=mock();const fetcher=async(url,options)=>{
  const x=await m.fetcher(url,options);
  if(url.endsWith('/d1/database?per_page=100'))return {ok:true,json:async()=>({success:true,result:[]})};
  return x;
 };
 await assert.rejects(inspect({fetcher,account,token:'mock-token'}),/D1_CAPACITY_CHANGED/);
 assert.equal(m.calls.filter(c=>c.method==='POST').length,0);
});
