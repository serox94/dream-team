// Temporary live diagnostic. No D1 binding is used on this route.
import {provider,extractFacts,suggestions,safeSourceUrl} from './lake-research.js';
const encoder=new TextEncoder();
const fields=['official_name','address','phone','email','area','depth','bottom','weed','pegs','carp','record','species','rods','bait_boats','boats','leadcore','leaders','hooks','cradle','landing_net','sling','disinfectant','fish_storage','arrival','departure','parking','electricity','toilets','showers','drinking_water','freezer','shops','access','rules','map','fridge','country','gps'];
const priority={official:1,regulation:2,operator:3,directory:4};
const equal=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a[i]^b[i];return !n;};
async function authorized(request,env,body){
 const timestamp=Number(request.headers.get('x-fixture-at')),sig=request.headers.get('x-fixture-signature')||'';
 if(!Number.isInteger(timestamp)||Math.abs(Date.now()-timestamp)>120000||!/^[a-f0-9]{64}$/.test(sig))return false;
 const key=await crypto.subtle.importKey('raw',encoder.encode(env.RYBY_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const expected=new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${timestamp}.${body}`)));
 const supplied=new Uint8Array(sig.match(/../g).map(x=>parseInt(x,16)));return equal(expected,supplied);
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export async function liveFixture(request,env){
 if(request.method!=='POST')return json({error:'Method'},405);
 const body=await request.text();if(body.length>2048||!await authorized(request,env,body))return json({error:'Unauthorized'},401);
 if(!env.TAVILY_API_KEY)return json({error:'Tavily unavailable'},503);
 const x=JSON.parse(body),usage=[],web=provider(env,event=>usage.push(event));
 if(x.mode==='candidates'){
   const candidates=await web.candidates('Kamień','Polska',{languages:'PL',official:'on'});
   return json({name:'Kamień',country:'Polska',candidates,ambiguous:candidates.length>1,usage});
 }
 if(x.mode!=='research'||typeof x.url!=='string')return json({error:'Invalid fixture request'},400);
 const selected=safeSourceUrl(x.url);
 if(!/kamie[nń]/i.test(x.name||''))return json({error:'Candidate mismatch'},400);
 const links=await web.search(`"${x.name}" ${x.region||''} łowisko regulamin oficjalna strona Polska`);
 const selectedHost=new URL(selected).hostname.replace(/^www\./,'');
 const picked=[{url:selected,type:'operator',name:x.name},...links.filter(v=>v.url!==selected&&(/regulamin|zasady|rules/i.test(v.name+' '+v.excerpt)||new URL(v.url).hostname.replace(/^www\./,'')===selectedHost)).slice(0,2).map(v=>({url:v.url,type:new URL(v.url).hostname.replace(/^www\./,'')===selectedHost?'operator':'directory',name:v.name}))];
 const facts=[],sources=[],checkedAt=new Date().toISOString();
 // Fixed maximum: one basic search and three basic extracts. Stop on errors, never retry.
 for(const src of picked.slice(0,3)){
   const content=await web.extract(src.url);
   const extracted=extractFacts(content).map(f=>({...f,field:f.field,value:f.value,sourceUrl:src.url,sourceName:src.name,sourceType:src.type,checkedAt,status:'potwierdzone'}));
   facts.push(...extracted);sources.push({...src,extracted:extracted.length,checkedAt});
 }
 const conflicts=[];
 for(const field of new Set(facts.map(f=>f.field))){const values=[...new Set(facts.filter(f=>f.field===field).map(f=>f.value))];if(values.length>1){conflicts.push({field,values});facts.filter(f=>f.field===field).forEach(f=>f.status='sprzeczne');}}
 facts.sort((a,b)=>(priority[a.sourceType]||9)-(priority[b.sourceType]||9));
 const complete=[...fields].filter(field=>field==='country'||facts.some(f=>f.field===field&&f.status==='potwierdzone'));
 const missing=fields.filter(field=>!complete.includes(field));
 const proposals=suggestions(facts.map(f=>({...f,url:f.sourceUrl,source_type:f.sourceType})));
 return json({selected:{name:x.name,region:x.region||'Nieustalony',url:selected,location:x.location||null},sources,coverage:{found:complete.length,total:38,missing},facts,conflicts,proposals,usage,limits:{researchCalls:usage.length,researchCredits:usage.reduce((n,x)=>n+(x.credits||0),0),maxResearchCredits:8,stoppedAtThreeExtracts:true},officialSource:null,officialVerification:'Nie oznaczaj źródła jako oficjalnego bez potwierdzenia własności domeny przez operatora.'});
}
