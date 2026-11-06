// Presentation only: preserve existing nodes, handlers and data ownership.
(()=>{
 const en=()=>window.DreamLanguage?.get()==='en',T=(pl,eng)=>en()?eng:pl;
 const nav=document.getElementById('main-nav');
 if(nav&&!nav.querySelector('.nav-group')){
  const links=[...nav.querySelectorAll('a')];
  const groups=[['Wyprawa','Trip',['/','wyjazdy','checklisty','polowy','mapa']],['Nad wodą','At the lake',['pogoda','dojazd','regulamin','porady']],['Wiedza','Knowledge',['encyklopedia','sonar','rigi','wezly']],['Konto','Account',['ustawienia']]];
  const close=document.createElement('button');close.type='button';close.id='menu-close';close.textContent=T('Zamknij ×','Close ×');close.onclick=()=>{document.getElementById('menu-toggle').click();document.getElementById('bottom-more')?.focus()};nav.prepend(close);
  for(const [pl,eng,ids]of groups){const section=document.createElement('section');section.className='nav-group';const title=document.createElement('h2');title.textContent=T(pl,eng);section.append(title);for(const id of ids){const link=links.find(a=>id==='/'?new URL(a.href).pathname==='/':a.href.includes('/'+id+'.html'));if(link)section.append(link)}nav.append(section)}
  document.getElementById('bottom-more')?.addEventListener('click',()=>{if(nav.classList.contains('open'))close.focus()});
 }
 const compact=()=>document.documentElement.classList.toggle('header-compact',window.scrollY>80);window.addEventListener('scroll',compact,{passive:true});compact();
 const main=document.querySelector('main.page-content');
 if(document.body.dataset.page==='dashboard'&&main&&!document.getElementById('dashboard-details')){
  const details=document.createElement('details');details.id='dashboard-details';details.className='panel-card dashboard-details';const title=document.createElement('summary');title.textContent=T('Statystyki i dodatkowe informacje','Statistics and more information');details.append(title);
  for(const el of [main.querySelector('.dashboard-secondary-stats'),main.querySelector('.chart-panel'),document.getElementById('dashboard-extra-grid')])if(el)details.append(el);
  const quick=main.querySelector('.quick-links')?.closest('article');if(quick)details.append(quick);
  main.querySelector('#last-entry')?.closest('.two-column')?.classList.add('dashboard-recent-only');
  const packing=main.querySelector('#dashboard-check-progress')?.closest('article');if(packing&&!document.getElementById('field-readiness')?.hidden)details.append(packing);
  main.append(details);details.addEventListener('toggle',()=>{if(details.open)window.dispatchEvent(new Event('resize'))});
 }
 function tripViews(){
  const root=document.getElementById('trip-manager'),editor=document.getElementById('trip-editor-panel'),fisheries=document.getElementById('fisheries-area');
  if(!root||!editor||root.querySelector('#trip-list-view'))return;
  const list=document.createElement('div');list.id='trip-list-view';
  for(const child of [...root.children])if(child!==editor)list.append(child);root.prepend(list);
  const archive=document.getElementById('trip-archive');if(archive){const fold=document.createElement('details');fold.className='panel-card trip-archive-fold';const title=document.createElement('summary');title.textContent=T('Archiwum i zakończone wyjazdy','Archived and completed trips');archive.before(fold);const completed=archive.previousElementSibling?.previousElementSibling;if(completed?.tagName==='SECTION')fold.append(completed);fold.append(title,archive);fold.prepend(title)}
  list.querySelectorAll('.trip-card .form-actions').forEach(actions=>{const detail=document.createElement('details');detail.className='trip-card-actions';const summary=document.createElement('summary');summary.textContent=T('Działania','Actions');detail.append(summary);actions.before(detail);detail.append(actions)});
  const back=document.createElement('button');back.type='button';back.id='trip-view-back';back.className='secondary-btn';back.textContent=T('← Wróć do wyjazdów','← Back to trips');root.prepend(back);
  const show=(mode,scroll=true)=>{list.hidden=mode!=='list';editor.hidden=mode!=='edit';if(fisheries)fisheries.hidden=mode!=='fisheries';back.hidden=mode==='list';if(mode==='edit')editor.open=true;main.dataset.tripView=mode;if(scroll){const url=new URL(location.href);if(mode!=='fisheries')url.searchParams.delete('lakeId');if(mode!=='edit')url.searchParams.delete('createTrip');if(mode!=='fisheries'&&url.hash==='#fisheries-area')url.hash='';history.replaceState(null,'',url.pathname+url.search+url.hash);window.scrollTo({top:0,behavior:'instant'})}};
  back.onclick=()=>show('list');
  root.roundTwoShow=show;if(!root.dataset.roundTwoBound){root.dataset.roundTwoBound='true';root.addEventListener('click',event=>{if(event.target.closest('#create-trip,[data-edit]'))root.roundTwoShow('edit')})}
  document.querySelectorAll('.trip-page-tabs a').forEach(a=>a.onclick=event=>{event.preventDefault();const mode=a.hash==='#fisheries-area'?'fisheries':'list';show(mode);if(a.hash==='#trip-archive'){const fold=root.querySelector('.trip-archive-fold');if(fold){fold.open=true;fold.scrollIntoView({block:'start'})}}});
  const request=new URLSearchParams(location.search);show(request.get('createTrip')==='1'?'edit':request.has('lakeId')||location.hash==='#fisheries-area'?'fisheries':'list',false);
 }
 tripViews();const root=document.getElementById('trip-manager');if(root)new MutationObserver(tripViews).observe(root,{childList:true});
})();
