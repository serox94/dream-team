import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async name=>JSON.parse(await readFile(`public/data/knowledge/${name}.json`,'utf8'));
test('editorial data has traceable sources, valid crosslinks and distinct modules',async()=>{
  const [sources,encyclopedia,sonar,tools]=await Promise.all(['sources','encyclopedia','sonar','tools'].map(read));
  const ids=new Set([...encyclopedia.articles,...sonar.articles].map(a=>a.id));
  const refs=new Set(sources.sources.map(s=>s.id));
  assert.equal(refs.size,sources.sources.length);
  assert.ok(['PL','EN','FR','DE','NL'].every(lang=>sources.sources.some(s=>s.lang.includes(lang))));
  assert.ok(encyclopedia.articles.length>=14&&sonar.articles.length>=15);
  for(const article of [...encyclopedia.articles,...sonar.articles]){
    assert.ok(article.title&&article.lead&&article.category&&article.sections.length&&article.tags.length,article.id);
    assert.ok(article.sourceIds.length>=2,`${article.id}: multiple sources`);
    for(const source of article.sourceIds)assert.ok(refs.has(source),`${article.id}: ${source}`);
    for(const related of article.related||[])assert.ok(ids.has(related),`${article.id}: ${related}`);
  }
  assert.equal(encyclopedia.substrates.length,20);
  assert.equal(encyclopedia.profiles.length,20);
  assert.equal(encyclopedia.temperatures.length,7);
  assert.ok(sonar.quiz.length>=9&&new Set(sonar.quiz.map(q=>q.level)).size===3);
  for(const question of sonar.quiz){assert.ok(question.options[question.correct]);for(const source of question.sourceIds)assert.ok(refs.has(source));}
  assert.equal(tools.diagnostic.length,8);
  assert.ok(Object.values(tools.spots).every(points=>points.length===3));
  assert.ok(!JSON.stringify(encyclopedia).includes('LodgingCarp'));
  assert.ok(!JSON.stringify(sonar).includes('LodgingCarp'));
});
