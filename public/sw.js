// Only static application files live here. API responses and writes never enter this cache.
const shell='ryby-shell-20261012-109';
const warm=['/','/index.html','/pages/polowy.html','/pages/checklisty.html','/pages/teren.html','/pages/mapa.html','/pages/regulamin.html','/pages/pogoda.html',
  '/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html','/settings.js','/knowledge.js','/knowledge.css','/i18n.js','/language-preference.js','/locales/pl.json','/locales/en.json','/locales/runtime.en.json','/locales/guides.en.json','/locales/knots.en.json','/locales/trip-advice.en.json','/deeper-media.js','/deeper-media.css',
  '/data/knowledge/sources.json','/data/knowledge/encyclopedia.json','/data/knowledge/sonar.json','/data/knowledge/tools.json','/data/knowledge/field-guides.json','/data/knowledge/chirp2-practice.json','/data/knowledge/en/encyclopedia.json','/data/knowledge/en/sonar.json','/data/knowledge/en/field-guides.json','/data/knowledge/en/tools.json','/data/knowledge/en/chirp2-practice.json','/data/knowledge/en/quiz.json','/data/knowledge/en/matrices.json','/assets/deeper/chirp2/index.json','/assets/deeper/chirp2/index.en.json','/locales/legacy.en.json','/locales/porady.en.json',
  '/dream-loader-v2.js','/dream-core.js','/trip-notes.js','/checklist-templates.js','/checklist-templates.css','/d1-api-compat.js','/app.js','/app-plus.js','/weather-conditions.js','/field-mode.js','/trip-renderer-v2.js','/dashboard-chart.js','/fixes.js',
  '/style.css','/ui-plus.css','/media-plus.css','/weather-plus.css','/audit.css','/refresh.css',
  '/assets/img/patryk-maciek.jpeg','/assets/img/lowisko.jpg',
  '/data/lakes/plaine2/dojazd.html','/data/lakes/plaine2/regulamin.html','/data/lakes/plaine2/porady.html'];

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('ryby-shell-')&&key!==shell)await caches.delete(key);
  await self.clients.claim();
})()));

// Several pages/tabs may request warming together. One shared refresh per generation
// avoids repeatedly downloading the whole shell during normal navigation.
let warming=null;
const warmMarker='/__ryby_shell_warmed',warmInterval=10*60*1000;
async function warmShell(){
 const cache=await caches.open(shell),marker=await cache.match(warmMarker);
 if(marker&&Date.now()-Number(await marker.text())<warmInterval)return;
 for(const path of warm){
  const request=new Request(path,{credentials:'same-origin'});
  try{
   const response=await fetch(request,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(response.ok&&!response.redirected)await cache.put(request,response);
  }catch{} // Keep the previous static entry when the network fails.
 }
 await cache.put(warmMarker,new Response(String(Date.now())));
}
self.addEventListener('message',event=>{
 if(event.data?.type!=='WARM_SHELL')return;
 if(!warming)warming=warmShell().finally(()=>{warming=null;});
 event.waitUntil(warming);
});

self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||event.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request);
      if(response.ok&&!response.redirected&&url.pathname!=='/sw.js'&&!url.pathname.startsWith('/login')){
        const cache=await caches.open(shell);
        event.waitUntil(cache.put(event.request,response.clone()));
      }
      return response;
    }catch{
      const cache=await caches.open(shell);
      return await cache.match(event.request,{ignoreSearch:true})||Response.error();
    }
  })());
});
