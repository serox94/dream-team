// Production read-only UI diagnostic. Login creates one session; no data-modifying UI requests.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const base='https://dream-team.sewerynski00.workers.dev', report={result:'PARTIAL',tests:[],writeRequestsBlocked:0};
let browser,ctx;
const safePath=url=>{try{return new URL(url).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,':id');}catch{return '[invalid]'}};
try{
 browser=await chromium.launch({headless:true});
 ctx=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block',locale:'pl-PL'});
 await ctx.route('**/*',async route=>{const m=route.request().method();if(!['GET','HEAD','OPTIONS'].includes(m)){report.writeRequestsBlocked++;return route.abort('blockedbyclient')}return route.continue()});
 const login=await ctx.request.post(base+'/api/login',{form:{username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});
 report.loginStatus=login.status();if(login.status()!==303)throw Error('LOGIN_FAILED');
 await ctx.addInitScript(()=>{localStorage.setItem('dreamteam.language','pl');localStorage.setItem('dreamteam.theme','light');localStorage.setItem('dream_team_viewed_trip','next-trip')});
 const page=await ctx.newPage(),errors=[],failed=[],responses=[],starts=new Map();
 page.on('pageerror',e=>errors.push(String(e.name)+': '+String(e.message).slice(0,180)));
 page.on('request',r=>starts.set(r,Date.now()));
 page.on('requestfailed',r=>{if(r.method()==='GET')failed.push({path:safePath(r.url()),error:r.failure()?.errorText||'failed'})});
 page.on('response',r=>{if(r.request().method()==='GET'&&new URL(r.url()).origin===base&&safePath(r.url()).startsWith('/api/'))responses.push({path:safePath(r.url()),status:r.status(),ms:Date.now()-(starts.get(r.request())||Date.now())})});
 for(const [width,lang] of [[390,'pl'],[1440,'en']]){
  await page.setViewportSize({width,height:900});await page.addInitScript(lang=>localStorage.setItem('dreamteam.language',lang),lang);
  for(const [label,path] of [['trips_direct','/pages/wyjazdy.html#fisheries-area'],['legacy_redirect','/pages/lowiska.html'],['home','/'],['checklists','/pages/checklisty.html'],['catches','/pages/polowy.html'],['weather','/pages/pogoda.html']]){
   const start=Date.now(),beforeErr=errors.length,beforeFail=failed.length,beforeResp=responses.length;let status=null,navError=null;
   try{const nav=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:30000});status=nav?.status()||null;await page.waitForTimeout(2500);if(!await page.locator('html[data-ready]').count())await page.locator('html[data-ready]').waitFor({state:'attached',timeout:30000}).catch(()=>{});}
   catch(e){navError=e.name;}
   const actualUrl=page.url();const snapshot=await page.evaluate(()=>({ready:document.documentElement.dataset.ready||null,lang:document.documentElement.lang,fisheryAnchor:!!document.querySelector('#fisheries-area'),fisheryManager:!!document.querySelector('#lake-manager'),tripCards:document.querySelectorAll('.trip-card').length,photoLinks:document.querySelectorAll('.trip-photos-link').length,weatherTemp:!!document.querySelector('#weather-current-temp'),overflow:document.documentElement.scrollWidth>innerWidth+1,currentUser:window.DREAM_MODEL?.currentUser?.username||null,mainVisible:!!document.querySelector('main')})).catch(()=>null);
   report.tests.push({width,requestedLanguage:lang,label,requestedPath:path,actualPath:safePath(actualUrl),hash:(()=>{try{return new URL(actualUrl).hash}catch{return ''}})(),status,elapsedMs:Date.now()-start,navError,snapshot,jsErrors:errors.slice(beforeErr),failedRequests:failed.slice(beforeFail),apiResponses:responses.slice(beforeResp)});
  }
 }
 report.result='COMPLETE';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;process.exitCode=1;}
finally{if(ctx)await ctx.close();if(browser)await browser.close();await mkdir('production-readonly-qa',{recursive:true});await writeFile('production-readonly-qa/report.json',JSON.stringify(report,null,2));console.log('PRODUCTION_READONLY_QA '+JSON.stringify(report));}
