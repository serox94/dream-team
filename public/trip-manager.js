(async()=>{
  const root=document.getElementById('trip-manager')||document.getElementById('settings-management'),isSettings=root?.id==='settings-management',E=Dream.esc,T=(pl,en)=>window.DreamI18n?.lang==='en'?en:pl;
  const options=(items,current)=>items.map(x=>`<option data-user-content value="${E(x.id)}" ${x.id===current?'selected':''}>${E(x.name)}</option>`).join('');
  const field=(id,label,type='text',value='',extra='')=>`<div><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${E(value??'')}" ${extra}></div>`;
  const area=(id,label,value='')=>`<div><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="4" maxlength="10000">${E(value||'')}</textarea></div>`;
  let availableTemplates=[];
  try{availableTemplates=(await Dream.api('/api/checklist-templates')).templates||[];}catch{}
  const values=form=>Object.fromEntries(new FormData(form));
  const empty=value=>value===''?null:value;
  const chosenZone=lake=>(window.DREAM_MODEL?.app?.timeZonePreference==='auto'?null:window.DREAM_MODEL?.app?.timeZonePreference)||lake?.facts?.timeZone||'Europe/Paris';
  function bind(form,fn){form.addEventListener('submit',async e=>{
    e.preventDefault();if(form.dataset.saving)return;form.dataset.saving='true';root.inert=true;
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{await fn(values(form),form);Dream.notice('Zapisano.');}
    catch(error){Dream.notice(error.message,true);}
    finally{delete form.dataset.saving;button.disabled=false;root.inert=false;}
  });}
  async function refresh(){await Dream.refreshModel();render();}
  function tripEditor(trip=null){
    const m=window.DREAM_MODEL,lake=m.lakes.find(l=>l.id===(trip?.lakeId||new URLSearchParams(location.search).get('lakeId')||window.DREAM_TRIP?.lakeId||m.lakes[0]?.id));
    const zone=chosenZone(lake);
    return `<form id="trip-edit" class="form-grid"><input type="hidden" name="id" value="${E(trip?.id||'')}">
      <h3>${trip?'Edytuj wyjazd':'Nowy wyjazd'}</h3><div class="form-row">
      ${field('trip-name','Nazwa','text',trip?.name||'','required maxlength="150"')}
      ${field('trip-year','Rok','number',trip?.year||new Date().getFullYear(),'required min="2000" max="2200" step="1"')}</div>
      <div><label for="trip-lake">Łowisko</label><select id="trip-lake" name="lakeId" ${trip?'disabled':''}>${options(m.lakes,lake?.id)}</select><small><a href="/pages/wyjazdy.html#fisheries-area">${T('Dodaj łowisko lub kolejne źródła researchu','Add a fishery or more research sources')}</a>. ${T('Wyjazd używa gotowego profilu, bez ponownego researchu.','The trip reuses its saved profile without repeating research.')}</small></div>
      <div class="form-row">${field('trip-start','Początek','datetime-local',trip?.start?Dream.dateInput(trip.start,zone):'')}${field('trip-end','Powrót','datetime-local',trip?.end?Dream.dateInput(trip.end,zone):'')}</div>
      <small id="trip-zone">Godziny łowiska: ${E(zone)}. Termin może pozostać pusty.</small>
      ${field('trip-photos',T('Link do albumu Google Photos','Google Photos album link'),'url',trip?.googlePhotosUrl||'','maxlength="2000" placeholder="https://photos.app.goo.gl/…"')}
      ${field('trip-peg','Stanowisko','text',trip?.peg||'','maxlength="200"')}
      <fieldset><legend>Uczestnicy</legend><div class="participant-options">${m.anglers.map(a=>`<label data-user-content><input type="checkbox" name="participants" value="${E(a.id)}" ${(!trip||trip.participants.some(p=>p.id===a.id))?'checked':''}> ${E(a.name)}</label>`).join('')}</div></fieldset>
      <div><label for="trip-status">Status</label><select id="trip-status" name="status"><option value="planning" ${trip?.status!=='archived'?'selected':''}>Planowany / bieżący</option><option value="archived" ${trip?.status==='archived'?'selected':''}>Archiwum</option></select></div>
      ${trip?'':`<div><label for="trip-copy">Skopiuj checklistę (wszystko jako niespakowane)</label><select id="trip-copy" name="copyChecklistFrom"><option value="">Pusta checklista</option>${options(m.trips,'')}</select></div>${availableTemplates.length?`<fieldset><legend>${T('Dodaj szablony checklisty','Add checklist templates')}</legend><div class="participant-options">${availableTemplates.map(t=>`<label data-user-content><input type="checkbox" name="templateIds" value="${E(t.id)}"> ${E(t.name)}</label>`).join('')}</div><small>${T('Duplikaty są pomijane, wszystkie pozycje będą niespakowane.','Duplicates are skipped; all items start unpacked.')}</small></fieldset>`:''}`}
      <div class="form-actions"><button type="submit">${trip?'Zapisz zmiany':'Utwórz wyjazd'}</button><button type="button" id="trip-new" class="secondary-btn">Wyczyść / nowy wyjazd</button></div></form>`;
  }
  function lakeEditor(lake=null){
    const f=lake?.facts||{},linked=lake?window.DREAM_MODEL.trips.filter(t=>t.lakeId===lake.id):[];
    return `<form id="lake-edit" class="form-grid"><input type="hidden" name="id" value="${E(lake?.id||'')}"><h3>${lake?'Edytuj profil łowiska':'Dodaj łowisko'}</h3><p>Profil jest wspólny dla wszystkich wyjazdów na tę wodę.</p>
      <div class="form-row">${field('lake-name','Nazwa','text',lake?.name,'required maxlength="150"')}${field('lake-country','Kraj','text',lake?.country,'maxlength="100"')}</div>
      <div class="form-row">${field('lake-lat','Szerokość GPS','number',lake?.latitude,'min="-90" max="90" step="any"')}${field('lake-lon','Długość GPS','number',lake?.longitude,'min="-180" max="180" step="any"')}</div>
      ${field('lake-zone','Strefa czasowa','text',f.timeZone||'Europe/Warsaw','required list="timezones"')}<datalist id="timezones"><option value="Europe/Warsaw"><option value="Europe/Paris"><option value="Europe/London"></datalist>
      ${field('lake-location',T('Lokalizacja','Location'),'text',f.location,'maxlength="200"')}
      ${field('lake-address','Adres','text',f.address,'maxlength="500"')}
      ${area('lake-description',T('Opis łowiska','Fishery description'),f.description)}
      <div class="form-row">${field('lake-size','Wielkość wody','text',f.waterSize,'maxlength="200"')}${field('lake-depth','Opis głębokości','text',f.depth,'maxlength="200"')}</div>
      ${field('lake-image','Adres zdjęcia lub mapy','text',lake?.imageUrl,'maxlength="2048" placeholder="https://…"')}
      ${field('lake-map','Adres mapy dna','text',f.mapImage,'maxlength="2000"')}
      ${area('lake-rules','Dodatkowe zasady łowiska',f.rulesText)}
      ${area('lake-logistics','Dojazd i zaplecze',f.logisticsText)}
      ${area('lake-advice','Porady i obserwacje',f.adviceText)}
      <p>${T('Kolejne linki do regulaminów, map i researchu dodajesz w panelu „Uzupełnij lub odśwież profil” powyżej.','Add further URLs for regulations, maps and research in “Add sources or refresh profile” above.')}</p>
      <div class="form-actions"><button type="submit">Zapisz łowisko</button><button type="button" id="lake-new" class="secondary-btn">${T('Dodaj łowisko z wieloma źródłami','Add fishery with multiple sources')}</button>${lake?`<button type="button" id="lake-delete" class="danger-btn" ${linked.length?'disabled':''}>${T('Usuń łowisko','Delete lake')}</button>`:''}</div>${linked.length?`<p class="weather-note">${T('Usuwanie niedostępne: łowisko jest przypisane do','Deletion unavailable: this lake is assigned to')} ${linked.length} ${T('wyjazdów (również archiwalnych). Historia pozostaje bezpieczna.','trips (including archived). Trip history is protected.')}</p>`:''}</form>`;
  }
  function wireTrip(trip=null){
    document.getElementById('trip-editor').innerHTML=tripEditor(trip);
    document.getElementById('trip-new').onclick=()=>wireTrip();
    document.getElementById('trip-lake').onchange=e=>{const lake=window.DREAM_MODEL.lakes.find(l=>l.id===e.target.value);document.getElementById('trip-zone').textContent='Godziny łowiska: '+chosenZone(lake);};
    bind(document.getElementById('trip-edit'),async(x,form)=>{
      const lakeId=trip?.lakeId||x.lakeId,zone=chosenZone(window.DREAM_MODEL.lakes.find(l=>l.id===lakeId));
      const payload={googlePhotosUrl:x['trip-photos']||null,name:x['trip-name'],year:Number(x['trip-year']),lakeId,start:Dream.fromInput(x['trip-start'],zone),end:Dream.fromInput(x['trip-end'],zone),peg:empty(x['trip-peg']),status:x.status,participantIds:[...form.querySelectorAll('[name="participants"]:checked')].map(el=>el.value)};
      if(x.copyChecklistFrom)payload.copyChecklistFrom=x.copyChecklistFrom;
      const templateIds=[...form.querySelectorAll('[name=templateIds]:checked')].map(el=>el.value);if(templateIds.length)payload.templateIds=templateIds;
      await Dream.api('/api/trips'+(x.id?'/'+encodeURIComponent(x.id):''),{method:x.id?'PUT':'POST',body:JSON.stringify(payload)});
      await refresh();
    });
  }
  function wireLake(lake=null){
    const editor=document.getElementById('lake-editor');if(!editor)return;
    editor.innerHTML=lake?lakeEditor(lake):'<p>'+T('Wybierz łowisko z listy powyżej.','Choose a fishery above.')+'</p>';
    if(!lake)return;
    editor.querySelector('form').addEventListener('input',()=>{editor.querySelector('form').dataset.dirty='true';});
    document.getElementById('lake-new').onclick=()=>{const details=document.getElementById('new-lake-panel');if(details){details.open=true;details.scrollIntoView({block:'start'});}};
    const removeButton=document.getElementById('lake-delete');
    if(removeButton)removeButton.onclick=async()=>{
      if(!lake||removeButton.disabled)return;
      const answer=prompt(T('Aby trwale usunąć nieużywane łowisko i jego research, wpisz dokładną nazwę: ','To permanently delete this unused lake and its research, type its exact name: ')+lake.name);
      if(answer!==lake.name){if(answer!==null)Dream.notice(T('Nazwa nie pasuje. Niczego nie usunięto.','Name does not match. Nothing was deleted.'),true);return;}
      removeButton.disabled=true;
      try{await Dream.api('/api/lakes/'+encodeURIComponent(lake.id),{method:'DELETE',body:'{}'});await refresh();Dream.notice(T('Nieużywane łowisko usunięto.','Unused lake deleted.'));}
      catch(error){Dream.notice(error.message,true);removeButton.disabled=false;}
    };
    bind(document.getElementById('lake-edit'),async x=>{
      const saved=await Dream.api('/api/lakes/'+encodeURIComponent(x.id),{method:'PUT',body:JSON.stringify({name:x['lake-name'],country:empty(x['lake-country']),latitude:x['lake-lat']===''?null:Number(x['lake-lat']),longitude:x['lake-lon']===''?null:Number(x['lake-lon']),imageUrl:empty(x['lake-image']),facts:{timeZone:x['lake-zone'],location:x['lake-location'],description:x['lake-description'],address:x['lake-address'],waterSize:x['lake-size'],depth:x['lake-depth'],mapImage:empty(x['lake-map']),rulesText:x['lake-rules'],logisticsText:x['lake-logistics'],adviceText:x['lake-advice']}})});
      await refresh();if(window.DreamLakeManager?.show)await window.DreamLakeManager.show(saved.id);
    });
  }
  function tripWizard(){
    wireTrip();const panel=root.querySelector('#trip-editor-panel');panel.open=true;
    document.getElementById('trip-editor').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function showTripAdvice(tripId){
    const box=root.querySelector('#trip-advice');
    box.hidden=false;box.innerHTML='<h2>Porady dla wyjazdu</h2><p>Przygotowuję wskazówki…</p>';
    box.scrollIntoView({behavior:'smooth',block:'start'});
    try{
      const data=await Dream.api(`/api/trips/${encodeURIComponent(tripId)}/advice`);
      const english=(window.DreamLanguage?.get()||window.DreamI18n?.lang||localStorage.getItem('dreamteam.language')||(/^pl\b/i.test(navigator.language)?'pl':'en'))==='en';
      const words=english?await fetch('/locales/trip-advice.en.json',{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({})):{};
      const t=value=>words[value]||value;
      const restriction=value=>Object.entries(words).filter(([source])=>source.includes('niezweryfikowany:')||source.startsWith('Status łódki')||source.startsWith('Liczba wędek nie jest')).reduce((text,[source,target])=>text.replaceAll(source,target),value).replace(/(Środki pływające|Łódka zanętowa|Leadcore|Regulamin):/g,(_,label)=>t(label)+':');
      const factValue=f=>f.field==='weather'&&english?String(f.value).replace('Prognoza powietrza na początek:','Air forecast at trip start:').replace('°C, wiatr do','°C, wind up to'):f.value;
      const source=f=>f.url?` · <a href="${E(f.url)}" target="_blank" rel="noopener noreferrer">źródło</a>`:'';
      box.innerHTML=`<div class="section-head"><h2>Porady: ${E(data.tripName)}</h2><button type="button" class="secondary-btn" id="close-trip-advice">Zamknij</button></div>
        ${data.incomplete?`<div class="weather-note status-warn"><strong>Brakuje danych do pełnej rekomendacji</strong><ul>${data.missing.map(x=>`<li>${E(t(x))}</li>`).join('')}</ul></div>`:''}
        <div class="trip-advice-grid"><section><h3>Fakty z łowiska / regulaminu</h3><ul>${data.facts.map(f=>`<li><strong>${E(t(f.label||f.field))}:</strong> <span data-user-content>${E(factValue(f))}</span> <small>(${E(t(f.origin))}${f.confidence?' · '+E(t(f.confidence)):''})${source(f)}</small></li>`).join('')}</ul></section>
        <section><h3>Sugestie wędkarskie</h3><p>${E(t(data.disclaimer))}</p><dl>${data.suggestions.map(x=>`<div><dt><strong>${E(t(x.name))}</strong></dt><dd>${E(x.name==='Ograniczenia'?restriction(t(x.value)):t(x.value))} <small>${E(t(x.basis))}${x.reference?` · <a href="${E(x.reference.url)}">Encyklopedia</a>`:''}</small></dd></div>`).join('')}</dl></section></div>`;
      box.querySelector('#close-trip-advice').onclick=()=>{box.hidden=true;box.replaceChildren();};
    }catch(error){box.textContent=error.message;}
  }
  async function trash(){
    const box=document.getElementById('trash-list');box.textContent='Ładowanie…';
    try{
      const {items}=await Dream.api('/api/trash?tripId='+encodeURIComponent(window.DREAM_TRIP.id));
      box.innerHTML=items.length?items.map(x=>`<div class="recovery-row"><span>${E({catches:'Połów',spots:'Spot',checklist:'Checklista'}[x.kind])}: ${E(x.label)}</span><button class="secondary-btn" data-restore="${E(x.kind)}" data-id="${x.id}" type="button">Przywróć</button></div>`).join(''):'Brak usuniętych wpisów w wybranym wyjeździe.';
      box.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await Dream.api(`/api/${b.dataset.restore}/${b.dataset.id}/restore?tripId=${encodeURIComponent(window.DREAM_TRIP.id)}`,{method:'POST',body:'{}'});await refresh();Dream.notice('Wpis przywrócony.');}catch(e){Dream.notice(e.message,true);b.disabled=false;}});
    }catch(e){box.textContent=e.message;}
  }
  function render(){
    const m=window.DREAM_MODEL;
    if(isSettings){
      root.innerHTML=`<section class="panel-card" id="lake-catalog"><h2>${T('Łowiska i research','Fisheries and research')}</h2><p>${T('Łowiska, edycja profili i wszystkie linki do researchu są teraz w jednym miejscu: Wyjazdy i archiwum → Łowiska.','Fisheries, profile editing and all research URLs now live together under Trips and archive → Fisheries.')}</p><a class="secondary-btn" href="/pages/wyjazdy.html#fisheries-area">${T('Zarządzaj łowiskami i źródłami','Manage fisheries and sources')}</a></section>
      <section class="panel-card"><h2>${T('Dodaj uczestnika','Add participant')}</h2><p>${T('Profile i PB istniejących wędkarzy edytujesz powyżej.','Edit existing angler profiles and personal bests above.')}</p><form id="angler-edit" class="form-grid"><div class="form-row">${field('angler-name','Nowy uczestnik','text','','required maxlength="60"')}${field('angler-pb','PB sprzed zapisów w aplikacji (kg)','number',0,'required min="0" max="150" step="0.01"')}</div>${m.currentUser?field('angler-login',T('Login (opcjonalnie, domyślnie imię)','Login (optional, defaults to name)'),'text','','maxlength="32"'):''}<button type="submit">Dodaj uczestnika</button></form></section>
      <details class="panel-card management-details"><summary>Przywracanie wpisów</summary><p>${T('Usunięte wpisy z wyjazdu','Deleted entries from trip')} <span data-user-content>${E(window.DREAM_TRIP.name)}</span>.</p><div id="trash-list"></div></details>
      <section class="panel-card"><h2>Dostęp na tym urządzeniu</h2><p>Pozostajesz zalogowany, dopóki nie wylogujesz się lub nie usuniesz danych przeglądarki.</p><button type="button" id="ryby-logout" class="secondary-btn">Wyloguj</button></section>`;
      root.querySelector('#ryby-logout').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await Dream.logout();}catch(e){Dream.notice(e.message,true);}finally{button.disabled=false;}};
      bind(document.getElementById('angler-edit'),async x=>{await Dream.api('/api/anglers',{method:'POST',body:JSON.stringify({name:x['angler-name'],baselinePbKg:Number(x['angler-pb']),username:x['angler-login']||undefined})});await refresh();document.dispatchEvent(new Event('dream:participants-changed'));});
      void trash();document.dispatchEvent(new Event('dream:settings-management-rendered'));return;
    }
    const currentDate=Date.now();
    const group=t=>t.status==='archived'?'archive':t.isActive?'current':t.end&&Date.parse(t.end)<currentDate?'completed':'upcoming';
    const cards=section=>m.trips.filter(t=>group(t)===section).sort((a,b)=>(Date.parse(a.start)||Infinity)-(Date.parse(b.start)||Infinity)).map(t=>{
      const status=t.isActive?T('● AKTYWNY','● ACTIVE'):section==='archive'?T('ARCHIWUM','ARCHIVE'):section==='completed'?T('ZAKOŃCZONY','COMPLETED'):T('NADCHODZĄCY','UPCOMING');
      return `<article class="panel-card trip-card"><div class="section-head"><h3 data-user-content>${E(t.name)}</h3><span class="section-chip">${status}</span></div><p class="trip-card-lake"><span data-user-content>${E(t.lakeProfile?.name||t.lake)}</span> · ${T('stanowisko','swim')}: <span data-user-content>${E(t.peg||'—')}</span></p><p class="trip-card-meta">${t.start?E(Dream.dateInput(t.start,chosenZone(t.lakeProfile)).replace('T',' · ')):T('Termin do ustalenia','Dates not set')} → ${t.end?E(Dream.dateInput(t.end,chosenZone(t.lakeProfile)).replace('T',' · ')):'—'}<br><span data-user-content>${E(t.participants.map(a=>a.name).join(T(' i ',' and '))||T('Uczestnicy do ustalenia','Participants not set'))}</span></p><div class="trip-card-foot"><strong>${t.stats.fishCount} ${T('ryb','fish')} · ${Number(t.stats.totalWeightKg).toFixed(1)} kg</strong><div class="form-actions">${window.DreamPhotos?.button(t)||''}<button type="button" data-open="${E(t.id)}">Otwórz</button><button type="button" data-view-lake="${E(t.lakeId)}" class="secondary-btn">${T('Szczegóły łowiska','Lake details')}</button><button type="button" data-advice="${E(t.id)}" class="secondary-btn">Porady dla wyjazdu</button><button type="button" data-edit="${E(t.id)}" class="secondary-btn">Edytuj</button>${section!=='archive'&&!t.isActive?`<button type="button" data-activate="${E(t.id)}" class="secondary-btn">Ustaw aktywny</button>`:''}</div></div></article>`;
    }).join('')||'<p class="empty-box">Brak wyjazdów w tej sekcji.</p>';
    root.innerHTML=`<section id="trip-wizard" class="panel-card trip-wizard" hidden></section><section id="trip-advice" class="panel-card" hidden></section><section><div class="section-head trip-section-head"><h2>${T('Aktualny wyjazd','Current trip')}</h2><button type="button" id="create-trip">+ Nowy wyjazd</button></div><div class="two-column">${cards('current')}</div></section>
      <section><h2>${T('Nadchodzące wyjazdy','Upcoming trips')}</h2><div class="two-column">${cards('upcoming')}</div></section><section><h2>${T('Zakończone wyjazdy','Completed trips')}</h2><div class="two-column">${cards('completed')}</div></section><section id="trip-archive"><h2>Archiwum</h2><div class="two-column">${cards('archive')}</div></section>
      <details class="panel-card management-details" id="trip-editor-panel"><summary>Utwórz lub edytuj wyjazd</summary><section id="trip-editor"></section></details><section class="panel-card" id="trip-lake-details" hidden><div id="lake-profile"></div></section>`;
    wireTrip();
    root.querySelector('#create-trip').onclick=tripWizard;
    if(new URLSearchParams(location.search).get('createTrip')==='1')root.querySelector('#trip-editor-panel').open=true;
    if(document.getElementById('lake-editor')){const wanted=new URLSearchParams(location.search).get('lakeId')||window.DREAM_TRIP?.lakeId;wireLake(m.lakes.find(l=>l.id===wanted)||m.lakes[0]||null);}
    root.querySelectorAll('[data-advice]').forEach(b=>b.onclick=()=>showTripAdvice(b.dataset.advice));
    root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{Dream.rememberTrip(b.dataset.open);location.href='/';});
    root.querySelectorAll('[data-view-lake]').forEach(b=>b.onclick=()=>{location.href='/pages/wyjazdy.html?lakeId='+encodeURIComponent(b.dataset.viewLake)+'#fisheries-area';});
    root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{wireTrip(m.trips.find(t=>t.id===b.dataset.edit));root.querySelector('#trip-editor-panel').open=true;document.getElementById('trip-editor').scrollIntoView({behavior:'smooth',block:'start'});});
    root.querySelectorAll('[data-activate]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await Dream.api('/api/trips/'+encodeURIComponent(b.dataset.activate)+'/activate',{method:'POST',body:'{}'});await refresh();Dream.notice('Zmieniono aktywny wyjazd.');}catch(e){Dream.notice(e.message,true);b.disabled=false;}});
  }
  document.addEventListener('dream:lake-selected',event=>{if(!isSettings){const lake=window.DREAM_MODEL?.lakes?.find(l=>l.id===event.detail?.lakeId);if(lake){const draft=document.getElementById('lake-edit');if(draft?.elements.id.value===lake.id&&draft.dataset.dirty)return;wireLake(lake);}}});
  render();
})();
