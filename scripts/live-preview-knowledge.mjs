import {authenticateReadOnly} from './preview-readonly-auth.mjs';
// Real isolated preview, read-only business data. No provider calls or AI.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://dream-team-preview.sewerynski00.workers.dev';
await mkdir('live-preview-qa',{recursive:true});
for(const width of [390,1280])for(const lang of ['pl','en']){
  const browser=await chromium.launch();
  const context=await browser.newContext({serviceWorkers:'block',viewport:{width,height:844},locale:lang==='pl'?'pl-PL':'en-GB'});
  const page=await context.newPage();page.setDefaultTimeout(25000);
  const open=async(path,ready)=>{for(let attempt=0;attempt<2;attempt++){try{await page.goto(base+path,{waitUntil:'commit',timeout:30000});await page.locator(ready).waitFor({timeout:30000});return;}catch(error){console.warn('KNOWLEDGE NAVIGATION',path,lang,width,attempt+1,String(error.message).split('\n')[0]);if(attempt||error.name!=='TimeoutError')throw error;}}};
  try{
   await authenticateReadOnly(context,base,lang);
   await open('/pages/encyklopedia.html','html[data-ready="true"][data-i18n-ready="'+lang+'"]');await page.locator('#tactic-form').waitFor();
   assert.equal(await page.locator('.knowledge-entry').count(),14);
   assert.equal(await page.locator('#t-temp').inputValue(),'unknown');
   await page.locator('#tactic-form button[type="submit"]').click();
   assert.match(await page.locator('#tactic-result').innerText(),lang==='pl'?/Wysoka: temperatura wody niezmierzona/:/High: water temperature not measured/);
   await page.locator('#tactic-result').scrollIntoViewIfNeeded();await page.screenshot({path:'live-preview-qa/encyclopedia-unmeasured-'+lang+'-'+width+'.png',timeout:10000});
   await page.locator('#t-safe').selectOption('unsafe');await page.locator('#tactic-form button[type="submit"]').click();
   assert.match(await page.locator('#tactic-result').innerText(),lang==='pl'?/Przerwij łowienie/:/Stop fishing/);assert.equal(await page.locator('#tactic-result dl').count(),0);await page.locator('#tactic-result').scrollIntoViewIfNeeded();await page.screenshot({path:'live-preview-qa/encyclopedia-safety-stop-'+lang+'-'+width+'.png',timeout:10000});
   await page.locator('#t-safe').selectOption('safe');await page.locator('#t-temp').selectOption('warm');await page.locator('#tactic-form button[type="submit"]').click();assert.ok(await page.locator('#tactic-result dl').count());if(lang==='en')assert.doesNotMatch(await page.locator('#tactic-result').innerText(),/[ąćęłńóśźż]/i,'English tactic result and links');
   await page.locator('#diagnostic-step [data-answer="no"]').click();for(let i=1;i<8;i++)await page.locator('#diagnostic-step [data-answer="yes"]').click();assert.equal(await page.locator('#diagnostic-step li').count(),1);await page.locator('#diagnostic-restart').click();assert.equal(await page.locator('#diagnostic-step [data-answer]').count(),3);
   if(!await page.locator('#knowledge-library').evaluate(el=>el.open))await page.locator('#knowledge-library > summary').click();
   for(const id of ['temperatura','lokalizacja','pogoda','necenie','dno','przynety','profile','bezpieczenstwo','sezony']){
    const entry=page.locator('#'+id);await entry.locator(':scope > details > summary').click();assert.ok(await entry.locator('.section-evidence').count()>0);
   }
   assert.match(await page.locator('#temperatura').innerText(),lang==='pl'?/Co potwierdzono w badaniach/:/What research supports/);
   assert.ok(await page.locator('#bezpieczenstwo a[href*="gov.pl/web/wody-polskie/lowiska-rzgw"]').count());
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   assert.deepEqual(await page.locator('#app-notice.status-danger').allTextContents(),[]);
   await page.screenshot({path:'live-preview-qa/encyclopedia-'+lang+'-'+width+'.png',timeout:10000});
   console.log('LIVE ENCYCLOPEDIA '+lang+' '+width+': PASS preserved 14 topics, evidence/source links, unmeasured water, safety stop, 8-step diagnostic, no overflow.');
  }catch(error){console.error('KNOWLEDGE QA failure',lang,width,String(error.message).split('\n')[0]);throw new Error('Knowledge QA '+lang+'/'+width+': '+String(error.message).split('\n')[0]);}finally{await context.request.post(base+'/api/logout',{data:{},headers:{origin:base},timeout:10000}).catch(()=>{});await context.close();await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,20000))]);}
}
