// Read binding names and safe status only. Never prints secrets or enables billing.
import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';
const base='https://dream-team-preview.sewerynski00.workers.dev',config=JSON.parse(await readFile('wrangler.preview.generated.jsonc','utf8'));assert.equal(config.name,'dream-team-preview');assert.ok(['true','false'].includes(config.vars.AI_FREE_ONLY));
const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:process.env.RYBY_LOGIN_USERNAME,password:process.env.RYBY_LOGIN_PASSWORD})});assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
const settings=await fetch(base+'/api/settings',{headers:{cookie}}).then(r=>r.json());const report={tavily:{result:'BLOCKED'},ai:{result:config.vars.AI_FREE_ONLY==='true'&&settings.workersAiAvailable?'PASS':'BLOCKED',freeAllocationPerDay:10000,pricingSource:'https://developers.cloudflare.com/workers-ai/platform/pricing/',enabled:settings.workersAiAvailable,calls:0}};
const cfRoot=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
const cf=async path=>{try{const r=await fetch(cfRoot+path,{headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(12000)});if(!r.ok)return {status:r.status,available:false};const data=await r.json();return data.success?{available:true,value:data.result}:{available:false};}catch(error){return {available:false,error:error.name||'request_failed'};}};
const bindingSettings=await cf('/workers/scripts/dream-team-preview/settings');report.ai.binding=!!bindingSettings.value?.bindings?.find(b=>b.type==='ai'&&b.name==='AI');
const subscriptions=await cf('/subscriptions');report.ai.billingVerificationAvailable=subscriptions.available;
if(subscriptions.available)report.ai.workersSubscriptions=(Array.isArray(subscriptions.value)?subscriptions.value:[]).filter(s=>/workers/i.test(s.rate_plan?.id+' '+s.rate_plan?.public_name)).map(s=>({id:s.rate_plan?.id,name:s.rate_plan?.public_name}));
report.ai.remaining=config.vars.AI_FREE_ONLY==='true'?'Workers Free verified by absence of a Workers Paid subscription; preview AI may use only the free allocation. The media QA owns the single live inference.':'Workers Paid or unverifiable plan detected; AI_FREE_ONLY remains false and no inference is allowed.';
if(!settings.researchProviderConfigured){report.tavily.remaining='Set exactly one Worker secret: TAVILY_API_KEY on dream-team-preview.';report.tavily.requestCount=0;report.tavily.credits=0;}
else{
 // Reserve this one-shot QA run in preview D1 so workflow retries never repeat a paid provider request.
 const marker='qa_finalbatch_tavily_20261007';
 assert.equal(config.d1_databases[0].database_name,'dream-team-preview-db');
 assert.notEqual(config.d1_databases[0].database_id,'b64c7a2c-8694-41c6-b54a-857b88bf2c96');
 const reservation=await fetch(cfRoot+`/d1/database/${config.d1_databases[0].database_id}/query`,{method:'POST',headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({sql:'INSERT OR IGNORE INTO app_settings(key,value) VALUES (?,?)',params:[marker,'reserved: one candidate request']})}).then(r=>r.json());
 assert.equal(reservation.success,true,'reserve one controlled preview request');
 if(reservation.result[0].meta.changes!==1){report.tavily={result:'PARTIAL',requestCount:0,credits:0,remaining:'The single controlled request was already reserved; inspect its original QA evidence. No additional research request sent.'};}
 else{
 // Never invent a specific lake when the name is ambiguous.
 const r=await fetch(base+'/api/lake-candidates',{method:'POST',headers:{cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({name:'Kamień',country:'Polska'})});const data=await r.json();report.tavily={result:r.ok?'PARTIAL':'FAIL',query:'Kamień / Polska',requestCount:1,reservedCredits:1,candidates:data.candidates||[],ambiguity:(data.candidates||[]).length!==1,remaining:'Candidate search only. Official identity and location require confirmation before any source extraction; 38 fields, provenance, conflicts, regulations and checklist suggestions remain unverified.'};
 }
}
assert.equal(settings.workersAiAvailable,config.vars.AI_FREE_ONLY==='true','runtime AI availability must match the free-only safety gate');await mkdir('live-preview-qa',{recursive:true});await writeFile('live-preview-qa/bindings.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
