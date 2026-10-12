import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFile,readdir} from 'node:fs/promises';
import worker from '../src/worker.js';import {database} from './db.mjs';import {apiMessage} from '../src/api-language.js';
const languageScript=await readFile('public/language-preference.js','utf8');
test('two accounts on one device retain independent language preferences and the login preference',()=>{
 const dom=new JSDOM('<html lang="pl"><body></body></html>',{url:'https://dream.test/pages/ustawienia.html',runScripts:'outside-only'}),w=dom.window;Object.defineProperty(w.navigator,'language',{value:'pl-PL'});w.eval(languageScript);
 assert.equal(w.DreamLanguage.get(),'pl');w.DreamLanguage.activate({id:'account-patryk',defaultLanguage:'pl'});w.DreamLanguage.persist('pl');w.DreamLanguage.activate({id:'account-maciek',defaultLanguage:'pl'});w.DreamLanguage.persist('en');assert.equal(w.DreamLanguage.get(),'en');
 w.DreamLanguage.activate({id:'account-patryk'});assert.equal(w.DreamLanguage.get(),'pl');w.DreamLanguage.activate({id:'account-maciek'});assert.equal(w.DreamLanguage.get(),'en');w.eval(languageScript);assert.equal(w.DreamLanguage.get(),'en','reload keeps account preference');
 w.localStorage.removeItem('dreamteam.account.v1');w.eval(languageScript);assert.equal(w.DreamLanguage.get(),'pl','account choice does not change anonymous login preference');dom.window.close();
});
test('every static API error has an English translation, with original Polish preserved',async()=>{
 for(const f of await readdir('src'))if(f.endsWith('.js'))for(const m of (await readFile('src/'+f,'utf8')).matchAll(/(?:fail\(|error:)['"]([^'"\n]+)['"]/g)){assert.notEqual(apiMessage(m[1],'en'),m[1],f+': '+m[1]);assert.equal(apiMessage(m[1],'pl'),m[1]);}
 assert.equal(apiMessage('Waga: wartość od 0.01 do 99.99.','en'),'Weight: value from 0.01 to 99.99.');
});
test('real API auth and validation errors follow request language without translating user data',async()=>{
 const DB=database(),env={DB,INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'fixture',RYBY_LOGIN_PASSWORD:'fixture-only-password',RYBY_SESSION_SECRET:'fixture-only-session-secret-long-enough',ASSETS:{fetch:()=>new Response('asset')}};
 try{
 const unauth=await worker.fetch(new Request('https://dream.test/api/accounts',{headers:{'accept-language':'en'}}),env);assert.equal(unauth.status,401);assert.equal((await unauth.json()).error,'Sign-in is required.');
 const login=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:env.RYBY_LOGIN_PASSWORD})}),env);const cookie=login.headers.get('set-cookie').split(';')[0];
 const bad=await worker.fetch(new Request('https://dream.test/api/catches',{method:'POST',headers:{cookie,'accept-language':'en','content-type':'application/json'},body:JSON.stringify({tripId:'next-trip',anglerId:'patryk',weightKg:0})}),env);assert.equal(bad.status,400);assert.equal((await bad.json()).error,'Weight: value from 0.01 to 99.99.');
 const pl=await worker.fetch(new Request('https://dream.test/api/missing',{headers:{cookie,'accept-language':'pl'}}),env);assert.equal((await pl.json()).error,'Nie znaleziono endpointu.');
 }finally{DB.close();}
});
