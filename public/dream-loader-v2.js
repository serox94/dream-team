(async () => {
  const VERSION='20261008-10';
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`/${src}?v=${VERSION}`;s.onload=resolve;s.onerror=()=>reject(new Error(`Nie udało się wczytać ${src}.`));document.body.append(s);});
  try{
    await loadScript('dream-core.js');
    const model=await Dream.api('/api/bootstrap');
    const trip=model.trips.find(t=>t.id===Dream.readTrip())||model.trips.find(t=>t.id===model.app.activeTripId)||model.trips.find(t=>t.status!=='archived')||model.trips[0];
    if(!trip)throw new Error('Brak wyjazdów w bazie.');
    window.DREAM_MODEL=model;window.DREAM_TRIP=trip;window.DREAM_VIEWED_TRIP_ID=trip.id;
    Dream.renderHeader();
    const categorySelect=document.getElementById('check-category');
    if(categorySelect){
      const {categories}=await Dream.api('/api/checklist-categories');
      window.DREAM_CATEGORIES=categories;
      categorySelect.replaceChildren(...categories.filter(c=>c.active).map(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;return o;}));
    }
    const person=document.getElementById('person');
    if(person){person.replaceChildren(...trip.participants.map(a=>{const o=document.createElement('option');o.value=a.name;o.textContent=a.name;return o;}));}
    const assigned=document.getElementById('check-assigned');
    if(assigned){for(const member of trip.participants){const option=document.createElement('option');option.value=member.name;option.textContent=member.name;assigned.append(option);}}
    document.querySelectorAll('.main-nav a').forEach(a=>{
      const normalize=p=>p.replace(/\/index(?:\.html)?$/,'/').replace(/\.html$/,'').replace(/\/$/,'');
      const active=normalize(new URL(a.href).pathname)===normalize(location.pathname);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    await loadScript('d1-api-compat.js');
    await loadScript('app.js');
    await loadScript('app-plus.js');
    await loadScript('field-mode.js');
    if(document.getElementById('trip-score-charts'))await loadScript('dashboard-chart.js');
    await loadScript('trip-renderer-v2.js');
    const documents=await Dream.api(`/api/documents?tripId=${encodeURIComponent(trip.id)}`).then(d=>d.documents);
    window.DREAM_DOCUMENTS=documents;
    await window.DreamTripRenderer.render({model,trip,documents});
    window.initDreamPlus();
    if(document.getElementById('weather-current-temp'))await loadScript('fixes.js');
    if(document.getElementById('trip-manager'))await loadScript('trip-manager.js');
    await window.initDreamApp();
    if(document.body.dataset.page==='teren')await loadScript('trip-notes.js');
    if(document.body.dataset.page==='checklisty')await loadScript('checklist-templates.js');
    if(document.querySelector('.location-photo-card'))await loadScript('trip-peg-enhancer.js');
    document.documentElement.dataset.ready='true';
    Dream.registerShell();
    document.dispatchEvent(new Event('dream:ready'));
  }catch(error){
    console.error('Dream Team bootstrap failed:',error);
    if(window.Dream)Dream.notice(`Nie udało się wczytać aplikacji: ${error.message} Odśwież stronę.`,true);
    const box=document.querySelector('.trip-box');if(box)box.textContent='Błąd wczytywania danych';
    document.querySelectorAll('form button').forEach(b=>b.disabled=true);
    document.documentElement.dataset.ready='error';
  }
})();
