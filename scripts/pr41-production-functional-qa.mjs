// One-time authenticated READ-ONLY production acceptance. The ONLY intentional
// production mutations are one normal login session and its normal logout.
// Never disclose authentication material or private production record contents.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const BASE='https://dream-team.sewerynski00.workers.dev';
const BUILD='5c38a2cc69657fb5ad8c2df3c716a90439688e34';
const report={version:'pr41-production-functional-v1',result:'PARTIAL',run:process.env.GITHUB_RUN_ID,checks:[],pages:[],viewports:[],errors:[],privacy:'NO_COOKIES_PASSWORDS_OR_RECORD_VALUES'};
const check=(name,ok,detail={})=>report.checks.push({name,result:ok?'PASS':'FAIL',...detail});
const note=(name,detail)=>report.checks.push({name,result:'NOT_TESTED',reason:detail});
const now=()=>Date.now();
let browser,context,page,logged=false;
const guarded=async(name,fn)=>{try{await fn()}catch(e){check(name,false,{reason:e?.name==='TimeoutError'?'TIMEOUT':String(e?.message||e).replaceAll(process.env.RYBY_LOGIN_PASSWORD||'@@NO_PASS@@','[REDACTED]').slice(0,100)})}};
const request=async (path)=>{const r=await context.request.get(BASE+path,{timeout:30000,maxRedirects:0,headers:{'cache-control':'no-store'}});const text=await r.text();let data;try{data=JSON.parse(text)}catch{}return {status:r.status(),data,bodyType:r.headers()['content-type']||'',length:text.length}};
try {
 if(!process.env.RYBY_LOGIN_PASSWORD)throw Error('GITHUB_LOGIN_SECRET_UNAVAILABLE');
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:390,height:844},locale:'pl-PL',serviceWorkers:'allow'});
 page=await context.newPage();
 const errors=[]; page.on('pageerror',()=>errors.push('pageerror'));page.on('console',m=>{if(m.type()==='error')errors.push('console_error')});
 const anon=await request('/api/bootstrap');check('unauthenticated_bootstrap_protected',anon.status===401,{status:anon.status});
 const start=now();
 await page.goto(BASE+'/login',{waitUntil:'domcontentloaded',timeout:30000});
 check('login_form_visible',await page.locator('input[name=username]').count()===1&&await page.locator('input[name=password]').count()===1);
 await page.locator('input[name=username]').fill('Patryk');
 await page.locator('input[name=password]').fill(process.env.RYBY_LOGIN_PASSWORD);
 await Promise.all([
   page.waitForURL(u=>u.pathname!=='/login'&&u.pathname!=='/login.html',{timeout:35000}).catch(()=>{}),
   page.locator('form button[type=submit]').click()
 ]);
 const cookies=await context.cookies(BASE);logged=cookies.some(c=>c.name==='__Host-ryby_session'&&c.value);
 check('production_login_success',logged,{durationMs:now()-start});
 if(!logged)throw Error('AUTH_CREDENTIAL_NOT_ACCEPTED'); // Only one login attempt.
 const bootStart=now(),boot=await request('/api/bootstrap');
 check('authenticated_bootstrap',boot.status===200&&boot.data?.ok!==false,{status:boot.status,durationMs:now()-bootStart,hasTripData:Boolean(boot.data?.trips)});
 if(boot.status!==200)throw Error('BOOTSTRAP_UNAVAILABLE');
 const counts={};
 const scan=(x)=>Array.isArray(x)?x.length:undefined;
 for(const [key,aliases] of Object.entries({trips:['trips'],catches:['catches'],checklist:['checklist','checklistItems'],anglers:['anglers'],lakes:['lakes']})){
  let value;for(const alias of aliases){if(Array.isArray(boot.data?.[alias])){value=scan(boot.data[alias]);break}}
  if(value!==undefined)counts[key]=value;
 }
 check('bootstrap_structure',Array.isArray(boot.data?.trips)&&Array.isArray(boot.data?.catches),{counts});
 const accounts=await request('/api/accounts');check('authenticated_accounts_api',accounts.status===200&&Array.isArray(accounts.data?.accounts),{status:accounts.status,accountCount:accounts.data?.accounts?.length??null});
 const categories=await request('/api/checklist-categories');check('checklist_categories_api',categories.status===200&&Array.isArray(categories.data?.categories),{status:categories.status,categoryCount:categories.data?.categories?.length??null});
 const wStart=now(),weather=await request('/api/weather?tripId=next-trip');
 const w=weather.data||{};const weatherPass=weather.status===200&&w.ok!==false&&Object.keys(w).length>2;
 check('weather_pro_live_api',weatherPass,{status:weather.status,durationMs:now()-wStart,topLevelKeys:Object.keys(w).filter(k=>!['error','message'].includes(k)).slice(0,24),containsNaN:JSON.stringify(w).includes('NaN')});
 // Browser checks, one existing authenticated session reused everywhere.
 const allPages=['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/polowy.html','/pages/pogoda.html','/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html','/pages/lowiska.html','/pages/porady.html','/pages/rigi.html','/pages/wezly.html','/pages/regulamin.html','/pages/mapa.html','/pages/teren.html'];
 for(const width of [390,768,1280,1440]){
  await page.setViewportSize({width,height:width===390?844:900});
  const paths=width===390?allPages:['/','/pages/wyjazdy.html','/pages/checklisty.html','/pages/pogoda.html','/pages/encyklopedia.html','/pages/sonar.html'];
  for(const path of paths) {
   let status='PASS',http=null,ready='unknown',overflow=null,checklistReadyMs=null,knowledgeReady=null;
   const ts=now();
   try {
    const response=await page.goto(BASE+path,{waitUntil:'domcontentloaded',timeout:28000});
    http=response?.status()??null;
    if(page.url().includes('/login'))throw Error('UNEXPECTED_REDIRECT_TO_LOGIN');
    if(!response||http>=400)throw Error('HTTP_NAVIGATION_FAILED');
    const loaded=await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.ready),null,{timeout:35000}).then(()=>true).catch(()=>false);
    ready=loaded?await page.locator('html').getAttribute('data-ready'):'timeout';
    if(ready==='error'||ready==='timeout')status='FAIL';
    if(path.endsWith('checklisty.html')){
     const value=await page.locator('#check-all-count').textContent().catch(()=>null);
     if(!value||!(/^\d+$/.test(value.trim()))){
      await page.waitForFunction(()=>/^\d+$/.test(document.querySelector('#check-all-count')?.textContent?.trim()||''),null,{timeout:25000}).catch(()=>{});
     }
     checklistReadyMs=now()-ts;
     const n=(await page.locator('#check-all-count').textContent().catch(()=>'')).trim();
     if(!/^\d+$/.test(n))status='FAIL';
     // Record only count, never element labels or assignments.
     report.checklist={totalDisplayed:/^\d+$/.test(n)?Number(n):null,readyMs:checklistReadyMs,baselineExpectedActive:64};
    }
    if(path.endsWith('encyklopedia.html')||path.endsWith('sonar.html')) {
     knowledgeReady=await page.locator('#knowledge-root').getAttribute('data-knowledge-ready').catch(()=>null);
     if(knowledgeReady!=='true')status='FAIL';
    }
    overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    if(overflow>6)status='FAIL';
   }catch(e){status='FAIL';ready=ready==='unknown'?'navigation_error':ready;}
   report.pages.push({path,width,status,http,ready,elapsedMs:now()-ts,overflowPx:overflow,knowledgeReady,checklistReadyMs});
  }
 }
 check('main_browser_pages',report.pages.every(x=>x.status==='PASS'),{checked:report.pages.length,failed:report.pages.filter(x=>x.status==='FAIL').map(x=>({path:x.path,width:x.width,ready:x.ready,http:x.http}))});
 check('browser_js_errors',errors.length===0,{errorCount:errors.length});
 // Fresh PWA browser context; never clear or modify any real user's installed PWA.
 await guarded('fresh_pwa_offline_read',async()=>{
  await page.goto(BASE+'/pages/encyklopedia.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await context.setOffline(true);
  const r=await page.goto(BASE+'/pages/sonar.html',{waitUntil:'domcontentloaded',timeout:16000});
  check('fresh_pwa_offline_sonar',Boolean(r)&&!page.url().includes('/login'),{status:r?.status()??null});
  await context.setOffline(false);
 });
 note('old_device_pwa_upgrade','Requires an actual old PWA installation; cannot be proven in disposable Chromium');
 note('write_offline_conflicts','No production writes or changes to existing user records; retained isolated regression evidence only');
 report.result=report.checks.some(x=>x.result==='FAIL')||report.pages.some(x=>x.status==='FAIL')?'PARTIAL':'PASS_WITH_NOT_TESTED';
}catch(e){
 report.errors.push({stage:logged?'AUTHENTICATED':'LOGIN',code:/^[A-Z0-9_]+$/.test(e?.message||'')?e.message:'TEST_ABORTED'});
 report.result='PARTIAL';
}finally {
 if(context&&logged)try {
  await context.setOffline(false);
  const r=await context.request.post(BASE+'/api/logout',{headers:{origin:BASE},timeout:12000});
  check('test_session_logout',r.status()===200,{status:r.status()});
 }catch{check('test_session_logout',false,{reason:'LOGOUT_FAILED_MANUAL_SESSION_CLEANUP_MAY_BE_NEEDED'})}
 await context?.close().catch(()=>{});
 await browser?.close().catch(()=>{});
 await mkdir('qa-safe-status',{recursive:true});
 await writeFile('qa-safe-status/summary.json',JSON.stringify(report,null,2));
 const failed=report.checks.filter(x=>x.result==='FAIL').map(x=>x.name);
 console.log('PR41_AUTHENTICATED_QA '+JSON.stringify({result:report.result,login:report.checks.find(x=>x.name==='production_login_success')?.result,logout:report.checks.find(x=>x.name==='test_session_logout')?.result,pages:report.pages.length,failedPageCount:report.pages.filter(x=>x.status==='FAIL').length,failedChecks:failed,weather:report.checks.find(x=>x.name==='weather_pro_live_api')?.result,checklistMs:report.checklist?.readyMs??null,errors:report.errors}));
 // Keep audited failures visible, but never disclose private data or credentials.
 if(report.errors.length||failed.length||report.pages.some(x=>x.status==='FAIL'))process.exitCode=1;
}