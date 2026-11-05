import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';import vm from 'node:vm';
for(const module of ['sonar','encyclopedia'])for(const lang of ['pl','en'])test(`full article search across PL/EN, accents and visible result bodies: ${module}/${lang}`,async()=>{
 const dom=new JSDOM(`<div id="knowledge-root" data-module="${module}"></div>`,{url:'https://local.test/pages/'+(module==='sonar'?'sonar':'encyklopedia')+'.html',runScripts:'outside-only',pretendToBeVisual:true});
 try{const w=dom.window;w.DreamLanguage={get:()=>lang};w.fetch=async path=>({ok:true,json:async()=>JSON.parse(await readFile('public'+path,'utf8'))});
 await new vm.Script('(async()=>{'+await readFile('public/knowledge.js','utf8')+'})()').runInContext(dom.getInternalVMContext());
 const d=w.document,query=d.querySelector('#knowledge-search');
 const data=JSON.parse(await readFile('public/data/knowledge/'+module+'.json','utf8'));const article=data.articles[0],phrase=article.sections[0].p.split(/\s+/).slice(2,5).join(' ');
 query.value=phrase;query.dispatchEvent(new w.Event('input',{bubbles:true}));assert.ok(d.getElementById(article.id));assert.equal(d.getElementById(article.id).querySelector('details').open,true);
 const localized=JSON.parse(await readFile('public/data/knowledge/en/'+module+'.json','utf8'));query.value=localized.articles[article.id].sections[0][1].split(/\s+/).slice(2,5).join(' ');query.dispatchEvent(new w.Event('input',{bubbles:true}));assert.ok(d.getElementById(article.id),'English article body indexed even in PL');
 query.value='qzx-no-such-article';query.dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('.knowledge-entry').length,0);
 if(module==='sonar'){assert.equal(d.querySelector('#screenshot'),null);assert.ok(d.querySelector('#trainer'));assert.ok(d.querySelector('#atlas-overview'));}
 }finally{dom.window.close()}
});
