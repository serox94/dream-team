(async()=>{
  const root=document.getElementById('trip-manager'),E=Dream.esc;
  const options=(items,current)=>items.map(x=>`<option value="${E(x.id)}" ${x.id===current?'selected':''}>${E(x.name)}</option>`).join('');
  const field=(id,label,type='text',value='',extra='')=>`<div><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${E(value??'')}" ${extra}></div>`;
  const area=(id,label,value='')=>`<div><label for="${id}">${label}</label><textarea id="${id}" name="${id}" rows="4" maxlength="10000">${E(value||'')}</textarea></div>`;
  const values=form=>Object.fromEntries(new FormData(form));
  const empty=value=>value===''?null:value;
  function bind(form,fn){form.addEventListener('submit',async e=>{
    e.preventDefault();if(form.dataset.saving)return;form.dataset.saving='true';
    const button=form.querySelector('[type="submit"]');button.disabled=true;
    try{await fn(values(form),form);Dream.notice('Zapisano.');}
    catch(error){Dream.notice(error.message,true);}
    finally{delete form.dataset.saving;button.disabled=false;}
  });}
  async function refresh(){await Dream.refreshModel();render();}
  function tripEditor(trip=null){
    const m=window.DREAM_MODEL,lake=m.lakes.find(l=>l.id===(trip?.lakeId||m.lakes[0]?.id));
    const zone=lake?.facts?.timeZone||'Europe/Paris';
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
    document.getElementById('trip-lake').onchange=e=>{const lake=window.DREAM_MODEL.lakes.find(l=>l.id===e.target.value);document.getElementById('trip-zone').textContent='Godziny łowiska: '+(lake.facts.timeZone||'Europe/Paris');};
    bind(document.getElementById('trip-edit'),async(x,form)=>{
      const lakeId=trip?.lakeId||x.lakeId,zone=window.DREAM_MODEL.lakes.find(l=>l.id===lakeId)?.facts.timeZone||'Europe/Paris';
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
      await Dream.api('/api/lakes'+(x.id?'/'+encodeURIComponent(x.id):''),{method:x.id?'PUT':'POST',body:JSON.stringify({name:x['lake-name'],country:empty(x['lake-country']),latitude:x['lake-lat']===''?null:Number(x['lake-lat']),longitude:x['lake-lon']===''?null:Number(x['lake-lon']),imageUrl:empty(x['lake-image']),sourceUrl:empty(x['lake-source']),facts:{timeZone:x['lake-zone'],address:x['lake-address'],waterSize:x['lake-size'],depth:x['lake-depth'],mapImage:empty(x['lake-map']),rulesText:x['lake-rules'],logisticsText:x['lake-logistics'],adviceText:x['lake-advice']}})});
      await refresh();
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
  function render(){
    const m=window.DREAM_MODEL;
    const cards=archived=>m.trips.filter(t=>(t.status==='archived')===archived).map(t=>`<article class="panel-card"><div class="section-head"><h3>${E(t.name)}</h3><span class="section-chip">${t.isActive?'★ AKTYWNY':archived?'ARCHIWUM':t.year}</span></div><p>${E(t.lakeProfile?.name||t.lake)} · ${t.start?E(Dream.dateInput(t.start,t.lakeProfile?.facts?.timeZone||'Europe/Paris').replace('T',' ')):'termin do ustalenia'}</p><p>${E(t.participants.map(a=>a.name).join(' · '))}</p><p>${t.stats.fishCount} ryb · ${Number(t.stats.totalWeightKg).toFixed(1)} kg</p><div class="form-actions"><button type="button" data-open="${E(t.id)}">Otwórz</button><button type="button" data-edit="${E(t.id)}" class="secondary-btn">Edytuj</button>${!archived&&!t.isActive?`<button type="button" data-activate="${E(t.id)}" class="secondary-btn">Ustaw aktywny</button>`:''}</div></article>`).join('')||'<p>Brak wyjazdów.</p>';
    root.innerHTML=`<section><h2>Wyjazdy</h2><div class="two-column">${cards(false)}</div></section><section><h2>Archiwum</h2><div class="two-column">${cards(true)}</div></section>
      <section class="panel-card" id="trip-editor"></section>
      <section class="panel-card"><h2>Łowiska</h2><div class="form-actions">${m.lakes.map(l=>`<button type="button" data-lake="${E(l.id)}" class="secondary-btn">${E(l.name)}</button>`).join('')}</div><div id="lake-editor"></div></section>
      <section class="panel-card"><h2>Uczestnicy i wcześniejsze PB</h2><p>${m.anglers.map(a=>`${E(a.name)}: ${Number(a.pbKg).toFixed(1)} kg`).join(' · ')}</p><form id="angler-edit" class="form-grid"><div class="form-row">${field('angler-name','Nowy uczestnik','text','','required maxlength="60"')}${field('angler-pb','PB sprzed zapisów w aplikacji (kg)','number',0,'required min="0" max="150" step="0.01"')}</div><button type="submit">Dodaj uczestnika</button></form></section>
      <section class="panel-card"><h2>Przywracanie wpisów</h2><p>Usunięte wpisy z wybranego wyjazdu: ${E(window.DREAM_TRIP.name)}. Zachowujemy je do ewentualnego przywrócenia.</p><div id="trash-list"></div></section>
      <section class="panel-card"><h2>Kopia danych</h2><p>Pobierz dane wszystkich lat, wraz z archiwum i usuniętymi wpisami.</p><a class="dream-action" href="/api/export" download>Pobierz kopię JSON</a><p>Wersja ${E(m.app.version)} · ${m.legacyImport?'Zachowano zapis wcześniejszego importu Supabase.':'Brak znacznika wcześniejszego importu Supabase.'}</p></section>`;
    wireTrip();wireLake();
    root.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{Dream.rememberTrip(b.dataset.open);location.href='/';});
    root.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{wireTrip(m.trips.find(t=>t.id===b.dataset.edit));document.getElementById('trip-editor').scrollIntoView({behavior:'smooth',block:'start'});});
    root.querySelectorAll('[data-lake]').forEach(b=>b.onclick=()=>wireLake(m.lakes.find(l=>l.id===b.dataset.lake)));
    root.querySelectorAll('[data-activate]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await Dream.api('/api/trips/'+encodeURIComponent(b.dataset.activate)+'/activate',{method:'POST',body:'{}'});await refresh();Dream.notice('Zmieniono aktywny wyjazd.');}catch(e){Dream.notice(e.message,true);b.disabled=false;}});
    bind(document.getElementById('angler-edit'),async x=>{await Dream.api('/api/anglers',{method:'POST',body:JSON.stringify({name:x['angler-name'],baselinePbKg:Number(x['angler-pb'])})});await refresh();});
    void trash();
  }
  render();
})();
