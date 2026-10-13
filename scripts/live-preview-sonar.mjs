import {authenticateReadOnly} from './preview-readonly-auth.mjs';
// Real isolated preview; read-only knowledge, no inference/provider or business writes.
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const questions=JSON.parse(await readFile('public/data/knowledge/sonar.json','utf8')).quiz;
await mkdir('live-preview-qa',{recursive:true});
for(const width of [390,1280])for(const lang of ['pl','en']){
 const browser=await chromium.launch(),context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:844},locale:lang==='pl'?'pl-PL':'en-GB'}),page=await context.newPage();let phase='login';
 page.setDefaultTimeout(25000);
 const open=async(path,ready)=>{for(let attempt=0;attempt<2;attempt++){try{await page.goto(base+path,{waitUntil:'commit',timeout:30000});await page.locator(ready).waitFor({timeout:30000});return;}catch(error){console.warn('SONAR NAVIGATION',phase,path,attempt+1,String(error.message).split('\n')[0]);if(attempt||error.name!=='TimeoutError')throw error;}}};
 try{
  await authenticateReadOnly(context,base,lang);
  phase='sonar navigation';await open('/pages/sonar.html',`html[data-ready="true"][data-i18n-ready="${lang}"]`);await page.locator('#beam-form').waitFor();
  assert.equal(await page.locator('.knowledge-entry').count(),17);assert.equal(await page.locator('#atlas-overview .deeper-shot').count(),17);
  assert.match(await page.locator('#atlas-overview > p').first().innerText(),lang==='pl'?/jednostki/i:/Reference screens/);
  phase='beam geometry and unit conversion';assert.equal(await page.locator('#beam-result').getAttribute('data-depth-metres'),'10');
  for(const [beam,angle] of [['wide',47],['mid',20],['narrow',7]])assert.ok(Math.abs(Number(await page.locator('[data-footprint="'+beam+'"]').getAttribute('data-metres'))-20*Math.tan(angle*Math.PI/360))<1e-10);
  await page.locator('#beam-unit').selectOption('ft');await page.locator('#beam-depth').fill('23');await page.locator('#beam-form button').click();assert.ok(Math.abs(Number(await page.locator('#beam-result').getAttribute('data-depth-metres'))-7.0104)<1e-8);
  await page.locator('#beam-lab').scrollIntoViewIfNeeded();await page.screenshot({path:`live-preview-qa/sonar-units-${lang}-${width}.png`});
  for(const value of ['','-2','1000']){await page.locator('#beam-depth').fill(value);assert.equal(await page.locator('#beam-depth').getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#beam-result table').count(),0);assert.doesNotMatch(await page.locator('#beam-result').innerText(),/NaN|Infinity/);}
  await page.locator('#beam-unit').selectOption('m');await page.locator('#beam-depth').fill('23');assert.equal(await page.locator('#beam-result').getAttribute('data-depth-metres'),'23');
  phase='spot picker with unknown water';assert.equal(await page.locator('#s-temp').inputValue(),'unknown');await page.locator('#s-depth').selectOption('mid');await page.locator('#spot-form button').click();assert.equal(await page.locator('#spot-result li').count(),3);const text=await page.locator('#spot-result').innerText();assert.doesNotMatch(text,/undefined/);assert.match(text,lang==='pl'?/Temperatura wody niezmierzona/:/Water temperature is not measured/);if(lang==='en')assert.doesNotMatch(text,/[ąćęłńóśźż]/i);
  phase='all quiz levels';
  for(const level of [1,2,3]){
   await page.locator('#quiz-level').selectOption(String(level));const group=questions.filter(q=>q.level===level);
   for(const q of group){await page.locator('[data-quiz="'+q.correct+'"]').click();await page.locator('#quiz-next').waitFor();assert.equal(await page.locator('[data-quiz]:not([disabled])').count(),0);assert.match(await page.locator('#quiz-feedback strong').innerText(),lang==='pl'?/Dobrze/:/Correct/);assert.equal(await page.locator('#quiz-feedback .article-sources a').count(),q.sourceIds.length);await page.locator('#quiz-next').click();}
   assert.match(await page.locator('#quiz-stage').innerText(),new RegExp(group.length+' / '+group.length));await page.locator('#quiz-restart').click();assert.ok(await page.locator('[data-quiz]').count());
  }
  phase='original atlas images and corrected depth';
  for(const [file,depth] of [['fish-deeper-10.png','24.2 ft'],['fish-deeper-052356.png','23.0 ft']]){
   const img=page.locator('#atlas-overview img[src$="'+file+'"]');await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());assert.ok(await img.evaluate(el=>el.naturalWidth>0));assert.match(await img.locator('xpath=ancestor::figure').innerText(),new RegExp(depth.replace('.','\\.')));
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(await page.locator('#app-notice.status-danger').allTextContents(),[]);
  await page.screenshot({path:`live-preview-qa/sonar-atlas-${lang}-${width}.png`});
  console.log(`LIVE SONAR ${lang} ${width}: PASS 17 topics/images, CHIRP+ 2 beam geometry, 23ft conversion, invalid inputs, unknown-water mid-depth spots, all 13 quiz answers/restarts/sources, no overflow.`);
 }catch(error){console.error('SONAR QA failure',JSON.stringify({width,lang,phase,error:String(error.message).split('\n')[0]}));throw new Error(`Sonar QA ${lang}/${width}: `+String(error.message).split('\n')[0]);}
 finally{await context.request.post(base+'/api/logout',{data:{},headers:{origin:base},timeout:10000}).catch(()=>{});await context.close();await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,20000))]);}
}
