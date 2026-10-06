import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';
import {extractFacts,suggestions} from '../src/lake-research.js';
const setup=(WEATHER_FETCH)=>{const DB=database(),env={DB,WEATHER_FETCH,RYBY_LOGIN_USERNAME:'test-angler',RYBY_LOGIN_PASSWORD:'test-password-for-local-only',RYBY_SESSION_SECRET:'test-session-secret-for-local-only-32-chars',ASSETS:{fetch:()=>new Response('asset')}};let loginPromise;
 const signed=async()=>{const r=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD})}),env);assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];};
 return {DB,env,signed,async req(path,method='GET',value,headers={}){loginPromise||=signed();const cookie=await loginPromise;const r=await worker.fetch(new Request('https://dream.test/api/'+path,{method,headers:{'content-type':'application/json',cookie,...headers},body:value===undefined?undefined:JSON.stringify(value)}),env);return {status:r.status,data:await r.json()};}};};
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
 assert.equal((await s.req('health')).data.schemaVersion,'25');s.DB.close();
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
test('private app denies every read and write without a session; login, renewal and logout revoke it',async()=>{
 const s=setup(),call=(path,method='GET',headers={},body)=>worker.fetch(new Request('https://dream.test'+path,{method,headers,body}),s.env);
 try{
  assert.equal((await call('/')).status,302);
  assert.equal((await call('/login')).status,200);
  assert.equal((await call('/login.css')).status,200);
  assert.equal((await call('/app.js')).status,302);
  for(const path of ['/api/bootstrap','/api/catches?tripId=next-trip','/api/export','/api/health'])assert.equal((await call(path)).status,401,path);
  for(const [path,method] of [['/api/catches','POST'],['/api/checklist','PATCH'],['/api/spots/1','DELETE'],['/api/catches/1/restore','POST'],['/api/trips/next-trip/activate','POST']])assert.equal((await call(path,method,{'content-type':'application/json'},'{}')).status,401,path);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM catches').get().n,0);
  const bad=await call('/api/login','POST',{'content-type':'application/x-www-form-urlencoded'},new URLSearchParams({username:s.env.RYBY_LOGIN_USERNAME,password:'bad'}));
  assert.equal(bad.status,303);assert.equal(bad.headers.get('location'),'/login?error=credentials');assert.equal(bad.headers.get('set-cookie'),null);
  const mobile=await call('/api/login','POST',{'content-type':'application/x-www-form-urlencoded',origin:'null','sec-fetch-site':'cross-site'},new URLSearchParams({username:s.env.RYBY_LOGIN_USERNAME,password:s.env.RYBY_LOGIN_PASSWORD}));
  assert.equal(mobile.status,303,'mobile form navigation can carry a cross-site fetch marker');
  assert.match(mobile.headers.get('set-cookie'),/^__Host-ryby_session=/);
  const cookie=await s.signed();
  assert.match(cookie,/^__Host-ryby_session=v1\./);
  const issued=await call('/api/login','POST',{'content-type':'application/x-www-form-urlencoded'},new URLSearchParams({username:s.env.RYBY_LOGIN_USERNAME,password:s.env.RYBY_LOGIN_PASSWORD}));
  assert.match(issued.headers.get('set-cookie'),/; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=63072000$/);
  assert.ok(!issued.headers.get('set-cookie').includes(s.env.RYBY_LOGIN_PASSWORD));
  const raw=await call('/api/bootstrap','GET',{cookie});assert.equal(raw.status,200);
  const assetPaths=[];s.env.ASSETS={fetch:request=>{assetPaths.push(new URL(request.url).pathname);return new Response('asset')}};
  assert.equal((await call('/','GET',{cookie})).status,200);
  assert.deepEqual(assetPaths,['/index.html'],'protected root resolves to the physical HTML asset');
  assert.equal((await call('/pages/wyjazdy.html','GET',{cookie})).status,200,'private assets require a signed session');
  assert.equal((await call('/api/bootstrap','GET',{cookie})).status,200,'refresh and reopened app reuse the browser cookie');
  assert.equal((await call('/api/export','GET',{cookie})).status,200);
  const changed={...s.env,RYBY_LOGIN_PASSWORD:'rotated-password'};
  assert.equal((await worker.fetch(new Request('https://dream.test/api/bootstrap',{headers:{cookie}}),changed)).status,401,'credential rotation invalidates sessions');
  const secretChanged={...s.env,RYBY_SESSION_SECRET:'rotated-secret-with-at-least-32-characters'};
  assert.equal((await worker.fetch(new Request('https://dream.test/api/bootstrap',{headers:{cookie}}),secretChanged)).status,401,'session secret rotation invalidates sessions');
  assert.equal((await call('/api/catches','POST',{cookie,'content-type':'application/json',origin:'https://evil.test'},JSON.stringify(catchData))).status,403);
  assert.equal((await call('/api/catches','POST',{cookie,'content-type':'application/json','sec-fetch-site':'cross-site'},JSON.stringify(catchData))).status,403);
  assert.equal((await call('/api/catches','POST',{cookie,'content-type':'application/json'},JSON.stringify(catchData))).status,201);
  const out=await call('/api/logout','POST',{cookie});assert.equal(out.status,200);assert.match(out.headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await call('/api/bootstrap','GET',{cookie})).status,401,'copied cookie must be revoked server-side');
  assert.equal((await call('/api/export','GET',{cookie})).status,401);
  assert.equal((await call('/')).status,302);
 }finally{s.DB.close();}
});
test('login is throttled and missing runtime secrets fail closed',async()=>{
 const s=setup(),url='https://dream.test/api/login';
 try{
  assert.equal((await worker.fetch(new Request('https://dream.test/api/export'),{...s.env,RYBY_SESSION_SECRET:undefined})).status,503);
  for(let i=0;i<8;i++)assert.equal((await worker.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cf-connecting-ip':'203.0.113.10'},body:'username=x&password=x'}),s.env)).headers.get('location'),'/login?error=credentials');
  const blocked=await worker.fetch(new Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','cf-connecting-ip':'203.0.113.10'},body:new URLSearchParams({username:s.env.RYBY_LOGIN_USERNAME,password:s.env.RYBY_LOGIN_PASSWORD})}),s.env);
  assert.equal(blocked.headers.get('location'),'/login?error=limit');
  assert.equal(blocked.headers.get('set-cookie'),null);
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
test('category migration, rename, order and safe move retain packed rows',async()=>{
 const s=setup();try{
  const before=(await s.req('checklist?tripId=next-trip')).data.items;
  const added=await s.req('checklist-categories','POST',{name:'Nocleg'});assert.equal(added.status,201);
  const id=added.data.id,other=(await s.req('checklist-categories')).data.categories.find(c=>c.name==='sprzęt');
  const item=(await s.req('checklist','POST',{tripId:'next-trip',category:'Nocleg',label:'Namiot',packed:true})).data.id;
  assert.equal((await s.req(`checklist-categories/${id}`,'DELETE',{})).status,409);
  assert.equal((await s.req(`checklist-categories/${id}`,'PATCH',{name:'Biwak',sortOrder:4,active:true})).status,200);
  assert.equal((await s.req('checklist?tripId=next-trip')).data.items.find(x=>x.id===item).category,'Biwak');
  assert.equal((await s.req(`checklist-categories/${id}`,'PATCH',{active:false})).status,200);
  assert.equal((await s.req('checklist?tripId=next-trip')).data.items.find(x=>x.id===item).packed,true);
  assert.equal(Boolean((await s.req('checklist-categories')).data.categories.find(x=>x.id===id).active),false);
  assert.equal((await s.req(`checklist-categories/${id}`,'PATCH',{moveToId:other.id,active:false})).status,200);
  assert.equal((await s.req(`checklist-categories/${id}`,'DELETE',{})).status,200);
  const after=(await s.req('checklist?tripId=next-trip')).data.items;
  assert.equal(after.length,before.length+1);assert.equal(after.find(x=>x.id===item).packed,true);assert.equal(after.find(x=>x.id===item).category,'sprzęt');
 }finally{s.DB.close();}
});
test('settings persist allowed preferences without accepting secrets',async()=>{
 const s=setup();try{
  const original=await s.req('settings');assert.equal(original.data.schemaVersion,25);
  assert.equal((await s.req('settings','PATCH',{research_auto:'off',research_languages:'PL,EN,FR,DE,NL',trip_time_zone:'Europe/Warsaw'})).status,200);
  const current=(await s.req('settings')).data.settings;assert.equal(current.research_auto,'off');assert.equal(current.research_languages,'PL,EN,FR,DE,NL');
  assert.equal((await s.req('settings','PATCH',{api_key:'unsafe'})).status,400);
  assert.equal((await s.req('settings','PATCH',{research_languages:'PL,XX'})).status,400);
 }finally{s.DB.close();}
});
test('new-trip candidate search needs a provider, keeps lake creation separate and enforces cooldown',async()=>{
 const s=setup(),before=s.DB.sqlite.prepare('SELECT COUNT(*) n FROM lakes').get().n;
 try{
  const pending=await s.req('lake-candidates','POST',{name:'Kamień',country:'Polska'});
  assert.equal(pending.status,200);assert.equal(pending.data.providerConfigured,false);
  assert.match(pending.data.message,/OCZEKUJE NA TAVILY_API_KEY/);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM lakes').get().n,before);
  const originalFetch=globalThis.fetch;let calls=0;
  try{
   s.env.TAVILY_API_KEY='fixture-only';
   globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.headers.authorization,'Bearer fixture-only');return Response.json({results:[{title:'Kamień A',url:'https://example.org/lake-a',content:'region: Mazowieckie'},{title:'Kamień B',url:'https://example.org/lake-b',content:'region: Dolnośląskie'}]});};
   const found=await s.req('lake-candidates','POST',{name:'Kamień',country:'Polska'});
   assert.equal(found.status,200);assert.equal(found.data.candidates.length,2);assert.equal(calls,1);
   assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM lakes').get().n,before,'candidate search cannot silently create a lake');
   assert.equal((await s.req('lake-candidates','POST',{name:'Kamień',country:'Polska'})).status,429);
   assert.equal(calls,1,'cooldown stops another billable provider request');
  }finally{globalThis.fetch=originalFetch;}
 }finally{s.DB.close();}
});
test('lake profile stores cited facts, flags conflicts and adds only approved checklist proposals',async()=>{
 const s=setup();try{
  assert.equal((await s.req('lakes','POST',{name:'Wygonin',country:'Polska'})).status,409);
  const lake='wygonin',url='https://example.org/rules';
  assert.equal((await s.req(`lakes/${lake}/sources`,'POST',{url:'https://example.org/home',sourceType:'official'})).status,201);
  assert.equal((await s.req(`lakes/${lake}/facts`,'POST',{url,field:'cradle',value:'Kołyska jest wymagana',sourceType:'official'})).status,201);
  const p=(await s.req(`lakes/${lake}/profile`)).data;assert.equal(p.facts[0].status,'potwierdzone');assert.ok(p.sources.some(source=>source.url===url));
  const trip='poland-2027',suggested=(await s.req(`trips/${trip}/suggestions`)).data.items;assert.equal(suggested.length,1);
  const existing=(await s.req(`checklist?tripId=${trip}`)).data.items.length;
  assert.equal((await s.req(`trips/${trip}/suggestions`,'POST',{labels:['Wymyślone']})).status,400);
  assert.equal((await s.req(`checklist?tripId=${trip}`)).data.items.length,existing);
  assert.equal((await s.req(`trips/${trip}/suggestions`,'POST',{labels:[suggested[0].label]})).data.added,1);
  assert.equal((await s.req(`checklist?tripId=${trip}`)).data.items.length,existing+1);
  assert.equal((await s.req(`trips/${trip}/suggestions`,'POST',{labels:[suggested[0].label]})).data.added,0);
  await s.req(`lakes/${lake}/facts`,'POST',{url:'https://example.net/rules',field:'cradle',value:'Kołyska nie jest wymagana',sourceType:'operator'});
  const conflict=(await s.req(`lakes/${lake}/profile`)).data;assert.equal(conflict.status,'konflikt źródeł');
  assert.equal((await s.req(`trips/${trip}/suggestions`)).data.items.length,0,'conflicted rule cannot produce a new suggestion');
  await s.req(`lakes/${lake}/facts`,'POST',{url:'https://example.org/official-rules',field:'cradle',value:'Kołyska jest wymagana',sourceType:'official'});
  assert.equal((await s.req(`lakes/${lake}/profile`)).data.status,'konflikt źródeł','higher-ranked new source still reveals the disagreement');
  await s.req(`lakes/${lake}/facts`,'POST',{url:'https://example.net/rules',field:'cradle',value:'Kołyska jest wymagana',sourceType:'operator'});
  assert.equal((await s.req(`lakes/${lake}/profile`)).data.status==='konflikt źródeł',false,'resolved values clear stale conflicts');
  assert.equal((await s.req(`lakes/${lake}/facts`,'POST',{url:'https://127.0.0.1/rules',field:'rods',value:'2'})).status,400);
 }finally{s.DB.close();}
});
test('fixture research identifies candidates, extracts cited facts, detects changes and stops at quota',async()=>{
 const s=setup(),originalFetch=globalThis.fetch;
 try{
  const lake=(await s.req('lakes','POST',{name:'Fikcyjne Jezioro',country:'Polska'})).data.id;
  assert.match((await s.req(`lakes/${lake}/candidates`,'POST',{})).data.message,/konfiguracji/);
  s.env.TAVILY_API_KEY='fixture-only';let rule='Wymagana kołyska';
  globalThis.fetch=async(url,options)=>{
   assert.equal(new URL(url).hostname,'api.tavily.com');assert.match(options.headers.authorization,/fixture-only/);
   if(url.endsWith('/search'))return Response.json({results:[{title:'Fikcyjne Jezioro',url:'https://lake.example/rules',content:'Polska, region testowy'}]});
   return Response.json({results:[{url:'https://lake.example/rules',raw_content:`Kołyska: ${rule}\nLiczba wędek: 2`}]});
  };
  const candidates=await s.req(`lakes/${lake}/candidates`,'POST',{});assert.equal(candidates.data.candidates.length,1);
  s.DB.sqlite.prepare("UPDATE lake_research_runs SET started_at='2026-01-01' WHERE lake_id=?").run(lake);
  const first=await s.req(`lakes/${lake}/research`,'POST',{url:candidates.data.candidates[0].url,title:'Regulamin',sourceType:'official'});
  assert.equal(first.status,200);assert.equal(first.data.count,2);assert.equal(first.data.profile.sources.length,1);
  assert.equal((await s.req(`lakes/${lake}/research`,'POST',{url:'https://lake.example/rules'})).status,429);
  s.DB.sqlite.prepare("UPDATE lake_research_runs SET started_at='2026-01-01' WHERE lake_id=?").run(lake);
  rule='Kołyska nie jest wymagana';
  const second=await s.req(`lakes/${lake}/research`,'POST',{url:'https://lake.example/rules',sourceType:'official'});
  assert.equal(second.data.profile.changes.length,1);assert.equal(second.data.profile.changes[0].oldValue,'Wymagana kołyska');
  s.DB.sqlite.prepare("UPDATE lake_research_runs SET started_at=CURRENT_TIMESTAMP,credits_used=900 WHERE lake_id=?").run(lake);
  assert.equal((await s.req(`lakes/${lake}/research`,'POST',{url:'https://lake.example/rules'})).status,429);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM lake_sources WHERE lake_id=?').get(lake).n,1);
 }finally{globalThis.fetch=originalFetch;s.DB.close();}
});
test('unlabeled regulation requirements are cited but negated requirements never become checklist suggestions',()=>{
 const found=extractFacts('Kołyska jest wymagana na każdym stanowisku.\nPodbierak nie jest wymagany.');
 assert.equal(found.length,2);
 const facts=found.map(f=>({...f,status:'potwierdzone',url:'https://lake.example/rules',source_type:'regulation'}));
 assert.deepEqual(suggestions(facts).map(x=>x.label),['Kołyska / mata do odhaczania']);
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
