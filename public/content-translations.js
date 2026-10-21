// Browser-local presentation only. Original records and edit values stay unchanged.
(() => {
 let records=[],byKey=new Map(),automaticStatus=null,backfillTimer=null;
 const language=()=>window.DreamLanguage?.get()||document.documentElement.lang||'pl';
 const say=(pl,en)=>language()==='en'?en:pl;
 const key=(entity,id,field)=>[entity,String(id),field].join('|');
 function text(entity,id,field,original){if((entity==='catches'||entity==='spots')&&field==='bait')return original;const item=byKey.get(key(entity,id,field));return item?.status==='current'&&item.sourceText===original?item.translation:window.DreamGlossary?.display(original,language())??original;}
 async function load(changed=null){if(backfillTimer){clearTimeout(backfillTimer);backfillTimer=null;}
  try{if(navigator.onLine!==false)automaticStatus=await Dream.api('/api/content-translations/process',{method:'POST',body:JSON.stringify({tripId:window.DREAM_TRIP.id,changed})}).catch(()=>null);const data=await Dream.api('/api/content-translations?tripId='+encodeURIComponent(window.DREAM_TRIP.id)+'&language='+language());records=data.records;byKey=new Map(records.map(r=>[key(r.entity,r.recordId,r.field),r]));}
  catch{records=[];byKey.clear();}
  apply();
  if(automaticStatus?.providerEnabled&&automaticStatus?.nextCursor!=null&&navigator.onLine!==false){let cursor=automaticStatus.nextCursor;const resume=async()=>{try{const batch=await Dream.api('/api/content-translations/process',{method:'POST',body:JSON.stringify({tripId:window.DREAM_TRIP.id,cursor,changed})});cursor=batch.nextCursor;if(batch.translated){const fresh=await Dream.api('/api/content-translations?tripId='+encodeURIComponent(window.DREAM_TRIP.id)+'&language='+language());records=fresh.records;byKey=new Map(records.map(r=>[key(r.entity,r.recordId,r.field),r]));apply();}if(cursor!==null&&!batch.paused)backfillTimer=setTimeout(resume,1000);else{const data=await Dream.api('/api/content-translations?tripId='+encodeURIComponent(window.DREAM_TRIP.id)+'&language='+language());records=data.records;byKey=new Map(records.map(r=>[key(r.entity,r.recordId,r.field),r]));apply();}}catch{}};backfillTimer=setTimeout(resume,1000);}
 }
 function apply(){
  document.querySelectorAll('[data-content-entity]').forEach(host=>{if(host.closest('form'))return;const value=text(host.dataset.contentEntity,host.dataset.contentId,host.dataset.contentField,host.dataset.contentOriginal);if(host.textContent!==value)host.textContent=value;});
  let note=document.getElementById('content-language-status');if(!note&&document.querySelector('main')){note=document.createElement('p');note.id='content-language-status';note.className='source-content-note';document.querySelector('main').append(note);}
  if(note){const missing=records.some(r=>r.status!=='current');const message=missing?say('Teksty bez aktualnego tłumaczenia pozostają w oryginale. Korekty: Ustawienia → Tłumaczenia treści.','Text without a current translation stays in its original language. Corrections: Settings → Content translations.'):'';if(note.textContent!==message)note.textContent=message;note.hidden=!missing;}
 }
 async function editor(host){
  const panel=document.createElement('details');panel.id='content-translation-editor';panel.className='panel-card management-details';
  const summary=document.createElement('summary');summary.textContent=say('Tłumaczenia treści PL / EN','Content translations PL / EN');panel.append(summary);
  const explanation=document.createElement('p');explanation.textContent=say('Oryginały pozostają bez zmian. Słownik karpiowy i aktywny silnik Cloudflare tłumaczą automatycznie. Przy limicie lub błędzie pozostaje oryginał.','Originals stay unchanged. The carp glossary and enabled Cloudflare engine translate automatically. The original remains during limits or errors.');panel.append(explanation);
  const form=document.createElement('form');form.className='form-grid';panel.append(form);
  function select(labelText,options){const label=document.createElement('label');label.textContent=labelText;const input=document.createElement('select');for(const [value,name] of options){const option=document.createElement('option');option.value=value;option.textContent=name;input.append(option);}label.append(input);form.append(label);return input;}
  const entity=select(say('Rodzaj treści','Content type'),[['checklist',say('Checklista','Checklist')],['categories',say('Kategorie','Categories')],['notes',say('Notatki','Notes')],['catches',say('Połowy','Catches')],['spots',say('Spoty','Spots')],['trips',say('Wyjazd','Trip')],['lakes',say('Łowisko','Lake')],['documents',say('Porady i dokumenty','Advice and documents')],['research',say('Informacje źródłowe','Source information')]]);
  const target=select(say('Język tłumaczenia','Translation language'),[['en','English'],['pl','Polski']]);
  const entry=select(say('Tekst do przetłumaczenia','Text to translate'),[]);
  function area(labelText,readOnly){const label=document.createElement('label');label.textContent=labelText;const textarea=document.createElement('textarea');textarea.rows=5;textarea.readOnly=readOnly;textarea.dataset.userContent='';label.append(textarea);form.append(label);return textarea;}
  const original=area(say('Oryginał','Original'),true),translated=area(say('Tłumaczenie','Translation'),false);translated.maxLength=20000;translated.required=true;
  const state=document.createElement('p');state.setAttribute('role','status');state.setAttribute('aria-live','polite');form.append(state);
  const sourceLang=select(say('Język oryginału (popraw klasyfikację)','Original language (correct classification)'),[['pl','Polski'],['en','English']]);const correctSource=document.createElement('button');correctSource.type='button';correctSource.textContent=say('Zapisz język oryginału','Save original language');form.append(correctSource);correctSource.onclick=async()=>{const item=choices[Number(entry.value)];if(!item)return;try{await Dream.api('/api/content-translations/process',{method:'POST',body:JSON.stringify({tripId:window.DREAM_TRIP.id,source:{...item,language:sourceLang.value}})});await refresh();await load();state.textContent=say('Język zapisany.','Language saved.');}catch(e){state.textContent=e.message;}};
  const save=document.createElement('button');save.type='submit';save.textContent=say('Zapisz tłumaczenie','Save translation');form.append(save);host.append(panel);let choices=[];
  function show(){const item=choices[Number(entry.value)];original.value=item?.sourceText||'';translated.value=item?.translation||'';save.disabled=!item;state.textContent=!item?say('Brak tekstów w tym widoku.','No text in this view.'):item.status==='current'?say('Aktualne tłumaczenie','Current translation'):item.status==='stale'?say('Oryginał zmieniono — tłumaczenie wymaga korekty.','Original changed — translation needs updating.'):say('Brak tłumaczenia — wyświetlany jest oryginał.','No translation — the original is displayed.');}
  async function refresh(){save.disabled=true;try{const data=await Dream.api('/api/content-translations?entity='+entity.value+'&tripId='+encodeURIComponent(window.DREAM_TRIP.id)+'&language='+target.value);choices=data.records;entry.replaceChildren();choices.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=r.sourceText.slice(0,90);option.dataset.userContent='';entry.append(option);});show();}catch(error){state.textContent=error.message;state.setAttribute('role','alert');}}
  panel.addEventListener('toggle',()=>{if(panel.open&&!choices.length)refresh();});entity.onchange=target.onchange=refresh;entry.onchange=show;
  form.onsubmit=async event=>{event.preventDefault();const item=choices[Number(entry.value)];if(!item||save.disabled)return;save.disabled=true;try{await Dream.api('/api/content-translations',{method:'PUT',body:JSON.stringify({...item,language:target.value,translation:translated.value})});await refresh();await load();state.textContent=say('Tłumaczenie zapisane.','Translation saved.');}catch(error){state.textContent=error.message;state.setAttribute('role','alert');save.disabled=false;}};
 }
 let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;apply();});});
 observer.observe(document.body,{childList:true,subtree:true});
 function category(original){const row=records.find(r=>r.entity==='categories'&&r.field==='name'&&r.sourceText===original);return row?text('categories',row.recordId,'name',original):(window.DreamGlossary?.display(original,language())??original);}
 const speciesPairs=[['Karp','Carp'],['Karp lustrzeń','Mirror carp'],['Amur','Grass carp']];
 function species(value){const row=speciesPairs.find(p=>p.some(x=>x.toLocaleLowerCase()===String(value).toLocaleLowerCase()));return row?row[language()==='en'?1:0]:value;}
 window.addEventListener('online',()=>load());
 window.DreamContent={load,text,apply,editor,category,species,get status(){return automaticStatus;}};
})();
