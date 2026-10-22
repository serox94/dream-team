// Read-only business smoke; authentication affects only this run's own sessions.
import {chromium} from 'playwright';
import {waitForOfflineReady} from './qa-offline-ready.mjs';
import {check} from './ui-release-core.mjs';
export async function smoke(url,build,{gate,pwa=false}={}){
 const browser=await chromium.launch(),result={result:'RUNNING',screens:[],accounts:[],businessWrites:0,modelCalls:0,suppressedInference:0};
 try{
  for(const [username,lang,width]of [['Patryk','pl',390],['Maciek','en',1440]]){
   const c=await browser.newContext({viewport:{width,height:width===390?844:1024},serviceWorkers:pwa?'allow':'block',extraHTTPHeaders:gate?{'x-release-gate':gate}:{}});
   const errors=[];let logged=false;console.log('UI_SMOKE_ACCOUNT '+username+' '+lang+' '+width);
   try{
    const publicLogin=await c.request.get(url+'/login');check(publicLogin.status()===200&&publicLogin.headers()['x-dreamteam-build']===build,'SMOKE_PUBLIC_BUILD');
    const login=await c.request.post(url+'/api/login',{form:{username,password:process.env.RYBY_LOGIN_PASSWORD},maxRedirects:0});check(login.status()===303,'SMOKE_LOGIN');logged=true;
    const bootstrap=await c.request.get(url+'/api/bootstrap');check(bootstrap.ok(),'SMOKE_SESSION');
    for(const path of ['/api/health','/api/content-translations?tripId=next-trip&language='+lang,'/api/water-measurements?tripId=next-trip'])check((await c.request.get(url+path)).ok(),'SMOKE_API');
    result.accounts.push({username,language:lang,login:'PASS',storedTranslations:'PASS'});
    await c.addInitScript(l=>{localStorage.setItem('dreamteam.language',l);localStorage.setItem('dream_team_viewed_trip','next-trip');},lang);
    await c.route('**/api/**',async r=>{if(r.request().method()==='GET')return r.continue();if(new URL(r.request().url()).pathname==='/api/content-translations/process'){result.suppressedInference++;return r.fulfill({json:{ok:true,providerEnabled:false,nextCursor:null,translated:0}});}result.businessWrites++;return r.abort();});
    const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
    for(const path of ['/','/pages/pogoda.html','/pages/checklisty.html','/pages/polowy.html','/pages/wyjazdy.html']){
     console.log('UI_SMOKE_SCREEN '+path+' '+lang+' '+width);const response=await p.goto(url+path,{waitUntil:'domcontentloaded'});check(response.status()===200,'SMOKE_PRIVATE_ROUTE');await p.locator('html[data-ready=true]').waitFor({timeout:45000});
     if(path.includes('pogoda')){await p.locator('#pro2[data-loaded=true]').waitFor({timeout:45000});check(await p.locator('#pro2').innerText(),'WEATHER_EMPTY');}
     check(await p.locator('html').getAttribute('lang')===lang,'SMOKE_LANGUAGE');
     for(const theme of ['dark','light']){await p.evaluate(t=>DreamTheme.set(t),theme);check(await p.locator('html').getAttribute('data-theme')===theme,'SMOKE_THEME');check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'SMOKE_OVERFLOW');}
     if(path.includes('polowy'))check(await p.locator('#trip-photos a').getAttribute('href')==='https://photos.app.goo.gl/THtvVFEPAogMtsuG7','GOOGLE_PHOTOS_LINK');
     result.screens.push({path,lang,width,themes:['dark','light'],result:'PASS'});
    }
    if(pwa&&username==='Patryk'){
     await p.goto(url+'/');await p.locator('html[data-ready=true]').waitFor();result.offlineShell=await waitForOfflineReady(p);
     await c.setOffline(true);await p.reload();await p.locator('html[data-ready=true]').waitFor({timeout:45000});check(await p.locator('html').getAttribute('data-theme')==='light','OFFLINE_THEME_MEMORY');
     await p.locator('#dream-theme-toggle').click();check(await p.locator('html').getAttribute('data-theme')==='dark','OFFLINE_TOGGLE');await p.goto(url+'/pages/checklisty.html');await p.locator('html[data-ready=true]').waitFor({timeout:45000});check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'OFFLINE_LAYOUT');await c.setOffline(false);result.pwa='PASS';
    }
    check(errors.length===0,'SMOKE_JAVASCRIPT');check(result.businessWrites===0,'UNEXPECTED_BUSINESS_WRITE');
   }finally{if(logged){await c.setOffline(false);const logout=await c.request.post(url+'/api/logout',{headers:{origin:url}});check(logout.ok(),'OWN_SESSION_CLEANUP');}await c.close();}
  }
  result.result='PASS';return result;
 }finally{await browser.close();}
}
