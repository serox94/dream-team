// Static snapshots only. API/login requests always use the network.
const shell='ryby-shell-20261012-113';
const warm=["/","/index.html","/pages/polowy.html","/pages/checklisty.html","/pages/teren.html","/pages/mapa.html","/pages/regulamin.html","/pages/pogoda.html","/pages/encyklopedia.html","/pages/sonar.html","/pages/ustawienia.html","/settings.js","/knowledge.js","/knowledge.css","/i18n.js","/language-preference.js","/locales/pl.json","/locales/en.json","/locales/runtime.en.json","/locales/guides.en.json","/locales/knots.en.json","/locales/trip-advice.en.json","/deeper-media.js","/deeper-media.css","/data/knowledge/sources.json","/data/knowledge/encyclopedia.json","/data/knowledge/sonar.json","/data/knowledge/tools.json","/data/knowledge/field-guides.json","/data/knowledge/chirp2-practice.json","/data/knowledge/en/encyclopedia.json","/data/knowledge/en/sonar.json","/data/knowledge/en/field-guides.json","/data/knowledge/en/tools.json","/data/knowledge/en/chirp2-practice.json","/data/knowledge/en/quiz.json","/data/knowledge/en/matrices.json","/assets/deeper/chirp2/index.json","/assets/deeper/chirp2/index.en.json","/locales/legacy.en.json","/locales/porady.en.json","/dream-loader-v2.js","/dream-core.js","/trip-notes.js","/checklist-templates.js","/checklist-templates.css","/d1-api-compat.js","/app.js","/app-plus.js","/weather-conditions.js","/field-mode.js","/trip-renderer-v2.js","/dashboard-chart.js","/fixes.js","/style.css","/ui-plus.css","/media-plus.css","/weather-plus.css","/audit.css","/refresh.css","/assets/img/patryk-maciek.jpeg","/assets/img/lowisko.jpg","/data/lakes/plaine2/dojazd.html","/data/lakes/plaine2/regulamin.html","/data/lakes/plaine2/porady.html","/pages/dojazd.html","/pages/porady.html","/pages/rigi.html","/pages/wezly.html","/pages/wyjazdy.html","/assets/deeper/chirp2/fish-deeper-10.png","/assets/deeper/chirp2/fish-deeper-052343.png","/assets/deeper/chirp2/fish-deeper-052350.png","/assets/deeper/chirp2/fish-deeper-052356.png","/assets/deeper/chirp2/fish-deeper-052456.png","/assets/deeper/chirp2/fish-deeper-052504.png","/assets/deeper/chirp2/fish-deeper-052509.png","/assets/deeper/chirp2/fish-deeper-052519.png","/assets/deeper/chirp2/fish-deeper-052535.png","/assets/deeper/chirp2/fish-deeper-052547.png","/assets/deeper/chirp2/fish-deeper-052558.png","/assets/deeper/chirp2/fish-deeper-052608.png","/assets/deeper/chirp2/fish-deeper-052614.png","/assets/deeper/chirp2/fish-deeper-052656.png","/assets/deeper/chirp2/fish-deeper-052745.png","/assets/deeper/chirp2/fish-deeper-052754.png","/assets/deeper/chirp2/fish-deeper-052802.png"];
const completeMarker='/__ryby_shell_complete',warmMarker='/__ryby_shell_warmed',attemptMarker='/__ryby_shell_attempt';
let warming=null;
async function previousSnapshot(){
 const keys=(await caches.keys()).filter(key=>key.startsWith('ryby-shell-')&&key!==shell).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 for(const key of keys){const cache=await caches.open(key);if(await cache.match(completeMarker)||(await cache.match(warmMarker)&&await cache.match('/index.html')&&await cache.match('/app.js')))return cache;}
 return null;
}
async function snapshot(){
 const current=await caches.open(shell);if(await current.match(completeMarker))return current;
 return await previousSnapshot()||current;
}
async function download(request,timeout){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(request,{cache:'no-store',signal:controller.signal});
  if(!response.ok||response.redirected)return response;
  // Include the body in the deadline: receiving headers alone is not a loaded script.
  const bytes=await response.arrayBuffer(),headers=new Headers(response.headers);
  headers.delete('content-encoding');headers.delete('content-length');
  return new Response(bytes,{status:response.status,statusText:response.statusText,headers});
 }finally{clearTimeout(timer);}
}
async function warmShell(){
 const cache=await caches.open(shell),marker=await cache.match(warmMarker),attempt=await cache.match(attemptMarker),now=Date.now();
 if(marker&&now-Number(await marker.text())<10*60*1000)return true;
 if(attempt&&now-Number(await attempt.text())<2*60*1000)return Boolean(await cache.match(completeMarker));
 await cache.put(attemptMarker,new Response(String(now)));
 let cursor=0,complete=true;
 await Promise.all(Array.from({length:4},async()=>{while(cursor<warm.length){
  const request=new Request(warm[cursor++],{credentials:'same-origin'});
  try{const response=await download(request,15000);if(response.ok&&!response.redirected)await cache.put(request,response);else complete=false;}catch{complete=false;}
 }}));
 if(complete){
  await cache.put(completeMarker,new Response('1'));await cache.put(warmMarker,new Response(String(Date.now())));
  for(const key of await caches.keys())if(key.startsWith('ryby-shell-')&&key!==shell)await caches.delete(key);
 }
 return complete;
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='WARM_SHELL')return;
 if(!warming)warming=warmShell().finally(()=>{warming=null;});
 event.waitUntil(warming);
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname.startsWith('/login')||url.pathname==='/sw.js')return;
 event.respondWith((async()=>{
  const cached=await (await snapshot()).match(event.request,{ignoreSearch:true});
  try{
   const response=await download(event.request,cached?4000:15000);
   if(response.ok&&!response.redirected){const cache=await caches.open(shell);event.waitUntil(cache.put(event.request,response.clone()));}
   if(response.status>=500&&cached)return cached;
   return response;
  }catch{return cached||Response.error();}
 })());
});
