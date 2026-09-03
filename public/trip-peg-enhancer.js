(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));

  function factsOf(trip) {
    return { ...(trip?.lakeProfile?.facts || {}), ...(trip?.facts || {}) };
  }

  function mount() {
    const trip = window.DREAM_TRIP;
    if (!trip) return false;

    const f = factsOf(trip);
    if (!f.pegName) return true;

    const photo = document.querySelector('.location-photo-card');
    if (!photo || document.getElementById('dream-peg-map-plan')) return true;

    const caption = photo.querySelector('.photo-caption');
    if (caption) {
      caption.textContent = `Wyjazd: ${f.pegName}${f.historicalPeg ? ` · na historycznej mapie: stare stanowisko ${f.historicalPeg}` : ''}. Dokładne spoty zapisujemy po sondowaniu na miejscu.`;
    }

    const section = document.createElement('section');
    section.id = 'dream-peg-map-plan';
    section.className = 'panel-card';

    const detail = (label, value) => value ? `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>` : '';
    const chip = f.historicalPeg ? `STARE ${f.historicalPeg} → NOWE ${f.peg || ''}` : `STANOWISKO ${f.peg || ''}`;
    const step1 = f.pegSurveyStep1 || 'Najpierw szeroki wachlarz Deeperem — bez rozstawiania wszystkich zestawów w ciemno.';
    const step2 = f.pegSurveyStep2 || `Zapisz najważniejsze krawędzie, przejścia dna i głębokości wskazane w planie: ${f.pegPrimaryDepthWindow || 'kilka różnych stref'}.`;
    const step3 = f.pegSurveyStep3 || 'Odległość, twardość dna, zielsko i zaczepy wpisz jako spoty dopiero po realnym skanie.';

    section.innerHTML = `
      <div class="section-head">
        <h3>🎯 ${esc(f.pegName)} — plan dna</h3>
        <span class="section-chip">${esc(chip)}</span>
      </div>
      <div class="dream-detail-list">
        ${detail('Numeracja', f.pegNumberingNote)}
        ${detail('Dojazd', f.pegAccess)}
        ${detail('Kierunek poszukiwania', f.pegOrientation)}
        ${detail('Batymetria', f.pegBathymetry)}
        ${detail('Twardość dna', f.pegBottom)}
        ${detail('Priorytet do sprawdzenia', f.pegPrimaryDepthWindow)}
        ${detail('Granica łowienia', f.pegFishingBoundary)}
        ${detail('Toaleta', f.pegToilet)}
        ${detail('Prąd', f.pegPower)}
        ${detail('Woda', f.pegWater)}
        ${detail('Pewność danych', f.pegMapConfidence)}
      </div>
      <div class="weather-interpretation" style="margin-top:14px">
        <div class="weather-note status-info">1. ${esc(step1)}</div>
        <div class="weather-note status-success">2. ${esc(step2)}</div>
        <div class="weather-note status-warn">3. ${esc(step3)}</div>
      </div>`;

    photo.insertAdjacentElement('afterend', section);
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (mount() || attempts >= 100) clearInterval(timer);
  }, 100);

  mount();
})();
