import { InputError } from './validation.js';

const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>{throw new InputError(message,status);};
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const limitMessage='Limit automatycznego researchu wykorzystany — spróbuj później lub dodaj źródło ręcznie.';
const fields={official_name:['nazwa łowiska','official name','nom du lac','name des sees','naam van het meer'],address:['adres','address','adresse','anschrift'],phone:['telefon','phone','telephone','téléphone','tel','kontakt'],email:['e-mail','email'],area:['powierzchnia','area','surface','fläche','oppervlakte'],depth:['głębokość','depth','profondeur','tiefe','diepte'],bottom:['dno','bottom','fond','grund','bodem'],weed:['zielsko','weed','herbiers','kraut','waterplanten'],pegs:['stanowiska','pegs','swims','postes','plätze','stekken'],carp:['karpie','carp stock','carpes','karpfen','karpers'],record:['rekord','record','rekorde'],species:['gatunki','species','espèces','arten','soorten'],rods:['liczba wędek','rods allowed','cannes autorisées','ruten erlaubt','hengels toegestaan'],bait_boats:['łódki zanętowe','bait boats','bateaux amorceurs','futterboote','voerboten'],boats:['pontony','boats','bateaux','boote'],leadcore:['leadcore'],leaders:['leadery','leaders','vorfach'],hooks:['haczyki','hooks','hameçons','haken'],cradle:['kołyska','cradle','matelas de réception','ab hakmatte','onthaakmat'],landing_net:['podbierak','landing net','épuisette','kescher','schepnet'],sling:['sling','worek do ważenia','weigh sling'],disinfectant:['środek do dezynfekcji','disinfectant','antiseptique','desinfektionsmittel'],fish_storage:['przechowywanie ryb','retention','conservation des poissons','hältern'],arrival:['godziny przyjazdu','arrival','arrivée','anreise','aankomst'],departure:['godziny wyjazdu','departure','départ','abreise','vertrek'],parking:['parking','stationnement','parkplatz'],electricity:['prąd','electricity','électricité','strom','elektriciteit'],toilets:['wc','toilets','toilettes'],showers:['prysznic','shower','douche','dusche'],drinking_water:['woda pitna','drinking water','eau potable','trinkwasser'],freezer:['zamrażarka','freezer','congélateur','gefriertruhe'],shops:['sklep','shop','magasin','geschäft','winkel'],access:['dojazd','access','accès','zufahrt','toegang']};
const ruleGear={cradle:'Kołyska / mata do odhaczania',landing_net:'Duży podbierak',sling:'Worek do ważenia (sling)',disinfectant:'Środek do dezynfekcji ran ryb'};

export function safeSourceUrl(value){
  let url;try{url=new URL(value);}catch{fail('Podaj pełny adres HTTPS źródła.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.href.length>2048||!url.hostname.includes('.')||/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)||url.hostname.includes(':'))fail('Podaj publiczny adres HTTPS źródła.');
  url.hash='';return url.href;
}
const fieldName=value=>{if(!/^[a-z][a-z_]{1,40}$/.test(value||''))fail('Nieprawidłowe pole faktu.');return value;};
const sourcePriority={official:1,regulation:2,official_social:3,operator:4,directory:5,community:6,manual:7};
export function extractFacts(content){
  const rows=String(content||'').split(/\n+/).map(s=>s.replace(/^[\s>*#|–-]+/,'').trim()).filter(Boolean),out=[];
  for(const [field,labels] of Object.entries(fields)){
    for(const row of rows){
      const found=labels.find(label=>row.toLocaleLowerCase().startsWith(label.toLocaleLowerCase()+':'));
      if(!found)continue;
      const value=row.slice(found.length+1).replace(/\s*\|\s*$/,'').trim();
      if(!value||value.length>240||/^(?:n\/a|brak|none|unknown)$/i.test(value))continue;
      out.push({field,value,evidence:row.slice(0,280),confidence:.7});break;
    }
  }
  return out;
}
export function suggestions(facts){
  return facts.filter(f=>ruleGear[f.field]&&f.status==='potwierdzone'&&/wymagan|required|obligat|pflicht|verplicht|must|mandatory/i.test(f.value)).map(f=>({label:ruleGear[f.field],reason:f.value,sourceUrl:f.url,sourceType:f.source_type}));
}
export function provider(env){
  if(!env.TAVILY_API_KEY)return null;
  const call=async(path,payload)=>{
    const response=await fetch('https://api.tavily.com/'+path,{method:'POST',headers:{authorization:'Bearer '+env.TAVILY_API_KEY,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(14000)});
    if(response.status===429||response.status===402)fail(limitMessage,429);
    if(!response.ok)throw new Error('Dostawca researchu jest chwilowo niedostępny.');
    return response.json();
  };
  return {
    name:'Tavily',
    async candidates(name,country){const data=await call('search',{query:`${name} ${country} łowisko carp fishing official site`,search_depth:'basic',max_results:5,include_answer:false,include_raw_content:false,include_usage:true});return (data.results||[]).map(x=>({name:x.title?.slice(0,150)||name,region:x.content?.slice(0,150)||'',country,url:x.url,location:null})).filter(x=>{try{safeSourceUrl(x.url);return true;}catch{return false;}});},
    async extract(url){const data=await call('extract',{urls:[url],extract_depth:'basic',format:'markdown',include_usage:true});return String(data.results?.[0]?.raw_content||'').slice(0,160000);}
  };
}
async function reserve(db,lakeId,type,credits){
  const id=crypto.randomUUID(),month=new Date().toISOString().slice(0,7),since=new Date(Date.now()-10*60*1000).toISOString();
  const result=await run(db,`INSERT INTO lake_research_runs(id,lake_id,status,provider,credits_used,message)
    SELECT ?,?,'reserved','Tavily',?,? WHERE
    (SELECT COALESCE(SUM(credits_used),0) FROM lake_research_runs WHERE substr(started_at,1,7)=?) + ? <= 900
    AND (SELECT COALESCE(SUM(credits_used),0) FROM lake_research_runs WHERE lake_id=? AND substr(started_at,1,7)=?) + ? <= 8
    AND NOT EXISTS(SELECT 1 FROM lake_research_runs WHERE lake_id=? AND datetime(started_at)>=datetime(?))`,id,lakeId,credits,type,month,credits,lakeId,month,credits,lakeId,since);
  if(!result.meta.changes)fail(limitMessage,429);
  return id;
}
async function finish(db,id,status,message){await run(db,'UPDATE lake_research_runs SET status=?,message=?,completed_at=CURRENT_TIMESTAMP WHERE id=?',status,String(message||'').slice(0,300),id);}
async function saveSource(db,lakeId,url,title,type){
  const existing=await one(db,'SELECT id FROM lake_sources WHERE lake_id=? AND url=?',lakeId,url);
  const id=existing?.id||crypto.randomUUID();
  await run(db,'INSERT OR IGNORE INTO lake_sources(id,lake_id,url,title,source_type) VALUES(?,?,?,?,?)',id,lakeId,url,String(title||new URL(url).hostname).slice(0,150),type);
  await run(db,'UPDATE lake_sources SET checked_at=CURRENT_TIMESTAMP WHERE id=?',id);
  return id;
}
async function saveFact(db,lakeId,sourceId,fact){
  const existing=await one(db,'SELECT id FROM lake_facts WHERE lake_id=? AND field=? AND source_id=?',lakeId,fact.field,sourceId);
  const others=await all(db,`SELECT f.id,f.value,s.source_type FROM lake_facts f JOIN lake_sources s ON f.source_id=s.id WHERE f.lake_id=? AND f.field=? AND f.source_id<>?`,lakeId,fact.field,sourceId);
  const conflict=others.some(o=>o.value!==fact.value&&sourcePriority[o.source_type]<=sourcePriority[fact.sourceType]);
  if(existing){
    const old=await one(db,'SELECT value FROM lake_facts WHERE id=?',existing.id);
    if(old?.value!==fact.value)await run(db,'INSERT INTO lake_fact_changes(id,lake_id,field,old_value,new_value,source_id) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),lakeId,fact.field,old.value,fact.value,sourceId);
    await run(db,'UPDATE lake_facts SET value=?,evidence=?,confidence=?,status=?,checked_at=CURRENT_TIMESTAMP WHERE id=?',fact.value,fact.evidence||null,fact.confidence||.5,conflict?'sprzeczne':'potwierdzone',existing.id);
  }
  else await run(db,'INSERT INTO lake_facts(id,lake_id,field,value,source_id,evidence,confidence,status) VALUES(?,?,?,?,?,?,?,?)',crypto.randomUUID(),lakeId,fact.field,fact.value,sourceId,fact.evidence||null,fact.confidence||.5,conflict?'sprzeczne':'potwierdzone');
  if(conflict)for(const other of others)if(other.value!==fact.value)await run(db,"UPDATE lake_facts SET status='sprzeczne' WHERE id=?",other.id);
}
export async function profile(env,lakeId){
  const db=env.DB,lake=await one(db,'SELECT id,name,country,latitude,longitude,source_url sourceUrl,facts_json factsJson FROM lakes WHERE id=?',lakeId);
  if(!lake)fail('Nie znaleziono łowiska.',404);
  const facts=await all(db,`SELECT f.id,f.field,f.value,f.evidence,f.confidence,f.status,f.checked_at checkedAt,s.url,s.title sourceName,s.source_type FROM lake_facts f LEFT JOIN lake_sources s ON f.source_id=s.id WHERE f.lake_id=? ORDER BY f.field,s.source_type`,lakeId);
  const sources=await all(db,'SELECT id,url,title,source_type sourceType,checked_at checkedAt FROM lake_sources WHERE lake_id=? ORDER BY checked_at DESC',lakeId);
  const last=await one(db,"SELECT status,completed_at completedAt,message FROM lake_research_runs WHERE lake_id=? AND status<>'reserved' ORDER BY started_at DESC LIMIT 1",lakeId);
  const changes=await all(db,'SELECT field,old_value oldValue,new_value newValue,changed_at changedAt FROM lake_fact_changes WHERE lake_id=? ORDER BY changed_at DESC LIMIT 20',lakeId);
  const days=last?.completedAt?(Date.now()-Date.parse(last.completedAt))/86400000:Infinity;
  return {ok:true,lake:{...lake,factsJson:undefined,facts:JSON.parse(lake.factsJson||'{}')},facts,sources,changes,missingFields:Object.keys(fields).filter(field=>!facts.some(f=>f.field===field)),lastResearch:last,status:facts.some(f=>f.status==='sprzeczne')?'konflikt źródeł':days>30?'wymaga odświeżenia':'aktualne'};
}
export async function handleLakeResearch(request,env,lakeId,action){
  const db=env.DB,lake=await one(db,'SELECT id,name,country,source_url FROM lakes WHERE id=?',lakeId);if(!lake)fail('Nie znaleziono łowiska.',404);
  if(request.method==='GET'&&action==='profile')return reply(await profile(env,lakeId));
  if(request.method!=='POST')fail('Nieprawidłowa metoda.',405);
  const x=await request.json(),web=provider(env);
  if(action==='candidates'){
    if(!web)return reply({ok:true,candidates:[],message:'Automatyczny research wymaga konfiguracji dostawcy. Możesz dodać oficjalny URL ręcznie.'});
    const id=await reserve(db,lakeId,'candidates',1);
    try{const candidates=await web.candidates(lake.name,lake.country||'');await finish(db,id,'completed',`${candidates.length} kandydatów`);return reply({ok:true,candidates});}
    catch(error){await finish(db,id,'failed',error.message);throw error;}
  }
  if(action==='research'){
    const url=safeSourceUrl(x.url||lake.source_url),title=String(x.title||lake.name).slice(0,150),sourceType=['official','regulation','operator','manual'].includes(x.sourceType)?x.sourceType:'manual';
    if(!web)return reply({ok:false,error:'Automatyczny research nie jest skonfigurowany. Zapisz źródło i fakty ręcznie.'},503);
    const id=await reserve(db,lakeId,'extract',2);
    try{
      const content=await web.extract(url);if(!content)fail('Brak treści do ekstrakcji. Dodaj fakty ręcznie.',422);
      const found=extractFacts(content),sourceId=await saveSource(db,lakeId,url,title,sourceType);
      for(const fact of found)await saveFact(db,lakeId,sourceId,{...fact,sourceType});
      await finish(db,id,'completed',`${found.length} faktów`);
      return reply({ok:true,count:found.length,profile:await profile(env,lakeId)});
    }catch(error){await finish(db,id,'failed',error.message);throw error;}
  }
  if(action==='facts'){
    const url=safeSourceUrl(x.url),field=fieldName(x.field),value=String(x.value||'').trim();if(!value||value.length>500)fail('Podaj krótki fakt (maksymalnie 500 znaków).');
    const sourceType=['official','regulation','official_social','operator','directory','community','manual'].includes(x.sourceType)?x.sourceType:'manual';
    const sourceId=await saveSource(db,lakeId,url,x.title,sourceType);
    await saveFact(db,lakeId,sourceId,{field,value,evidence:String(x.evidence||'').slice(0,280),confidence:.5,sourceType});
    return reply({ok:true,profile:await profile(env,lakeId)},201);
  }
  if(action==='sources'){
    const url=safeSourceUrl(x.url),sourceType=['official','regulation','official_social','operator','directory','community','manual'].includes(x.sourceType)?x.sourceType:'manual';
    await saveSource(db,lakeId,url,x.title,sourceType);
    return reply({ok:true,profile:await profile(env,lakeId)},201);
  }
  fail('Nie znaleziono funkcji.',404);
}
export async function handleSuggestions(request,env,tripId){
  const trip=await one(env.DB,'SELECT id,lake_id FROM trips WHERE id=?',tripId);if(!trip)fail('Nie znaleziono wyjazdu.',404);
  const data=await profile(env,trip.lake_id),items=suggestions(data.facts);
  if(request.method==='GET')return reply({ok:true,items,advice:data.facts.filter(f=>['bottom','depth','weed'].includes(f.field)).map(f=>({type:'SUGESTIA WĘDKARSKA',field:f.field,value:f.value,sourceUrl:f.url}))});
  const x=await request.json();if(!Array.isArray(x.labels)||x.labels.length>20)fail('Wybierz pozycje do dodania.');
  const labels=[...new Set(x.labels)];if(labels.some(l=>!items.some(i=>i.label===l)))fail('Nieznana propozycja.');
  const existing=await all(env.DB,'SELECT label FROM checklist_items WHERE trip_id=? AND deleted_at IS NULL',tripId);
  const additions=labels.filter(label=>!existing.some(i=>i.label.toLocaleLowerCase('pl')===label.toLocaleLowerCase('pl')));
  if(additions.length)await env.DB.batch(additions.map(label=>env.DB.prepare("INSERT INTO checklist_items(trip_id,category,label,packed,sort_order) VALUES(?,'sprzęt',?,0,0)").bind(tripId,label)));
  return reply({ok:true,added:additions.length});
}
export async function scheduledResearch(env){
  if(!provider(env))return;
  const setting=await one(env.DB,"SELECT value FROM app_settings WHERE key='research_auto'");
  if(setting?.value==='off')return;
  const trips=await all(env.DB,`SELECT t.lake_id lakeId,t.start_at start,COALESCE((SELECT s.url FROM lake_sources s WHERE s.lake_id=l.id AND s.source_type='regulation' ORDER BY s.checked_at DESC LIMIT 1),l.source_url) url,l.name,
    CASE WHEN EXISTS(SELECT 1 FROM lake_sources s WHERE s.lake_id=l.id AND s.source_type='regulation') THEN 'regulation' ELSE 'official' END sourceType,
    (SELECT MAX(completed_at) FROM lake_research_runs r WHERE r.lake_id=t.lake_id AND r.status='completed') lastCheck
    FROM trips t JOIN lakes l ON l.id=t.lake_id WHERE t.status='planning' AND t.start_at IS NOT NULL AND (l.source_url IS NOT NULL OR EXISTS(SELECT 1 FROM lake_sources s WHERE s.lake_id=l.id AND s.source_type='regulation')) ORDER BY t.start_at LIMIT 50`);
  const today=new Date().toISOString().slice(0,10),done=new Set();
  for(const trip of trips){
    if(done.size>=5)break;
    const days=Math.ceil((Date.parse(trip.start)-Date.parse(today))/86400000);
    if(![30,7].includes(days)||done.has(trip.lakeId)||trip.lastCheck&&Date.now()-Date.parse(trip.lastCheck)<5*86400000)continue;
    done.add(trip.lakeId);
    try{await handleLakeResearch(new Request('https://internal/api/research',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:trip.url,title:trip.name,sourceType:trip.sourceType})}),env,trip.lakeId,'research');}
    catch(error){console.warn('Lake research due check failed:',trip.lakeId,error.message);}
  }
}
