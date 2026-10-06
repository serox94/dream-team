import { ensureSchema } from './ensure-schema.js';
import { InputError, fail, has, pick, text, number, date, webUrl, facts, body } from './validation.js';
import { weatherForTrip } from './weather.js';
import {handleTripAdvice} from './trip-advice.js';
import {handleDeeperMedia} from './deeper-media.js';
import {handleDeeperAI} from './deeper-ai.js';
import {authConfigured,session,login,logout,loginAssets} from './auth.js';
import {handleLakeResearch,handleLakeCandidates,handleSuggestions,scheduledResearch,provider} from './lake-research.js';

const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff', ...extra }
});
const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const parseFacts = value => { try { return JSON.parse(value || '{}'); } catch { return {}; } };
const tables = { catches:'catches', spots:'spots', checklist:'checklist_items' };

async function tripExists(env, id) {
  const trip = await one(env,'SELECT * FROM trips WHERE id=?',id);
  if (!trip) fail('Nie znaleziono wyjazdu.',404);
  return trip;
}
async function scopedRow(request, env, table, id, includeDeleted = false) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!tripId) fail('Wymagany tripId.');
  const row = await one(env,`SELECT * FROM ${table} WHERE id=? AND trip_id=?${includeDeleted?'':' AND deleted_at IS NULL'}`,id,tripId);
  if (!row) fail('Nie znaleziono wpisu w wybranym wyjeździe.',404);
  return row;
}
async function bootstrap(env) {
  const timeZone=await one(env,"SELECT value FROM app_settings WHERE key='trip_time_zone'");
  const anglers = await all(env,`SELECT a.id,a.name,COALESCE(a.baseline_pb_kg,a.pb_kg) baselinePbKg,
    MAX(COALESCE(a.baseline_pb_kg,a.pb_kg),COALESCE(MAX(c.weight_kg),0)) pbKg
    FROM anglers a LEFT JOIN catches c ON c.angler_id=a.id AND c.deleted_at IS NULL GROUP BY a.id ORDER BY a.name`);
  const rawLakes = await all(env,'SELECT id,name,country,latitude,longitude,image_url imageUrl,facts_json factsJson,source_url sourceUrl FROM lakes ORDER BY name');
  const lakes = rawLakes.map(({factsJson,...l})=>({...l,facts:parseFacts(factsJson)}));
  const rawTrips = await all(env,`SELECT id,year,name,lake,lake_id lakeId,country,status,start_at start,end_at end,peg,latitude,longitude,lake_image lakeImage,facts_json factsJson,is_active isActive FROM trips ORDER BY is_active DESC,COALESCE(start_at,'9999') DESC`);
  const participants = await all(env,'SELECT trip_id tripId,angler_id anglerId FROM trip_participants');
  const stats = await all(env,`SELECT trip_id tripId,COUNT(*) fishCount,SUM(weight_kg) totalWeightKg,MAX(weight_kg) biggestFishKg FROM catches WHERE deleted_at IS NULL GROUP BY trip_id`);
  const leaders = await all(env,`SELECT c.trip_id tripId,c.weight_kg weightKg,a.name anglerName FROM catches c JOIN anglers a ON a.id=c.angler_id WHERE c.deleted_at IS NULL ORDER BY c.weight_kg DESC,c.caught_at,c.id`);
  const topSpots = await all(env,`SELECT c.trip_id tripId,COALESCE(s.name,c.spot) spot,COUNT(*) cnt FROM catches c LEFT JOIN spots s ON s.id=c.spot_id AND s.trip_id=c.trip_id WHERE c.deleted_at IS NULL AND TRIM(COALESCE(s.name,c.spot,'')) NOT IN ('','Brak') GROUP BY c.trip_id,COALESCE(s.name,c.spot) ORDER BY cnt DESC,spot`);
  const trips = rawTrips.map(({factsJson,...t})=>({...t,isActive:Boolean(t.isActive),facts:parseFacts(factsJson),
    lakeProfile:lakes.find(l=>l.id===t.lakeId)||null,
    participants:anglers.filter(a=>participants.some(p=>p.tripId===t.id&&p.anglerId===a.id)),
    stats:{fishCount:0,totalWeightKg:0,biggestFishKg:0,...stats.find(s=>s.tripId===t.id),biggestFishAngler:leaders.find(s=>s.tripId===t.id)?.anglerName||null,bestSpot:topSpots.find(s=>s.tripId===t.id)?.spot||null}
  }));
  const record = await one(env,`SELECT c.id,c.trip_id tripId,c.weight_kg weightKg,c.caught_at caughtAt,c.species,a.id anglerId,a.name anglerName,t.lake,t.year FROM catches c JOIN anglers a ON a.id=c.angler_id JOIN trips t ON t.id=c.trip_id WHERE c.deleted_at IS NULL ORDER BY c.weight_kg DESC,c.caught_at,c.id LIMIT 1`);
  return {app:{name:'DreamTeam',version:'1.2.0',activeTripId:trips.find(t=>t.isActive)?.id||null,timeZonePreference:timeZone?.value||'auto'},anglers,lakes,trips,
    allTime:{anglers,dreamTeamRecord:record||null}};
}
async function participantsFor(env, ids) {
  if (!Array.isArray(ids)||!ids.length||ids.length>30||ids.some(x=>typeof x!=='string')) fail('Wybierz od 1 do 30 uczestników.');
  const unique=[...new Set(ids)];
  for(const id of unique) if(!await one(env,'SELECT id FROM anglers WHERE id=?',id)) fail('Nieznany uczestnik.');
  return unique;
}
async function saveTrip(request,env,id,ctx) {
  const x=await body(request), current=id?await tripExists(env,id):{};
  const lakeId=text(pick(x,'lakeId',current.lake_id),'Łowisko',100,true);
  const lake=await one(env,'SELECT * FROM lakes WHERE id=?',lakeId);
  if(!lake) fail('Nie znaleziono łowiska.');
  // Existing trip knowledge, catches and maps must not silently become another lake.
  if(id&&current.lake_id!==lakeId) fail('Aby zmienić łowisko, dodaj nowy wyjazd. Obecny zachowa swoją historię.',409);
  const year=number(pick(x,'year',current.year),'Rok',2000,2200,false);
  if(!Number.isInteger(year)) fail('Rok musi być liczbą całkowitą.');
  const start=date(pick(x,'start',current.start_at),'Początek'),end=date(pick(x,'end',current.end_at),'Koniec');
  if(end&&!start) fail('Najpierw ustaw początek wyjazdu.');
  if(start&&end&&Date.parse(end)<=Date.parse(start)) fail('Powrót musi być późniejszy niż wyjazd.');
  const status=pick(x,'status',current.status||'planning');
  if(!['planning','active','archived'].includes(status)) fail('Nieprawidłowy status.');
  const name=text(pick(x,'name',current.name||`${lake.name} ${year}`),'Nazwa wyjazdu',150,true);
  const peg=text(pick(x,'peg',current.peg),'Stanowisko',200);
  const ids=has(x,'participantIds')?await participantsFor(env,x.participantIds):id?null:await participantsFor(env,[]);
  const statements=[];
  if(id){
    if(ids){
      const withCatches=await all(env,'SELECT DISTINCT angler_id id FROM catches WHERE trip_id=?',id);
      if(withCatches.some(a=>!ids.includes(a.id))) fail('Uczestnik z zapisanymi połowami musi pozostać w historii wyjazdu.',409);
    }
    statements.push(stmt(env,`UPDATE trips SET year=?,name=?,status=?,start_at=?,end_at=?,peg=?,is_active=CASE WHEN ?='archived' THEN 0 ELSE is_active END,updated_at=CURRENT_TIMESTAMP WHERE id=?`,year,name,status,start,end,peg,status,id));
  }else{
    id=crypto.randomUUID();
    statements.push(stmt(env,`INSERT INTO trips(id,year,name,lake,lake_id,country,status,start_at,end_at,peg,latitude,longitude,lake_image) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,year,name,lake.name,lakeId,lake.country,status,start,end,peg,lake.latitude,lake.longitude,lake.image_url));
  }
  if(ids){
    statements.push(stmt(env,'DELETE FROM trip_participants WHERE trip_id=?',id));
    for(const a of ids) statements.push(stmt(env,'INSERT INTO trip_participants(trip_id,angler_id) VALUES(?,?)',id,a));
  }
  if(x.copyChecklistFrom){
    if(Object.keys(current).length) fail('Kopiowanie checklisty jest dostępne przy tworzeniu wyjazdu.');
    await tripExists(env,x.copyChecklistFrom);
    statements.push(stmt(env,`INSERT INTO checklist_items(trip_id,category,label,assigned_to,packed,quantity,notes,sort_order) SELECT ?,category,label,assigned_to,0,quantity,notes,sort_order FROM checklist_items WHERE trip_id=? AND deleted_at IS NULL`,id,x.copyChecklistFrom));
  }
  await env.DB.batch(statements);
  if(!Object.keys(current).length&&provider(env)&&x.researchNow!==true){
    const setting=await one(env,"SELECT value FROM app_settings WHERE key='research_auto'");
    const recent=await one(env,"SELECT completed_at FROM lake_research_runs WHERE lake_id=? AND status='completed' ORDER BY completed_at DESC LIMIT 1",lakeId);
    const regulation=await one(env,"SELECT url FROM lake_sources WHERE lake_id=? AND source_type='regulation' ORDER BY checked_at DESC LIMIT 1",lakeId);
    const source=regulation?.url||lake.source_url;
    if(source&&setting?.value!=='off'&&(!recent||Date.now()-Date.parse(recent.completed_at)>30*86400000)){
      ctx?.waitUntil(handleLakeResearch(new Request('https://internal/api/research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:source,title:lake.name,sourceType:regulation?'regulation':'official'})}),env,lakeId,'research').catch(error=>console.warn('New trip research deferred:',error.message)));
    }
  }
  return json({ok:true,id},Object.keys(current).length?200:201);
}
async function saveLake(request,env,id) {
  const x=await body(request),c=id?await one(env,'SELECT * FROM lakes WHERE id=?',id):{};
  if(!c) fail('Nie znaleziono łowiska.',404);
  const name=text(pick(x,'name',c.name),'Nazwa łowiska',150,true),country=text(pick(x,'country',c.country),'Kraj',100);
  if(!id){const duplicate=await one(env,"SELECT id FROM lakes WHERE lower(replace(replace(name,'Jezioro ',''),'Łowisko ',''))=lower(replace(replace(?,'Jezioro ',''),'Łowisko ','')) AND lower(COALESCE(country,''))=lower(COALESCE(?,'')) LIMIT 1",name,country);if(duplicate)fail('To łowisko już istnieje. Wybierz jego profil z listy.',409);}
  const lat=number(pick(x,'latitude',c.latitude),'Szerokość GPS',-90,90),lon=number(pick(x,'longitude',c.longitude),'Długość GPS',-180,180);
  if((lat===null)!==(lon===null)) fail('Podaj obie współrzędne GPS albo pozostaw obie puste.');
  const f=has(x,'facts')?{...parseFacts(c.facts_json),...facts(x.facts)}:parseFacts(c.facts_json);
  const image=webUrl(pick(x,'imageUrl',c.image_url),'Zdjęcie'),source=webUrl(pick(x,'sourceUrl',c.source_url),'Źródło');
  if(id) await run(env,`UPDATE lakes SET name=?,country=?,latitude=?,longitude=?,image_url=?,facts_json=?,source_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,name,country,lat,lon,image,JSON.stringify(f),source,id);
  else {id=crypto.randomUUID();await run(env,`INSERT INTO lakes(id,name,country,latitude,longitude,image_url,facts_json,source_url) VALUES(?,?,?,?,?,?,?,?)`,id,name,country,lat,lon,image,JSON.stringify(f),source);}
  return json({ok:true,id},c.id?200:201);
}
async function createAngler(request,env){
  const x=await body(request),name=text(x.name,'Imię',60,true),pb=number(x.baselinePbKg??0,'Dotychczasowe PB',0,150,false);
  if(await one(env,'SELECT id FROM anglers WHERE lower(name)=lower(?)',name)) fail('Osoba o tej nazwie już istnieje.',409);
  const id=crypto.randomUUID();await run(env,'INSERT INTO anglers(id,name,pb_kg,baseline_pb_kg) VALUES(?,?,?,?)',id,name,pb,pb);
  return json({ok:true,id},201);
}
async function activate(env,id){
  const t=await tripExists(env,id);if(t.status==='archived') fail('Najpierw przywróć wyjazd z archiwum.',409);
  await env.DB.batch([stmt(env,'UPDATE trips SET is_active=0 WHERE is_active=1'),stmt(env,'UPDATE trips SET is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?',id)]);
  return json({ok:true});
}
async function saveCatch(request,env,id){
  const x=await body(request),c=id?await scopedRow(request,env,'catches',id):{};
  const tripId=id?c.trip_id:text(x.tripId,'Wyjazd',100,true);await tripExists(env,tripId);
  const anglerId=text(pick(x,'anglerId',c.angler_id),'Uczestnik',100,true);
  if(!await one(env,'SELECT angler_id FROM trip_participants WHERE trip_id=? AND angler_id=?',tripId,anglerId)) fail('Ta osoba nie jest uczestnikiem wyjazdu.');
  const weight=number(pick(x,'weightKg',c.weight_kg),'Waga',0.01,99.99,false);
  const caughtAt=date(pick(x,'caughtAt',c.caught_at||new Date().toISOString()),'Data połowu',false);
  if(Date.parse(caughtAt)>Date.now()+300000) fail('Data połowu nie może być z przyszłości.');
  const spotId=number(pick(x,'spotId',c.spot_id),'Spot',1,Number.MAX_SAFE_INTEGER);
  if(spotId&&!Number.isInteger(spotId)) fail('Nieprawidłowy spot.');
  const spot=spotId?await one(env,'SELECT name FROM spots WHERE id=? AND trip_id=? AND deleted_at IS NULL',spotId,tripId):null;
  if(spotId&&!spot) fail('Spot nie należy do wybranego wyjazdu lub został usunięty.');
  const spotName=spot?.name||text(pick(x,'spot',c.spot),'Nazwa spotu',100);
  const species=text(pick(x,'species',c.species||'Karp'),'Gatunek',50,true),bait=text(pick(x,'bait',c.bait),'Przynęta',100);
  const rig=text(pick(x,'rig',c.rig),'Rig',100),depth=number(pick(x,'depthM',c.depth_m),'Głębokość',0,100);
  const notes=text(pick(x,'notes',c.notes),'Notatka',2000),photo=webUrl(pick(x,'photoUrl',c.photo_url),'Zdjęcie');
  if(id) await run(env,`UPDATE catches SET angler_id=?,caught_at=?,weight_kg=?,species=?,spot=?,spot_id=?,bait=?,rig=?,depth_m=?,notes=?,photo_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,anglerId,caughtAt,weight,species,spotName,spotId,bait,rig,depth,notes,photo,id);
  else {const q=await run(env,`INSERT INTO catches(trip_id,angler_id,caught_at,weight_kg,species,spot,spot_id,bait,rig,depth_m,notes,photo_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,tripId,anglerId,caughtAt,weight,species,spotName,spotId,bait,rig,depth,notes,photo);id=q.meta.last_row_id;}
  return json({ok:true,id},c.id?200:201);
}
async function saveSpot(request,env,id){
  const x=await body(request),c=id?await scopedRow(request,env,'spots',id):{};
  const tripId=id?c.trip_id:text(x.tripId,'Wyjazd',100,true);await tripExists(env,tripId);
  const fields=[text(pick(x,'name',c.name),'Nazwa spotu',100,true),number(pick(x,'latitude',c.latitude),'Szerokość GPS',-90,90),number(pick(x,'longitude',c.longitude),'Długość GPS',-180,180),number(pick(x,'depthM',c.depth_m),'Głębokość',0,100),text(pick(x,'bottomType',c.bottom_type),'Dno',100),number(pick(x,'distanceM',c.distance_m),'Odległość',0,5000),text(pick(x,'notes',c.notes),'Notatka',2000),text(pick(x,'obstacles',c.obstacles),'Zaczepy',300),text(pick(x,'bestTime',c.best_time),'Pora',100),text(pick(x,'bestWind',c.best_wind),'Wiatr',100),text(pick(x,'weed',c.weed),'Zielsko',100),text(pick(x,'rig',c.rig),'Rig',100),text(pick(x,'bait',c.bait),'Przynęta',100)];
  if(id) await run(env,`UPDATE spots SET name=?,latitude=?,longitude=?,depth_m=?,bottom_type=?,distance_m=?,notes=?,obstacles=?,best_time=?,best_wind=?,weed=?,rig=?,bait=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,...fields,id);
  else {const q=await run(env,`INSERT INTO spots(trip_id,name,latitude,longitude,depth_m,bottom_type,distance_m,notes,obstacles,best_time,best_wind,weed,rig,bait) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,tripId,...fields);id=q.meta.last_row_id;}
  return json({ok:true,id},c.id?200:201);
}
async function saveChecklist(request,env,id){
  const x=await body(request),c=id?await scopedRow(request,env,'checklist_items',id):{};
  const tripId=id?c.trip_id:text(x.tripId,'Wyjazd',100,true);await tripExists(env,tripId);
  if(has(x,'packed')&&typeof x.packed!=='boolean') fail('packed musi być wartością true/false.');
  const fields=[text(pick(x,'category',c.category||'sprzęt'),'Kategoria',100,true),text(pick(x,'label',c.label),'Nazwa pozycji',200,true),text(pick(x,'assignedTo',c.assigned_to),'Przypisanie',100),pick(x,'packed',Boolean(c.packed))?1:0,text(pick(x,'quantity',c.quantity),'Ilość',100),text(pick(x,'notes',c.notes),'Notatka',2000),number(pick(x,'sortOrder',c.sort_order??0),'Kolejność',0,100000,false)];
  if(!await one(env,'SELECT id FROM checklist_categories WHERE name=? AND active=1',fields[0]))fail('Wybierz aktywną kategorię checklisty.');
  if(id) await run(env,`UPDATE checklist_items SET category=?,label=?,assigned_to=?,packed=?,quantity=?,notes=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,...fields,id);
  else {const q=await run(env,`INSERT INTO checklist_items(trip_id,category,label,assigned_to,packed,quantity,notes,sort_order) VALUES(?,?,?,?,?,?,?,?)`,tripId,...fields);id=q.meta.last_row_id;}
  return json({ok:true,id},c.id?200:201);
}
async function categories(request,env,id){
  if(request.method==='GET')return json({ok:true,categories:await all(env,'SELECT id,name,sort_order sortOrder,active FROM checklist_categories ORDER BY sort_order,name')});
  if(request.method==='POST'){
    const x=await body(request),name=text(x.name,'Nazwa kategorii',100,true);
    if(await one(env,'SELECT id FROM checklist_categories WHERE name=?',name))fail('Kategoria już istnieje.',409);
    const categoryId=crypto.randomUUID();await run(env,'INSERT INTO checklist_categories(id,name,sort_order) VALUES(?,?,COALESCE((SELECT MAX(sort_order)+1 FROM checklist_categories),1))',categoryId,name);
    return json({ok:true,id:categoryId},201);
  }
  const current=await one(env,'SELECT * FROM checklist_categories WHERE id=?',id);if(!current)fail('Nie znaleziono kategorii.',404);
  if(request.method==='PATCH'){
    const x=await body(request),name=text(pick(x,'name',current.name),'Nazwa kategorii',100,true);
    const order=number(pick(x,'sortOrder',current.sort_order),'Kolejność',0,100000,false);
    const active=has(x,'active')?Boolean(x.active):Boolean(current.active);
    if(has(x,'active')&&typeof x.active!=='boolean')fail('active musi być wartością true/false.');
    if(await one(env,'SELECT id FROM checklist_categories WHERE name=? AND id<>?',name,id))fail('Kategoria już istnieje.',409);
    const target=x.moveToId?await one(env,'SELECT name FROM checklist_categories WHERE id=? AND active=1',x.moveToId):null;
    if(x.moveToId&&(!target||x.moveToId===id))fail('Wybierz inną aktywną kategorię do przeniesienia.');
    if(target){await run(env,'UPDATE checklist_items SET category=?,updated_at=CURRENT_TIMESTAMP WHERE category=?',target.name,current.name);}
    await env.DB.batch([stmt(env,'UPDATE checklist_items SET category=?,updated_at=CURRENT_TIMESTAMP WHERE category=?',name,current.name),stmt(env,'UPDATE checklist_categories SET name=?,sort_order=?,active=? WHERE id=?',name,order,active?1:0,id)]);
    return json({ok:true});
  }
  if(request.method==='DELETE'){
    if(await one(env,'SELECT id FROM checklist_items WHERE category=? LIMIT 1',current.name))fail('Kategoria zawiera pozycje. Przenieś je do innej kategorii przed usunięciem.',409);
    await run(env,'DELETE FROM checklist_categories WHERE id=?',id);return json({ok:true});
  }
}
const userSettingKeys=['research_auto','research_languages','research_official_first','trip_time_zone'];
async function settings(request,env){
  if(request.method==='GET'){
    const rows=await all(env,"SELECT key,value,updated_at FROM app_settings WHERE key IN ('research_auto','research_languages','research_official_first','trip_time_zone')");
    const lastRun=await one(env,'SELECT completed_at FROM lake_research_runs WHERE status=? ORDER BY completed_at DESC LIMIT 1','completed');
    return json({ok:true,settings:Object.fromEntries(rows.map(r=>[r.key,r.value])),lastResearchAt:lastRun?.completed_at||null,researchProviderConfigured:Boolean(env.TAVILY_API_KEY),workersAiAvailable:Boolean(env.AI)&&env.AI_FREE_ONLY==='true',version:'1.2.0',schemaVersion:23});
  }
  const x=await body(request),statements=[];
  for(const [key,value] of Object.entries(x)){
    if(!userSettingKeys.includes(key))fail('Nieznane ustawienie.');
    const v=text(value,'Ustawienie',100,true);
    if(key==='research_auto'||key==='research_official_first'){if(!['on','off'].includes(v))fail('Wybierz on/off.');}
    if(key==='research_languages'&&(!v.split(',').every(lang=>['PL','EN','FR','DE','NL'].includes(lang))||new Set(v.split(',')).size!==v.split(',').length))fail('Nieprawidłowe języki.');
    if(key==='trip_time_zone'&&v!=='auto'&&!/^Europe\/[A-Za-z_]+$/.test(v))fail('Nieprawidłowa strefa czasowa.');
    statements.push(stmt(env,'INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)',key,v));
  }
  if(statements.length)await env.DB.batch(statements);
  return json({ok:true});
}
async function list(request,env,kind){
  const tripId=new URL(request.url).searchParams.get('tripId');if(!tripId) fail('Wymagany tripId.');await tripExists(env,tripId);
  if(kind==='catches')return json({ok:true,catches:await all(env,`SELECT c.id,c.trip_id tripId,c.angler_id anglerId,a.name anglerName,c.caught_at caughtAt,c.weight_kg weightKg,c.species,COALESCE(s.name,c.spot) spot,c.spot_id spotId,c.bait,c.rig,c.depth_m depthM,c.notes,c.photo_url photoUrl,c.created_at createdAt FROM catches c JOIN anglers a ON a.id=c.angler_id LEFT JOIN spots s ON s.id=c.spot_id AND s.trip_id=c.trip_id WHERE c.trip_id=? AND c.deleted_at IS NULL ORDER BY c.caught_at DESC,c.id DESC`,tripId)});
  if(kind==='spots')return json({ok:true,spots:await all(env,`SELECT id,trip_id tripId,name,latitude,longitude,depth_m depthM,bottom_type bottomType,distance_m distanceM,notes,obstacles,best_time bestTime,best_wind bestWind,weed,rig,bait,created_at createdAt FROM spots WHERE trip_id=? AND deleted_at IS NULL ORDER BY created_at,id`,tripId)});
  const items=await all(env,`SELECT id,trip_id tripId,category,label,assigned_to assignedTo,packed,quantity,notes,sort_order sortOrder,created_at createdAt FROM checklist_items WHERE trip_id=? AND deleted_at IS NULL ORDER BY category,sort_order,id`,tripId);
  return json({ok:true,items:items.map(x=>({...x,packed:Boolean(x.packed)}))});
}
async function removeOrRestore(request,env,kind,id,restore){
  const table=tables[kind],row=await scopedRow(request,env,table,id,true);
  const statements=[];
  // Preserve historical catch location even when the linked spot is hidden.
  if(kind==='spots'&&!restore)statements.push(stmt(env,'UPDATE catches SET spot=? WHERE trip_id=? AND spot_id=?',row.name,row.trip_id,id));
  statements.push(stmt(env,`UPDATE ${table} SET deleted_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,restore?null:new Date().toISOString(),id));
  await env.DB.batch(statements);return json({ok:true,id,recoverable:true});
}
async function exportData(env){
  const data={format:'dream-team-backup-v1',exportedAt:new Date().toISOString(),tables:{}};
  for(const table of ['anglers','lakes','trips','trip_participants','catches','spots','checklist_items','checklist_categories','lake_sources','lake_facts','lake_fact_changes','lake_research_runs','lake_candidate_searches','deeper_media','deeper_ai_attempts','trip_documents','trip_notes','app_settings'])data.tables[table]=await all(env,`SELECT * FROM ${table}`);
  return json(data,200,{'content-disposition':`attachment; filename="dream-team-backup-${new Date().toISOString().slice(0,10)}.json"`});
}
async function privateFetch(request,env,ctx){
    const url=new URL(request.url),method=request.method,path=url.pathname;
    try{
      if(!path.startsWith('/api/'))return env.ASSETS.fetch(path==='/'?new Request(new URL('/index.html',url),request):request);
      if(path==='/api/health'&&method==='GET'){
        const version=await one(env,"SELECT value FROM app_settings WHERE key='schema_version'");
        return json({ok:true,app:'dream-team',version:'1.2.0',database:'connected',schemaVersion:version?.value||null});
      }
      if(path==='/api/bootstrap'&&method==='GET')return json(await bootstrap(env));
      if(path==='/api/weather'&&method==='GET')return json(await weatherForTrip(env,url.searchParams.get('tripId')));
      const adviceMatch=path.match(/^\/api\/trips\/([^/]+)\/advice$/);
      if(adviceMatch&&method==='GET')return json(await handleTripAdvice(env,decodeURIComponent(adviceMatch[1])));
      if(path==='/api/export'&&method==='GET')return await exportData(env);
      if(path==='/api/checklist-categories'&&['GET','POST'].includes(method))return await categories(request,env);
      const mediaMatch=path.match(/^\/api\/deeper-media(?:\/([a-f0-9-]{36})(\/(?:image|analyze|analysis))?)?$/);
      if(mediaMatch){
        const action=mediaMatch[2];
        if(action==='/analyze'||action==='/analysis')return await handleDeeperAI(request,env,mediaMatch[1],action.slice(1));
        return await handleDeeperMedia(request,env,mediaMatch[1]||null,action||null);
      }
      if(path==='/api/lake-candidates'&&method==='POST')return await handleLakeCandidates(request,env);
      if(path==='/api/settings'&&['GET','PATCH'].includes(method))return await settings(request,env);
      let researchMatch=path.match(/^\/api\/lakes\/([^/]+)\/(profile|candidates|research|facts|sources)$/);
      if(researchMatch)return await handleLakeResearch(request,env,decodeURIComponent(researchMatch[1]),researchMatch[2]);
      researchMatch=path.match(/^\/api\/trips\/([^/]+)\/suggestions$/);
      if(researchMatch&&['GET','POST'].includes(method))return await handleSuggestions(request,env,decodeURIComponent(researchMatch[1]));
      let categoryMatch=path.match(/^\/api\/checklist-categories\/([^/]+)$/);
      if(categoryMatch&&['PATCH','DELETE'].includes(method))return await categories(request,env,decodeURIComponent(categoryMatch[1]));
      if(path==='/api/trash'&&method==='GET'){
        const tripId=url.searchParams.get('tripId');if(!tripId)fail('Wymagany tripId.');await tripExists(env,tripId);
        const items=[];
        for(const [kind,table] of Object.entries(tables)){
          const rows=await all(env,`SELECT * FROM ${table} WHERE trip_id=? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,tripId);
          for(const row of rows)items.push({id:row.id,kind,label:row.label||row.name||`${row.weight_kg} kg · ${row.species} · ${row.caught_at}`,deletedAt:row.deleted_at});
        }
        return json({ok:true,items});
      }
      if(path==='/api/trips'&&method==='POST')return await saveTrip(request,env,null,ctx);
      if(path==='/api/lakes'&&method==='POST')return await saveLake(request,env);
      if(path==='/api/anglers'&&method==='POST')return await createAngler(request,env);
      let m=path.match(/^\/api\/(trips|lakes)\/([^/]+)(\/activate)?$/);
      if(m){
        const id=decodeURIComponent(m[2]);
        if(m[1]==='trips'&&m[3]&&method==='POST')return await activate(env,id);
        if(!m[3]&&method==='PUT')return await (m[1]==='trips'?saveTrip(request,env,id,ctx):saveLake(request,env,id));
      }
      m=path.match(/^\/api\/(catches|spots|checklist)(?:\/(\d+)(\/restore)?)?$/);
      if(m){
        const kind=m[1],id=m[2]?Number(m[2]):null;
        if(!id&&method==='GET')return await list(request,env,kind);
        if((!id&&method==='POST')||(id&&!m[3]&&method===(kind==='checklist'?'PATCH':'PUT')))return await ({catches:saveCatch,spots:saveSpot,checklist:saveChecklist}[kind])(request,env,id);
        if(id&&((!m[3]&&method==='DELETE')||(m[3]&&method==='POST')))return await removeOrRestore(request,env,kind,id,Boolean(m[3]));
      }
      if(path==='/api/documents'&&method==='GET'){
        const id=url.searchParams.get('tripId');if(!id)fail('Wymagany tripId.');await tripExists(env,id);
        return json({ok:true,documents:await all(env,'SELECT id,kind,title,content,source_url sourceUrl,sort_order sortOrder FROM trip_documents WHERE trip_id=? ORDER BY sort_order,id',id)});
      }
      return json({ok:false,error:'Nie znaleziono endpointu.'},404);
    }catch(error){
      if(error instanceof InputError)return json({ok:false,error:error.message},error.status);
      console.error(error);return json({ok:false,error:'Błąd serwera. Spróbuj ponownie.'},500);
    }
}
function protectedResponse(result,active){
  const wrapped=new Response(result.body,result);
  wrapped.headers.set('cache-control','private, no-store');
  wrapped.headers.set('x-content-type-options','nosniff');
  wrapped.headers.set('referrer-policy','no-referrer');
  if(active?.refreshCookie)wrapped.headers.set('set-cookie',active.refreshCookie);
  return wrapped;
}
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url),path=url.pathname,method=request.method;
    if(loginAssets.has(path)&&method==='GET'){
      if(authConfigured(env)){
        await ensureSchema(env);
        if((path==='/login'||path==='/login.html')&&await session(request,env))return Response.redirect(url.origin+'/',302);
      }
      const assetPath=path==='/login'?'/login.html':path;
      const asset=await env.ASSETS.fetch(new Request(new URL(assetPath,url),request));
      const result=protectedResponse(asset);
      if(path==='/login'||path==='/login.html')result.headers.set('content-security-policy',"default-src 'none'; style-src 'self'; script-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
      return result;
    }
    if(!authConfigured(env))return json({ok:false,error:'Logowanie nie jest jeszcze skonfigurowane.'},503);
    try{
      // Login is public and checked by credentials and a rate limit. Some mobile
      // browser entry paths mark its form navigation as cross-site; private
      // mutations still require same-origin requests and a valid session.
      if(path!=='/api/login'&&['POST','PUT','PATCH','DELETE'].includes(method)){
        const origin=request.headers.get('origin');
        if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return json({ok:false,error:'Cross-origin write blocked'},403);
      }
      await ensureSchema(env);
      if(path==='/api/login'&&method==='POST')return await login(request,env);
      const active=await session(request,env);
      if(!active){
        if(path.startsWith('/api/'))return json({ok:false,error:'Wymagane logowanie.'},401);
        return protectedResponse(Response.redirect(url.origin+'/login',302));
      }
      if(path==='/api/logout'&&method==='POST')return await logout(env,active);
      return protectedResponse(await privateFetch(request,env,ctx),active);
    }catch(error){
      console.error('Private request failed:',error);
      return json({ok:false,error:'Błąd serwera. Spróbuj ponownie.'},500);
    }
  },
  async scheduled(_event,env,ctx){await ensureSchema(env);ctx.waitUntil(scheduledResearch(env));}
};
