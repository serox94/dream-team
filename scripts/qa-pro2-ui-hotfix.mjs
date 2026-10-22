// Targeted presentation checks only. Live business writes/inference are blocked in
// the test browser; the preview itself retains its existing functional settings.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {serve} from './qa-server.mjs';
import {weatherFixture} from './qa-weather.mjs';

const live=process.argv.includes('--live'),out='pro2-ui-status/'+(live?'live':'fixture');
await mkdir(out,{recursive:true});
let scenario='falling',server,page;
const album='https://photos.app.goo.gl/THtvVFEPAogMtsuG7';
function fixture(){
 const d=weatherFixture(),start=Math.floor(Date.now()/3600000)*3600-12*3600;
 d.hourly.time_epoch=Array.from({length:180},(_,i)=>start+i*3600);
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',dateStyle:'short',timeStyle:'short'});
 d.hourly.time=d.hourly.time_epoch.map(t=>fmt.format(new Date(t*1000)).replace(' ','T'));
 for(const[k,v]of Object.entries(d.hourly))if(!['time','time_epoch'].includes(k))d.hourly[k]=d.hourly.time.map((_,i)=>k==='pressure_msl'?scenario==='flat'?1015:scenario==='missing'?null:scenario==='gaps'&&i%5===0?null:1026-i*.5:k==='wind_speed_10m'?12+i%9:k==='cloud_cover'?65:v[0]);
 d.current={...d.current,time:d.hourly.time[12],time_epoch:d.hourly.time_epoch[12]};
 return d;
}
if(!live){
 server=await serve({seed:true,weatherFetch:async()=>Response.json(fixture())});
 server.DB.sqlite.prepare('UPDATE trips SET google_photos_url=? WHERE id=?').run(album,'next-trip');
 server.DB.sqlite.prepare('INSERT INTO checklist_categories(id,name) VALUES(?,?)').run('qa-long-category','Akcesoria do przygotowania zestawów i ochrony ryb');
}
const receipt=live?JSON.parse(await readFile('pro2-ui-status/deploy.json','utf8')):null;
const base=live?receipt.previewUrl:server.url,browser=await chromium.launch();
const report={result:'FAIL',live,build:process.env.GITHUB_SHA,preview:base,tests:[],businessWrites:0,modelCalls:0,backgroundTranslationRequestsSuppressed:0};
async function context(lang,width){
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:1024},locale:lang==='pl'?'pl-PL':'en-GB',serviceWorkers:'block'});
 if(live){const r=await ctx.request.post(base+'/api/login',{form:{username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});assert.equal(r.status(),303);}
 await ctx.addInitScript(l=>{localStorage.setItem('dreamteam.language',l);localStorage.setItem('dream_team_viewed_trip','next-trip');},lang);
 await ctx.route('**/api/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;
  if(r.method()==='GET')return route.continue();
  if(path==='/api/content-translations/process'){report.backgroundTranslationRequestsSuppressed++;return route.fulfill({json:{ok:true,providerEnabled:false,nextCursor:null,translated:0}});}
  report.businessWrites++;return route.abort();
 });
 return ctx;
}
async function ready(p,lang){await p.locator('html[data-ready=true]').waitFor({timeout:45000});assert.equal(await p.locator('html').getAttribute('lang'),lang);}
async function overflow(p){assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth),await p.evaluate(()=>innerWidth),'horizontal overflow');}
// Full section evidence at the tested width. A tall section gets a taller
// capture viewport so sticky navigation never paints over the screenshot.
// The 390x844 layout/interaction checks still run at the normal phone height.
async function sectionShot(p,node,path){
 const viewport=p.viewportSize(),height=(await node.boundingBox()).height;
 const chrome=await p.evaluate(()=>{const h=document.querySelector('.site-header'),n=document.querySelector('.bottom-nav');return {top:h&&['sticky','fixed'].includes(getComputedStyle(h).position)?h.getBoundingClientRect().height:0,bottom:n&&getComputedStyle(n).display!=='none'?n.getBoundingClientRect().height:0};});
 await p.setViewportSize({...viewport,height:Math.max(viewport.height,Math.ceil(height+chrome.top+chrome.bottom+48))});
 await node.evaluate((el,top)=>window.scrollTo({top:scrollY+el.getBoundingClientRect().top-top,behavior:'instant'}),chrome.top+24);
 const rect=await node.boundingBox();assert.ok(rect.y>=chrome.top);assert.ok(rect.y+rect.height<=p.viewportSize().height-chrome.bottom);
 await node.screenshot({path});await p.setViewportSize(viewport);
}
const luminance=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
async function charts(p,lang){
 const before=await p.evaluate(()=>JSON.stringify(DreamWeatherPro2.model));
 const details=p.locator('details.wx-card').filter({has:p.getByText(lang==='en'?'Analytics, astronomy and full parameters':'Analityka, astronomia i pełne parametry',{exact:true})});
 await details.locator(':scope > summary').click();
 const result=await details.locator('.wx-figure').evaluateAll(figs=>figs.map(f=>{const svg=f.querySelector('svg'),line=f.querySelector('.wx-chart-line'),axis=f.querySelector('.wx-chart-values'),frame=f.querySelector('.wx-chart-frame');return {key:f.dataset.chart,title:f.querySelector('h3').textContent,font:parseFloat(getComputedStyle(axis).fontSize),line:getComputedStyle(line).stroke,lineWidth:parseFloat(getComputedStyle(line).strokeWidth),grid:getComputedStyle(f.querySelector('.wx-chart-grid')).stroke,background:getComputedStyle(frame).backgroundColor,path:[...svg.querySelectorAll('.wx-chart-line')].map(x=>x.getAttribute('d')),range:f.querySelector('h3 span').textContent,svgWidth:svg.getBoundingClientRect().width};}));
 assert.equal(result.length,2);
 for(const r of result){assert.match(r.title,/min–max:/);assert.ok(r.font>=12);assert.ok(r.lineWidth>=3);assert.ok(r.svgWidth>150);assert.ok(!r.path.join('').match(/NaN|undefined/));assert.ok((luminance(r.line)+.05)/(luminance(r.background)+.05)>7);assert.ok(r.grid!==r.background);}
 const expected=await p.evaluate(()=>{const a=DreamWeatherPro2.model.hours.slice(0,24).map(h=>DreamWeatherPro2.data.hourly.pressure_msl[h.i]).filter(Number.isFinite);return {lo:Math.min(...a),hi:Math.max(...a),provider:DreamWeatherPro2.data.dreamteam.provider};});
 const formatted=n=>n.toLocaleString(lang==='en'?'en-GB':'pl-PL',{minimumFractionDigits:1,maximumFractionDigits:1});
 assert.ok(result[0].range.includes(`${formatted(expected.lo)}–${formatted(expected.hi)} hPa`));
 assert.equal(await p.evaluate(()=>JSON.stringify(DreamWeatherPro2.model)),before,'opening analytics changed the model');
 if(live)assert.equal(expected.provider,'Open-Meteo');
 return {details,result,expected};
}
try{
 for(const lang of ['pl','en'])for(const width of [390,1440]){
  const ctx=await context(lang,width),p=await ctx.newPage(),errors=[];page=p;p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/pages/pogoda.html',{waitUntil:'domcontentloaded'});await ready(p,lang);await p.locator('#pro2[data-loaded=true]').waitFor({timeout:45000});
  const c=await charts(p,lang);await overflow(p);await sectionShot(p,c.details.locator('.wx-row'),`${out}/weather-charts-${lang}-${width}.png`);
  await c.details.locator('summary').scrollIntoViewIfNeeded();await p.screenshot({path:`${out}/weather-analytics-${lang}-${width}.png`});
  await p.locator('#pro2-48').click();const next=p.locator('details.wx-card');await next.locator(':scope > summary').click();assert.equal(await p.locator('[data-hour]').count(),48);assert.ok((await next.locator('.wx-chart-times').first().innerText()).length>15);await overflow(p);
  report.tests.push({screen:'weather',lang,width,result:'PASS',charts:c.result,range:c.expected});

  await p.goto(base+'/pages/polowy.html',{waitUntil:'domcontentloaded'});await ready(p,lang);const photos=p.locator('#trip-photos'),link=photos.locator('a');await link.waitFor();
  assert.equal(await link.getAttribute('href'),album);assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);
  assert.match(await link.innerText(),lang==='en'?/Open Google Photos album/:/Otwórz album Google Photos/);
  const box=await link.boundingBox();assert.ok(box.height>=44&&box.width>180);
  assert.equal(await link.evaluate(e=>getComputedStyle(e).display),'inline-flex');await overflow(p);await sectionShot(p,photos,`${out}/photos-${lang}-${width}.png`);
  report.tests.push({screen:'photos',lang,width,result:'PASS',href:album,button:box});

  await p.goto(base+'/pages/checklisty.html',{waitUntil:'domcontentloaded'});await ready(p,lang);const labels=p.locator('#template-categories label');await labels.first().waitFor();
  const layout=await labels.evaluateAll(items=>items.map(e=>{const b=e.querySelector('input'),s=e.querySelector('span'),r=e.getBoundingClientRect(),br=b.getBoundingClientRect(),sr=s.getBoundingClientRect();return {name:s.textContent.trim(),textWidth:sr.width,labelHeight:r.height,boxWidth:br.width,boxHeight:br.height,textRight:sr.right,right:r.right,top:r.top,left:r.left,scroll:s.scrollWidth,client:s.clientWidth,writingMode:getComputedStyle(s).writingMode,font:parseFloat(getComputedStyle(s).fontSize)};}));
  assert.ok(layout.length>=3);for(const r of layout){assert.ok(r.boxWidth>=22&&r.boxWidth<=28&&r.boxHeight>=22);assert.ok(r.textWidth>=140,JSON.stringify(r));assert.ok(r.labelHeight>=44);assert.ok(r.textRight<=r.right&&r.scroll<=r.client);assert.equal(r.writingMode,'horizontal-tb');if(width===390)assert.ok(r.font>=16);}
  if(width===390)assert.ok(layout.every(r=>Math.abs(r.left-layout[0].left)<1));
  const first=labels.first(),checkbox=first.locator('input');assert.equal(await checkbox.isChecked(),true);await first.locator('span').click();assert.equal(await checkbox.isChecked(),false);await first.locator('span').click();assert.equal(await checkbox.isChecked(),true);await checkbox.focus();await p.keyboard.press('Space');assert.equal(await checkbox.isChecked(),false);await p.keyboard.press('Space');assert.equal(await checkbox.isChecked(),true);
  await overflow(p);await sectionShot(p,p.locator('#template-create fieldset'),`${out}/categories-${lang}-${width}.png`);
  report.tests.push({screen:'categories',lang,width,result:'PASS',layout,labelTapAndKeyboard:'PASS'});
  assert.deepEqual(errors,[]);if(live)assert.ok((await ctx.request.post(base+'/api/logout',{headers:{origin:base}})).ok());await ctx.close();
 }
 if(!live)for(const lang of ['pl','en'])for(const state of ['flat','gaps','missing']){
  scenario=state;const ctx=await context(lang,390),p=await ctx.newPage();page=p;await p.goto(base+'/pages/pogoda.html');await ready(p,lang);await p.locator('#pro2[data-loaded=true]').waitFor();await p.locator('details.wx-card>summary').click();
  if(state==='missing')assert.equal(await p.locator('[data-chart=pressure_msl]').count(),0);
  else{const paths=await p.locator('[data-chart=pressure_msl] .wx-chart-line').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('d')));assert.ok(paths.length>=(state==='gaps'?2:1));assert.ok(!paths.join('').includes('NaN'));if(state==='flat')assert.match(paths[0],/^M8,88 /);}
  await overflow(p);report.tests.push({screen:'weather-edge',lang,state,result:'PASS'});await ctx.close();
 }
 assert.equal(report.businessWrites,0);report.result='PASS';
}catch(error){report.error=error.message;report.stack=error.stack;process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});}
finally{await writeFile(out+'/results.json',JSON.stringify(report,null,2));console.log('PRO2_UI_HOTFIX '+JSON.stringify(report));await browser.close();await server?.close();}
