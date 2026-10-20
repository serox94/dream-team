// Targeted real Chromium regression for the failed release gate; disposable local data only.
import assert from 'node:assert/strict';import {chromium} from 'playwright';import {serve} from './qa-server.mjs';import {weatherFixture} from './qa-weather.mjs';import {assertWeatherFields,weatherFieldIds} from './qa-weather-fields.mjs';
let forecast=weatherFixture();const server=await serve({seed:true,weatherFetch:async()=>Response.json(forecast)}),browser=await chromium.launch(),results=[];
try{for(const width of [390,1280])for(const language of ['pl','en']){
 const context=await browser.newContext({viewport:{width,height:844},serviceWorkers:'block',locale:language==='pl'?'pl-PL':'en-GB'});await context.addInitScript(l=>localStorage.setItem('dreamteam.language',l),language);const page=await context.newPage();
 for(const scenario of ['complete','missing','missing-storm','two-hours']){
  forecast=weatherFixture();if(scenario.startsWith('missing'))for(const key of ['pressure_msl','temperature_2m','wind_speed_10m','wind_gusts_10m','wind_direction_10m','precipitation','weather_code']){delete forecast.hourly[key];delete forecast.current[key];}
  if(scenario==='missing-storm')forecast.current.weather_code=95;if(scenario==='two-hours')for(const key of Object.keys(forecast.hourly))forecast.hourly[key]=forecast.hourly[key].slice(14,16);
  await page.goto(server.url+'/pages/pogoda.html',{waitUntil:'domcontentloaded'});await page.locator('html[data-ready="true"]').waitFor();await page.locator('#weather-source-status').filter({hasText:'Open-Meteo'}).waitFor();await page.locator('#refresh-weather-btn:not([disabled])').waitFor();
  const before=await page.evaluate(ids=>Object.fromEntries(ids.map(id=>[id,{inner:document.getElementById(id).innerText,text:document.getElementById(id).textContent}])),weatherFieldIds);
  const fields=await assertWeatherFields(page);const safety=await page.evaluate(f=>window.DreamCarpWeather.safety(f).state,forecast);
  if(scenario==='complete'){assert.equal(safety,'SAFE');for(const id of weatherFieldIds.slice(0,4))assert.match(fields[id],/\d/);}else{assert.equal(safety,scenario==='missing-storm'?'DANGER':'UNKNOWN');if(scenario.startsWith('missing'))for(const id of weatherFieldIds.slice(0,4))assert.match(fields[id],language==='pl'?/Brak danych/:/No data/);assert.doesNotMatch(fields['carp-window'],/Spokojniejsze 3 h od|Calmer 3 h starting/);}
  if(scenario==='missing-storm')assert.match(await page.locator('#carp-weather-actions').innerText(),language==='pl'?/Burza/:/Thunderstorm/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);results.push({width,language,scenario,safety,fields,before});
 }
 await context.close();
}console.log('WEATHER RELEASE REGRESSION PASS '+JSON.stringify({cases:results.length,results,productionWrites:0}));}finally{await browser.close();await server.close();}
