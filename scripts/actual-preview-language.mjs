import {chromium} from 'playwright';import {mkdir,writeFile} from 'node:fs/promises';
const base='https://dream-team-preview.sewerynski00.workers.dev',report={status:'FAIL',cases:[]};let b;
try{
 b=await chromium.launch();
 for(const [username,width,initial] of [['Patryk',390,'pl'],['Maciek',1440,'en']]){
  let ctx=await b.newContext({viewport:{width,height:900},locale:initial,serviceWorkers:'block'}),logged=false;
  try{
   await ctx.addInitScript(v=>localStorage.setItem('dreamteam.language',v),initial);
   await ctx.route('**/*',r=>['GET','HEAD','OPTIONS'].includes(r.request().method())?r.continue():r.abort());
   let login=await ctx.request.post(base+'/api/login',{form:{username,password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});if(login.status()!==303||!login.headers()['set-cookie'])throw Error('LOGIN_FAILED');logged=true;
   let p=await ctx.newPage();let response=await p.goto(base+'/pages/wyjazdy.html',{waitUntil:'domcontentloaded'});await p.locator('html[data-ready=true]').waitFor({timeout:60000});
   let before=await p.evaluate(()=>({lang:document.documentElement.lang,archive:!!document.querySelector('#trip-archive'),fishery:!!document.querySelector('#fisheries-area'),user:window.DREAM_MODEL?.currentUser?.username}));let next=initial==='pl'?'en':'pl';
   let sel=p.locator('.language-selector select').first();await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}),sel.selectOption(next)]);await p.waitForFunction(v=>document.documentElement.lang===v,next,{timeout:45000});await p.locator('html[data-ready=true]').waitFor({timeout:60000});
   let switched=await sel.inputValue(),l=await p.locator('html').getAttribute('lang');await p.reload({waitUntil:'domcontentloaded'});await p.locator('html[data-ready=true]').waitFor({timeout:60000});let persisted=await p.locator('html').getAttribute('lang');
   let ok=response.status()===200&&before.lang===initial&&before.user===username&&before.archive&&before.fishery&&switched===next&&l===next&&persisted===next;
   report.cases.push({username,width,initial,afterSwitch:l,afterReload:persisted,archiveAnchor:before.archive,fisheryAnchor:before.fishery,correctUser:before.user===username,result:ok?'PASS':'FAIL'});
  }finally{if(logged)await ctx.request.post(base+'/api/logout',{headers:{origin:base}}).catch(()=>{});await ctx.close()}
 }
 if(report.cases.length===2&&report.cases.every(c=>c.result==='PASS'))report.status='PASS';else process.exitCode=1;
}catch(e){report.error=e.name;process.exitCode=1}
finally{if(b)await b.close();await mkdir('preview-language-status',{recursive:true});await writeFile('preview-language-status/summary.json',JSON.stringify(report,null,2));console.log('PREVIEW_LANGUAGE '+JSON.stringify(report))}
