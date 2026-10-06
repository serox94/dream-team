import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
const base='https://dream-team.sewerynski00.workers.dev';
const secret=process.env.RYBY_SESSION_SECRET;
assert.ok(secret,'Missing fixture signature configuration');
const phase=process.env.TAVILY_FIXTURE_PHASE||'candidates';
const payload=phase==='candidates'?{mode:'candidates'}:{mode:'research',name:process.env.TAVILY_FIXTURE_NAME,region:process.env.TAVILY_FIXTURE_REGION,url:process.env.TAVILY_FIXTURE_URL,location:process.env.TAVILY_FIXTURE_LOCATION||null};
const body=JSON.stringify(payload),at=Date.now(),signature=createHmac('sha256',secret).update(`${at}.${body}`).digest('hex');
let response;
for(let i=0;i<30;i++){
  response=await fetch(base+'/api/_fixture-tavily-20261006',{method:'POST',headers:{'content-type':'application/json','x-fixture-at':String(at),'x-fixture-signature':signature},body});
  if(response.status!==404)break;
  await new Promise(resolve=>setTimeout(resolve,2000));
}
assert.equal(response.status,200,`Fixture HTTP ${response.status} (no secret value logged)`);
const report=await response.json();
assert.ok(Array.isArray(report.usage));
console.log('Fixture phase:',phase);
console.log(JSON.stringify(report,null,2));
