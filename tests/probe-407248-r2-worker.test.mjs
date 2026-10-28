import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedApi,metadataBindings,verifyR2Bindings,assertEmptyBucket,probe,MEDIA,ARCHIVE,SOURCE_WORKER} from '../scripts/probe-407248-r2-worker.mjs';

const account='0123456789abcdef0123456789abcdef',run='40730000001';
const name='dream-team-audit-'+run+'-io',base='/accounts/'+account;
test('only exact new worker mutation and two test bucket GETs are allowed',()=>{
 const allowed=p=>allowedApi({method:p.method,path:base+p.path,account,name});
 assert.equal(allowed({method:'PUT',path:'/workers/scripts/'+name}),true);
 assert.equal(allowed({method:'DELETE',path:'/workers/scripts/'+name}),true);
 assert.equal(allowed({method:'POST',path:'/workers/scripts/'+name+'/subdomain'}),true);
 for(const pair of [
  {method:'DELETE',path:'/workers/scripts/dream-team'},
  {method:'DELETE',path:'/d1/database/ee58d26e-26f9-4f25-bbe9-944d6fa91c56'},
  {method:'PUT',path:'/r2/buckets/dream-team-media/objects'},
  {method:'POST',path:'/d1/database'},
  {method:'GET',path:'/r2/buckets/dream-team-media/objects?per_page=100'}
 ])assert.equal(allowed(pair),false,JSON.stringify(pair));
});
test('bindings explicitly contain only two approved test buckets, no D1',()=>{
 const key='a'.repeat(64),bindings=metadataBindings(MEDIA,ARCHIVE,key);
 verifyR2Bindings(bindings);
 assert.throws(()=>metadataBindings('dream-team-media',ARCHIVE,key),/ONLY_APPROVED_TEST_BUCKETS/);
 assert.throws(()=>verifyR2Bindings([...bindings,{type:'d1',name:'DB',id:'protected'}]),/NO_D1_BINDINGS_ALLOWED/);
 assert.throws(()=>verifyR2Bindings([...bindings,{type:'r2_bucket',name:'OTHER',bucket_name:'dream-team-media'}]),/DISALLOWED_R2_BINDING/);
 assert.doesNotThrow(()=>assertEmptyBucket({objects:[]}));
 assert.throws(()=>assertEmptyBucket({objects:[{key:'original'}]}),/TEST_BUCKET_NOT_EMPTY/);
});
function simulate({failPhase=null,sourceHasData=false}={}){
 const calls=[],state={created:false,manifest:false};
 const fetcher=async(url,opts)=>{
  const u=new URL(url),method=opts.method,path=u.pathname.replace(/^\/client\/v4/,'')+u.search;
  calls.push({host:u.host,method,path});
  if(!u.host.startsWith('api.cloudflare.com')){
   if(failPhase==='READY'&&path==='/ready')return {ok:false,status:503,json:async()=>({ok:false,error:'RECOVERY_FAILED'})};
   if(path==='/ready')return {ok:true,status:200,json:async()=>({ok:true,bindingsReady:true})};
   if(path==='/backup'){
    if(failPhase==='BACKUP')return {ok:false,status:500,json:async()=>({ok:false,error:'RECOVERY_FAILED'})};
    state.manifest=true;
    return {ok:true,status:200,json:async()=>({ok:true,objects:0,manifestSha256:'a'.repeat(64)})};
   }
  }
  const endpoint=(path===base+'/workers/scripts/'+name);
  let result={};
  if(path===base+'/workers/scripts/dream-team/deployments')result={deployments:[{id:'old-production-deployment',versions:[{version_id:SOURCE_WORKER,percentage:100}]}]};
  else if(path===base+'/workers/scripts'&&method==='GET')result=state.created?[{id:name}]:[{id:'dream-team'}];
  else if(path===base+'/r2/buckets?per_page=1000')result={buckets:[{name:MEDIA},{name:ARCHIVE}]};
  else if(path===base+'/r2/buckets/'+MEDIA+'/objects?per_page=100')result={objects:sourceHasData?[{key:'do-not-touch'}]:[]};
  else if(path===base+'/r2/buckets/'+ARCHIVE+'/objects?per_page=100')result={objects:state.manifest?[{key:'manifest.json',size:42}]:[]};
  else if(path===base+'/workers/scripts/'+name+'/settings')result={bindings:metadataBindings(MEDIA,ARCHIVE,'a'.repeat(64))};
  else if(path===base+'/workers/subdomain')result={subdomain:'fake-account'};
  else if(endpoint&&method==='PUT'){
   if(failPhase==='UPLOAD')return {ok:false,status:400,json:async()=>({success:false,errors:[{code:10021}]})};
   state.created=true;
  }else if(path===base+'/workers/scripts/'+name+'/subdomain'&&method==='POST'){}
  else if(endpoint&&method==='DELETE')state.created=false;
  else throw Error('unexpected '+method+' '+path);
  return {ok:true,status:200,json:async()=>({success:true,result})};
 };
 return {fetcher,state,calls};
}
test('empty two-bucket flow writes archive manifest, then deletes only temporary Worker',async()=>{
 const m=simulate();
 const r=await probe({run,account,token:'test-token',fetcher:m.fetcher,pause:async()=>{}});
 assert.equal(r.result,'PASS');assert.equal(r.cleanup.temporaryWorkerRemoved,true);
 assert.equal(r.cleanup.deleteAttempts,1);assert.equal(r.backupResult.manifestWrittenToApprovedArchive,true);
 assert.equal(m.state.created,false);assert.equal(m.state.manifest,true);
 assert.equal(r.operations.workerDeletes,1);
 assert.equal(r.operations.productionR2Writes,0);
 assert.equal(m.calls.filter(c=>c.method==='DELETE').length,1);
});
test('an upload API failure is phase-specific and no DELETE is fabricated',async()=>{
 const m=simulate({failPhase:'UPLOAD'});
 const r=await probe({run,account,token:'test-token',fetcher:m.fetcher});
 assert.equal(r.result,'BLOCKED');assert.equal(r.failure.phase,'WORKER_UPLOAD');
 assert.equal(r.failure.httpStatus,400);assert.equal(r.failure.cloudflareCode,10021);
 assert.equal(r.cleanup.temporaryWorkerRemoved,true);assert.equal(r.cleanup.deleteAttempts,0);
 assert.equal(m.state.created,false);
});
test('a failed backup cleans up the temporary worker without deleting test buckets',async()=>{
 const m=simulate({failPhase:'BACKUP'});
 const r=await probe({run,account,token:'test-token',fetcher:m.fetcher});
 assert.equal(r.result,'BLOCKED');assert.equal(r.failure.phase,'EMPTY_MEDIA_BACKUP');
 assert.equal(r.failure.httpStatus,500);assert.equal(r.failure.safeWorkerCode,'RECOVERY_FAILED');
 assert.equal(r.cleanup.temporaryWorkerRemoved,true);assert.equal(m.state.created,false);
 assert.equal(m.calls.filter(c=>c.method==='DELETE').length,1);
});
test('nonempty target stops before Worker upload',async()=>{
 const m=simulate({sourceHasData:true});
 const r=await probe({run,account,token:'test-token',fetcher:m.fetcher});
 assert.equal(r.result,'BLOCKED');assert.equal(r.failure.phase,'PRECHECK');
 assert.equal(m.calls.filter(c=>c.method==='PUT').length,0);
 assert.equal(m.calls.filter(c=>c.method==='DELETE').length,0);
});
