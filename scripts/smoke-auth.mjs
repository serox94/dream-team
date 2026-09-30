import assert from 'node:assert/strict';

const base=process.env.RYBY_PRODUCTION_URL||'https://dream-team.sewerynski00.workers.dev';
const username=process.env.RYBY_LOGIN_USERNAME;
const password=process.env.RYBY_LOGIN_PASSWORD;
assert.ok(username&&password,'Missing login configuration');
const request=(path,options={})=>fetch(new URL(path,base),{redirect:'manual',cache:'no-store',...options});
const form=(username,password)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});

// A deploy can briefly coexist with the previous asset-first Worker at the edge.
const deadline=Date.now()+120000;
while(true){
  const [home,api]=await Promise.all([request('/?auth-smoke='+Date.now()),request('/api/bootstrap?auth-smoke='+Date.now())]);
  if(home.status===302&&api.status===401)break;
  if(Date.now()>deadline)throw Error(`Protected deployment did not propagate: home ${home.status}, API ${api.status}`);
  await new Promise(resolve=>setTimeout(resolve,3000));
}
assert.equal((await request('/')).status,302);
const entry=await request('/login');assert.equal(entry.status,200);assert.match(await entry.text(),/Zaloguj/);
assert.equal((await request('/login.css')).status,200);
const manifestResponse=await request('/manifest.webmanifest');assert.equal(manifestResponse.status,200);
const manifest=await manifestResponse.json();assert.equal(manifest.name,'RYBY');assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons)assert.equal((await request(icon.src)).status,200,icon.src);
for(const path of ['/dream-core.js','/sw.js','/assets/img/patryk-maciek.jpeg','/pages/teren.html'])assert.equal((await request(path)).status,302,path);
for(const path of ['/api/bootstrap','/api/export','/api/health'])assert.equal((await request(path)).status,401,path);
assert.equal((await request('/api/catches',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
const invalid=await request('/api/login',form(username,password+'-invalid'));
assert.equal(invalid.status,303);assert.match(invalid.headers.get('location'),/error=credentials/);
assert.equal(invalid.headers.get('set-cookie'),null);
const mobile=await request('/api/login',{...form(username,password),headers:{'content-type':'application/x-www-form-urlencoded',origin:'null','sec-fetch-site':'cross-site'}});
assert.equal(mobile.status,303,'mobile login form navigation must reach credential validation');
assert.match(mobile.headers.get('set-cookie'),/^__Host-ryby_session=/);
assert.equal((await request('/api/logout',{method:'POST',headers:{cookie:mobile.headers.get('set-cookie').split(';')[0]}})).status,200);
const valid=await request('/api/login',form(username,password));assert.equal(valid.status,303);
const cookieHeader=valid.headers.get('set-cookie');
assert.match(cookieHeader,/^__Host-ryby_session=/);
for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=63072000'])assert.ok(cookieHeader.includes(flag),flag);
assert.ok(!cookieHeader.split(';')[0].split('=')[1].includes(password));
const cookie=cookieHeader.split(';')[0],headers={cookie};
assert.equal((await request('/',{headers})).status,200);
for(const page of ['/pages/polowy.html','/pages/checklisty.html','/pages/pogoda.html','/pages/mapa.html','/pages/teren.html'])assert.equal((await request(page,{headers})).status,200,page);
const dashboard=await request('/',{headers});assert.match(await dashboard.text(),/patryk-maciek\.jpeg|patryk-maciek/);
const shell=await request('/sw.js',{headers});assert.equal(shell.status,200);
assert.match(await shell.text(),/ryby-shell-20260930-3/);
const photo=await request('/assets/img/patryk-maciek.jpeg',{headers});assert.equal(photo.status,200);
assert.ok((await photo.arrayBuffer()).byteLength>10000,'personal photo is nonempty');
assert.equal((await request('/manifest.webmanifest',{headers})).status,200);
const bootstrap=await request('/api/bootstrap',{headers});assert.equal(bootstrap.status,200);
const model=await bootstrap.json(),tripId=model.app.activeTripId;
assert.ok(model.trips.some(trip=>trip.id===tripId),'active D1 trip exists');
const checklist=await request(`/api/checklist?tripId=${encodeURIComponent(tripId)}`,{headers});assert.equal(checklist.status,200);
assert.ok(Array.isArray((await checklist.json()).items),'D1 checklist read works');
assert.equal((await request('/api/bootstrap',{headers})).status,200,'reused cookie after reopening');
const exportResponse=await request('/api/export',{headers});assert.equal(exportResponse.status,200);
// An invalid request checks the authorized write path without inserting a trial record.
assert.equal((await request('/api/catches',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'})).status,400);
assert.equal((await request('/api/logout',{method:'POST',headers})).status,200);
assert.equal((await request('/api/bootstrap',{headers})).status,401,'logout revokes the server-side session');
console.log('Production auth smoke: PASS (no production records written).');
