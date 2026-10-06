import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';

const script=await readFile('public/i18n.js','utf8');
const locales={pl:JSON.parse(await readFile('public/locales/pl.json')),en:JSON.parse(await readFile('public/locales/en.json'))};
async function device(browserLanguage,preference){
 const dom=new JSDOM('<html lang="pl"><body><main class="login-card"><label>Hasło</label><button>Zaloguj</button><p data-user-content>Połowy</p></main></body></html>',{url:'https://dream.test/login',runScripts:'outside-only'});
 if(preference)dom.window.localStorage.setItem('dreamteam.language',preference);
 Object.defineProperty(dom.window.navigator,'language',{value:browserLanguage,configurable:true});
 dom.window.fetch=async url=>({json:async()=>locales[url.includes('/en.json')?'en':'pl']});
 await dom.window.eval(`(async()=>{${script}})()`);
 return dom;
}
test('device language defaults from browser, persists independently and leaves user content intact',async()=>{
 const patryk=await device('pl-PL'),english=await device('en-GB');
 assert.equal(patryk.window.document.documentElement.lang,'pl');assert.equal(patryk.window.document.querySelector('button').textContent,'Zaloguj');
 assert.equal(english.window.document.documentElement.lang,'en');assert.equal(english.window.document.querySelector('button').textContent,'Sign in');
 assert.equal(english.window.document.querySelector('[data-user-content]').textContent,'Połowy');
 assert.equal(patryk.window.localStorage.getItem('dreamteam.language'),null);
 english.window.localStorage.setItem('dreamteam.language','pl');
 const restarted=await device('en-GB',english.window.localStorage.getItem('dreamteam.language'));
 assert.equal(restarted.window.document.documentElement.lang,'pl');assert.equal(restarted.window.document.querySelector('button').textContent,'Zaloguj');
 patryk.window.close();english.window.close();restarted.window.close();
});
test('late editorial controls translate without changing user notes',async()=>{
 const d=await device('en-GB');
 const root=d.window.document.createElement('div');root.id='knowledge-root';root.innerHTML='<section><p>Typ dna</p><button>Wszystkie pozycje</button><p data-user-content>Typ dna</p></section>';
 d.window.document.body.append(root);await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(root.querySelector('p').textContent,'Bottom type');
 assert.equal(root.querySelector('button').textContent,'All items');
 assert.equal(root.querySelector('[data-user-content]').textContent,'Typ dna');d.window.close();
});
test('English encyclopedia retains all articles, sections and source-linked identities',async()=>{
 for(const name of ['encyclopedia','sonar']){
 const original=JSON.parse(await readFile(`public/data/knowledge/${name}.json`));
 const localized=JSON.parse(await readFile(`public/data/knowledge/en/${name}.json`));
 assert.equal(Object.keys(localized.articles).length,original.articles.length);
 for(const article of original.articles){const copy=localized.articles[article.id];assert.ok(copy,article.id);
  assert.equal(copy.sections.length,article.sections.length,article.id);
  assert.ok(copy.title&&copy.lead&&copy.sections.every(([heading,text])=>heading&&text.length>70),article.id);
  assert.doesNotMatch(JSON.stringify(copy),/[ąćęłńóśźż]/i,article.id);
 }
 }
});
test('English field answers cover every Polish question and preserve article links',async()=>{
 const source=JSON.parse(await readFile('public/data/knowledge/field-guides.json'));
 const en=JSON.parse(await readFile('public/data/knowledge/en/field-guides.json'));
 assert.equal(Object.keys(en.guides).length,source.guides.length);
 for(const guide of source.guides){assert.equal(en.guides[guide.id].length,4);assert.ok(en.guides[guide.id].every(text=>text.length>15));assert.ok(guide.article);}
});
test('English atlas preserves every actual user screenshot and cautious confidence',async()=>{
 const source=JSON.parse(await readFile('public/assets/deeper/chirp2/index.json'));
 const en=JSON.parse(await readFile('public/assets/deeper/chirp2/index.en.json'));
 assert.equal(Object.keys(en.screenshots).length,source.screenshots.length);
 for(const shot of source.screenshots){assert.match(shot.src,/^fish-deeper-/);assert.equal(en.screenshots[shot.id].length,3);assert.ok(en.confidence[shot.confidence]);}
});
test('English dynamic tools preserve diagnostic route IDs and complete decision matrices',async()=>{
 const source=JSON.parse(await readFile('public/data/knowledge/tools.json'));
 const en=JSON.parse(await readFile('public/data/knowledge/en/tools.json'));
 assert.equal(en.diagnostic.length,source.diagnostic.length);
 for(const [index,step] of en.diagnostic.entries()){assert.ok(source.diagnostic[index].link);assert.ok(['q','no','unknown','yes'].every(k=>step[k]?.length>10));}
 for(const key of ['temperature','bottom','pressure','visibility','activity','season','weather','wind','depth'])assert.deepEqual(Object.keys(en.tactics[key]).sort(),Object.keys(source.tactics[key]).sort());
 assert.deepEqual(Object.keys(en.spots).sort(),Object.keys(source.spots).sort());assert.equal(en.scanChecklist.length,source.scanChecklist.length);
});
test('CHIRP+ 2 practice and quiz retain every topic, answer index and source reference',async()=>{
 const practice=JSON.parse(await readFile('public/data/knowledge/chirp2-practice.json'));
 const enPractice=JSON.parse(await readFile('public/data/knowledge/en/chirp2-practice.json'));
 assert.deepEqual(Object.keys(enPractice.practice).sort(),Object.keys(practice.practice).sort());
 assert.ok(Object.values(enPractice.practice).every(row=>row.length===3&&row.every(x=>x.length>25)));
 const sonar=JSON.parse(await readFile('public/data/knowledge/sonar.json'));
 const quiz=JSON.parse(await readFile('public/data/knowledge/en/quiz.json'));
 assert.equal(quiz.questions.length,sonar.quiz.length);
 sonar.quiz.forEach((item,i)=>{assert.equal(quiz.questions[i][1].length,item.options.length);assert.ok(Number.isInteger(item.correct)&&item.correct<item.options.length);assert.ok(item.sourceIds.length);});
});
test('all twenty substrate and flavour profiles plus seven temperature bands have complete English fields',async()=>{
 const original=JSON.parse(await readFile('public/data/knowledge/encyclopedia.json'));
 const en=JSON.parse(await readFile('public/data/knowledge/en/matrices.json'));
 assert.equal(en.substrates.length,original.substrates.length);assert.equal(en.profiles.length,original.profiles.length);assert.equal(en.temperatures.length,original.temperatures.length);
 for(const [name,family,sign,presentation,risk] of en.substrates){assert.ok(name&&sign&&presentation&&risk);assert.equal(en.substrateFamilies[family].length,4);}
 for(const [name,family,use,pair,caveat] of en.profiles){assert.ok(name&&use&&pair&&caveat);assert.equal(en.profileFamilies[family].length,4);}
 assert.doesNotMatch(JSON.stringify(en),/[ąćęłńóśźż]/i);
});
