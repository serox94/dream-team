// Read-only production diagnosis. Only its own login/logout session is created.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
const base='https://dream-team.sewerynski00.workers.dev',report={build:null,api:[],ui:[],businessWrites:0,provider:'Open-Meteo'};
let cookie,browser;
const call=(path,options={})=>fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(30000),...options,headers:{...(cookie?{cookie}:{}),...options.headers}});
try{
 assert.equal(process.env.GITHUB_EVENT_NAME,'workflow_dispatch');
 const health=await call('/login');report.build=health.headers.get('x-dreamteam-build');assert.equal(report.build,'600d1f55ad0481a77cfc725a7a1810ea15347ee0');
 const auth=await call('/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD})});assert.equal(auth.status,303);cookie=auth.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
 const bootstrap=await call('/api/bootstrap');assert.equal(bootstrap.status,200);const model=await bootstrap.json();
 for(const [i,trip] of model.trips.entries()){
  const started=Date.now();try{const r=await call('/api/weather?tripId='+encodeURIComponent(trip.id));const d=await r.json();const coords={latitude:trip.lakeProfile?.latitude??trip.latitude,longitude:trip.lakeProfile?.longitude??trip.longitude};
   report.api.push({tripIndex:i,france:trip.lakeId==='plaine2',status:r.status,elapsedMs:Date.now()-started,provider:d.dreamteam?.provider,error:r.ok?null:d.error,coordinatesMatch:r.ok?JSON.stringify(d.dreamteam?.requestedCoordinates)===JSON.stringify(coords):null,hours:d.hourly?.time?.length??0});
  }catch(error){report.api.push({tripIndex:i,status:'TRANSPORT',elapsedMs:Date.now()-started,error:error.name});}
 }
 browser=await chromium.launch();
 const france=model.trips.find(t=>t.lakeId==='plaine2')||model.trips[0];
 for(const [width,lang] of [[390,'pl'],[1280,'en']]){
  const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',locale:lang==='pl'?'pl-PL':'en-GB'});
  await context.addCookies([{name:'__Host-ryby_session',value:cookie.slice(cookie.indexOf('=')+1),url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);
  await context.addInitScript(({id,lang})=>{localStorage.setItem('dream_team_viewed_trip',id);localStorage.setItem('dreamteam.language',lang);},{id:france.id,lang});
  const page=await context.newPage();let errors=0;page.on('pageerror',()=>errors++);
  for(const path of ['/pages/pogoda.html','/']){
   const started=Date.now(),requests=[];page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/weather')requests.push(r.status());});
   try{await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000});await page.locator('html[data-ready="true"]').waitFor({timeout:30000});
    if(path.includes('pogoda'))await page.waitForFunction(()=>!['','--','Ładowanie...','Loading...'].includes(document.querySelector('#weather-current-temp')?.textContent),null,{timeout:30000});
    else await page.waitForFunction(()=>!['','--','Ładowanie...','Loading...'].includes(document.querySelector('#dashboard-weather-now')?.textContent),null,{timeout:30000});
    report.ui.push({width,lang,path,elapsedMs:Date.now()-started,weatherStatuses:requests,notice:await page.locator('#app-notice').textContent().catch(()=>null),value:await page.locator(path.includes('pogoda')?'#weather-current-temp':'#dashboard-weather-now').textContent(),analysis:path.includes('pogoda')?await page.locator('#carp-weather-headline').textContent():null,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),javascriptErrors:errors});
   }catch(error){report.ui.push({width,lang,path,error:error.name,elapsedMs:Date.now()-started,weatherStatuses:requests});}
  }
  await context.close();
 }
 report.result=report.api.every(r=>r.status===200&&r.coordinatesMatch)&&report.ui.every(r=>!r.error&&!r.javascriptErrors&&!r.overflow&&!/Błąd|Error|Brak prognozy|No forecast/.test(r.value||''))?'PASS':'FAIL';
}catch(error){report.result='BLOCKED';report.reason=error.name;}
finally{if(browser)await browser.close();if(cookie)await call('/api/logout',{method:'POST'}).catch(()=>{});await mkdir('../weather-safe-status',{recursive:true});await writeFile('../weather-safe-status/status.json',JSON.stringify(report,null,2));console.log('WEATHER DIAGNOSIS '+JSON.stringify(report));if(report.result!=='PASS')process.exitCode=1;}
