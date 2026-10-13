import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import {serve} from '../scripts/qa-server.mjs';
const wait=async fn=>{const until=Date.now()+6000;while(!fn()){if(Date.now()>until)throw Error('queue did not finish');await new Promise(r=>setTimeout(r,10));}};
async function fixture(){
 const server=await serve(),dom=new JSDOM('<body></body>',{url:server.url,runScripts:'outside-only'}),w=dom.window;w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.confirm=()=>true;const statuses=[],native=async(path,options)=>fetch(server.url+path,options);w.fetch=native;
 w.eval(await readFile('public/dream-core.js','utf8'));w.DREAM_MODEL=await w.Dream.api('/api/bootstrap');
 const item=(await w.Dream.api('/api/checklist',{method:'POST',body:JSON.stringify({tripId:'next-trip',category:'sprzęt',label:'order fixture',packed:false})})).id;
 const spot=(await w.Dream.api('/api/spots',{method:'POST',body:JSON.stringify({tripId:'next-trip',name:'order spot',depthM:1})})).id;
 await w.Dream.api('/api/checklist?tripId=next-trip');await w.Dream.api('/api/spots?tripId=next-trip');
 Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});
 const packed=value=>w.Dream.api(`/api/checklist/${item}?tripId=next-trip`,{method:'PATCH',body:JSON.stringify({packed:value})});
 const depth=value=>w.Dream.api(`/api/spots/${spot}?tripId=next-trip`,{method:'PUT',body:JSON.stringify({name:'order spot',depthM:value})});
 return {w,server,item,spot,packed,depth,native,statuses,async close(){this.w.close();await server.close();}};
}
test('repeated checklist and spot edits keep last intent after lost acknowledgement, with stable keys',async()=>{
 const f=await fixture();try{
  for(const x of [true,false,true])await f.packed(x);for(const x of [2,3,4])await f.depth(x);
  const initial=JSON.parse(f.w.localStorage.getItem('dreamteam.offline.queue.v1'));assert.equal(initial.length,6);assert.ok(initial.every(q=>q.accountId==='account-patryk'));
  const previous=f.w,restarted=new JSDOM('<body></body>',{url:f.server.url,runScripts:'outside-only'}).window;restarted.AbortController=AbortController;restarted.AbortSignal=AbortSignal;restarted.DREAM_MODEL=previous.DREAM_MODEL;for(const key of Object.keys(previous.localStorage))restarted.localStorage.setItem(key,previous.localStorage.getItem(key));restarted.fetch=f.native;Object.defineProperty(restarted.navigator,'onLine',{value:false,configurable:true});restarted.eval(await readFile('public/dream-core.js','utf8'));previous.close();f.w=restarted;assert.equal(f.w.Dream.pendingCount(),6);
  let lost=false;const keys=[];f.w.fetch=async(path,options)=>{const r=await f.native(path,options);if(path==='/api/offline-sync'){keys.push(JSON.parse(options.body).key);f.statuses.push(r.status);if(!lost){lost=true;throw new TypeError('lost acknowledgement');}}return r;};
  const timer=f.w.setTimeout;f.w.setTimeout=(fn,ms)=>timer(fn,Math.min(ms,10));Object.defineProperty(f.w.navigator,'onLine',{value:true,configurable:true});await f.w.Dream.syncQueue();await wait(()=>f.w.Dream.pendingCount()===0);
  assert.equal(keys[0],keys[1]);assert.ok(f.statuses.every(s=>s===200));assert.equal(f.server.DB.sqlite.prepare('SELECT packed FROM checklist_items WHERE id=?').get(f.item).packed,1);assert.equal(f.server.DB.sqlite.prepare('SELECT depth_m FROM spots WHERE id=?').get(f.spot).depth_m,4);
 }finally{await f.close();}
});
test('real conflict blocks successors of that record, allows independent edits, and resolves in order',async()=>{
 const f=await fixture();try{
  for(const x of [true,false,true])await f.packed(x);await f.depth(8);
  await f.native(`/api/checklist/${f.item}?tripId=next-trip`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({packed:false})});
  Object.defineProperty(f.w.navigator,'onLine',{value:true,configurable:true});await f.w.Dream.syncQueue();const q=JSON.parse(f.w.localStorage.getItem('dreamteam.offline.queue.v1'));assert.equal(q.length,3);assert.equal(q[0].status,'conflict');assert.ok(q.slice(1).every(x=>x.status==='pending'));assert.equal(f.server.DB.sqlite.prepare('SELECT depth_m FROM spots WHERE id=?').get(f.spot).depth_m,8);
  f.w.document.getElementById('offline-banner').click();await wait(()=>f.w.Dream.pendingCount()===0);assert.equal(f.server.DB.sqlite.prepare('SELECT packed FROM checklist_items WHERE id=?').get(f.item).packed,1);
 }finally{await f.close();}
});

test('accepted revision remains available when replaying a pre-upgrade receipt without revision',async()=>{const f=await fixture();try{const op={key:crypto.randomUUID(),accountId:'account-patryk',path:`/api/checklist/${f.item}?tripId=next-trip`,method:'PATCH',payload:{packed:true},baseRevision:0};const first=await f.native('/api/offline-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(op)});assert.equal(first.status,200);const result=await first.json();assert.equal(result.revision,1);delete result.revision;f.server.DB.sqlite.prepare('UPDATE offline_receipts SET result_json=? WHERE id=?').run(JSON.stringify(result),op.key);const replay=await f.native('/api/offline-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(op)});assert.equal((await replay.json()).revision,1);assert.equal(f.server.DB.sqlite.prepare('SELECT revision FROM checklist_items WHERE id=?').get(f.item).revision,1);}finally{await f.close();}});
