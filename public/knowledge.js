// Static, versioned editorial data. No screenshot or answer leaves this browser.
const root=document.getElementById('knowledge-root');
if(root){
const module=root.dataset.module, sonar=module==='sonar';
const deviceLanguage=localStorage.getItem('dreamteam.language')||(/^pl\b/i.test(navigator.language)?'pl':'en');
const english=deviceLanguage==='en';
const say=(pl,en)=>english?en:pl;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=id=>document.getElementById(id);
const label=english?{science:'📘 science / technique',practice:'🎣 field practice',manufacturer:'🏭 manufacturer',community:'💬 community',sonar:'📡 sonar documentation'}:{science:'📘 nauka / technika',practice:'🎣 praktyka',manufacturer:'🏭 producent',community:'💬 społeczność',sonar:'📡 dokumentacja sonaru'};
const route=id=>(id.startsWith('sonar-')?'/pages/sonar.html':'/pages/encyklopedia.html')+'#'+encodeURIComponent(id);
const paths=['sources','encyclopedia','sonar','tools','field-guides','chirp2-practice'];
const data=await Promise.all(paths.map(async name=>{
  const response=await fetch(`/data/knowledge/${name}.json`,{credentials:'same-origin'});
  if(!response.ok)throw Error(`Nie udało się odczytać ${name} (${response.status})`);
  return response.json();
})).catch(error=>{root.innerHTML=`<section class="panel-card"><h2>Treść chwilowo niedostępna</h2><p>${esc(error.message)}. Sprawdź połączenie i odśwież stronę.</p></section>`;return null;});
if(data){
const [sources,encyclopedia,sonarData,tools,fieldGuides,chirpPractice]=data;
if(english){
  for(const [name,collection] of [['encyclopedia',encyclopedia],['sonar',sonarData]]){
    const response=await fetch(`/data/knowledge/en/${name}.json`,{credentials:'same-origin'});
    if(response.ok){const localized=await response.json();for(const a of collection.articles){const tr=localized.articles[a.id];if(!tr)continue;a.title=tr.title;a.lead=tr.lead;a.category=localized.categories[a.category]||a.category;a.sections=tr.sections.map(([h,p])=>({h,p}));}}
  }
  const guideResponse=await fetch('/data/knowledge/en/field-guides.json',{credentials:'same-origin'});
  if(guideResponse.ok){const localized=await guideResponse.json();for(const guide of fieldGuides.guides){const tr=localized.guides[guide.id];if(!tr)continue;[guide.question,guide.start,guide.check,guide.change]=tr;guide.category=localized.categories[guide.category]||guide.category;}}
  const toolResponse=await fetch('/data/knowledge/en/tools.json',{credentials:'same-origin'});
  if(toolResponse.ok){const localized=await toolResponse.json();tools.diagnostic=tools.diagnostic.map((row,i)=>({...row,...localized.diagnostic[i]}));tools.tactics=localized.tactics;tools.spots=localized.spots;tools.scanChecklist=localized.scanChecklist;}
  const practiceResponse=await fetch('/data/knowledge/en/chirp2-practice.json',{credentials:'same-origin'});
  if(practiceResponse.ok){const localized=await practiceResponse.json();for(const [id,tr] of Object.entries(localized.practice)){if(chirpPractice.practice[id])[chirpPractice.practice[id].setting,chirpPractice.practice[id].field,chirpPractice.practice[id].decision]=tr;}}
  const quizResponse=await fetch('/data/knowledge/en/quiz.json',{credentials:'same-origin'});
  if(quizResponse.ok){const localized=await quizResponse.json();sonarData.quiz.forEach((item,i)=>{const tr=localized.questions[i];if(tr)[item.question,item.options,item.explanation]=tr;});}
  const matricesResponse=await fetch('/data/knowledge/en/matrices.json',{credentials:'same-origin'});
  if(matricesResponse.ok){const localized=await matricesResponse.json();encyclopedia.substrates=localized.substrates.map(([name,family,sign,presentation,risk])=>[name,sign,presentation,risk,...localized.substrateFamilies[family]]);encyclopedia.profiles=localized.profiles.map(([name,family,use,pair,caveat])=>[name,use,pair,caveat,...localized.profileFamilies[family]]);encyclopedia.temperatures=localized.temperatures;}
}
const catalog=sonar?sonarData:encyclopedia;
const atlas=sonar?await fetch('/assets/deeper/chirp2/index.json',{credentials:'same-origin'}).then(r=>r.ok?r.json():{screenshots:[]}):{screenshots:[]};
if(english&&sonar){const response=await fetch('/assets/deeper/chirp2/index.en.json',{credentials:'same-origin'});if(response.ok){const localized=await response.json();for(const shot of atlas.screenshots){const tr=localized.screenshots[shot.id];if(!tr)continue;[shot.caption,shot.observed,shot.explanation]=tr;shot.confidence=localized.confidence[shot.confidence]||shot.confidence;}}}
const index=new Map([...encyclopedia.articles,...sonarData.articles].map(a=>[a.id,a]));
const sourceIndex=new Map(sources.sources.map(s=>[s.id,s]));
const diagramNames={cone:'Stożek wiązki',hardsoft:'Twarde i miękkie dno',gravel:'Żwir',silt:'Muł',weed:'Zielsko',clearing:'Czyste oczko',plateau:'Plateau',slope:'Spadek',trench:'Rów',fish:'Łuk ryby',school:'Stado',thermocline:'Możliwa termoklina',transects:'Równoległe tory skanowania'};
const bottoms={cone:'M18 148 L300 148',hardsoft:'M18 143 L150 143 L158 154 L300 154',gravel:'M18 140 L38 137 L56 140 L73 134 L94 139 L112 135 L130 140 L150 136 L170 140 L190 136 L211 139 L230 134 L250 139 L272 136 L300 140',silt:'M18 143 Q80 147 140 146 T300 148',weed:'M18 147 L300 147',clearing:'M18 147 L300 147',plateau:'M18 155 L70 155 L110 95 L215 95 L260 155 L300 155',slope:'M18 89 L88 89 L210 155 L300 155',trench:'M18 100 L92 100 L130 153 L220 153 L264 100 L300 100',fish:'M18 151 L300 151',school:'M18 151 L300 151',thermocline:'M18 153 L300 153',transects:'M18 149 L300 149'};
const weedAt=(x,y=147)=>`<path d="M${x} ${y} q-9 -20 0 -40 q8 20 0 40 m0 0 q13 -32 7 -56" fill="none" stroke="#8cc477" stroke-width="3"/>`;
function diagram(type){
  if(!bottoms[type])return '';
  let extras='';
  if(type==='transects')extras='<path d="M40 90 L280 90 M280 102 L40 102 M40 114 L280 114" fill="none" stroke="#edc375" stroke-width="3" stroke-dasharray="7 5"/><path d="M278 90 l-8 -5 m8 5 l-8 5 M42 102 l8 -5 m-8 5 l8 5 M278 114 l-8 -5 m8 5 l-8 5" fill="none" stroke="#edc375" stroke-width="2"/>';
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
const sourceLinks=ids=>`<details class="article-sources"><summary>${say('Źródła','Sources')} (${ids.length})</summary><ul>${ids.map(id=>{const s=sourceIndex.get(id);return s?`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a> · ${esc(label[s.type])} · ${esc(s.lang)}${s.published?' · '+esc(s.published):''}</li>`:'';}).join('')}</ul></details>`;
const relatedLinks=ids=>ids?.length?`<div class="article-related"><strong>${say('Powiązane:','Related:')}</strong> ${ids.map(id=>{const a=index.get(id);return a?`<a href="${route(id)}">${esc(a.title)}</a>`:'';}).join('')}</div>`:'';
const atlasCard=shot=>`<figure class="deeper-shot">${shot.src&&/^[a-z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(shot.src)?`<div class="deeper-shot-image"><img loading="lazy" src="/assets/deeper/chirp2/${esc(shot.src)}" alt="${esc(shot.caption)}"><span class="deeper-shot-region" style="left:${Math.max(0,Math.min(100,Number(shot.region?.x)||0))}%;top:${Math.max(0,Math.min(100,Number(shot.region?.y)||0))}%;width:${Math.max(0,Math.min(100,Number(shot.region?.width)||0))}%;height:${Math.max(0,Math.min(100,Number(shot.region?.height)||0))}%"></span></div>`:'<div class="deeper-shot-placeholder">Miejsce na Twój screenshot Fish Deeper</div>'}<figcaption><strong>${esc(shot.caption)}</strong><br>${shot.observed?`<b>${say('Widać:','Observed:')}</b> ${esc(shot.observed)}<br>`:''}<b>${say('Interpretacja:','Interpretation:')}</b> ${esc(shot.explanation)}${shot.confidence?`<br><small>${say('Pewność:','Confidence:')} ${esc(shot.confidence)}</small>`:''}</figcaption></figure>`;
function articleHtml(a){
  const practice=sonar?chirpPractice.practice[a.id]:null;
  const matrices=a.id==='dno'?`<details class="knowledge-matrix"><summary>20 typów dna — rozpoznanie i prezentacja</summary>${encyclopedia.substrates.map(([name,sign,presentation,risk,lead,rig,feed,weed])=>`<article><h5>${esc(name)}</h5><p><b>Rozpoznanie:</b> ${esc(sign)}</p><p><b>Zestaw i nęcenie:</b> ${esc(presentation)}</p><p><b>Ciężarek i ryzyko:</b> ${esc(lead)}</p><p><b>Przynęta, rig, długość i materiał:</b> ${esc(rig)} <a href="/pages/rigi.html">Rigi →</a></p><p><b>Nęcenie i ilość:</b> ${esc(feed)}</p><p><b>Zielsko i pewność:</b> ${esc(weed)} ${esc(risk)}</p></article>`).join('')}</details>`:a.id==='profile'?`<details class="knowledge-matrix"><summary>20 profili i zestawień</summary>${encyclopedia.profiles.map(([name,use,pair,caveat,temp,presentation,feeding,change])=>`<article><h5>${esc(name)}</h5><p><b>Charakter:</b> ${esc(use)}. <b>Łączenie:</b> ${esc(pair)}.</p><p><b>Woda i presja:</b> ${esc(temp)}</p><p><b>Bottom / wafter / pop-up:</b> ${esc(presentation)} <a href="/pages/rigi.html">Rigi →</a></p><p><b>Nęcenie:</b> ${esc(feeding)}</p><p><b>Kiedy zmienić:</b> ${esc(change)} <b>Ograniczenie:</b> ${esc(caveat)}.</p></article>`).join('')}</details>`:a.id==='temperatura'?`<div class="temperature-grid">${encyclopedia.temperatures.map(([range,point])=>`<div><strong>${esc(range)}</strong><span>${esc(point)}</span></div>`).join('')}</div>`:'';
  return `<article class="knowledge-entry" id="${esc(a.id)}"><details><summary><span class="entry-category">${esc(a.category)}</span><strong>${esc(a.title)}</strong><span class="entry-lead">${esc(a.lead)}</span></summary><div class="entry-body">${practice?`<div class="chirp-practice"><h4>W praktyce: CHIRP+ 2 / Fish Deeper</h4><p><b>Ustaw:</b> ${esc(practice.setting)}</p><p><b>Nad wodą:</b> ${esc(practice.field)}</p><p><b>Decyzja:</b> ${esc(practice.decision)}</p></div>`:''}${a.diagram&&(!sonar||['cone','transects'].includes(a.diagram))?diagram(a.diagram):''}${sonar?atlas.screenshots.filter(s=>s.articleId===a.id).map(atlasCard).join(''):''}${a.sections.map(s=>`<section><h4>${esc(s.h)}</h4><p>${esc(s.p)}</p></section>`).join('')}${matrices}<div class="entry-tags">${a.tags.map(t=>`<span>#${esc(t)}</span>`).join('')}</div>${a.rig?`<p class="quick-cross"><a href="${esc(a.rig)}">Przejdź do istniejących Rigów →</a> <a href="/pages/wezly.html">Węzły →</a></p>`:''}${relatedLinks(a.related)}${sourceLinks(a.sourceIds)}</div></details></article>`;
}
const homeLinks=sonar?[
  ['Skanuję nową wodę','20 minut z CHIRP+ 2','#chirp-first-20'],['Jak czytać ekran','Twardość, zielsko i echo','#sonar-dno'],['Gdzie położyć zestaw','Trzy punkty do weryfikacji','#spot-picker'],['Ustawienia CHIRP+ 2','Wiązka i czułość','#sonar-ustawienia'],['Atlas screenshotów','Rzeczywiste ekrany','#atlas-overview'],['Moje screenshoty','Dodaj własny obraz','#deeper-media'],['Quiz','Ćwicz interpretację','#trainer'],['Analiza mojego screenshota','Obraz zostaje na telefonie','#screenshot']]:[
  ['Dobierz taktykę','Temperatura, dno, presja','#tactic'],['Nie bierze','Plan po kilku godzinach bez brania','#diagnostic'],['8°C lub 18°C','Szybkie odpowiedzi','#field-guides'],['Dno i prezentacja','Żwir, muł, zielsko','#field-guides'],['Przynęty i nęcenie','Smak, kolor, ilość','#field-guides']];
const hero=`<section class="hero-card knowledge-hero"><span class="dashboard-eyebrow">${say('Baza wiedzy','Knowledge base')} · ${esc(catalog.version)}</span><h2>${sonar?'Mój Deeper CHIRP+ 2':'Encyklopedia karpiowa'}</h2><p>${sonar?'Praktyczne kroki w Fish Deeper. Skanuj, sprawdź echo i wybierz miejsce bez opuszczania DreamTeam.':'Znajdź odpowiedź na konkretne warunki nad wodą. Zacznij od pytania lub wybierz narzędzie.'}</p></section>`;
root.innerHTML=hero+`<section class="panel-card knowledge-browser"><label for="knowledge-search">Szukaj w ${sonar?'podręczniku CHIRP+ 2':'encyklopedii'}</label><input id="knowledge-search" type="search" placeholder="np. 10°C, muł, zielsko, fishmeal" autocomplete="off"><div id="knowledge-categories" class="knowledge-chips" aria-label="Kategorie"></div><label for="knowledge-tag">Tag</label><select id="knowledge-tag"><option value="">Wszystkie tagi</option></select><p id="knowledge-count" role="status"></p></section><section class="knowledge-home"><h3>${sonar?'Co robisz z CHIRP+ 2?':'Szybki start'}</h3><div class="knowledge-home-grid">${homeLinks.map(([title,description,href])=>`<a href="${href}"><strong>${title}</strong><span>${description}</span></a>`).join('')}</div></section>${sonar?`<section id="chirp-first-20" class="panel-card knowledge-field-guide"><h3>Nowa woda — pierwsze 20 minut z CHIRP+ 2</h3><ol><li>0–3 min: sprawdź regulamin, łączność Wi-Fi, tryb Bait Boat lub Boat i GPS. Wybierz Raw oraz Mid 20° jako punkt startowy.</li><li>3–8 min: spokojnie, poniżej 3 km/h, zrób dwa równoległe tory Wide 47° dla ogólnej głębokości i struktury.</li><li>8–13 min: wróć Mid 20° na spadek i zmianę dna; nie zmieniaj jednocześnie palety i czułości.</li><li>13–17 min: Narrow 7° nad małą plamą albo oczkiem; zmniejsz czułość, jeśli szum zasłania dno, zwiększ tylko gdy słabe echo znika.</li><li>17–20 min: przejazd poprzeczny, waypoint, kontrola ciężarkiem i wybór punktów A/B/C z bezpiecznym holem.</li></ol><p>To procedura robocza. Prędkość, wiązkę i czułość koryguj do głębokości oraz czytelności echa.</p>${sourceLinks(index.get('sonar-ustawienia').sourceIds)}</section>`:`<section id="field-guides" class="knowledge-field-guide"><h3>Odpowiedzi nad wodą</h3><p>Wybierz pytanie; każdy punkt prowadzi do źródeł i pełnego tematu.</p><div class="field-guide-grid">${fieldGuides.guides.map(g=>`<details class="field-guide" id="guide-${esc(g.id)}"><summary><small>${esc(g.category)}</small><strong>${esc(g.question)}</strong></summary><div><p><b>Zacznij:</b> ${esc(g.start)}</p><p><b>Sprawdź:</b> ${esc(g.check)}</p><p><b>Jeśli nie działa:</b> ${esc(g.change)}</p><a href="${route(g.article)}">Pełny temat i źródła →</a></div></details>`).join('')}</div></section>`}<div id="knowledge-tools"></div>${sonar?`<section class="panel-card" id="atlas-overview"><h3>Atlas własnych screenshotów</h3><p>Rzeczywiste ekrany Fish Deeper z zaznaczonymi obszarami, obserwacją i poziomem pewności. Każdą interpretację potwierdź kolejnym przejazdem.</p><div class="sonar-gallery">${atlas.screenshots.map(atlasCard).join('')}</div></section>`:''}<details class="knowledge-library" id="knowledge-library"><summary>${say('Wszystkie tematy','All topics')} · ${catalog.articles.length}</summary><div id="knowledge-results" class="knowledge-results"></div></details><section class="panel-card knowledge-source-catalog"><details><summary>${say('Źródła i wiarygodność','Sources and reliability')} · ${sources.sources.length} ${say('materiałów','references')}</summary><p>Opracowanie własne. 🎣 praktyka i 💬 społeczność opisują obserwacje; 🏭 producent może mieć interes handlowy. Przy sprzecznościach porównuj i testuj. Dostęp: ${esc(sources.accessed)}.</p><div class="source-catalog-list">${sources.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(label[s.type])} · ${esc(s.name)} <small>${esc(s.lang)}${s.published?' · '+esc(s.published):''}</small></a>`).join('')}</div></details></section>`;
const filterPanel=document.createElement('section');filterPanel.className='panel-card knowledge-filter-panel';filterPanel.innerHTML='<h3>Kategorie i filtry</h3>';
root.querySelector('.knowledge-home').after(filterPanel);
filterPanel.append(q('knowledge-categories'),q('knowledge-tag').previousElementSibling,q('knowledge-tag'),q('knowledge-count'));
if(sonar)q('knowledge-search').placeholder='np. twardość, Mid, zielsko, łódka';
const categories=['Wszystkie',...new Set(catalog.articles.map(a=>a.category))],tags=[...new Set(catalog.articles.flatMap(a=>a.tags))].sort((a,b)=>a.localeCompare(b,'pl'));
q('knowledge-tag').insertAdjacentHTML('beforeend',tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join(''));
let category='Wszystkie';
function filter(){
  const query=q('knowledge-search').value.trim().toLocaleLowerCase('pl'),tag=q('knowledge-tag').value;
  const shown=catalog.articles.filter(a=>(category==='Wszystkie'||a.category===category)&&(!tag||a.tags.includes(tag))&&(!query||[a.title,a.lead,a.category,...a.tags,...a.sections.flatMap(s=>[s.h,s.p]),...(a.id==='dno'?encyclopedia.substrates.flat():[]),...(a.id==='profile'?encyclopedia.profiles.flat():[])].join(' ').toLocaleLowerCase('pl').includes(query)));
  q('knowledge-results').innerHTML=shown.map(articleHtml).join('')||'<p class="panel-card">Brak wyników. Zmień filtr lub wpisz krótsze hasło.</p>';
  q('knowledge-count').textContent=english?`${shown.length} of ${catalog.articles.length} topics`:`${shown.length} z ${catalog.articles.length} tematów`;
  if(!sonar){
    let guideMatches=0;
    q('field-guides').querySelectorAll('.field-guide').forEach((node,i)=>{
      const g=fieldGuides.guides[i],terms=[g.question,g.category,g.start,g.check,g.change].join(' ').toLocaleLowerCase('pl');
      const temperatureQuery=/^(?:8|9|10|11|12)\s*°?c$/i.test(query);
      node.hidden=Boolean(query)&&!terms.includes(query)&&!(temperatureQuery&&g.id==='woda-8');
      if(!node.hidden)guideMatches++;
    });
    q('field-guides').hidden=Boolean(query)&&guideMatches===0;
    if(query&&guideMatches)q('knowledge-count').textContent+=english?` · ${guideMatches} field answers`:` · ${guideMatches} odpowiedzi praktycznych`;
  }
  if(query||category!=='Wszystkie'||tag)q('knowledge-library').open=true;
  if(location.hash){const id=decodeURIComponent(location.hash.slice(1)),target=q(id);if(target?.classList.contains('knowledge-entry')){q('knowledge-library').open=true;target.querySelector('details').open=true;}}
}
q('knowledge-categories').innerHTML=categories.map(c=>`<button type="button" class="${c===category?'selected':''}" data-category="${esc(c)}" aria-pressed="${c===category}">${esc(c)}</button>`).join('');
q('knowledge-categories').addEventListener('click',e=>{const btn=e.target.closest('button[data-category]');if(!btn)return;category=btn.dataset.category;q('knowledge-categories').querySelectorAll('button').forEach(b=>{b.classList.toggle('selected',b===btn);b.setAttribute('aria-pressed',String(b===btn));});filter();});
q('knowledge-search').addEventListener('input',filter);q('knowledge-tag').addEventListener('change',filter);
window.addEventListener('hashchange',()=>{const id=decodeURIComponent(location.hash.slice(1)),a=index.get(id);if(a&&((sonar&&id.startsWith('sonar-'))||(!sonar&&!id.startsWith('sonar-')))){category='Wszystkie';q('knowledge-search').value='';q('knowledge-tag').value='';q('knowledge-categories').querySelector('[data-category="Wszystkie"]')?.click();q('knowledge-library').open=true;q(id)?.querySelector('details')?.setAttribute('open','');requestAnimationFrame(()=>q(id)?.scrollIntoView({block:'start'}));}});
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
    host.innerHTML=`<p class="tool-progress">${say('Krok','Step')} ${at+1} / ${steps.length}</p><h4>${esc(steps[at].q)}</h4><div class="answer-buttons"><button type="button" data-answer="yes">Tak</button><button type="button" data-answer="no">Nie</button><button type="button" data-answer="unknown">Nie wiem</button></div>${answers.length?`<p class="tool-context">${say('Poprzednio:','Previous:')} ${esc(answers.at(-1).advice)}</p>`:''}`;
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
  toolHost.innerHTML=`<section class="panel-card knowledge-tool" id="spot-picker"><h3>Gdzie położyć zestaw?</h3><p>Trzy logiczne punkty do sprawdzenia. Lokalizacja i bezpieczny hol mają pierwszeństwo.</p><form id="spot-form" class="knowledge-form">
    ${select('s-structure','Struktura',[['plateau','Plateau / górka'],['slope','Spadek / półka'],['trench','Rów / koryto'],['weed','Zielsko'],['transition','Granica dna']])}
    ${select('s-bottom','Materiał dna',[['gravel','Żwir / twarde'],['silt','Muł / miękkie'],['weed','Zielsko']])}
    ${select('s-depth','Głębokość',[['shallow','Płytka'],['mid','Średnia'],['deep','Głęboka']])}
    ${select('s-temp','Temperatura',[['cold','<8°C'],['cool','8–16°C'],['warm','16–24°C'],['hot','>24°C']])}
    ${select('s-season','Pora roku',[['winter','Zima'],['spring','Wiosna'],['summer','Lato'],['autumn','Jesień']])}
    ${select('s-pressure','Presja',[['low','Niska'],['high','Wysoka']])}
    <button type="submit">Pokaż punkty A / B / C</button></form><div id="spot-result" aria-live="polite"></div></section>
    <section class="panel-card knowledge-tool" id="trainer"><h3>Quiz: czytaj ekran CHIRP+ 2</h3><p>Trzy poziomy z wyjaśnieniem decyzji. Porównaj pytania z własnymi ekranami w atlasie; działa offline.</p>${select('quiz-level','Poziom',[[1,'1 · Podstawy'],[2,'2 · Struktury'],[3,'3 · Interpretacja']])}<div id="quiz-stage" aria-live="polite"></div></section>
    <section class="panel-card knowledge-tool" id="screenshot"><h3>Przeanalizuj mój screenshot</h3><p>Tryb wspomagany. Obraz pozostaje na tym urządzeniu: nie wysyłamy go do Workera ani do AI. Powiększ, przesuwaj, zaznacz punkty, a potem odpowiedz na pytania.</p><label for="shot-file">Wybierz screenshot z telefonu</label><input type="file" id="shot-file" accept="image/*"><div id="shot-controls" hidden><label for="shot-zoom">Powiększenie</label><input type="range" id="shot-zoom" min="1" max="3" step="0.1" value="1"><button type="button" class="secondary-btn" id="shot-clear">Usuń znaczniki</button><div class="shot-viewport" id="shot-viewport"><div class="shot-stage" id="shot-stage"><img id="shot-image" alt="Lokalny screenshot sonaru"></div></div><p>Dotknij interesującego miejsca, aby dodać znacznik; przeciągnij obraz, aby go przesunąć.</p>${['Czy dno wygląda na twarde?','Czy widzisz zielsko?','Czy jest spadek lub rów?','Czy jest przejście dna?','Czy widać ryby lub stado?'].map((text,i)=>select('shot-q'+i,text,[['unknown','Nie wiem'],['yes','Tak'],['no','Nie']])).join('')}<button type="button" id="shot-analyze">Pomóż zinterpretować</button><div id="shot-result" aria-live="polite"></div></div></section>
    <section class="panel-card knowledge-tool" id="scan-check"><h3>Przed położeniem zestawu</h3><div class="scan-checklist">${tools.scanChecklist.map((item,i)=>`<label><input type="checkbox" id="scan-${i}"><span>${esc(item)}</span></label>`).join('')}</div><p id="scan-progress" role="status">0 / ${tools.scanChecklist.length} sprawdzone</p></section>
    <section class="panel-card knowledge-tool" id="sonar-gallery"><h3>Dokumentacja producenta</h3><p>Dodatkowe potwierdzenie ustawień i funkcji. Praktyczne kroki oraz atlas własnych ekranów są powyżej w DreamTeam.</p><ul><li><a href="https://support.deeper.eu/636573-Sonar-settings" target="_blank" rel="noopener noreferrer">Ustawienia i tryby Fish Deeper</a></li><li><a href="https://support.deeper.eu/760937-What-screen-color-modes-are-available-on-the-Deeper-App-and-how-to-use-them-Deeper-PRO--PRO--CHIRP" target="_blank" rel="noopener noreferrer">Palety i twardość</a></li><li><a href="https://support.deeper.eu/381287-Reading-the-Sonar-display-PRO-and-CHIRP-models" target="_blank" rel="noopener noreferrer">Echo i odczyt</a></li><li><a href="https://support.deeper.eu/896405-Fish-Deeper-Premium" target="_blank" rel="noopener noreferrer">Mapy Premium</a></li></ul></section>`;
  q('spot-form').addEventListener('submit',event=>{event.preventDefault();const v=id=>q('s-'+id).value,spots=tools.spots[v('structure')],bottom=v('bottom'),pressure=v('pressure');q('spot-result').innerHTML=`<div class="tool-result"><h4>Trzy punkty do weryfikacji</h4><ol>${spots.map(s=>`<li>${esc(s)}</li>`).join('')}</ol><p>${bottom==='silt'?'Sprawdź, czy przypon nie jest wciągany w muł.':bottom==='weed'?'Potwierdź czyste oczko i bezpieczny hol.':'Potwierdź twardość ciężarkiem; jasny pas nie dowodzi żwiru.'} ${v('temp')==='hot'?'Priorytet: tlen i dobrostan ryb.':''} ${pressure==='high'?'Punkt C może zmniejszyć zakłócenia.':''} ${tools.tactics.season[v('season')]} ${tools.tactics.depth[v('depth')]}</p><p>To hipotezy, nie gwarancja. <a href="/pages/encyklopedia.html#dno">Dobierz prezentację →</a></p></div>`;});
  setupQuiz(sonarData.quiz);setupScreenshot();
  q('scan-check').addEventListener('change',()=>{const checked=q('scan-check').querySelectorAll('input:checked').length;q('scan-progress').textContent=`${checked} / ${tools.scanChecklist.length} ${say('sprawdzone','checked')}`;});
}
function setupQuiz(questions){
  let position=0,score=0,level=1;
  function draw(){const list=questions.filter(item=>item.level===level),item=list[position];if(!item){q('quiz-stage').innerHTML=`<div class="tool-result"><h4>${say('Wynik','Score')}: ${score} / ${list.length}</h4><p>Wróć do artykułów przy niepewnych rozpoznaniach. Jeden ekran sonaru nie wystarcza do decyzji.</p><button id="quiz-restart" type="button">Powtórz poziom</button></div>`;q('quiz-restart').onclick=()=>{position=0;score=0;draw();};return;}
    q('quiz-stage').innerHTML=`<p class="tool-progress">${say('Pytanie','Question')} ${position+1} / ${list.length}</p>${['cone','transects'].includes(item.diagram)?diagram(item.diagram):''}<h4>${esc(item.question)}</h4><div class="answer-buttons">${item.options.map((o,i)=>`<button type="button" data-quiz="${i}">${esc(o)}</button>`).join('')}</div><div id="quiz-feedback" aria-live="polite"></div>`;
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
    q('shot-result').innerHTML=`<div class="tool-result"><h4>Wspomagana interpretacja</h4><p>Wnioski pochodzą tylko z Twoich odpowiedzi, nie z automatycznego rozpoznania obrazu. ${markers.length} zaznaczonych punktów pozostaje lokalnie.</p><ol>${notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ol><p><a href="#atlas-overview">Porównaj własne ekrany →</a> · <a href="${route('sonar-potwierdzenie')}">Potwierdź miejsce →</a></p></div>`;
  };
  window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
}
if(sonar)sonarTools();else diagnostic();
if(location.hash){const id=decodeURIComponent(location.hash.slice(1));requestAnimationFrame(()=>q(id)?.scrollIntoView({block:'start'}));}
}
}
