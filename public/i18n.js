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
const translate=string=>dictionary[string]||dictionary[string?.replace(/\s+/g,' ').trim()]||string;
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
