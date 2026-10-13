// Current-release regression. Historical three-account/password/CRUD proofs remain in the report.
// This job deliberately makes no business writes, password resets or provider calls.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {authenticateReadOnly} from './preview-readonly-auth.mjs';
const base='https://dream-team-preview.sewerynski00.workers.dev',mode=process.argv[2];assert.ok(['accounts','extras','media'].includes(mode));
await mkdir('live-preview-qa',{recursive:true});const browser=await chromium.launch(),report=[];
const read=async(context,path)=>{const r=await context.request.get(base+path,{timeout:20000});assert.equal(r.status(),200,path);return r.json();};
try{
 for(const width of [390,1280])for(const username of mode==='accounts'?['Patryk','Maciek']:['Patryk']){
  const context=await browser.newContext({viewport:{width,height:844},locale:'pl-PL',serviceWorkers:mode==='media'?'allow':'block'}),page=await context.newPage();
  try{
   await authenticateReadOnly(context,base,'pl',username);
   const boot=await read(context,'/api/bootstrap');assert.equal(boot.currentUser.anglerId,username.toLowerCase());assert.equal(boot.currentUser.name,username);
   const accounts=(await read(context,'/api/accounts')).accounts;assert.ok(accounts.filter(a=>a.active).length<=3);for(const name of ['patryk','maciek'])assert.ok(accounts.some(a=>a.anglerId===name&&a.active));
   const profiles=boot.anglers.map(a=>({id:a.id,baseline:a.baselinePbKg,pb:a.pbKg}));for(const name of ['patryk','maciek'])assert.ok(profiles.some(a=>a.id===name&&Number.isFinite(a.pb)));
   const target=mode==='accounts'?'/pages/polowy.html':mode==='media'?'/pages/sonar.html':'/pages/ustawienia.html';
   const response=await page.goto(base+target,{waitUntil:'commit',timeout:30000});assert.equal(response.status(),200);await page.locator('html[data-ready="true"][data-i18n-ready="pl"]').waitFor({timeout:30000});
   if(mode==='accounts'){
    assert.equal(await page.locator('#person').inputValue(),username);const other=username==='Patryk'?'Maciek':'Patryk';await page.locator('#person').selectOption(other);assert.equal(await page.locator('#person').inputValue(),other);assert.equal(await page.locator('#save-catch-btn').isEnabled(),true);
    const payload=JSON.stringify(await read(context,'/api/export'));for(const secret of ['password_hash','auth_credential','auth_sessions','RYBY_SESSION_SECRET','RYBY_LOGIN_PASSWORD','TAVILY_API_KEY'])assert.ok(!payload.includes(secret),'export hides '+secret);
   }else if(mode==='extras'){
    assert.equal(await page.locator('.language-selector select').count(),1);assert.ok(await page.locator('.language-selector').isVisible());assert.equal(await page.locator('#participant-profile-list .participant-profile').count(),boot.anglers.length);
    const values=await page.locator('#system-health dd').allTextContents();assert.equal(values.length,8);assert.ok(values.every(v=>v.trim().length));const settings=await read(context,'/api/settings');assert.equal(settings.environment,'preview');assert.equal(settings.workersAiAvailable,false);assert.equal(settings.researchProviderConfigured,true);
    await read(context,'/api/checklist-templates');await read(context,'/api/checklist-categories');
   }else{
    await page.locator('#media-save').waitFor();await page.locator('#atlas-overview img').first().waitFor({state:'attached',timeout:30000});assert.equal(await page.locator('#atlas-overview img').count(),17);
    for(const img of await page.locator('#atlas-overview img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());assert.ok(await img.evaluate(el=>el.naturalWidth>0));}
    await read(context,'/api/deeper-media');assert.equal((await read(context,'/api/settings')).workersAiAvailable,false);
    await page.reload({waitUntil:'commit',timeout:30000});await page.locator('html[data-ready="true"]').waitFor({timeout:30000});await page.locator('#media-save').waitFor();await page.locator('#atlas-overview img').first().waitFor({state:'attached',timeout:30000});assert.equal(await page.locator('#atlas-overview img').count(),17);
   }
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);assert.deepEqual(await page.locator('#app-notice.status-danger').allTextContents(),[]);
   assert.deepEqual((await read(context,'/api/bootstrap')).anglers.map(a=>({id:a.id,baseline:a.baselinePbKg,pb:a.pbKg})),profiles);
   const storage=await page.evaluate(()=>({keys:[...Object.keys(localStorage),...Object.keys(sessionStorage)],cookies:document.cookie}));assert.ok(!storage.keys.some(k=>/password|credential|secret/i.test(k)));assert.ok(!storage.cookies.includes('ryby_session'));
   await page.screenshot({path:`live-preview-qa/readonly-${mode}-${username}-${width}.png`});report.push({mode,width,user:username,result:'PASS',businessWrites:0,providerCalls:0,passwordResets:0});console.log('LIVE READONLY SECURITY',JSON.stringify(report.at(-1)));
  }catch(error){throw new Error(`${mode}/${width}/${username}: `+String(error.message).split('\n')[0]);}
  finally{await context.request.post(base+'/api/logout',{data:{},headers:{origin:base},timeout:10000}).catch(()=>{});await context.close();}
 }
 const anonymous=await browser.newContext({serviceWorkers:'block'});try{for(const path of ['/api/bootstrap','/api/accounts','/api/export','/api/deeper-media/not-a-media/image'])assert.equal((await anonymous.request.get(base+path,{timeout:15000})).status(),401,path);}finally{await anonymous.close();}
}finally{await writeFile(`live-preview-qa/readonly-${mode}.json`,JSON.stringify(report,null,2));await browser.close();}
