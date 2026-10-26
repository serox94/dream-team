// One navigation definition for every authenticated screen. Never removes the active link.
(() => {
 const entries=[['/','Start','Home'],['wyjazdy','Wyjazdy i archiwum','Trips and archive'],['lowiska','Łowiska','Fisheries'],['polowy','Połowy','Catches'],['checklisty','Checklisty','Checklists'],['pogoda','Pogoda PRO','Weather PRO'],['teren','Najważniejsze nad wodą','Essentials at the water'],['dojazd','Dojazd / okolica','Directions / nearby'],['regulamin','Regulamin','Regulations'],['mapa','Mapy','Maps'],['rigi','Rigi','Rigs'],['wezly','Węzły','Knots'],['encyklopedia','Encyklopedia','Encyclopedia'],['sonar','Deeper / Sonar','Deeper / Sonar'],['porady','Porady','Tips'],['ustawienia','Ustawienia','Settings']];
 const en=()=>document.documentElement.lang==='en',url=p=>p==='/'?'/':`/pages/${p}.html`,normalize=p=>p.replace(/\/index(?:\.html)?$/,'/').replace(/\.html$/,'').replace(/\/$/,'');
 function render(){
  const {DREAM_MODEL:model,DREAM_TRIP:trip,Dream:D}=window;if(!model||!trip)return;
  const page=location.pathname.split('/').pop().replace(/\.html$/,'')||'index';document.body.dataset.page=page==='index'?'dashboard':page;
  const header=document.querySelector('.header-top'),menu=document.getElementById('main-nav');
  if(!header.classList.contains('dream-shell')){
   const theme=document.getElementById('dream-theme-toggle');header.classList.add('dream-shell');
   header.innerHTML=`<a class="dream-brand" href="/" aria-label="DreamTeam"><img class="brand-light" src="/assets/brand/dreamteam-logo.svg" alt="DreamTeam" width="106" height="61"><img class="brand-dark" src="/assets/brand/dreamteam-logo-light.svg" alt="DreamTeam" width="106" height="61"></a><div class="dream-trip"><h1 class="visually-hidden">DreamTeam</h1><p class="subtitle"></p><label class="visually-hidden" for="dream-trip-select">${en()?'Selected trip':'Wybrany wyjazd'}</label><select id="dream-trip-select" class="dream-trip-select"></select></div><div class="trip-box"><div id="countdown" role="status" aria-live="off"></div><small id="trip-view-status"></small></div>`;
   if(theme)header.append(theme);
   document.getElementById('dream-trip-select').addEventListener('change',e=>{D.rememberTrip(e.target.value);location.reload();});
   menu.replaceChildren(...entries.map(([p,pl,english])=>{const a=document.createElement('a');a.href=url(p);a.textContent=en()?english:pl;const active=normalize(a.pathname)===normalize(location.pathname);a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');return a;}));
  }
  header.querySelector('.subtitle').textContent=trip.lakeProfile?.name||trip.lake;
  const select=document.getElementById('dream-trip-select');select.replaceChildren(...model.trips.map(t=>{const o=document.createElement('option');o.value=t.id;o.dataset.userContent='';o.textContent=`${t.isActive?'★ ':''}${t.name}`;o.selected=t.id===trip.id;return o;}));
  document.getElementById('trip-view-status').textContent=trip.status==='archived'?(en()?'Archive':'Archiwum'):trip.isActive?(en()?'Active trip':'Aktywny wyjazd'):(en()?'Viewing trip':'Podgląd wyjazdu');
  updateCountdown();
  if(!document.querySelector('.bottom-nav')){
   const nav=document.createElement('nav');nav.className='bottom-nav';nav.setAttribute('aria-label',en()?'Quick navigation':'Szybka nawigacja');
   nav.innerHTML=`<a href="/" data-page="dashboard"><span aria-hidden="true">⌂</span>${en()?'Home':'Start'}</a><a href="/pages/checklisty.html" data-page="checklisty"><span aria-hidden="true">✓</span>${en()?'List':'Lista'}</a><a href="/pages/polowy.html#catch-form" data-page="polowy"><span aria-hidden="true">＋</span>${en()?'Catch':'Połów'}</a><a href="/pages/pogoda.html" data-page="pogoda"><span aria-hidden="true">☀</span>${en()?'Weather':'Pogoda'}</a><button type="button" id="bottom-more" aria-controls="main-nav" aria-expanded="false"><span aria-hidden="true">☰</span>${en()?'More':'Więcej'}</button>`;document.body.append(nav);
  }
  document.querySelectorAll('.bottom-nav a').forEach(a=>{const active=a.dataset.page===document.body.dataset.page;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 }
 function countdown(trip,now=Date.now()){
  if(!trip?.start)return en()?'Date to be confirmed':'Termin do ustalenia';const start=Date.parse(trip.start),end=Date.parse(trip.end);
  if(now<start){const minutes=Math.floor((start-now)/60000);return en()?`Trip in ${Math.floor(minutes/1440)}d ${Math.floor(minutes/60)%24}h ${minutes%60}m`:`Do wyjazdu: ${Math.floor(minutes/1440)} dni ${Math.floor(minutes/60)%24} godz. ${minutes%60} min`;}if(!Number.isFinite(end)||now<=end)return en()?'Trip in progress':'Wyjazd trwa';return en()?'Trip ended':'Wyjazd zakończony';
 }
 function updateCountdown(){const message=countdown(window.DREAM_TRIP);for(const id of ['countdown','dashboard-countdown']){const el=document.getElementById(id);if(el)el.textContent=message;}}
 window.DreamShell={render,entries,countdown,updateCountdown};setInterval(updateCountdown,60000);
})();
