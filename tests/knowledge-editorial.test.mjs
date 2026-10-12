import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const read=async path=>JSON.parse(await readFile(path,'utf8'));
test('encyclopedia editions keep every topic, source link and evidence section aligned',async()=>{
 const [pl,en,sources]=await Promise.all(['public/data/knowledge/encyclopedia.json','public/data/knowledge/en/encyclopedia.json','public/data/knowledge/sources.json'].map(read));
 const refs=new Set(sources.sources.map(s=>s.id));
 assert.equal(new Set(pl.articles.map(a=>a.id)).size,14);
 assert.deepEqual(Object.keys(en.articles).sort(),pl.articles.map(a=>a.id).sort());
 for(const a of pl.articles){
  assert.equal(en.articles[a.id].sections.length,a.sections.length,a.id+': PL/EN section correspondence');
  for(const s of a.sections){assert.ok(['science','practice','manufacturer','rules'].includes(s.type));for(const id of s.sourceIds)assert.ok(refs.has(id),id);}
 }
 for(const id of ['temperatura','lokalizacja','pogoda','necenie'])assert.ok(pl.articles.find(a=>a.id===id).sections.some(s=>s.type==='science'&&s.sourceIds.length),id);
 assert.ok(pl.articles.find(a=>a.id==='bezpieczenstwo').sections.some(s=>s.type==='rules'&&s.sourceIds.includes('s51')));
});
test('real knowledge renderer handles unknown measurements, a safety stop and all diagnostic steps in PL/EN',async()=>{
 const source=await readFile('public/knowledge.js','utf8');
 for(const lang of ['pl','en']){
  const dom=new JSDOM('<div id="knowledge-root" data-module="encyclopedia"></div>',{url:'https://dream.test/pages/encyklopedia.html',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.DreamLanguage={get:()=>lang};
  dom.window.fetch=async path=>({ok:true,status:200,json:()=>read('public'+path)});
  await new vm.Script('(async()=>{'+source+'})()').runInContext(dom.getInternalVMContext());
  const d=dom.window.document;
  assert.equal(d.querySelectorAll('.knowledge-entry').length,14);
  assert.equal(d.querySelector('#t-temp').value,'unknown');
  const submit=()=>d.querySelector('#tactic-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  submit();assert.match(d.querySelector('#tactic-result').textContent,lang==='pl'?/Wysoka: temperatura wody niezmierzona/:/High: water temperature not measured/);
  d.querySelector('#t-safe').value='unsafe';submit();
  assert.match(d.querySelector('#tactic-result').textContent,lang==='pl'?/Przerwij łowienie/:/Stop fishing/);
  assert.equal(d.querySelector('#tactic-result dl'),null,'unsafe scenario must not suggest feeding');
  d.querySelector('#t-safe').value='safe';d.querySelector('#t-temp').value='warm';submit();
  assert.ok(d.querySelector('#tactic-result dl'));assert.doesNotMatch(d.querySelector('#tactic-result').textContent,/Wysoka: temperatura wody niezmierzona|High: water temperature not measured/);
  d.querySelector('#diagnostic-step [data-answer="no"]').click();
  for(let i=1;i<8;i++)d.querySelector('#diagnostic-step [data-answer="yes"]').click();
  assert.equal(d.querySelectorAll('#diagnostic-step li').length,1,'first uncertainty retained in final plan');
  assert.ok(d.querySelector('#diagnostic-restart'));d.querySelector('#diagnostic-restart').click();assert.equal(d.querySelectorAll('#diagnostic-step [data-answer]').length,3);
  const thermal=d.querySelector('#temperatura');assert.match(thermal.textContent,lang==='pl'?/Co potwierdzono w badaniach/:/What research supports/);
  assert.ok(thermal.querySelector('a[href*="1439-0426"]'));
  dom.window.close();
 }
});
