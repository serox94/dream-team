// Browser test only on disposable isolated preview clone.
import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const base='https://dream-team-audit-41720081279-canary.sewerynski00.workers.dev',report={result:'BLOCKED',tests:[]};let browser;
try{
 if(!process.env.RYBY_LOGIN_PASSWORD)throw Error('MISSING_TEST_SECRET');browser=await chromium.launch();
 for(const [username,width] of [['Patryk',390],['Maciek',1440]]){
  const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});let logged=false;
  try{
   await ctx.route('**/*',route=>['GET','HEAD','OPTIONS'].includes(route.request().method())?route.continue():route.abort());
   const login=await ctx.request.post(base+'/api/login',{form:{username,password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});
   if(login.status()!==303||!login.headers()['set-cookie'])throw Error('TEST_LOGIN_FAILED');logged=true;
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.name));
   for(const path of ['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/pogoda.html']){
    const res=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:45000});
    await page.locator('html[data-ready=true]').waitFor({timeout:60000});
    const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,user:window.DREAM_MODEL?.currentUser?.username||null}));
    const result=res?.status()===200&&!state.overflow&&state.user===username&&errors.length===0?'PASS':'FAIL';
    report.tests.push({username,width,path,status:res?.status(),overflow:state.overflow,userCorrect:state.user===username,jsErrors:errors.slice(),result});
    if(result!=='PASS')throw Error('BROWSER_SCREEN_FAILED');
   }
  }finally{if(logged)await ctx.request.post(base+'/api/logout',{headers:{origin:base}}).catch(()=>{});await ctx.close()}
 }
 report.result='PASS';
}catch(e){report.failure=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;process.exitCode=1}
finally{if(browser)await browser.close();await mkdir('preview-browser-status',{recursive:true});await writeFile('preview-browser-status/summary.json',JSON.stringify(report,null,2));console.log('PREVIEW_BROWSER_DRILL '+JSON.stringify(report))}
