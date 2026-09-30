import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {serve} from '../scripts/qa-server.mjs';
import {weatherFixture} from '../scripts/qa-weather.mjs';
const waitFor=async(fn,label='condition')=>{const until=Date.now()+7000;while(!fn()){if(Date.now()>until)throw Error('Timed out: '+label);await new Promise(r=>setTimeout(r,15));}};
async function page(server,path,trip='next-trip',failure=null){
 const errors=[],calls=[],console=new VirtualConsole();console.on('jsdomError',e=>{if(!/canvas|getContext|navigation/.test(e.message))errors.push(e.message);});console.on('error',(...v)=>{const message=v.join(' ');if(!message.includes("Failed to create chart: can't acquire context"))errors.push(message);});
 const dom=await JSDOM.fromURL(server.url+path,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:console,beforeParse(w){
  w.localStorage.setItem('dream_team_viewed_trip',trip);w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.confirm=()=>true;w.alert=()=>{};
  w.AbortController=AbortController;w.AbortSignal=AbortSignal;w.ResizeObserver=class{observe(){}disconnect(){}};
  w.fetch=async(url,opts)=>{calls.push({url:String(url),method:opts?.method||'GET'});if(failure&&String(url).includes(failure))return new Response('{"ok":false,"error":"Offline test"}',{status:503});return fetch(new URL(url,server.url),opts);};
 }});
 await waitFor(()=>dom.window.document.documentElement.dataset.ready,'page '+path);
 return {dom,w:dom.window,d:dom.window.document,errors,calls,close(){dom.window.close();}};
}
const testServe=options=>serve({...options,weatherFetch:async()=>Response.json(weatherFixture())});
const submit=(p,id)=>p.d.getElementById(id).dispatchEvent(new p.w.Event('submit',{bubbles:true,cancelable:true}));
const fill=(p,id,value)=>{const el=p.d.getElementById(id);el.value=value;el.dispatchEvent(new p.w.Event('input',{bubbles:true}));};
test('every route boots, preserves legacy knowledge, sends no duplicate initial data requests',async()=>{
 const s=await testServe({seed:true});
 try{for(const path of ['/','/pages/wyjazdy.html','/pages/polowy.html','/pages/checklisty.html','/pages/mapa.html','/pages/teren.html','/pages/pogoda.html','/pages/dojazd.html','/pages/regulamin.html','/pages/wezly.html','/pages/rigi.html','/pages/porady.html']){
  const p=await page(s,path);try{assert.equal(p.d.documentElement.dataset.ready,'true',path+': '+p.errors.join(';'));assert.deepEqual(p.errors,[],path);assert.ok(p.d.querySelector('main').textContent.length>80);assert.equal(p.calls.filter(x=>x.url==='/api/bootstrap').length,1);
   if(path==='/'){assert.equal(p.d.getElementById('total-fish').textContent,'2');assert.equal(p.d.getElementById('angler-maciek-pb-text').textContent,'18.0 kg');}
   if(path.includes('checklisty'))assert.equal(p.d.getElementById('check-all-count').textContent,'2');
   if(path.includes('pogoda')){
    assert.equal(p.calls.filter(x=>x.url.startsWith('/api/weather?tripId=next-trip')).length,1);
    assert.equal(p.d.getElementById('weather-current-temp').textContent,'15.0°C');
   }
  }finally{p.close();}
 }}finally{await s.close();}
});
test('shared mobile navigation opens the full menu and follows the current screen',async()=>{
 const s=await testServe({seed:true}),p=await page(s,'/pages/checklisty.html');
 try{
  assert.equal(p.d.querySelector('.bottom-nav [aria-current="page"]')?.dataset.page,'checklisty');
  const more=p.d.getElementById('bottom-more'),menu=p.d.getElementById('main-nav');
  more.click();assert.equal(more.getAttribute('aria-expanded'),'true');assert.ok(menu.classList.contains('open'));
  p.d.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(more.getAttribute('aria-expanded'),'false');assert.ok(!menu.classList.contains('open'));
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('dashboard leads with the selected trip, live weather and checklist progress',async()=>{
 const s=await testServe({seed:true}),p=await page(s,'/');
 try{
  assert.notEqual(p.d.getElementById('dashboard-trip-name').textContent,'Wczytywanie wyjazdu…');
  assert.ok(p.d.getElementById('dashboard-lake').textContent.length>2);
  await waitFor(()=>p.d.getElementById('dashboard-check-progress').textContent==='1/2','checklist overview');
  await waitFor(()=>p.d.querySelector('#dashboard-alerts')?.textContent.includes('15°C'),'weather overview');
  assert.match(p.d.getElementById('dashboard-weather-now').textContent,/15°C/);
  assert.match(p.d.getElementById('dashboard-check-inline').textContent,/1 z 2/);
  assert.equal(p.d.querySelector('.dashboard-primary-stats #total-fish').textContent,'2');
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('trip score uses two independent scales, a personal photo, readiness and stored assignments',async()=>{
 const s=await testServe({seed:true});
 s.DB.sqlite.exec("UPDATE checklist_items SET assigned_to='Maciek' WHERE label='Testowy podbierak'");
 const p=await page(s,'/');
 try{
  assert.match(p.d.querySelector('.hero-side-card img').src,/patryk-maciek\.jpeg$/);
  assert.equal(p.d.querySelectorAll('.score-chart').length,2);
  assert.equal(p.d.querySelectorAll('.score-row').length,4);
  assert.match(p.d.getElementById('trip-score-total').textContent,/2 ryb.*23,0 kg/);
  assert.deepEqual([...p.d.querySelectorAll('.score-chart h4')].map(x=>x.textContent),['Liczba ryb','Łączna waga']);
  assert.equal(p.d.body.dataset.fieldMode,'before');
  assert.match(p.d.getElementById('field-readiness').textContent,/50%/);
  assert.match(p.d.getElementById('field-readiness').textContent,/Maciek.*1\/1/);
  assert.match(p.d.getElementById('field-readiness').textContent,/Wspólne.*0\/1/);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('field mode follows active trip dates and guide reads the selected lake facts',async()=>{
 const s=await testServe({seed:true});
 s.DB.sqlite.prepare("UPDATE trips SET start_at=?,end_at=? WHERE id='next-trip'").run(new Date(Date.now()-86400000).toISOString(),new Date(Date.now()+86400000).toISOString());
 const dashboard=await page(s,'/');
 try{
  assert.equal(dashboard.d.body.dataset.fieldMode,'field');
  assert.match(dashboard.d.getElementById('dashboard-status').textContent,/Na łowisku/);
  assert.ok(dashboard.d.querySelector('.hero-actions a[href="/pages/teren.html"]'));
  assert.match(dashboard.d.getElementById('field-readiness').textContent,/Checklista na łowisku/);
  assert.deepEqual(dashboard.errors,[]);
 }finally{dashboard.close();}
 const guide=await page(s,'/pages/teren.html');
 try{
  assert.match(guide.d.querySelector('main').textContent,/Najważniejsze nad wodą/);
  assert.match(guide.d.querySelector('main').textContent,/Dozwolone wędki|Łódka zanętowa/);
  assert.ok(guide.d.querySelector('a[href^="https://www.google.com/maps/search/"]'));
  assert.deepEqual(guide.errors,[]);
 }finally{guide.close();await s.close();}
});
test('private read cache marks stale data, never queues writes and clears locally',async()=>{
 const s=await testServe({seed:true}),p=await page(s,'/');
 try{
  const before=s.DB.sqlite.prepare('SELECT count(*) n FROM checklist_items').get().n;
  assert.ok(p.w.localStorage.getItem('ryby_read_cache_v1'));
  p.w.fetch=async()=>{throw new TypeError('network offline');};
  const model=await p.w.Dream.api('/api/bootstrap');assert.equal(model.app.activeTripId,'next-trip');
  const checklist=await p.w.Dream.api('/api/checklist?tripId=next-trip');assert.equal(checklist.items.length,2);
  assert.match(p.d.getElementById('offline-banner').textContent,/Dane offline \/ ostatnia synchronizacja/);
  await assert.rejects(p.w.Dream.api('/api/checklist',{method:'POST',body:'{}'}),/Brak połączenia/);
  assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM checklist_items').get().n,before);
  p.w.Dream.clearReadCache();
  assert.equal(p.w.localStorage.getItem('ryby_read_cache_v1'),null);
  await assert.rejects(p.w.Dream.api('/api/bootstrap'),/Brak połączenia/);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('trip management reveals the editor on demand and checklist opens with the list',async()=>{
 const s=await testServe({seed:true});
 try{
  const p=await page(s,'/pages/wyjazdy.html');
  try{
   const panel=p.d.getElementById('trip-editor-panel');assert.equal(panel.open,false);
   p.d.getElementById('create-trip').click();assert.equal(panel.open,true);
   p.d.querySelector('[data-edit]').click();assert.equal(panel.open,true);
   assert.deepEqual(p.errors,[]);
  }finally{p.close();}
  const checklist=await page(s,'/pages/checklisty.html');
  try{assert.ok(checklist.d.getElementById('checklist-groups').compareDocumentPosition(checklist.d.getElementById('checklist-form')) & checklist.w.Node.DOCUMENT_POSITION_FOLLOWING);}
  finally{checklist.close();}
 }finally{await s.close();}
});
test('checklist edit preserves packed state, filters, quantity clear and undo persist',async()=>{
 const s=await testServe({seed:true}),p=await page(s,'/pages/checklisty.html');
 try{
  p.d.querySelector('[data-filter="done"]').click();await waitFor(()=>p.d.querySelectorAll('.check-item-row').length===1,'done filter');
  p.d.querySelector('.check-item-row .edit-btn').click();await waitFor(()=>p.d.getElementById('edit-check-id').value);
  fill(p,'check-name','Nowa nazwa');fill(p,'check-quantity','');fill(p,'check-assigned','Maciek');submit(p,'checklist-form');
  await waitFor(()=>p.d.getElementById('checklist-message').textContent==='Zmiany zapisane.');
  const row=s.DB.sqlite.prepare('SELECT * FROM checklist_items WHERE label=?').get('Nowa nazwa');assert.equal(row.packed,1);assert.equal(row.quantity,null);assert.equal(row.assigned_to,'Maciek');
  await waitFor(()=>p.d.querySelector('.check-item-title')?.textContent==='Nowa nazwa');p.d.querySelector('.check-item-row .danger-btn').click();
  await waitFor(()=>p.d.querySelector('#app-notice button'));assert.ok(s.DB.sqlite.prepare('SELECT deleted_at FROM checklist_items WHERE id=?').get(row.id).deleted_at);
  p.d.querySelector('#app-notice button').click();await waitFor(()=>p.d.getElementById('app-notice').textContent==='Wpis przywrócony.');assert.equal(s.DB.sqlite.prepare('SELECT deleted_at FROM checklist_items WHERE id=?').get(row.id).deleted_at,null);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('catch form persists once on double submit, timezone and correction are preserved',async()=>{
 const s=await testServe({seed:true}),p=await page(s,'/pages/polowy.html');
 try{
  fill(p,'person','Patryk');fill(p,'weight','19.25');fill(p,'bait','kulka');fill(p,'caught_at','2026-09-03T12:30');submit(p,'catch-form');submit(p,'catch-form');
  await waitFor(()=>p.d.getElementById('form-message').textContent.includes('dodany'));
  await waitFor(()=>p.d.getElementById('catch-count').textContent==='3'&&!p.d.getElementById('catch-form').dataset.saving,'po zapisie');
  const rows=s.DB.sqlite.prepare('SELECT * FROM catches WHERE weight_kg=19.25').all();assert.equal(rows.length,1);assert.equal(rows[0].caught_at,'2026-09-03T10:30:00.000Z');
  await p.w.editCatch(rows[0].id);fill(p,'weight','12');fill(p,'note','');submit(p,'catch-form');
  await waitFor(()=>p.d.getElementById('form-message').textContent==='Zmiany zapisane.');
  const model=await(await fetch(s.url+'/api/bootstrap')).json();assert.equal(model.anglers.find(a=>a.id==='patryk').pbKg,13);assert.equal(s.DB.sqlite.prepare('SELECT notes FROM catches WHERE id=?').get(rows[0].id).notes,null);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('signed session saves checklist without exposing credentials to frontend storage',async()=>{
 const s=await testServe(),p=await page(s,'/pages/checklisty.html');
 try{
  fill(p,'check-name','Namiot chroniony');submit(p,'checklist-form');
  await waitFor(()=>p.d.getElementById('checklist-message').textContent.includes('dodana'));
  assert.equal(p.w.sessionStorage.length,0);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM checklist_items WHERE label=?').get('Namiot chroniony').n,1);
  assert.equal(s.requests.filter(r=>r.method==='POST'&&r.url==='/api/checklist').map(r=>r.status).join(','),'201');
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('management screen offers logout and revokes the active device session',async()=>{
 const s=await testServe(),p=await page(s,'/pages/wyjazdy.html');
 try{
  const deleted=[];p.w.caches={keys:async()=>['ryby-shell-old','unrelated'],delete:async key=>{deleted.push(key);return true;}};
  const button=p.d.getElementById('ryby-logout');assert.ok(button);button.click();
  await waitFor(()=>s.requests.some(r=>r.url==='/api/logout'&&r.status===200),'logout request');
  await waitFor(()=>deleted.includes('ryby-shell-old'),'offline shell removal');
  assert.deepEqual(deleted,['ryby-shell-old']);
  assert.equal(p.w.localStorage.getItem('ryby_read_cache_v1'),null);
  const denied=await fetch(s.url+'/api/export');assert.equal(denied.status,401);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('management page downloads a complete JSON backup through the Worker without writing rows',async()=>{
 const s=await testServe({seed:true}),p=await page(s,'/pages/wyjazdy.html');
 try{
  let content=null,filename=null;
  p.w.URL.createObjectURL=blob=>{content=blob;return 'blob:ryby-test';};
  p.w.URL.revokeObjectURL=()=>{};
  p.w.HTMLAnchorElement.prototype.click=function(){filename=this.download;};
  p.d.getElementById('backup-download').click();
  await waitFor(()=>content&&filename,'backup download');
  assert.match(filename,/^dream-team-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const data=JSON.parse(await content.text());
  assert.equal(data.tables.catches.length,2);
  assert.equal(s.requests.filter(r=>r.url==='/api/export'&&r.status===200).length,1);
  assert.equal(s.DB.sqlite.prepare('SELECT COUNT(*) n FROM catches').get().n,2);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
test('new participant and year can be managed in UI; no date fallback; lake knowledge isolated',async()=>{
 const s=await testServe(),p=await page(s,'/pages/wyjazdy.html');
 try{
  fill(p,'angler-name','Ania');fill(p,'angler-pb','7.5');submit(p,'angler-edit');await waitFor(()=>p.d.querySelector('.participant-options')?.textContent.includes('Ania'));
  fill(p,'trip-name','Wspólny wyjazd 2029');fill(p,'trip-year','2029');fill(p,'trip-lake','wygonin');submit(p,'trip-edit');
  await waitFor(()=>[...p.d.querySelectorAll('[data-edit]')].length===5);
  const t=s.DB.sqlite.prepare('SELECT * FROM trips WHERE name=?').get('Wspólny wyjazd 2029');assert.equal(t.start_at,null);assert.equal(t.year,2029);
  const q=await page(s,'/',t.id);try{assert.match(q.d.getElementById('countdown').textContent,/ustalenia/);assert.equal(q.d.querySelectorAll('#angler-stats .panel-card').length,3);}finally{q.close();}
  const r=await page(s,'/pages/regulamin.html',t.id);try{assert.ok(!r.d.querySelector('main').textContent.includes('Plaine 2'));}finally{r.close();}
  const k=await page(s,'/pages/wezly.html',t.id);try{assert.ok([...k.d.querySelectorAll('[data-lake-only]')].every(el=>el.hidden));}finally{k.close();}
 }finally{p.close();await s.close();}
});
test('failed backend read displays error rather than an empty successful app',async()=>{
 const s=await testServe(),p=await page(s,'/pages/polowy.html','next-trip','/api/catches');
 try{assert.equal(p.d.documentElement.dataset.ready,'error');assert.match(p.d.getElementById('app-notice').textContent,/Offline test/);assert.ok(p.d.getElementById('save-catch-btn').disabled);}finally{p.close();await s.close();}
});
test('lake timezone conversion and daylight-saving gap rejection',async()=>{
 const s=await testServe(),p=await page(s,'/pages/polowy.html');
 try{assert.equal(p.w.Dream.dateInput('2026-11-14T11:00:00Z'),'2026-11-14T12:00');assert.equal(p.w.Dream.fromInput('2026-11-14T12:00'),'2026-11-14T11:00:00.000Z');assert.throws(()=>p.w.Dream.fromInput('2026-03-29T02:30'));}finally{p.close();await s.close();}
});
test('spot form CRUD retains optional values and renders user notes as text, never HTML',async()=>{
 const s=await testServe(),p=await page(s,'/pages/mapa.html');
 try{
  const markup='<img src=x onerror=alert(1)>';
  fill(p,'spot-name','Testowy spot');fill(p,'spot-depth','4.5');fill(p,'spot-obstacles',markup);submit(p,'spot-form');
  await waitFor(()=>p.d.querySelector('.spot-card'));assert.equal(p.d.querySelector('img[src="x"]'),null);assert.ok(p.d.querySelector('.spot-meta-grid').textContent.includes(markup));
  p.d.querySelector('.spot-card .edit-btn').click();await waitFor(()=>p.d.getElementById('edit-spot-id').value);fill(p,'spot-depth','');fill(p,'spot-obstacles','');submit(p,'spot-form');
  await waitFor(()=>p.d.getElementById('spot-message').textContent==='Zmiany zapisane.'&&p.d.querySelector('.spot-card .catch-badges')?.textContent.includes('Głębokość: brak'));assert.equal(s.DB.sqlite.prepare('SELECT depth_m FROM spots').get().depth_m,null);
  p.d.querySelector('.spot-card .danger-btn').click();await waitFor(()=>p.d.querySelector('#app-notice button'));p.d.querySelector('#app-notice button').click();await waitFor(()=>p.d.getElementById('app-notice').textContent==='Wpis przywrócony.');assert.equal(s.DB.sqlite.prepare('SELECT count(*) n FROM spots WHERE deleted_at IS NULL').get().n,1);
  assert.deepEqual(p.errors,[]);
 }finally{p.close();await s.close();}
});
