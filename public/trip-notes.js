document.addEventListener('dream:ready',()=>{
  const main=document.querySelector('main.page-content'),trip=window.DREAM_TRIP;
  if(!main||!trip)return;
  const section=document.createElement('section');section.className='panel-card';section.id='trip-field-notes';
  section.innerHTML='<h3>Notatki z wyjazdu</h3><form id="trip-note-form"><label for="trip-note-content">Dodaj notatkę</label><textarea id="trip-note-content" maxlength="2000" rows="3" required></textarea><button type="submit">Zapisz notatkę</button></form><p id="trip-note-status" role="status"></p><div id="trip-note-list"></div>';
  main.append(section);
  const field=section.querySelector('#trip-note-content'),status=section.querySelector('#trip-note-status'),list=section.querySelector('#trip-note-list');
  async function refresh(){try{const data=await Dream.api(`/api/notes?tripId=${encodeURIComponent(trip.id)}`);list.replaceChildren();for(const note of data.notes){const row=document.createElement('p');row.className='check-item-row';row.textContent=`${note.content}${note.pendingSync?' · Oczekuje na synchronizację':''}`;row.dataset.userContent='';list.append(row);}}catch(error){status.textContent=error.message;}}
  section.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();try{const result=await Dream.api('/api/notes',{method:'POST',body:JSON.stringify({tripId:trip.id,section:'field',content:field.value})});field.value='';status.textContent=result.pendingSync?'Oczekuje na synchronizację.':'Notatka zapisana.';await refresh();}catch(error){status.textContent=error.message;}});
  document.addEventListener('dream:synced',refresh);refresh();
});
