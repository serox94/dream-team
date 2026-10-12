import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
test('multiple pages warm one static shell, retain offline entries, and throttle later navigation',async()=>{
 const listeners={},entries=new Map(),calls=[],base='https://dream.test';let failing=false;
 const key=r=>typeof r==='string'?new URL(r,base).href:r.url;
 const cache={async match(r){return entries.get(key(r))?.clone();},async put(r,response){entries.set(key(r),response.clone());}};
 const sandbox={Request:class extends Request{constructor(url,options){super(new URL(url,base),options);}},Response,AbortSignal,Date,URL,caches:{open:async()=>cache},self:{addEventListener:(name,fn)=>listeners[name]=fn,location:{origin:base}},fetch:async(request)=>{calls.push(request.url);await new Promise(r=>setTimeout(r,1));if(failing)throw new TypeError('offline');return new Response('static '+request.url);}};
 vm.runInNewContext(await readFile('public/sw.js','utf8'),sandbox);
 const warm=()=>{let promise;listeners.message({data:{type:'WARM_SHELL'},waitUntil:p=>promise=p});return promise;};
 await Promise.all([warm(),warm(),warm()]);assert.ok(calls.length>40);assert.equal(new Set(calls).size,calls.length,'one request per static asset despite three callers');assert.ok(calls.every(url=>!new URL(url).pathname.startsWith('/api/')));
 const count=calls.length;await warm();assert.equal(calls.length,count,'another route does not redownload the whole shell');
 entries.set(base+'/__ryby_shell_warmed',new Response('0'));failing=true;await warm();assert.equal(await (await cache.match('/index.html')).text(),'static '+base+'/index.html','failed refresh retains offline shell');
});
