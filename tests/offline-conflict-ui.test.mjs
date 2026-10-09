import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

test('keeping the server conflict restores the offline row and refreshes the visible page',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://dream.test/pages/mapa.html',runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w.navigator,'onLine',{value:false});w.confirm=()=>false;
 let refreshScheduled=false;w.setTimeout=()=>{refreshScheduled=true;};
 const path='/api/spots?tripId=qa-trip';
 w.localStorage.setItem('ryby_read_cache_v1',JSON.stringify({[path]:{at:Date.now(),data:{spots:[{id:7,name:'My spot',depthM:4.7,revision:1,pendingSync:true}]}}}));
 w.localStorage.setItem('dreamteam.offline.queue.v1',JSON.stringify([{key:'qa',path:'/api/spots/7?tripId=qa-trip',status:'conflict',serverRevision:2,serverValue:{name:'My spot',depthM:5.7,notes:'Original note'},error:'Conflict'}]));
 w.eval(await readFile('public/dream-core.js','utf8'));await w.Dream.registerShell();
 w.document.getElementById('offline-banner').click();
 assert.equal(w.Dream.pendingCount(),0);
 const row=JSON.parse(w.localStorage.getItem('ryby_read_cache_v1'))[path].data.spots[0];
 assert.equal(row.depthM,5.7);assert.equal(row.revision,2);assert.equal(row.notes,'Original note');assert.equal(row.pendingSync,undefined);
 assert.equal(refreshScheduled,true);w.close();
});
