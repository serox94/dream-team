const $ = s => document.querySelector(s);
let model = null;
let active = null;
let currentView = location.hash.replace('#','') || 'dashboard';

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `HTTP ${response.status}`);
  return data;
}

function setStatus(text, error = false) {
  const el = $('#systemStatus');
  el.querySelector('b').textContent = text;
  el.classList.toggle('error', error);
}

function fmtDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function fmtDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
}

function showView(view) {
  currentView = document.getElementById(`view-${view}`) ? view : 'dashboard';
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active-view', el.id === `view-${currentView}`));
  document.querySelectorAll('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.view === currentView));
  const titles = {
    dashboard:['CENTRUM DOWODZENIA', active?.name || 'Dream Team'], catches:['REJESTR POŁOWÓW','Połowy'], weather:['ANALIZA WARUNKÓW','Pogoda PRO'], lake:['PROFIL WYJAZDU','Łowisko'], map:['SPOTY I DNO','Mapa spotów'], checklists:['PRZYGOTOWANIE','Checklisty'], knowledge:['WIEDZA','Baza wiedzy'], archive:['HISTORIA','Archiwum wyjazdów']
  };
  $('#pageEyebrow').textContent = titles[currentView][0];
  $('#pageTitle').textContent = titles[currentView][1];
  $('#sidebar').classList.remove('open');
  if (currentView === 'catches') loadCatches();
  if (currentView === 'weather') loadWeather();
  if (currentView === 'map') loadSpots();
  if (currentView === 'checklists') loadChecklist();
}

async function load() {
  try {
    setStatus('Łączenie z bazą…');
    model = await api('/api/bootstrap');
    active = model.trips.find(t => t.id === model.app.activeTripId) || model.trips[0];
    render();
    bind();
    showView(currentView);
    setStatus('D1 online');
  } catch (error) {
    console.error(error);
    setStatus('Błąd połączenia z D1', true);
    $('#pageTitle').textContent = 'Dream Team';
  }
}

function render() {
  if (!active) return;
  const t = active;
  $('#tripButtonName').textContent = t.lake;
  $('#tripButtonMeta').textContent = `${t.year} · ${t.status === 'archived' ? 'Archiwum' : t.status === 'active' ? 'Aktywny' : 'Planowanie'}`;
  $('#lakeName').textContent = t.lake;
  $('#tripLocation').textContent = [t.country, t.peg && t.peg !== '—' ? t.peg : null].filter(Boolean).join(' · ') || 'Nowy wyjazd Dream Team';
  $('#tripStatus').textContent = t.status === 'archived' ? 'ARCHIWUM' : t.status === 'active' ? 'AKTYWNY' : 'PLANOWANIE';
  $('#lakeImage').src = t.lakeImage || 'https://raw.githubusercontent.com/serox94/ryby2026/main/assets/img/lowisko.jpg';
  $('#peg').textContent = t.peg || '—';
  ['waterSize','depth','carpRecord','power','baitBoat'].forEach(k => $('#'+k).textContent = t.facts?.[k] || '—');
  $('#totalWeight').textContent = Number(t.stats?.totalWeightKg || 0).toFixed(1);
  $('#fishCount').textContent = t.stats?.fishCount || 0;
  $('#biggestFish').textContent = t.stats?.biggestFishKg ? `${t.stats.biggestFishKg} kg` : '—';
  $('#biggestAngler').textContent = t.stats?.biggestFishAngler || 'Brak danych';
  $('#bestSpot').textContent = t.stats?.bestSpot || '—';
  $('#nextActionText').textContent = t.start && t.end ? 'Termin jest zapisany. Uzupełniamy informacje łowiska, pogodę, połowy, spoty i checklisty.' : 'Ustaw łowisko i termin. Dane zapiszą się wspólnie w Cloudflare D1.';
  renderCountdown(); renderMenu(); renderArchive(); renderAnglers(); renderLakeProfile(); renderKnowledge();
}

function renderCountdown() {
  if (!active.start) { $('#countdown').textContent = '—'; $('#tripDates').textContent = 'Termin do ustawienia'; return; }
  const days = Math.ceil((new Date(active.start) - new Date()) / 864e5);
  $('#countdown').textContent = days > 0 ? `${days} dni` : days === 0 ? 'DZISIAJ' : active.status === 'archived' ? 'ZAKOŃCZONY' : 'TRWA';
  $('#tripDates').textContent = `${fmtDate(active.start)} — ${fmtDate(active.end)}`;
}

function renderMenu() {
  const box = $('#tripMenu');
  box.innerHTML = model.trips.map(t => `<button data-trip="${t.id}"><b>${t.lake}</b><small>${t.year} · ${t.status === 'archived' ? 'archiwum' : t.status === 'active' ? 'aktywny' : 'planowanie'}</small></button>`).join('');
  box.querySelectorAll('button').forEach(button => button.onclick = async () => {
    const id = button.dataset.trip;
    try {
      setStatus('Zmiana wyjazdu…');
      await api(`/api/trips/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      model = await api('/api/bootstrap');
      active = model.trips.find(t => t.id === id) || model.trips[0];
      box.classList.add('hidden'); render(); showView(currentView); setStatus('D1 online');
    } catch (error) { alert(`Nie udało się zmienić wyjazdu: ${error.message}`); setStatus('Błąd', true); }
  });
}

function renderArchive() {
  const trips = model.trips.filter(t => t.status === 'archived');
  $('#archiveList').innerHTML = trips.length ? trips.map(t => `<article class="archive-item"><div><b>${t.name} · ${t.lake}</b><small>${fmtDate(t.start) || t.year} — ${fmtDate(t.end) || ''}</small></div><button data-open="${t.id}">Otwórz</button></article>`).join('') : '<div class="empty-state">Brak zakończonych wyjazdów.</div>';
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => { active = model.trips.find(t => t.id === button.dataset.open); render(); showView('dashboard'); location.hash='dashboard'; });
}

function renderAnglers() {
  $('#anglerGrid').innerHTML = model.anglers.map(a => `<article><div class="angler-head"><span>${a.name[0]}</span><div><h4>${a.name}</h4><small>PB: ${Number(a.pbKg).toFixed(1)} kg</small></div></div></article>`).join('');
}

function renderLakeProfile() {
  const f = active.facts || {};
  $('#lakeProfileTitle').textContent = active.lake;
  const rows = [
    ['Lokalizacja', f.address || active.country || '—'], ['Stanowisko', active.peg || '—'], ['Termin', active.start ? `${fmtDate(active.start)} — ${fmtDate(active.end)}` : '—'], ['Powierzchnia', f.waterSize || '—'], ['Głębokość', f.depth || '—'], ['Rekord', f.carpRecord || '—'], ['Prąd', f.power || '—'], ['Sanitariaty', f.sanitary || '—'], ['Woda', f.water || '—'], ['Łódka zanętowa', f.baitBoat || '—'], ['Łódź', f.boat || '—'], ['Przyjazd', f.arrival || f.arrivalNote || '—'], ['Wyjazd', f.departure || '—']
  ];
  $('#lakeProfile').innerHTML = rows.map(([k,v]) => `<article><small>${k}</small><strong>${v}</strong></article>`).join('');
}

function renderKnowledge() {
  const f = active.facts || {};
  const rules = [
    'Łódka zanętowa: ' + (f.baitBoat || 'sprawdź regulamin'),
    f.boat || 'Zasady używania łodzi: sprawdź regulamin',
    'Na miejscu używaj wyłącznie dozwolonego sprzętu i zestawów.',
    'Przed wyjazdem sprawdź aktualny regulamin łowiska.',
    f.source ? `Źródło profilu: ${f.source}` : 'Źródło profilu zostanie dodane podczas researchu.'
  ];
  $('#knowledgeBox').innerHTML = rules.map((r,i)=>`<article><small>${String(i+1).padStart(2,'0')}</small><strong>${r}</strong></article>`).join('');
}

async function refreshBootstrap() {
  model = await api('/api/bootstrap');
  active = model.trips.find(t => t.id === active?.id) || model.trips.find(t=>t.id===model.app.activeTripId) || model.trips[0];
  render();
}

async function loadCatches() {
  if (!active) return;
  try {
    const { catches } = await api(`/api/catches?tripId=${encodeURIComponent(active.id)}`);
    const total = catches.reduce((s,c)=>s+Number(c.weightKg||0),0);
    const biggest = catches.reduce((m,c)=>!m || Number(c.weightKg)>Number(m.weightKg) ? c : m,null);
    const freq = key => { const m={}; catches.forEach(c=>{const v=c[key]; if(v) m[v]=(m[v]||0)+1}); return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Brak'; };
    $('#catchSummary').innerHTML = `<div><span>Liczba ryb</span><strong>${catches.length}</strong></div><div><span>Łączna waga</span><strong>${total.toFixed(1)} kg</strong></div><div><span>Największa</span><strong>${biggest ? `${biggest.weightKg} kg · ${biggest.anglerName}` : 'Brak'}</strong></div><div><span>Top spot</span><strong>${freq('spot')}</strong></div><div><span>Top przynęta</span><strong>${freq('bait')}</strong></div>`;
    $('#catchesList').innerHTML = catches.length ? catches.map(c=>`<article class="list-item"><div><b>${c.weightKg} kg · ${c.species} · ${c.anglerName}</b><small>${fmtDateTime(c.caughtAt)}${c.spot ? ` · ${c.spot}`:''}${c.bait ? ` · ${c.bait}`:''}</small>${c.notes ? `<p>${c.notes}</p>`:''}</div><button data-delete-catch="${c.id}">Usuń</button></article>`).join('') : '<div class="empty-state">Brak połowów dla tego wyjazdu.</div>';
    document.querySelectorAll('[data-delete-catch]').forEach(b=>b.onclick=async()=>{ if(!confirm('Usunąć ten połów?')) return; await api(`/api/catches/${b.dataset.deleteCatch}`,{method:'DELETE'}); await loadCatches(); await refreshBootstrap(); });
  } catch(e) { $('#catchesList').innerHTML=`<div class="empty-state">Błąd: ${e.message}</div>`; }
}

async function addCatch() {
  const weight = Number($('#catchWeight').value);
  if (!weight) return alert('Podaj wagę ryby.');
  const dt = $('#catchTime').value ? new Date($('#catchTime').value).toISOString() : new Date().toISOString();
  await api('/api/catches',{method:'POST',body:JSON.stringify({tripId:active.id,anglerId:$('#catchAngler').value,weightKg:weight,species:$('#catchSpecies').value||'Karp',caughtAt:dt,spot:$('#catchSpot').value.trim()||null,bait:$('#catchBait').value.trim()||null,notes:$('#catchNotes').value.trim()||null})});
  $('#catchWeight').value=''; $('#catchSpot').value=''; $('#catchBait').value=''; $('#catchNotes').value='';
  await loadCatches(); await refreshBootstrap(); setStatus('D1 online · połów zapisany');
}

async function loadSpots() {
  try {
    const { spots } = await api(`/api/spots?tripId=${encodeURIComponent(active.id)}`);
    $('#spotsList').innerHTML = spots.length ? spots.map(s=>`<article class="list-item"><div><b>${s.name}</b><small>${s.depthM ? `${s.depthM} m`:'bez głębokości'}${s.distanceM ? ` · ${s.distanceM} m od brzegu`:''}${s.bottomType ? ` · ${s.bottomType}`:''}</small>${s.notes?`<p>${s.notes}</p>`:''}</div><button data-delete-spot="${s.id}">Usuń</button></article>`).join('') : '<div class="empty-state">Brak zapisanych spotów.</div>';
    document.querySelectorAll('[data-delete-spot]').forEach(b=>b.onclick=async()=>{await api(`/api/spots/${b.dataset.deleteSpot}`,{method:'DELETE'});loadSpots();});
  } catch(e) { $('#spotsList').innerHTML=`<div class="empty-state">Błąd: ${e.message}</div>`; }
}

async function addSpot() {
  const name=$('#spotName').value.trim(); if(!name) return alert('Podaj nazwę spotu.');
  await api('/api/spots',{method:'POST',body:JSON.stringify({tripId:active.id,name,depthM:$('#spotDepth').value?Number($('#spotDepth').value):null,distanceM:$('#spotDistance').value?Number($('#spotDistance').value):null,bottomType:$('#spotBottom').value.trim()||null,notes:$('#spotNotes').value.trim()||null})});
  ['spotName','spotDepth','spotDistance','spotBottom','spotNotes'].forEach(id=>$('#'+id).value=''); loadSpots();
}

async function loadChecklist() {
  try {
    const { items } = await api(`/api/checklist?tripId=${encodeURIComponent(active.id)}`);
    $('#checklistList').innerHTML = items.length ? items.map(i=>`<article class="check-item ${i.packed?'done':''}"><label><input type="checkbox" data-check="${i.id}" ${i.packed?'checked':''}><span><b>${i.label}</b><small>${i.category}${i.assignedTo ? ` · ${i.assignedTo}`:''}</small></span></label><button data-delete-check="${i.id}">×</button></article>`).join('') : '<div class="empty-state">Lista jest pusta.</div>';
    document.querySelectorAll('[data-check]').forEach(c=>c.onchange=async()=>{await api(`/api/checklist/${c.dataset.check}`,{method:'PATCH',body:JSON.stringify({packed:c.checked})});loadChecklist();});
    document.querySelectorAll('[data-delete-check]').forEach(b=>b.onclick=async()=>{await api(`/api/checklist/${b.dataset.deleteCheck}`,{method:'DELETE'});loadChecklist();});
  } catch(e) { $('#checklistList').innerHTML=`<div class="empty-state">Błąd: ${e.message}</div>`; }
}

async function addChecklist() {
  const label=$('#checkLabel').value.trim(); if(!label) return alert('Wpisz rzecz do zabrania.');
  await api('/api/checklist',{method:'POST',body:JSON.stringify({tripId:active.id,label,category:$('#checkCategory').value.trim()||'Inne',assignedTo:$('#checkAssigned').value||null})});
  $('#checkLabel').value=''; loadChecklist();
}

function weatherCode(code) {
  if ([0].includes(code)) return 'Bezchmurnie'; if ([1,2,3].includes(code)) return 'Zachmurzenie'; if ([45,48].includes(code)) return 'Mgła'; if ([51,53,55,56,57].includes(code)) return 'Mżawka'; if ([61,63,65,66,67,80,81,82].includes(code)) return 'Deszcz'; if ([71,73,75,77,85,86].includes(code)) return 'Śnieg'; if ([95,96,99].includes(code)) return 'Burza'; return 'Warunki zmienne';
}

async function loadWeather() {
  const box=$('#weatherBox');
  if (active.latitude == null || active.longitude == null) { box.innerHTML='<p class="muted">Brak współrzędnych łowiska. Po uzupełnieniu profilu pogoda uruchomi się automatycznie.</p>'; return; }
  box.innerHTML='<p class="muted">Pobieranie Open-Meteo…</p>';
  try {
    const url=`https://api.open-meteo.com/v1/forecast?latitude=${active.latitude}&longitude=${active.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,surface_pressure,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset&timezone=auto&forecast_days=7`;
    const r=await fetch(url); if(!r.ok) throw new Error(`HTTP ${r.status}`); const w=await r.json();
    const c=w.current;
    const days=w.daily.time.map((d,i)=>`<article><small>${fmtDate(d)}</small><strong>${w.daily.temperature_2m_max[i]}° / ${w.daily.temperature_2m_min[i]}°</strong><span>${weatherCode(w.daily.weather_code[i])} · opad ${w.daily.precipitation_sum[i]} mm · wiatr max ${w.daily.wind_speed_10m_max[i]} km/h</span></article>`).join('');
    box.innerHTML=`<div class="weather-now"><div><small>TERAZ</small><strong>${c.temperature_2m}°C</strong><span>${weatherCode(c.weather_code)} · odczuwalna ${c.apparent_temperature}°C</span></div><div><small>CIŚNIENIE</small><strong>${Math.round(c.surface_pressure)} hPa</strong><span>wilgotność ${c.relative_humidity_2m}%</span></div><div><small>WIATR</small><strong>${c.wind_speed_10m} km/h</strong><span>kierunek ${c.wind_direction_10m}°</span></div><div><small>OPAD</small><strong>${c.precipitation} mm</strong><span>zachmurzenie ${c.cloud_cover}%</span></div></div><div class="forecast-grid">${days}</div><p class="source-note">Źródło: Open-Meteo · lokalizacja aktywnego łowiska.</p>`;
  } catch(e) { box.innerHTML=`<p class="muted">Nie udało się pobrać pogody: ${e.message}</p>`; }
}

function openDialog() {
  $('#inputLake').value = active.lake === 'Łowisko do ustawienia' ? '' : active.lake;
  $('#inputStart').value = active.start ? active.start.slice(0,10) : '';
  $('#inputEnd').value = active.end ? active.end.slice(0,10) : '';
  $('#inputCountry').value = active.country === '—' ? '' : (active.country || '');
  $('#inputPeg').value = active.peg === '—' ? '' : (active.peg || '');
  $('#tripDialog').showModal();
}

async function saveTrip() {
  if (!$('#tripForm').reportValidity()) return;
  const lake=$('#inputLake').value.trim(), startDate=$('#inputStart').value, endDate=$('#inputEnd').value;
  const year=new Date(`${startDate}T12:00:00`).getFullYear();
  const payload={lake,country:$('#inputCountry').value.trim()||'—',peg:$('#inputPeg').value.trim()||'—',start:`${startDate}T12:00:00`,end:`${endDate}T12:00:00`,name:`${lake} ${year}`,year,status:'planning'};
  try { $('#saveTrip').disabled=true; $('#saveTrip').textContent='Zapisywanie…'; await api(`/api/trips/${encodeURIComponent(active.id)}`,{method:'PUT',body:JSON.stringify(payload)}); await refreshBootstrap(); $('#tripDialog').close(); setStatus('D1 online · zapisano'); }
  catch(e){alert(`Nie udało się zapisać: ${e.message}`)} finally{$('#saveTrip').disabled=false;$('#saveTrip').textContent='Zapisz w bazie'}
}

function bind() {
  $('#tripButton').onclick=()=>$('#tripMenu').classList.toggle('hidden');
  $('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');
  $('#editTrip').onclick=openDialog; $('#setupTrip').onclick=openDialog; $('#saveTrip').onclick=saveTrip;
  $('#addCatch').onclick=addCatch; $('#refreshCatches').onclick=loadCatches;
  $('#addSpot').onclick=addSpot; $('#addChecklist').onclick=addChecklist; $('#refreshWeather').onclick=loadWeather;
  document.querySelectorAll('.nav-link').forEach(a=>a.onclick=e=>{e.preventDefault(); const v=a.dataset.view||'dashboard'; location.hash=v; showView(v);});
  window.addEventListener('hashchange',()=>showView(location.hash.replace('#','')||'dashboard'));
  const now=new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset()); $('#catchTime').value=now.toISOString().slice(0,16);
}

load();