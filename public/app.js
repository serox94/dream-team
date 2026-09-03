const $ = s => document.querySelector(s);
let model = null;
let active = null;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
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

async function load() {
  try {
    setStatus('Łączenie z bazą…');
    model = await api('/api/bootstrap');
    active = model.trips.find(t => t.id === model.app.activeTripId) || model.trips[0];
    render();
    bind();
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
  $('#pageTitle').textContent = t.name;
  $('#tripButtonName').textContent = t.lake;
  $('#tripButtonMeta').textContent = `${t.year} · ${t.status === 'archived' ? 'Archiwum' : 'Aktywny'}`;
  $('#lakeName').textContent = t.lake;
  $('#tripLocation').textContent = [t.country, t.peg && t.peg !== '—' ? `stanowisko ${t.peg}` : null].filter(Boolean).join(' · ') || 'Nowy wyjazd Dream Team';
  $('#tripStatus').textContent = t.status === 'archived' ? 'ARCHIWUM' : t.status === 'active' ? 'W TRAKCIE' : 'PLANOWANIE';
  $('#lakeImage').src = t.lakeImage || 'https://raw.githubusercontent.com/serox94/ryby2026/main/assets/img/lowisko.jpg';
  $('#peg').textContent = t.peg || '—';
  ['waterSize','depth','carpRecord','power','baitBoat'].forEach(k => $('#'+k).textContent = t.facts?.[k] || '—');
  $('#totalWeight').textContent = Number(t.stats?.totalWeightKg || 0).toFixed(1);
  $('#fishCount').textContent = t.stats?.fishCount || 0;
  $('#biggestFish').textContent = t.stats?.biggestFishKg ? `${t.stats.biggestFishKg} kg` : '—';
  $('#biggestAngler').textContent = t.stats?.biggestFishAngler || 'Brak danych';
  $('#bestSpot').textContent = t.stats?.bestSpot || '—';
  $('#nextActionText').textContent = t.start && t.end ? 'Termin jest zapisany w bazie. Możemy teraz uzupełnić pełny profil łowiska i pozostałe moduły.' : 'Ustaw łowisko i termin. Dane zapiszą się wspólnie w Cloudflare D1.';
  renderCountdown();
  renderMenu();
  renderArchive();
  renderAnglers();
}

function renderCountdown() {
  if (!active.start) {
    $('#countdown').textContent = '—';
    $('#tripDates').textContent = 'Termin do ustawienia';
    return;
  }
  const days = Math.ceil((new Date(active.start) - new Date()) / 864e5);
  $('#countdown').textContent = days > 0 ? `${days} dni` : days === 0 ? 'DZISIAJ' : active.status === 'archived' ? 'ZAKOŃCZONY' : 'TRWA';
  $('#tripDates').textContent = `${fmtDate(active.start)} — ${fmtDate(active.end)}`;
}

function renderMenu() {
  const box = $('#tripMenu');
  box.innerHTML = model.trips.map(t => `<button data-trip="${t.id}"><b>${t.lake}</b><small>${t.year} · ${t.status === 'archived' ? 'archiwum' : 'wyjazd'}</small></button>`).join('');
  box.querySelectorAll('button').forEach(button => button.onclick = async () => {
    const id = button.dataset.trip;
    try {
      await api(`/api/trips/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      model = await api('/api/bootstrap');
      active = model.trips.find(t => t.id === id) || model.trips[0];
      box.classList.add('hidden');
      render();
    } catch (error) {
      alert(`Nie udało się zmienić wyjazdu: ${error.message}`);
    }
  });
}

function renderArchive() {
  const trips = model.trips.filter(t => t.status === 'archived');
  $('#archiveList').innerHTML = trips.length ? trips.map(t => `<article class="archive-item"><div><b>${t.name} · ${t.lake}</b><small>${fmtDate(t.start) || t.year} — ${fmtDate(t.end) || ''}</small></div><button data-open="${t.id}">Otwórz</button></article>`).join('') : '<div class="empty-state">Brak zakończonych wyjazdów.</div>';
  document.querySelectorAll('[data-open]').forEach(button => button.onclick = () => {
    active = model.trips.find(t => t.id === button.dataset.open);
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function renderAnglers() {
  $('#anglerGrid').innerHTML = model.anglers.map(a => `<article><div class="angler-head"><span>${a.name[0]}</span><div><h4>${a.name}</h4><small>PB: ${Number(a.pbKg).toFixed(1)} kg</small></div></div></article>`).join('');
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
  const lake = $('#inputLake').value.trim();
  const startDate = $('#inputStart').value;
  const endDate = $('#inputEnd').value;
  const year = new Date(`${startDate}T12:00:00`).getFullYear();
  const payload = {
    lake,
    country: $('#inputCountry').value.trim() || '—',
    peg: $('#inputPeg').value.trim() || '—',
    start: `${startDate}T12:00:00`,
    end: `${endDate}T12:00:00`,
    name: `${lake} ${year}`,
    year,
    status: 'planning'
  };
  try {
    $('#saveTrip').disabled = true;
    $('#saveTrip').textContent = 'Zapisywanie…';
    await api(`/api/trips/${encodeURIComponent(active.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
    model = await api('/api/bootstrap');
    active = model.trips.find(t => t.id === active.id) || model.trips[0];
    $('#tripDialog').close();
    render();
    setStatus('D1 online · zapisano');
  } catch (error) {
    alert(`Nie udało się zapisać: ${error.message}`);
  } finally {
    $('#saveTrip').disabled = false;
    $('#saveTrip').textContent = 'Zapisz w bazie';
  }
}

function bind() {
  $('#tripButton').onclick = () => $('#tripMenu').classList.toggle('hidden');
  $('#mobileMenu').onclick = () => $('#sidebar').classList.toggle('open');
  $('#editTrip').onclick = openDialog;
  $('#setupTrip').onclick = openDialog;
  $('#saveTrip').onclick = saveTrip;
}

load();
