// One preference per account on this device; the login screen uses its own preference.
(() => {
 const globalKey='dreamteam.language',accountKey='dreamteam.account.v1';
 const valid=value=>value==='pl'||value==='en';
 const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
 const write=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
 const login=()=>/^\/login(?:\.html)?$/.test(location.pathname);
 const preferenceKey=()=>!login()&&read(accountKey)?`${globalKey}.${read(accountKey)}`:globalKey;
 const browserDefault=()=>/^pl\b/i.test(navigator.language)?'pl':'en';
 const get=()=>{const scoped=read(preferenceKey()),fallback=read(globalKey);return valid(scoped)?scoped:valid(fallback)?fallback:browserDefault();};
 const persist=next=>{if(valid(next))write(preferenceKey(),next);};
 function activate(account){
  const key=`${globalKey}.${account.id}`,stored=read(key),device=read(globalKey);
  const fallback=/^(pl|en)\b/i.test(navigator.language)?browserDefault():valid(account.defaultLanguage)?account.defaultLanguage:browserDefault();
  const next=valid(stored)?stored:valid(device)?device:fallback;
  write(accountKey,account.id);if(!valid(stored))write(key,next);
  return next!==document.documentElement.lang;
 }
 window.DreamLanguage={get,persist,activate,preferenceKey};document.documentElement.lang=get();
})();
