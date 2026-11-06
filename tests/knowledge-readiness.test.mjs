import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import vm from 'node:vm';
for(const module of ['encyclopedia','sonar'])for(const lang of ['pl','en'])test(`knowledge-ready means its native local form already works without an app model: ${module}/${lang}`,async()=>{
 const dom=new JSDOM(`<main id="knowledge-root" data-module="${module}" aria-busy="true"></main>`,{url:'https://local.test/',runScripts:'outside-only',pretendToBeVisual:true});
 try{const w=dom.window;w.DreamLanguage={get:()=>lang};w.fetch=async path=>({ok:true,json:async()=>JSON.parse(await readFile('public'+path,'utf8'))});let ready=0;
 w.document.addEventListener('dream:knowledge-ready',()=>{ready++;const f=w.document.getElementById(module==='sonar'?'spot-form':'tactic-form');assert.equal(f.dataset.localReady,'true');f.requestSubmit();});
 await new vm.Script('(async()=>{'+await readFile('public/knowledge.js','utf8')+'})()').runInContext(dom.getInternalVMContext());
 assert.equal(ready,1);assert.equal(w.document.documentElement.dataset.ready,undefined);assert.equal(w.DREAM_MODEL,undefined);assert.equal(w.document.getElementById('knowledge-root').getAttribute('aria-busy'),'false');assert.ok(w.document.querySelector(module==='sonar'?'#spot-result .tool-result':'#tactic-result .tool-result'));
 }finally{dom.window.close()}
});
