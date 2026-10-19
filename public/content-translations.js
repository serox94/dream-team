// Browser-local presentation only. Original records and edit values stay unchanged.
(() => {
 let records=[],byKey=new Map();
 const language=()=>window.DreamLanguage?.get()||document.documentElement.lang||'pl';
 const say=(pl,en)=>language()==='en'?en:pl;
 const key=(entity,id,field)=>[entity,String(id),field].join('|');
 function text(entity,id,field,original){const item=byKey.get(key(entity,id,field));return item?.status==='current'&&item.sourceText===original?item.translation:original;}
 async function load(){
  try{const data=await Dream.api('/api/content-translations?tripId='+encodeURIComponent(window.DREAM_TRIP.id)+'&language='+language());records=data.records;byKey=new Map(records.map(r=>[key(r.entity,r.recordId,r.field),r]));}
  catch{records=[];byKey.clear();}
  apply();
 }
 function apply(){
  const current=new Map(),ambiguous=new Set(),counts=new Map();for(const r of records){counts.set(r.sourceText,(counts.get(r.sourceText)||0)+1);if(counts.get(r.sourceText)>1)ambiguous.add(r.sourceText);}for(const r of records.filter(r=>r.status==='current'))current.set(r.sourceText,r.translation);
  const selector='[data-user-content],.catch-note,.check-item-title,.spot-card h4,.trip-card h3,#dashboard-trip-name,#dashboard-lake,#dashboard-peg';
  document.querySelectorAll(selector).forEach(host=>{if(host.closest('form,#content-translation-editor,input,textarea,select'))return;const walk=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);let node;while((node=walk.nextNode())){const value=node.textContent.trim();if(current.has(value)&&!ambiguous.has(value)&&current.get(value)!==value){node.textContent=node.textContent.replace(value,current.get(value));host.dataset.translationStatus='current';}}});
  let note=document.getElementById('content-language-status');if(!note&&document.querySelector('main')){note=document.createElement('p');note.id='content-language-status';note.className='source-content-note';document.querySelector('main').append(note);}
  if(note){const missing=records.some(r=>r.status!=='current');const message=missing?say('Teksty bez aktualnego tłumaczenia pozostają w oryginale. Korekty: Ustawienia → Tłumaczenia treści.','Text without a current translation stays in its original language. Corrections: Settings → Content translations.'):'';if(note.textContent!==message)note.textContent=message;note.hidden=!missing;}
 }
 async function editor(host){
  const panel=document.createElement('details');panel.id='content-translation-editor';panel.className='panel-card management-details';
  const summary=document.createElement('summary');summary.textContent=say('Tłumaczenia treści PL / EN','Content translations PL / EN');panel.append(summary);
  const explanation=document.createElement('p');explanation.textContent=say('Oryginały pozostają bez zmian. Tłumaczenia zapisujesz ręcznie; automatyczny dostawca nie jest skonfigurowany.','Originals stay unchanged. Save translations manually; no automatic provider is configured.');panel.append(explanation);
  const form=document.createElement('form');form.className='form-grid';panel.append(form);
  function select(labelText,options){const label=document.createElement('label');label.textContent=labelText;const input=document.createElement('select');for(const [value,name] of options){const option=document.createElement('option');option.value=value;option.textContent=name;input.append(option);}label.append(input);form.append(label);return input;}
  const entity=select(say('Rodzaj treści','Content type'),[['checklist',say('Checklista','Checklist')],['categories',say('Kategorie','Categories')],['notes',say('Notatki','Notes')],['catches',say('Połowy','Catches')],['spots',say('Spoty','Spots')],['trips',say('Wyjazd','Trip')],['lakes',say('Łowisko','Lake')],['documents',say('Porady i dokumenty','Advice and documents')],['research',say('Informacje źródłowe','Source information')]]);
  const target=select(say('Język tłumaczenia','Translation language'),[['en','English'],['pl','Polski']]);
  const entry=select(say('Tekst do przetłumaczenia','Text to translate'),[]);
  function area(labelText,readOnly){const label=document.createElement('label');label.textContent=labelText;const textarea=document.createElement('textarea');textarea.rows=5;textarea.readOnly=readOnly;textarea.dataset.userContent='';label.append(textarea);form.append(label);return textarea;}
  const original=area(say('Oryginał','Original'),true),translated=area(say('Tłumaczenie','Translation'),false);translated.maxLength=20000;translated.required=true;
  const state=document.createElement('p');state.setAttribute('role','status');state.setAttribute('aria-live','polite');form.append(state);
  const save=document.createElement('button');save.type='submit';save.textContent=say('Zapisz tłumaczenie','Save translation');form.append(save);host.append(panel);let choices=[];
  function show(){const item=choices[Number(entry.value)];original.value=item?.sourceText||'';translated.value=item?.translation||'';save.disabled=!item;state.textContent=!item?say('Brak tekstów w tym widoku.','No text in this view.'):item.status==='current'?say('Aktualne tłumaczenie','Current translation'):item.status==='stale'?say('Oryginał zmieniono — tłumaczenie wymaga korekty.','Original changed — translation needs updating.'):say('Brak tłumaczenia — wyświetlany jest oryginał.','No translation — the original is displayed.');}
  async function refresh(){save.disabled=true;try{const data=await Dream.api('/api/content-translations?entity='+entity.value+'&tripId='+encodeURIComponent(window.DREAM_TRIP.id)+'&language='+target.value);choices=data.records;entry.replaceChildren();choices.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=r.sourceText.slice(0,90);option.dataset.userContent='';entry.append(option);});show();}catch(error){state.textContent=error.message;state.setAttribute('role','alert');}}
  panel.addEventListener('toggle',()=>{if(panel.open&&!choices.length)refresh();});entity.onchange=target.onchange=refresh;entry.onchange=show;
  form.onsubmit=async event=>{event.preventDefault();const item=choices[Number(entry.value)];if(!item||save.disabled)return;save.disabled=true;try{await Dream.api('/api/content-translations',{method:'PUT',body:JSON.stringify({...item,language:target.value,translation:translated.value})});await refresh();await load();state.textContent=say('Tłumaczenie zapisane.','Translation saved.');}catch(error){state.textContent=error.message;state.setAttribute('role','alert');save.disabled=false;}};
 }
 let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply();});});
 observer.observe(document.body,{childList:true,subtree:true});
 window.DreamContent={load,text,apply,editor};
})();
