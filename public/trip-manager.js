(async()=>{
  const root=document.getElementById('trip-manager'),E=Dream.esc;
  const options=(items,current)=>items.map(x=>`<option value="${E(x.id)}" ${x.id===current?'selected':''}>${E(x.name)}</option>`).join('');
  const field=(id,label,type='text',value='',extra='')=>`<div><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${E(value??'')}" ${extra}></div>`;
  const area=(id,label,value='')=>`<div><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="4" maxlength="10000">${E(value||'')}</textarea></div>`;
  const values=form=>Object.fromEntries(new FormData(form));
  const empty=value=>value===''?null:value;
  const chosenZone=lake=>(window.DREAM_MODEL?.app?.timeZonePreference==='auto'?null:window.DREAM_MODEL?.app?.timeZonePreference)||lake?.facts?.timeZone||'Europe/Paris';
  function bind(form,fn){form.addEventListener('submit',async e=>{
    e.preventDefault();if(form.dataset.saving)return;form.dataset.saving='true';
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{await fn(values(form),form);Dream.notice('Zapisano.');}
    catch(error){Dream.notice(error.message,true);}
    finally{delete form.dataset.saving;button.disabled=false;}
  });}
  async function refresh(){await Dream.refreshModel();render();}
  function tripEditor(trip=null){
    const m=window.DREAM_MODEL,lake=m.lakes.find(l=>l.id===(trip?.lakeId||window.DREAM_TRIP?.lakeId||m.lakes[0]?.id));
    const zone=chosenZone(lake);
    return `<form id="trip-edit" class="form-grid"><input type="hidden" name="id" value="${E(trip?.id||'')}">
      <h3>${trip?'Edytuj wyjazd':'Nowy wyjazd'}</h3><div class="form-row">
      ${field('trip-name','Nazwa','text',trip?.name||'','required maxlength="150"')}
      ${field('trip-year','Rok','number',trip?.year||new Date().getFullYear(),'required min="2000" max="2200" step="1"')}</div>
      <div><label for="trip-lake">Łowisko</label><select id="trip-lake" name="lakeId" ${trip?'disabled':''}>${options(m.lakes,lake?.id)}</select><small>Nowe łowisko możesz dodać poniżej. Historia istniejącego wyjazdu pozostaje przy jego łowisku.</small></div>
      <div class="form-row">${field('trip-start','Początek','datetime-local',trip?.start?Dream.dateInput(trip.start,zone):'')}${field('trip-end','Powrót','datetime-local',trip?.end?Dream.dateInput(trip.end,zone):'')}</div>
      <small id="trip-zone">Godziny łowiska: ${E(zone)}. Termin może pozostać pusty.</small>
      ${field('trip-peg','Stanowisko','text',trip?.peg||'','maxlength="200"')}
      <fieldset><legend>Uczestnicy</legend><div class="participant-options">${m.anglers.map(a=>`<label><input type="checkbox" name="participants" value="${E(a.id)}" ${(!trip||trip.participants.some(p=>p.id===a.id))?'checked':''}> ${E(a.name)}</label>`).join('')}</div></fieldset>
      <div><label for="trip-status">Status</label><select id="trip-status" name="status"><option value="planning" ${trip?.status!=='archived'?'selected':''}>Planowany / bieżący</option><option value="archived" ${trip?.status==='archived'?'selected':''}>Archiwum</option></select></div>
      ${trip?'':`<div><label for="trip-copy">Skopiuj checklistę (wszystko jako niespakowane)</label><select id="trip-copy" name="copyChecklistFrom"><option value="">Pusta checklista</option>${options(m.trips,'')}</select></div>`}
      <div class="form-actions"><button type="submit">${trip?'Zapisz zmiany':'Utwórz wyjazd'}</button><button type="button" id="trip-new" class="secondary-btn">Wyczyść / nowy wyjazd</button></div></form>`;
  }
  function lakeEditor(lake=null){
    const f=lake?.facts||{};
    return `<form id="lake-edit" class="form-grid"><input type="hidden" name="id" value="${E(lake?.id||'')}"><h3>${lake?'Edytuj profil łowiska':'Dodaj łowisko'}</h3><p>Profil jest wspólny dla wszystkich wyjazdów na tę wodę.</p>
      <div class="form-row">${field('lake-name','Nazwa','text',lake?.name,'required maxlength="150"')}${field('lake-country','Kraj','text',lake?.country,'maxlength="100"')}</div>
      <div class="form-row">${field('lake-lat','Szerokość GPS','number',lake?.latitude,'min="-90" max="90" step="any"')}${field('lake-lon','Długość GPS','number',lake?.longitude,'min="-180" max="180" step="any"')}</div>
      ${field('lake-zone','Strefa czasowa','text',f.timeZone||'Europe/Warsaw','required list="timezones"')}<datalist id="timezones"><option value="Europe/Warsaw"><option value="Europe/Paris"><option value="Europe/London"></datalist>
      ${field('lake-address','Adres','text',f.address,'maxlength="500"')}
      <div class="form-row">${field('lake-size','Wielkość wody','text',f.waterSize,'maxlength="200"')}${field('lake-depth','Opis głębokości','text',f.depth,'maxlength="200"')}</div>
      ${field('lake-image','Adres zdjęcia lub mapy','text',lake?.imageUrl,'maxlength="2048" placeholder="https://…"')}
      ${field('lake-map','Adres mapy dna','text',f.mapImage,'maxlength="2000"')}
      ${area('lake-rules','Dodatkowe zasady łowiska',f.rulesText)}
      ${area('lake-logistics','Dojazd i zaplecze',f.logisticsText)}
      ${area('lake-advice','Porady i obserwacje',f.adviceText)}
      ${field('lake-source','Oficjalna strona / źródło','url',lake?.sourceUrl,'maxlength="2048"')}
      <div class="form-actions"><button type="submit">Zapisz łowisko</button><button type="button" id="lake-new" class="secondary-btn">Nowe łowisko</button></div></form>`;
  }
  function wireTrip(trip=null){
    document.getElementById('trip-editor').innerHTML=tripEditor(trip);
    document.getElementById('trip-new').onclick=()=>wireTrip();
    document.getElementById('trip-lake').onchange=e=>{const lake=window.DREAM_MODEL.lakes.find(l=>l.id===e.target.value);document.getElementById('trip-zone').textContent='Godziny łowiska: '+chosenZone(lake);};
    bind(document.getElementById('trip-edit'),async(x,form)=>{
      const lakeId=trip?.lakeId||x.lakeId,zone=chosenZone(window.DREAM_MODEL.lakes.find(l=>l.id===lakeId));
      const payload={name:x['trip-name'],year:Number(x['trip-year']),lakeId,start:Dream.fromInput(x['trip-start'],zone),end:Dream.fromInput(x['trip-end'],zone),peg:empty(x['trip-peg']),status:x.status,participantIds:[...form.querySelectorAll('[name="participants"]:checked')].map(el=>el.value)};
      if(x.copyChecklistFrom)payload.copyChecklistFrom=x.copyChecklistFrom;
      await Dream.api('/api/trips'+(x.id?'/'+encodeURIComponent(x.id):''),{method:x.id?'PUT':'POST',body:JSON.stringify(payload)});
      await refresh();
    });
  }
  function wireLake(lake=null){
    document.getElementById('lake-editor').innerHTML=lakeEditor(lake);
    document.getElementById('lake-new').onclick=()=>wireLake();
    bind(document.getElementById('lake-edit'),async x=>{
      const saved=await Dream.api('/api/lakes'+(x.id?'/'+encodeURIComponent(x.id):''),{method:x.id?'PUT':'POST',body:JSON.stringify({name:x['lake-name'],country:empty(x['lake-country']),latitude:x['lake-lat']===''?null:Number(x['lake-lat']),longitude:x['lake-lon']===''?null:Number(x['lake-lon']),imageUrl:empty(x['lake-image']),sourceUrl:empty(x['lake-source']),facts:{timeZone:x['lake-zone'],address:x['lake-address'],waterSize:x['lake-size'],depth:x['lake-depth'],mapImage:empty(x['lake-map']),rulesText:x['lake-rules'],logisticsText:x['lake-logistics'],adviceText:x['lake-advice']}})});
      await refresh();await lakeProfile(saved.id);
    });
  }
  async function trash(){
    const box=document.getElementById('trash-list');box.textContent='Ładowanie…';
    try{
      const {items}=await Dream.api('/api/trash?tripId='+encodeURIComponent(window.DREAM_TRIP.id));
      box.innerHTML=items.length?items.map(x=>`<div class="recovery-row"><span>${E({catches:'Połów',spots:'Spot',checklist:'Checklista'}[x.kind])}: ${E(x.label)}</span><button class="secondary-btn" data-restore="${E(x.kind)}" data-id="${x.id}" type="button">Przywróć</button></div>`).join(''):'Brak usuniętych wpisów w wybranym wyjeździe.';
      box.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await Dream.api(`/api/${b.dataset.restore}/${b.dataset.id}/restore?tripId=${encodeURIComponent(window.DREAM_TRIP.id)}`,{method:'POST',body:'{}'});await refresh();Dream.notice('Wpis przywrócony.');}catch(e){Dream.notice(e.message,true);b.disabled=false;}});
    }catch(e){box.textContent=e.message;}
  }
  async function lakeProfile(lakeId){
    const host=document.getElementById('lake-profile');host.textContent='Wczytywanie profilu…';
    try{
      const p=await Dream.api(`/api/lakes/${encodeURIComponent(lakeId)}/profile`),trip=window.DREAM_MODEL.trips.find(t=>t.lakeId===lakeId);
      const names={official_name:'Oficjalna nazwa',address:'Adres',phone:'Telefon',email:'E-mail',area:'Powierzchnia',depth:'Głębokość',bottom:'Dno',weed:'Zielsko',pegs:'Stanowiska',carp:'Karpie',record:'Rekord',species:'Inne ryby',rods:'Wędki',bait_boats:'Łódki zanętowe',boats:'Pontony',leadcore:'Leadcore',leaders:'Leadery',hooks:'Haczyki',cradle:'Kołyska / mata',landing_net:'Podbierak',sling:'Sling',disinfectant:'Dezynfekcja',fish_storage:'Przechowywanie ryb',arrival:'Przyjazd',departure:'Wyjazd',parking:'Parking',electricity:'Prąd',toilets:'WC',showers:'Prysznice',drinking_water:'Woda pitna',freezer:'Zamrażarka',shops:'Sklepy',access:'Dojazd',rules:'Regulamin'};
      const groups=[['Podstawowe',['official_name','address','phone','email','area']],['Woda i ryby',['depth','bottom','weed','pegs','carp','record','species']],['Regulamin',['rules','rods','bait_boats','boats','leadcore','leaders','hooks','cradle','landing_net','sling','disinfectant','fish_storage']],['Dojazd i zaplecze',['arrival','departure','parking','electricity','toilets','showers','drinking_water','freezer','shops','access']]];
      host.innerHTML=`<h3>${E(p.lake.name)} · ${E(p.lake.country||'kraj niepodany')}</h3><p>GPS: ${p.lake.latitude!=null?`${p.lake.latitude}, ${p.lake.longitude}`:'brak'} · status: <strong>${E(p.status)}</strong> · ostatni research: ${E(p.lastResearch?.completedAt||'brak')}</p><p>Fakty z regulaminu to dane źródłowe; porady wędkarskie są sugestiami.</p>${p.changes.length?`<div class="weather-note status-warn"><strong>Wykryto zmianę regulaminu lub danych od poprzedniej kontroli.</strong><ul>${p.changes.map(c=>`<li>${E(names[c.field]||c.field)}: ${E(c.oldValue)} → ${E(c.newValue)} (${E(c.changedAt)})</li>`).join('')}</ul></div>`:''}${groups.map(([group,keys])=>`<details><summary>${group}</summary><dl>${p.facts.filter(f=>keys.includes(f.field)).map(f=>`<div><dt>${E(names[f.field]||f.field)}</dt><dd>${E(f.value)} · ${E(f.status)} · ${Math.round(f.confidence*100)}% · <a href="${E(f.url)}" target="_blank" rel="noopener noreferrer">${E(f.sourceName)}</a> <small>${E(f.checkedAt)}</small></dd></div>`).join('')||'<p>Brak potwierdzonych danych. Uzupełnij źródło.</p>'}</dl></details>`).join('')}<details><summary>Źródła (${p.sources.length})</summary><ul>${p.sources.map(s=>`<li><a href="${E(s.url)}" target="_blank" rel="noopener noreferrer">${E(s.title)}</a> · ${E(s.sourceType)} · ${E(s.checkedAt)}</li>`).join('')}</ul></details><div class="form-actions"><button type="button" id="lake-candidates" class="secondary-btn">Znajdź kandydatów</button><button type="button" id="lake-refresh" class="secondary-btn">Odśwież research</button></div><div id="lake-candidate-list" aria-live="polite"></div><form id="lake-source-form" class="form-grid"><h4>Dodaj źródło i krótki fakt ręcznie</h4>${field('source-url','URL oficjalnej strony lub regulaminu','url',p.lake.sourceUrl||'','required maxlength="2048"')}${field('source-field','Pole (np. rods, cradle, depth, parking)','text','','required maxlength="40" pattern="[a-z_]+"')}${field('source-value','Wartość / treść zasady','text','','required maxlength="500"')}<button type="submit">Zapisz fakt ze źródłem</button><button type="button" id="save-source-only" class="secondary-btn">Zapisz sam URL do późniejszej analizy</button></form>${trip?`<section id="lake-checklist-suggestions"><button type="button" id="show-suggestions" class="secondary-btn">Zobacz wyposażenie wymagane regulaminem</button><div id="suggestion-list"></div></section>`:''}`;
      const chosenUrl=()=>document.getElementById('source-url').value||p.lake.sourceUrl;
      document.getElementById('lake-refresh').onclick=async()=>{const url=chosenUrl();if(!url)return Dream.notice('Podaj URL oficjalnej strony lub regulaminu.',true);await research(lakeId,url,'manual');};
      document.getElementById('lake-candidates').onclick=async()=>{const box=document.getElementById('lake-candidate-list');box.textContent='Wyszukiwanie kandydatów…';try{const {candidates,message}=await Dream.api(`/api/lakes/${encodeURIComponent(lakeId)}/candidates`,{method:'POST',body:'{}'});box.innerHTML=message?`<p>${E(message)}</p>`:candidates.length?candidates.map((c,i)=>`<div class="recovery-row"><span>${E(c.name)} · ${E(c.region)} · ${E(c.country)} · GPS nieustalony · <a href="${E(c.url)}" target="_blank" rel="noopener noreferrer">strona kandydata</a></span><label><input type="checkbox" data-official="${i}"> To oficjalna strona łowiska</label><button type="button" data-candidate="${i}">Potwierdź to łowisko</button></div>`).join(''):'Brak wyników. Dodaj oficjalny URL ręcznie.';box.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>research(lakeId,candidates[Number(button.dataset.candidate)].url,box.querySelector(`[data-official=\"${button.dataset.candidate}\"]`)?.checked?'official':'operator'));}catch(e){box.textContent=e.message;}};
      document.getElementById('save-source-only').onclick=async()=>{try{await Dream.api(`/api/lakes/${encodeURIComponent(lakeId)}/sources`,{method:'POST',body:JSON.stringify({url:document.getElementById('source-url').value,sourceType:'manual'})});await lakeProfile(lakeId);Dream.notice('URL zapisany w źródłach łowiska.');}catch(e){Dream.notice(e.message,true);}};
      document.getElementById('lake-source-form').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget;try{await Dream.api(`/api/lakes/${encodeURIComponent(lakeId)}/facts`,{method:'POST',body:JSON.stringify({url:form.querySelector('#source-url').value,field:form.querySelector('#source-field').value,value:form.querySelector('#source-value').value,sourceType:'manual'})});await lakeProfile(lakeId);Dream.notice('Fakt i źródło zapisane.');}catch(e){Dream.notice(e.message,true);}};
      if(trip)document.getElementById('show-suggestions').onclick=async()=>{const box=document.getElementById('suggestion-list');try{const {items,advice}=await Dream.api(`/api/trips/${encodeURIComponent(trip.id)}/suggestions`);box.innerHTML=`<p>${items.length?'Znaleziono wymagane wyposażenie — dodać do checklisty?':'Brak jednoznacznych wymagań wyposażenia w potwierdzonych faktach.'}</p>${items.map((item,i)=>`<label><input type="checkbox" data-suggest="${i}" checked> FAKT Z REGULAMINU: ${E(item.label)} · ${E(item.reason)} · <a href="${E(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">źródło</a></label>`).join('')}${items.length?'<button type="button" id="accept-suggestions">Dodaj wybrane pozycje</button>':''}${advice.map(x=>`<p>SUGESTIA WĘDKARSKA: ${E(x.field)} — ${E(x.value)}</p>`).join('')}`;document.getElementById('accept-suggestions')?.addEventListener('click',async()=>{try{const labels=[...box.querySelectorAll('input:checked')].map(x=>items[Number(x.dataset.suggest)].label);const result=await Dream.api(`/api/trips/${encodeURIComponent(trip.id)}/suggestions`,{method:'POST',body:JSON.stringify({labels})});Dream.notice(`Dodano ${result.added} pozycji.`);}catch(e){Dream.notice(e.message,true);}});}catch(e){box.textContent=e.message;}};
    }catch(error){host.textContent=error.message;}
  }
  async function research(lakeId,url,sourceType){try{const result=await Dream.api(`/api/lakes/${encodeURIComponent(lakeId)}/research`,{method:'POST',body:JSON.stringify({url,sourceType})});Dream.notice(`Sprawdzono źródło. Zapisano ${result.count} jawnie oznaczonych faktów.`);await lakeProfile(lakeId);}catch(error){Dream.notice(error.message,true);}}
  function render(){
    const m=window.DREAM_MODEL;
    const cards=archived=>m.trips.filter(t=>(t.status==='archived')===archived).map(t=>`<article class="panel-card trip-card"><div class="section-head"><h3>${E(t.name)}</h3><span class="section-chip">${t.isActive?'● AKTYWNY':archived?'ARCHIWUM':t.year}</span></div><p class="trip-card-lake">${E(t.lakeProfile?.name||t.lake)}${t.peg?` · stanowisko ${E(t.peg)}`:''}</p><p class="trip-card-meta">${t.start?E(Dream.dateInput(t.start,chosenZone(t.lakeProfile)).replace('T',' · ')):'Termin do ustalenia'} · ${E(t.participants.map(a=>a.name).join(' i ')||'Uczestnicy do ustalenia')}</p><div class="trip-card-foot"><strong>${t.stats.fishCount} ryb · ${Number(t.stats.totalWeightKg).toFixed(1)} kg</strong><div class="form-actions"><button type="button" data-open="${E(t.id)}">Otwórz</button><button type="button" data-edit="${E(t.id)}" class="secondary-btn">Edytuj</button>${!archived&&!t.isActive?`<button type="button" data-activate="${E(t.id)}" class="secondary-btn">Ustaw aktywny</button>`:''}</div></div></article>`).join('')||'<p class="empty-box">Brak wyjazdów w tej sekcji.</p>';
    root.innerHTML=`<section><div class="section-head trip-section-head"><h2>Wyjazdy</h2><button type="button" id="create-trip">+ Nowy wyjazd</button></div><div class="two-column">${cards(false)}</div></section>
      <section><h2>Archiwum</h2><div class="two-column">${cards(true)}</div></section>
      <details class="panel-card management-details" id="trip-editor-panel"><summary>Utwórz lub edytuj wyjazd</summary><section id="trip-editor"></section></details>
      <section class="panel-card"><h2>Łowiska</h2><p>Profile łowisk są wspólne dla wszystkich lat. Wybierz profil, aby zobaczyć źródła i stan researchu.</p><div class="form-actions">${m.lakes.map(l=>`<button type="button" data-lake="${E(l.id)}" class="secondary-btn">${E(l.name)}</button>`).join('')}</div><div id="lake-profile"></div><details class="management-details" id="lake-editor-panel"><summary>Dodaj lub edytuj łowisko</summary><div id="lake-editor"></div></details></section>
      <details class="panel-card management-details"><summary>Uczestnicy i PB</summary><p>${m.anglers.map(a=>`${E(a.name)}: ${Number(a.pbKg).toFixed(1)} kg`).join(' · ')}</p><form id="angler-edit" class="form-grid"><div class="form-row">${field('angler-name','Nowy uczestnik','text','','required maxlength="60"')}${field('angler-pb','PB sprzed zapisów w aplikacji (kg)','number',0,'required min="0" max="150" step="0.01"')}</div><button type="submit">Dodaj uczestnika</button></form></details>
      <details class="panel-card management-details"><summary>Przywracanie wpisów</summary><p>Usunięte wpisy z wyjazdu ${E(window.DREAM_TRIP.name)}.</p><div id="trash-list"></div></details>
      <details class="panel-card management-details"><summary>Kopia danych i ustawienia</summary><p>Pobierz dane wszystkich lat, wraz z archiwum i usuniętymi wpisami.</p><button type="button" id="backup-download" class="dream-action">Pobierz kopię JSON</button><p>Wersja ${E(m.app.version)} · baza Cloudflare D1</p><hr><h3>Dostęp na tym urządzeniu</h3><p>Pozostajesz zalogowany, dopóki nie wylogujesz się lub nie usuniesz danych przeglądarki.</p><button type="button" id="ryby-logout" class="secondary-btn">Wyloguj</button></details>`;
    wireTrip();wireLake();
    root.querySelector('#backup-download').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await Dream.downloadBackup();}catch(e){Dream.notice(e.message,true);}finally{button.disabled=false;}};
    root.querySelector('#ryby-logout').onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await Dream.logout();}catch(e){Dream.notice(e.message,true);button.disabled=false;}};
    root.querySelector('#create-trip').onclick=()=>{wireTrip();const panel=root.querySelector('#trip-editor-panel');panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'start'});};
    root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{Dream.rememberTrip(b.dataset.open);location.href='/';});
    root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{wireTrip(m.trips.find(t=>t.id===b.dataset.edit));root.querySelector('#trip-editor-panel').open=true;document.getElementById('trip-editor').scrollIntoView({behavior:'smooth',block:'start'});});
    root.querySelectorAll('[data-lake]').forEach(b=>b.onclick=()=>{wireLake(m.lakes.find(l=>l.id===b.dataset.lake));void lakeProfile(b.dataset.lake);document.getElementById('lake-profile').scrollIntoView({behavior:'smooth',block:'start'});});
    root.querySelectorAll('[data-activate]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await Dream.api('/api/trips/'+encodeURIComponent(b.dataset.activate)+'/activate',{method:'POST',body:'{}'});await refresh();Dream.notice('Zmieniono aktywny wyjazd.');}catch(e){Dream.notice(e.message,true);b.disabled=false;}});
    bind(document.getElementById('angler-edit'),async x=>{await Dream.api('/api/anglers',{method:'POST',body:JSON.stringify({name:x['angler-name'],baselinePbKg:Number(x['angler-pb'])})});await refresh();});
    void trash();
  }
  render();
})();
