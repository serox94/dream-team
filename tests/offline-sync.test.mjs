import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';
const uuid=()=>crypto.randomUUID();
function fixture(){const DB=database(),env={DB,RYBY_LOGIN_USERNAME:'tester',RYBY_LOGIN_PASSWORD:'fixture-only',RYBY_SESSION_SECRET:'fixture-session-secret-at-least-32-characters',ASSETS:{fetch:()=>new Response('asset')}};
 let cookie;return {DB,async req(path,method='GET',value){if(!cookie){const login=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})}),env);cookie=login.headers.get('set-cookie').split(';')[0];}
 const r=await worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{cookie,'content-type':'application/json'},body:value===undefined?undefined:JSON.stringify(value)}),env);return {status:r.status,data:await r.json()};}};}
const sync=(s,op)=>s.req('offline-sync','POST',op);
test('offline catch and note replay are idempotent; no duplicate records after retry',async()=>{const s=fixture();try{
 const key=uuid(),payload={tripId:'next-trip',anglerId:'patryk',weightKg:8,caughtAt:'2026-09-01T10:00:00Z'};
 const op={key,path:'/api/catches',method:'POST',payload};const a=await sync(s,op),b=await sync(s,op);
 assert.equal(a.status,200);assert.equal(a.data.id,b.data.id);assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM catches').get().n,1);
 const note={key:uuid(),path:'/api/notes',method:'POST',payload:{tripId:'next-trip',content:'Wiatr z zachodu'}};
 assert.equal((await sync(s,note)).status,200);await sync(s,note);assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM trip_notes WHERE content=?').get('Wiatr z zachodu').n,1);
 }finally{s.DB.close();}});
test('offline checklist and spot edits detect concurrent changes and respect trip isolation',async()=>{const s=fixture();try{
 const spot=(await s.req('spots','POST',{tripId:'next-trip',name:'Stok'})).data.id;
 const op={key:uuid(),path:`/api/spots/${spot}?tripId=next-trip`,method:'PUT',baseRevision:0,payload:{name:'Stok A',depthM:4}};
 assert.equal((await sync(s,op)).status,200);assert.equal((await sync(s,op)).status,200);assert.equal(s.DB.sqlite.prepare('SELECT revision FROM spots WHERE id=?').get(spot).revision,1);
 const conflict={...op,key:uuid(),payload:{name:'Stok B'}};const result=await sync(s,conflict);assert.equal(result.status,409);assert.equal(result.data.serverRevision,1);
 const wrong={...op,key:uuid(),path:`/api/spots/${spot}?tripId=poland-2027`};assert.equal((await sync(s,wrong)).status,409);
 const item=(await s.req('checklist','POST',{tripId:'next-trip',category:'sprzęt',label:'Wiadro',packed:false})).data.id;
 const packed={key:uuid(),path:`/api/checklist/${item}?tripId=next-trip`,method:'PATCH',baseRevision:0,payload:{packed:true}};
 assert.equal((await sync(s,packed)).status,200);assert.equal((await sync(s,packed)).status,200);assert.equal(s.DB.sqlite.prepare('SELECT revision FROM checklist_items WHERE id=?').get(item).revision,1);
 const stale={...packed,key:uuid(),payload:{packed:false}};assert.equal((await sync(s,stale)).status,409);
 }finally{s.DB.close();}});
