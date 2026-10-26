// Await asynchronous CacheStorage results on the Node side. Playwright's RAF predicate
// treats a Promise as truthy before its boolean result is available.
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/sw.js',import.meta.url),'utf8');
const cacheName=source.match(/const shell='([^']+)'/)[1],required=JSON.parse(source.match(/const warm=(\[.*?\]);/s)[1]);
export async function waitForOfflineReady(page,{timeout=60000,interval=100}={}){
 const deadline=Date.now()+timeout;let state;
 do{
  state=await page.evaluate(async({cacheName,required})=>{
   if(!(await caches.keys()).includes(cacheName))return {complete:false,missing:required.length,controlled:Boolean(navigator.serviceWorker.controller)};
   const cache=await caches.open(cacheName),complete=Boolean(await cache.match('/__ryby_shell_complete'));
   const present=await Promise.all(required.map(async path=>Boolean(await cache.match(path))));
   return {complete,missing:present.filter(value=>!value).length,missingPaths:required.filter((path,index)=>!present[index]).slice(0,15),controlled:Boolean(navigator.serviceWorker.controller),resources:present.length};
  },{cacheName,required});
  if(state.complete&&state.controlled&&state.missing===0)return state;
  if(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,interval));
 }while(Date.now()<deadline);
 throw Error('OFFLINE_SHELL_NOT_COMPLETE '+JSON.stringify(state));
}
