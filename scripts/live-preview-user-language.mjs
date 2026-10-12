// Actual two users on the same device, with independent PL/EN preferences. No business writes.
import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';import {chromium} from 'playwright';
const base='https://dream-team-preview.sewerynski00.workers.dev',browser=await chromium.launch();
const routes=['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/mapa.html','/pages/teren.html','/pages/pogoda.html','/pages/dojazd.html','/pages/regulamin.html','/pages/wezly.html','/pages/rigi.html','/pages/porady.html','/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html'];
await mkdir('live-preview-qa',{recursive:true});
async function open(page,path,lang){await page.goto(base+path,{waitUntil:'commit',timeout:30000});await page.locator(`html[data-ready="true"][data-i18n-ready="${lang}"]`).waitFor({state:'attached',timeout:30000});}
async function login(page,username,lang,loginLanguage){await page.goto(base+'/login',{waitUntil:'commit',timeout:30000});await page.locator('html[data-i18n-ready]').waitFor();if(loginLanguage){await page.locator('.language-selector select').selectOption(loginLanguage);await page.locator(`html[data-i18n-ready="${loginLanguage}"]`).waitFor();}await page.locator('[name="username"]').fill(username);await page.locator('[name="password"]').fill(process.env.RYBY_LOGIN_PASSWORD);await page.locator('[type="submit"]').click({noWaitAfter:true});await page.waitForURL(url=>new URL(url).pathname==='/',{waitUntil:'commit',timeout:30000});await page.locator(`html[data-ready="true"][data-i18n-ready="${lang}"]`).waitFor({state:'attached',timeout:30000});}
async function logout(page,lang){await open(page,'/pages/ustawienia.html',lang);await page.locator('#ryby-logout').click();await page.waitForURL('**/login',{waitUntil:'commit',timeout:30000});}
try{
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},locale:'pl-PL',isMobile:width===390,hasTouch:width===390}),page=await context.newPage();
  await login(page,'Patryk','pl');await open(page,'/pages/ustawienia.html','pl');assert.equal(await page.locator('.language-selector select').count(),1);
  await page.locator('.language-selector select').selectOption('en');await page.locator('html[data-ready="true"][data-i18n-ready="en"]').waitFor();await page.reload({waitUntil:'commit'});await page.locator('html[data-ready="true"][data-i18n-ready="en"]').waitFor();await page.locator('.language-selector select').selectOption('pl');await page.locator('html[data-ready="true"][data-i18n-ready="pl"]').waitFor();await logout(page,'pl');
  await login(page,'Maciek','en','en');await open(page,'/pages/ustawienia.html','en');await page.reload({waitUntil:'commit'});await page.locator('html[data-ready="true"][data-i18n-ready="en"]').waitFor();await logout(page,'en');
  // Login remains EN, but Patryk's PL account preference wins after authentication.
  await login(page,'Patryk','pl');await logout(page,'pl');await login(page,'Maciek','en');
  assert.equal(await page.evaluate(()=>localStorage.getItem('dreamteam.language.account-patryk')),'pl');assert.equal(await page.evaluate(()=>localStorage.getItem('dreamteam.language.account-maciek')),'en');
  for(const [username,lang] of [['Maciek','en'],['Patryk','pl']]){
   if(username==='Patryk'){await logout(page,'en');await login(page,username,lang);}
   for(const route of routes){await open(page,route,lang);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,`${username} ${width} ${route} overflow`);assert.equal(await page.locator('#app-notice.error').count(),0);}
   await page.screenshot({path:`live-preview-qa/user-language-${username}-${width}.png`});
  }
  const cookie=context;const enError=await cookie.request.post(base+'/api/catches',{headers:{origin:base,'accept-language':'en'},data:{tripId:'missing',anglerId:'patryk',weightKg:0}});assert.equal(enError.status(),404);assert.equal((await enError.json()).error,'Trip not found.');
  const plError=await cookie.request.post(base+'/api/catches',{headers:{origin:base,'accept-language':'pl'},data:{tripId:'missing',anglerId:'patryk',weightKg:0}});assert.equal((await plError.json()).error,'Nie znaleziono wyjazdu.');
  console.log(`LIVE USER LANGUAGE ${width}: PASS PL/EN/PL + reload + Patryk PL/Maciek EN on one device; 15 routes per user; API errors PL/EN.`);await context.close();
 }
}finally{await browser.close();}
