import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
test('sonar translations, source evidence and reference image units agree',async()=>{
 const [pl,en,quiz,atlas,atlasEn,sources]=await Promise.all(['public/data/knowledge/sonar.json','public/data/knowledge/en/sonar.json','public/data/knowledge/en/quiz.json','public/assets/deeper/chirp2/index.json','public/assets/deeper/chirp2/index.en.json','public/data/knowledge/sources.json'].map(read));
 const refs=new Set(sources.sources.map(s=>s.id));
 assert.equal(pl.articles.length,17);assert.deepEqual(Object.keys(en.articles).sort(),pl.articles.map(a=>a.id).sort());
 for(const a of pl.articles){assert.equal(a.sections.length,en.articles[a.id].sections.length,a.id);for(const s of a.sections){assert.ok(['practice','manufacturer'].includes(s.type));for(const id of s.sourceIds)assert.ok(refs.has(id));}}
 assert.equal(pl.quiz.length,13);assert.equal(quiz.questions.length,13);
 for(const [i,q] of pl.quiz.entries()){assert.equal(q.options.length,quiz.questions[i][1].length);assert.ok(q.correct>=0&&q.correct<q.options.length);for(const id of q.sourceIds)assert.ok(refs.has(id));}
 assert.equal(atlas.screenshots.length,17);assert.equal(new Set(atlas.screenshots.map(s=>s.src)).size,17);
 for(const shot of atlas.screenshots){assert.ok(atlasEn.screenshots[shot.id]);assert.ok(pl.articles.some(a=>a.id===shot.articleId));assert.ok((await readFile('public/assets/deeper/chirp2/'+shot.src)).length>1000);assert.ok(Math.abs(shot.displayedDepth.metres-shot.displayedDepth.value*(shot.displayedDepth.unit==='ft'?0.3048:1))<1e-5);}
 assert.equal(atlas.screenshots.find(s=>s.id==='echo-10').displayedDepth.unit,'ft');
 assert.equal(atlas.screenshots.find(s=>s.id==='echo-052356').displayedDepth.metres,7.0104);
 assert.match(atlasEn.note,/Reference screens/);
});
test('actual sonar renderer calculates units/footprints, rejects invalid inputs and finishes all quiz levels',async()=>{
 const source=await readFile('public/knowledge.js','utf8'),questions=(await read('public/data/knowledge/sonar.json')).quiz;
 for(const lang of ['pl','en']){
  const dom=new JSDOM('<div id="knowledge-root" data-module="sonar"></div>',{url:'https://dream.test/pages/sonar.html',runScripts:'outside-only',pretendToBeVisual:true});
  dom.window.DreamLanguage={get:()=>lang};dom.window.fetch=async path=>({ok:true,status:200,json:()=>read('public'+path)});
  await new vm.Script('(async()=>{'+source+'})()').runInContext(dom.getInternalVMContext());
  const d=dom.window.document,input=d.querySelector('#beam-depth'),unit=d.querySelector('#beam-unit'),result=d.querySelector('#beam-result');
  assert.equal(result.dataset.depthMetres,'10');
  for(const [beam,angle] of [['wide',47],['mid',20],['narrow',7]])assert.ok(Math.abs(Number(d.querySelector('[data-footprint="'+beam+'"]').dataset.metres)-20*Math.tan(angle*Math.PI/360))<1e-10);
  unit.value='ft';unit.dispatchEvent(new dom.window.Event('change'));input.value='23';input.dispatchEvent(new dom.window.Event('input'));assert.ok(Math.abs(Number(result.dataset.depthMetres)-7.0104)<1e-8);
  for(const value of ['','-2','1000']){input.value=value;input.dispatchEvent(new dom.window.Event('input'));assert.equal(input.getAttribute('aria-invalid'),'true');assert.equal(result.dataset.depthMetres,undefined);assert.equal(result.querySelector('table'),null);assert.doesNotMatch(result.textContent,/NaN|Infinity/);}
  unit.value='m';unit.dispatchEvent(new dom.window.Event('change'));input.value='23';input.dispatchEvent(new dom.window.Event('input'));assert.equal(result.dataset.depthMetres,'23');
  assert.equal(d.querySelector('#s-temp').value,'unknown');d.querySelector('#s-depth').value='mid';d.querySelector('#spot-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(d.querySelectorAll('#spot-result li').length,3);assert.doesNotMatch(d.querySelector('#spot-result').textContent,/undefined/);assert.match(d.querySelector('#spot-result').textContent,lang==='pl'?/Temperatura wody niezmierzona/:/Water temperature is not measured/);
  const level=d.querySelector('#quiz-level');
  for(const n of [1,2,3]){level.value=String(n);level.dispatchEvent(new dom.window.Event('change'));const group=questions.filter(q=>q.level===n);for(const q of group){d.querySelector('[data-quiz="'+q.correct+'"]').click();assert.ok([...d.querySelectorAll('[data-quiz]')].every(b=>b.disabled));d.querySelector('[data-quiz="'+q.correct+'"]').click();d.querySelector('#quiz-next').click();}assert.match(d.querySelector('#quiz-stage').textContent,new RegExp(group.length+' / '+group.length));d.querySelector('#quiz-restart').click();assert.ok(d.querySelector('[data-quiz]'));}
  if(lang==='en')assert.doesNotMatch(d.querySelector('#sonar-gallery > p').textContent,/[ąćęłńóśźż]/i);
  assert.equal(d.querySelectorAll('#atlas-overview .deeper-shot').length,17);assert.match(d.querySelector('#atlas-overview p').textContent,lang==='pl'?/jednostki/i:/Reference screens/i);
  dom.window.close();
 }
});
