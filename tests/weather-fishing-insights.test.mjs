import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {weatherFixture} from '../scripts/qa-weather.mjs';
import {database} from './db.mjs';
import {weatherForTrip} from '../src/weather.js';

const script=await readFile('public/weather-fishing-insights.js','utf8');
const conditions=await readFile('public/weather-conditions.js','utf8');

const setup=()=>{
 const dom=new JSDOM('<!doctype html><div id="carp-weather-headline"></div><div id="carp-pressure"></div><div id="carp-wind"></div><div id="carp-rain"></div><div id="carp-air"></div><div id="carp-window"></div><ul id="carp-weather-actions"></ul><p id="carp-limitations"></p>',{url:'https://dream.test/pages/pogoda.html',runScripts:'outside-only'});
 dom.window.eval(conditions);dom.window.eval(script);return dom;
};

test('pressure, wind, temperature and rain are used without inventing bite odds',()=>{
 const dom=setup(),data=weatherFixture();
 try{
  const idx=14;
  data.hourly.pressure_msl[idx-3]=1008;
  data.hourly.pressure_msl[idx]=1012;
  data.hourly.pressure_msl[idx+6]=1010;
  data.hourly.wind_gusts_10m[idx+4]=37;
  data.hourly.precipitation[idx+5]=5.5;
  const out=dom.window.DreamCarpWeather.render(data,'pl');
  assert.equal(out.available,true);
  assert.match(out.pressure,/4.0 hPa/);
  assert.match(out.wind,/37 km\/h/);
  assert.match(out.rain,/5.5 mm/);
  assert.match(out.riskLabel,/porywy/);
  assert.match(dom.window.document.getElementById('carp-weather-actions').textContent,/wiatr|Porywy|opad/i);
  assert.match(out.limitations,/NIE prognoza brań/);
  assert.doesNotMatch(dom.window.document.body.textContent,/(szansa na branie|procent brań|% szans)/i);
 }finally{dom.window.close();}
});

test('approaching storms take precedence over easy rig access and missing water data is explicit',()=>{
 const dom=setup(),data=weatherFixture();
 try{
  data.hourly.weather_code[19]=95;
  const out=dom.window.DreamCarpWeather.analyse(data,'en');
  assert.equal(out.threatCount,1);
  assert.match(out.riskLabel,/hazard/);
  assert.match(out.notes[0],/shelter/i);
  assert.match(out.limitations,/water temperature or oxygen/);
  assert.match(out.window,/Calmer|No confirmed/);
 }finally{dom.window.close();}
});

test('missing meteo measurements remain missing, never zero',()=>{
 const dom=setup(),data=weatherFixture();
 try {
   delete data.hourly.precipitation;
   delete data.hourly.pressure_msl;
   const out=dom.window.DreamCarpWeather.analyse(data,'pl');
   assert.match(out.rain,/Brak danych/);
   assert.match(out.pressure,/brak danych/);
 }finally{dom.window.close();}
});

test('Open-Meteo forecast requests probability data for 24-hour precipitation planning',async()=>{
 const DB=database();let request;
 try{
  await weatherForTrip({DB,WEATHER_FETCH:async url=>{
    request=new URL(url);
    return Response.json(weatherFixture());
  }},'next-trip');
  assert.match(request.searchParams.get('hourly'),/precipitation_probability/);
  assert.match(request.searchParams.get('hourly'),/pressure_msl/);
  assert.match(request.searchParams.get('hourly'),/wind_direction_10m/);
 }finally{DB.close();}
});

for(const lang of ['pl','en'])test(`missing weather is explicitly labelled and never reassures: ${lang}`,()=>{
 const dom=setup(),data=weatherFixture();
 try{
  for(const k of ['pressure_msl','temperature_2m','wind_speed_10m','wind_gusts_10m','wind_direction_10m','precipitation','weather_code']){delete data.hourly[k];delete data.current[k];}
  const report=dom.window.DreamCarpWeather.render(data,lang);
  assert.equal(report.safety.state,'UNKNOWN');assert.equal(report.safety.complete,false);
  for(const key of ['pressure','wind','rain'])assert.match(report[key],lang==='pl'?/Brak danych/:/No data/);
  assert.doesNotMatch(report.window,/Spokojniejsze 3 h od|Calmer 3 h starting/);
  const absent=dom.window.DreamCarpWeather.render({...data,hourly:{}},lang);
  assert.equal(absent.available,false);assert.equal(absent.safety.state,'UNKNOWN');
  for(const id of ['carp-pressure','carp-wind','carp-rain','carp-air','carp-window'])assert.match(dom.window.document.getElementById(id).textContent,lang==='pl'?/Brak danych/:/No data/);
  data.hourly={};data.current.weather_code=95;
  assert.equal(dom.window.DreamCarpWeather.analyse(data,lang).safety.state,'DANGER');
 }finally{dom.window.close();}
});
