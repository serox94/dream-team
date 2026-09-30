// Static, versioned editorial data. No screenshot or answer leaves this browser.
const root=document.getElementById('knowledge-root');
if(root){
const module=root.dataset.module, sonar=module==='sonar';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=id=>document.getElementById(id);
const label={science:'📘 nauka / technika',practice:'🎣 praktyka',manufacturer:'🏭 producent',community:'💬 społeczność',sonar:'📡 dokumentacja sonaru'};
const route=id=>(id.startsWith('sonar-')?'/pages/sonar.html':'/pages/encyklopedia.html')+'#'+encodeURIComponent(id);
const paths=['sources','encyclopedia','sonar','tools'];
const data=await Promise.all(paths.map(async name=>{
  const response=await fetch(`/data/knowledge/${name}.json`,{credentials:'same-origin'});
  if(!response.ok)throw Error(`Nie udało się odczytać ${name} (${response.status})`);
  return response.json();
})).catch(error=>{root.innerHTML=`<section class="panel-card"><h2>Treść chwilowo niedostępna</h2><p>${esc(error.message)}. Sprawdź połączenie i odśwież stronę.</p></section>`;return null;});
if(data){
const [sources,encyclopedia,sonarData,tools]=data, catalog=sonar?sonarData:encyclopedia;
const index=new Map([...encyclopedia.articles,...sonarData.articles].map(a=>[a.id,a]));
const sourceIndex=new Map(sources.sources.map(s=>[s.id,s]));
const diagramNames={cone:'Stożek wiązki',hardsoft:'Twarde i miękkie dno',gravel:'Żwir',silt:'Muł',weed:'Zielsko',clearing:'Czyste oczko',plateau:'Plateau',slope:'Spadek',trench:'Rów',fish:'Łuk ryby',school:'Stado',thermocline:'Możliwa termoklina'};
const bottoms={cone:'M18 148 L300 148',hardsoft:'M18 143 L150 143 L158 154 L300 154',gravel:'M18 140 L38 137 L56 140 L73 134 L94 139 L112 135 L130 140 L150 136 L170 140 L190 136 L211 139 L230 134 L250 139 L272 136 L300 140',silt:'M18 143 Q80 147 140 146 T300 148',weed:'M18 147 L300 147',clearing:'M18 147 L300 147',plateau:'M18 155 L70 155 L110 95 L215 95 L260 155 L300 155',slope:'M18 89 L88 89 L210 155 L300 155',trench:'M18 100 L92 100 L130 153 L220 153 L264 100 L300 100',fish:'M18 151 L300 151',school:'M18 151 L300 151',thermocline:'M18 153 L300 153'};
const weedAt=(x,y=147)=>`<path d="M${x} ${y} q-9 -20 0 -40 q8 20 0 40 m0 0 q13 -32 7 -56" fill="none" stroke="#8cc477" stroke-width="3"/>`;
function diagram(type){
  if(!bottoms[type])return '';
  let extras='';
  if(type==='cone')extras='<path d="M160 25 L78 148 L242 148 Z" fill="#a4bb9a" fill-opacity=".12" stroke="#d8d6a2" stroke-dasharray="5 5"/><circle cx="160" cy="25" r="8" fill="#d5dba5"/><circle cx="205" cy="112" r="5" fill="#eeb783"/>';
  if(type==='hardsoft')extras='<path d="M18 134 L150 134" stroke="#eec774" stroke-width="9"/><path d="M157 151 L300 151" stroke="#8babc0" stroke-width="3"/><path d="M18 163 L150 163" stroke="#eec774" stroke-width="3" stroke-dasharray="8 6"/>';
  if(type==='gravel')extras='<path d="M18 145 L300 145" stroke="#edc375" stroke-width="8" opacity=".75"/><path d="M40 161 L258 161" stroke="#edc375" stroke-width="2" stroke-dasharray="12 11"/>';
  if(type==='silt')extras='<path d="M18 144 Q150 151 300 146" stroke="#8daec0" stroke-width="4" opacity=".65"/>';
  if(type==='weed')extras=[50,78,113,155,196,239,274].map(x=>weedAt(x)).join('');
  if(type==='clearing')extras=[50,78,113,229,258,283].map(x=>weedAt(x)).join('')+'<path d="M139 138 L209 138" stroke="#eec774" stroke-width="6"/>';
  if(type==='fish')extras='<path d="M50 91 Q82 44 113 91 M151 108 Q177 70 207 108" fill="none" stroke="#edc375" stroke-width="5"/><circle cx="240" cy="74" r="3" fill="#edc375"/>';
  if(type==='school')extras=Array.from({length:20},(_,i)=>`<circle cx="${95+(i*41)%135}" cy="${52+(i*29)%45}" r="${i%3+2}" fill="#edc375" opacity=".8"/>`).join('');
  if(type==='thermocline')extras='<path d="M18 86 Q76 83 125 87 T225 86 T300 88" stroke="#82b8c6" stroke-width="5" opacity=".6" stroke-dasharray="15 5"/>';
  return `<figure class="sonar-diagram"><svg viewBox="0 0 320 180" role="img" aria-label="Schemat: ${esc(diagramNames[type])}" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="180" fill="#122631"/><path d="M18 36 L300 36 M18 75 L300 75 M18 114 L300 114" stroke="#315064" stroke-width="1"/><path d="${bottoms[type]} L300 180 L18 180 Z" fill="#2f4737" stroke="#d6b97b" stroke-width="4"/>${extras}</svg><figcaption>Schemat edukacyjny: ${esc(diagramNames[type])}. Interpretację potwierdź ponownym skanem.</figcaption></figure>`;
}
const sourceLinks=ids=>`<details class="article-sources"><summary>Źródła (${ids.length})</summary><ul>${ids.map(id=>{const s=sourceIndex.get(id);return s?`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a> · ${esc(label[s.type])} · ${esc(s.lang)}${s.published?' · '+esc(s.published):''}</li>`:'';}).join('')}</ul></details>`;
const relatedLinks=ids=>ids?.length?`<div class="article-related"><strong>Powiązane:</strong> ${ids.map(id=>{const a=index.get(id);return a?`<a href="${route(id)}">${esc(a.title)}</a>`:'';}).join('')}</div>`:'';
function articleHtml(a){
  const matrices=a.id==='dno'?`<details class="knowledge-matrix"><summary>20 typów dna — rozpoznanie i prezentacja</summary>${encyclopedia.substrates.map(([name,sign,presentation,risk])=>`<article><h5>${esc(name)}</h5><p><b>Rozpoznanie:</b> ${esc(sign)}</p><p><b>Zestaw i nęcenie:</b> ${esc(presentation)}</p><p><b>Uwaga:</b> ${esc(risk)}</p></article>`).join('')}</details>`:a.id==='profile'?`<details class="knowledge-matrix"><summary>20 profili i zestawień</summary>${encyclopedia.profiles.map(([name,use,pair,caveat])=>`<article><h5>${esc(name)}</h5><p>${esc(use)}. Łączenie: ${esc(pair)}.</p><p><b>Uwaga:</b> ${esc(caveat)}.</p></article>`).join('')}</details>`:a.id==='temperatura'?`<div class="temperature-grid">${encyclopedia.temperatures.map(([range,point])=>`<div><strong>${esc(range)}</strong><span>${esc(point)}</span></div>`).join('')}</div>`:'';
  return `<article class="knowledge-entry" id="${esc(a.id)}"><details><summary><span class="entry-category">${esc(a.category)}</span><strong>${esc(a.title)}</strong><span class="entry-lead">${esc(a.lead)}</span></summary><div class="entry-body">${a.diagram?diagram(a.diagram):''}${a.sections.map(s=>`<section><h4>${esc(s.h)}</h4><p>${esc(s.p)}</p></section>`).join('')}${matrices}<div class="entry-tags">${a.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div>${a.rig?`<p class="quick-cross"><a href="${esc(a.rig)}">Przejdź do istniejących Rigów →</a> <a href="/pages/wezly.html">Węzły →</a></p>`:''}${relatedLinks(a.related)}${sourceLinks(a.sourceIds)}</div></details></article>`;
}
const hero=`<section class="hero-card knowledge-hero"><span class="dashboard-eyebrow">Baza wiedzy · ${esc(catalog.version)}</span><h2>${sonar?'📡 Deeper / Sonar':'📚 Encyklopedia karpiowa'}</h2><p>${sonar?'Czytaj echo, sprawdzaj hipotezy i wybieraj miejsce. Schematy są własne i poglądowe.':'Ogólna wiedza na wiele wód i lat. Praktyczne punkty startowe, ograniczenia i źródła przy każdym temacie.'}</p><div class="knowledge-shortcuts">${sonar?'<a href="#spot-picker">Gdzie położyć zestaw?</a><a href="#trainer">Nauka</a><a href="#screenshot">Mój screenshot</a><a href="#scan-check">Lista skanowania</a><a href="/pages/encyklopedia.html">Encyklopedia</a>':'<a href="#tactic">Dobierz taktykę</a><a href="#diagnostic">Nie bierze</a><a href="/pages/sonar.html">Deeper / Sonar</a><a href="/pages/rigi.html">Rigi</a><a href="/pages/wezly.html">Węzły</a>'}</div></section>`;
root.innerHTML=hero+`<section class="panel-card knowledge-browser"><label for="knowledge-search">Szukaj w ${sonar?'podręczniku sonaru':'encyklopedii'}</label><input id="knowledge-search" type="search" placeholder="np. muł, wafter, termoklina" autocomplete="off"><div id="knowledge-categories" class="knowledge-chips" aria-label="Kategorie"></div><label for="knowledge-tag">Tag</label><select id="knowledge-tag"><option value="">Wszystkie tagi</option></select><p id="knowledge-count" role="status"></p></section><div id="knowledge-results" class="knowledge-results"></div><div id="knowledge-tools"></div><section class="panel-card knowledge-source-catalog"><details><summary>Źródła i wiarygodność · ${sources.sources.length} materiałów</summary><p>Opracowanie własne. 🎣 praktyka i 💬 społeczność opisują obserwacje; 🏭 producent może mieć interes handlowy. Przy sprzecznościach porównuj i testuj. Dostęp: ${esc(sources.accessed)}.</p><div class="source-catalog-list">${sources.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(label[s.type])} · ${esc(s.name)} <small>${esc(s.lang)}${s.published?' · '+esc(s.published):''}</small></a>`).join('')}</div></details></section>`;
const categories=['Wszystkie',...new Set(catalog.articles.map(a=>a.category))],tags=[...new Set(catalog.articles.flatMap(a=>a.tags))].sort((a,b)=>a.localeCompare(b,'pl'));
q('knowledge-tag').insertAdjacentHTML('beforeend',tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join(''));
let category='Wszystkie';
function filter(){
  const query=q('knowledge-search').value.trim().toLocaleLowerCase('pl'),tag=q('knowledge-tag').value;
  const shown=catalog.articles.filter(a=>(category==='Wszystkie'||a.category===category)&&(!tag||a.tags.includes(tag))&&(!query||[a.title,a.lead,a.category,...a.tags,...a.sections.flatMap(s=>[s.h,s.p]),...(a.id==='dno'?encyclopedia.substrates.flat():[]),...(a.id==='profile'?encyclopedia.profiles.flat():[])].join(' ').toLocaleLowerCase('pl').includes(query)));
  q('knowledge-results').innerHTML=shown.map(articleHtml).join('')||'<p class="panel-card">Brak wyników. Zmień filtr lub wpisz krótsze hasło.</p>';
  q('knowledge-count').textContent=`${shown.length} z ${catalog.articles.length} tematów`;
  if(location.hash){const id=decodeURIComponent(location.hash.slice(1)),target=q(id);if(target?.classList.contains('knowledge-entry'))target.querySelector('details').open=true;}
}
q('knowledge-categories').innerHTML=categories.map(c=>`<button type="button" class="${c===category?'selected':''}" data-category="${esc(c)}" aria-pressed="${c===category}">${esc(c)}</button>`).join('');
q('knowledge-categories').addEventListener('click',e=>{const btn=e.target.closest('button[data-category]');if(!btn)return;category=btn.dataset.category;q('knowledge-categories').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b===btn);b.setAttribute('aria-pressed',String(b===btn));});filter();});
q('knowledge-search').addEventListener('input',filter);q('knowledge-tag').addEventListener('change',filter);
window.addEventListener('hashchange',()=>{const id=decodeURIComponent(location.hash.slice(1)),a=index.get(id);if(a&&((sonar&&id.startsWith('sonar-'))||(!sonar&&!id.startsWith('sonar-')))){category='Wszystkie';q('knowledge-search').value='';q('knowledge-tag').value='';q('knowledge-categories').querySelector('[data-category="Wszystkie"]')?.click();q(id)?.querySelector('details')?.setAttribute('open','');}});
filter();
const toolHost=q('knowledge-tools');
const select=(id,title,options)=>`<label for="${id}">${title}</label><select id="${id}">${options.map(([value,text])=>`<option value="${esc(value)}">${esc(text)}</option>`).join('')}</select>`;
function diagnostic(){
  const steps=tools.diagnostic,answers=[];let at=0;
  toolHost.innerHTML=`<section class="panel-card knowledge-tool" id="diagnostic"><h3>Nie bierze — co robić?</h3><p>Przejdź przez decyzje w kolejności. Najpierw lokalizacja i prezentacja, później przynęta.</p><div id="diagnostic-step" aria-live="polite"></div></section><section class="panel-card knowledge-tool" id="tactic"><h3>Dobierz taktykę</h3><p>Dobry punkt startowy — bez obietnicy brania. Wybierz warunki, potem potwierdź miejsce i regulamin.</p><form id="tactic-form" class="knowledge-form">
    ${select('t-temp','Temperatura wody',[['cold','<8°C'],['cool','8–16°C'],['warm','16–24°C'],['hot','>24°C']])}
    ${select('t-season','Pora roku',[['winter','Zima'],['spring','Wiosna'],['spawning','Tarło'],['summer','Lato'],['autumn','Jesień']])}
    ${select('t-bottom','Dno',[['hard','Twarde / żwir / glina'],['silt','Muł / detrytus'],['weed','Zielsko'],['transition','Granica dna']])}
    ${select('t-weed','Wysokość zielska',[['none','Brak'],['low','Niskie'],['high','Wysokie']])}
    ${select('t-depth','Głębokość',[['shallow','Płytko'],['deep','Głęboko']])}
    ${select('t-visibility','Przejrzystość',[['clear','Czysta'],['murky','Mętna']])}
    ${select('t-pressure','Presja wędkarska',[['low','Niska'],['high','Wysoka']])}
    ${select('t-weather','Pogoda',[['stable','Stabilna'],['changing','Zmienia się']])}
    ${select('t-wind','Wiatr',[['toward','Nawietrzny brzeg'],['away','Od brzegu / spokojna strona']])}
    ${select('t-activity','Aktywność ryb',[['seen','Widziane oznaki'],['not-seen','Brak pewnych oznak']])}
    <button type="submit">Pokaż punkt startowy</button></form><div id="tactic-result" aria-live="polite"></div></section>`;
  function step(){
    const host=q('diagnostic-step');
    if(at>=steps.length){
      const priority=answers.filter(a=>a.answer!=='yes');
      host.innerHTML=`<h4>Plan na teraz</h4><p>${priority.length?'Zacznij od pierwszej niepewnej lub negatywnej odpowiedzi. Zmień jedną rzecz i obserwuj efekt.':'Daj potwierdzonej miejscówce czas. Jeśli sytuacja się zmieni, wróć do obserwacji ryb.'}</p><ol>${priority.map(a=>`<li>${esc(a.advice)} <a href="${route(a.link)}">Czytaj →</a></li>`).join('')}</ol><button type="button" id="diagnostic-restart">Zacznij ponownie</button>`;
      q('diagnostic-restart').onclick=()=>{answers.length=0;at=0;step();};return;
    }
    host.innerHTML=`<p class="tool-progress">Krok ${at+1} / ${steps.length}</p><h4>${esc(steps[at].q)}</h4><div class="answer-buttons"><button type="button" data-answer="yes">Tak</button><button type="button" data-answer="no">Nie</button><button type="button" data-answer="unknown">Nie wiem</button></div>${answers.length?`<p class="tool-context">Poprzednio: ${esc(answers.at(-1).advice)}</p>`:''}`;
    host.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{const answer=button.dataset.answer,s=steps[at];answers.push({answer,advice:s[answer],link:s.link});at++;step();});
  }
  step();
  q('tactic-form').addEventListener('submit',event=>{
    event.preventDefault();const v=id=>q('t-'+id).value,t=tools.tactics,b=t.bottom[v('bottom')],temp=t.temperature[v('temp')];
    const presentation=v('weed')==='high'?'Szukaj dużego czystego oczka lub krawędzi; nie kładź zestawu w gęstwinie.':b.presentation;
    const items=[['Przynęta',temp.bait],['Profil smakowy',temp.flavour],['Kolor',t.visibility[v('visibility')]],['Bottom / wafter / pop-up',presentation],['Rig',b.rig],['Długość przyponu',b.length],['Nęcenie i ilość',`${b.feed}; ${temp.feed}`],['Plan B',temp.backup],['Obserwacja',`${t.activity[v('activity')]} ${t.pressure[v('pressure')]}`],['Sezon, pogoda i wiatr',`${t.season[v('season')]} ${t.weather[v('weather')]} ${t.wind[v('wind')]} ${t.depth[v('depth')]}`]];
    q('tactic-result').innerHTML=`<div class="tool-result"><h4>Dobry punkt startowy · ${esc(temp.title)}</h4><p>Warto rozważyć i sprawdzić na tej wodzie; to nie jest gwarancja brania.</p><dl>${items.map(([h,p])=>`<div><dt>${esc(h)}</dt><dd>${esc(p)}</dd></div>`).join('')}</dl><p><a href="/pages/rigi.html">Istniejące Rigi →</a> · <a href="/pages/wezly.html">Węzły →</a> · <a href="/pages/sonar.html#sonar-potwierdzenie">Potwierdź dno →</a></p></div>`;
  });
}
function sonarTools(){
  const gallery=['gravel','silt','weed','clearing','plateau','slope','trench','fish','school','thermocline','hardsoft'];
  toolHost.innerHTML=`<section class="panel-card knowledge-tool" id="spot-picker"><h3>Gdzie położyć zestaw?</h3><p>Trzy logiczne punkty do sprawdzenia. Lokalizacja i bezpieczny hol mają pierwszeństwo.</p><form id="spot-form" class="knowledge-form">
    ${select('s-structure','Struktura',[['plateau','Plateau / górka'],['slope','Spadek / półka'],['trench','Rów / koryto'],['weed','Zielsko'],['transition','Granica dna']])}
    ${select('s-bottom','Materiał dna',[['gravel','Żwir / twarde'],['silt','Muł / miękkie'],['weed','Zielsko']])}
    ${select('s-depth','Głębokość',[['shallow','Płytka'],['mid','Średnia'],['deep','Głęboka']])}
    ${select('s-temp','Temperatura',[['cold','<8°C'],['cool','8–16°C'],['warm','16–24°C'],['hot','>24°C']])}
    ${select('s-season','Pora roku',[['winter','Zima'],['spring','Wiosna'],['summer','Lato'],['autumn','Jesień']])}
    ${select('s-pressure','Presja',[['low','Niska'],['high','Wysoka']])}
    <button type="submit">Pokaż punkty A / B / C</button></form><div id="spot-result" aria-live="polite"></div></section>
    <section class="panel-card knowledge-tool" id="trainer"><h3>Naucz mnie czytać Deepera</h3><p>Własne schematy obrazują zasadę, nie rzeczywisty zapis konkretnej sondy. Trzy poziomy, wyjaśnienie po odpowiedzi, działa offline.</p>${select('quiz-level','Poziom',[[1,'1 · Podstawy'],[2,'2 · Struktury'],[3,'3 · Interpretacja']])}<div id="quiz-stage" aria-live="polite"></div></section>
    <section class="panel-card knowledge-tool" id="screenshot"><h3>Przeanalizuj mój screenshot</h3><p>Tryb wspomagany. Obraz pozostaje na tym urządzeniu: nie wysyłamy go do Workera ani do AI. Powiększ, przesuwaj, zaznacz punkty, a potem odpowiedz na pytania.</p><label for="shot-file">Wybierz screenshot z telefonu</label><input type="file" id="shot-file" accept="image/*"><div id="shot-controls" hidden><label for="shot-zoom">Powiększenie</label><input type="range" id="shot-zoom" min="1" max="3" step="0.1" value="1"><button type="button" class="secondary-btn" id="shot-clear">Usuń znaczniki</button><div class="shot-viewport" id="shot-viewport"><div class="shot-stage" id="shot-stage"><img id="shot-image" alt="Lokalny screenshot sonaru"></div></div><p>Dotknij interesującego miejsca, aby dodać znacznik; przeciągnij obraz, aby go przesunąć.</p>${['Czy dno wygląda na twarde?','Czy widzisz zielsko?','Czy jest spadek lub rów?','Czy jest przejście dna?','Czy widać ryby lub stado?'].map((text,i)=>select('shot-q'+i,text,[['unknown','Nie wiem'],['yes','Tak'],['no','Nie']])).join('')}<button type="button" id="shot-analyze">Pomóż zinterpretować</button><div id="shot-result" aria-live="polite"></div></div></section>
    <section class="panel-card knowledge-tool" id="scan-check"><h3>Przed położeniem zestawu</h3><div class="scan-checklist">${tools.scanChecklist.map((item,i)=>`<label><input type="checkbox" id="scan-${i}"><span>${esc(item)}</span></label>`).join('')}</div><p id="scan-progress" role="status">0 / ${tools.scanChecklist.length} sprawdzone</p></section>
    <section class="panel-card knowledge-tool" id="sonar-gallery"><h3>Atlas schematów</h3><p>11 autorskich schematów. Kształt, kolor i grubość echa zależą od ustawień i modelu; przykład jest hipotezą do potwierdzenia.</p><div class="sonar-gallery">${gallery.map(type=>diagram(type)).join('')}</div></section>`;
  q('spot-form').addEventListener('submit',event=>{event.preventDefault();const v=id=>q('s-'+id).value,spots=tools.spots[v('structure')],bottom=v('bottom'),pressure=v('pressure');q('spot-result').innerHTML=`<div class="tool-result"><h4>Trzy punkty do weryfikacji</h4><ol>${spots.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p>${bottom==='silt'?'Sprawdź, czy przypon nie jest wciągany w muł.':bottom==='weed'?'Potwierdź czyste oczko i bezpieczny hol.':'Potwierdź twardość ciężarkiem; jasny pas nie dowodzi żwiru.'} ${v('temp')==='hot'?'Priorytet: tlen i dobrostan ryb.':''} ${pressure==='high'?'Punkt C może zmniejszyć zakłócenia.':''}</p><p>To hipotezy, nie gwarancja. <a href="/pages/encyklopedia.html#dno">Dobierz prezentację →</a></p></div>`;});
  setupQuiz(sonarData.quiz);setupScreenshot();
  q('scan-check').addEventListener('change',()=>{const checked=q('scan-check').querySelectorAll('input:checked').length;q('scan-progress').textContent=`${checked} / ${tools.scanChecklist.length} sprawdzone`;});
}
function setupQuiz(questions){
  let position=0,score=0,level=1;
  function draw(){const list=questions.filter(item=>item.level===level),item=list[position];if(!item){q('quiz-stage').innerHTML=`<div class="tool-result"><h4>Wynik: ${score} / ${list.length}</h4><p>Wróć do artykułów przy niepewnych rozpoznaniach. Jeden ekran sonaru nie wystarcza do decyzji.</p><button id="quiz-restart" type="button">Powtórz poziom</button></div>`;q('quiz-restart').onclick=()=>{position=0;score=0;draw();};return;}
    q('quiz-stage').innerHTML=`<p class="tool-progress">Pytanie ${position+1} / ${list.length}</p>${diagram(item.diagram)}<h4>${esc(item.question)}</h4><div class="answer-buttons">${item.options.map((o,i)=>`<button type="button" data-quiz="${i}">${esc(o)}</button>`).join('')}</div><div id="quiz-feedback" aria-live="polite"></div>`;
    q('quiz-stage').querySelectorAll('[data-quiz]').forEach(btn=>btn.onclick=()=>{const correct=Number(btn.dataset.quiz)===item.correct;if(correct)score++;q('quiz-stage').querySelectorAll('[data-quiz]').forEach(b=>b.disabled=true);q('quiz-feedback').innerHTML=`<div class="tool-result"><strong>${correct?'Dobrze.':'Sprawdź interpretację.'}</strong><p>${esc(item.explanation)}</p>${sourceLinks(item.sourceIds)}<button id="quiz-next" type="button">${position===list.length-1?'Wynik':'Następny przykład'}</button></div>`;q('quiz-next').onclick=()=>{position++;draw();};});
  }
  q('quiz-level').onchange=()=>{level=Number(q('quiz-level').value);position=0;score=0;draw();};draw();
}
function setupScreenshot(){
  let url=null,zoom=1,panX=0,panY=0,drag=null,markers=[];
  const stage=q('shot-stage'),viewport=q('shot-viewport'),img=q('shot-image');
  const transform=()=>{stage.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;};
  function markersDraw(){stage.querySelectorAll('.shot-marker').forEach(x=>x.remove());markers.forEach((point,i)=>{const b=document.createElement('button');b.type='button';b.className='shot-marker';b.style.left=`${point.x}%`;b.style.top=`${point.y}%`;b.textContent=String(i+1);b.setAttribute('aria-label',`Znacznik ${i+1}`);b.title='Znacznik '+(i+1);b.onclick=e=>{e.stopPropagation();markers.splice(i,1);markersDraw();};stage.append(b);});}
  q('shot-file').addEventListener('change',event=>{
    if(url)URL.revokeObjectURL(url);markers=[];markersDraw();const file=event.target.files?.[0];
    if(!file){q('shot-controls').hidden=true;return;}
    if(!file.type.startsWith('image/')||file.size>15*1024*1024){event.target.value='';q('shot-controls').hidden=true;alert('Wybierz obraz do 15 MB.');return;}
    url=URL.createObjectURL(file);img.src=url;q('shot-controls').hidden=false;zoom=1;panX=panY=0;q('shot-zoom').value='1';transform();q('shot-result').replaceChildren();
  });
  q('shot-zoom').oninput=e=>{zoom=Number(e.target.value);transform();};
  q('shot-clear').onclick=()=>{markers=[];markersDraw();};
  viewport.addEventListener('pointerdown',e=>{if(e.target.closest('.shot-marker'))return;drag={x:e.clientX,y:e.clientY,px:panX,py:panY,moved:false};viewport.setPointerCapture(e.pointerId);});
  viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;if(drag.moved){panX=drag.px+dx;panY=drag.py+dy;transform();}});
  viewport.addEventListener('pointerup',e=>{if(!drag)return;if(!drag.moved&&markers.length<8){const r=stage.getBoundingClientRect();markers.push({x:Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100))});markersDraw();}drag=null;});
  q('shot-analyze').onclick=()=>{
    const a=Array.from({length:5},(_,i)=>q('shot-q'+i).value);const notes=[];
    if(a[0]==='yes')notes.push('Mocny powrót może wskazywać twardsze dno; porównaj drugi skan i ciężarek.');
    if(a[0]==='no')notes.push('Słaby powrót może oznaczać miękki osad; sprawdź zapadanie ciężarka.');
    if(a[1]==='yes')notes.push('Zmierz wysokość zielska i szukaj czystego oczka/krawędzi z bezpiecznym holem.');
    if(a[2]==='yes')notes.push('Porównaj szczyt, bok i podstawę struktury — nie wybieraj automatycznie najgłębszego punktu.');
    if(a[3]==='yes')notes.push('Powtórz skan w poprzek przejścia i zaznacz obie strony granicy.');
    if(a[4]==='yes')notes.push('Ślad może być rybą, ale gatunek i dokładne położenie wymagają innych obserwacji.');
    if(!notes.length)notes.push('Niepewność jest normalna: powtórz skan z równą prędkością, sprawdź ustawienia i porównaj z atlasem.');
    q('shot-result').innerHTML=`<div class="tool-result"><h4>Wspomagana interpretacja</h4><p>Wnioski pochodzą tylko z Twoich odpowiedzi, nie z automatycznego rozpoznania obrazu. ${markers.length} zaznaczonych punktów pozostaje lokalnie.</p><ol>${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ol><p><a href="#sonar-gallery">Porównaj schematy →</a> · <a href="${route('sonar-potwierdzenie')}">Potwierdź miejsce →</a></p></div>`;
  };
  window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
}
if(sonar)sonarTools();else diagnostic();
if(location.hash){const id=decodeURIComponent(location.hash.slice(1));requestAnimationFrame(()=>q(id)?.scrollIntoView({block:'start'}));}
}
}
