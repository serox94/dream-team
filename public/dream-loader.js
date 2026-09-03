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
  const route = name => location.pathname.includes(`/pages/${name}`) || location.pathname.includes(`/pages/${name}.html`);

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

  const docsBy = (docs, kinds) => docs.filter(d => kinds.includes(d.kind));
  function cards(items) {
    return items.map(d => `<article class="knowledge-card"><h3>${esc(d.title)}</h3><p>${esc(d.content)}</p>${d.sourceUrl ? `<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener">Źródło ↗</a>` : ''}</article>`).join('');
  }
  function factCards(f) {
    const rows = [
      ['🏞️ Typ wody', f.waterType], ['📏 Wielkość', f.waterSize], ['🌊 Głębokość', f.depth], ['🏆 Rekord', f.carpRecord],
      ['🏕️ Stanowiska', f.stands], ['🎣 Wędki', f.rods], ['🤖 RC', f.baitBoat], ['🛥️ Łódź / ponton', f.boat],
      ['⚡ Prąd', f.power], ['🚻 Sanitariaty', f.sanitary || f.toilets]
    ].filter(([,v]) => v);
    return rows.map(([k,v]) => `<article class="stat-card status-info"><span class="label">${k}</span><strong>${esc(v)}</strong></article>`).join('');
  }
  function notes(items) {
    return `<div class="weather-interpretation">${items.map(x => `<div class="weather-note ${x[0] || 'status-info'}">${esc(x[1])}</div>`).join('')}</div>`;
  }

  function renderWygoninAdvice(main, trip, docs) {
    const f = trip.facts || {};
    const strategy = docsBy(docs, ['strategy']);
    const overview = docsBy(docs, ['overview']);
    main.innerHTML = `
      <section class="hero-card"><h2>Porady — Jezioro Wygonin</h2><p>Taktyka przygotowana pod Wygonin i planowany tygodniowy wyjazd w maju 2027. Nie jest kopią Plaine 2 — zmienia się razem z łowiskiem.</p></section>
      <section class="stats-grid">${factCards(f)}</section>
      <section class="panel-card"><div class="section-head"><h3>🎣 Charakter łowiska</h3><span class="section-chip">WYGONIN</span></div><div class="knowledge-grid">${cards(overview)}</div></section>
      <section class="two-column">
        <article class="panel-card"><div class="section-head"><h3>📍 Gdzie szukać ryb w maju</h3><span class="section-chip">SPOTY</span></div>${notes([
          ['status-success','Płytsze zatoki i krawędzie roślinności po kilku ciepłych dniach oraz przy ciepłym wietrze.'],
          ['status-info','Krawędzie blatów, spady i przejścia twarde–miękkie jako najbardziej uniwersalny punkt startowy.'],
          ['status-warn','Nie bój się 10–12 m — opiekun łowiska wskazuje, że karpie regularnie przebywają na takich głębokościach.'],
          ['status-info','Zatopione drzewa i zaczepy są atrakcyjne, ale zestaw kładź obok bezpiecznej trasy holu, nie w sam problem.']
        ])}</article>
        <article class="panel-card"><div class="section-head"><h3>🧭 Pierwsze 24 godziny</h3><span class="section-chip">PLAN</span></div>${notes([
          ['status-success','Wytypować trzy różne strefy: płytką, pośrednią i głębszą.'],
          ['status-info','Sondować dokładnie, ale ograniczyć niepotrzebne pływanie po wodzie.'],
          ['status-info','Zacząć od małych, precyzyjnych porcji zanęty i dopiero po oznakach ryb zwiększać ilość.'],
          ['status-warn','Nie rozstawiać wielu markerów — na tej wodzie lepsza jest dyskrecja i zapamiętanie linii / GPS.']
        ])}</article>
      </section>
      <section class="panel-card"><div class="section-head"><h3>🪝 Plan zestawów Patryk + Maciek</h3><span class="section-chip">MAJ 2027</span></div><div class="knowledge-grid">
        <article class="knowledge-card"><h3>Kij 1 — strefa aktywna</h3><p>Krawędź roślinności, nagrzewająca się płytsza woda albo strefa pod ciepłym wiatrem. Ronnie / Spinner z małym pop-upem, jeśli dno jest lekko zabrudzone.</p></article>
        <article class="knowledge-card"><h3>Kij 2 — blat / spad</h3><p>German Rig lub Slip-D z wafterem na czystszym, twardszym miejscu. To powinien być kij najbardziej stabilny przez dobę.</p></article>
        <article class="knowledge-card"><h3>Kij 3 — mobilny</h3><p>Pod pokazy ryb, zmianę wiatru albo głębszą półkę 10–12 m. Ten kij ma testować wodę, a nie stać tydzień w jednym miejscu.</p></article>
      </div></section>
      <section class="panel-card"><div class="section-head"><h3>📚 Research i konkretne wskazówki</h3><span class="section-chip">ŹRÓDŁA</span></div><div class="knowledge-grid">${cards(strategy)}</div></section>`;
  }

  function renderWygoninRules(main, trip, docs) {
    const f = trip.facts || {};
    main.innerHTML = `
      <section class="hero-card"><h2>Regulamin — Jezioro Wygonin</h2><p>Najważniejsze zasady łowienia, bezpieczeństwa ryb i organizacji pobytu dla aktywnego wyjazdu.</p></section>
      <section class="stats-grid">${factCards(f)}</section>
      <section class="knowledge-grid">${cards(docsBy(docs, ['rules','equipment']))}</section>
      <section class="panel-card"><div class="section-head"><h3>⚠️ Przed wyjazdem sprawdź ponownie</h3><span class="section-chip">WAŻNE</span></div>${notes([
        ['status-warn','Liczbę wędek trzeba potwierdzić w rezerwacji — regulamin dopuszcza maks. 4 na osobę, ale pakiet może obejmować 3.'],
        ['status-danger','Suchy lub źle przygotowany orzech / ziarno jest zabronione.'],
        ['status-danger','Na łodzi lub pontonie kamizelka ratunkowa jest obowiązkowa.'],
        ['status-info','Przed terminem 2027 ponownie pobrać aktualny regulamin — zasady mogą się zmienić.']
      ])}</section>`;
  }

  function renderWygoninAccess(main, trip, docs) {
    const f = trip.facts || {};
    main.innerHTML = `
      <section class="hero-card"><h2>Dojazd i okolica — Jezioro Wygonin</h2><p>${esc(f.address || 'Wygonin 12C, 83-430 Wygonin')} · dane logistyczne aktywnego wyjazdu.</p></section>
      <section class="two-column">
        <article class="panel-card"><div class="section-head"><h3>📍 Główny punkt</h3><span class="section-chip">PRZYSTAŃ</span></div><div class="mini-stats">
          <div><span>Adres</span><strong>${esc(f.address || 'Wygonin 12C, 83-430 Wygonin')}</strong></div>
          <div><span>Manager</span><strong>${esc(f.managerPhone || '+48 510 410 410')}</strong></div>
          <div><span>Przeprawy</span><strong>${esc(f.crossingPhone || '+48 510 440 340')}</strong></div>
          <div><span>Parking</span><strong>${esc(f.parking || 'bezpłatny przy Przystani')}</strong></div>
        </div><div style="margin-top:16px"><a class="secondary-btn" href="https://www.google.com/maps/search/?api=1&query=Wygonin+12C+83-430+Wygonin" target="_blank" rel="noopener">🧭 Otwórz trasę w Google Maps</a></div></article>
        <article class="panel-card"><div class="section-head"><h3>🚗 Dojazd do stanowiska</h3><span class="section-chip">STANOWISKA</span></div>${notes([
          ['status-info','15–16: dojazd autem tylko na rozładunek / załadunek; potem samochód za szlaban.'],
          ['status-success','19–34: dojazd autem; auto może zostać przy stanowisku, jeśli nie blokuje przejazdu.'],
          ['status-warn','Część pozostałych stanowisk wymaga przeprawy wodą.'],
          ['status-danger','Kamperem ani przyczepą kempingową nie wjedziesz na stanowisko.']
        ])}</article>
      </section>
      <section class="panel-card"><div class="section-head"><h3>🛥️ Przeprawa</h3><span class="section-chip">MIN. 2 DNI WCZEŚNIEJ</span></div>${notes([
        ['status-warn',f.crossing || 'Przeprawę ustalić minimum 2 dni wcześniej.'],
        ['status-info','Można przeprawić się własnym pontonem i silnikiem.'],
        ['status-info','Po przyjeździe i przed wyjazdem trzeba wysłać do managera SMS/MMS z numerem stanowiska i zdjęciem.']
      ])}</section>
      <section class="knowledge-grid">${cards(docsBy(docs, ['logistics','facilities','reservation']))}</section>`;
  }

  function applyDynamicTripContent(trip, docs) {
    const f = trip.facts || {};
    const path = location.pathname;
    const main = document.querySelector('main.container.page-content');

    if (path === '/' || path.endsWith('/index.html')) {
      const notesEls = document.querySelectorAll('.hero-card .weather-note');
      if (notesEls[0]) notesEls[0].textContent = `📍 Łowisko: ${trip.lake}`;
      if (notesEls[1]) notesEls[1].textContent = `🎣 ${f.waterSize || 'Dane łowiska'} · ${f.depth || ''}`;
      if (notesEls[2]) notesEls[2].textContent = trip.start ? '🧠 Dane i moduły są przypisane do aktywnego wyjazdu' : '🧠 Termin nieustalony — profil łowiska i research są już gotowe';
    }

    if (route('mapa')) {
      const img = document.querySelector('.location-photo-card img');
      if (img) { img.src = f.mapImage || trip.lakeImage || img.src; img.alt = `Widok / mapa: ${trip.lake}`; }
      const caption = document.querySelector('.location-photo-card .photo-caption');
      if (caption) caption.innerHTML = `<strong>${esc(trip.lake)}</strong> — grafika przypisana do aktywnego wyjazdu. Spoty poniżej są przechowywane oddzielnie dla tego wyjazdu.`;
    }

    if (trip.id === 'poland-2027' && main) {
      if (route('porady')) return renderWygoninAdvice(main, trip, docs);
      if (route('regulamin')) return renderWygoninRules(main, trip, docs);
      if (route('dojazd')) return renderWygoninAccess(main, trip, docs);
    }

    if (route('regulamin') && main && docs.length) {
      main.innerHTML = `<section class="hero-card"><h2>Regulamin — ${esc(trip.lake)}</h2><p>Zasady przypisane do aktywnego wyjazdu.</p></section><section class="stats-grid">${factCards(f)}</section><section class="knowledge-grid">${cards(docsBy(docs,['rules','equipment','logistics','facilities','reservation']))}</section>`;
    }
    if (route('porady') && main && docs.length) {
      main.innerHTML = `<section class="hero-card"><h2>Porady — ${esc(trip.lake)}</h2><p>Taktyka dla tego łowiska i terminu.</p></section><section class="stats-grid">${factCards(f)}</section><section class="knowledge-grid">${cards(docsBy(docs,['overview','strategy']))}</section>`;
    }
    if (route('dojazd') && main && docs.length) {
      main.innerHTML = `<section class="hero-card"><h2>Dojazd / okolica — ${esc(trip.lake)}</h2><p>${esc(f.address || trip.country || '')}</p></section><section class="knowledge-grid">${cards(docsBy(docs,['logistics','facilities','reservation']))}</section>`;
    }
  }

  bindMobileMenu();
  document.addEventListener('DOMContentLoaded', bindMobileMenu, { once: true });

  try {
    const response = await fetch('/api/bootstrap', { cache: 'no-store' });
    const model = await response.json();
    const trip = model.trips.find(t => t.id === model.app.activeTripId) || model.trips[0];
    window.DREAM_MODEL = model; window.DREAM_TRIP = trip || null;

    if (trip) {
      document.title = document.title.replace('Ryby 2026', 'Dream Team');
      document.querySelectorAll('.site-header h1').forEach(el => el.textContent = 'Dream Team');
      document.querySelectorAll('.subtitle').forEach(el => el.textContent = trip.lake || 'Dream Team');
      const format = value => value ? new Intl.DateTimeFormat('pl-PL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)) : '—';
      document.querySelectorAll('.trip-box').forEach(box => { const rows=box.querySelectorAll('div'); if(rows[0]) rows[0].innerHTML=`<strong>Wyjazd:</strong> ${format(trip.start)}`; if(rows[1]) rows[1].innerHTML=`<strong>Powrót:</strong> ${format(trip.end)}`; });
      const headerTop = document.querySelector('.header-top > div:first-child');
      if (headerTop && model.trips.length > 1 && !headerTop.querySelector('.dream-trip-select')) {
        const select=document.createElement('select'); select.className='dream-trip-select'; select.setAttribute('aria-label','Aktywny wyjazd');
        for(const t of model.trips){const o=document.createElement('option');o.value=t.id;o.textContent=`${t.year} · ${t.lake}${t.status==='archived'?' · archiwum':''}`;o.selected=t.id===trip.id;select.appendChild(o)}
        select.addEventListener('change',async()=>{select.disabled=true;await fetch(`/api/trips/${encodeURIComponent(select.value)}/activate`,{method:'POST'});location.reload()}); headerTop.appendChild(select);
      }
      const countdown=document.getElementById('countdown'); if(countdown){const update=()=>{if(!trip.start){countdown.innerHTML='<strong>Status:</strong> termin do ustawienia';return}const now=Date.now(),start=new Date(trip.start).getTime(),end=trip.end?new Date(trip.end).getTime():start;if(now>end)countdown.innerHTML='<strong>Status:</strong> zakończony';else if(now>=start)countdown.innerHTML='<strong>Status:</strong> trwa';else countdown.innerHTML=`<strong>Status:</strong> ${Math.ceil((start-now)/86400000)} dni do wyjazdu`};update();setInterval(update,60000)}
    }

    await loadScript('/d1-supabase-compat.js');
    await loadScript('/app.js');
    if (document.querySelector('[data-use-fixes]') || route('pogoda')) await loadScript('/fixes.js').catch(() => {});
    await loadScript('/app-plus.js').catch(() => {});
    if (document.getElementById('fishChart')) await loadScript('/dashboard-chart.js').catch(() => {});
    if (trip) applyDynamicTripContent(trip, await getDocuments(trip.id));
    bindMobileMenu();
  } catch (error) {
    console.error('Dream Team loader failed', error);
    const main=document.querySelector('main'); if(main) main.insertAdjacentHTML('afterbegin',`<div class="container"><div class="empty-box">Błąd uruchamiania Dream Team: ${esc(error.message||error)}</div></div>`);
  }
})();