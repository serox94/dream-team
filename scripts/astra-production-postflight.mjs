// Read-only production UI/cron evidence. Writes only its own temporary login sessions.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {chromium} from 'playwright';
import {cf,query,productionId} from './recovery-common.mjs';import {assertWeatherFields} from './qa-weather-fields.mjs';
const candidate=process.env.RELEASE_CANDIDATE,base='https://dream-team.sewerynski00.workers.dev';
const status={result:'BLOCKED',candidate,productionBusinessWrites:0,mediaWrites:0,observations:[]};let browser,cookie;
const check=(v,c)=>{if(!v)throw Error(c);};const http=(path,options={})=>fetch(base+path,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
try{
 check(process.env.GITHUB_EVENT_NAME==='workflow_dispatch'&&process.env.RELEASE_ACTION==='verify','MANUAL_VERIFICATION_ONLY');
 const d=(await cf('/workers/scripts/dream-team/deployments')).deployments[0];check(d.versions.length===1&&d.versions[0].percentage===100,'PRODUCTION_TRAFFIC');status.activeVersion=d.versions[0].version_id;
 const v=await cf('/workers/scripts/dream-team/versions/'+status.activeVersion);check(v.resources.bindings.some(b=>b.name==='APP_BUILD'&&b.text===candidate),'BUILD_MISMATCH');
 const settings=(await query(productionId,"SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')")).results;status.schema=Number(settings.find(r=>r.key==='schema_version')?.value);status.maintenance=settings.find(r=>r.key==='maintenance_mode')?.value==='on'?'ON':'OFF';check(status.schema===29&&status.maintenance==='OFF','PRODUCTION_NOT_OPEN_SCHEMA29');
 const account=(await query(productionId,"SELECT u.protected,u.active,c.must_change FROM auth_accounts u JOIN auth_account_credentials c ON c.account_id=u.id WHERE u.id='account-system-ryby'")).results[0];check(account?.protected===1&&account.active===1&&account.must_change===1,'PROTECTED_ACCOUNT_STATE');status.ryby='INITIALIZED / MUST_CHANGE';
 const schedule=await cf('/workers/scripts/dream-team/schedules');status.cron=schedule.schedules.map(s=>s.cron);check(JSON.stringify(status.cron)==='["0 6 * * *"]','CRON_NOT_RESTORED');
 const loginPage=await http('/login');check(loginPage.status===200&&loginPage.headers.get('x-dreamteam-build')===candidate,'PUBLIC_LOGIN_BUILD');status.loginHttp=200;
 await mkdir('postflight-proof',{recursive:true});browser=await chromium.launch();
 for(const [width,language] of [[390,'pl'],[1280,'en']]){
  const r=await http('/api/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:'Patryk',password:process.env.RYBY_LOGIN_PASSWORD})});check(r.status===303&&!r.headers.get('location')?.includes('error='),'PRODUCTION_LOGIN');cookie=r.headers.get('set-cookie')?.split(';')[0];check(cookie,'SESSION_COOKIE');
  const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,locale:language==='pl'?'pl-PL':'en-GB',serviceWorkers:'block'});await context.addCookies([{name:'__Host-ryby_session',value:cookie.slice(cookie.indexOf('=')+1),url:base,secure:true,httpOnly:true,sameSite:'Lax'}]);await context.addInitScript(l=>localStorage.setItem('dreamteam.language',l),language);
  await context.route('**/*',async route=>{if(!['GET','HEAD'].includes(route.request().method()))return route.abort();await route.continue();});const page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('PAGE_ERROR'));let data,apiStatus;page.on('response',async r=>{if(new URL(r.url()).pathname==='/api/weather'){apiStatus=r.status();try{data=await r.json();}catch{}}});
  const response=await page.goto(base+'/pages/pogoda.html',{waitUntil:'domcontentloaded',timeout:45000});check(response.status()===200,'WEATHER_PAGE_HTTP');await page.locator('html[data-ready="true"]').waitFor({timeout:30000});await page.locator('html[lang="'+language+'"]').waitFor();await page.locator('#weather-source-status').filter({hasText:'Open-Meteo'}).waitFor({timeout:45000});const fields=await assertWeatherFields(page);check(apiStatus===200&&data,'WEATHER_API');
  const safety=await page.evaluate(d=>{const s=window.DreamCarpWeather.safety(d);return {state:s.state,complete:s.complete,coverage:s.coverage};},data);check(errors.length===0,'PRODUCTION_JAVASCRIPT_ERROR');
  // Screenshot only public forecast measurements: no account, trip, coordinates or private records.
  await page.locator('.carp-forecast-grid').screenshot({path:'postflight-proof/weather-'+width+'-'+language+'.png'});status.observations.push({width,language,build:response.headers()['x-dreamteam-build'],apiStatus,fields,safety,javascriptErrors:errors.length});
  await context.close();check((await http('/api/logout',{method:'POST',headers:{cookie}})).status===200,'LOGOUT');check((await http('/api/bootstrap',{headers:{cookie}})).status===401,'LOGOUT_REPLAY');cookie=null;
 }
 status.result='PASS';
}catch(error){status.reason=/^[A-Z0-9_]+$/.test(error.message)?error.message:'POSTFLIGHT_FAILED';status.httpStatus=error.status;process.exitCode=1;}finally{if(cookie)await http('/api/logout',{method:'POST',headers:{cookie}}).catch(()=>{});if(browser)await browser.close();await mkdir('postflight-proof',{recursive:true});await writeFile('postflight-proof/status.json',JSON.stringify(status,null,2));console.log('ASTRA PRODUCTION POSTFLIGHT '+JSON.stringify(status));}
