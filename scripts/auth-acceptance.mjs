// Owner-authorized: at most one new session per named account, scoped logout.
import {chromium} from 'playwright';import {cf,query,productionId} from './recovery-common.mjs';
const base='https://dream-team.sewerynski00.workers.dev',report={result:'PARTIAL',sessionAttempts:0,accounts:[],blockedWrites:0,tests:[]},originalSessions=new Set();
const check=(x,c)=>{if(!x)throw Error(c)};
const sessions=async()=>(await query(productionId,'SELECT id_hash FROM auth_sessions')).results.map(x=>x.id_hash);
const safePath=url=>{try{return new URL(url).pathname.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi,':id')}catch{return '[invalid]'}};
let browser;
try{
 const d=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(d.versions?.length===1&&d.versions[0].percentage===100&&d.versions[0].version_id==='31b6b9bd-8f0b-4566-9ced-6b5bf1c26f9d','PRODUCTION_MOVED');
 for(const id of await sessions())originalSessions.add(id);report.sessionsBefore=originalSessions.size;
 browser=await chromium.launch();
 for(const [username,locale,width] of [['Patryk','pl-PL',390],['Maciek','en-GB',1440]]){
  const item={username,width,result:'PARTIAL',logout:'NOT_ATTEMPTED',preferenceRestore:'NOT_ATTEMPTED'};report.accounts.push(item);
  let ctx,page,loginSucceeded=false,originalLang=null;
  try{
   ctx=await browser.newContext({viewport:{width,height:900},locale,serviceWorkers:'block'});
   await ctx.route('**/*',route=>{if(!['GET','HEAD','OPTIONS'].includes(route.request().method())){report.blockedWrites++;return route.abort('blockedbyclient')}return route.continue()});
   check(report.sessionAttempts<2,'SESSION_LIMIT');report.sessionAttempts++;
   const login=await ctx.request.post(base+'/api/login',{form:{username,password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});
   item.loginStatus=login.status();check(login.status()===303&&!!login.headers()['set-cookie'],'LOGIN_FAILED');loginSucceeded=true;
   page=await ctx.newPage();const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.name));page.on('requestfailed',r=>{if(r.method()==='GET')failed.push({path:safePath(r.url()),reason:r.failure()?.errorText})});
   const visit=async(label,path)=>{
    const start=Date.now(),beforeE=errors.length,beforeF=failed.length;let r=await page.goto(base+path,{waitUntil:'domcontentloaded',timeout:35000});
    await page.locator('html[data-ready]').waitFor({state:'attached',timeout:45000});const ready=await page.locator('html').getAttribute('data-ready');
    const state=await page.evaluate(()=>({user:window.DREAM_MODEL?.currentUser?.username,viewedTrip:window.DREAM_TRIP?.id,lang:document.documentElement.lang,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    const x={user:username,label,path:safePath(page.url()),status:r?.status()||null,ready,ms:Date.now()-start,jsErrors:errors.slice(beforeE),failedGET:failed.slice(beforeF),...state};report.tests.push(x);check(ready==='true'&&state.user===username,'PAGE_NOT_READY');return x;
   };
   await visit('trips','/pages/wyjazdy.html#trip-archive');
   const trips=await page.evaluate(()=>window.DREAM_MODEL.trips.map(t=>({id:t.id,name:t.name,lakeId:t.lakeId,lake:t.lakeProfile?.name||t.lake,status:t.status,photo:!!t.googlePhotosUrl})));
   item.trips=trips;item.tripCardCount=await page.locator('.trip-card').count();item.archiveCardCount=await page.locator('#trip-archive .trip-card').count();
   for(const trip of trips){
    await visit('trip-list','/pages/wyjazdy.html');const btn=page.locator('.trip-card').filter({has:page.locator('[data-open="'+trip.id+'"]')}).locator('[data-view-lake]');
    const x={user:username,trip:trip.name,lake:trip.lake,label:'open-profile',result:'FAIL'};report.tests.push(x);
    try{await btn.click();await page.waitForURL(u=>u.pathname==='/pages/wyjazdy.html'&&u.searchParams.get('lakeId')===trip.lakeId,{timeout:20000});await page.locator('html[data-ready=true]').waitFor({state:'attached',timeout:45000});await page.locator('.lake-profile-summary').waitFor({state:'visible',timeout:20000});x.profileName=await page.locator('.lake-profile-summary h2').first().innerText();x.result=x.profileName===trip.lake?'PASS':'MISMATCH';}catch(e){x.error=e.name;x.path=safePath(page.url());}
   }
   await visit('trip-list','/pages/wyjazdy.html');const france=page.locator('.trip-card').filter({has:page.locator('[data-open="next-trip"]')});
   const francePhoto=france.locator('.trip-photos-link');item.franceCardPhotoHref=await francePhoto.count()?await francePhoto.first().getAttribute('href'):null;
   const archivedFrancePhoto=page.locator('#trip-archive .trip-card').filter({has:page.locator('[data-open="la-plaine-2026"]')}).locator('.trip-photos-link');item.archivedFrancePhotoHref=await archivedFrancePhoto.count()?await archivedFrancePhoto.first().getAttribute('href'):null;
   item.archivePhotos=await page.locator('#trip-archive .trip-photos-link').count();
   if(username==='Patryk'){
    for(const trip of trips){
     await visit('select-trip-list','/pages/wyjazdy.html');await page.locator('[data-open="'+trip.id+'"]').click();await page.waitForURL(u=>u.pathname==='/',{timeout:20000});await page.locator('html[data-ready=true]').waitFor({state:'attached',timeout:45000});
     const catches=await visit('trip-catches','/pages/polowy.html');const checklist=await visit('trip-checklist','/pages/checklisty.html');
     report.tests.push({user:username,label:'trip-history-view',trip:trip.name,expectedId:trip.id,catchesTrip:catches.viewedTrip,checklistTrip:checklist.viewedTrip,result:catches.viewedTrip===trip.id&&checklist.viewedTrip===trip.id?'PASS':'MISMATCH'});
    }
   }
   await visit('france-trip-list','/pages/wyjazdy.html');await page.locator('[data-open="next-trip"]').click();await page.waitForURL(u=>u.pathname==='/',{timeout:20000});await page.locator('html[data-ready=true]').waitFor({state:'attached',timeout:45000});
   await visit('france-catches','/pages/polowy.html');item.catchesPhotoHref=await page.locator('.trip-photos-link').count()?await page.locator('.trip-photos-link').first().getAttribute('href'):null;
   const photoLink=page.locator('.trip-photos-link').first();if(await photoLink.count()&&item.catchesPhotoHref?.startsWith('https://photos.app.goo.gl/')){
    try{const popupPromise=page.waitForEvent('popup',{timeout:15000});await photoLink.click();const pop=await popupPromise;await pop.waitForLoadState('domcontentloaded',{timeout:30000}).catch(()=>{});item.photoPopup={host:new URL(pop.url()).hostname,title:await pop.title().catch(()=>'')};await pop.close();}catch(e){item.photoPopup={error:e.name};}
   }
   for(const [label,path] of [['home','/'],['weather','/pages/pogoda.html'],['regulations','/pages/regulamin.html'],['settings','/pages/ustawienia.html']])await visit(label,path);
   item.regulationsNotes=await (async()=>{await visit('regulations-count','/pages/regulamin.html');return page.locator('[data-maintained-rule-notice] + * .weather-note, main .weather-note').count()})();
   await visit('settings-language','/pages/ustawienia.html');const select=page.locator('#account-language-row select').first();await select.waitFor({timeout:15000});
   originalLang=await select.inputValue();item.preferenceBefore=originalLang;const other=originalLang==='pl'?'en':'pl';
   await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),select.selectOption(other)]);await page.locator('html[data-ready=true]').waitFor({state:'attached',timeout:45000});
   item.languageSwitch=await page.locator('html').getAttribute('lang')===other?'PASS':'FAIL';await page.reload({waitUntil:'domcontentloaded'});await page.locator('html[data-ready=true]').waitFor({state:'attached',timeout:45000});item.languageReload=await page.locator('html').getAttribute('lang')===other?'PASS':'FAIL';
   const back=page.locator('#account-language-row select').first();await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),back.selectOption(originalLang)]);await page.locator('html[data-ready=true]').waitFor({state:'attached',timeout:45000});
   item.preferenceRestore=await page.locator('html').getAttribute('lang')===originalLang?'PASS':'FAIL';originalLang=null;item.result='COMPLETE';
  }catch(e){item.failure={type:e.name,code:/^[A-Z0-9_]+$/.test(e.message)?e.message:undefined,path:page?safePath(page.url()):undefined};}
  finally{
   if(page&&originalLang){try{await page.evaluate(value=>window.DreamLanguage?.persist(value),originalLang);item.preferenceRestore='LOCAL_RESTORED_UNVERIFIED';}catch{item.preferenceRestore='FAILED'}}
   if(ctx&&loginSucceeded){try{const r=await ctx.request.post(base+'/api/logout',{headers:{origin:base},maxRedirects:0});item.logout=r.status()===200?'PASS':'FAIL';}catch{item.logout='FAIL'}}
   if(ctx)await ctx.close();
  }
 }
 const after=new Set(await sessions());report.sessionsAfter=after.size;report.existingSessionsPreserved=[...originalSessions].every(x=>after.has(x));report.result=report.accounts.every(x=>x.result==='COMPLETE'&&x.logout==='PASS'&&x.preferenceRestore==='PASS')&&report.existingSessionsPreserved?'COMPLETE':'PARTIAL';
}catch(e){report.error=/^[A-Z0-9_]+$/.test(e.message)?e.message:e.name;}finally{if(browser)await browser.close();console.log('AUTHORIZED_PRODUCTION_ACCEPTANCE '+JSON.stringify(report));}
