import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import {database} from './db.mjs';import {weatherForTrip} from '../src/weather.js';import {weatherFixture} from '../scripts/qa-weather.mjs';
const window={};vm.runInNewContext(await readFile('public/weather-conditions.js','utf8'),{window});const model=window.DreamConditions;
const mild={temperature_2m:15,wind_speed_10m:10,wind_gusts_10m:20,precipitation:0,weather_code:3};
test('conditions are practical categories: pressure, moon and clock never predict bites',()=>{
 const base=model.assess(mild);assert.equal(base.grade,2);assert.equal(base.uncertainty,'high');assert.ok(base.positive.length);assert.ok(base.explanation.includes('nie określają tu szansy brania'));
 for(const pressure of [0,970,1013,1060])for(const hour of [0,6,12,23])assert.equal(model.assess({...mild,pressure_msl:pressure,hour,moon_phase:hour/24}).grade,base.grade);
 for(const scenario of [{wind_gusts_10m:90},{weather_code:95},{temperature_2m:-40},{temperature_2m:50},{precipitation:30}]){const r=model.assess({...mild,...scenario});assert.equal(r.grade,0);assert.ok(r.negative.length);}
 assert.equal(model.assess({pressure_msl:1013}).grade,null);assert.equal(model.assess({}).missing.length,5);assert.equal(model.assess({...mild,wind_speed_10m:-1}).grade,null);assert.equal(model.assess({weather_code:95}).grade,0);assert.equal(model.trend([null,1010,1011,1012],3),null);assert.equal(model.trend([1005,1007,1008,1011],3).direction,'rośnie');assert.doesNotMatch(model.assess(mild,'en').uncertaintyText,/[ąćęłńóśźż]/i);
});
test('forecast uses explicit units, one stored GPS pair and absolute epochs across DST',async()=>{
 const DB=database(),first=Date.UTC(2026,9,25,0)/1000;let url;
 try{const data=await weatherForTrip({DB,WEATHER_FETCH:async target=>{url=new URL(target);return Response.json({timezone:'Europe/Warsaw',utc_offset_seconds:3600,current:{time:first+5400,temperature_2m:15},hourly:{time:[first,first+3600]},daily:{time:[Date.UTC(2026,9,24,23)/1000],sunrise:[first+6*3600],sunset:[first+15*3600]}});}},'next-trip');
 assert.equal(url.searchParams.get('timeformat'),'unixtime');assert.equal(url.searchParams.get('wind_speed_unit'),'kmh');assert.equal(url.searchParams.get('temperature_unit'),'celsius');assert.equal(url.searchParams.get('precipitation_unit'),'mm');assert.equal(url.searchParams.get('past_hours'),'12');assert.ok(url.searchParams.get('daily').includes('sunrise,sunset'));
 assert.deepEqual(data.hourly.time,['2026-10-25T02:00','2026-10-25T02:00']);assert.equal(model.hourIndex(data),1);assert.equal(data.daily.time[0],'2026-10-25');assert.equal(data.daily.sunrise[0],'2026-10-25T07:00');assert.equal(data.dreamteam.waterTemperature,null);assert.equal(data.dreamteam.measurementStatus,'not_measured');
 DB.sqlite.exec("UPDATE lakes SET latitude=50,longitude=NULL WHERE id='plaine2'");await assert.rejects(weatherForTrip({DB,WEATHER_FETCH:()=>{throw Error('must not fetch mixed GPS');}},'next-trip'),/GPS/);
 }finally{DB.close();}
});
test('weather renderer preserves zeros, shows missing fields and sends one refresh at a time',async()=>{
 const legacyIds=[...new Set([...((await readFile('public/fixes.js','utf8')).matchAll(/(?:\$\(|setNotes\()["']([^"']+)["']/g))].map(m=>m[1]))];
 const dom=new JSDOM('<main>'+legacyIds.map(id=>'<div id="'+id+'"></div>').join('')+'</main>',{url:'https://dream.test/pages/pogoda.html',runScripts:'outside-only'}),w=dom.window,data=weatherFixture(),notices=[];let calls=0;
 try{w.FISHING_SPOT={latitude:50,longitude:20,name:'Fixture lake'};w.DREAM_TRIP={id:'next-trip'};w.Dream={notice:m=>notices.push(m),zone:()=>data.timezone};w.AbortSignal=AbortSignal;w.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json(data);};w.eval(await readFile('public/weather-conditions.js','utf8'));w.eval(await readFile('public/fixes.js','utf8'));
 data.current.temperature_2m=null;data.current.wind_speed_10m=null;data.current.precipitation=0;data.current.relative_humidity_2m=null;delete data.hourly.soil_temperature_0cm;
 await Promise.all([w.DreamWeather.render(),w.DreamWeather.render()]);assert.equal(calls,1);assert.equal(w.document.getElementById('weather-current-temp').textContent,'--');assert.equal(w.document.getElementById('weather-current-wind').textContent,'-- / 15.0 km/h');assert.equal(w.document.getElementById('weather-precipitation').textContent,'0.0 mm');assert.equal(w.document.getElementById('soil-temp').textContent,'--');assert.equal(w.document.getElementById('water-temp').textContent,'Brak pomiaru');assert.match(w.document.getElementById('bite-analysis').textContent,/Niepewność brań: wysoka/);assert.deepEqual(notices,[]);
 data.current={...data.current,...mild,weather_code:95};await w.DreamWeather.render();assert.equal(w.document.getElementById('bite-chance-main').textContent,'Zagrożenie pogodowe');assert.match(w.document.getElementById('bite-tactic-box').textContent,/bezpiecznego budynku/);assert.equal(w.document.getElementById('refresh-weather-btn').disabled,false);
 }finally{w.close();}
});
test('approximate Moon illumination agrees coarsely with NASA 2026 samples and is labelled',async()=>{
 const dom=new JSDOM('<main></main>',{url:'https://dream.test/pages/pogoda.html',runScripts:'outside-only'});try{dom.window.eval(await readFile('public/fixes.js','utf8'));const moon=dom.window.DreamWeather.moonPhaseInfo;
 // NASA SVS 5587 mooninfo_2026.json; these samples do not validate bite predictions.
 for(const [date,illum]of [['2026-10-12T12:00:00Z',3.74],['2026-01-03T12:00:00Z',99.86],['2026-02-01T12:00:00Z',99.71]])assert.ok(Math.abs(parseFloat(moon(new Date(date)).illumination)-illum)<5,date);assert.ok((await readFile('public/weather-pro2.js','utf8')).includes('Astronomia · Księżyc: 0 punktów'));
 }finally{dom.window.close();}
});

test('air forecast does not set water temperature or bait/feed recommendations; null air is not zero',async()=>{const {generateTripAdvice}=await import('../src/trip-advice.js');const trip={id:'qa',name:'fixture',start:'2026-11-14',end:'2026-11-21',facts:{}},lake={country:'Polska',latitude:52,facts:{}};const make=(min,max)=>generateTripAdvice({trip,lake,weather:{daily:{time:['2026-11-14'],temperature_2m_min:[min],temperature_2m_max:[max]}}});assert.deepEqual(make(0,2).suggestions,make(25,30).suggestions);assert.equal(make(null,null).weatherAvailable,false);});
