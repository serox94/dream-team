import {generateTripAdvice} from './trip-advice.js';
import {InputError} from './validation.js';
import {safeSourceUrl,profile,provider} from './lake-research.js';
import {sourceScope} from './research-facts.js';
import {queueResearch,stepResearch} from './research-engine.js';
const one=(db,sql,...v)=>db.prepare(sql).bind(...v).first();
const run=(db,sql,...v)=>db.prepare(sql).bind(...v).run();
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
export function profileSources(value){
 if(!Array.isArray(value)||value.length>12)throw new InputError('Dodaj najwyżej 12 linków źródłowych.',400);
 const urls=[...new Set(value.map(x=>safeSourceUrl(String(x).trim())))];
 for(const u of urls)if(new URL(u).hostname===new URL(urls[0]).hostname&&sourceScope(u,urls[0])==='reject')throw new InputError('Źródło dotyczy innego jeziora.',400);
 return urls;
}
export async function prepareLakeProfile(env,lakeId,urls,ctx){
 const sources=profileSources(urls);if(!sources.length)throw new InputError('Wybierz właściwe łowisko lub dodaj źródło.',400);
 const lake=await one(env.DB,'SELECT id,name,source_url FROM lakes WHERE id=?',lakeId);if(!lake)throw new InputError('Nie znaleziono łowiska.',404);
 // All explicitly selected sources are allowed, but discovered links remain scoped.
 // Reject concurrent changes instead of losing a newly appended URL during a lease.
 const active=await one(env.DB,"SELECT id,status,confirmed_sources_json FROM research_jobs WHERE lake_id=? AND status IN ('pending','processing')",lakeId);
 if(active){const existing=JSON.parse(active.confirmed_sources_json||'[]');if(sources.some(u=>!existing.includes(u)))throw new InputError('Analiza już trwa. Dodaj kolejne źródło po jej zakończeniu.',409);return active;}
 const uncertain=await one(env.DB,"SELECT id FROM research_jobs WHERE lake_id=? AND status='uncertain' ORDER BY started_at DESC LIMIT 1",lakeId);if(uncertain)throw new InputError('Niepewny wynik dostawcy. Najpierw rozlicz poprzednie wywołanie.',409);
 const saved=await all(env.DB,'SELECT url FROM lake_sources WHERE lake_id=?',lakeId);
 const combined=profileSources([...new Set([...sources,...saved.map(x=>x.url)])]);
 for(const u of combined){if(new URL(u).hostname===new URL(combined[0]).hostname&&sourceScope(u,combined[0])==='reject')throw new InputError('Źródło dotyczy innego jeziora. Wybierz właściwe łowisko.',400);}
 if((await one(env.DB,"SELECT COUNT(*) n FROM research_jobs WHERE status IN ('pending','processing')")).n>=10)throw new InputError('Trwa już 10 analiz. Poczekaj na ukończenie partii.',429);
 const job=await queueResearch(env,lakeId,combined[0],{sources:combined});
 await env.DB.batch(combined.map(url=>env.DB.prepare('INSERT OR IGNORE INTO lake_sources(id,lake_id,url,title,source_type) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),lakeId,url,lake.name,'manual')));
 if(ctx?.waitUntil)ctx.waitUntil(drainLakeProfiles(env).catch(e=>console.warn('Profile dispatcher:',e.code||'PROFILE_DEFERRED')));
 return {id:job.id,status:job.status};
}
export async function saveProfileVersion(env,lakeId){
 const p=await profile(env,lakeId);
 const value={lake:p.lake,research:{...p.research,job:p.research.job?{status:p.research.job.status,completed_at:p.research.job.completed_at}:null},facts:p.facts,sources:p.sources,coverage:p.coverage,missingFields:p.missingFields};
 const content=JSON.stringify(value),digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 await run(env.DB,'INSERT OR IGNORE INTO lake_profile_versions(id,lake_id,digest,profile_json) VALUES(?,?,?,?)',crypto.randomUUID(),lakeId,digest,content);
}
export async function drainLakeProfiles(env){
 // One bounded batch per invocation. The indexed queue survives closed browsers.
 await run(env.DB,"UPDATE research_jobs SET status='uncertain',message='LEASE_EXPIRED_RECONCILE_USAGE',lease_until=NULL WHERE status='processing' AND lease_until<?",new Date().toISOString());
 const job=await one(env.DB,"SELECT id,lake_id,source_url FROM research_jobs WHERE status='pending' ORDER BY started_at LIMIT 1");if(!job)return {processed:0};
 try{const result=await stepResearch(env,job.lake_id,job.source_url);if(['complete','partial'].includes(result.job?.status))await saveProfileVersion(env,job.lake_id);return {processed:1,status:result.job?.status};}
 catch(e){return {processed:1,status:'blocked',code:e.code||'RESEARCH_DEFERRED'};}
}
export async function lakeManagerProfile(env,lakeId,tripId){
 let current=await profile(env,lakeId),historical=false,snapshotAt=null;
 if(tripId){const trip=await one(env.DB,'SELECT lake_id,lake_profile_version_id FROM trips WHERE id=?',tripId);if(!trip||trip.lake_id!==lakeId)throw new InputError('Nieprawidłowe łowisko wyjazdu.',409);
 if(trip.lake_profile_version_id){const v=await one(env.DB,'SELECT profile_json,created_at FROM lake_profile_versions WHERE id=? AND lake_id=?',trip.lake_profile_version_id,lakeId);if(v){current=JSON.parse(v.profile_json);historical=true;snapshotAt=v.created_at;}}}

 const researchedFacts=[...current.facts,...current.research.facts.map(f=>({field:f.field,value:f.evidence,url:f.url,status:current.research.conflicts.some(c=>c.field===f.field)?'sprzeczne':'potwierdzone'}))];
 const rules=current.research.facts.filter(f=>['rods','leadcore','hooks','bait_boats','boats','bait','fishcare'].includes(f.field));if(rules.length)researchedFacts.push({field:'rules',value:rules.map(f=>f.evidence).join(' '),status:'potwierdzone',url:rules[0].url});
 current.tactics=generateTripAdvice({trip:{id:null,name:current.lake.name,facts:{}},lake:current.lake,researchedFacts});
 const eu=/^(?:pl|polska|poland|nl|nederland|netherlands|holandia|fr|france|francja|de|germany|niemcy|deutschland|be|belgium|belgia|belgië|belgique|cz|czechia|czech republic|czechy|at|austria|es|spain|hiszpania|it|italy|włochy|pt|portugal|portugalia|ie|ireland|irlandia|dk|denmark|dania|se|sweden|szwecja|fi|finland|finlandia|hr|croatia|chorwacja|hu|hungary|węgry|ro|romania|rumunia|sk|slovakia|słowacja|si|slovenia|słowenia|bg|bulgaria|bułgaria|ee|estonia|lt|lithuania|litwa|lv|latvia|łotwa|gr|greece|grecja|cy|cyprus|cypr|mt|malta|lu|luxembourg|luksemburg)$/iu.test(current.lake.country||'');
 current.emergency=eu?{number:'112',sourceUrl:'https://digital-strategy.ec.europa.eu/en/policies/112',checkedAt:'2026-10-26',scope:'EU emergency services, not routine advice'}:null;
 return {...current,historical,snapshotAt,providerConfigured:Boolean(provider(env))};
}
