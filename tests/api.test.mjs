import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';
const setup=(WEATHER_FETCH,RYBY_API_WRITE_TOKEN)=>{const DB=database();return {DB,async req(path,method='GET',value,headers={}){const r=await worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{'content-type':'application/json',...headers},body:value===undefined?undefined:JSON.stringify(value)}),{DB,WEATHER_FETCH,RYBY_API_WRITE_TOKEN,ASSETS:{fetch:()=>new Response('asset')}});return {status:r.status,data:await r.json()};}};};
const scoped=(resource,id,trip='next-trip')=>`${resource}/${id}?tripId=${trip}`;
const catchData={tripId:'next-trip',anglerId:'patryk',weightKg:14,bait:'test',caughtAt:'2026-09-01T10:00:00Z'};

test('weather uses only coordinates of a stored trip and handles upstream failures',async()=>{
 const calls=[],s=setup(async (url)=>{calls.push(new URL(url));return Response.json({current:{temperature_2m:15},hourly:{time:['2026-09-28T12:00']},daily:{time:['2026-09-28']}});});
 try{
  assert.equal((await s.req('weather?tripId=next-trip&latitude=0&longitude=0')).status,200);
  assert.equal(calls.length,1);assert.equal(calls[0].hostname,'api.open-meteo.com');
  assert.notEqual(calls[0].searchParams.get('latitude'),'0');
  assert.equal(calls[0].searchParams.get('forecast_days'),'7');
  assert.ok(calls[0].searchParams.get('hourly').includes('soil_temperature_0cm'));
  assert.equal((await s.req('weather?tripId=not-a-trip')).status,404);
  assert.equal((await s.req('weather')).status,400);
  s.DB.sqlite.exec("UPDATE lakes SET latitude=NULL,longitude=NULL WHERE id='plaine2'; UPDATE trips SET latitude=NULL,longitude=NULL WHERE id='next-trip'");
  assert.equal((await s.req('weather?tripId=next-trip')).status,422);
 }finally{s.DB.close();}
 const broken=setup(async()=>new Response('Service Unavailable',{status:503}));
 try{const r=await broken.req('weather?tripId=next-trip');assert.equal(r.status,502);assert.match(r.data.error,/503/);}finally{broken.DB.close();}
});

test('all migrations, bootstrap, participants, original PB and legacy content survive',async()=>{
 const s=setup(),b=(await s.req('bootstrap')).data;
 assert.equal(b.trips.length,4);assert.equal(b.lakes.length,3);assert.ok(b.trips.every(t=>t.participants.length===2));assert.ok(b.anglers.every(a=>a.pbKg===13));
 assert.equal(b.lakes.find(l=>l.id==='plaine2').facts.contentPack,'plaine2');
 assert.equal((await s.req('health')).data.schemaVersion,'17');s.DB.close();
});
test('create/edit/clear a catch; trip isolation; soft delete and restore; PB recalculates',async()=>{
 const s=setup(),r=await s.req('catches','POST',catchData);assert.equal(r.status,201);const id=r.data.id;
 assert.equal((await s.req('bootstrap')).data.anglers.find(a=>a.id==='patryk').pbKg,14);
 assert.equal((await s.req('catches?tripId=poland-2027')).data.catches.length,0);
 assert.equal((await s.req(scoped('catches',id,'poland-2027'),'PUT',{weightKg:30})).status,404);
 assert.equal((await s.req(scoped('catches',id),'PUT',{weightKg:12,notes:null,bait:null})).status,200);
 assert.equal((await s.req('bootstrap')).data.anglers.find(a=>a.id==='patryk').pbKg,13);
 assert.equal((await s.req('catches?tripId=next-trip')).data.catches[0].bait,null);
 await s.req(scoped('catches',id),'DELETE');assert.equal((await s.req('catches?tripId=next-trip')).data.catches.length,0);
 assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM catches').get().n,1);
 await s.req(`catches/${id}/restore?tripId=next-trip`,'POST',{});assert.equal((await s.req('catches?tripId=next-trip')).data.catches.length,1);s.DB.close();
});
test('validates dates, participants, finite weight, content type and cross-site writes',async()=>{
 const s=setup();
 for(const patch of [{weightKg:0},{weightKg:100},{weightKg:'Infinity'},{weightKg:true},{anglerId:'missing'},{caughtAt:'invalid'},{caughtAt:'2026-02-30T10:00:00Z'},{caughtAt:'2090-01-01T00:00:00Z'},{caughtAt:'2026-01-01T10:00'}])assert.equal((await s.req('catches','POST',{...catchData,...patch})).status,400,JSON.stringify(patch));
 assert.equal((await s.req('catches','POST',catchData,{'content-type':'text/plain'})).status,415);
 assert.equal((await s.req('catches','POST',catchData,{origin:'https://evil.test'})).status,403);
 assert.equal((await s.req('catches','POST',catchData,{'sec-fetch-site':'cross-site'})).status,403);s.DB.close();
});
test('configured token protects every write and complete export without changing data for unauthenticated requests',async()=>{
 const token='abcdef1234567890abcdef1234567890abcdef1234567890',s=setup(undefined,token),header={authorization:`Bearer ${token}`};
 try{
  assert.equal((await s.req('bootstrap')).status,200);
  assert.equal((await s.req('catches','POST',catchData)).status,401);
  assert.equal((await s.req('trips/next-trip/activate','POST',{})).status,401);
  assert.equal((await s.req('export')).status,401);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM catches').get().n,0);
  assert.equal((await s.req('catches','POST',catchData,{authorization:'Bearer wrong'})).status,401);
  assert.equal((await s.req('catches','POST',catchData,{...header,origin:'https://evil.test'})).status,403);
  assert.equal((await s.req('catches','POST',catchData,header)).status,201);
  assert.equal((await s.req('export','GET',undefined,header)).data.tables.catches.length,1);
  assert.equal((await s.req('catches?tripId=next-trip')).data.catches.length,1);
 }finally{s.DB.close();}
});
test('spot lifecycle preserves catch history and rejects spots from another trip',async()=>{
 const s=setup();const spot=(await s.req('spots','POST',{tripId:'next-trip',name:'Górka',depthM:4,notes:'rock'})).data.id;
 assert.equal((await s.req('catches','POST',{...catchData,tripId:'poland-2027',spotId:spot})).status,400);
 const id=(await s.req('catches','POST',{...catchData,spotId:spot})).data.id;
 await s.req(scoped('spots',spot),'PUT',{name:'Górka 2',depthM:null,notes:null});
 assert.equal((await s.req('spots?tripId=next-trip')).data.spots[0].depthM,null);
 await s.req(scoped('spots',spot),'DELETE');assert.equal((await s.req('spots?tripId=next-trip')).data.spots.length,0);
 let fish=(await s.req('catches?tripId=next-trip')).data.catches[0];assert.equal(fish.spot,'Górka 2');assert.equal(fish.spotId,spot);
 await s.req(scoped('catches',id),'PUT',{spotId:null,spot:null});fish=(await s.req('catches?tripId=next-trip')).data.catches[0];assert.equal(fish.spotId,null);assert.equal(fish.spot,null);s.DB.close();
});
test('checklist edits preserve packed state, clear values and validate empty labels',async()=>{
 const s=setup(),id=(await s.req('checklist','POST',{tripId:'next-trip',category:'sprzęt',label:'Test',packed:true,quantity:'2 szt.'})).data.id;
 await s.req(scoped('checklist',id),'PATCH',{label:'Poprawka',quantity:null});
 const i=(await s.req('checklist?tripId=next-trip')).data.items.find(x=>x.id===id);assert.equal(i.packed,true);assert.equal(i.quantity,null);
 assert.equal((await s.req(scoped('checklist',id),'PATCH',{label:''})).status,400);
 assert.equal((await s.req(scoped('checklist',id),'PATCH',{packed:'false'})).status,400);
 assert.equal((await s.req(scoped('checklist',id,'poland-2027'),'DELETE')).status,404);s.DB.close();
});
test('new year, lake, participants, checklist copy, activation and archive without deleting data',async()=>{
 const s=setup(),angler=(await s.req('anglers','POST',{name:'Anna',baselinePbKg:9})).data.id;
 const l=await s.req('lakes','POST',{name:'Nowa woda',country:'PL',latitude:0,longitude:0,facts:{timeZone:'Europe/Warsaw',waterSize:'3 ha'}});assert.equal(l.status,201);
 await s.req('checklist','POST',{tripId:'next-trip',label:'Namiot',packed:true});
 const t=await s.req('trips','POST',{name:'Wyprawa 2029',year:2029,lakeId:l.data.id,participantIds:[angler],copyChecklistFrom:'next-trip',start:'2029-06-01T10:00:00+02:00',end:'2029-06-08T10:00:00+02:00'});assert.equal(t.status,201);
 const id=t.data.id;assert.equal((await s.req('checklist?tripId='+id)).data.items[0].packed,false);
 await s.req('trips/'+id+'/activate','POST',{});let b=(await s.req('bootstrap')).data;assert.equal(b.app.activeTripId,id);assert.equal(b.trips.filter(x=>x.isActive).length,1);
 assert.equal((await s.req('catches','POST',{...catchData,tripId:id})).status,400);
 await s.req('trips/'+id,'PUT',{start:null,end:null,status:'archived'});b=(await s.req('bootstrap')).data;assert.equal(b.trips.find(t=>t.id===id).status,'archived');assert.equal(b.trips.find(t=>t.id===id).start,null);
 assert.equal((await s.req('trips/'+id+'/activate','POST',{})).status,409);assert.equal((await s.req('checklist?tripId='+id)).data.items.length,1);s.DB.close();
});
test('invalid trip dates, duplicate anglers, dangerous URLs and lake edits are rejected safely',async()=>{
 const s=setup();assert.equal((await s.req('anglers','POST',{name:'Patryk'})).status,409);
 assert.equal((await s.req('lakes','POST',{name:'test',imageUrl:'javascript:alert(1)'})).status,400);
 assert.equal((await s.req('lakes','POST',{name:'test',latitude:90.1,longitude:1})).status,400);
 assert.equal((await s.req('lakes','POST',{name:'test',facts:{timeZone:'not/a/zone'}})).status,400);
 assert.equal((await s.req('trips/next-trip','PUT',{year:2026.5})).status,400);
 assert.equal((await s.req('trips/next-trip','PUT',{end:'2026-01-01T00:00:00Z'})).status,400);
 assert.equal((await s.req('trips/next-trip','PUT',{lakeId:'wygonin'})).status,409);
 await s.req('catches','POST',catchData);assert.equal((await s.req('trips/next-trip','PUT',{participantIds:['maciek']})).status,409);s.DB.close();
});
test('export contains all original and soft-deleted records and import provenance',async()=>{
 const s=setup(),r=await s.req('catches','POST',catchData);await s.req(scoped('catches',r.data.id),'DELETE');
 const exported=(await s.req('export')).data;assert.equal(exported.format,'dream-team-backup-v1');assert.ok(exported.tables.catches[0].deleted_at);assert.equal(exported.tables.trips.length,4);assert.ok(exported.tables.trip_documents.length>10);s.DB.close();
});
test('trash is scoped to a trip and restoring preserves the original row',async()=>{
 const s=setup(),id=(await s.req('catches','POST',catchData)).data.id;
 await s.req(scoped('catches',id),'DELETE');
 assert.equal((await s.req('trash?tripId=next-trip')).data.items[0].id,id);
 assert.equal((await s.req('trash?tripId=poland-2027')).data.items.length,0);
 assert.equal((await s.req(`catches/${id}/restore?tripId=next-trip`,'DELETE')).status,404);
 await s.req(`catches/${id}/restore?tripId=next-trip`,'POST',{});
 assert.equal((await s.req('trash?tripId=next-trip')).data.items.length,0);
 assert.equal((await s.req('catches?tripId=next-trip')).data.catches[0].weightKg,14);s.DB.close();
});
