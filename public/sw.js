// Only static application files live here. API responses and writes never enter this cache.
const shell='ryby-shell-20261008-10';
const warm=['/','/index.html','/pages/polowy.html','/pages/checklisty.html','/pages/teren.html','/pages/mapa.html','/pages/regulamin.html','/pages/pogoda.html',
  '/pages/encyklopedia.html','/pages/sonar.html','/pages/ustawienia.html','/settings.js','/knowledge.js','/knowledge.css','/i18n.js','/locales/pl.json','/locales/en.json','/locales/runtime.en.json','/locales/guides.en.json','/locales/knots.en.json','/locales/trip-advice.en.json','/deeper-media.js','/deeper-media.css',
  '/data/knowledge/sources.json','/data/knowledge/encyclopedia.json','/data/knowledge/sonar.json','/data/knowledge/tools.json','/data/knowledge/field-guides.json','/data/knowledge/chirp2-practice.json','/data/knowledge/en/encyclopedia.json','/data/knowledge/en/sonar.json','/data/knowledge/en/field-guides.json','/data/knowledge/en/tools.json','/data/knowledge/en/chirp2-practice.json','/data/knowledge/en/quiz.json','/data/knowledge/en/matrices.json','/assets/deeper/chirp2/index.json','/assets/deeper/chirp2/index.en.json','/locales/legacy.en.json','/locales/porady.en.json',
  '/dream-loader-v2.js','/dream-core.js','/trip-notes.js','/checklist-templates.js','/checklist-templates.css','/d1-api-compat.js','/app.js','/app-plus.js','/field-mode.js','/trip-renderer-v2.js','/dashboard-chart.js','/fixes.js',
  '/style.css','/ui-plus.css','/media-plus.css','/weather-plus.css','/audit.css','/refresh.css',
  '/assets/img/patryk-maciek.jpeg','/assets/img/lowisko.jpg',
  '/data/lakes/plaine2/dojazd.html','/data/lakes/plaine2/regulamin.html','/data/lakes/plaine2/porady.html'];

self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('ryby-shell-')&&key!==shell)await caches.delete(key);
  await self.clients.claim();
})()));

self.addEventListener('message',event=>{
  if(event.data?.type!=='WARM_SHELL')return;
  event.waitUntil((async()=>{
    const cache=await caches.open(shell);
    for(const path of warm){
      const request=new Request(path,{credentials:'same-origin'});
      try{
        // Refresh every shell entry while online. Reusing a cache generation must
        // never pin old JavaScript after a new deployment.
        const response=await fetch(request,{cache:'no-store'});
        if(response.ok&&!response.redirected)await cache.put(request,response);
      }catch{
        // Keep any previously cached entry when the refresh cannot reach the network.
      }
    }
  })());
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
