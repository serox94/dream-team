(() => {
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const facts=trip=>({...trip.lakeProfile?.facts,...trip.facts});
  const mode=(trip,now=Date.now())=>{
    if(!trip?.isActive||trip.status==='archived'||!trip.start||!trip.end)return 'normal';
    const start=Date.parse(trip.start),end=Date.parse(trip.end);
    if(!Number.isFinite(start)||!Number.isFinite(end))return 'normal';
    return now<start?'before':now<=end?'field':'normal';
  };
  const ratio=items=>`${items.filter(item=>item.done).length}/${items.length}`;
  const groupFor=(item,people)=>{
    const assigned=String(item.assigned_to??'').trim().toLocaleLowerCase('pl');
    return people.find(person=>[person.name,person.id].some(value=>String(value).toLocaleLowerCase('pl')===assigned))?.id||'shared';
  };

  function renderDashboard(trip,items){
    const state=mode(trip),card=document.getElementById('field-readiness');
    document.body.dataset.fieldMode=state;
    const status=document.getElementById('dashboard-status');
    if(state==='field'&&status)status.textContent='Na łowisku · aktywny wyjazd';
    const actions=document.querySelector('.dashboard-hero .hero-actions');
    if(actions&&state==='field'){
      actions.innerHTML='<a href="/pages/polowy.html#catch-form">+ Dodaj połów</a><a href="/pages/pogoda.html">Pogoda</a><a href="/pages/checklisty.html">Lista</a><a href="/pages/mapa.html">Mapa</a><a href="/pages/teren.html">Nad wodą</a>';
    }
    if(!card)return;
    card.hidden=state==='normal';
    if(state==='normal')return;
    const done=items.filter(item=>item.done).length,all=items.length,percentage=all?Math.round(done/all*100):0;
    if(state==='field'){
      card.innerHTML=`<div class="section-head"><h3>Checklista na łowisku</h3><a class="dashboard-mini-link" href="/pages/checklisty.html">Otwórz →</a></div><p><strong>${done} z ${all}</strong> rzeczy gotowych · ${percentage}%</p>`;
      return;
    }
    const people=trip.participants||[];
    const groups=[...people.map(person=>({id:person.id,name:person.name})),{id:'shared',name:'Wspólne'}];
    const missing=items.filter(item=>!item.done).sort((a,b)=>{
      const priority=value=>/sprzęt/i.test(value.category)?0:/zakupy/i.test(value.category)?1:2;
      return priority(a)-priority(b)||Number(a.sort_order||0)-Number(b.sort_order||0);
    }).slice(0,4);
    card.innerHTML=`<div class="section-head"><h3>Gotowość do wyjazdu</h3><a class="dashboard-mini-link" href="/pages/checklisty.html">Checklista →</a></div>
      <div class="readiness-total"><strong>${percentage}%</strong><span>Spakowane ${done} / ${all}</span></div>
      <div class="readiness-track" aria-hidden="true"><span style="width:${percentage}%"></span></div>
      <div class="readiness-groups">${groups.map(group=>{const own=items.filter(item=>groupFor(item,people)===group.id);return `<div><span>${esc(group.name)}</span><strong>${ratio(own)}</strong></div>`;}).join('')}</div>
      <div class="readiness-missing"><strong>Jeszcze brakuje</strong>${missing.length?`<ul>${missing.map(item=>`<li>${esc(item.item_name)}${item.assigned_to?` · ${esc(item.assigned_to)}`:''}</li>`).join('')}</ul>`:'<p>Nic do spakowania na tej liście.</p>'}</div>`;
  }

  function renderGuide(trip,docs){
    const main=document.querySelector('main.page-content');if(!main)return;
    const profile=trip.lakeProfile||{},f=facts(trip),name=profile.name||trip.lake;
    const lat=profile.latitude??trip.latitude,lon=profile.longitude??trip.longitude;
    const hasGps=lat!=null&&lon!=null;
    const target=hasGps?`${lat},${lon}`:f.address||name;
    const maps=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
    const phone=f.contact||f.managerPhone;
    const tel=phone?String(phone).replace(/[^+\d]/g,''):'';
    const details=[['Łowisko',name],['Stanowisko',trip.peg],['Adres',f.address],['GPS',hasGps?`${lat}, ${lon}`:null],['Przyjazd',f.arrival],['Wyjazd',f.departure],['Dozwolone wędki',f.rods],['Łódka zanętowa',f.baitBoat],['Prąd',f.power],['WC / prysznic',f.sanitary||f.toilets],['Sklep / zakupy',f.shops||f.shop]];
    const rules=[f.hooks,f.leadSafety,f.fishCare,f.leaders,f.line,f.markers,f.rulesText]
      .filter(Boolean).flatMap(value=>String(value).split(/(?<=[.!?])\s+/)).filter(Boolean).slice(0,6);
    if(!rules.length)rules.push(...docs.filter(doc=>doc.kind==='rules').flatMap(doc=>String(doc.content||'').split(/(?<=[.!?])\s+/)).filter(Boolean).slice(0,6));
    main.innerHTML=`<section class="hero-card field-guide-hero"><span class="dashboard-eyebrow">Szybki dostęp w terenie</span><h2>Najważniejsze nad wodą</h2><p>${esc(name)}${trip.peg?` · stanowisko ${esc(trip.peg)}`:''}</p>
      <div class="field-guide-actions"><a href="${esc(maps)}" target="_blank" rel="noopener">Otwórz w mapie ↗</a>${tel?`<a href="tel:${esc(tel)}">Zadzwoń do właściciela</a>`:''}<a href="/pages/polowy.html#catch-form">+ Dodaj połów</a></div></section>
      <section class="panel-card"><h3>Na miejscu</h3><div class="field-guide-facts">${details.filter(([,value])=>value!==null&&value!==undefined&&String(value).trim()!=='').map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div></section>
      ${rules.length?`<section class="panel-card"><h3>Kluczowe zasady</h3><ul class="field-guide-rules">${rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ul><a class="dashboard-mini-link" href="/pages/regulamin.html">Pełny regulamin →</a></section>`:''}
      <section class="field-guide-links"><a href="/pages/mapa.html">Mapa stanowiska</a><a href="/pages/dojazd.html">Dojazd i okolica</a><a href="/pages/checklisty.html">Checklista</a></section>`;
  }
  window.DreamField={mode,renderDashboard,renderGuide};
})();
