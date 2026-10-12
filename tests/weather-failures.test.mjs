import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFile} from 'node:fs/promises';import {database} from './db.mjs';import {weatherForTrip} from '../src/weather.js';
test('weather retries transient transport/5xx once, but does not retry quota or malformed forecast',async()=>{
 const DB=database(),data={timezone:'Europe/Paris',current:{time:'2026-10-12T12:00',temperature_2m:15},hourly:{time:['2026-10-12T12:00']},daily:{time:['2026-10-12']}};
 try{for(const failure of ['transport','server']){let attempts=0;const result=await weatherForTrip({DB,WEATHER_FETCH:async()=>{attempts++;if(attempts===1){if(failure==='transport')throw new TypeError('connection reset');return new Response('',{status:503});}return Response.json(data);}},'next-trip');assert.equal(attempts,2);assert.equal(result.current.temperature_2m,15);}
 let attempts=0;await assert.rejects(weatherForTrip({DB,WEATHER_FETCH:async()=>{attempts++;return new Response('',{status:429});}},'next-trip'));assert.equal(attempts,1,'do not hammer provider quota');
 attempts=0;await assert.rejects(weatherForTrip({DB,WEATHER_FETCH:async()=>{attempts++;return Response.json({current:{}});}},'next-trip'));assert.equal(attempts,1,'invalid data remains an error');
 }finally{DB.close();}
});
test('weather timeout shown in Polish never leaks a native English exception',async()=>{
 const dom=new JSDOM('<main><strong id="weather-current-temp"></strong></main>',{url:'https://dream.test/pages/pogoda.html',runScripts:'outside-only'}),w=dom.window,notices=[];
 try{w.FISHING_SPOT={latitude:1,longitude:1};w.DREAM_TRIP={id:'next-trip'};w.Dream={notice:(message)=>notices.push(message)};w.AbortSignal=AbortSignal;w.fetch=async()=>{throw new DOMException('The operation was aborted due to timeout','TimeoutError');};w.eval(await readFile('public/fixes.js','utf8'));await w.DreamWeather.init();assert.deepEqual(notices,['Pogoda niedostępna: Pobieranie prognozy trwa zbyt długo. Spróbuj ponownie.']);}
 finally{w.close();}
});
