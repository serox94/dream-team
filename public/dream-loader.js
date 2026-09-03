(async () => {
  async function loadScript(src) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

  function bindMobileMenu() {
    document.querySelectorAll('.menu-toggle').forEach(button => {
      if (button.dataset.dreamMenuBound === '1') return;
      button.dataset.dreamMenuBound = '1';
      const wrap = button.closest('.mobile-nav-wrap') || button.parentElement;
      const nav = wrap?.querySelector('.main-nav') || document.querySelector('.main-nav');
      if (!nav) return;
      button.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        const open = nav.classList.toggle('open');
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
        nav.classList.remove('open'); button.setAttribute('aria-expanded', 'false');
      }));
    });
  }

  async function getDocuments(tripId) {
    try {
      const r = await fetch(`/api/documents?tripId=${encodeURIComponent(tripId)}`, { cache: 'no-store' });
      const d = await r.json();
      return Array.isArray(d.documents) ? d.documents : [];
    } catch (_) { return []; }
  }

  function cards(items) {
    return items.map(d => `<article class="knowledge-card"><h3>${esc(d.title)}</h3><p>${esc(d.content)}</p>${d.sourceUrl ? `<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">Źródło ↗</a>` : ''}</article>`).join('');
  }

  function factCards(f) {
    const rows = [
      ['🌊 Typ / wielkość', f.waterSize], ['↕️ Głębokość', f.depth], ['🏆 Rekord karpia', f.carpRecord],
      ['🎣 Wędki', f.rods], ['🛥️ Łódź / ponton', f.boat], ['🤖 Łódka zanętowa', f.baitBoat],
      ['⚡ Prąd', f.power], ['🚻 Sanitariaty', f.sanitary || f.toilets], ['🐟 Ryby', f.fish]
    ].filter(([,v]) => v);
    return rows.map(([k,v]) => `<article class="stat-card status-info"><span class="label">${k}</span><strong>${esc(v)}</strong></article>`).join('');
  }

  function applyDynamicTripContent(trip, docs) {
    // France (current and archived Plaine 2) keeps the full original Ryby2026 modules 1:1.
    // Only trips explicitly built as dynamic use DB-driven replacement content.
    if (trip.id !== 'poland-2027') return;

    const f = trip.facts || {};
    const path = location.pathname.replace(/\.html$/,'');

    if (path === '/' || path.endsWith('/index')) {
      const notes = document.querySelectorAll('.hero-card .weather-note');
      if (notes[0]) notes[0].textContent = `📍 Łowisko: ${trip.lake}`;
      if (notes[1]) notes[1].textContent = `🎣 ${f.waterSize || 'Dane łowiska'} · ${f.depth || ''}`;
      if (notes[2]) notes[2].textContent = trip.start ? '🧠 Dane, pogoda, mapa, checklisty i porady są przypisane do tego wyjazdu' : '🧠 Termin nieustalony — dane łowiska są już gotowe';
    }

    if (path.endsWith('/pages/mapa')) {
      const img = document.querySelector('.location-photo-card img');
      if (img) {
        img.src = f.mapImage || trip.lakeImage || img.src;
        img.alt = `Jezioro / mapa: ${trip.lake}`;
      }
      const caption = document.querySelector('.location-photo-card .photo-caption');
      if (caption) caption.innerHTML = `<strong>${esc(trip.lake)}</strong> — widok poglądowy aktywnego łowiska. Zapisane spoty poniżej są oddzielne dla tego wyjazdu.${f.mapImageSource ? ` <span class="muted-small">Źródło zdjęcia: ${esc(f.mapImageSource)}</span>` : ''}`;
    }

    if (path.endsWith('/pages/regulamin') && docs.length) {
      const main = document.querySelector('main.container.page-content');
      const selected = docs.filter(d => ['rules','equipment','logistics','facilities','reservation'].includes(d.kind));
      if (main && selected.length) main.innerHTML = `
        <section class="hero-card"><h2>Regulamin — ${esc(trip.lake)}</h2><p>Aktualne zasady i wymagania przypisane do wybranego wyjazdu. Przed wyjazdem zawsze weryfikujemy najnowszą wersję u operatora łowiska.</p></section>
        <section class="stats-grid">${factCards(f)}</section>
        <section class="knowledge-grid">${cards(selected)}</section>`;
    }

    if (path.endsWith('/pages/porady') && docs.length) {
      const main = document.querySelector('main.container.page-content');
      const selected = docs.filter(d => ['overview','strategy'].includes(d.kind));
      if (main && selected.length) main.innerHTML = `
        <section class="hero-card"><h2>Porady — ${esc(trip.lake)}</h2><p>Taktyka dla tego konkretnego łowiska i planowanego terminu. Treść zmienia się razem z aktywnym wyjazdem.</p></section>
        <section class="stats-grid">${factCards(f)}</section>
        <section class="knowledge-grid">${cards(selected)}</section>`;
    }

    if (path.endsWith('/pages/dojazd') && docs.length) {
      const main = document.querySelector('main.container.page-content');
      const selected = docs.filter(d => ['logistics','facilities','reservation'].includes(d.kind));
      if (main && selected.length) main.innerHTML = `
        <section class="hero-card"><h2>Dojazd / okolica — ${esc(trip.lake)}</h2><p>${esc(f.address || trip.country || '')}</p></section>
        <section class="knowledge-grid">${cards(selected)}</section>`;
    }
  }

  bindMobileMenu();
  document.addEventListener('DOMContentLoaded', bindMobileMenu, { once: true });

  try {
    const response = await fetch('/api/bootstrap', { cache: 'no-store' });
    const model = await response.json();
    const trip = model.trips.find(t => t.id === model.app.activeTripId) || model.trips[0];
    window.DREAM_MODEL = model;
    window.DREAM_TRIP = trip || null;

    if (trip) {
      document.title = document.title.replace('Ryby 2026', 'Dream Team');
      document.querySelectorAll('.site-header h1').forEach(el => el.textContent = 'Dream Team');
      document.querySelectorAll('.subtitle').forEach(el => el.textContent = trip.lake || 'Dream Team');

      const format = value => value ? new Intl.DateTimeFormat('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '—';
      document.querySelectorAll('.trip-box').forEach(box => {
        const rows = box.querySelectorAll('div');
        if (rows[0]) rows[0].innerHTML = `<strong>Wyjazd:</strong> ${format(trip.start)}`;
        if (rows[1]) rows[1].innerHTML = `<strong>Powrót:</strong> ${format(trip.end)}`;
      });

      const headerTop = document.querySelector('.header-top > div:first-child');
      if (headerTop && model.trips.length > 1 && !headerTop.querySelector('.dream-trip-select')) {
        const select = document.createElement('select');
        select.className = 'dream-trip-select'; select.setAttribute('aria-label', 'Aktywny wyjazd');
        for (const t of model.trips) {
          const option = document.createElement('option');
          option.value = t.id; option.textContent = `${t.year} · ${t.lake}${t.status === 'archived' ? ' · archiwum' : ''}`; option.selected = t.id === trip.id;
          select.appendChild(option);
        }
        select.addEventListener('change', async () => { select.disabled = true; await fetch(`/api/trips/${encodeURIComponent(select.value)}/activate`, { method:'POST' }); location.reload(); });
        headerTop.appendChild(select);
      }

      const countdown = document.getElementById('countdown');
      if (countdown) {
        const update = () => {
          if (!trip.start) { countdown.innerHTML = '<strong>Status:</strong> termin do ustawienia'; return; }
          const now=Date.now(), start=new Date(trip.start).getTime(), end=trip.end?new Date(trip.end).getTime():start;
          if (now>end) countdown.innerHTML='<strong>Status:</strong> zakończony';
          else if (now>=start) countdown.innerHTML='<strong>Status:</strong> trwa';
          else countdown.innerHTML=`<strong>Status:</strong> ${Math.ceil((start-now)/86400000)} dni do wyjazdu`;
        };
        update(); setInterval(update, 60000);
      }
    }

    await loadScript('/d1-supabase-compat.js');
    await loadScript('/app.js');
    if (document.querySelector('[data-use-fixes]') || location.pathname.includes('pogoda')) await loadScript('/fixes.js').catch(() => {});
    await loadScript('/app-plus.js').catch(() => {});
    if (document.getElementById('fishChart')) await loadScript('/dashboard-chart.js').catch(() => {});

    if (trip && trip.id === 'poland-2027') applyDynamicTripContent(trip, await getDocuments(trip.id));
    bindMobileMenu();
  } catch (error) {
    console.error('Dream Team loader failed', error);
    const main = document.querySelector('main');
    if (main) main.insertAdjacentHTML('afterbegin', `<div class="container"><div class="empty-box">Błąd uruchamiania Dream Team: ${esc(error.message || error)}</div></div>`);
  }
})();