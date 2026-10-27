// Exact existing remote preview, existing official cache only. No production writes or provider extraction.
import assert from 'node:assert/strict';import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';import {cf,query} from './recovery-common.mjs';
import {rowsDigest} from './d1-snapshot.mjs';import {waitForOfflineReady} from './qa-offline-ready.mjs';
const db='190b6a54-919c-4628-98b0-27ab3902bdbd',base='https://dream-team-research-preview.sewerynski00.workers.dev',id='qa-pr23-cached-'+process.env.GITHUB_RUN_ID;
const report={result:'BLOCKED',build:process.env.GITHUB_SHA,tests:[],productionWrites:0,providerExtractions:0,rowsRead:0},contexts=[];let browser;
await mkdir('pr23-status/live',{recursive:true});
const pass=name=>{report.tests.push({name,result:'PASS'});console.log('PR23_LIVE_PASS '+name);};
const q=async(sql,params=[])=>{assert.notEqual(db,'b64c7a2c-8694-41c6-b54a-857b88bf2c96');const r=await query(db,sql,params);report.rowsRead+=r.meta?.rows_read||0;assert.ok(report.rowsRead<16000,'Remote QA SQL budget');return r.results;};
const tables=['trips','catches','checklist_items','content_translations','trip_documents','auth_accounts','auth_sessions'];
const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async t=>[t,rowsDigest(await q('SELECT * FROM '+t))])));
try{
 const deployed=JSON.parse(await readFile('rc-status/preview.json','utf8'));assert.equal(deployed.result,'PASS');assert.equal(deployed.database.id,db);
 const before=await snapshot(),production=(await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id;
 const seed='73cba183-fbfa-45cc-9d71-cf6a7abf038c';const pages=await q('SELECT url,content,checked_at,scope FROM research_pages WHERE lake_id=? ORDER BY url LIMIT 3',[seed]);assert.equal(pages.length,3);assert.ok(pages.every(p=>Date.now()-Date.parse(p.checked_at)<14*86400000));assert.ok(pages.every(p=>p.content.length>100));
 const urls=pages.map(p=>p.url);assert.ok(!urls.some(u=>/map|kaart|plattegrond/i.test(new URL(u).pathname)),'No extra map-metadata requests');
 await q('INSERT INTO lakes(id,name,country,source_url,facts_json) VALUES(?,?,?,?,?)',[id,'QA PR23 retained official cache','France',urls[0],JSON.stringify({timeZone:'Europe/Paris'})]);
 for(const p of pages)await q('INSERT INTO research_pages(lake_id,url,content,checked_at,scope) VALUES(?,?,?,?,?)',[id,p.url,p.content,p.checked_at,p.scope]);
 await q('INSERT INTO lake_sources(id,lake_id,url,title,source_type) VALUES(?,?,?,?,?)',[crypto.randomUUID(),id,urls[0],'Previously saved QA source','manual']);
 // Explicitly suppress discovery on this QA lake; only three unmodified retained official pages are analysed.
 await q('INSERT INTO app_settings(key,value) VALUES(?,?)',['research.discovery.'+id,new Date().toISOString()]);
 browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:390,height:900},locale:'pl-PL'});contexts.push(ctx);
 await ctx.addInitScript(()=>{localStorage.setItem('dreamteam.language','pl');localStorage.setItem('dreamteam.theme','light');localStorage.setItem('dream_team_viewed_trip','next-trip');});
 const login=await ctx.request.post(base+'/api/login',{form:{username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});assert.equal(login.status(),303);
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const ready=()=>page.locator('html[data-ready=true]').waitFor({timeout:45000});
 await page.goto(base+'/pages/wyjazdy.html?lakeId='+id+'#fisheries-area');await ready();assert.equal(await page.locator('.profile-sources [name=sources]').count(),1);
 for(const url of urls.slice(1)){await page.locator('.profile-sources').getByRole('button',{name:'+ Dodaj kolejny link',exact:true}).click();await page.locator('.profile-sources [name=sources]').last().fill(url);}
 await page.locator('.profile-sources [type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.profile-sources [name=sources]').length===3);await page.reload();await ready();
 assert.equal(await page.locator('.profile-sources [name=sources]').count(),3);let p=await ctx.request.get(base+'/api/lakes/'+id+'/manager');let profile=await p.json();assert.equal(profile.research.job.status,'complete');assert.ok(profile.research.facts.length>=30);assert.equal(profile.research.pages.length,3);assert.equal((await q('SELECT SUM(credits_reserved) n FROM research_jobs WHERE lake_id=?',[id]))[0].n,0);pass('Real remote saved-profile edit: two added URLs persist, three official cache pages analysed, ≥30 cited facts, zero provider credits');
 const originalUrl=(await q('SELECT source_url FROM lakes WHERE id=?',[id]))[0].source_url;
 await page.locator('.profile-sources').getByRole('button',{name:'+ Dodaj kolejny link',exact:true}).click();await page.locator('.profile-sources [name=sources]').last().fill(urls[0]);await page.locator('.profile-sources [type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.profile-sources [name=sources]').length===3);
 await page.locator('#edit-selected-lake').click();await page.locator('#lake-lat').fill('48.42');await page.locator('#lake-lon').fill('0.78');await page.locator('#lake-description').fill('QA PR23 description, isolated preview only');await page.locator('#lake-edit [type=submit]').click();await page.waitForFunction(()=>document.querySelector('.lake-profile-summary')?.textContent.includes('QA PR23 description'));await page.reload();await ready();assert.equal(await page.locator('.profile-sources [name=sources]').count(),3);assert.equal((await q('SELECT source_url FROM lakes WHERE id=?',[id]))[0].source_url,originalUrl);pass('Real remote duplicate/GPS/description edit preserves original URL and all saved sources');
 await page.screenshot({path:'pr23-status/live/edited-profile-390-pl-light.png',fullPage:true});
 await page.goto(base+'/pages/lowiska.html?lakeId='+id);await ready();assert.ok(page.url().includes('/pages/wyjazdy.html?lakeId='+id));pass('Legacy bookmark opens the consolidated remote manager');
 for(const [lang,theme,width]of [['pl','light',390],['en','dark',1440]]){
  await page.setViewportSize({width,height:900});await page.evaluate(({lang,theme})=>{localStorage.setItem('dreamteam.language',lang);localStorage.setItem('dreamteam.theme',theme);},{lang,theme});
  for(const route of ['/','/pages/wyjazdy.html','/pages/regulamin.html?lakeId=plaine2','/pages/pogoda.html','/pages/checklisty.html','/pages/polowy.html','/pages/ustawienia.html']){
   await page.goto(base+route);await ready();assert.equal(await page.locator('html').getAttribute('lang'),lang);assert.equal(await page.locator('html').getAttribute('data-theme'),theme);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await page.locator('#main-nav a[href="/pages/lowiska.html"],#main-nav a[href="/pages/teren.html"]').count(),0);
   if(route.includes('regulamin')){const {JSDOM}=await import('jsdom'),raw=await readFile('public/data/lakes/plaine2/regulamin.html','utf8');const expected=new JSDOM(raw).window.document.body.textContent.replace(/\s+/g,' ').trim();if(lang==='pl'){const actual=await page.locator('main').evaluate(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('[data-research-supplement]').forEach(n=>n.remove());return copy.textContent.replace(/\s+/g,' ').trim();});assert.equal(actual,expected);}assert.ok((await page.locator('main').innerText()).length>3000);}
   if(route.includes('ustawienia'))assert.equal(await page.locator('#lake-edit,.research-url').count(),0);
   await page.screenshot({path:'pr23-status/live/'+(route==='/'?'home':route.split('/').pop().split('.')[0])+'-'+width+'-'+lang+'-'+theme+'.png'});
  }pass('Remote '+lang+'/'+theme+'/'+width+': consolidated menu, full France regulations, Weather PRO, checklist, catches, Settings and no overflow');
 }
 await page.goto(base+'/pages/wyjazdy.html?lakeId='+id);await ready();await waitForOfflineReady(page);await ctx.setOffline(true);await page.reload();await ready();assert.equal(await page.locator('#trip-essentials-card').count(),1);await ctx.setOffline(false);pass('Remote offline/PWA consolidated screen and selected trip retained');assert.deepEqual(errors,[]);
 await ctx.request.post(base+'/api/logout',{headers:{origin:base}});await ctx.close();contexts.splice(contexts.indexOf(ctx),1);
 assert.deepEqual(await snapshot(),before,'All pre-existing business rows, accounts, credentials and original sessions unchanged');assert.equal((await cf('/workers/scripts/dream-team/deployments')).deployments[0].versions[0].version_id,production);pass('Original preview records/translations/accounts/sessions unchanged; production Worker unchanged');report.result='PASS';report.cacheProvenance={sourceLake:seed,pages:3,copiedContentUnchanged:true,checkedAtPreserved:true};report.previewUrl=base;
}catch(e){report.error=String(e.stack).replaceAll(process.env.RYBY_LOGIN_PASSWORD||'\u0000','[REDACTED]');process.exitCode=1;}
finally{for(const ctx of contexts){try{await ctx.request.post(base+'/api/logout',{headers:{origin:base}});}catch{}await ctx.close();}if(browser)await browser.close();await writeFile('pr23-status/live/report.json',JSON.stringify(report,null,2));console.log('PR23_LIVE '+JSON.stringify(report));}
