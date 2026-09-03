(async () => {
  const STORAGE_KEY = 'dream_team_viewed_trip';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  async function getJson(url, options = {}) {
    const r = await fetch(url, { cache: 'no-store', ...options });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || data.detail || `HTTP ${r.status}`);
    return data;
  }

  async function loadScript(src) {
    if ($(`script[data-dream-src="${src}"]`)) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.dataset.dreamSrc = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function formatTripDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pl-PL', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function countdownText(trip) {
    if (!trip?.start) return 'termin do ustawienia';
    const now = Date.now();
    const start = new Date(trip.start).getTime();
    const end = trip.end ? new Date(trip.end).getTime() : null;
    if (Number.isFinite(end) && now > end) return 'wyjazd zakończony';
    if (now >= start) return 'wyjazd trwa';
    const days = Math.ceil((start - now) / 86400000);
    return `${days} dni do wyjazdu`;
  }

  function selectTrip(model) {
    const stored = localStorage.getItem(STORAGE_KEY);
    return model.trips.find(t => t.id === stored)
      || model.trips.find(t => t.id === model.app.activeTripId)
      || model.trips[0]
      || null;
  }

  function installTripSelect(model, trip) {
    const headerLeft = $('.header-top > div:first-child');
    if (!headerLeft || $('#dream-trip-select')) return;
    const select = document.createElement('select');
    select.id = 'dream-trip-select';
    select.className = 'dream-trip-select';
    select.setAttribute('aria-label', 'Wybierz wyjazd');
    model.trips.forEach(t => {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = `${t.year} · ${t.lake}`;
      o.selected = t.id === trip.id;
      select.appendChild(o);
    });
    select.addEventListener('change', () => {
      localStorage.setItem(STORAGE_KEY, select.value);
      location.reload();
    });
    headerLeft.appendChild(select);
  }

  function updateHeader(model, trip) {
    const subtitle = $('.subtitle');
    if (subtitle) subtitle.textContent = trip?.lake || 'Dream Team';
    installTripSelect(model, trip);
    const box = $('.trip-box');
    if (box) {
      box.innerHTML = `<div><strong>Wyjazd:</strong> ${formatTripDate(trip?.start)}</div>
        <div><strong>Powrót:</strong> ${formatTripDate(trip?.end)}</div>
        <div id="countdown"><strong>Status:</strong> ${countdownText(trip)}</div>`;
    }
  }

  function bindMobileMenu() {
    $$('.menu-toggle').forEach(button => {
      if (button.dataset.dreamBound) return;
      button.dataset.dreamBound = '1';
      const nav = button.closest('.mobile-nav-wrap')?.querySelector('.main-nav') || $('.main-nav');
      if (!nav) return;
      button.addEventListener('click', e => {
        e.preventDefault();
        const open = nav.classList.toggle('open');
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      $$('a', nav).forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
    });
  }

  function markActiveNav() {
    const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    $$('.main-nav a').forEach(a => {
      const p = new URL(a.href, location.href).pathname.replace(/\.html$/, '').replace(/\/$/, '');
      const active = p === path || (path === '' && p.endsWith('/index')) || (path === '/' && p.endsWith('/index'));
      a.classList.toggle('active', active);
    });
  }

  function setCurrentDateTime() {
    const input = document.getElementById('caught_at');
    const edit = document.getElementById('edit-catch-id');
    if (!input || edit?.value || input.value) return;
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    input.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  try {
    const model = await getJson('/api/bootstrap');
    const trip = selectTrip(model);
    if (!trip) throw new Error('Brak wyjazdów w bazie');

    window.DREAM_MODEL = model;
    window.DREAM_TRIP = trip;
    window.DREAM_VIEWED_TRIP_ID = trip.id;

    updateHeader(model, trip);
    bindMobileMenu();
    markActiveNav();

    await loadScript('/d1-supabase-compat.js?v=5');
    await loadScript('/app.js?v=5');

    const path = location.pathname.replace(/\.html$/, '');
    if (path.endsWith('/pages/pogoda')) await loadScript('/fixes.js?v=5');
    await loadScript('/app-plus.js?v=5');
    if (document.getElementById('weightChart')) await loadScript('/dashboard-chart.js?v=5');
    await loadScript('/trip-renderer-v2.js?v=5');

    if (window.DreamTripRenderer?.render) {
      const documents = await getJson(`/api/documents?tripId=${encodeURIComponent(trip.id)}`).then(x => x.documents || []).catch(() => []);
      await window.DreamTripRenderer.render({ model, trip, documents });
    }

    setCurrentDateTime();
    bindMobileMenu();
    markActiveNav();
  } catch (error) {
    console.error('Dream Team bootstrap failed:', error);
    const box = $('.trip-box');
    if (box) box.innerHTML = '<div><strong>Status:</strong> błąd ładowania danych</div>';
  }
})();
