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
  const writeTokenKey='ryby_write_token';
  let credentialPrompt=null;
  function askWriteToken(){
    if(credentialPrompt)return credentialPrompt;
    credentialPrompt=new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='write-auth-dialog';
      dialog.innerHTML='<form><h2>Klucz dostępu do RYBY</h2><p>Administrator przekazuje klucz osobom uprawnionym do zapisu.</p><label>Klucz dostępu<input type="password" autocomplete="off" required minlength="32"></label><div class="form-actions"><button type="button" class="secondary-btn">Anuluj</button><button type="submit">Potwierdź</button></div></form>';
      const finish=value=>{dialog.remove();resolve(value);};
      dialog.querySelector('button[type="button"]').addEventListener('click',()=>finish(''));
      dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();finish(dialog.querySelector('input').value.trim());});
      dialog.addEventListener('cancel',e=>{e.preventDefault();finish('');});
      document.body.append(dialog);
      if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
      dialog.querySelector('input').focus();
    }).finally(()=>{credentialPrompt=null;});
    return credentialPrompt;
  }
  async function authorizedFetch(path,options,signal){
    const protectedRoute=options.method&&options.method!=='GET'||path==='/api/export';
    const send=token=>fetch(path,{cache:'no-store',...options,headers:{'content-type':'application/json',...options.headers,...(token?{authorization:`Bearer ${token}`}:{})},signal});
    if(!protectedRoute)return send('');
    let token='';try{token=sessionStorage.getItem(writeTokenKey)||'';}catch{}
    let response=await send(token);
    if(response.status!==401)return response;
    token=await askWriteToken();
    if(!token)return response;
    response=await send(token);
    if(response.ok){try{sessionStorage.setItem(writeTokenKey,token);}catch{}}
    return response;
  }
  async function api(path,options={}){
    const get=!options.method||options.method==='GET';
    if(get&&pending.has(path))return pending.get(path);
    const task=(async()=>{
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await authorizedFetch(path,options,controller.signal);
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
      if(!response.ok){const data=await response.json();throw new Error(data.error||`HTTP ${response.status}`);}
      const href=URL.createObjectURL(await response.blob()),a=document.createElement('a');
      a.href=href;a.download=`dream-team-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),60000);
    }finally{clearTimeout(timeout);}
  }
  function notice(message,error=false){
    let box=document.getElementById('app-notice');
    if(!box){box=document.createElement('div');box.id='app-notice';box.setAttribute('role','status');document.querySelector('main')?.prepend(box);}
    box.className='weather-note '+(error?'status-danger':'status-info');box.textContent=message;box.hidden=!message;
  }
  function renderHeader(){
    const model=window.DREAM_MODEL,trip=window.DREAM_TRIP;
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
  window.Dream={renderHeader,api,downloadBackup,esc,zone,dateInput,fromInput,format,safeUrl,notice,refreshModel,rememberTrip,readTrip,undo,
    hour:value=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:zone(),hour:'2-digit',hourCycle:'h23'}).format(new Date(value))),
    day:value=>new Date(value).toLocaleDateString('pl-PL',{timeZone:zone()})};
})();
