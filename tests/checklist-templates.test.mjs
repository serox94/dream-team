import test from 'node:test';import assert from 'node:assert/strict';import worker from '../src/worker.js';import {database} from './db.mjs';
async function fixture(){const DB=database(),env={DB,RYBY_LOGIN_USERNAME:'test',RYBY_LOGIN_PASSWORD:'fixture-pass',RYBY_SESSION_SECRET:'fixture-session-secret-at-least-32-characters',ASSETS:{fetch:()=>new Response('asset')}};const login=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})}),env);const cookie=login.headers.get('set-cookie').split(';')[0];return {DB,async req(path,method='GET',payload){const r=await worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{cookie,'content-type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)}),env);return {status:r.status,data:await r.json()};}};}
test('create from trip by categories, edit, apply multiple templates without duplicate items or year binding',async()=>{const s=await fixture();try{
 await s.req('checklist','POST',{tripId:'next-trip',category:'sprzęt',label:'Namiot',packed:true});
 await s.req('checklist','POST',{tripId:'next-trip',category:'zakupy',label:'Baterie'});
 const first=await s.req('checklist-templates','POST',{name:'Namiot',fromTripId:'next-trip',categories:['sprzęt']});assert.equal(first.status,201);assert.equal(first.data.count,1);
 const second=await s.req('checklist-templates','POST',{name:'Standardowy wyjazd',items:[{category:'sprzęt',label:'Namiot'},{category:'sprzęt',label:'Podbierak'},{category:'sprzęt',label:'podbierak'}]});assert.equal(second.data.count,2);
 const templates=(await s.req('checklist-templates')).data.templates;assert.equal(templates.length,2);assert.equal(templates.find(t=>t.id===first.data.id).items[0].label,'Namiot');
 const a=await s.req('trips/poland-2027/checklist-templates/apply','POST',{templateIds:[first.data.id,second.data.id]});assert.equal(a.data.added,2);
 const repeat=await s.req('trips/poland-2027/checklist-templates/apply','POST',{templateIds:[first.data.id,second.data.id]});assert.equal(repeat.data.added,0);
 const rows=(await s.req('checklist?tripId=poland-2027')).data.items;assert.equal(rows.filter(x=>x.label==='Namiot').length,1);assert.equal(rows.find(x=>x.label==='Namiot').packed,false);
 const edited=await s.req(`checklist-templates/${first.data.id}`,'PUT',{name:'Biwak',items:[{category:'sprzęt',label:'Namiot'},{category:'sprzęt',label:'Latarka'}]});assert.equal(edited.status,200);
 assert.equal((await s.req(`checklist-templates/${first.data.id}`,'DELETE')).status,200);
 assert.equal((await s.req('checklist?tripId=poland-2027')).data.items.length,rows.length,'deleting template does not delete applied items');
 assert.equal(s.DB.sqlite.prepare('PRAGMA table_info(checklist_templates)').all().some(x=>x.name==='year'),false);
 }finally{s.DB.close();}});
