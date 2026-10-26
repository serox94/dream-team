(async () => {
  const VERSION='20261021-pro2-1';
  const loadScript=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=`/${src}?v=${VERSION}`;s.onload=resolve;s.onerror=()=>reject(new Error(`Nie udało się wczytać ${src}.`));document.body.append(s);});
  try{
    await loadScript('dream-core.js');
    await loadScript('app-shell.js');
    const model=await Dream.api('/api/bootstrap');
    if(model.currentUser&&window.DreamLanguage?.activate(model.currentUser)){location.reload();return;}
    const trip=model.trips.find(t=>t.id===Dream.readTrip())||model.trips.find(t=>t.id===model.app.activeTripId)||model.trips.find(t=>t.status!=='archived')||model.trips[0];
    if(!trip)throw new Error('Brak wyjazdów w bazie.');
    window.DREAM_MODEL=model;window.DREAM_TRIP=trip;window.DREAM_VIEWED_TRIP_ID=trip.id;
    await loadScript('domain-glossary.js');
    await loadScript('content-translations.js');
    await window.DreamContent.load();
    Dream.renderHeader();
    const categorySelect=document.getElementById('check-category');
    if(categorySelect){
      const {categories}=await Dream.api('/api/checklist-categories');
      window.DREAM_CATEGORIES=categories;
      categorySelect.replaceChildren(...categories.filter(c=>c.active).map(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=window.DreamContent?.category(c.name)??c.name;return o;}));
    }
    const person=document.getElementById('person');
    if(person){const authors=[...trip.participants,...model.anglers.filter(a=>a.login&&!trip.participants.some(p=>p.id===a.id))];person.replaceChildren(...authors.map(a=>{const o=document.createElement('option');o.value=a.name;o.textContent=a.name;o.defaultSelected=a.id===model.currentUser?.anglerId;return o;}));}
    const assigned=document.getElementById('check-assigned');
    if(assigned){for(const member of trip.participants){const option=document.createElement('option');option.value=member.name;option.textContent=member.name;assigned.append(option);}}
    document.querySelectorAll('.main-nav a').forEach(a=>{
      const normalize=p=>p.replace(/\/index(?:\.html)?$/,'/').replace(/\.html$/,'').replace(/\/$/,'');
      const active=normalize(new URL(a.href).pathname)===normalize(location.pathname);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
    });
    await loadScript('d1-api-compat.js');
    await loadScript('app.js');
    if(document.getElementById('dashboard-weather-now')||document.getElementById('weather-current-temp'))await loadScript('weather-conditions.js');
    if(document.getElementById('dashboard-weather-now')||document.getElementById('weather-current-temp'))await loadScript('weather-fishing-insights.js');
    await loadScript('trip-photos.js');
    if(document.getElementById('pro2')){await loadScript('vendor/suncalc.js');await loadScript('carp-index.js');await loadScript('weather-pro2.js');}
    await loadScript('app-plus.js');
    await loadScript('field-mode.js');
    if(document.getElementById('trip-score-charts'))await loadScript('dashboard-chart.js');
    // Lake evidence is stored independently of legacy trip documents.
    // Load it only on the rules page and never overwrite saved trip data.
    const rulesPage=/\/pages\/regulamin(?:\.html)?$/.test(location.pathname);
    const requestedLakeId=rulesPage?new URLSearchParams(location.search).get('lakeId'):null;
    const selectedLake=requestedLakeId?model.lakes.find(l=>l.id===requestedLakeId):null;
    let lakeResearch=null,lakeResearchError=null;
    if(rulesPage){
      try{
        if(requestedLakeId&&!selectedLake)throw Error(document.documentElement.lang==='en'?'Fishery not found.':'Nie znaleziono łowiska.');
        const id=selectedLake?.id||trip.lakeId;
        if(id)lakeResearch=await Dream.api(`/api/lakes/${encodeURIComponent(id)}/manager${!selectedLake?'?tripId='+encodeURIComponent(trip.id):''}`);
      }catch(error){lakeResearchError=error.message;}
    }
    await loadScript('trip-renderer-v2.js');
    const documents=await Dream.api(`/api/documents?tripId=${encodeURIComponent(trip.id)}`).then(d=>d.documents);
    window.DREAM_DOCUMENTS=documents;
    await window.DreamTripRenderer.render({model,trip,documents,lakeResearch,lakeResearchError,selectedLake});
    window.initDreamPlus();
    if(document.getElementById('weather-current-temp')){if(!document.getElementById('pro2'))await loadScript('fixes.js');}
    if(document.getElementById('trip-manager')||document.getElementById('settings-management'))await loadScript('trip-manager.js');
    await window.initDreamApp();
    if(document.body.dataset.page==='teren')await loadScript('trip-notes.js');
    if(document.body.dataset.page==='checklisty')await loadScript('checklist-templates.js');
    if(document.querySelector('.location-photo-card'))await loadScript('trip-peg-enhancer.js');
    if(document.getElementById('settings-form')){await loadScript('settings.js');await window.initDreamSettings();await window.DreamContent.editor(document.querySelector('#settings-management')?.parentElement||document.querySelector('main'));}
    await loadScript('lake-manager.js');
    if(document.getElementById('lake-manager'))await DreamLakeManager.mount();
    await DreamLakeManager.loadAdviceWords();
    const profileSections={dojazd:[2,3,4],mapa:[2],teren:[0,3,4],porady:[0,1]};
    if(profileSections[document.body.dataset.page]){try{const p=await Dream.api(`/api/lakes/${encodeURIComponent(trip.lakeId)}/manager?tripId=${encodeURIComponent(trip.id)}`);const host=document.createElement('div');host.className='shared-lake-evidence';document.querySelector('main').append(host);DreamLakeManager.renderProfile(host,p,{section:profileSections[document.body.dataset.page]});}catch(error){Dream.notice(error.message,true);}}
    await loadScript('help-guide.js');DreamHelp.mount();
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
