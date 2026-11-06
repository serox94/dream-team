import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import vm from 'node:vm';
for(const module of ['sonar','encyclopedia'])for(const lang of ['pl','en'])test(`round two ${module}/${lang}: nearby hits, counts and actual article activation for owner queries`,async()=>{
 const dom=new JSDOM(`<div id="knowledge-root" data-module="${module}"></div>`,{url:'https://local.test/',runScripts:'outside-only',pretendToBeVisual:true});
 try{const w=dom.window;w.DreamLanguage={get:()=>lang};w.HTMLElement.prototype.scrollIntoView=()=>{};w.fetch=async path=>({ok:true,json:async()=>JSON.parse(await readFile('public'+path,'utf8'))});await new vm.Script('(async()=>{'+await readFile('public/knowledge.js','utf8')+'})()').runInContext(dom.getInternalVMContext());
 const d=w.document,input=d.getElementById('knowledge-search');
 for(const query of ['zielsko','muł','temperatura','twardość']){
  input.value=query;input.dispatchEvent(new w.Event('input'));const results=d.getElementById('knowledge-search-results');assert.equal(input.nextElementSibling,results);assert.equal(results.hidden,false);assert.ok(results.querySelectorAll('button').length>0,query);assert.match(results.textContent,/\d+/);assert.equal(d.querySelector('.knowledge-home').hidden,true);const hit=results.querySelector('button');assert.ok(hit.querySelector('strong').textContent&&hit.querySelector('span').textContent);hit.click();assert.equal(d.getElementById('knowledge-library').hidden,false);assert.equal(d.getElementById(hit.dataset.openArticle).hidden,false);assert.equal(d.getElementById(hit.dataset.openArticle).querySelector('details').open,true);
 }
 input.value='';input.dispatchEvent(new w.Event('input'));assert.equal(d.querySelector('.knowledge-home').hidden,false);assert.equal(d.getElementById('knowledge-tools').hidden,false);
 }finally{dom.window.close()}
});
