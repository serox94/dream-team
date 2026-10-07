(() => {
  const pending = new Map();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zone = () => (window.DREAM_MODEL?.app?.timeZonePreference==='auto'?null:window.DREAM_MODEL?.app?.timeZonePreference) || window.DREAM_TRIP?.lakeProfile?.facts?.timeZone || 'Europe/Paris';
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
  const format = value => value ? new Date(value).toLocaleString((document.documentElement.lang==='en'?'en-GB':'pl-PL'),{timeZone:zone(),day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'termin do ustalenia';
  function safeUrl(value) {
    if(!value)return '';
    try {const u=new URL(value,location.origin);return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
  }
  const authorizedFetch=(path,options,signal)=>fetch(path,{cache:'no-store',credentials:'same-origin',...options,headers:{'content-type':'application/json',...options.headers},signal});
  const readCacheKey='ryby_read_cache_v1',authMarkerKey='ryby_last_authorized_v1',maxAge=7*24*60*60*1000;
  const offlinePaths=/^\/api\/(bootstrap|catches|spots|checklist|checklist-categories|documents|notes|settings)(?:\?|$)/;
  const offlineEntries=new Map(),queueKey='dreamteam.offline.queue.v1';
  let synchronizing=false;
  function readQueue(){try{const value=JSON.parse(localStorage.getItem(queueKey)||'[]');return Array.isArray(value)?value:[];}catch{return [];}}
  function writeQueue(items){localStorage.setItem(queueKey,JSON.stringify(items));showOfflineState();}
  function pendingCount(){return readQueue().length;}
  function eligible(path,method,payload){
    if(method==='POST'&&['/api/catches','/api/spots','/api/notes'].includes(path))return Boolean(payload?.tripId);
    if(method==='PATCH'&&/^\/api\/checklist\/\d+\?tripId=[a-zA-Z0-9_-]+$/.test(path))return typeof payload?.packed==='boolean'&&Object.keys(payload).length===1;
    if(method==='PUT'&&/^\/api\/spots\/\d+\?tripId=[a-zA-Z0-9_-]+$/.test(path))return true;
    return false;
  }
  function queueMutation(path,method,payload,key){
    if(!Number(localStorage.getItem(authMarkerKey)))throw new Error('Otwórz wyjazd online i zaloguj się przed pierwszym zapisem offline.');
    const queue=readQueue();if(queue.length>=50)throw new Error('Kolejka offline ma 50 zmian. Połącz się i zsynchronizuj dane.');
    if(JSON.stringify(payload).length>8000)throw new Error('Notatka jest za duża do kolejki offline.');
    let baseRevision=null,resource,id,tripId;
    const match=path.match(/^\/api\/(checklist|spots)\/(\d+)\?tripId=([a-zA-Z0-9_-]+)$/);
    if(match){[,resource,id,tripId]=match;const cached=readEntries()[`/api/${resource}?tripId=${tripId}`]?.data;
      const current=cached?.[resource==='checklist'?'items':'spots']?.find(row=>Number(row.id)===Number(id));
      if(!current||!Number.isInteger(current.revision))throw new Error('Brak wersji tego rekordu offline. Otwórz go online przed wyjazdem.');
      baseRevision=current.revision;
      if(resource==='checklist'){current.packed=payload.packed;current.pendingSync=true;}
      else{Object.assign(current,payload,{pendingSync:true});}
      saveReadCache(`/api/${resource}?tripId=${tripId}`,cached);
    }else{
      tripId=payload.tripId;resource=path.split('/').pop();const cachePath=`/api/${resource}?tripId=${encodeURIComponent(tripId)}`;
      const cached=readEntries()[cachePath]?.data;
      const list=resource==='catches'?'catches':resource==='spots'?'spots':'notes';
      if(cached?.[list]){
        const synthetic=-Date.now()-queue.length;
        const row=resource==='catches'?{...payload,id:synthetic,weightKg:payload.weightKg,anglerName:window.DREAM_MODEL?.anglers.find(a=>a.id===payload.anglerId)?.name||'',pendingSync:true}:
          resource==='spots'?{...payload,id:synthetic,pendingSync:true}:{...payload,id:synthetic,pendingSync:true};
        cached[list].unshift(row);saveReadCache(cachePath,cached);
      }
    }
    queue.push({key,path,method,payload,baseRevision,at:Date.now(),status:'pending'});writeQueue(queue);
    return {ok:true,pendingSync:true,id:-Date.now()};
  }
  async function syncQueue(){
    if(synchronizing||navigator.onLine===false||!readQueue().length)return;
    synchronizing=true;let synced=0;
    try{for(const item of readQueue()){
      if(item.status==='conflict')continue;
      try{const response=await authorizedFetch('/api/offline-sync',{method:'POST',body:JSON.stringify(item)},AbortSignal.timeout(20000));
        if(response.status===401)break;
        const result=await response.json();
        if(response.status===409){item.status='conflict';item.serverRevision=result.serverRevision;item.serverValue=result.serverValue;item.error=result.error;writeQueue(readQueue().map(q=>q.key===item.key?item:q));continue;}
        if(!response.ok){item.status='error';item.error=result.error||`HTTP ${response.status}`;writeQueue(readQueue().map(q=>q.key===item.key?item:q));break;}
        const remaining=readQueue().filter(q=>q.key!==item.key);writeQueue(remaining);synced++;
        const tripId=item.payload.tripId||new URL(item.path,location.origin).searchParams.get('tripId');
        const resource=item.path.match(/^\/api\/(catches|spots|checklist|notes)/)?.[1];
        if(resource&&tripId){const entries=readEntries();delete entries[`/api/${resource}?tripId=${tripId}`];localStorage.setItem(readCacheKey,JSON.stringify(entries));}
      }catch{break;}
    }}finally{synchronizing=false;showOfflineState();}
    if(synced){document.dispatchEvent(new Event('dream:synced'));if(!pendingCount())setTimeout(()=>location.reload(),100);}
  }
  function resolveConflict(key,choice){const queue=readQueue(),item=queue.find(q=>q.key===key);if(!item)return;
    if(choice==='server')writeQueue(queue.filter(q=>q.key!==key));
    else if(choice==='mine'&&Number.isInteger(item.serverRevision)){item.baseRevision=item.serverRevision;item.status='pending';writeQueue(queue);syncQueue();}
  }
  window.addEventListener('online',syncQueue);
  document.addEventListener('click',event=>{if(event.target?.id!=='offline-banner')return;
    const conflict=readQueue().find(item=>item.status==='conflict');if(!conflict)return;
    if(confirm(`${conflict.error}\nOK: ponów swoją zmianę. Anuluj: zachowaj wersję serwera.`))resolveConflict(conflict.key,'mine');else resolveConflict(conflict.key,'server');
  });
  async function clearShell(){
    if(!('caches' in window))return;
    try{for(const key of await caches.keys())if(key.startsWith('ryby-shell-'))await caches.delete(key);}catch{}
  }
  function clearReadCache(){try{localStorage.removeItem(readCacheKey);localStorage.removeItem(authMarkerKey);}catch{}offlineEntries.clear();showOfflineState();}
  function readEntries(){try{return JSON.parse(localStorage.getItem(readCacheKey)||'{}')||{};}catch{return {};}}
  function saveReadCache(path,data){
    if(!offlinePaths.test(path))return;
    try{
      const entries=readEntries();entries[path]={at:Date.now(),data};
      const recent=Object.entries(entries).filter(([,entry])=>entry?.at>Date.now()-maxAge).sort((a,b)=>b[1].at-a[1].at).slice(0,25);
      localStorage.setItem(readCacheKey,JSON.stringify(Object.fromEntries(recent)));
      if(path==='/api/bootstrap')localStorage.setItem(authMarkerKey,String(Date.now()));
    }catch{}
    offlineEntries.delete(path);showOfflineState();
  }
  function readOffline(path){
    if(!offlinePaths.test(path))return null;
    try{
      const marker=Number(localStorage.getItem(authMarkerKey));
      const entry=readEntries()[path];
      if(!marker||Date.now()-marker>maxAge||!entry?.at||Date.now()-entry.at>maxAge)return null;
      offlineEntries.set(path,entry.at);showOfflineState();
      return entry.data;
    }catch{return null;}
  }
  function showOfflineState(){
    let banner=document.getElementById('offline-banner');const count=pendingCount();
    if(!offlineEntries.size&&!count){banner?.remove();return;}
    if(!banner){banner=document.createElement('div');banner.id='offline-banner';banner.className='offline-banner';banner.setAttribute('role','status');document.body.prepend(banner);}
    const english=window.DreamI18n?.lang==='en';
    const stale=offlineEntries.size?`${english?'Offline data / last sync':'Dane offline / ostatnia synchronizacja'} ${new Date(Math.min(...offlineEntries.values())).toLocaleString(english?'en-GB':(document.documentElement.lang==='en'?'en-GB':'pl-PL'),{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}. `:'';
    const conflicts=readQueue().filter(item=>item.status==='conflict').length;
    banner.textContent=stale+(count?english?`${count} change${count===1?'':'s'} waiting to sync.${conflicts?` ${conflicts} conflict${conflicts===1?'':'s'} — tap here to resolve.`:''}`:`Oczekuje na synchronizację: ${count}.${conflicts?` ${conflicts} konflikt(y) — dotknij tutaj, aby rozstrzygnąć.`:''}`:'');
  }
  async function api(path,options={}){
    const get=!options.method||options.method==='GET';
    let payload=null,mutationKey=null;
    if(!get){try{payload=JSON.parse(options.body||'{}');}catch{}
      if(eligible(path,options.method,payload)){mutationKey=crypto.randomUUID();options={...options,headers:{...options.headers,'idempotency-key':mutationKey}};
        if(navigator.onLine===false)return queueMutation(path,options.method,payload,mutationKey);
      }
    }
    if(get&&pending.has(path))return pending.get(path);
    const task=(async()=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      let eligibleFallback=false;
      try{
        const response=await authorizedFetch(path,options,controller.signal);
        if(response.status===401){clearReadCache();await clearShell();location.assign('/login');throw new Error('Sesja wygasła. Zaloguj się ponownie.');}
        const data=await response.json();
        eligibleFallback=response.status>=500;
        if(!response.ok||data.ok===false)throw new Error(data.error||`HTTP ${response.status}`);
        if(get)saveReadCache(path,data);
        return data;
      }catch(error){
        if(mutationKey&&(error.name==='AbortError'||error.name==='TypeError'))return queueMutation(path,options.method,payload,mutationKey);
        if(get&&(eligibleFallback||error.name==='AbortError'||error.name==='TypeError')){
          const cached=readOffline(path);if(cached)return cached;
        }
        if(error.name==='AbortError')throw new Error('Połączenie trwa zbyt długo. Sprawdź zasięg i spróbuj ponownie.');
        if(error.name==='TypeError')throw new Error('Brak połączenia z internetem. Wpisane dane pozostały w formularzu. Spróbuj ponownie.');
        throw error;
      }finally{clearTimeout(timeout);}
    })();
    if(get)pending.set(path,task);
    try{return await task;}finally{if(get)pending.delete(path);}
  }
  async function downloadBackup(){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await authorizedFetch('/api/export',{method:'GET'},controller.signal);
      if(response.status===401){clearReadCache();await clearShell();location.assign('/login');throw new Error('Sesja wygasła. Zaloguj się ponownie.');}
      if(!response.ok){const data=await response.json();throw new Error(data.error||`HTTP ${response.status}`);}
      const href=URL.createObjectURL(await response.blob()),a=document.createElement('a');
      a.href=href;a.download=`dream-team-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
    }finally{clearTimeout(timeout);}
  }
  async function logout(){
    const response=await authorizedFetch('/api/logout',{method:'POST',body:'{}'});
    if(!response.ok)throw new Error('Nie udało się wylogować. Spróbuj ponownie.');
    if(pendingCount()&&!confirm(window.DreamI18n?.t('Masz zmiany oczekujące na synchronizację. Wylogowanie usunie je z tego urządzenia. Kontynuować?')||'Masz zmiany oczekujące na synchronizację. Wylogowanie usunie je z tego urządzenia. Kontynuować?'))return;
    localStorage.removeItem(queueKey);clearReadCache();
    await clearShell();
    location.assign('/login');
  }
  async function registerShell(){
    showOfflineState();syncQueue();
    if(!('serviceWorker' in navigator))return;
    try{
      await navigator.serviceWorker.register('/sw.js',{scope:'/'});
      const registration=await navigator.serviceWorker.ready;
      if(navigator.onLine!==false)registration.active?.postMessage({type:'WARM_SHELL'});
      showOfflineState();syncQueue();
    }catch(error){console.warn('Offline shell unavailable:',error);}
  }
  function notice(message,error=false){
    let box=document.getElementById('app-notice');
    if(!box){box=document.createElement('div');box.id='app-notice';box.setAttribute('role','status');document.querySelector('main')?.prepend(box);}
    box.className='weather-note '+(error?'status-danger':'status-info');box.textContent=window.DreamI18n?.t(message)||message;box.hidden=!message;
  }
  function renderHeader(){
    const model=window.DREAM_MODEL,trip=window.DREAM_TRIP;
    const page=location.pathname.split('/').pop().replace(/\.html$/,'')||'index';
    document.body.dataset.page=page==='index'?'dashboard':page;
    const menu=document.getElementById('main-nav');
    if(menu&&!menu.querySelector('[data-knowledge-link]')){
      const before=[...menu.querySelectorAll('a')].find(a=>/porady\.html/.test(a.getAttribute('href')));
      for(const [path,label] of [['encyklopedia.html','Encyklopedia'],['sonar.html','Deeper / Sonar'],['ustawienia.html','Ustawienia']]){
        const link=document.createElement('a');link.href=`/pages/${path}`;link.textContent=label;link.dataset.knowledgeLink='true';
        menu.insertBefore(link,before||null);
      }
    }
    document.querySelector('.header-top h1').textContent='DreamTeam';
  document.querySelector('.subtitle').textContent=trip.lakeProfile?.name||trip.lake;
    document.getElementById('dream-trip-select')?.remove();
    const select=document.createElement('select');select.id='dream-trip-select';select.className='dream-trip-select';select.setAttribute('aria-label','Wybierz wyjazd');
    for(const archived of [false,true]){
      const group=document.createElement('optgroup');group.label=archived?'Archiwum':'Wyjazdy';
      for(const t of model.trips.filter(t=>(t.status==='archived')===archived)){
        const o=document.createElement('option');o.value=t.id;o.dataset.userContent='';
        o.textContent=`${t.isActive?'★ ':''}${t.name} · ${t.start?Dream.dateInput(t.start,t.lakeProfile?.facts?.timeZone||'Europe/Paris').slice(0,10):t.year+' · '+(window.DreamI18n?.t('bez terminu')||'bez terminu')}${archived?' · '+(window.DreamI18n?.t('archiwum')||'archiwum'):''}`;
        o.selected=t.id===trip.id;group.append(o);
      }
      if(group.children.length)select.append(group);
    }
    select.addEventListener('change',()=>{Dream.rememberTrip(select.value);location.reload();});
    document.querySelector('.header-top > div:first-child').append(select);
    document.querySelector('.trip-box').innerHTML=`<div><strong>Wyjazd:</strong> ${Dream.esc(Dream.format(trip.start))}</div><div><strong>Powrót:</strong> ${Dream.esc(Dream.format(trip.end))}</div><div id="countdown"></div><small>${Dream.esc(Dream.zone())} · ${trip.status==='archived'?'Archiwum':trip.isActive?'★ Aktywny wyjazd':'Podgląd wyjazdu'}</small>`;
    if(!document.querySelector('.bottom-nav')){
      const nav=document.createElement('nav');nav.className='bottom-nav';nav.setAttribute('aria-label','Szybka nawigacja');
      nav.innerHTML=`<a href="/" data-page="dashboard"><span class="nav-icon" aria-hidden="true">⌂</span>Start</a><a href="/pages/checklisty.html" data-page="checklisty"><span class="nav-icon" aria-hidden="true">✓</span>Lista</a><a class="nav-add-catch" href="/pages/polowy.html#catch-form" data-page="polowy"><span class="nav-icon" aria-hidden="true">＋</span>Połów</a><a href="/pages/pogoda.html" data-page="pogoda"><span class="nav-icon" aria-hidden="true">☀</span>Pogoda</a><button type="button" id="bottom-more" aria-controls="main-nav" aria-expanded="false"><span class="nav-icon" aria-hidden="true">☰</span>Więcej</button>`;
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
  window.Dream={renderHeader,api,downloadBackup,logout,clearReadCache,registerShell,pendingCount,syncQueue,esc,zone,dateInput,fromInput,format,safeUrl,notice,refreshModel,rememberTrip,readTrip,undo,
    hour:value=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone(),hour:'2-digit',hourCycle:'h23'}).format(new Date(value))),
    day:value=>new Date(value).toLocaleDateString((document.documentElement.lang==='en'?'en-GB':'pl-PL'),{timeZone:zone()})};
})();
