// Presentation-only regression. No real model requests or business-data writes.
import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import {serve} from './qa-server.mjs';
import {weatherFixture} from './qa-weather.mjs';
import {waitForOfflineReady} from './qa-offline-ready.mjs';
const offlineOnly=process.argv.includes('--offline-only');
const live=process.argv.includes('--live'),out='pro2-ui-status/'+(live?'live':'fixture');
await mkdir(out,{recursive:true});
let server,publicServer,page;
if(!live){
 server=await serve({seed:true,weatherFetch:async()=>{
  const d=weatherFixture(),start=Math.floor(Date.now()/3600000)*3600-12*3600;
  d.hourly.time_epoch=Array.from({length:180},(_,i)=>start+i*3600);
  const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'});
  d.hourly.time=d.hourly.time_epoch.map(t=>fmt.format(new Date(t*1000)).replace(' ','T'));
  for(const[k,v]of Object.entries(d.hourly))if(!['time','time_epoch'].includes(k))d.hourly[k]=d.hourly.time.map((_,i)=>k==='pressure_msl'?1026-i*.5:k==='wind_speed_10m'?12+i%9:v[0]);
  d.current={...d.current,time:d.hourly.time[12],time_epoch:d.hourly.time_epoch[12]};
  return Response.json(d);
 }});
 server.DB.sqlite.prepare('UPDATE trips SET google_photos_url=? WHERE id=?').run('https://photos.app.goo.gl/THtvVFEPAogMtsuG7','next-trip');
}
const base=live?JSON.parse(await readFile('pro2-ui-status/deploy.json','utf8')).previewUrl:server.url;
const browser=await chromium.launch(process.env.THEME_QA_CHROMIUM ? {executablePath:process.env.THEME_QA_CHROMIUM,args:['--no-sandbox']} : {}),report={result:'FAIL',live,build:process.env.GITHUB_SHA,preview:base,tests:[],businessWrites:0,modelCalls:0,backgroundInferenceSuppressed:0,contrastIncomplete:[]};
const routes=['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html','/pages/mapa.html','/pages/ustawienia.html','/pages/teren.html','/pages/dojazd.html','/pages/regulamin.html','/pages/porady.html','/pages/rigi.html','/pages/wezly.html','/pages/encyklopedia.html','/pages/sonar.html'];
const names={'/':'start','/pages/pogoda.html':'weather','/pages/checklisty.html':'checklist','/pages/polowy.html':'catches'};
const ratio=(a,b)=>{const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
async function context(lang,width,{login=true,sw=false}={}){
 const c=await browser.newContext({viewport:{width,height:width===390?844:1024},locale:lang==='pl'?'pl-PL':'en-GB',serviceWorkers:sw?'allow':'block'});
 if(live&&login){const r=await c.request.post(base+'/api/login',{form:{username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});assert.equal(r.status(),303);}
 await c.addInitScript(l=>{if(!localStorage.getItem('dreamteam.language'))localStorage.setItem('dreamteam.language',l);localStorage.setItem('dream_team_viewed_trip','next-trip');},lang);
 await c.route('**/api/**',async r=>{
  if(r.request().method()==='GET')return r.continue();
  if(new URL(r.request().url()).pathname==='/api/content-translations/process'){report.backgroundInferenceSuppressed++;return r.fulfill({json:{ok:true,providerEnabled:false,nextCursor:null,translated:0}});}
  report.businessWrites++;return r.abort();
 });
 return c;
}
async function close(c,login=true){if(live&&login)assert.ok((await c.request.post(base+'/api/logout',{headers:{origin:base}})).ok());await c.close();}
async function ready(p,path){if(path==='/login.html')await p.locator('#dream-theme-toggle').waitFor();else{await p.locator('html[data-ready=true]').waitFor({timeout:45000});if(path.includes('pogoda'))await p.locator('#pro2[data-loaded=true]').waitFor({timeout:45000});}await p.locator('#dream-theme-toggle').waitFor();}
async function layout(p){
 const result=await p.evaluate(()=>{const b=document.querySelector('#dream-theme-toggle').getBoundingClientRect();const peers=[...document.querySelectorAll('.pro2-language button,.dream-trip-select,.header-top h1,.trip-box')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>{const r=e.getBoundingClientRect();return{tag:e.className||e.textContent,overlap:r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top}});return{width:innerWidth,scroll:document.documentElement.scrollWidth,button:{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right},peers};});
 assert.equal(result.scroll,result.width,'horizontal overflow '+JSON.stringify(result));assert.ok(result.button.width>=44&&result.button.height>=44);assert.ok(result.button.x>=0&&result.button.right<=result.width);assert.ok(result.peers.every(x=>!x.overlap),'header overlap '+JSON.stringify(result));return result;
}
async function contrast(p,screen){
 const r=await new AxeBuilder({page:p}).withRules(['color-contrast']).analyze();
 report.contrastIncomplete.push(...r.incomplete.map(v=>({screen,rule:v.id,nodes:v.nodes.map(n=>({target:n.target,reason:n.any.map(a=>a.message)}))})));
 assert.equal(r.violations.length,0,JSON.stringify(r.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))));return r.passes.length;
}
async function listShot(p,path){
 const group=p.locator('#checklist-groups .checklist-group').first();
 if(!await group.evaluate(e=>e.open))await group.locator('summary').click();
 await group.evaluate(e=>scrollTo({top:scrollY+e.getBoundingClientRect().top-document.querySelector('.site-header').getBoundingClientRect().height-16,behavior:'instant'}));
 await p.evaluate(()=>document.activeElement?.blur());await p.screenshot({path});
}
async function shot(p,path){await p.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:'instant'})});await p.screenshot({path});}
async function darkUnchanged(p){
 const sample=()=>[...document.querySelectorAll('body,.hero-card,.panel-card,.stat-card,.catch-item,.bottom-nav a,input,select,#pro2 .wx-card,#pro2 .wx-chart-line')].map(e=>{const s=getComputedStyle(e);return [s.color,s.background,s.borderColor,s.boxShadow,s.fontSize,s.stroke,s.strokeWidth];});
 const before=await p.evaluate(sample);await p.evaluate(()=>{document.querySelector('link[href="/theme.css"]').sheet.disabled=true});const original=await p.evaluate(sample);await p.evaluate(()=>{document.querySelector('link[href="/theme.css"]').sheet.disabled=false});assert.deepEqual(before,original,'Dark presentation differs from established styles');
}
try{
 if(!offlineOnly){
 for(const lang of ['pl','en'])for(const width of [390,1440]){
  const c=await context(lang,width),p=await c.newPage();page=p;const errors=[];p.on('pageerror',e=>errors.push(e.message));
  for(const route of routes){
   await p.goto(base+route,{waitUntil:'domcontentloaded'});await ready(p,route);assert.equal(await p.locator('html').getAttribute('lang'),lang);
   const sw=p.locator('#dream-theme-toggle');assert.equal(await sw.getAttribute('aria-label'),lang==='en'?'Light theme':'Jasny motyw');
   // Capture both themes on precisely the same loaded page, without reload/data fetch.
   await p.evaluate(()=>DreamTheme.set('dark'));await p.waitForTimeout(250);
   await darkUnchanged(p);
   if(names[route]&&(width===390||route==='/'))await shot(p,`${out}/${names[route]}-${lang}-${width}-dark.png`);
   if(route.includes('checklisty')&&width===390)await listShot(p,`${out}/checklist-items-${lang}-${width}-dark.png`);
   const before=await p.evaluate(()=>({time:performance.timeOrigin,content:document.querySelector('main').textContent,model:JSON.stringify(window.DreamWeatherPro2?.model)}));
   await sw.focus();await p.keyboard.press('Space');
   assert.equal(await p.locator('html').getAttribute('data-theme'),'light');assert.equal(await sw.getAttribute('aria-checked'),'true');
   const after=await p.evaluate(()=>({time:performance.timeOrigin,content:document.querySelector('main').textContent,model:JSON.stringify(window.DreamWeatherPro2?.model)}));
   assert.deepEqual(after,before,'theme toggle reloaded or changed content/model');
   await layout(p);await contrast(p,`${route}:${lang}:${width}`);
   if(route.includes('pogoda')){
    await p.locator('details.wx-card>summary').click();await contrast(p,`weather-analytics:${lang}:${width}`);
    const colors=await p.locator('.wx-chart-frame').first().evaluate(e=>({line:getComputedStyle(e.querySelector('.wx-chart-line')).stroke,grid:getComputedStyle(e.querySelector('.wx-chart-grid')).stroke,bg:getComputedStyle(e).backgroundColor}));
    assert.ok(ratio(colors.line,colors.bg)>=4.5);assert.ok(ratio(colors.grid,colors.bg)>=3);await p.screenshot({path:`${out}/weather-analytics-${lang}-${width}-light.png`,fullPage:true});
    await p.locator('details.wx-card>summary').click();
   }
   if(names[route]&&(width===390||route==='/'))await shot(p,`${out}/${names[route]}-${lang}-${width}-light.png`);
   if(route.includes('checklisty')){
    if(width===390)await listShot(p,`${out}/checklist-items-${lang}-${width}-light.png`);
    await contrast(p,`categories:${lang}:${width}`);
    const field=p.locator('#template-create fieldset');await field.screenshot({path:`${out}/categories-${lang}-${width}-light.png`});
   }
   if(route.includes('polowy')){const a=p.locator('#trip-photos a');assert.equal(await a.getAttribute('href'),'https://photos.app.goo.gl/THtvVFEPAogMtsuG7');await p.locator('#trip-photos').screenshot({path:`${out}/photos-${lang}-${width}-light.png`});}
   if(route==='/'){
    await p.reload({waitUntil:'domcontentloaded'});await ready(p,route);assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
    const second=await c.newPage();await second.goto(base+route);await ready(second,route);assert.equal(await second.locator('html').getAttribute('data-theme'),'light');
    await sw.click();await second.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await second.close();
    await sw.focus();await p.keyboard.press('Enter');assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
   }
   report.tests.push({screen:route,lang,width,themes:['dark','light'],contrastAA:'PASS',responsive:'PASS',result:'PASS'});
   console.log('THEME_SCREEN '+JSON.stringify(report.tests.at(-1)));
  }
  assert.deepEqual(errors,[]);await close(c);
 }
 if(!live)publicServer=await serve({testSession:false});
 const loginBase=live?base:publicServer.url;
 for(const lang of ['pl','en'])for(const width of [390,1440]){
  const c=await context(lang,width,{login:false}),p=await c.newPage();page=p;
  // Local fixture injects a session, so use the public page directly only there.
  await p.goto(loginBase+'/login.html');await ready(p,'/login.html');
  assert.equal(await p.locator('html').getAttribute('data-theme'),'dark','dark must be default');
  await darkUnchanged(p);await shot(p,`${out}/login-${lang}-${width}-dark.png`);
  await p.locator('#dream-theme-toggle').click();await layout(p);await contrast(p,`login:${lang}:${width}`);await shot(p,`${out}/login-${lang}-${width}-light.png`);
  const other=lang==='pl'?'en':'pl';
  await p.locator('.language-selector select').selectOption(other);await p.waitForFunction(l=>document.documentElement.lang===l,other);await p.locator('#dream-theme-toggle').waitFor();assert.equal(await p.locator('#dream-theme-toggle').getAttribute('aria-label'),other==='en'?'Light theme':'Jasny motyw');assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
  // Serialize local origin storage, then reopen in a new browser context.
  const state=await c.storageState();await c.close();
  const reopened=await browser.newContext({storageState:state,serviceWorkers:'block'}),q=await reopened.newPage();await q.goto(loginBase+'/login.html');await q.locator('#dream-theme-toggle').waitFor();assert.equal(await q.locator('html').getAttribute('data-theme'),'light');await reopened.close();
  report.tests.push({screen:'login and close/reopen',lang,width,result:'PASS'});
 }
 }
 if(!live){
  const c=await context('en',390,{sw:true}),p=await c.newPage();page=p;await p.goto(base+'/');await ready(p,'/');
  await p.locator('#dream-theme-toggle').click();
  // Cache read-only checklist data while online, just as a user opening this screen.
  await p.goto(base+'/pages/checklisty.html');await ready(p,'/pages/checklisty.html');
  await p.goto(base+'/');await ready(p,'/');
  const shell=await waitForOfflineReady(p);
  await c.setOffline(true);await p.reload({waitUntil:'domcontentloaded'});await ready(p,'/');assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
  await p.locator('#dream-theme-toggle').click();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
  await p.goto(base+'/pages/checklisty.html');await ready(p,'/pages/checklisty.html');assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
  await p.locator('#dream-theme-toggle').click();await p.reload();await ready(p,'/pages/checklisty.html');assert.equal(await p.locator('html').getAttribute('data-theme'),'light');await layout(p);
  report.tests.push({screen:'PWA complete shell, offline reload/navigation/toggle',shell,result:'PASS'});await c.close();
 }
 assert.equal(report.businessWrites,0);report.result='PASS';
}catch(e){report.error=e.message;report.stack=e.stack;process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{await writeFile(out+(offlineOnly?'/offline-results.json':'/results.json'),JSON.stringify(report,null,2));console.log('THEMES '+JSON.stringify({result:report.result,screens:report.tests.length,error:report.error,businessWrites:report.businessWrites,modelCalls:report.modelCalls}));await browser.close();await server?.close();await publicServer?.close();}
