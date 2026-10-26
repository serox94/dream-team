import {InputError} from './validation.js';
import {tavilyUsage} from './research-provider-status.js';
import {parseResearch,discoverUrls,sourceScope,gpsCandidates,concepts,PARSER_VERSION} from './research-facts.js';
const all=async(db,s,...v)=>(await db.prepare(s).bind(...v).all()).results,one=(db,s,...v)=>db.prepare(s).bind(...v).first(),run=(db,s,...v)=>db.prepare(s).bind(...v).run();
const fail=(code,status=400)=>{throw new InputError(researchErrors[code]||researchErrors.TAVILY_HTTP_ERROR,status,code);};
export const researchErrors={"RESEARCH_SOURCE_CONFLICT": "Trwa już analiza innego źródła. Poczekaj na jej zakończenie.", "RESEARCH_RETRY_REQUIRES_RECONCILED_USAGE": "Przed wznowieniem uzgodnij zużycie poprzedniej analizy.", "TAVILY_FREE_BUDGET_UNVERIFIED": "Nie potwierdzono dostępnego bezpłatnego limitu Tavily. Wywołanie zatrzymane.", "RESEARCH_LOCAL_BUDGET_EXHAUSTED": "Osiągnięto lokalny limit researchu. Wywołanie zatrzymane.", "TAVILY_OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY": "Wynik zapytania jest niepewny. Automatyczne ponowienie zostało zatrzymane.", "TAVILY_USAGE_UNCERTAIN_NO_AUTOMATIC_RETRY": "Nie udało się potwierdzić kosztu zapytania. Automatyczne ponowienie zostało zatrzymane.", "TAVILY_HTTP_ERROR": "Dostawca researchu odrzucił zapytanie. Sprawdź dostępny limit.", "RESEARCH_LEASE_EXPIRED_RECONCILE_USAGE": "Analiza została przerwana. Przed wznowieniem sprawdź jej zużycie.", "RESEARCH_ALREADY_PROCESSING": "Analiza już trwa. Poczekaj na jej zakończenie.", "INVALID_GPS": "Podaj prawidłowe współrzędne i typ lokalizacji.", "GPS_EXPLICIT_LAKE_APPROVAL_REQUIRED": "Zmiana GPS jeziora wymaga wyraźnego zatwierdzenia propozycji.", "GPS_CHANGED_RELOAD_BEFORE_APPROVAL": "GPS zmienił się. Odśwież dane przed zatwierdzeniem."};
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const fresh=p=>Date.now()-Date.parse(p.checked_at)<14*86400000;
export function mapAssets(html,sourceUrl){
 const found=[];for(const m of String(html).matchAll(/(?:src|data-src)=["']([^"']+)["']/gi)){try{const u=new URL(m[1].replaceAll('&amp;','&'),sourceUrl);if(u.protocol!=='https:'||u.username||u.password||u.port||!/map|plattegrond|kaart/i.test(u.pathname)||(/lagoon/i.test(u.pathname)&&!/lagoon/i.test(sourceUrl))||!/\.(?:jpg|jpeg|png|webp)$/i.test(u.pathname))continue;const years=[...u.pathname.matchAll(/(?:^|[^\d])(20\d{2})(?=[^\d]|$)/g)].map(x=>+x[1]);found.push({url:u.href,year:years.at(-1)||null,sourceUrl,scope:'current_source_map',historicalApplicability:'unverified'});}catch{}}
 return [...new Map(found.map(x=>[x.url,x])).values()];
}
// Only same-origin HTTPS redirects; no credentials or arbitrary redirect destinations.
export async function fetchMapHtml(sourceUrl){
 const origin=new URL(sourceUrl).origin;let url=sourceUrl;
 for(let redirects=0;redirects<=2;redirects++){
  const r=await fetch(url,{redirect:'manual',headers:{accept:'text/html'},signal:AbortSignal.timeout(12000)});
  if([301,302,303,307,308].includes(r.status)){const next=new URL(r.headers.get('location')||'',url);await r.body?.cancel();if(redirects===2||next.origin!==origin||next.username||next.password||next.port)throw Error('MAP_REDIRECT_REJECTED');url=next.href;continue;}
  if(!r.ok||!r.headers.get('content-type')?.includes('text/html')){await r.body?.cancel();return {status:'unavailable',httpStatus:r.status,sourceUrl:url,assets:[]};}
  const reader=r.body.getReader();let html='',bytes=0;const decoder=new TextDecoder();while(bytes<700000){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;html+=decoder.decode(chunk.value,{stream:true});}await reader.cancel();const assets=mapAssets(html,url);return {status:assets.length?'source_map_found':'image_metadata_not_found',httpStatus:r.status,sourceUrl:url,assets};
 }
}
async function checkMapOnce(env,lakeId){
 const version=2,key='research.map.'+lakeId,old=await one(env.DB,'SELECT value FROM app_settings WHERE key=?',key);if(old){const saved=JSON.parse(old.value);if(saved.version===version||saved.assets?.length)return saved;}
 const pages=await all(env.DB,'SELECT url FROM research_pages WHERE lake_id=?',lakeId),page=pages.find(p=>/plattegrond|map|kaart/i.test(new URL(p.url).pathname));if(!page)return {status:'no_map_source',assets:[]};
 // Persist intent before IO: ambiguous/interrupted image extraction must never be retried blindly.
 let result={version,status:'fetching',sourceUrl:page.url,assets:[],checkedAt:new Date().toISOString()};
 await run(env.DB,'INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',key,JSON.stringify(result));
 // User URLs are never fetched directly by this path; the public extraction provider supplies image metadata.
 result.status='image_metadata_not_found';
 if(!result.assets.length){
  const job=await one(env.DB,"SELECT * FROM research_jobs WHERE lake_id=? AND status='complete' ORDER BY rowid DESC LIMIT 1",lakeId);
  if(job&&job.credits_reserved<4){try{const data=await extract(env,job,[page.url],true);const images=(data.results||[]).flatMap(p=>p.images||[]);const assets=mapAssets(images.filter(x=>typeof x==='string').map(u=>'<img src="'+u.replaceAll('"','&quot;')+'">').join(''),page.url);result={...result,status:assets.length?'source_map_found':'image_metadata_not_found',assets,metadataProvider:'Tavily basic extract with images',credits:data.usage.credits};}catch(e){result={...result,status:'metadata_check_stopped',error:e.code||'MAP_METADATA_CHECK_FAILED'};}}
 }
 await run(env.DB,'INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',key,JSON.stringify(result));return result;
}
function factSubject(f){
 const text=f.evidence.toLowerCase();
 const subjects=f.field==='bait'?['self-prepared','purchased','tiger nuts','particles','pellet','boilies']:f.field==='hooks'?['barbless','barbed']:f.field==='boats'?['petrol','electric','rowing']:['net','mat','sling','fishcare'].includes(f.field)?['sturgeon','carp','catfish']:[];
 return subjects.filter(s=>text.includes(s)).join('|')||'general';
}
export async function researchProfile(env,lakeId){
 const db=env.DB,rows=await all(db,'SELECT o.data_json FROM research_observations o JOIN research_pages p ON p.lake_id=o.lake_id AND p.url=o.url AND p.checked_at=o.checked_at WHERE o.lake_id=? ORDER BY o.field,o.checked_at DESC',lakeId),facts=rows.map(r=>JSON.parse(r.data_json)).filter(f=>f.parserVersion===PARSER_VERSION),pages=await all(db,'SELECT url,checked_at checkedAt,scope FROM research_pages WHERE lake_id=?',lakeId),job=await one(db,'SELECT id,source_url,status,queue_json,attempts,credits_reserved,credits_actual,message,started_at,completed_at FROM research_jobs WHERE lake_id=? ORDER BY started_at DESC,rowid DESC LIMIT 1',lakeId),locations=await all(db,'SELECT * FROM research_locations WHERE lake_id=? ORDER BY created_at',lakeId);
 const unique=new Map();for(const f of facts){const key=f.field+'|'+f.evidence.replace(/\s+/g,' ').toLowerCase();if(unique.has(key)){unique.get(key).sources.push({url:f.url,checkedAt:f.checkedAt});}else unique.set(key,{...f,sources:[{url:f.url,checkedAt:f.checkedAt}]});}facts.splice(0,facts.length,...unique.values());
 const missing=Object.keys(concepts).filter(k=>!facts.some(f=>f.field===k));
 // Conflicts require the same subject, ownership, conditions AND scope. Different fish/use is not a contradiction.
 const conflicts=[];for(const f of facts.filter(f=>f.base!=='UNKNOWN'&&!f.conditional))for(const g of facts){if(f.url>=g.url||g.conditional||f.field!==g.field||f.ownership!==g.ownership||f.scope!==g.scope||g.base==='UNKNOWN')continue;if(((f.base==='PROHIBITED')!==(g.base==='PROHIBITED'))&&factSubject(f)===factSubject(g))conflicts.push({field:f.field,urls:[f.url,g.url]});}
 for(const field of ['area','depth']){const found=facts.filter(f=>f.field===field&&f.normalized!=null&&f.quantityKind!=='change');if(new Set(found.map(f=>f.normalized)).size>1)conflicts.push({field,reason:'NUMERIC_OR_HISTORICAL_DIFFERENCE',values:found.map(f=>({value:f.normalized,url:f.url,checkedAt:f.checkedAt,effectiveYear:f.effectiveYear}))});}
 const mapRow=await one(db,'SELECT value FROM app_settings WHERE key=?','research.map.'+lakeId);
 return {facts,pages,missing,conflicts,locations,mapEvidence:mapRow?JSON.parse(mapRow.value):null,job:job?{...job,queue:JSON.parse(job.queue_json),queue_json:undefined}:null,historyNotice:'Current source check; applicability to historical trips is not established.'};
}
export async function queueResearch(env,lakeId,url,options={}){
 const db=env.DB,active=await one(db,"SELECT * FROM research_jobs WHERE lake_id=? AND status IN ('pending','processing')",lakeId);
 if(active){if(active.source_url!==url)fail('RESEARCH_SOURCE_CONFLICT',409);return active;}
 const old=await one(db,"SELECT * FROM research_jobs WHERE lake_id=? AND source_url=? ORDER BY rowid DESC LIMIT 1",lakeId,url);
 if(old?.status==='complete'&&Date.now()-Date.parse(old.completed_at)<14*86400000&&(!options.sources||options.sources.every(u=>JSON.parse(old.confirmed_sources_json||'[]').includes(u))))return old;
 if(old&&['uncertain','blocked'].includes(old.status))fail('RESEARCH_RETRY_REQUIRES_RECONCILED_USAGE',409);
 const id=crypto.randomUUID();await run(db,"INSERT OR IGNORE INTO research_jobs(id,lake_id,source_url,status,queue_json,confirmed_sources_json) VALUES(?,?,?,'pending',?,?)",id,lakeId,url,JSON.stringify(options.sources||[url]),JSON.stringify(options.sources||[]));return await one(db,'SELECT * FROM research_jobs WHERE id=?',id)||await one(db,"SELECT * FROM research_jobs WHERE lake_id=? AND status IN ('pending','processing')",lakeId);
}
async function extract(env,job,urls,includeImages=false){
 const usage=await tavilyUsage(env);if(!usage.freeOnlyConfirmed||usage.available<3)fail('TAVILY_FREE_BUDGET_UNVERIFIED',429);
 // Reserve worst-case rounded basic-extract cost before network IO. Keep reservations after unknown failures.
 const cost=Math.ceil(urls.length/5),month=new Date().toISOString().slice(0,7);
 const r=await run(env.DB,`UPDATE research_jobs SET credits_reserved=credits_reserved+? WHERE id=? AND credits_reserved+?<=4 AND (SELECT COALESCE(SUM(credits_reserved),0) FROM research_jobs WHERE substr(started_at,1,7)=?)+?<=100`,cost,job.id,cost,month,cost);
 if(r.meta.changes!==1)fail('RESEARCH_LOCAL_BUDGET_EXHAUSTED',429);
 let response;try{response=await fetch('https://api.tavily.com/extract',{method:'POST',headers:{authorization:'Bearer '+env.TAVILY_API_KEY,'content-type':'application/json'},body:JSON.stringify({urls,extract_depth:'basic',format:'markdown',timeout:15,include_usage:true,...(includeImages?{include_images:true}:{})}),signal:AbortSignal.timeout(22000)});}catch{fail('TAVILY_OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY',504);}
 if(!response.ok)fail('TAVILY_HTTP_ERROR',[402,429].includes(response.status)?429:502);
 const data=await response.json(),actual=data.usage?.credits;
 if(!Number.isFinite(actual)||actual<0||actual>cost)fail('TAVILY_USAGE_UNCERTAIN_NO_AUTOMATIC_RETRY',502);
 await run(env.DB,'UPDATE research_jobs SET credits_actual=credits_actual+? WHERE id=?',actual,job.id);
 return data;
}
async function discoverAdditional(env,job,primary){
 const db=env.DB,marker=await one(db,'SELECT value FROM app_settings WHERE key=?','research.discovery.'+job.lake_id);
 if(marker&&Date.now()-Date.parse(marker.value)<14*86400000)return [];
 const usage=await tavilyUsage(env);if(!usage.freeOnlyConfirmed||usage.available<3)fail('TAVILY_FREE_BUDGET_UNVERIFIED',429);
 const reserved=await run(db,"UPDATE research_jobs SET discovery_done=1,credits_reserved=credits_reserved+1 WHERE id=? AND discovery_done=0 AND credits_reserved+1<=4 AND (SELECT COALESCE(SUM(credits_reserved),0) FROM research_jobs WHERE substr(started_at,1,7)=?)+1<=100",job.id,new Date().toISOString().slice(0,7));
 if(reserved.meta.changes!==1)return [];
 const lake=await one(db,'SELECT name,country FROM lakes WHERE id=?',job.lake_id);
 let response;try{response=await fetch('https://api.tavily.com/search',{method:'POST',headers:{authorization:'Bearer '+env.TAVILY_API_KEY,'content-type':'application/json'},body:JSON.stringify({query:`${lake.name} ${lake.country||''} regulations facilities fish stock map address nearby shops`,search_depth:'basic',include_domains:[new URL(primary).hostname],max_results:5,include_answer:false,include_raw_content:false,include_usage:true,auto_parameters:false}),signal:AbortSignal.timeout(15000)});}catch{fail('TAVILY_OUTCOME_UNCERTAIN_NO_AUTOMATIC_RETRY',504);}
 if(!response.ok)fail('TAVILY_HTTP_ERROR',[402,429].includes(response.status)?429:502);
 const data=await response.json(),cost=data.usage?.credits;if(!Number.isFinite(cost)||cost<0||cost>1)fail('TAVILY_USAGE_UNCERTAIN_NO_AUTOMATIC_RETRY',502);
 await run(db,'UPDATE research_jobs SET credits_actual=credits_actual+? WHERE id=?',cost,job.id);
 await run(db,'INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)','research.discovery.'+job.lake_id,new Date().toISOString());
 return [...new Set((data.results||[]).map(r=>r.url).filter(u=>sourceScope(u,primary)!=='reject'))].slice(0,5);
}
async function storeEvidence(db,lakeId,p){
 const facts=parseResearch(p.content,{url:p.url,checkedAt:p.checked_at,scope:p.scope}),statements=[];
 for(const f of facts){const id=await hash(lakeId+'|'+p.url+'|'+f.field+'|'+f.evidence);statements.push(db.prepare('INSERT INTO research_observations(id,lake_id,url,field,evidence,data_json,checked_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,checked_at=excluded.checked_at').bind(id,lakeId,p.url,f.field,f.evidence,JSON.stringify({...f,id}),p.checked_at));}
 for(let i=0;i<statements.length;i+=50)await db.batch(statements.slice(i,i+50));
}
export async function stepResearch(env,lakeId,url){
 const db=env.DB,job=await queueResearch(env,lakeId,url);if(job.status==='complete'){const marker=await one(db,'SELECT value FROM app_settings WHERE key=?','research.parser.'+lakeId);if(marker?.value!==PARSER_VERSION){for(const p of await all(db,'SELECT * FROM research_pages WHERE lake_id=?',lakeId))await storeEvidence(db,lakeId,p);await run(db,'INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)','research.parser.'+lakeId,PARSER_VERSION);}await checkMapOnce(env,lakeId);return {reused:true,...await researchProfile(env,lakeId)};}
 // An expired processing lease may have charged a request: retain budget and require reconciliation, never repeat blindly.
 if(job.status==='processing'&&job.lease_until&&Date.parse(job.lease_until)<Date.now()){await run(db,"UPDATE research_jobs SET status='uncertain',message='LEASE_EXPIRED_RECONCILE_USAGE',lease_until=NULL WHERE id=?",job.id);fail('RESEARCH_LEASE_EXPIRED_RECONCILE_USAGE',409);}
 const lease=new Date(Date.now()+60000).toISOString(),acquired=await run(db,"UPDATE research_jobs SET status='processing',lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending'",lease,job.id);
 if(!acquired.meta.changes)fail('RESEARCH_ALREADY_PROCESSING',409);
 try{
  const seeds=JSON.parse(job.confirmed_sources_json||'[]');if(!seeds.length)seeds.push(url);const scoped=u=>{for(const seed of seeds){const scope=sourceScope(u,seed);if(scope!=='reject')return scope;}return 'reject';};
  const queue=JSON.parse(job.queue_json),batch=queue.slice(0,5),rest=queue.slice(5),pages=[];const uncached=[];
  for(const u of batch){if(scoped(u)==='reject')continue;const cached=await one(db,'SELECT * FROM research_pages WHERE lake_id=? AND url=?',lakeId,u);if(cached&&fresh(cached))pages.push(cached);else uncached.push(u);}
  const failed=[];
  if(uncached.length){const data=await extract(env,job,uncached);for(const u of uncached){const result=(data.results||[]).find(r=>r.url===u&&r.raw_content);if(!result){failed.push(u);continue;}pages.push({url:u,content:String(result.raw_content).slice(0,160000),checked_at:new Date().toISOString(),scope:scoped(u)});}}
  for(const p of pages){
   await run(db,'INSERT INTO research_pages(lake_id,url,content,checked_at,scope) VALUES(?,?,?,?,?) ON CONFLICT(lake_id,url) DO UPDATE SET content=excluded.content,checked_at=excluded.checked_at,scope=excluded.scope',lakeId,p.url,p.content,p.checked_at,p.scope);
   await storeEvidence(db,lakeId,p);
   for(const g of gpsCandidates(p.content,p.url)){await run(db,'INSERT OR IGNORE INTO research_locations(id,lake_id,latitude,longitude,kind,url,evidence) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),lakeId,g.latitude,g.longitude,g.kind,g.url,g.evidence);}
   if(seeds.includes(p.url)){const discovered=discoverUrls(p.content,p.url);for(const u of discovered)if(!batch.includes(u)&&!rest.includes(u)&&rest.length<24&&!await one(db,'SELECT 1 present FROM research_pages WHERE lake_id=? AND url=?',lakeId,u))rest.push(u);}
  }
  let deferDiscovery=false;
  if(!rest.length&&!failed.length&&JSON.parse(job.confirmed_sources_json||'[]').length&&!job.discovery_done){
   if(uncached.length)deferDiscovery=true;else{
   const stored=await all(db,'SELECT DISTINCT field FROM research_observations WHERE lake_id=?',lakeId);
   if(stored.length<12)for(const u of await discoverAdditional(env,job,url))if(!await one(db,'SELECT 1 present FROM research_pages WHERE lake_id=? AND url=?',lakeId,u))rest.push(u);
   }
  }
  const message=failed.length?'PARTIAL_FAILED_URLS: '+failed.join(' '):null;
  await run(db,"UPDATE research_jobs SET queue_json=?,status=?,message=?,lease_until=NULL,completed_at=CASE WHEN ?=0 THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?",JSON.stringify(rest),rest.length||deferDiscovery?'pending':failed.length?'partial':'complete',message,rest.length||deferDiscovery?1:0,job.id);
  return {reused:!uncached.length,...await researchProfile(env,lakeId)};
 }catch(e){await run(db,"UPDATE research_jobs SET status=?,message=?,lease_until=NULL WHERE id=?",e.status===429?'blocked':'uncertain',e.code||'RESEARCH_STEP_FAILED',job.id);throw e;}
}
export async function proposeLocation(env,lakeId,x){
 const latitude=Number(x.latitude),longitude=Number(x.longitude);if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180||!['lake','reception','parking','unknown'].includes(x.kind))fail('INVALID_GPS');
 const id=crypto.randomUUID();await run(env.DB,'INSERT OR IGNORE INTO research_locations(id,lake_id,latitude,longitude,kind,url,evidence) VALUES(?,?,?,?,?,?,?)',id,lakeId,latitude,longitude,x.kind,'user-reference','User supplied reference; not independently verified.');return researchProfile(env,lakeId);
}
export async function approveLocation(env,lakeId,x){
 const g=await one(env.DB,"SELECT * FROM research_locations WHERE id=? AND lake_id=? AND kind='lake' AND status='proposed'",x.id,lakeId);if(!g||x.confirm!==true)fail('GPS_EXPLICIT_LAKE_APPROVAL_REQUIRED');
 const result=await run(env.DB,'UPDATE lakes SET latitude=?,longitude=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND latitude IS ? AND longitude IS ?',g.latitude,g.longitude,lakeId,x.previousLatitude??null,x.previousLongitude??null);if(result.meta.changes!==1)fail('GPS_CHANGED_RELOAD_BEFORE_APPROVAL',409);
 await run(env.DB,"UPDATE research_locations SET status='approved' WHERE id=?",g.id);return researchProfile(env,lakeId);
}
