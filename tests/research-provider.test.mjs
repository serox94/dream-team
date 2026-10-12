import test from 'node:test';import assert from 'node:assert/strict';import {provider,extractFacts} from '../src/lake-research.js';
test('confirmed source URLs perform one bounded extract and cannot import unsolicited pages',async()=>{
 const original=globalThis.fetch,calls=[];try{
  globalThis.fetch=async(url,options)=>{calls.push({url,payload:JSON.parse(options.body)});return Response.json({results:[{url:'https://other.example/wrong-lake',raw_content:'Depth: 90 m'},{url:'https://lake.example/rules',raw_content:'Depth: 6 m'}]});};
  const web=provider({TAVILY_API_KEY:'fixture-key'});for(const type of ['manual','official','regulation']){const result=await web.research('Existing lake','France','https://lake.example/rules',type,{languages:'PL,EN'});assert.equal(result.length,1);assert.equal(result[0].url,'https://lake.example/rules');assert.equal(result[0].sourceType,type);assert.equal(result[0].content,'Depth: 6 m');}
  assert.equal(calls.length,3);assert.ok(calls.every(c=>c.url==='https://api.tavily.com/extract'));assert.ok(calls.every(c=>c.payload.urls.length===1&&c.payload.urls[0]==='https://lake.example/rules'&&c.payload.extract_depth==='basic'&&c.payload.timeout===10));
  globalThis.fetch=async()=>Response.json({results:[{url:'https://redirect.example/',raw_content:'Depth: 90 m'}],failed_results:[{url:'https://lake.example/rules',error:'unavailable'}]});assert.deepEqual(await web.research('Lake','France','https://lake.example/rules'),[]);
  globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(web.research('Lake','France','https://lake.example/rules'),error=>error.status===429);
 }finally{globalThis.fetch=original;}
});

test('source language uses explicit aliases and compound arrival/departure clauses stay separate',()=>{
 const facts=extractFacts('Arrival time: between 12 p.m. and 2 p.m. – Departure time: between 9 a.m. and 10 a.m.\nAdresse: Clos du Lyot\nMaximum depth: 4 m\nGłębokość: 6 m\nEmail: contact@example.org');
 assert.equal(facts.find(f=>f.field==='arrival').sourceLanguage,'en');assert.equal(facts.find(f=>f.field==='departure').sourceLanguage,'en');assert.doesNotMatch(facts.find(f=>f.field==='arrival').value,/Departure/);
 assert.equal(facts.find(f=>f.field==='address').sourceLanguage,null);assert.equal(facts.find(f=>f.field==='email').sourceLanguage,null);assert.equal(facts.find(f=>f.field==='depth').sourceLanguage,'en','first depth label in the source remains the selected value');assert.equal(facts.find(f=>f.field==='depth').value,'4 m');
 assert.equal(extractFacts('Maximum depth: 4 m')[0].sourceLanguage,'en');
});