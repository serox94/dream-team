// Real Chromium interactions against disposable local SQLite only. Never deploys.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {serve} from './qa-server.mjs';import {weatherFixture} from './qa-weather.mjs';
const {chromium}=await import(process.env.DREAMTEAM_PLAYWRIGHT_MODULE||'playwright');
const sevenDayWeather=()=>{const w=weatherFixture(),days=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,8,28+i)).toISOString().slice(0,10));for(const [key,values] of Object.entries(w.daily))w.daily[key]=key==='time'?days:days.map((day,i)=>typeof values[i%values.length]==='string'?day+'T'+values[i%values.length].split('T')[1]:values[i%values.length]);return w};
const server=await serve({seed:true,weatherFetch:async()=>Response.json(sevenDayWeather())});
const output=process.env.DREAMTEAM_QA_OUTPUT||'qa-modernization';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.DREAMTEAM_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
const report={environment:'LOCAL_DISPOSABLE_SQLITE',previewReady:false,results:[],screenshots:[]};
const api=async(path,method='GET',body)=>{const r=await fetch(server.url+'/api/'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});assert.ok(r.ok,await r.clone().text());return r.json()};
try{
 const paddy=await api('anglers','POST',{name:'Paddy',username:'Paddy',baselinePbKg:0});
 server.DB.sqlite.prepare('INSERT OR IGNORE INTO trip_participants(trip_id,angler_id) VALUES(?,?)').run('next-trip',paddy.id);
 server.DB.sqlite.exec("INSERT INTO checklist_items(trip_id,category,label,assigned_to,packed) VALUES('next-trip','sprzęt','Paddy mata','Paddy',0),('next-trip','sprzęt','Maciek haczyki','Maciek',0),('next-trip','sprzęt','Wspólny stół',NULL,0)");
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900},locale:'pl-PL',isMobile:width<600,hasTouch:width<600});
  await context.addInitScript(()=>{localStorage.setItem('dream_team_viewed_trip','next-trip');localStorage.setItem('dreamteam.language','pl')});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const open=async path=>{await page.goto(server.url+path);await page.waitForFunction(()=>document.documentElement.dataset.ready==='true');};
  const shot=async(name,selector)=>{if(selector)await page.locator(selector).scrollIntoViewIfNeeded();else await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(100);const file=`${width}-${name}.png`;await page.screenshot({path:output+'/'+file,fullPage:false});report.screenshots.push(file);};
  await open('/');const link=await page.locator('.essentials-open').getAttribute('href');assert.ok(link.includes('tripId=next-trip'));
  await shot('home');await page.evaluate(()=>localStorage.setItem('dream_team_viewed_trip','another-trip'));await page.locator('.essentials-open').click();await page.waitForFunction(()=>document.documentElement.dataset.ready==='true'&&document.body.dataset.page==='teren');assert.equal(await page.evaluate(()=>DREAM_TRIP.id),'next-trip');assert.equal(await page.evaluate(()=>Dream.readTrip()),'next-trip');report.results.push({width,test:'selected-trip essentials link',result:'PASS'});
  await open('/pages/checklisty.html');const owner=page.locator('#check-owner');assert.ok((await owner.locator('option').allTextContents()).includes('Paddy'));
  await owner.selectOption('Paddy');const ownNames=await page.locator('.check-item-title').allTextContents();assert.ok(ownNames.includes('Paddy mata')&&ownNames.every(name=>name.startsWith('Paddy')));await page.locator('.check-item-left input').first().check();await page.waitForFunction(()=>document.querySelector('.check-item-left input')?.checked);
  await owner.selectOption('shared');assert.ok(!(await page.locator('.check-item-title').allTextContents()).includes('Paddy mata'));
  await owner.selectOption('all');await page.locator('#check-name').fill('Paddy ciężarek '+width);await page.locator('#check-assigned').selectOption('Paddy');await page.locator('#checklist-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#checklist-message').textContent.includes('dodana'));
  await page.locator('#check-search').fill('ciezarek '+width);await page.waitForFunction(()=>document.querySelectorAll('.check-item-row').length===1);assert.equal(await page.locator('.checklist-group').getAttribute('open'),'');await shot('checklist-overview');await shot('checklist-search','#check-toolbar');report.results.push({width,test:'dynamic owners, strict shared/person filters, add/pack/search',result:'PASS'});
  await open('/pages/polowy.html');assert.equal(await page.locator('#spot,#note').count(),0);assert.equal(await page.locator('#catch-form input:not([type=hidden]),#catch-form select').count(),6);await shot('catch-form');
  await open('/pages/mapa.html');assert.equal(await page.locator('#spot-form input:not([type=hidden]),#spot-form textarea').count(),5);await page.locator('#spot-name').fill('Spot testowy '+width);await page.locator('#spot-depth').fill('3.5');await page.locator('#spot-note').fill('Obserwacja lokalna');await page.locator('#spot-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#spot-message').textContent.includes('dodany'));
  assert.equal(await page.getByText('Szkic dna / notatka własna',{exact:true}).count(),0);await shot('map-spots');report.results.push({width,test:'simplified forms and spot save',result:'PASS'});
  for(const route of ['sonar','encyklopedia']){
   await open('/pages/'+route+'.html');await page.waitForSelector('#knowledge-search');await page.locator('#knowledge-search').fill(route==='sonar'?'sensitivity':'temperature');await page.waitForSelector('.knowledge-search-hit');await page.locator('.knowledge-search-hit').first().click();await page.waitForSelector('.knowledge-entry > details[open]');
   if(route==='sonar'){assert.equal(await page.locator('#screenshot,#deeper-media').count(),0);assert.equal(await page.locator('#trainer').count(),1);await page.locator('#knowledge-search').fill('');await page.locator('#quiz-stage button[data-quiz]').first().click();assert.equal(await page.locator('#quiz-feedback .tool-result').count(),1);}
   await shot(route+'-search');report.results.push({width,test:route+' content search and retained tools',result:'PASS'});
  }
  await open('/pages/pogoda.html');await page.waitForSelector('#pro2-48');await page.locator('#pro2-48').click();assert.equal(await page.locator('#pro2-48').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('.wx-day').count(),7);assert.equal(await page.locator('.wx-alert').count(),1);await shot('weather-pro');await shot('weather-hourly','.wx-hour-strip');await shot('weather-seven-days','.wx-days');report.results.push({width,test:'weather 48h, seven days and safety retained',result:'PASS'});
  for(const route of ['wyjazdy','dojazd','porady']){await open('/pages/'+route+'.html');assert.equal(await page.locator('.shared-lake-evidence').count(),0);await shot(route);}
  assert.deepEqual(errors,[]);await context.close();
 }
 const english=await browser.newContext({viewport:{width:390,height:900},locale:'en-GB'});
 await english.addInitScript(()=>{localStorage.setItem('dreamteam.language','en');localStorage.setItem('dream_team_viewed_trip','next-trip')});
 const enPage=await english.newPage();
 for(const route of ['encyklopedia','sonar']){await enPage.goto(server.url+'/pages/'+route+'.html');await enPage.waitForSelector('#knowledge-search');assert.equal(await enPage.locator('html').getAttribute('lang'),'en');await enPage.locator('#knowledge-search').fill(route==='sonar'?'twardosc':'temperatura');await enPage.waitForSelector('.knowledge-entry > details[open]');const file='390-en-'+route+'.png';await enPage.screenshot({path:output+'/'+file,fullPage:false});report.screenshots.push(file);report.results.push({language:'en',test:route+' Polish query with English articles',result:'PASS'});}
 await english.close();
 report.result='PASS';
}catch(e){report.result='FAIL';report.error=e.message;throw e}
finally{await writeFile(output+'/results.json',JSON.stringify(report,null,2));await browser.close();await server.close()}
console.log(JSON.stringify(report,null,2));
