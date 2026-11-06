// Exercise actual cached modules and native form submission with bootstrap pending/failed.
// Uses disposable local SQLite only; never requests Cloudflare or production.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
import {serve} from './qa-server.mjs';import {weatherFixture} from './qa-weather.mjs';import {waitForOfflineReady} from './qa-offline-ready.mjs';
const server=await serve({seed:true,weatherFetch:async()=>Response.json(weatherFixture())});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PRO2_CHROMIUM_BIN?{executablePath:process.env.PRO2_CHROMIUM_BIN}:{})});
const directory='qa-screenshots/knowledge-offline';await mkdir(directory,{recursive:true});const results=[];
try{
 for(const lang of ['pl','en'])for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900},locale:lang==='pl'?'pl-PL':'en-GB'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url+'/pages/checklisty.html');await page.locator('html[data-ready=true]').waitFor();const shell=await waitForOfflineReady(page);assert.equal(shell.missing,0);
  await context.addInitScript(()=>{
   const original=window.fetch;
   window.fetch=(url,...args)=>String(url).includes('/api/bootstrap')?new Promise(resolve=>{window.failFixtureBootstrap=()=>resolve(new Response(JSON.stringify({ok:false,error:'Fixture bootstrap unavailable'}),{status:400,headers:{'content-type':'application/json'}}))}):original(url,...args);
  });
  await context.setOffline(true);
  for(const module of ['encyklopedia','sonar']){
   await page.goto(server.url+'/pages/'+module+'.html',{waitUntil:'domcontentloaded'});await page.locator('#knowledge-root[data-knowledge-ready=true]').waitFor();
   assert.equal(await page.locator('html').getAttribute('data-ready'),null,'local tools must work before the server bootstrap completes');
   const form=page.locator(module==='encyklopedia'?'#tactic-form':'#spot-form'),result=page.locator(module==='encyklopedia'?'#tactic-result':'#spot-result');
   assert.equal(await form.evaluate(f=>f.checkValidity()),true);assert.equal(await form.locator('[type=submit]').isEnabled(),true);assert.equal(await form.evaluate(f=>getComputedStyle(f).pointerEvents),'auto');
   await form.locator('[type=submit]').click();await result.locator('.tool-result').waitFor({state:'visible'});
   assert.match(await result.innerText(),module==='encyklopedia'?(lang==='pl'?/Dobry punkt startowy/:/A useful starting point/):(lang==='pl'?/Trzy punkty/:/Three spots/));
   await page.screenshot({path:`${directory}/${lang}-${width}-${module}-pending.png`});results.push({lang,width,module,bootstrap:'pending',nativeSubmit:'PASS',shell});
   await page.evaluate(()=>window.failFixtureBootstrap());await page.locator('html[data-ready=error]').waitFor();
   await result.evaluate(node=>node.replaceChildren());await form.locator('[type=submit]').click();await result.locator('.tool-result').waitFor({state:'visible'});assert.equal(await form.locator('[type=submit]').isEnabled(),true);
   if(module==='sonar'){await page.locator('#beam-depth').fill('12');await page.locator('#beam-result').evaluate(node=>node.replaceChildren());await page.locator('#beam-form [type=submit]').click();assert.ok((await page.locator('#beam-result').innerText()).includes('12'))}
   const blocked=await page.evaluate(()=>{const f=document.createElement('form');f.dataset.localReady='true';f.innerHTML='<button type="submit">Server form</button>';let submitted=false;f.addEventListener('submit',e=>{submitted=true;e.preventDefault()});document.body.append(f);const e=new Event('submit',{bubbles:true,cancelable:true});f.dispatchEvent(e);f.remove();return {submitted,prevented:e.defaultPrevented}});assert.deepEqual(blocked,{submitted:false,prevented:true},'unrelated/server forms stay blocked');
   results.push({lang,width,module,bootstrap:'failed',nativeSubmit:'PASS',serverForm:'BLOCKED'});
  }
  assert.deepEqual(errors,[],'no unhandled JavaScript errors');await context.close();
 }
 await writeFile(directory+'/results.json',JSON.stringify({result:'PASS',productionRequests:0,results},null,2));console.log('KNOWLEDGE OFFLINE PASS '+JSON.stringify(results));
}finally{await browser.close();await server.close()}
