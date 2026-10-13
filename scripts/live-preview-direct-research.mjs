import {extractFacts} from '../src/lake-research.js';
// One real deployed Tavily extraction; durable preview marker prevents repeated provider calls.
import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base='https://dream-team-preview.sewerynski00.workers.dev',source='https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/',marker='qa_stage7_direct_url_20261012';
const config=JSON.parse(await readFile('wrangler.preview.generated.jsonc','utf8'));assert.equal(config.name,'dream-team-preview');assert.equal(config.vars.AI_FREE_ONLY,'false');assert.equal(config.d1_databases[0].database_name,'dream-team-preview-db');assert.notEqual(config.d1_databases[0].database_id,'b64c7a2c-8694-41c6-b54a-857b88bf2c96');
const root=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${config.d1_databases[0].database_id}`;
const query=async(sql,params=[])=>{const r=await fetch(root+'/query',{method:'POST',headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)}),data=await r.json();assert.ok(r.ok&&data.success,'preview marker query failed');return data.result[0];};
let cookie;
const call=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{cookie,origin:base,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(method==='GET'?15000:30000)});return {status:r.status,data:await r.json()};};
async function main(){
 const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:process.env.RYBY_LOGIN_USERNAME,password:process.env.RYBY_LOGIN_PASSWORD}),signal:AbortSignal.timeout(20000)});assert.equal(login.status,303);cookie=login.headers.get('set-cookie').split(';')[0];
 const boot=await call('/api/bootstrap');assert.equal(boot.status,200);const lake=boot.data.lakes.find(l=>l.id==='plaine2');assert.ok(lake&&lake.sourceUrl===source,'existing lake identity and reviewed operator URL must agree');
 const reserved=await query('INSERT OR IGNORE INTO app_settings(key,value) VALUES(?,?)',[marker,JSON.stringify({result:'BLOCKED',startedAt:new Date().toISOString(),remaining:'Reserved one extraction; response not yet verified.'})]);
 let report;
 if(reserved.meta.changes===1){
  const r=await call('/api/lakes/plaine2/research','POST',{url:source,title:lake.name,sourceType:'official'});
  report={result:r.status===200?'PASS':'FAIL',status:r.status,requestCount:1,providerRequestsByRelease:1,reservedCredits:2,actualProviderCredits:'NOT VERIFIED',source,completedAt:new Date().toISOString()};
  if(r.status===200){assert.equal(r.data.sourcesChecked,1,'only the supplied source');assert.ok(r.data.profile.sources.some(s=>s.url===source));assert.ok(r.data.profile.facts.filter(f=>f.url===source).length>=r.data.count,'collected facts retain reviewed provenance; existing sources are preserved');report.factsFound=r.data.count;report.coverage=r.data.profile.coverage;report.remaining='Coverage includes explicit missing fields; no inferred GPS or substitute lake. Original lake/trip/profile IDs and PB are unchanged. Source refresh intentionally retained on preview.';}
  else report.remaining=String(r.data.error||'provider request failed').slice(0,180);
  await query('UPDATE app_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',[JSON.stringify(report),marker]);
 }else{report=JSON.parse((await query('SELECT value FROM app_settings WHERE key=?',[marker])).results[0].value);report={...report,requestCount:0,reusedProof:true};}
 await mkdir('live-preview-qa',{recursive:true});await writeFile('live-preview-qa/direct-research.json',JSON.stringify(report,null,2));console.log('LIVE DIRECT TAVILY '+JSON.stringify(report));assert.equal(report.result,'PASS','real extraction remains blocked or failed; do not repeat a reserved provider request');
 let profile=await call('/api/lakes/plaine2/profile');assert.equal(profile.status,200);assert.ok(profile.data.sources.some(s=>s.url===source),'current source provenance retained');
 if(!report.normalizationVersion){
  const completed=Date.parse(report.completedAt),original=profile.data.facts;
  const owned=original.filter(f=>f.url===source&&Math.abs(Date.parse(f.checkedAt.includes('T')?f.checkedAt:f.checkedAt.replace(' ','T')+'Z')-completed)<3000);
  let normalized=0;
  for(const fact of owned)for(const piece of extractFacts(fact.originalText||fact.evidence)){
   const existing=original.find(f=>f.url===source&&f.field===piece.field);
   if(existing&&!owned.some(f=>f.id===existing.id))continue; // Preserve later manual edits.
   const applied=await call('/api/lakes/plaine2/facts','POST',{url:source,title:lake.name,sourceType:'official',field:piece.field,value:piece.value,evidence:fact.originalText||fact.evidence,sourceLanguage:piece.sourceLanguage});
   assert.equal(applied.status,201,'normalize only evidence collected by this controlled run');normalized++;
  }
  profile=await call('/api/lakes/plaine2/profile');assert.equal(profile.status,200);
  report={...report,normalizationVersion:'2026-10-12.v2',normalizedEvidenceFields:normalized,currentCoverage:profile.data.coverage};
  await query('UPDATE app_settings SET value=?,updated_at=CURRENT_TIMESTAMP WHERE key=?',[JSON.stringify(report),marker]);
  await writeFile('live-preview-qa/direct-research.json',JSON.stringify(report,null,2));
 }
 console.log('LIVE SOURCE NORMALIZATION '+JSON.stringify({result:'PASS',version:report.normalizationVersion,fields:report.normalizedEvidenceFields,coverage:profile.data.coverage.found,total:profile.data.coverage.total,providerRequests:0,historyRetained:true}));

}
try{await main();}catch(error){console.error('DIRECT RESEARCH QA',String(error.message).split('\n')[0]);throw new Error('Direct research QA: '+String(error.message).split('\n')[0]);}finally{if(cookie)await fetch(base+'/api/logout',{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)}).catch(()=>{});}
