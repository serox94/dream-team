import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {database} from './db.mjs';
import {extractFacts} from '../src/lake-research.js';

test('research retains original language and source evidence while leaving optional translations empty',async()=>{
 const DB=database(),env={DB,RYBY_LOGIN_USERNAME:'tester',RYBY_LOGIN_PASSWORD:'local-password',RYBY_SESSION_SECRET:'local-secret-32-characters-test-value'};
 try{
  const login=await worker.fetch(new Request('https://dream.test/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=tester&password=local-password'}),env),cookie=login.headers.get('set-cookie').split(';')[0];
  const write=async(value,language)=>worker.fetch(new Request('https://dream.test/api/lakes/wygonin/facts',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({url:'https://example.org/rules',field:'bottom',value,evidence:`Bottom: ${value}`,sourceLanguage:language})}),env);
  assert.equal((await write('soft silt','en')).status,201);
  let fact=DB.sqlite.prepare("SELECT original_text,source_language,normalized_value,translation_pl,translation_en FROM lake_facts WHERE field='bottom'").get();
  assert.equal(fact.original_text,'Bottom: soft silt');assert.equal(fact.source_language,'en');assert.equal(fact.normalized_value,'soft silt');assert.equal(fact.translation_pl,null);
  DB.sqlite.prepare("UPDATE lake_facts SET translation_pl='miękki muł'").run();
  await write('soft silt','en');fact=DB.sqlite.prepare("SELECT translation_pl FROM lake_facts WHERE field='bottom'").get();assert.equal(fact.translation_pl,'miękki muł');
  await write('gravel','en');fact=DB.sqlite.prepare("SELECT translation_pl,original_text FROM lake_facts WHERE field='bottom'").get();assert.equal(fact.translation_pl,null);assert.equal(fact.original_text,'Bottom: gravel');
  assert.equal(extractFacts('Głębokość: 6 m')[0].sourceLanguage,'pl');
 }finally{DB.close();}
});
