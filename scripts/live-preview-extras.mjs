// Live preview checks for two-device language isolation, checklist templates and participant editing.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const browser=await chromium.launch();
const login=async(locale,lang)=>{
  const context=await browser.newContext({viewport:{width:390,height:844},locale});
  const page=await context.newPage();
  await page.goto(base+'/login',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('html[data-i18n-ready]').waitFor({timeout:30000});
  await page.locator('.language-selector select').selectOption(lang);
  await page.locator(`html[data-i18n-ready="${lang}"]`).waitFor({timeout:30000});
  await page.locator('input[name="username"]').fill(process.env.RYBY_LOGIN_USERNAME);
  await page.locator('input[name="password"]').fill(process.env.RYBY_LOGIN_PASSWORD);
  await page.locator('button[type="submit"]').click({noWaitAfter:true});
  await page.waitForURL(url=>new URL(url).pathname==='/',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator(`html[data-ready="true"][data-i18n-ready="${lang}"]`).waitFor({timeout:30000});
  return {context,page};
};
try{
  // Independent language preference in two isolated browser profiles.
  const pl=await login('pl-PL','pl'),en=await login('en-GB','en');
  assert.equal(await pl.page.evaluate(()=>localStorage.getItem('dreamteam.language')),'pl');
  assert.equal(await en.page.evaluate(()=>localStorage.getItem('dreamteam.language')),'en');
  await Promise.all([pl.page.reload({waitUntil:'domcontentloaded'}),en.page.reload({waitUntil:'domcontentloaded'})]);
  await pl.page.locator('html[data-ready="true"][data-i18n-ready="pl"]').waitFor({timeout:30000});
  await en.page.locator('html[data-ready="true"][data-i18n-ready="en"]').waitFor({timeout:30000});
  console.log('LIVE TWO-DEVICE LANGUAGE: PASS independent PL/EN preferences persist.');

  // Checklist templates: seed one disposable preview item, create two templates from its category,
  // rename one, apply both with zero duplicates, then remove templates and the disposable item.
  const page=pl.page,api=async(path,options={})=>{
    const {body,...rest}=options;
    const response=await pl.context.request.fetch(base+path,{...rest,data:body===undefined?undefined:JSON.parse(body),headers:{origin:base,'content-type':'application/json',...(options.headers||{})}});
    const data=await response.json();assert.ok(response.ok(),`${options.method||'GET'} ${path}: ${response.status()} ${JSON.stringify(data)}`);return data;
  };
  const boot=await api('/api/bootstrap'),trip=boot.trips.find(t=>t.id===boot.app.activeTripId)||boot.trips.find(t=>t.status!=='archived')||boot.trips[0];
  const cats=(await api('/api/checklist-categories')).categories.filter(c=>c.active);assert.ok(cats.length,'preview must have an active checklist category');
  const stamp=Date.now(),seedLabel='QA template seed '+stamp,nameA='QA template A '+stamp,nameB='QA template B '+stamp,renamed=nameA+' edited';
  const seed=(await api('/api/checklist',{method:'POST',body:JSON.stringify({tripId:trip.id,category:cats[0].name,label:seedLabel,packed:false})})).id;
  await page.goto(base+'/pages/checklisty.html',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('html[data-ready="true"]').waitFor({timeout:30000});
  await page.locator('#checklist-templates').waitFor({timeout:30000});
  for(const box of await page.locator('#template-categories input').all())await box.uncheck();
  await page.locator('#template-categories input').first().check();
  const create=async name=>{
    await page.locator('#template-name').fill(name);
    await page.locator('#template-create button[type="submit"]').click();
    await page.waitForFunction(()=>document.getElementById('template-message')?.textContent.trim().length>0,null,{timeout:30000});
    const message=await page.locator('#template-message').innerText();assert.match(message,/Zapisano szablon/i,`template creation failed: ${message}`);
    await page.locator('.template-card').filter({hasText:name}).waitFor({timeout:30000});
  };
  try{
  await create(nameA);await create(nameB);
  const cardA=page.locator('.template-card').filter({hasText:nameA});
  await cardA.locator('summary').click();
  await cardA.locator('input[name="name"]').fill(renamed);
  await cardA.getByRole('button',{name:'Zapisz szablon',exact:true}).click();
  await page.locator('.template-card').filter({hasText:renamed}).waitFor({timeout:30000});
  for(const name of [renamed,nameB]){
    const card=page.locator('.template-card').filter({hasText:name});
    if(!(await card.evaluate(e=>e.open)))await card.locator(':scope > summary').click();
    await card.locator('.template-select').check();
  }
  await page.locator('#template-apply').click();
  await page.locator('#template-message').filter({hasText:'Dodano 0'}).waitFor({timeout:30000});
  for(const name of [renamed,nameB]){
    const card=page.locator('.template-card').filter({hasText:name});
    if(!(await card.evaluate(e=>e.open)))await card.locator('summary').click();
    page.once('dialog',d=>d.accept());
    await card.getByRole('button',{name:'Usuń szablon',exact:true}).click();
    await card.waitFor({state:'detached',timeout:30000});
  }
  console.log('LIVE CHECKLIST TEMPLATES: PASS create/rename/apply-multiple/dedupe/delete through UI.');
  }finally{await api(`/api/checklist/${seed}?tripId=${encodeURIComponent(trip.id)}`,{method:'DELETE',body:'{}'}).catch(()=>{});}

  // Participant profile: persist one reversible change and restore it.
  await page.goto(base+'/pages/ustawienia.html',{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('html[data-ready="true"]').waitFor({timeout:30000});
  await page.locator('#participant-profile-list .participant-profile').first().waitFor({timeout:30000});
  const bootstrap=await page.request.get(base+'/api/bootstrap').then(r=>r.json());
  const person=bootstrap.anglers[0],form=page.locator('.participant-profile').filter({has:page.getByRole('heading',{name:person.name,exact:true})});
  const language=form.locator('select'),original=person.defaultLanguage,next=original==='pl'?'en':'pl';
  await language.selectOption(next);await form.locator('button[type="submit"]').click();
  await page.getByText('Profil zapisany.',{exact:true}).waitFor({timeout:30000});
  let changed=await page.request.get(base+'/api/bootstrap').then(r=>r.json());
  assert.equal(changed.anglers.find(a=>a.id===person.id).defaultLanguage,next);
  const refreshedForm=page.locator('.participant-profile').filter({has:page.getByRole('heading',{name:person.name,exact:true})});
  await refreshedForm.locator('select').selectOption(original);await refreshedForm.locator('button[type="submit"]').click();
  await page.getByText('Profil zapisany.',{exact:true}).waitFor({timeout:30000});
  changed=await page.request.get(base+'/api/bootstrap').then(r=>r.json());
  assert.equal(changed.anglers.find(a=>a.id===person.id).defaultLanguage,original);
  console.log('LIVE PARTICIPANT PROFILE: PASS reversible edit/persist/reload/restore.');

  // No credentials are persisted in browser storage.
  const storage=await page.evaluate(async()=>({local:{...localStorage},session:{...sessionStorage},cookies:document.cookie,cacheKeys:await caches.keys()}));
  assert.ok(!Object.keys(storage.local).some(k=>/password|username|credential|secret/i.test(k)));
  assert.ok(!Object.keys(storage.session).some(k=>/password|username|credential|secret/i.test(k)));
  assert.ok(!/ryby_session=/i.test(storage.cookies),'session cookie must remain HttpOnly');
  console.log('LIVE STORAGE SAFETY: PASS no credential/session exposure in web storage or document.cookie.');

  await pl.context.close();await en.context.close();
}finally{await browser.close();}
