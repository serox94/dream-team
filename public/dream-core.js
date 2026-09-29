(() => {
  const pending = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zone = () => window.DREAM_TRIP?.lakeProfile?.facts?.timeZone || 'Europe/Paris';
  const parts = (value, timeZone = zone()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  function dateInput(value,timeZone=zone()) {if(!value)return '';const p=parts(value,timeZone);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
  function fromInput(value,timeZone=zone()) {
    if(!value)return null;
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('Nieprawidłowa data.');
    const naive=Date.parse(value+'Z');let guess=naive;
    for(let i=0;i<3;i++){const p=parts(guess,timeZone);const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);guess=naive-(wall-guess);}
    if(dateInput(guess,timeZone)!==value)throw new Error('Ta godzina nie istnieje przy zmianie czasu. Wybierz inną godzinę.');
    return new Date(guess).toISOString();
  }
  const format = value => value ? new Date(value).toLocaleString('pl-PL',{timeZone:zone(),day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'termin do ustalenia';
  function safeUrl(value) {
    if(!value)return '';
    try {const u=new URL(value,location.origin);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
  }
  const authorizedFetch=(path,options,signal)=>fetch(path,{cache:'no-store',credentials:'same-origin',...options,headers:{'content-type':'application/json',...options.headers},signal});
  async function api(path,options={}){
    const get=!options.method||options.method==='GET';
    if(get&&pending.has(path))return pending.get(path);
    const task=(async()=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await authorizedFetch(path,options,controller.signal);
        if(response.status===401){location.assign('/login');throw new Error('Sesja wygasła. Zaloguj się ponownie.');}
        const data=await response.json();
        if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);
        return data;
      }finally{clearTimeout(timeout);}
    })();
    if(get)pending.set(path,task);
    try{return await task;}finally{if(get)pending.delete(path);}
  }
  async function downloadBackup(){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await authorizedFetch('/api/export',{method:'GET'},controller.signal);
      if(response.status===401){location.assign('/login');throw new Error('Sesja wygasła. Zaloguj się ponownie.');}
      if(!response.ok){const data=await response.json();throw new Error(data.error||`HTTP ${response.status}`);}
      const href=URL.createObjectURL(await response.blob()),a=document.createElement('a');
      a.href=href;a.download=`dream-team-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
    }finally{clearTimeout(timeout);}
  }
  async function logout(){
    const response=await authorizedFetch('/api/logout',{method:'POST',body:'{}'});
    if(!response.ok)throw new Error('Nie udało się wylogować. Spróbuj ponownie.');
    location.assign('/login');
  }
  function notice(message,error=false){
    let box=document.getElementById('app-notice');
    if(!box){box=document.createElement('div');box.id='app-notice';box.setAttribute('role','status');document.querySelector('main')?.prepend(box);}
    box.className='weather-note '+(error?'status-danger':'status-info');box.textContent=message;box.hidden=!message;
  }
  function renderHeader(){
    const model=window.DREAM_MODEL,trip=window.DREAM_TRIP;
    const page=location.pathname.split('/').pop().replace(/\.html$/,'')||'index';
    document.body.dataset.page=page==='index'?'dashboard':page;
    document.querySelector('.header-top h1').textContent='RYBY';
  document.querySelector('.subtitle').textContent=trip.lakeProfile?.name||trip.lake;
    document.getElementById('dream-trip-select')?.remove();
    const select=document.createElement('select');select.id='dream-trip-select';select.className='dream-trip-select';select.setAttribute('aria-label','Wybierz wyjazd');
    for(const archived of [false,true]){
      const group=document.createElement('optgroup');group.label=archived?'Archiwum':'Wyjazdy';
      for(const t of model.trips.filter(t=>(t.status==='archived')===archived)){
        const o=document.createElement('option');o.value=t.id;
        o.textContent=`${t.isActive?'★ ':''}${t.name} · ${t.start?Dream.dateInput(t.start,t.lakeProfile?.facts?.timeZone||'Europe/Paris').slice(0,10):t.year+' · bez terminu'}${archived?' · archiwum':''}`;
        o.selected=t.id===trip.id;group.append(o);
      }
      if(group.children.length)select.append(group);
    }
    select.addEventListener('change',()=>{Dream.rememberTrip(select.value);location.reload();});
    document.querySelector('.header-top > div:first-child').append(select);
    document.querySelector('.trip-box').innerHTML=`<div><strong>Wyjazd:</strong> ${Dream.esc(Dream.format(trip.start))}</div><div><strong>Powrót:</strong> ${Dream.esc(Dream.format(trip.end))}</div><div id="countdown"></div><small>${Dream.esc(Dream.zone())} · ${trip.status==='archived'?'Archiwum':trip.isActive?'★ Aktywny wyjazd':'Podgląd wyjazdu'}</small>`;
    if(!document.querySelector('.bottom-nav')){
      const nav=document.createElement('nav');nav.className='bottom-nav';nav.setAttribute('aria-label','Szybka nawigacja');
      nav.innerHTML=`<a href="/" data-page="dashboard"><span class="nav-icon" aria-hidden="true">⌂</span>Start</a><a href="/pages/polowy.html" data-page="polowy"><span class="nav-icon" aria-hidden="true">◉</span>Połowy</a><a href="/pages/checklisty.html" data-page="checklisty"><span class="nav-icon" aria-hidden="true">✓</span>Lista</a><a href="/pages/pogoda.html" data-page="pogoda"><span class="nav-icon" aria-hidden="true">☀</span>Pogoda</a><button type="button" id="bottom-more" aria-controls="main-nav" aria-expanded="false"><span class="nav-icon" aria-hidden="true">☰</span>Więcej</button>`;
      document.body.append(nav);
    }
    document.querySelectorAll('.bottom-nav a').forEach(a=>{const active=a.dataset.page===document.body.dataset.page;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  }
  async function refreshModel(){
    const model=await api('/api/bootstrap');
    window.DREAM_MODEL=model;window.DREAM_TRIP=model.trips.find(t=>t.id===window.DREAM_VIEWED_TRIP_ID)||window.DREAM_TRIP;
    renderHeader();
    return model;
  }
  function rememberTrip(id){try{localStorage.setItem('dream_team_viewed_trip',id);}catch{}}
  function readTrip(){try{return localStorage.getItem('dream_team_viewed_trip');}catch{return null;}}
  function undo(kind,id,refresh){
    notice('Wpis usunięty. Możesz cofnąć tę zmianę.');
    const b=document.createElement('button');b.textContent='Cofnij usunięcie';b.type='button';b.className='secondary-btn';
    b.addEventListener('click',async()=>{b.disabled=true;try{await api(`/api/${kind}/${id}/restore?tripId=${encodeURIComponent(window.DREAM_TRIP.id)}`,{method:'POST',body:'{}'});await refreshModel();await refresh();notice('Wpis przywrócony.');}catch(e){notice(e.message,true);b.disabled=false;}});
    document.getElementById('app-notice')?.append(b);
  }
  window.Dream={renderHeader,api,downloadBackup,logout,esc,zone,dateInput,fromInput,format,safeUrl,notice,refreshModel,rememberTrip,readTrip,undo,
    hour:value=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone(),hour:'2-digit',hourCycle:'h23'}).format(new Date(value))),
    day:value=>new Date(value).toLocaleDateString('pl-PL',{timeZone:zone()})};
})();
