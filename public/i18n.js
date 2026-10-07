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
 if(lang!=='en')return null;
 const patterns=[
  [/^Spakowane (\d+) z (\d+) · pozostało (\d+)$/,(_,a,b,c)=>`Packed ${a} of ${b} · ${c} remaining`],
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
 if(node.nodeType===Node.TEXT_NODE){if(node.parentElement?.closest(`script,style,${personal}`))return;const original=node.textContent.trim(),translated=translate(original);if(original&&translated!==original)node.textContent=node.textContent.replace(original,translated);return;}
 if(node.nodeType!==Node.ELEMENT_NODE||node.closest(personal))return;
 for(const attr of ['placeholder','aria-label','title']){const value=node.getAttribute(attr);if(value&&dictionary[value]&&dictionary[value]!==value)node.setAttribute(attr,dictionary[value]);}
 for(const child of node.childNodes)walk(child);
};
// Translate new UI panels as they render. Explicit personal-content regions keep their original text.
walk(document.body);
const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='attributes')walk(record.target);else for(const node of record.addedNodes)walk(node);}});
observer.observe(document.body,{childList:true,attributes:true,attributeFilter:['placeholder','aria-label','title'],subtree:true});
function selector(locationNode){if(!locationNode)return;const label=document.createElement('label');label.className='language-selector';label.textContent='PL / EN ';const select=document.createElement('select');select.setAttribute('aria-label','Language / Język');for(const [value,name] of [['pl','PL'],['en','EN']]){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}select.value=lang;select.addEventListener('change',()=>window.DreamI18n.set(select.value));label.append(select);locationNode.append(label);}
selector(document.querySelector('.login-card')||document.querySelector('.header-top'));
if(location.pathname.endsWith('/ustawienia.html')){const section=document.querySelector('#settings-form')?.closest('section');if(section){const row=document.createElement('p');row.textContent=lang==='pl'?'Język tego urządzenia: ':'Language on this device: ';selector(row);section.insertBefore(row,section.querySelector('form'));}}
document.documentElement.dataset.i18nReady=lang;
document.dispatchEvent(new Event('dream:i18n-ready'));
