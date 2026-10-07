// Real deployed preview only; no fixtures or production writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const routes=['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html','/pages/mapa.html','/pages/regulamin.html','/pages/dojazd.html','/pages/teren.html','/pages/porady.html','/pages/encyklopedia.html','/pages/sonar.html','/pages/rigi.html','/pages/wezly.html','/pages/ustawienia.html'];
const dictionaries=Object.assign({},...await Promise.all(['en','runtime.en','legacy.en','porady.en','guides.en','knots.en'].map(name=>import('node:fs/promises').then(fs=>fs.readFile(`public/locales/${name}.json`,'utf8')).then(JSON.parse))));const originals=Object.keys(dictionaries).filter(k=>k!==dictionaries[k]);
const browser=await chromium.launch();await mkdir('live-preview-qa',{recursive:true});const report=[];
try{
 for(const width of [390,1280]){
 const context=await browser.newContext({viewport:{width,height:844},locale:'pl-PL',isMobile:width===390,hasTouch:width===390});const page=await context.newPage();
 await page.goto(base+'/login');await page.locator('html[data-i18n-ready="pl"]').waitFor();
 assert.ok(await page.locator('.login-card .language-selector').isVisible(),'login language visible');
 await page.locator('.language-selector select').selectOption('en');await page.locator('html[data-i18n-ready="en"]').waitFor();await page.reload();await page.locator('html[data-i18n-ready="en"]').waitFor();
 await page.locator('input[name="username"]').fill(process.env.RYBY_LOGIN_USERNAME);await page.locator('input[name="password"]').fill(process.env.RYBY_LOGIN_PASSWORD);
 await Promise.all([page.waitForURL(base+'/'),page.locator('button[type="submit"]').click()]);
 for(const route of routes){
 await page.goto(base+route);await page.locator('html[data-ready="true"][data-i18n-ready="en"]').waitFor();
 if(route.includes('sonar')||route.includes('encyklopedia'))await page.locator('#knowledge-search').waitFor();
 if(route.includes('ustawienia'))await page.locator('#system-health').waitFor();
 if(width===390&&route==='/'){await page.locator('#bottom-more').click();assert.ok(await page.locator('#main-nav .language-selector').isVisible(),'More language visible');await page.locator('#bottom-more').click();}
 if(route.includes('wyjazdy')){await page.locator('#create-trip').click();await page.locator('#trip-wizard-form').waitFor();}
 for(const detail of await page.locator('details').all()){if(!await detail.evaluate(e=>e.open))await detail.locator('summary').click();}
 if(route.includes('ustawienia'))assert.ok(await page.locator('#settings-form').locator('..').locator('.language-selector').isVisible(),'settings language visible');
 // Capture visible UI; data supplied by people is deliberately excluded.
 const leftovers=await page.evaluate(originals=>{const known=new Set(originals);const skip='script,style,textarea,[data-user-content],.catch-note,.check-item-title,.spot-card h4,.trip-card h3,#dream-trip-select option,#dashboard-trip-name,#dashboard-lake,#dashboard-peg,#dashboard-crew,.subtitle';const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),out=[];let n;while(n=w.nextNode()){const p=n.parentElement,s=n.textContent.trim();if(!s||p.closest(skip)||!p.getClientRects().length||getComputedStyle(p).visibility==='hidden')continue;if(/[ąćęłńóśźż]/i.test(s)||known.has(s))out.push(s);}return [...new Set(out)];},originals);
 report.push({width,route,leftovers});console.log(JSON.stringify({width,route,leftovers}));await page.screenshot({path:`live-preview-qa/en-${width}-${route.split('/').pop()||'dashboard'}.png`,fullPage:true});
 }
 await context.close();
 }
}finally{await writeFile('live-preview-qa/language.json',JSON.stringify(report,null,2));await browser.close();}
assert.equal(report.filter(r=>r.leftovers.length).length,0,'Real preview still contains Polish UI; see language.json');
console.log('LIVE LANGUAGE: PASS (390/1280, login, More, Settings, EN persisted after reload).');
