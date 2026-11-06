import test from 'node:test';import assert from 'node:assert/strict';import {serve} from '../scripts/qa-server.mjs';
test('an empty fishery/trip starts no research, later verified profile updates flow to current trips and freeze on archiving',async()=>{
 const s=await serve({researchFixture:true});const beforeFetch=globalThis.fetch;let external=0;
 globalThis.fetch=async(input,options)=>{if(!String(input).startsWith(s.url)){external++;throw Error('UNEXPECTED_EXTERNAL_FETCH')}return beforeFetch(input,options)};
 const api=async(path,method='GET',body)=>{const r=await fetch(s.url+'/api/'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json()};
 try{
  const lake=await api('lakes','POST',{name:'Puste łowisko',country:'Polska',sources:[],facts:{timeZone:'Europe/Warsaw'}});
  const trip=await api('trips','POST',{name:'Wyprawa 2030',lakeId:lake.id,year:2030,participantIds:['patryk','maciek'],peg:'A',status:'planning'});
  await api('lakes/'+lake.id,'PUT',{sources:['https://example.org/verified-rules'],sourceUrl:'https://example.org/verified-rules',researchConfirmed:true,facts:{rulesText:'Zasady zatwierdzone przez właściciela.',logisticsText:'Dojazd potwierdzony.'}});
  let model=await api('bootstrap');assert.equal(model.trips.find(t=>t.id===trip.id).lakeProfile.facts.rulesText,'Zasady zatwierdzone przez właściciela.');
  await api('trips/'+trip.id,'PUT',{status:'archived'});
  await api('lakes/'+lake.id,'PUT',{facts:{rulesText:'Nowe zasady na kolejny sezon.'}});
  model=await api('bootstrap');const archived=model.trips.find(t=>t.id===trip.id);assert.equal(archived.lakeProfile.facts.rulesText,'Zasady zatwierdzone przez właściciela.');assert.equal(archived.peg,'A');assert.equal(model.lakes.find(l=>l.id===lake.id).facts.rulesText,'Nowe zasady na kolejny sezon.');
  const history=await api('lakes/'+lake.id+'/manager?tripId='+trip.id);assert.equal(history.historical,true);assert.equal(history.lake.facts.rulesText,'Zasady zatwierdzone przez właściciela.');
  await s.dispatchScheduled();assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM research_jobs').get().n,0);assert.equal(external,0);assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM lake_sources WHERE lake_id=?').get(lake.id).n,1);
  const r=await fetch(s.url+'/api/settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({research_auto:'on'})});assert.equal(r.status,400);
 }finally{globalThis.fetch=beforeFetch;await s.close()}
});
test('Paddy can sign in, add and pack his item in the single shared trip checklist',async()=>{
 const s=await serve();try{
 const r=await fetch(s.url+'/api/anglers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Paddy',username:'Paddy',baselinePbKg:0})});assert.equal(r.status,201);const p=await r.json();s.DB.sqlite.prepare('INSERT OR IGNORE INTO trip_participants(trip_id,angler_id) VALUES(?,?)').run('next-trip',p.id);
 const login=await fetch(s.url+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Paddy',password:'local-fixture-password'})});assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0],headers={'content-type':'application/json',cookie};
 const created=await fetch(s.url+'/api/checklist',{method:'POST',headers,body:JSON.stringify({tripId:'next-trip',category:'sprzęt',label:'Paddy podbierak',assignedTo:'Paddy'})});assert.equal(created.status,201);const item=await created.json();
 const packed=await fetch(s.url+'/api/checklist/'+item.id+'?tripId=next-trip',{method:'PATCH',headers,body:JSON.stringify({packed:true})});assert.equal(packed.status,200);assert.deepEqual({...s.DB.sqlite.prepare('SELECT trip_id,assigned_to,packed FROM checklist_items WHERE id=?').get(item.id)},{trip_id:'next-trip',assigned_to:'Paddy',packed:1});
 }finally{await s.close()}
});
