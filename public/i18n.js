// Device preference only. No account-wide language setting and no user text sent to a translator.
const key='dreamteam.language';
const stored=localStorage.getItem(key),lang=stored==='pl'||stored==='en'?stored:/^pl\b/i.test(navigator.language)?'pl':'en';
document.documentElement.lang=lang;
const dictionary=await fetch(`/locales/${lang}.json`,{cache:'force-cache'}).then(r=>r.json()).catch(()=>({}));
if(lang==='en')Object.assign(dictionary,await fetch('/locales/runtime.en.json',{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({})));
if(lang==='en'&&!/^\/login(?:\.html)?$/.test(location.pathname))Object.assign(dictionary,await fetch('/locales/legacy.en.json',{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({})));
if(lang==='en'&&location.pathname.endsWith('/porady.html'))Object.assign(dictionary,await fetch('/locales/porady.en.json',{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({})));
const guide=location.pathname.match(/\/pages\/(rigi|wezly)\.html$/)?.[1];
if(lang==='en'&&guide){
 const file=guide==='rigi'?'guides':'knots';
 Object.assign(dictionary,await fetch(`/locales/${file}.en.json`,{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({})));
}
const dynamic=string=>{
 if(lang!=='en'||typeof string!=='string')return null;
 const patterns=[
  [/^DreamTeam \| (.+)$/,(_,title)=>`DreamTeam | ${translate(title)}`],
  [/^(.+) · DreamTeam$/,(_,title)=>`${translate(title)} · DreamTeam`],
  [/^Porady: (.+)$/,(_,trip)=>`Trip advice: ${trip}`],
  [/^Dno: (.+)$/,(_,bottom)=>`Bottom: ${bottom==='brak'?'unknown':bottom}`],
  [/^(Pogoda niedostępna|Ocena|Warunki): (.+)$/,(_,label,message)=>`${{'Pogoda niedostępna':'Weather unavailable',Ocena:'Rating',Warunki:'Conditions'}[label]}: ${translate(message)}`],
  [/^📡 sonar documentation · (.+)$/,(_,title)=>`📡 sonar documentation · ${translate(title)}`],
  [/^(\d+) rzeczy$/,(_,count)=>`${count} items`],
  [/^(\d+) \/ (\d+) sprawdzone$/,(_,a,b)=>`${a} / ${b} checked`],
  [/^Amplituda temperatury około ([\d.]+)°C jest dość duża, więc zachowanie ryb może się szybciej zmieniać\.$/,(_,n)=>`A temperature range of about ${n}°C is fairly large, so fish behaviour may change more quickly.`],
  [/^Porywy ([\d.]+) km\/h nie powinny mocno przeszkadzać\.$/,(_,n)=>`Gusts of ${n} km/h should not cause much disruption.`],
  [/^Duże zachmurzenie \((\d+)%\) może pomagać, o ile nie towarzyszy temu załamanie pogody\.$/,(_,n)=>`High cloud cover (${n}%) may help if conditions are not deteriorating.`],
  [/^(.+): wymagany tekst\.$/,(_,label)=>`${translate(label)}: text is required.`],
  [/^(.+): pole jest wymagane\.$/,(_,label)=>`${translate(label)}: this field is required.`],
  [/^(.+): maksymalnie (\d+) znaków\.$/,(_,label,n)=>`${translate(label)}: at most ${n} characters.`],
  [/^(.+): nieprawidłowa liczba\.$/,(_,label)=>`${translate(label)}: invalid number.`],
  [/^(.+): wartość od ([\d.-]+) do ([\d.-]+)\.$/,(_,label,a,b)=>`${translate(label)}: value from ${a} to ${b}.`],
  [/^(.+): podaj datę ze strefą czasową\.$/,(_,label)=>`${translate(label)}: enter a date with a time zone.`],
  [/^(.+): nieprawidłowy dzień\.$/,(_,label)=>`${translate(label)}: invalid day.`],
  [/^(.+): dozwolony jest adres http lub https\.$/,(_,label)=>`${translate(label)}: an HTTP or HTTPS URL is required.`],
  [/^Spakowane (\d+) \/ (\d+)$/,(_,a,b)=>`Packed ${a} / ${b}`],
  [/^✅ Spakowane (\d+) rzeczy$/,(_,a)=>`✅ ${a} items packed`],
  [/^Razem: (\d+) ryb · ([\d,.]+) kg$/,(_,a,b)=>`Total: ${a} fish · ${b} kg`],
  [/^(\d+) ryb(?: · ([\d,.]+) kg)?$/,(_,a,b)=>`${a} fish${b?` · ${b} kg`:''}`],
  [/^([\d,.]+)°C · wiatr ([\d,.]+) km\/h$/,(_,a,b)=>`${a}°C · wind ${b} km/h`],
  [/^Jutro wiatr ([\d,.]+) km\/h • (.+)$/,(_,a,b)=>`Tomorrow: wind ${a} km/h • ${translate(b)}`],
  [/^(.+?) · (★ Aktywny wyjazd|Podgląd wyjazdu|Archiwum)$/,(_,zone,status)=>`${zone} · ${translate(status)}`],
  [/^(Odległość|Głębokość): ([\d,.]+) m$/,(_,type,value)=>`${type==='Odległość'?'Distance':'Depth'}: ${value} m`],
  [/^(Dodano|Powiązany spot|Najlepszy wiatr): (.+)$/,(_,label,value)=>`${{Dodano:'Added','Powiązany spot':'Linked spot','Najlepszy wiatr':'Best wind'}[label]}: ${value}`],
  [/^Odznaczyć (\d+) pozycji w tym wyjeździe\?$/,(_,n)=>`Uncheck ${n} items in this trip?`],
  [/^Przenieś (.+) (wyżej|niżej)$/,(_,name,dir)=>`Move ${name} ${dir==='wyżej'?'up':'down'}`],
  [/^Przenieś pozycje z (.+) do$/,(_,name)=>`Move items from ${name} to`],
  [/^Spakowane: (.+)$/,(_,name)=>`Packed: ${name}`],
  [/^Usunąć kategorię (.+)\? Pozycje pozostaną na liście tylko po przeniesieniu\.$/,(_,name)=>`Delete category ${name}? Items remain on the list only if moved.`],
  [/^Dodano (\d+) pozycji\.$/,(_,n)=>`Added ${n} items.`],
  [/^Źródła \((\d+)\)$/,(_,n)=>`Sources (${n})`],
  [/^Błąd (\d+)$/,(_,code)=>`Error ${code}`],
  [/^Spakowane (\d+) z (\d+) · pozostało (\d+)$/,(_,a,b,c)=>`Packed ${a} of ${b} · ${c} remaining`],
  [/^(\d\d:\d\d) \((\d+) brań\)$/,(_,time,count)=>`${time} (${count} bites)`],
  [/^(.+?)  (\d+)\/(\d+)$/,(_,category,packed,total)=>`${dictionary[category]||category} ${packed}/${total}`],
  [/^(\d+) szt\. • Do ogarnięcia$/,(_,count)=>`${count} pcs · To pack`],
  [/^· stanowisko (.+)$/,(_,peg)=>`· swim ${peg}`],
  [/^Schemat edukacyjny: (.+)\. Interpretację potwierdź ponownym skanem\.$/,(_,name)=>`Illustrative diagram: ${dictionary[name]||name}. Verify the interpretation with another pass.`],
  [/^Opracowanie własne\. 🎣 praktyka i 💬 społeczność opisują obserwacje; 🏭 producent może mieć interes handlowy\. Przy sprzecznościach porównuj i testuj\. Dostęp: (.+)\.$/,(_,date)=>`Editorial synthesis. 🎣 practice and 💬 community describe observations; 🏭 manufacturers may have a commercial interest. Compare conflicting claims and test them. Accessed: ${date}.`],
  [/^Godziny łowiska: (.+)\. Termin może pozostać pusty\.$/,(_,zone)=>`Lake time: ${zone}. Dates may be left blank.`],
  [/^Usunięte wpisy z wyjazdu (.+)\.$/,(_,trip)=>`Deleted entries from trip ${trip}.`],
  [/^Przynęta: (.+)$/,(_,bait)=>`Bait: ${bait}`],
  [/^([NSEW]{1,3}) \((\d+)°\) • (.+)$/,(_,direction,degrees,condition)=>`${direction} (${degrees}°) • ${dictionary[condition]||condition}`],
  [/^([\d.]+ km\/h) • (.+)$/,(_,speed,condition)=>`${speed} • ${dictionary[condition]||condition}`],
  [/^(Odległość|Głębokość): brak$/,(_,type)=>`${type==='Odległość'?'Distance':'Depth'}: unknown`],
  [/^Faza księżyca: (.+), oświetlenie około (\d+)%\.$/,(_,phase,pct)=>`Moon phase: ${dictionary[phase]||phase}, about ${pct}% illumination.`],
  [/^Obecna szansa na branie: (.+)\. Punktacja aktywności: (\d+)\.$/,(_,level,score)=>`Current bite outlook: ${dictionary[level]||level}. Activity score: ${score}.`],
  [/^Pilnuj szczególnie około (\d\d:\d\d)$/,(_,time)=>`Watch especially around ${time}`],
  [/^Najmocniejsze przewidywane okno aktywności: (\d\d:\d\d) \((.+)\)\.$/,(_,time,level)=>`Strongest predicted activity window: ${time} (${dictionary[level]||level}).`],
  [/^Ciśnienie (\d+) hPa jest w dobrym zakresie pod aktywność ryb\.$/,(_,pressure)=>`Pressure ${pressure} hPa is in a potentially favourable range for fish activity.`],
  [/^Wiatr ([\d.]+) km\/h wygląda korzystnie — pracuje na powierzchni i może poprawiać aktywność\.$/,(_,speed)=>`Wind at ${speed} km/h may help by moving the surface.`],
  [/^Małe zachmurzenie \((\d+)%\) oznacza sporo światła, więc ryby mogą być ostrożniejsze\.$/,(_,cloud)=>`Low cloud cover (${cloud}%) means more light; fish may be more cautious.`],
  [/^Silniejszy opad \(([\d.]+) mm\) może pogarszać komfort i rozbijać rytm łowienia\.$/,(_,rain)=>`Heavy rain (${rain} mm) may reduce comfort and disrupt the fishing rhythm.`],
  [/^Amplituda temperatury około ([\d.]+)°C wygląda stabilnie i sprzyja spokojniejszym warunkom\.$/,(_,range)=>`A temperature range of about ${range}°C looks stable and may favour steadier conditions.`]
 ];
 for(const [pattern,render] of patterns){const match=string.match(pattern);if(match)return render(...match);}
 return null;
};
const translate=string=>dictionary[string]||dictionary[string?.replace(/\s+/g,' ').trim()]||(lang==='en'&&string?.startsWith('#')&&dictionary[string.slice(1)]?'#'+dictionary[string.slice(1)]:null)||dynamic(string)||string;
window.DreamI18n={lang,t:translate,set(next){if(next!=='pl'&&next!=='en')return;localStorage.setItem(key,next);location.reload();}};
const personal='[data-user-content],.catch-note,.check-item-title,.spot-card h4,.trip-card h3,#dashboard-trip-name,#dashboard-lake,#dashboard-peg,#dashboard-crew';
const walk=node=>{
 if(node.nodeType===Node.TEXT_NODE){if(node.parentElement?.closest(`script,style,textarea,${personal}`))return;const original=node.textContent.trim(),translated=translate(original);if(original&&translated!==original)node.textContent=node.textContent.replace(original,translated);return;}
 if(node.nodeType!==Node.ELEMENT_NODE||node.closest(personal))return;
 for(const attr of ['placeholder','aria-label','title','label','alt']){const value=node.getAttribute(attr),translated=translate(value);if(value&&translated!==value)node.setAttribute(attr,translated);}
 for(const child of node.childNodes)walk(child);
};
// Translate new UI panels as they render. Explicit personal-content regions keep their original text.
walk(document.body);
document.title=translate(document.title);
const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'||record.type==='characterData')walk(record.target);else for(const node of record.addedNodes)walk(node);}});
observer.observe(document.body,{childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label','title','label','alt'],subtree:true});
function selector(locationNode){if(!locationNode)return;const label=document.createElement('label');label.className='language-selector';label.textContent='PL / EN ';const select=document.createElement('select');select.setAttribute('aria-label','Language / Język');for(const [value,name] of [['pl','PL'],['en','EN']]){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}select.value=lang;select.addEventListener('change',()=>window.DreamI18n.set(select.value));label.append(select);locationNode.append(label);}
selector(document.querySelector('.login-card')||document.querySelector('.header-top'));
function menuSelector(){const menu=document.getElementById('main-nav');if(menu&&!menu.querySelector('.language-selector'))selector(menu);}
menuSelector();
document.addEventListener('dream:ready',menuSelector);
// Native dialogs are outside the DOM observer. Only known UI messages are translated.
for(const name of ['alert','confirm','prompt']){const native=window[name].bind(window);window[name]=(message,...args)=>native(translate(String(message)),...args);}
if(location.pathname.endsWith('/ustawienia.html')){const section=document.querySelector('#settings-form')?.closest('section');if(section){const row=document.createElement('p');row.textContent=lang==='pl'?'Język tego urządzenia: ':'Language on this device: ';selector(row);section.insertBefore(row,section.querySelector('form'));}}
document.documentElement.dataset.i18nReady=lang;
document.dispatchEvent(new Event('dream:i18n-ready'));
