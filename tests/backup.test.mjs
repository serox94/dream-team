import test from 'node:test';
import assert from 'node:assert/strict';
import {exportD1} from '../backup/export.mjs';

for(const shape of ['documented schema','Workflow example'])test(`daily backup handles ${shape} and stores a nonempty SQL file in R2`,async()=>{
 const calls=[],stored=[];
 const env={CLOUDFLARE_ACCOUNT_ID:'account',DREAM_TEAM_DATABASE_ID:'database',D1_EXPORT_TOKEN:'test-secret',BACKUP_BUCKET:{async put(...args){stored.push(args);return {size:84};}}};
 const step={async do(_name,task){return task();}};
 const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url==='https://download.example/export.sql')return new Response('CREATE TABLE catches(id INTEGER);');
  const body=JSON.parse(options.body);
  return Response.json({success:true,result:body.output_format?{at_bookmark:'bookmark-1'}:shape==='documented schema'?{status:'complete',result:{signed_url:'https://download.example/export.sql'}}:{signed_url:'https://download.example/export.sql'}});
 };
 const result=await exportD1(env,step,fetcher,()=>new Date('2026-09-28T03:17:00Z'));
 assert.equal(calls.length,3);
 assert.deepEqual(calls.slice(0,2).map(x=>JSON.parse(x.options.body)),[{output_format:'polling'},{current_bookmark:'bookmark-1'}]);
 assert.ok(calls.slice(0,2).every(x=>x.options.headers.authorization==='Bearer test-secret'));
 assert.match(result.key,/^dream-team-db\/2026-09-28T03-17-00-000Z-.+\.sql$/);
 assert.equal(result.size,84);assert.equal(stored[0][0],result.key);
 assert.equal(stored[0][2].customMetadata.bookmark,'bookmark-1');
});
test('backup never writes an empty or unconfirmed export',async()=>{
 const env={CLOUDFLARE_ACCOUNT_ID:'account',DREAM_TEAM_DATABASE_ID:'database',D1_EXPORT_TOKEN:'test-secret',BACKUP_BUCKET:{put(){throw Error('should not upload');}}};
 const step={async do(_name,task){return task();}};
 await assert.rejects(exportD1(env,step,async()=>Response.json({success:false,result:{at_bookmark:'x'}})),/confirm success/);
 await assert.rejects(exportD1(env,step,async()=>Response.json({success:true,result:{}})),/bookmark not ready/);
 await assert.rejects(exportD1(env,step,async()=>Response.json({success:true,result:{at_bookmark:'x',status:'error',error:'failure'}})),/export failed/);
});
