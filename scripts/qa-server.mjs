// Local-only preview: runs the production Worker handler against disposable SQLite.
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import worker from '../src/worker.js';
import {database} from '../tests/db.mjs';
const publicDir=path.resolve(fileURLToPath(new URL('../public/',import.meta.url))); 
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
export async function serve({port=0,seed=false,weatherFetch,testSession=true}={}){
 const DB=database();
 const mediaObjects=new Map();
 const MEDIA={async put(key,body){mediaObjects.set(key,new Uint8Array(body));},async get(key){const bytes=mediaObjects.get(key);return bytes?{body:bytes,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}:null;},async delete(key){mediaObjects.delete(key);}};
 const AI={async run(){return {response:JSON.stringify({observed:'A change in the bottom profile',bottom:'uncertain',hardness:'uncertain',weed:'uncertain',structure:'possible drop-off',fishEcho:'uncertain',interference:'uncertain',spotsA:'edge',spotsB:'base',spotsC:'top',confidence:'low'})};}};
 const env={DB,MEDIA,AI,AI_FREE_ONLY:'true',ASSETS:null,WEATHER_FETCH:weatherFetch,RYBY_LOGIN_USERNAME:'local-fixture-user',RYBY_LOGIN_PASSWORD:'local-fixture-password',RYBY_SESSION_SECRET:'local-fixture-session-secret-with-32-chars'};
 let testCookie='';
 if(seed){
  DB.sqlite.exec("INSERT INTO catches(trip_id,angler_id,caught_at,weight_kg,species,bait) VALUES('next-trip','maciek','2026-09-03T10:00:00Z',18,'Karp','tuti'),('next-trip','patryk','2026-09-03T11:00:00Z',5,'Karp','coco');");
  DB.sqlite.exec("INSERT INTO checklist_items(trip_id,category,label,packed,quantity) VALUES('next-trip','sprzęt','Testowy podbierak',1,'1 szt.'),('next-trip','jedzenie / picie','Testowa woda',0,'5 litry');");
 }
 const requests=[];
 const ASSETS={async fetch(request){
  let pathname=decodeURIComponent(new URL(request.url).pathname);
  if(pathname==='/__qa')return new Response(`<!doctype html><html lang="pl"><title>Local responsive QA</title><style>body{background:#dde3e2;font:16px system-ui}iframe{border:1px solid #777;display:block;background:white;max-width:100%}nav{display:flex;gap:12px;padding:8px}</style><nav><label>Strona <select id="page"><option value="/">Dashboard</option>${['wyjazdy','polowy','checklisty','mapa','pogoda','dojazd','regulamin','wezly','rigi','porady','encyklopedia','sonar'].map(s=>`<option value="/pages/${s}.html">${s}</option>`).join('')}</select></label><button data-w="390">Mobile 390</button><button data-w="1280">Desktop 1280</button></nav><iframe title="Aplikacja testowa" id="frame" src="/" width="390" height="844"></iframe><script>page.onchange=()=>frame.src=page.value;document.querySelectorAll('button').forEach(b=>b.onclick=()=>frame.width=b.dataset.w)</script></html>`,{headers:{'content-type':'text/html; charset=utf-8'}});
  if(pathname==='/')pathname='/index.html';
  let file=path.resolve(publicDir,'.'+pathname);
  if(!file.startsWith(publicDir+path.sep))return new Response('Forbidden',{status:403});
  try{if(!(await stat(file)).isFile())throw Error();}catch{if(!path.extname(file)){file+='.html';}else return new Response('Not found',{status:404});}
  try{return new Response(await readFile(file),{headers:{'content-type':mime[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('Not found',{status:404});}
 }};
 env.ASSETS=ASSETS;
 const server=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const headers={...req.headers};if(testSession&&testCookie&&!headers.cookie)headers.cookie=testCookie;
   const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
   const response=await worker.fetch(request,env);
   const record={method:req.method,url:req.url,status:response.status};
   if(req.method==='PATCH'&&req.url.startsWith('/api/deeper-media/'))record.fixtureBody=Buffer.concat(chunks).toString('utf8');
   requests.push(record);
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end(error.message);}
 });
 await new Promise(resolve=>server.listen(port,'0.0.0.0',resolve));
 if(testSession){
  const form=new URLSearchParams({username:env.RYBY_LOGIN_USERNAME,password:env.RYBY_LOGIN_PASSWORD});
  const signed=await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}/api/login`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form}),env);
  if(signed.status!==303)throw Error('Local QA login failed');
  testCookie=signed.headers.get('set-cookie').split(';')[0];
 }
 return {DB,mediaObjects,requests,url:`http://127.0.0.1:${server.address().port}`,async close(){await new Promise(r=>server.close(r));DB.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const preview=await serve({port:Number(process.env.RYBY_QA_PORT||8787),seed:true});
 console.log('Local disposable preview: '+preview.url+' (responsive harness: /__qa)');
}
