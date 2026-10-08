import { InputError } from './validation.js';

const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>{throw new InputError(message,status);};
const one=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const limitMessage='Limit automatycznego researchu wykorzystany — spróbuj później lub dodaj źródło ręcznie.';
const fields={official_name:['nazwa łowiska','official name','lake name','nom du lac','name des sees','naam van het meer'],address:['adres','address','adresse','anschrift'],phone:['telefon','phone','telephone','téléphone','tel','kontakt'],email:['e-mail','email'],area:['powierzchnia','area','lake size','water size','surface','fläche','oppervlakte'],depth:['głębokość','maksymalna głębokość','depth','maximum depth','max depth','profondeur','tiefe','diepte'],bottom:['dno','bottom','lake bed','fond','grund','bodem'],weed:['zielsko','weed','weed level','herbiers','kraut','waterplanten'],pegs:['stanowiska','liczba stanowisk','pegs','number of pegs','swims','number of swims','postes','plätze','stekken'],carp:['karpie','carp','carp stock','carpes','karpfen','karpers'],record:['rekord','rekord karpia','record','lake record','carp record','rekorde'],species:['gatunki','species','fish species','espèces','arten','soorten'],rods:['liczba wędek','limit wędek','rods allowed','rod limit','number of rods','cannes autorisées','ruten erlaubt','hengels toegestaan'],bait_boats:['łódki zanętowe','łódka zanętowa','bait boats','bait boat','bateaux amorceurs','futterboote','voerboten'],boats:['pontony','boats','boat use','bateaux','boote'],leadcore:['leadcore'],leaders:['leadery','leaders','vorfach'],hooks:['haczyki','hooks','hameçons','haken'],cradle:['kołyska','cradle','unhooking mat','matelas de réception','ab hakmatte','onthaakmat'],landing_net:['podbierak','landing net','épuisette','kescher','schepnet'],sling:['sling','worek do ważenia','weigh sling'],disinfectant:['środek do dezynfekcji','disinfectant','antiseptique','desinfektionsmittel'],fish_storage:['przechowywanie ryb','retention','fish retention','conservation des poissons','hältern'],arrival:['godziny przyjazdu','arrival','arrival time','arrivée','anreise','aankomst'],departure:['godziny wyjazdu','departure','departure time','départ','abreise','vertrek'],parking:['parking','stationnement','parkplatz'],electricity:['prąd','electricity','power','électricité','strom','elektriciteit'],toilets:['wc','toilet','toilets','toilettes'],showers:['prysznic','prysznice','shower','showers','douche','dusche'],drinking_water:['woda pitna','drinking water','potable water','eau potable','trinkwasser'],freezer:['zamrażarka','freezer','congélateur','gefriertruhe'],shops:['sklep','sklepy','shop','shops','magasin','geschäft','winkel'],access:['dojazd','access','road access','accès','zufahrt','toegang']};
fields.rules=['regulamin','rules','règlement','regeln','regels'];
fields.map=['mapa łowiska','lake map','carte du lac','gewässerkarte','kaart'];
fields.fridge=['lodówka','fridge','réfrigérateur','kühlschrank','koelkast'];
const ruleGear={cradle:'Kołyska / mata do odhaczania',landing_net:'Duży podbierak',sling:'Worek do ważenia (sling)',disinfectant:'Środek do dezynfekcji ran ryb'};

export function safeSourceUrl(value){
  let url;try{url=new URL(value);}catch{fail('Podaj pełny adres HTTPS źródła.');}
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.href.length>2048||!url.hostname.includes('.')||/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname)||url.hostname.includes(':'))fail('Podaj publiczny adres HTTPS źródła.');
  url.hash='';return url.href;
}
const fieldName=value=>{if(!/^[a-z][a-z_]{1,40}$/.test(value||''))fail('Nieprawidłowe pole faktu.');return value;};
const sourcePriority={official:1,regulation:2,official_social:3,operator:4,directory:5,community:6,manual:7};
const coordinatesFromText=value=>{
  const match=String(value||'').match(/(?:^|[^\d])(-?\d{1,2}\.\d{4,})\s*[,;]\s*(-?\d{1,3}\.\d{4,})(?:[^\d]|$)/);
  if(!match)return null;
  const latitude=Number(match[1]),longitude=Number(match[2]);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null;
};
const inferredSourceType=(url,title,confirmedHost,confirmedType)=>{
  const host=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
  const same=host===confirmedHost||host.endsWith('.'+confirmedHost)||confirmedHost.endsWith('.'+host);
  if(/regul|rules?|règlement|regeln|regels|terms|fishery-rules/i.test(String(title||'')+' '+url))return 'regulation';
  if(same&&['official','regulation'].includes(confirmedType))return 'official';
  return 'operator';
};
export function extractFacts(content){
  const escapedLabel=label=>label.replace(/[.*+?^$(){}|[\]\\]/g,'\\export function extractFacts(content){
  const escapedLabel=label=>label.replace(/[.*+?^$(){}|[\]\\]/g,'\\export function extractFacts(content){
  const rows=');
');
  const rows=String(content||'').split(/\n+/).map(s=>s.replace(/^[\s>*#|–-]+/,'').trim()).filter(Boolean),out=[];
  for(const [field,labels] of Object.entries(fields)){
    for(const row of rows){
      const found=labels.find(label=>new RegExp('^'+escapedLabel(label)+'\\s*(?::|\\||–|-)\\s*','i').test(row));
      if(!found)continue;
      const value=row.replace(new RegExp('^'+escapedLabel(found)+'\\s*(?::|\\||–|-)\\s*','i'),'').replace(/\s*\|\s*$/,'').trim();
      if(!value||value.length>240||/^(?:n\/a|brak|none|unknown)$/i.test(value))continue;
      // Only unique localized labels identify a language; shared labels remain unknown.
      const matches=labels.map((item,index)=>item===found?index:-1).filter(index=>index>=0);
      out.push({field,value,evidence:row.slice(0,280),sourceLanguage:matches.length===1?['pl','en','fr','de','nl'][matches[0]]:null,confidence:.7});break;
    }
  }
  for(const field of Object.keys(ruleGear)){
    if(out.some(f=>f.field===field))continue;
    const row=rows.find(line=>line.length<=240&&fields[field].some(label=>line.toLocaleLowerCase().includes(label.toLocaleLowerCase()))&&/wymagan|obowiązkow|required|mandatory|obligat|pflicht|verplicht|must/i.test(line));
    if(row)out.push({field,value:row.slice(0,240),evidence:row.slice(0,280),confidence:.6});
  }
  return out;
}
export function suggestions(facts){
  return facts.filter(f=>ruleGear[f.field]&&f.status==='potwierdzone'&&/wymagan|required|obligat|pflicht|verplicht|must|mandatory/i.test(f.value)&&!/nie\s+(?:jest\s+)?wymagan|not\s+(?:be\s+)?required|non\s+obligat|nicht\s+(?:erforderlich|vorgeschrieben)|niet\s+verplicht/i.test(f.value)).map(f=>({label:ruleGear[f.field],reason:f.value,sourceUrl:f.url,sourceType:f.source_type}));
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
    async candidates(name,country,preferences={}){
      const labels={PL:'łowisko',EN:'carp lake',FR:'étang carpe',DE:'Karpfensee',NL:'karpervijver'};
      const terms=(preferences.languages||'PL,EN,FR,DE,NL').split(',').map(lang=>labels[lang]).filter(Boolean).join(' ');
      const data=await call('search',{query:`${name} ${country} ${terms} ${preferences.official==='off'?'fishing information':'official website regulations'}`,search_depth:'basic',max_results:5,include_answer:false,include_raw_content:false,include_usage:true});
      return (data.results||[]).map(item=>{let url;try{url=safeSourceUrl(item.url);}catch{return null;}const coords=coordinatesFromText(item.content);return {name:item.title?.slice(0,150)||name,region:(item.content||'').match(/(?:region|miejscowość|locality|commune|ort|plaats)\s*[:–-]\s*([^.,;\n]{2,80})/i)?.[1]||'Nieustalony region',country,url,location:coords?`${coords.latitude}, ${coords.longitude}`:null};}).filter(Boolean);
    },
    async research(name,country,confirmedUrl,confirmedType='manual',preferences={}){
      const safeConfirmed=safeSourceUrl(confirmedUrl),host=new URL(safeConfirmed).hostname.replace(/^www\./,'').toLowerCase();
      const languageTerms={PL:'regulamin głębokość stanowiska prąd prysznic',EN:'rules depth swims electricity shower',FR:'règlement profondeur postes électricité douche',DE:'regeln tiefe plätze strom dusche',NL:'regels diepte stekken elektriciteit douche'};
      const terms=(preferences.languages||'PL,EN,FR,DE,NL').split(',').map(lang=>languageTerms[lang]).filter(Boolean).join(' ');
      const scoped=['official','regulation'].includes(confirmedType)?` site:${host}`:'';
      const search=await call('search',{query:`${name} ${country} ${terms} carp record bait boat rods toilets parking map${scoped}`,search_depth:'basic',max_results:6,include_answer:false,include_raw_content:false,include_usage:true});
      const discovered=(search.results||[]).map(item=>{try{return {url:safeSourceUrl(item.url),title:String(item.title||'').slice(0,150)};}catch{return null;}}).filter(Boolean);
      const unique=[];
      for(const item of [{url:safeConfirmed,title:name},...discovered])if(!unique.some(row=>row.url===item.url))unique.push(item);
      const selected=unique.slice(0,5);
      const extracted=await call('extract',{urls:selected.map(item=>item.url),extract_depth:'basic',format:'markdown',include_usage:true});
      const byUrl=new Map(selected.map(item=>[item.url,item]));
      return (extracted.results||[]).map(result=>{let url;try{url=safeSourceUrl(result.url);}catch{return null;}const base=byUrl.get(url)||{title:new URL(url).hostname};return {url,title:base.title||new URL(url).hostname,sourceType:url===safeConfirmed?confirmedType:inferredSourceType(url,base.title,host,confirmedType),content:String(result.raw_content||'').slice(0,160000)};}).filter(page=>page&&page.content);
    },
    async extract(url){const data=await call('extract',{urls:[url],extract_depth:'basic',format:'markdown',include_usage:true});return String(data.results?.[0]?.raw_content||'').slice(0,160000);}
  };
}
async function reserve(db,lakeId,type,credits){
  const id=crypto.randomUUID(),month=new Date().toISOString().slice(0,7),since=new Date(Date.now()-10*60*1000).toISOString();
  const result=await run(db,`INSERT INTO lake_research_runs(id,lake_id,status,provider,credits_used,message)
    SELECT ?,?,'reserved','Tavily',?,? WHERE
    (SELECT COALESCE(SUM(credits_used),0) FROM lake_research_runs WHERE substr(started_at,1,7)=?) + (SELECT COALESCE(SUM(credits_used),0) FROM lake_candidate_searches WHERE substr(started_at,1,7)=?) + ? <= 900
    AND (SELECT COALESCE(SUM(credits_used),0) FROM lake_research_runs WHERE lake_id=? AND substr(started_at,1,7)=?) + ? <= 8
    AND NOT EXISTS(SELECT 1 FROM lake_research_runs WHERE lake_id=? AND datetime(started_at)>=datetime(?))`,id,lakeId,credits,type,month,month,credits,lakeId,month,credits,lakeId,since);
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
  const sourceLanguage=['pl','en','fr','de','nl'].includes(fact.sourceLanguage)?fact.sourceLanguage:null;
  const originalText=String(fact.evidence||fact.value).slice(0,500),normalizedValue=fact.value;
  const existing=await one(db,'SELECT id FROM lake_facts WHERE lake_id=? AND field=? AND source_id=?',lakeId,fact.field,sourceId);
  if(existing){
    const old=await one(db,'SELECT value FROM lake_facts WHERE id=?',existing.id);
    if(old?.value!==fact.value)await run(db,'INSERT INTO lake_fact_changes(id,lake_id,field,old_value,new_value,source_id) VALUES(?,?,?,?,?,?)',crypto.randomUUID(),lakeId,fact.field,old.value,fact.value,sourceId);
    await run(db,'UPDATE lake_facts SET value=?,evidence=?,original_text=?,source_language=?,normalized_value=?,translation_pl=CASE WHEN value=? THEN translation_pl ELSE NULL END,translation_en=CASE WHEN value=? THEN translation_en ELSE NULL END,confidence=?,checked_at=CURRENT_TIMESTAMP WHERE id=?',fact.value,fact.evidence||null,originalText,sourceLanguage,normalizedValue,fact.value,fact.value,fact.confidence||.5,existing.id);
  }
  else await run(db,'INSERT INTO lake_facts(id,lake_id,field,value,source_id,evidence,original_text,source_language,normalized_value,confidence,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',crypto.randomUUID(),lakeId,fact.field,fact.value,sourceId,fact.evidence||null,originalText,sourceLanguage,normalizedValue,fact.confidence||.5,'potwierdzone');
  const values=await all(db,'SELECT DISTINCT value FROM lake_facts WHERE lake_id=? AND field=?',lakeId,fact.field);
  await run(db,'UPDATE lake_facts SET status=? WHERE lake_id=? AND field=?',values.length>1?'sprzeczne':'potwierdzone',lakeId,fact.field);
}
export async function profile(env,lakeId){
  const db=env.DB,lake=await one(db,'SELECT id,name,country,latitude,longitude,source_url sourceUrl,facts_json factsJson FROM lakes WHERE id=?',lakeId);
  if(!lake)fail('Nie znaleziono łowiska.',404);
  const facts=await all(db,`SELECT f.id,f.field,f.value,f.evidence,f.original_text originalText,f.source_language sourceLanguage,f.normalized_value normalizedValue,f.translation_pl translationPl,f.translation_en translationEn,f.confidence,f.status,f.checked_at checkedAt,s.url,s.title sourceName,s.source_type FROM lake_facts f LEFT JOIN lake_sources s ON f.source_id=s.id WHERE f.lake_id=? ORDER BY f.field`,lakeId);
  facts.sort((a,b)=>a.field.localeCompare(b.field)||(sourcePriority[a.source_type]||9)-(sourcePriority[b.source_type]||9));
  const sources=await all(db,'SELECT id,url,title,source_type sourceType,checked_at checkedAt FROM lake_sources WHERE lake_id=? ORDER BY checked_at DESC',lakeId);
  const last=await one(db,"SELECT status,completed_at completedAt,message FROM lake_research_runs WHERE lake_id=? AND status<>'reserved' ORDER BY started_at DESC LIMIT 1",lakeId);
  const changes=await all(db,'SELECT field,old_value oldValue,new_value newValue,changed_at changedAt FROM lake_fact_changes WHERE lake_id=? ORDER BY changed_at DESC LIMIT 20',lakeId);
  const days=last?.completedAt?(Date.now()-Date.parse(last.completedAt))/86400000:Infinity;
  const checks=[...Object.keys(fields).map(field=>({field,found:facts.some(f=>f.field===field&&f.status==='potwierdzone')})),{field:'country',found:Boolean(lake.country)},{field:'gps',found:lake.latitude!=null&&lake.longitude!=null}];
  return {ok:true,lake:{...lake,factsJson:undefined,facts:JSON.parse(lake.factsJson||'{}')},facts,sources,changes,coverage:{found:checks.filter(c=>c.found).length,total:checks.length,checks},missingFields:checks.filter(c=>!c.found).map(c=>c.field),lastResearch:last,status:facts.some(f=>f.status==='sprzeczne')?'konflikt źródeł':days>30?'wymaga odświeżenia':'aktualne'};
}
export async function handleLakeCandidates(request,env){
  const x=await request.json(),name=String(x.name||'').trim(),country=String(x.country||'').trim();
  if(name.length<2||name.length>150||country.length<2||country.length>100)fail('Wpisz nazwę łowiska i kraj.');
  const web=provider(env);
  if(!web)return reply({ok:true,candidates:[],providerConfigured:false,message:'AUTOMATYCZNY RESEARCH: OCZEKUJE NA TAVILY_API_KEY. Możesz utworzyć wyjazd i uzupełnić źródło później.'});
  const key=(name+'|'+country).toLocaleLowerCase('pl').normalize('NFKC'),month=new Date().toISOString().slice(0,7),since=new Date(Date.now()-10*60*1000).toISOString(),id=crypto.randomUUID();
  const reserved=await run(env.DB,`INSERT INTO lake_candidate_searches(id,query_key,status,credits_used) SELECT ?,?,'reserved',1 WHERE
    (SELECT COALESCE(SUM(credits_used),0) FROM lake_candidate_searches WHERE substr(started_at,1,7)=?) < 100
    AND (SELECT COALESCE(SUM(credits_used),0) FROM lake_candidate_searches WHERE substr(started_at,1,7)=?) + (SELECT COALESCE(SUM(credits_used),0) FROM lake_research_runs WHERE substr(started_at,1,7)=?) < 900
    AND NOT EXISTS(SELECT 1 FROM lake_candidate_searches WHERE query_key=? AND datetime(started_at)>=datetime(?))`,id,key,month,month,month,key,since);
  if(!reserved.meta.changes)fail(limitMessage,429);
  try{const rows=await all(env.DB,"SELECT key,value FROM app_settings WHERE key IN ('research_languages','research_official_first')"),values=Object.fromEntries(rows.map(r=>[r.key,r.value]));const candidates=await web.candidates(name,country,{languages:values.research_languages,official:values.research_official_first});await run(env.DB,"UPDATE lake_candidate_searches SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?",id);return reply({ok:true,candidates,providerConfigured:true});}
  catch(error){await run(env.DB,"UPDATE lake_candidate_searches SET status='failed',completed_at=CURRENT_TIMESTAMP WHERE id=?",id);throw error;}
}
export async function handleLakeResearch(request,env,lakeId,action){
  const db=env.DB,lake=await one(db,'SELECT id,name,country,source_url FROM lakes WHERE id=?',lakeId);if(!lake)fail('Nie znaleziono łowiska.',404);
  if(request.method==='GET'&&action==='profile')return reply(await profile(env,lakeId));
  if(request.method!=='POST')fail('Nieprawidłowa metoda.',405);
  const x=await request.json(),web=provider(env);
  if(action==='candidates'){
    if(!web)return reply({ok:true,candidates:[],message:'Automatyczny research wymaga konfiguracji dostawcy. Możesz dodać oficjalny URL ręcznie.'});
    const id=await reserve(db,lakeId,'candidates',1);
    try{const rows=await all(db,"SELECT key,value FROM app_settings WHERE key IN ('research_languages','research_official_first')"),values=Object.fromEntries(rows.map(r=>[r.key,r.value]));const candidates=await web.candidates(lake.name,lake.country||'',{languages:values.research_languages,official:values.research_official_first});await finish(db,id,'completed',`${candidates.length} kandydatów`);return reply({ok:true,candidates});}
    catch(error){await finish(db,id,'failed',error.message);throw error;}
  }
  if(action==='research'){
    const url=safeSourceUrl(x.url||lake.source_url),title=String(x.title||lake.name).slice(0,150),sourceType=['official','regulation','operator','manual'].includes(x.sourceType)?x.sourceType:'manual';
    if(!web)return reply({ok:false,error:'Automatyczny research nie jest skonfigurowany. Zapisz źródło i fakty ręcznie.'},503);
    const id=await reserve(db,lakeId,'extract',2);
    try{
      const rows=await all(db,"SELECT key,value FROM app_settings WHERE key IN ('research_languages','research_official_first')");
      const preferences=Object.fromEntries(rows.map(row=>[row.key,row.value]));
      const pages=await web.research(lake.name,lake.country||'',url,sourceType,{languages:preferences.research_languages,official:preferences.research_official_first});
      if(!pages.length)fail('Brak treści do ekstrakcji. Dodaj fakty ręcznie.',422);
      let count=0;
      for(const page of pages){
        const found=extractFacts(page.content),pageType=['official','regulation','operator','manual'].includes(page.sourceType)?page.sourceType:sourceType;
        const sourceId=await saveSource(db,lakeId,page.url,page.title||title,pageType);
        for(const fact of found){await saveFact(db,lakeId,sourceId,{...fact,sourceType:pageType});count++;}
      }
      await finish(db,id,'completed',`${count} faktów z ${pages.length} źródeł`);
      return reply({ok:true,count,sourcesChecked:pages.length,profile:await profile(env,lakeId)});
    }catch(error){await finish(db,id,'failed',error.message);throw error;}
  }
  if(action==='facts'){
    const url=safeSourceUrl(x.url),field=fieldName(x.field),value=String(x.value||'').trim();if(!value||value.length>500)fail('Podaj krótki fakt (maksymalnie 500 znaków).');
    const sourceType=['official','regulation','official_social','operator','directory','community','manual'].includes(x.sourceType)?x.sourceType:'manual';
    const sourceId=await saveSource(db,lakeId,url,x.title,sourceType);
    await saveFact(db,lakeId,sourceId,{field,value,evidence:String(x.evidence||'').slice(0,280),sourceLanguage:x.sourceLanguage,confidence:.5,sourceType});
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
