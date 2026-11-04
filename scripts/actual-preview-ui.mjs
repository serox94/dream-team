// Authenticated read-only UI checks on the newly migrated preview.
import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const report={result:'FAIL',cases:[]};let browser;
try{
 browser=await chromium.launch();
 for(const [user,lang,width] of [['Patryk','pl',390],['Patryk','pl',1440],['Maciek','en',390],['Maciek','en',1440]]){
  const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block',locale:lang});let logged=false;
  try{
   await ctx.addInitScript(lang=>localStorage.setItem('dreamteam.language',lang),lang);
   await ctx.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort());
   let login=await ctx.request.post(base+'/api/login',{form:{username:user,password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});
   if(login.status()!==303||!login.headers()['set-cookie'])throw Error('LOGIN_FAILED');logged=true;
   let page=await ctx.newPage(),errs=[];page.on('pageerror',e=>errs.push(e.name));
   for(const [name,path] of [['Start','/'],['Wyjazdy','/pages/wyjazdy.html'],['Archiwum','/pages/wyjazdy.html#trip-archive'],['Łowiska','/pages/wyjazdy.html#fisheries-area'],['Połowy','/pages/polowy.html'],['Checklista','/pages/checklisty.html'],['Pogoda','/pages/pogoda.html']]){
    let t={user,lang,width,screen:name,path,result:'FAIL'};report.cases.push(t);
    try{
     let start=Date.now(),r=await page.goto(base+path.replace('#','?qa='+encodeURIComponent(name)+'#'),{waitUntil:'domcontentloaded',timeout:45000});
     await page.locator('html[data-ready=true]').waitFor({timeout:60000});
     let x=await page.evaluate(()=>({lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth+1,user:window.DREAM_MODEL?.currentUser?.username||null,tripLinks:[...document.querySelectorAll('.trip-page-tabs a')].map(a=>a.getAttribute('href')),fisheryPresent:!!document.querySelector('#fisheries-area')}));
     t.status=r?.status()||null;t.ms=Date.now()-start;t.language=x.lang;t.userCorrect=x.user===user;t.overflow=x.overflow;t.jsErrors=errs.slice();
     let area=name==='Archiwum'?x.tripLinks.includes('#trip-archive'):name==='Łowiska'?x.fisheryPresent&&x.tripLinks.includes('#fisheries-area'):true;
     t.area=area;t.result=t.status===200&&x.lang===lang&&t.userCorrect&&!t.overflow&&errs.length===0&&area?'PASS':'FAIL';
    }catch(e){t.error=e.name;t.actualPath=new URL(page.url()).pathname}
   }
  }finally{if(logged)await ctx.request.post(base+'/api/logout',{headers:{origin:base}}).catch(()=>{});await ctx.close()}
 }
 if(report.cases.length===28&&report.cases.every(x=>x.result==='PASS'))report.result='PASS';else process.exitCode=1;
}catch(e){report.failure=e.name;process.exitCode=1}
finally{if(browser)await browser.close();await mkdir('actual-preview-ui',{recursive:true});await writeFile('actual-preview-ui/summary.json',JSON.stringify(report,null,2));console.log('ACTUAL_PREVIEW_UI '+JSON.stringify(report))}
