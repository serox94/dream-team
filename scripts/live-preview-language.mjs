// Real deployed preview only; no fixtures or production writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const routes=['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html','/pages/mapa.html','/pages/regulamin.html','/pages/dojazd.html','/pages/teren.html','/pages/porady.html','/pages/encyklopedia.html','/pages/sonar.html','/pages/rigi.html','/pages/wezly.html','/pages/ustawienia.html'];
const dictionaries=Object.assign({},...await Promise.all(['en','runtime.en','legacy.en','porady.en','guides.en','knots.en'].map(name=>import('node:fs/promises').then(fs=>fs.readFile(`public/locales/${name}.json`,'utf8')).then(JSON.parse))));const originals=Object.keys(dictionaries).filter(k=>k!==dictionaries[k]);
const browser=await chromium.launch();await mkdir('live-preview-qa',{recursive:true});const report=[];
const safeShot=async(page,path)=>{try{await page.screenshot({path,fullPage:false,timeout:10000});}catch(error){console.warn('QA screenshot skipped:',path,error.message);}};
const open=async(page,path,ready)=>{
 let lastError;
 for(let attempt=0;attempt<3;attempt++){
  try{
   await page.goto(base+path,{waitUntil:'commit',timeout:30000});
   if(ready)await page.locator(ready).waitFor({state:'attached',timeout:30000});
   return;
  }catch(error){lastError=error;if(attempt<2)await page.waitForTimeout(750*(attempt+1));}
 }
 throw lastError;
};
const login=async page=>{
 await open(page,'/login','html[data-i18n-ready]');
 assert.ok(await page.locator('.login-card .language-selector').isVisible(),'login language visible');
 await page.locator('.language-selector select').selectOption('en');
 await page.locator('html[data-i18n-ready="en"]').waitFor({timeout:30000});
 await page.reload({waitUntil:'commit',timeout:30000});
 await page.locator('html[data-i18n-ready="en"]').waitFor({timeout:30000});
 await page.locator('input[name="username"]').fill(process.env.RYBY_LOGIN_USERNAME);
 await page.locator('input[name="password"]').fill(process.env.RYBY_LOGIN_PASSWORD);
 await page.locator('button[type="submit"]').click({noWaitAfter:true});
 await page.waitForURL(url=>new URL(url).pathname==='/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.locator('html[data-ready="true"][data-i18n-ready="en"]').waitFor({timeout:30000});
};
try{
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'pl-PL',hasTouch:true});
 const page=await context.newPage();
 await login(page);
 for(const route of routes){
  await open(page,route,'html[data-ready="true"][data-i18n-ready="en"]');
  if(route.includes('sonar')||route.includes('encyklopedia'))await page.locator('#knowledge-search').waitFor();
  if(route.includes('ustawienia'))await page.locator('#system-health').waitFor();
  if(route.includes('wyjazdy')){await page.locator('#create-trip').click();await page.locator('#trip-wizard-form').waitFor();}
  for(const detail of await page.locator('details').all()){if(!await detail.evaluate(e=>e.open))await detail.locator(':scope > summary').click();}
  if(route.includes('ustawienia'))assert.ok(await page.locator('#settings-form').locator('..').locator('.language-selector').isVisible(),'settings language visible');
  for(const width of [360,390,412,768,1280]){
   await page.setViewportSize({width,height:844});
   if(width===390&&route==='/'){await page.locator('#bottom-more').click();assert.ok(await page.locator('#main-nav .language-selector').isVisible(),'More language visible');await page.locator('#bottom-more').click();}
   const leftovers=await page.evaluate(originals=>{const known=new Set(originals);const skip='script,style,textarea,[data-user-content],.catch-note,.check-item-title,.spot-card h4,.trip-card h3,#dream-trip-select option,#dashboard-trip-name,#dashboard-lake,#dashboard-peg,#dashboard-crew,.subtitle';const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;while(n=w.nextNode()){const p=n.parentElement,s=n.textContent.trim();if(!s||p.closest(skip)||!p.getClientRects().length||getComputedStyle(p).visibility==='hidden')continue;if(/[ąćęłńóśźż]/i.test(s)||(known.has(s)&&!['Data'].includes(s)))out.push(s);}for(const el of document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')){if(el.closest(skip)||!el.getClientRects().length)continue;for(const attr of ['placeholder','aria-label','title','alt']){const v=el.getAttribute(attr);if(attr==='aria-label'&&/^(Packed:|Move .+ (up|down)|Open full image:|Select template )/.test(v||''))continue;if(v&&v!=='Language / Język'&&(/[ąćęłńóśźż]/i.test(v)||(known.has(v)&&v!=='Data')))out.push(attr+': '+v);}}return [...new Set(out)];},originals);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,String(width)+' EN '+route+' overflows');
   report.push({width,route,leftovers});
   console.log(JSON.stringify({width,route,leftovers}));
   await safeShot(page,'live-preview-qa/en-'+width+'-'+(route.split('/').pop()||'dashboard')+'.png');
  }
 }
 await context.close();
}finally{await writeFile('live-preview-qa/language.json',JSON.stringify(report,null,2));await browser.close();}
assert.equal(report.filter(r=>r.leftovers.length).length,0,'Real preview still contains Polish UI; see language.json');
console.log('LIVE LANGUAGE: PASS (360/390/412/768/1280, login, More, Settings, EN persisted after reload).');
