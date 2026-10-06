import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';
const PNG=new Uint8Array([137,80,78,71,13,10,26,10,...new Array(40).fill(0)]);
function fixture(){
 const DB=database(),objects=new Map(),MEDIA={async put(k,v){objects.set(k,new Uint8Array(v));},async get(k){const v=objects.get(k);return v?{body:v}:null;},async delete(k){objects.delete(k);}};
 const env={DB,MEDIA,RYBY_LOGIN_USERNAME:'tester',RYBY_LOGIN_PASSWORD:'local-only-pass',RYBY_SESSION_SECRET:'local-session-secret-at-least-32-characters',ASSETS:{fetch:()=>new Response('asset')}};
 async function req(path,method='GET',body,headers={}){
  const signed=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})}),env);
  const cookie=signed.headers.get('set-cookie').split(';')[0];
  return worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{cookie,...headers},body}),env);
 }
 return {DB,env,objects,req};
}
function upload({name='Skan A',tripId='next-trip',image=new File([PNG],'scan.png',{type:'image/png'})}={}){const f=new FormData();f.set('image',image);f.set('name',name);f.set('tripId',tripId);return f;}

test('private media upload, retrieval, edit, spot ownership, delete and R2 isolation',async()=>{
 const s=fixture();try{
  const noSession=await worker.fetch(new Request('https://dream.test/api/deeper-media'),s.env);assert.equal(noSession.status,401);
  const created=await s.req('deeper-media','POST',upload());assert.equal(created.status,201);const {id}=await created.json();
  assert.equal(s.objects.size,1);
  const list=await (await s.req('deeper-media')).json();assert.equal(list.images.length,1);assert.equal(list.images[0].name,'Skan A');
  const content=await s.req(`deeper-media/${id}/image`);assert.equal(content.status,200,await content.clone().text());assert.equal(content.headers.get('content-type'),'image/png');assert.equal((await content.arrayBuffer()).byteLength,PNG.length);
  assert.equal((await s.req(`deeper-media/${id}`,'PATCH',JSON.stringify({spotId:999}),{'content-type':'application/json'})).status,400);
  const spot=s.DB.sqlite.prepare("INSERT INTO spots(trip_id,name) VALUES('next-trip','Testowy spot')").run().lastInsertRowid;
  const updated=await s.req(`deeper-media/${id}`,'PATCH',JSON.stringify({name:'Nowa nazwa',spotId:Number(spot),note:'Kontrola dna'}),{'content-type':'application/json'});assert.equal(updated.status,200);
  assert.equal((await (await s.req('deeper-media')).json()).images[0].spotId,Number(spot));
  assert.equal((await s.req(`deeper-media/${id}`,'DELETE')).status,200);assert.equal(s.objects.size,0);assert.equal((await (await s.req('deeper-media')).json()).images.length,0);
 }finally{s.DB.close();}
});
test('rejects forged media and mismatched MIME before writing to R2 or D1',async()=>{
 const s=fixture();try{
  const bad=[new File([new Uint8Array(40)],'scan.png',{type:'image/png'}),new File([PNG],'scan.svg',{type:'image/png'}),new File([PNG],'scan.png',{type:'image/svg+xml'}),new File([new Uint8Array(8*1024*1024+1)],'huge.png',{type:'image/png'})];
  for(const image of bad)assert.ok((await s.req('deeper-media','POST',upload({image}))).status>=400);
  assert.equal(s.objects.size,0);assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM deeper_media').get().n,0);
  const forged=await s.req('deeper-media','POST',upload(),{origin:'https://other.example'});assert.equal(forged.status,403);
 }finally{s.DB.close();}
});
