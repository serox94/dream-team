// Isolated private Worker; production DB is queried read-only for exact trip GPS.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdtemp,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomBytes} from 'node:crypto';import {cf,query,productionId,wrangler,configFile,assertSandbox} from './recovery-common.mjs';
const run=process.env.GITHUB_RUN_ID,name='dream-team-audit-'+run,dir=await mkdtemp(join(tmpdir(),'weather-edge-'));let created=false;const report={candidate:process.env.RELEASE_CANDIDATE,result:'FAIL',businessWrites:0,productionDeployments:0,checks:[]};
try{
 assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.match(run,/^\d+$/);assertSandbox(name);
 const key=randomBytes(32).toString('hex'),wrapper=join(dir,'weather-probe.js');
 await writeFile(wrapper,`import {weatherForTrip} from ${JSON.stringify(process.cwd()+'/src/weather.js')};export default{async fetch(request,env){if(request.method!=='GET'||!env.PROBE_KEY||request.headers.get('x-weather-probe')!==env.PROBE_KEY)return new Response('',{status:401});let calls=0;try{const mode=request.headers.get('x-weather-case'),data=await weatherForTrip({...env,APP_ENV:${JSON.stringify('weather-qa-'+run)},WEATHER_NOW:()=>Date.now()+(mode==='stale'?360000:mode==='expired'?1860000:0),WEATHER_FETCH:async(...args)=>{calls++;if(mode==='stale'||mode==='expired')throw new TypeError('controlled transport failure');return fetch(...args)}},new URL(request.url).searchParams.get('tripId'));return Response.json(data,{headers:{'x-upstream-calls':String(calls)}})}catch(error){return Response.json({error:'WEATHER_UNAVAILABLE'},{status:error.status||502,headers:{'x-upstream-calls':String(calls)}})}},scheduled(){}};`);
 const base=JSON.parse(await readFile('wrangler.jsonc','utf8'));const config=await configFile(dir,{name,main:wrapper,workers_dev:true,compatibility_date:base.compatibility_date,triggers:{crons:[]},d1_databases:[{binding:'DB',database_name:'dream-team-db',database_id:productionId}]},'probe.jsonc');
 created=true;const out=wrangler(['deploy','--config',config]),url=out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/)?.[0];assert.ok(url);wrangler(['secret','bulk','--config',config],JSON.stringify({PROBE_KEY:key}));
 const call=(id,mode)=>fetch(url+'/?tripId='+encodeURIComponent(id),{headers:{'x-weather-probe':key,...(mode?{'x-weather-case':mode}:{})},signal:AbortSignal.timeout(25000)});
 let ready;for(let i=0;i<5;i++){ready=await fetch(url);if(ready.status===401)break;await new Promise(r=>setTimeout(r,1500));}assert.equal(ready.status,401);
 const trips=(await query(productionId,'SELECT id FROM trips ORDER BY id')).results;
 for(const [index,trip] of trips.entries()){
  const live=await call(trip.id),data=await live.json();assert.equal(live.status,200);assert.equal(data.dreamteam.provider,'Open-Meteo');assert.ok(data.hourly.time.length>24);assert.equal(data.dreamteam.stale,false);
  const hit=await call(trip.id),hitData=await hit.json();assert.equal(hit.status,200);assert.equal(hit.headers.get('x-upstream-calls'),'0');assert.equal(hitData.dreamteam.fetchedAt,data.dreamteam.fetchedAt);
  const stale=await call(trip.id,'stale'),old=await stale.json();assert.equal(stale.status,200);assert.equal(old.dreamteam.stale,true);assert.equal(old.dreamteam.fetchedAt,data.dreamteam.fetchedAt);
  const expired=await call(trip.id,'expired');assert.equal(expired.status,502);
  report.checks.push({tripIndex:index,live:'PASS',edgeCache:'PASS',markedStale:'PASS',expiry:'PASS'});
 }
 report.result='PASS';
}catch(error){report.error=error.name;report.operation=error.operation;report.httpStatus=error.status;process.exitCode=1;}
finally{if(created)try{assertSandbox(name);await cf('/workers/scripts/'+name,'DELETE')}catch{report.cleanup='BLOCKED';process.exitCode=1;}await rm(dir,{recursive:true,force:true});await mkdir('../weather-safe-status',{recursive:true});await writeFile('../weather-safe-status/edge.json',JSON.stringify(report,null,2));console.log('WEATHER EDGE VERIFICATION '+JSON.stringify(report));}
