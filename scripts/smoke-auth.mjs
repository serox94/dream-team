import assert from 'node:assert/strict';

const base=process.env.RYBY_PRODUCTION_URL||'https://dream-team.sewerynski00.workers.dev';
const username=process.env.RYBY_LOGIN_USERNAME;
const password=process.env.RYBY_LOGIN_PASSWORD;
assert.ok(username&&password,'Missing login configuration');
const request=(path,options={})=>fetch(new URL(path,base),{redirect:'manual',cache:'no-store',...options});
const form=(username,password)=>({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});

assert.equal((await request('/')).status,302);
const entry=await request('/login');assert.equal(entry.status,200);assert.match(await entry.text(),/Zaloguj/);
assert.equal((await request('/login.css')).status,200);
assert.equal((await request('/dream-core.js')).status,302);
for(const path of ['/api/bootstrap','/api/export','/api/health'])assert.equal((await request(path)).status,401,path);
assert.equal((await request('/api/catches',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
const invalid=await request('/api/login',form(username,password+'-invalid'));
assert.equal(invalid.status,303);assert.match(invalid.headers.get('location'),/error=credentials/);
assert.equal(invalid.headers.get('set-cookie'),null);
const valid=await request('/api/login',form(username,password));assert.equal(valid.status,303);
const cookieHeader=valid.headers.get('set-cookie');
assert.match(cookieHeader,/^__Host-ryby_session=/);
for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=63072000'])assert.ok(cookieHeader.includes(flag),flag);
assert.ok(!cookieHeader.includes(password));
const cookie=cookieHeader.split(';')[0],headers={cookie};
assert.equal((await request('/',{headers})).status,200);
assert.equal((await request('/api/bootstrap',{headers})).status,200);
assert.equal((await request('/api/bootstrap',{headers})).status,200,'reused cookie after reopening');
const exportResponse=await request('/api/export',{headers});assert.equal(exportResponse.status,200);
// An invalid request checks the authorized write path without inserting a trial record.
assert.equal((await request('/api/catches',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'})).status,400);
assert.equal((await request('/api/logout',{method:'POST',headers})).status,200);
assert.equal((await request('/api/bootstrap',{headers})).status,401,'logout revokes the server-side session');
console.log('Production auth smoke: PASS (no production records written).');
