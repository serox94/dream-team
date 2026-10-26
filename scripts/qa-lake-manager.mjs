// Complete user flows and responsive shell matrix on disposable SQLite only.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './qa-server.mjs';
import {weatherFixture} from './qa-weather.mjs';
import {waitForOfflineReady} from './qa-offline-ready.mjs';
const dir='qa-lake-manager';await mkdir(dir,{recursive:true});
const originalFetch=globalThis.fetch;let credits=0;
const usage={account:{current_plan:'Researcher',plan_limit:1000,plan_usage:2,paygo_usage:0,paygo_limit:0},key:{limit:100,usage:2}};
const fixture=url=>url.includes('facilities')?'Electricity is available at swim 18.\n\nShowers and toilets are provided.\n\nThe address is Lake Road 18, Netherlands.':url.includes('conflict')?'Leadcore is allowed.':url.includes('missing')?null:'Fishing with 3 rods is allowed.\n\nLeadcore is prohibited.\n\nUnhooking mats are provided by the fishery.\n\nBait boats are allowed only within your own swim.\n\nThe lake has a maximum depth of 12 meters.\n\nCarp are present in the lake.';
globalThis.fetch=async(u,o)=>{const url=String(u);if(!url.startsWith('https://api.tavily.com/'))return originalFetch(u,o);if(url.endsWith('/usage'))return Response.json(usage);credits++;if(url.endsWith('/search'))return Response.json({results:[],usage:{credits:1}});return Response.json({results:JSON.parse(o.body).urls.filter(u=>fixture(u)).map(url=>({url,raw_content:fixture(url)})),usage:{credits:1}});};
const preview=await serve({seed:true,researchFixture:true,weatherFetch:async()=>Response.json(weatherFixture())});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const results=[];
const ready=async page=>{await page.locator('html[data-ready=true]').waitFor({timeout:20000});};
const check=(name)=>results.push({name,result:'PASS'});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'pl-PL'});const page=await context.newPage();
 await page.goto(preview.url+'/pages/lowiska.html');await ready(page);
 await page.locator('#new-lake-form [name=name]').fill('Fixture Outdoor Lake');await page.locator('#new-lake-form [name=country]').fill('Netherlands');await page.locator('#new-lake-form [name=sources]').fill('https://fishery.example.org/rules');await page.getByRole('button',{name:'+ Dodaj kolejny link',exact:true}).click();await page.locator('#new-lake-form [name=sources]').nth(1).fill('https://fishery.example.org/facilities');
 await page.locator('#new-lake-form [type=submit]').click();await page.waitForURL(/lakeId=/);const lakeId=new URL(page.url()).searchParams.get('lakeId');assert.ok(lakeId);await page.close();
 // Browser closes; a persisted scheduled batch completes the profile.
 for(let n=0;n<5;n++)await preview.dispatchScheduled();
 assert.equal(preview.DB.sqlite.prepare('SELECT status FROM research_jobs WHERE lake_id=? ORDER BY rowid DESC LIMIT 1').get(lakeId).status,'complete');assert.equal(preview.DB.sqlite.prepare('SELECT COUNT(*) n FROM trips').get().n,5);check('A: multi-source profile completes without a trip or open browser');
 const p=await context.newPage();await p.goto(preview.url+'/pages/lowiska.html?lakeId='+lakeId);await ready(p);assert.match(await p.locator('#lake-detail').innerText(),/18/);assert.equal(await p.locator('#lake-detail details').count()>=5,true);await p.screenshot({path:dir+'/profile-390-pl-dark.png',fullPage:true});
 const before=credits;await p.locator('.profile-sources [type=submit]').click();await p.waitForTimeout(250);await preview.dispatchScheduled();assert.equal(credits,before);check('A: unchanged sources use cache without new provider credits');
 await p.getByRole('link',{name:'Utwórz wyjazd z tego łowiska',exact:true}).click();await ready(p);await p.getByRole('button',{name:'Nowy wyjazd',exact:true}).click();await p.locator('#trip-name').fill('Fixture Expedition');await p.locator('#trip-lake').selectOption(lakeId);
 await p.locator('#trip-edit [name=participants]').uncheck();await p.locator('#trip-edit [name=participants][value=patryk]').check();await p.locator('#trip-edit [name=participants][value=maciek]').check();await p.locator('#trip-edit [type=submit]').click();await p.waitForTimeout(350);
 const trip=preview.DB.sqlite.prepare('SELECT id,lake_profile_version_id FROM trips WHERE name=?').get('Fixture Expedition');assert.ok(trip?.lake_profile_version_id);assert.equal(credits,before);check('B: new trip binds immutable existing profile without repeating research');
 await p.goto(preview.url+'/?trip='+trip.id);await ready(p);await p.evaluate(id=>Dream.rememberTrip(id),trip.id);await p.reload();await ready(p);assert.match(await p.locator('#dream-crew-photo').getAttribute('src'),/patryk-maciek\.avif/);check('B: selected trip participants choose the supplied duo image');
 await p.evaluate(async id=>Dream.api('/api/trips/'+id,{method:'PUT',body:JSON.stringify({participantIds:['patryk','maciek','paddy']})}),trip.id);await p.reload();await ready(p);assert.match(await p.locator('#dream-crew-photo').getAttribute('src'),/patryk-maciek-paddy\.avif/);check('B: adding Paddy switches to supplied trio image');
 const routes=await p.evaluate(()=>DreamShell.entries.map(([path])=>path==='/'?'/':'/pages/'+path+'.html'));
 for(const width of [360,390,430,768,1280,1440])for(const lang of ['pl','en'])for(const theme of ['dark','light']){
  await p.setViewportSize({width,height:900});await p.evaluate(({lang,theme})=>{localStorage.setItem('dreamteam.language',lang);localStorage.setItem('dreamteam.theme',theme);if(window.DreamLanguage)DreamLanguage.persist(lang);},{lang,theme});
  for(const route of routes){const errors=[];const handler=e=>errors.push(e.message);p.on('pageerror',handler);await p.goto(preview.url+route);await ready(p);assert.equal(await p.locator('#main-nav a').count(),16);assert.equal(await p.locator('#main-nav a[aria-current=page]').count(),1,route);assert.ok(await p.locator('#countdown').isVisible(),route);assert.equal(await p.locator('.header-top .language-selector').count(),0);assert.equal(await p.locator('html').getAttribute('data-theme'),theme);assert.equal(await p.locator('html').getAttribute('lang'),lang);
   const dims=await p.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert.ok(dims.scroll<=dims.width+1&&dims.body<=dims.width+1,`${width}/${lang}/${theme} ${route} overflow ${JSON.stringify(dims)}`);assert.deepEqual(errors,[],route);p.off('pageerror',handler);
   if([390,1440].includes(width)&&['/','/pages/lowiska.html','/pages/pogoda.html','/pages/checklisty.html','/pages/ustawienia.html'].includes(route)){const label=route==='/'?'home':route.split('/').pop().replace('.html','');await p.screenshot({path:`${dir}/${label}-${width}-${lang}-${theme}.png`});}
  }check(`C/D: 16 screens ${width}px ${lang} ${theme}, stable navigation, header and countdown; no overflow or JavaScript errors`);
 }
 await p.goto(preview.url+'/pages/ustawienia.html#guide-lakes');await ready(p);assert.ok(await p.locator('#dream-help').isVisible());check('Help: Settings guide and contextual deep links');
 await p.goto(preview.url+'/');await ready(p);await waitForOfflineReady(p);await context.setOffline(true);await p.reload();await ready(p);assert.ok(await p.locator('#dream-trip-select').isVisible());await context.setOffline(false);check('PWA: shared shell and selected trip survive offline reload');
 assert.deepEqual(preview.DB.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);check('D1: original rows retained, immutable trip profile, no FK violations');
 await context.close();
}catch(error){results.push({name:'Browser regression',result:'FAIL',error:error.stack});process.exitCode=1;console.error(error);}
finally{await writeFile(dir+'/report.json',JSON.stringify({results,fixtureCredits:credits,realProviderCalls:0,productionWrites:0},null,2));console.log(JSON.stringify(results,null,2));await browser.close();await preview.close();globalThis.fetch=originalFetch;}
