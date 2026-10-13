// Controlled live staging R2 round trip. Creates and removes one tiny media object.
import assert from 'node:assert/strict';
const base='https://dream-team-preview.sewerynski00.workers.dev';
const username=process.env.RYBY_LOGIN_USERNAME,password=process.env.RYBY_LOGIN_PASSWORD;
assert.ok(username&&password,'Missing existing preview login credentials');
const login=await fetch(base+'/api/login',{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username,password})});
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.equal(login.status,303);assert.ok(cookie);
const request=(path,options={})=>{const {headers,...rest}=options;return fetch(base+path,{...rest,headers:{cookie,...headers},cache:'no-store'});};
const data=await (await request('/api/bootstrap')).json(),trip=data.trips[0];assert.ok(trip?.id,'Isolated staging D1 has a trip');
const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kVsAAAAASUVORK5CYII=','base64');
const form=new FormData();form.set('image',new File([bytes],'staging-smoke.png',{type:'image/png'}));form.set('name','staging-smoke');form.set('tripId',trip.id);
const created=await request('/api/deeper-media',{method:'POST',body:form});assert.equal(created.status,201,await created.clone().text());const id=(await created.json()).id;
try{
 const path=`/api/deeper-media/${encodeURIComponent(id)}/image`;
 assert.equal((await fetch(base+path)).status,401,'private image requires session');
 const image=await request(path);assert.equal(image.status,200);assert.equal((await image.arrayBuffer()).byteLength,bytes.length);
 const edited=await request(`/api/deeper-media/${id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({note:'Staging R2 round trip'})});assert.equal(edited.status,200);
 const list=await (await request('/api/deeper-media')).json();assert.equal(list.images.find(x=>x.id===id)?.note,'Staging R2 round trip');
}finally{
 const removed=await request(`/api/deeper-media/${id}`,{method:'DELETE'});assert.equal(removed.status,200,'R2 and metadata deletion');
}
assert.equal((await request(`/api/deeper-media/${id}/image`)).status,404);
console.log('Preview live R2 upload/read/edit/delete and session isolation: PASS. Test object removed.');
