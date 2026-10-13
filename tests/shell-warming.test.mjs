import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile('public/sw.js','utf8'),origin='https://dream.test';
function harness(){
 const listeners={},stores=new Map(),calls=[],delays=[];let clock=1700000000000,mode='online',failedPath=null;
 const key=r=>typeof r==='string'?new URL(r,origin).href:r.url;
 const cache=name=>{if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);return {async match(r,options={}){let response=entries.get(key(r));if(!response&&options.ignoreSearch){const wanted=new URL(key(r));response=[...entries].find(([url])=>{const u=new URL(url);return u.origin===wanted.origin&&u.pathname===wanted.pathname;})?.[1];}return response?.clone();},async put(r,response){entries.set(key(r),response.clone());}};};
 const sandbox={Request:class extends Request{constructor(url,options){super(new URL(url,origin),options);}},Response,Headers,URL,AbortController,Date:class extends Date{static now(){return clock;}},setTimeout:(fn,ms)=>{delays.push(ms);return setTimeout(fn,Math.min(ms,25));},clearTimeout,caches:{open:async name=>cache(name),keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name)},self:{location:{origin},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>listeners[name]=fn},fetch:async(request,{signal})=>{
  calls.push(request.url);const path=new URL(request.url).pathname;
  if(mode==='offline'||path===failedPath)throw new TypeError('offline');
  if(mode==='forbidden')return new Response('Forbidden',{status:403});
  if(mode==='quota')return new Response('Rate limited',{status:429});
  if(mode==='connect')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  if(mode==='body')return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(new Error('aborted body')),{once:true});}}));
  return new Response('new '+path);
 }};
 vm.runInNewContext(source,sandbox);const current=source.match(/const shell='([^']+)'/)[1];
 const warm=()=>{let promise;listeners.message({data:{type:'WARM_SHELL'},waitUntil:p=>promise=p});return promise;};
 const activate=()=>{let promise;listeners.activate({waitUntil:p=>promise=p});return promise;};
 const request=async(path,method='GET')=>{let response;const work=[];listeners.fetch({request:new Request(origin+path,{method}),respondWith:p=>response=p,waitUntil:p=>work.push(p)});if(!response)return null;const result=await response;await Promise.all(work);return result;};
 return {cache,current,calls,delays,stores,warm,activate,request,setMode:value=>mode=value,fail:value=>failedPath=value,advance:ms=>clock+=ms};
}
test('pages share warming and failed refresh keeps the last complete static files',async()=>{
 const h=harness();await Promise.all([h.warm(),h.warm(),h.warm()]);assert.ok(h.calls.length>80);assert.equal(new Set(h.calls).size,h.calls.length);assert.ok(h.calls.every(url=>!new URL(url).pathname.startsWith('/api/')));
 assert.ok(h.calls.includes(origin+'/pages/wyjazdy.html'));assert.equal(h.calls.filter(url=>/chirp2\/.*\.png$/.test(url)).length,17);
 const before=h.calls.length;await h.warm();assert.equal(h.calls.length,before);
 h.advance(11*60*1000);h.setMode('offline');await h.warm();assert.ok(h.calls.length>before,'expired warm really attempted a refresh');assert.equal(await(await h.cache(h.current).match('/index.html')).text(),'new /index.html');
});
test('activation and partial upgrade preserve the previous snapshot until every replacement is loaded',async()=>{
 const h=harness(),old='ryby-shell-previous';for(const [path,body] of [['/__ryby_shell_complete','1'],['/index.html','old complete page'],['/app.js','old complete script']])await h.cache(old).put(path,new Response(body));
 await h.activate();assert.ok(h.stores.has(old));h.fail('/knowledge.js');await h.warm();assert.equal(await h.cache(h.current).match('/__ryby_shell_complete'),undefined);assert.ok(h.stores.has(old));
 h.setMode('offline');assert.equal(await(await h.request('/index.html')).text(),'old complete page','partial new HTML must not replace the complete offline generation');
 h.advance(3*60*1000);h.fail(null);h.setMode('online');await h.warm();assert.ok(await h.cache(h.current).match('/__ryby_shell_complete'));assert.equal(h.stores.has(old),false);
 h.setMode('offline');assert.equal(await(await h.request('/index.html')).text(),'new /index.html');
});
test('static deadlines include stalled bodies; private API/login and access denials never use cached files',async()=>{
 const h=harness();await h.cache(h.current).put('/__ryby_shell_complete',new Response('1'));await h.cache(h.current).put('/knowledge.js',new Response('cached complete script'));
 for(const mode of ['connect','body']){h.setMode(mode);const result=await Promise.race([h.request('/knowledge.js?v=release'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('cache fallback did not finish')),300))]);assert.equal(await result.text(),'cached complete script');}
 assert.ok(h.delays.includes(4000));const reads=h.calls.length;for(const [path,method] of [['/api/bootstrap','GET'],['/api/offline-sync','POST'],['/login','GET']])assert.equal(await h.request(path,method),null);assert.equal(h.calls.length,reads);
 h.setMode('quota');assert.equal(await(await h.request('/knowledge.js')).text(),'cached complete script');
 h.setMode('forbidden');const denied=await h.request('/knowledge.js');assert.equal(denied.status,403);assert.equal(await denied.text(),'Forbidden');
});
