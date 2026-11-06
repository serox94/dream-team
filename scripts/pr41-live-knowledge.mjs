// Isolated live Preview only. Bootstrap failure is deliberately simulated in the browser.
import assert from 'node:assert/strict';import {chromium} from 'playwright';import {waitForOfflineReady} from './qa-offline-ready.mjs';
const base='https://dream-team-preview.sewerynski00.workers.dev',browser=await chromium.launch({headless:true,args:['--no-sandbox']}),results=[];
try{for(const lang of ['pl','en'])for(const width of [390,1440]){
 let context=await browser.newContext({viewport:{width,height:900},locale:lang==='pl'?'pl-PL':'en-GB'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await context.addInitScript(l=>localStorage.setItem('dreamteam.language',l),lang);
 try{
  let login=await context.request.post(base+'/api/login',{form:{username:lang==='pl'?'Patryk':'Maciek',password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});assert.equal(login.status(),303,'isolated preview login');
  await page.goto(base+'/pages/checklisty.html',{waitUntil:'domcontentloaded'});await page.locator('html[data-ready=true]').waitFor({timeout:60000});let shell=await waitForOfflineReady(page,{timeout:120000});assert.equal(shell.missing,0);
  await context.addInitScript(()=>{const original=window.fetch;window.fetch=(url,...args)=>String(url).includes('/api/bootstrap')?new Promise(resolve=>{window.failFixtureBootstrap=()=>resolve(new Response(JSON.stringify({ok:false,error:'QA bootstrap unavailable'}),{status:400,headers:{'content-type':'application/json'}}))}):original(url,...args)});
  await context.setOffline(true);
  for(const module of ['encyklopedia','sonar']){
   await page.goto(base+'/pages/'+module+'.html',{waitUntil:'domcontentloaded',timeout:30000});await page.locator('#knowledge-root[data-knowledge-ready=true]').waitFor({timeout:30000});assert.equal(await page.locator('html').getAttribute('data-ready'),null);
   let form=page.locator(module==='encyklopedia'?'#tactic-form':'#spot-form'),result=page.locator(module==='encyklopedia'?'#tactic-result':'#spot-result');assert.equal(await form.evaluate(f=>f.checkValidity()),true);assert.equal(await form.locator('[type=submit]').isEnabled(),true);await form.locator('[type=submit]').click();await result.locator('.tool-result').waitFor({state:'visible'});results.push({lang,width,module,bootstrap:'pending',status:'PASS'});
   await page.evaluate(()=>window.failFixtureBootstrap());await page.locator('html[data-ready=error]').waitFor({timeout:15000});await result.evaluate(n=>n.replaceChildren());await form.locator('[type=submit]').click();await result.locator('.tool-result').waitFor({state:'visible'});
   if(module==='sonar'){await page.locator('#beam-depth').fill('12');await page.locator('#beam-form [type=submit]').click();assert.ok((await page.locator('#beam-result').innerText()).includes('12'))}
   let blocked=await page.evaluate(()=>{let f=document.createElement('form');f.innerHTML='<button type="submit">QA</button>';let submitted=false;f.addEventListener('submit',e=>{submitted=true;e.preventDefault()});document.body.append(f);let e=new Event('submit',{bubbles:true,cancelable:true});f.dispatchEvent(e);f.remove();return {submitted,prevented:e.defaultPrevented}});assert.deepEqual(blocked,{submitted:false,prevented:true});results.push({lang,width,module,bootstrap:'failed',status:'PASS'});
  }
  assert.deepEqual(errors,[]);
 }finally{await context.setOffline(false);await context.request.post(base+'/api/logout',{headers:{origin:base}}).catch(()=>{});await context.close()}
}}finally{await browser.close();console.log('PR41_LIVE_KNOWLEDGE '+JSON.stringify(results))}
assert.equal(results.length,16);
