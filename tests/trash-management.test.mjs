import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

async function fixture(){
 const DB=database(),env={DB,RYBY_LOGIN_USERNAME:'test',RYBY_LOGIN_PASSWORD:'test-password',RYBY_SESSION_SECRET:'fixture-session-secret-at-least-32-characters',ASSETS:{fetch:()=>new Response('asset')}};
 const login=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})}),env);
 assert.equal(login.status,303);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 async function request(path,method='GET',data,options={}){
   const r=await worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{cookie,'content-type':'application/json',...options},body:data===undefined?undefined:JSON.stringify(data)}),env);
   return {status:r.status,data:await r.json()};
 }
 return {DB,env,cookie,request,close:()=>DB.close()};
}
const scoped=(kind,id,tripId='next-trip')=>`${kind}/${id}?tripId=${tripId}`;

test('permanent delete is limited to already deleted items and the specified trip',async()=>{
 const f=await fixture();
 try{
   const category=await f.request('checklist-categories','POST',{name:'Temporary trash category'});
   assert.equal(category.status,201);
   const first=await f.request('checklist','POST',{tripId:'next-trip',category:'Temporary trash category',label:'One'});
   const live=await f.request('checklist','POST',{tripId:'next-trip',category:'Temporary trash category',label:'Keep'});
   const other=await f.request('checklist','POST',{tripId:'poland-2027',category:'Temporary trash category',label:'Other trip'});
   assert.equal(first.status,201);
   assert.equal((await f.request(scoped('checklist',first.data.id),'DELETE')).status,200);
   assert.equal((await f.request('checklist-categories/'+category.data.id,'DELETE')).status,409,'soft-deleted items still block category removal');
   assert.equal((await f.request(scoped('trash/checklist',first.data.id),'DELETE',{})).status,400,'explicit confirmation required');
   assert.equal((await f.request(scoped('trash/checklist',first.data.id,'poland-2027'),'DELETE',{confirmPermanent:true})).status,404,'different trip cannot purge it');
   assert.equal((await f.request(scoped('trash/checklist',live.data.id),'DELETE',{confirmPermanent:true})).status,409,'active item cannot be purged');
   assert.equal((await f.request(scoped('trash/checklist',first.data.id),'DELETE',{confirmPermanent:true})).status,200);
   assert.equal((await f.request(scoped('trash/checklist',first.data.id),'DELETE',{confirmPermanent:true})).status,404,'repeated deletion does not delete anything else');
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM checklist_items WHERE id IN (?,?)').get(live.data.id,other.data.id).n,2);
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM checklist_items WHERE id=?').get(first.data.id).n,0);
 }finally{f.close();}
});

test('empty trash requires exact trip name; purges only trashed entries and keeps active data',async()=>{
 const f=await fixture();
 try{
   const deletedCheck=await f.request('checklist','POST',{tripId:'next-trip',category:'sprzęt',label:'Deleted'});
   const activeCheck=await f.request('checklist','POST',{tripId:'next-trip',category:'sprzęt',label:'Keep'});
   const otherCheck=await f.request('checklist','POST',{tripId:'poland-2027',category:'sprzęt',label:'Other'});
   const catchItem=await f.request('catches','POST',{tripId:'next-trip',anglerId:'patryk',weightKg:6,caughtAt:'2026-09-01T10:00:00Z'});
   const spot=await f.request('spots','POST',{tripId:'next-trip',name:'Deleted spot'});
   assert.equal((await f.request(scoped('checklist',deletedCheck.data.id),'DELETE')).status,200);
   assert.equal((await f.request(scoped('catches',catchItem.data.id),'DELETE')).status,200);
   assert.equal((await f.request(scoped('spots',spot.data.id),'DELETE')).status,200);
   const before=await f.request('trash?tripId=next-trip');
   assert.equal(before.data.items.length,3);
   assert.equal((await f.request('trash?tripId=next-trip','DELETE',{confirmTripName:'Wrong trip'})).status,400);
   assert.equal((await f.request('trash?tripId=next-trip','DELETE',{})).status,400);
   assert.equal((await f.request('trash?tripId=next-trip','DELETE',{confirmTripName:'Francja 2026'})).status,200);
   assert.equal((await f.request('trash?tripId=next-trip')).data.items.length,0);
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM checklist_items WHERE id IN (?,?)').get(activeCheck.data.id,otherCheck.data.id).n,2);
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM catches WHERE id=?').get(catchItem.data.id).n,0);
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM spots WHERE id=?').get(spot.data.id).n,0);
 }finally{f.close();}
});

test('permanent spot removal refuses linked catches; after linked catch is trashed bulk purges both',async()=>{
 const f=await fixture();
 try{
   const spot=await f.request('spots','POST',{tripId:'next-trip',name:'Used spot'});
   const catchItem=await f.request('catches','POST',{tripId:'next-trip',anglerId:'patryk',weightKg:8,caughtAt:'2026-09-01T10:00:00Z',spotId:spot.data.id});
   assert.equal(catchItem.status,201);
   assert.equal((await f.request(scoped('spots',spot.data.id),'DELETE')).status,200);
   const blocked=await f.request(scoped('trash/spots',spot.data.id),'DELETE',{confirmPermanent:true});
   assert.equal(blocked.status,409);
   assert.equal(blocked.data.code,'SPOT_IN_USE');
   assert.equal((await f.request('trash?tripId=next-trip','DELETE',{confirmTripName:'Francja 2026'})).status,409);
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM spots WHERE id=?').get(spot.data.id).n,1);
   assert.equal((await f.request(scoped('catches',catchItem.data.id),'DELETE')).status,200);
   const emptied=await f.request('trash?tripId=next-trip','DELETE',{confirmTripName:'Francja 2026'});
   assert.equal(emptied.status,200);
   assert.equal(emptied.data.deleted,2);
   assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM spots WHERE id=?').get(spot.data.id).n,0);
 }finally{f.close();}
});

test('trash permanent delete requires authentication and rejects cross-site mutations',async()=>{
 const f=await fixture();
 try{
   const path='https://dream.test/api/trash?tripId=next-trip';
   const without=await worker.fetch(new Request(path,{method:'DELETE',headers:{'content-type':'application/json'},body:'{}'}),f.env);
   assert.equal(without.status,401);
   const foreign=await worker.fetch(new Request(path,{method:'DELETE',headers:{cookie:f.cookie,'content-type':'application/json',origin:'https://evil.test'},body:JSON.stringify({confirmTripName:'Francja 2026'})}),f.env);
   assert.equal(foreign.status,403);
 }finally{f.close();}
});

test('settings trash UI exposes permanent removal and exact requested heading',async()=>{
 const dom=new JSDOM('<div id="settings-management"></div>',{url:'https://dream.test/pages/ustawienia.html',runScripts:'outside-only'}),w=dom.window;
 let deleted=false,refreshed=0;
 w.DREAM_TRIP={id:'next-trip',name:'Francja 2026'};
 w.DREAM_MODEL={anglers:[],currentUser:null};
 w.Dream={esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),api:async(path,options)=>{if(path==='/api/checklist-templates')return {templates:[]};if(path.startsWith('/api/trash?')&&options?.method==='DELETE'){deleted=true;return {ok:true,deleted:1}};if(path.startsWith('/api/trash?'))return {items:deleted?[]:[{id:10,kind:'checklist',label:'Stary wpis'}]};return {ok:true}},refreshModel:async()=>{},notice:()=>{},logout:async()=>{}};
 w.confirm=()=>false;w.prompt=()=>null;
 try{
   w.eval(await readFile('public/trip-manager.js','utf8'));
   await new Promise(resolve=>setTimeout(resolve,10));
   const root=w.document.getElementById('settings-management');
   assert.match(root.textContent,/Przywracanie wpisów \/ kosz/);
   assert.match(root.textContent,/Usuń trwale/);
   assert.match(root.textContent,/Opróżnij kosz/);
   root.querySelector('[data-purge]').click();await new Promise(resolve=>setTimeout(resolve,0));
   assert.equal(deleted,false,'canceling individual confirmation makes no request');
   w.prompt=()=> 'Francja 2026';
   root.querySelector('#trash-clear').click();
   await new Promise(resolve=>setTimeout(resolve,10));
   assert.equal(deleted,true);
   assert.match(root.textContent,/Brak usuniętych wpisów/);
 }finally{w.close();}
});
