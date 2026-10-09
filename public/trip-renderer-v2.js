(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const route = () => location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
  const main = () => document.querySelector('main.container.page-content');

  function profileOf(trip) {
    return trip.lakeProfile || { id: trip.lakeId, name: trip.lake, country: trip.country, latitude: trip.latitude, longitude: trip.longitude, imageUrl: trip.lakeImage, facts: trip.facts || {} };
  }

  function factsOf(trip) {
    return { ...(trip.lakeProfile?.facts || {}), ...(trip.facts || {}) };
  }

  function status(text = '') {
    const t = String(text).toLowerCase();
    if (/zakaz|zabron|nie wolno|bez zwrotu|nie wraca|natychmiast|surow/.test(t)) return 'danger';
    if (/obowiązk|maks\.|maksymal|minimum|uwaga|wymag|należy|tylko/.test(t)) return 'warn';
    if (/dozwol|bezpłat|można|dostępn|zaleca/.test(t)) return 'success';
    return 'info';
  }

  function sentences(text = '') {
    return String(text).split(/(?<=[.!?])\s+/).map(x => x.trim()).filter(Boolean);
  }

  function note(text, forced) {
    return `<div class="weather-note status-${forced || status(text)}">${esc(text)}</div>`;
  }

  function docNotes(doc) {
    return sentences(doc.content).map(x => note(x)).join('');
  }

  function panel(title, chip, body) {
    return `<article class="panel-card"><div class="section-head"><h3>${title}</h3>${chip ? `<span class="section-chip">${esc(chip)}</span>` : ''}</div>${body}</article>`;
  }

  function knowledge(title, html) {
    return `<article class="knowledge-card"><h3>${title}</h3>${html}</article>`;
  }

  function stat(label, value, s = 'info') {
    if (!value) return '';
    return `<article class="stat-card status-${s}"><span class="label">${label}</span><strong>${esc(value)}</strong></article>`;
  }

  function sources(docs, profile) {
    const seen = new Map();
    if (Dream.safeUrl(profile?.sourceUrl)) seen.set(Dream.safeUrl(profile.sourceUrl), profile.name || 'Oficjalna strona łowiska');
    docs.forEach(d => { if (Dream.safeUrl(d.sourceUrl)) seen.set(Dream.safeUrl(d.sourceUrl), d.title || 'Źródło'); });
    if (!seen.size) return '';
    return `<section class="panel-card source-panel"><div class="section-head"><h3>🔎 Źródła i weryfikacja</h3><span class="section-chip">dane łowiska</span></div><div class="quick-links">${[...seen.entries()].map(([url,label]) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`).join('')}</div></section>`;
  }

  function renderDashboard(trip) {
    const p=profileOf(trip), hero=document.querySelector('.dashboard-hero');
    if(!hero)return;
    const set=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
    const date=value=>value?new Date(value).toLocaleDateString((document.documentElement.lang==='en'?'en-GB':'pl-PL'),{timeZone:Dream.zone(),day:'numeric',month:'short',year:'numeric'}):'do ustalenia';
    set('dashboard-status',trip.status==='archived'?'Archiwum':trip.isActive?'Aktywny wyjazd':'Wybrany wyjazd');
    set('dashboard-trip-name',trip.name);
    set('dashboard-lake',p.name||trip.lake);
    set('dashboard-peg',trip.peg||'do ustalenia');
    set('dashboard-dates',trip.start?`${date(trip.start)} – ${date(trip.end)}`:'do ustalenia');
    set('dashboard-crew',trip.participants.map(a=>a.name).join(' · ')||'do ustalenia');
    const stats=document.querySelector('main .dashboard-secondary-stats');
    if(stats&&!document.getElementById('dream-team-alltime-value'))stats.insertAdjacentHTML('beforeend','<article class="stat-card status-success"><span class="label">👑 Rekord z zapisanych połowów — wszystkie wyjazdy</span><strong id="dream-team-alltime-value">—</strong></article>');
    const target=document.getElementById('angler-stats');
    if(target)target.innerHTML=trip.participants.map(a=>{
      const id='angler-'+esc(a.id);
      return panel(`🎣 ${esc(a.name)}`,'TEN WYJAZD',`<div class="mini-stats">
        ${[['biggest','Największa ryba'],['total','Łączna waga'],['count','Liczba ryb'],['bait','Najlepsza przynęta'],['spot','Najlepszy spot']].map(([k,label])=>`<div><span>${label}</span><strong id="${id}-${k}">—</strong></div>`).join('')}
        </div><div class="pb-section"><div class="pb-top"><span>PB ze wszystkich lat, z uwzględnieniem wcześniejszego rekordu</span><strong id="${id}-pb-text">—</strong></div><div class="pb-track"><div id="${id}-pb-bar" class="pb-fill"></div></div><small>Największa ryba tego wyjazdu w stosunku do PB.</small></div>`);
    }).join('');
  }

  function renderMap(trip) {
    const p=profileOf(trip),f=factsOf(trip),card=document.querySelector('.location-photo-card');
    if(!card)return;
    const url=Dream.safeUrl(f.mapImage||p.imageUrl),image=card.querySelector('img');
    if(image){image.hidden=!url;if(url)image.src=url;image.alt=`Mapa / widok: ${p.name}`;}
    const caption=card.querySelector('.photo-caption');
    if(caption){const en=window.DreamI18n?.lang==='en';caption.innerHTML=url?`${esc(p.name)} · ${en?'overview map':'mapa orientacyjna'}. <a href="${esc(url)}" target="_blank" rel="noopener">${en?'Open full image':'Otwórz cały obraz'}</a>`:(en?'No lake map is available. Add an image URL in the lake profile.':'Brak mapy łowiska. Możesz dodać adres obrazu w profilu łowiska.');}
  }

  function renderDirections(trip, docs) {
    const m = main(); if (!m) return;
    const f = factsOf(trip), p = profileOf(trip);
    const logistics = docs.filter(d => d.kind === 'logistics');
    const facilities = docs.filter(d => d.kind === 'facilities');
    const reservation = docs.filter(d => d.kind === 'reservation');
    const maps = p.latitude != null && p.longitude != null ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.latitude},${p.longitude}`)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address || trip.lake)}`;

    const accessDocs = logistics.filter(d => /dojazd|przepraw|przyjazd|wyjazd/i.test(d.title));
    const baseDocs = logistics.filter(d => !accessDocs.includes(d));

    m.innerHTML = `<section class="hero-card"><h2>🧭 Dojazd i okolica</h2><p>Łowisko, dojazd, dostęp do stanowiska, kontakty i zaplecze — krótko i praktycznie.</p></section>
      <section class="two-column">
        ${panel('📍 Łowisko', 'GŁÓWNY PUNKT', `<div class="dream-detail-list">
          <div><span>Kraj</span><strong>${esc(p.country || trip.country || '—')}</strong></div>
          <div><span>Adres</span><strong>${esc(f.address || 'do uzupełnienia')}</strong></div>
          <div><span>GPS</span><strong>${p.latitude != null && p.longitude != null ? `${p.latitude}, ${p.longitude}` : '—'}</strong></div>
          ${f.managerPhone ? `<div><span>Manager</span><strong>${esc(f.managerPhone)}</strong></div>` : ''}
          ${f.crossingPhone ? `<div><span>Przeprawa</span><strong>${esc(f.crossingPhone)}</strong></div>` : ''}
        </div><a class="dream-action" href="${maps}" target="_blank" rel="noopener">🚗 Jedź do łowiska <span>→</span></a>`)}
        ${panel('📋 Logistyka na miejscu', 'WAŻNE', `<div class="weather-interpretation">${[...baseDocs, ...reservation].flatMap(d => sentences(d.content)).slice(0,8).map(x => note(x)).join('') || note('Brak zweryfikowanych danych logistycznych.', 'warn')}</div>`)}
      </section>
      <section class="two-column">
        ${panel('🚙 Dojazd / stanowiska', 'DOSTĘP', `<div class="weather-interpretation">${accessDocs.flatMap(d => sentences(d.content)).map(x => note(x)).join('') || note(f.access || 'Szczegóły dostępu do uzupełnienia.', 'info')}</div>`)}
        ${panel('⚡ Zaplecze', 'NA MIEJSCU', `<div class="weather-interpretation">${facilities.flatMap(d => sentences(d.content)).map(x => note(x)).join('')}${f.power ? note(`Prąd: ${f.power}`) : ''}${f.sanitary ? note(`Sanitariaty: ${f.sanitary}`) : ''}</div>`)}
      </section>
      ${sources(docs,p)}`;
  }

  function renderRules(trip, docs) {
    const m = main(); if (!m) return;
    const f = factsOf(trip), p = profileOf(trip);
    const rules = docs.filter(d => d.kind === 'rules' || d.kind === 'equipment');
    const by = titleRx => rules.filter(d => titleRx.test(d.title));
    const tackle = by(/wędk|wywóz|link|zestaw|hak|sprzęt/i);
    const fish = by(/ochron|ryb|carp|mata|worek/i);
    const boat = by(/łód|ponton|bezpieczeń/i);
    const stay = rules.filter(d => !tackle.includes(d) && !fish.includes(d) && !boat.includes(d));

    const renderGroup = (title, chip, group, fallback) => panel(title, chip, `<div class="weather-interpretation">${group.map(docNotes).join('') || note(fallback, 'info')}</div>`);

    m.innerHTML = `<section class="hero-card"><h2>📜 Regulamin łowiska</h2><p>Najważniejsze zasady dla ${esc(trip.lake)}. Kolory pomagają od razu odróżnić zakaz, obowiązek i rzeczy dozwolone.</p></section>
      <section class="stats-grid">
        ${stat('🎣 Wędki', f.rods, 'info')}
        ${stat('🤖 Łódka zanętowa', f.baitBoat, /dozwol/i.test(f.baitBoat || '') ? 'success' : 'warn')}
        ${stat('🛥️ Łódź / ponton', f.boat, /dozwol/i.test(f.boat || '') ? 'success' : 'warn')}
        ${stat('🏆 Rekord łowiska', f.carpRecord, 'success')}
      </section>
      <section class="two-column">
        ${renderGroup('🪝 Zestawy i wędki', 'KLUCZOWE', tackle, 'Brak szczegółowych zasad dotyczących zestawów.')}
        ${renderGroup('🐟 Ochrona ryb', 'BARDZO WAŻNE', fish, 'Brak szczegółowych zasad Carp Care.')}
      </section>
      <section class="two-column">
        ${renderGroup('🚤 Łódź i bezpieczeństwo', 'WODA', boat, f.boat || 'Brak danych.')}
        ${renderGroup('🏕️ Pobyt i zachowanie', 'PORZĄDEK', stay, 'Przed wyjazdem ponownie sprawdź aktualny regulamin operatora.')}
      </section>
      ${sources(docs,p)}`;
  }

  function renderAdvice(trip, docs) {
    const m = main(); if (!m) return;
    const f = factsOf(trip), p = profileOf(trip);
    const overview = docs.filter(d => d.kind === 'overview');
    const strategy = docs.filter(d => d.kind === 'strategy');
    const start = strategy.filter(d => /plan start|pierwsz|start/i.test(d.title));
    const where = strategy.filter(d => /gdzie|szuka/i.test(d.title));
    const bait = strategy.filter(d => /nęc|zanęt/i.test(d.title));
    const rigs = strategy.filter(d => /rig|zestaw/i.test(d.title));
    const rods = strategy.filter(d => /kij|wędk/i.test(d.title));
    const rest = strategy.filter(d => ![...start,...where,...bait,...rigs,...rods].includes(d));

    const practical = overview.length ? overview.map(d => knowledge(`🧠 ${esc(d.title)}`, `<p>${esc(d.content)}</p>`)).join('') : knowledge('🌊 Charakter wody', `<p>${esc(f.waterType || 'Profil łowiska będzie uzupełniony po researchu.')}</p>`);
    const strategyPanel = (title, chip, group, fallback) => panel(title, chip, `<div class="weather-interpretation">${group.flatMap(d => sentences(d.content)).map(x => note(x)).join('') || note(fallback,'info')}</div>`);

    m.innerHTML = `<section class="hero-card"><h2>💡 Porady na ${esc(trip.lake)}</h2><p>Encyklopedia praktyczna pod ten konkretny wyjazd: charakter wody, lokalizacja ryb, nęcenie, zestawy, reakcja na warunki i plan działania.</p></section>
      <section class="stats-grid">
        ${stat('🌊 Typ wody', f.waterType, 'info')}
        ${stat('📏 Wielkość', f.waterSize, 'info')}
        ${stat('↕️ Głębokość', f.depth, 'info')}
        ${stat('🏆 Rekord', f.carpRecord, 'success')}
        ${stat('🏕️ Stanowiska', f.stands, 'success')}
        ${stat('🎣 Wędki', f.rods, 'warn')}
        ${stat('🤖 RC', f.baitBoat, /dozwol/i.test(f.baitBoat || '') ? 'success' : 'info')}
        ${stat('⚡ Prąd', f.power, /brak/i.test(f.power || '') ? 'warn' : 'success')}
      </section>
      <section class="panel-card"><div class="section-head"><h3>🎣 To łowisko w praktyce</h3><span class="section-chip">${esc(trip.year)}</span></div><div class="knowledge-grid">${practical}</div></section>
      <section class="two-column">
        ${strategyPanel('📍 Gdzie szukać ryb', 'SPOTY', where, 'Najpierw obserwacja wody i znalezienie aktywności ryb.')}
        ${strategyPanel('⏱️ Plan startowy', 'PIERWSZE GODZINY', start, 'Zacznij od obserwacji, sondowania i kilku różnych stref.')}
      </section>
      <section class="two-column">
        ${strategyPanel('🍪 Nęcenie', 'JEDZENIE', bait, 'Zacznij ostrożnie i zwiększaj ilość dopiero po potwierdzeniu obecności ryb.')}
        ${strategyPanel('🪝 Zestawy / rigi', 'TECHNIKA', rigs, 'Dobierz prezentację do rodzaju dna i zaczepów.')}
      </section>
      <section class="two-column">
        ${strategyPanel('🎯 Podział wędek i decyzje', 'TAKTYKA', rods, 'Nie zmieniaj wszystkich wędek jednocześnie — testuj jedną zmianę naraz.')}
        ${strategyPanel('🧭 Dodatkowe wskazówki', 'PRAKTYKA', rest, 'Po wyborze stanowiska dopracujemy plan A/B/C dla konkretnego sektora.')}
      </section>
      ${sources(docs,p)}`;
  }

  async function render({ trip, documents }) {
    if (!trip) return;
    const path = route();
    if (path === '' || path === '/' || path.endsWith('/index')) renderDashboard(trip);
    if (path.endsWith('/pages/teren')) window.DreamField?.renderGuide(trip, documents || []);
    if (path.endsWith('/pages/mapa')) renderMap(trip);
    const profile=profileOf(trip),pack=profile.facts?.contentPack;
    const topic=path.endsWith('/pages/regulamin')?'rules':path.endsWith('/pages/dojazd')?'logistics':path.endsWith('/pages/porady')?'advice':null;
    const extra=topic?profile.facts?.[topic+'Text']:null;
    if(extra)documents=[...(documents||[]),{kind:topic==='advice'?'overview':topic,title:'Zapisane informacje o łowisku',content:extra}];
    document.querySelectorAll('[data-lake-only]').forEach(el=>el.hidden=el.dataset.lakeOnly!==pack);
    if(pack==='plaine2' && /\/pages\/(dojazd|regulamin|porady)$/.test(path)){
      const name=path.split('/').pop();
      const response=await fetch(`/data/lakes/plaine2/${name}.html`);
      if(!response.ok)throw new Error('Nie udało się wczytać zachowanej wiedzy o łowisku.');
      main().innerHTML=await response.text();
      if(extra)main().insertAdjacentHTML('beforeend',panel('Zapisane informacje o łowisku','PROFIL',`<p class="preserve-lines">${esc(extra)}</p>`));
      return;
    }
    if (path.endsWith('/pages/dojazd')) renderDirections(trip, documents || []);
    if (path.endsWith('/pages/regulamin')) renderRules(trip, documents || []);
    if (path.endsWith('/pages/porady')) renderAdvice(trip, documents || []);
  }

  window.DreamTripRenderer = { render };
})();
