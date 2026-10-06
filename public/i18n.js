// Device preference only. No account-wide language setting and no user text sent to a translator.
const key='dreamteam.language';
const stored=localStorage.getItem(key),lang=stored==='pl'||stored==='en'?stored:/^pl\b/i.test(navigator.language)?'pl':'en';
document.documentElement.lang=lang;
const dictionary=await fetch(`/locales/${lang}.json`,{cache:'force-cache'}).then(r=>r.json()).catch(()=>({}));
const guide=location.pathname.match(/\/pages\/(rigi|wezly)\.html$/)?.[1];
if(lang==='en'&&guide){
 const file=guide==='rigi'?'guides':'knots';
 Object.assign(dictionary,await fetch(`/locales/${file}.en.json`,{cache:'force-cache'}).then(r=>r.ok?r.json():{}).catch(()=>({})));
}
const translate=string=>dictionary[string]||string;
window.DreamI18n={lang,t:translate,set(next){if(next!=='pl'&&next!=='en')return;localStorage.setItem(key,next);location.reload();}};
const walk=node=>{
 if(node.nodeType===Node.TEXT_NODE){if(node.parentElement?.closest('script,style,[data-user-content],.media-card'))return;const original=node.textContent.trim();if(original&&dictionary[original])node.textContent=node.textContent.replace(original,dictionary[original]);return;}
 if(node.nodeType!==Node.ELEMENT_NODE||node.closest('[data-user-content],.media-card'))return;
 for(const attr of ['placeholder','aria-label','title']){const value=node.getAttribute(attr);if(value&&dictionary[value])node.setAttribute(attr,dictionary[value]);}
 for(const child of node.childNodes)walk(child);
};
// Translate static markup and UI controls inserted later. Never inspect editable fields or user records.
walk(document.body);
const observer=new MutationObserver(records=>{for(const record of records){for(const node of record.addedNodes){if(node.nodeType===Node.ELEMENT_NODE){if(node.closest('#knowledge-root')||node.matches('#knowledge-root'))walk(node);else if(node.matches('button,label,option,summary,nav a,[data-i18n]'))walk(node);else node.querySelectorAll?.('button,label,option,summary,nav a,[data-i18n]').forEach(walk);}}}});
observer.observe(document.body,{childList:true,subtree:true});
function selector(locationNode){if(!locationNode)return;const label=document.createElement('label');label.className='language-selector';label.textContent='PL / EN ';const select=document.createElement('select');select.setAttribute('aria-label','Language / Język');for(const [value,name] of [['pl','PL'],['en','EN']]){const option=document.createElement('option');option.value=value;option.textContent=name;select.append(option);}select.value=lang;select.addEventListener('change',()=>window.DreamI18n.set(select.value));label.append(select);locationNode.append(label);}
selector(document.querySelector('.login-card')||document.querySelector('.header-top'));
if(location.pathname.endsWith('/ustawienia.html')){const section=document.querySelector('#settings-form')?.closest('section');if(section){const row=document.createElement('p');row.textContent=lang==='pl'?'Język tego urządzenia: ':'Language on this device: ';selector(row);section.insertBefore(row,section.querySelector('form'));}}
