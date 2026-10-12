// Stage 1: genuine UI CRUD against disposable preview trips; no Tavily/AI requests.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const base='https://dream-team-preview.sewerynski00.workers.dev';
export async function verifyNavigation(page,context){
 const config=JSON.parse(await readFile('wrangler.preview.generated.jsonc','utf8'));
 assert.equal(config.name,'dream-team-preview');assert.equal(config.d1_databases[0].database_name,'dream-team-preview-db');
 assert.notEqual(config.d1_databases[0].database_id,'b64c7a2c-8694-41c6-b54a-857b88bf2c96');
 const request=async(path)=>{const response=await context.request.get(base+path,{timeout:15000});assert.ok(response.ok());return response.json();};
 const d1=async(sql,params)=>{const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${config.d1_databases[0].database_id}/query`,{method:'POST',headers:{authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)});const result=await response.json();assert.equal(result.success,true);return result.result[0];};
 const open=async route=>{await page.goto(base+route,{waitUntil:'commit',timeout:30000});await page.locator('html[data-ready="true"]').waitFor({timeout:30000});};
 await mkdir('live-preview-qa',{recursive:true});
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});await open('/pages/wyjazdy.html');
  assert.equal(await page.locator('#angler-edit,#lake-edit,#ryby-logout,#backup-download,.language-selector').count(),0,'no administration or duplicate language controls on Trips');
  for(const name of ['Aktualny wyjazd','Nadchodzące wyjazdy','Zakończone wyjazdy','Archiwum'])await page.getByRole('heading',{name,exact:true}).waitFor();
  await page.locator('[data-view-lake]').first().click();await page.locator('#lake-profile h3').waitFor();
  assert.equal(await page.locator('#lake-profile form').count(),0,'trip lake details are read-only');
  await page.screenshot({path:`live-preview-qa/navigation-trips-${width}.png`});
  await open('/pages/ustawienia.html');assert.equal(await page.locator('.language-selector').count(),1);
  for(const control of ['#angler-edit','#ryby-logout','#settings-export','#participant-profile-list','#system-health','#lake-catalog'])await page.locator(control).waitFor({state:'visible'});
  await page.locator('#lake-editor-panel > summary').click();await page.locator('#lake-edit').waitFor({state:'visible'});
  await page.screenshot({path:`live-preview-qa/navigation-settings-${width}.png`});
  const before=await request('/api/bootstrap');let tripId;const name=`QA navigation ${width} ${Date.now()}`;
  try{
   await open('/pages/wyjazdy.html');await page.locator('#create-trip').click();
   await page.locator('[name="lake-mode"][value="existing"]').check();await page.locator('#wizard-lake-id').selectOption(before.lakes[0].id);
   await page.locator('#wizard-start').fill('2031-06-01');await page.locator('#wizard-end').fill('2031-06-08');await page.locator('#wizard-trip-name').fill(name);
   const created=page.waitForResponse(r=>r.url()===base+'/api/trips'&&r.request().method()==='POST');await page.locator('#trip-wizard-form [type="submit"]').click();const response=await created;assert.equal(response.status(),201);tripId=(await response.json()).id;
   const card=page.locator('.trip-card').filter({has:page.getByRole('heading',{name,exact:true})});await card.waitFor();await card.locator('[data-edit]').click();await page.locator('#trip-peg').fill(`QA swim ${width}`);
   const updated=page.waitForResponse(r=>r.url()===base+'/api/trips/'+tripId&&r.request().method()==='PUT');await page.locator('#trip-edit [type="submit"]').click();assert.equal((await updated).status(),200);
   assert.equal((await request('/api/bootstrap')).trips.find(t=>t.id===tripId).peg,`QA swim ${width}`);
   await card.locator('[data-edit]').click();await page.locator('#trip-edit [name="status"]').selectOption('archived');
   const archived=page.waitForResponse(r=>r.url()===base+'/api/trips/'+tripId&&r.request().method()==='PUT');await page.locator('#trip-edit [type="submit"]').click();assert.equal((await archived).status(),200);
   assert.equal((await request('/api/bootstrap')).trips.find(t=>t.id===tripId).status,'archived');
   console.log(`LIVE NAVIGATION ${width}: PASS Settings language/catalogue/participants/PB/system; Trips create/edit/archive/read-only lake details.`);
  }finally{
   if(tripId){
    const counts=await d1('SELECT (SELECT COUNT(*) FROM catches WHERE trip_id=?) + (SELECT COUNT(*) FROM checklist_items WHERE trip_id=?) + (SELECT COUNT(*) FROM spots WHERE trip_id=?) AS n',[tripId,tripId,tripId]);assert.equal(counts.results[0].n,0,'disposable trip must have no user records');
    await d1('DELETE FROM trip_participants WHERE trip_id=? AND EXISTS(SELECT 1 FROM trips WHERE id=? AND name=?)',[tripId,tripId,name]);
    const removed=await d1('DELETE FROM trips WHERE id=? AND name=?',[tripId,name]);assert.equal(removed.meta.changes,1,'remove only exact disposable QA trip');
   }
  }
 }
}
