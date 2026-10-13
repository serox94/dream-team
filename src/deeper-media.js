import {fail,text,number,date,body,has,pick} from './validation.js';

const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const all=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results;
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
const mimeExt={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const MAX_BYTES=8*1024*1024;
const columns='d.id,d.name,d.mime_type mimeType,d.size_bytes sizeBytes,d.trip_id tripId,d.lake_id lakeId,d.spot_id spotId,d.depth_m depthM,d.captured_at capturedAt,d.note,d.analysis_json analysisJson,d.created_at createdAt,d.updated_at updatedAt,s.name spotName,s.weed spotWeed,s.rig spotRig,s.bait spotBait,(SELECT COUNT(*) FROM catches c WHERE c.spot_id=d.spot_id AND c.trip_id=d.trip_id AND c.deleted_at IS NULL) spotFishCount';

function imageType(bytes){
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
  return null;
}
async function fields(env,x,current={}){
  const name=text(pick(x,'name',current.name),'Nazwa',120,true);
  const tripId=text(pick(x,'tripId',current.trip_id),'Wyjazd',100);
  const lakeId=text(pick(x,'lakeId',current.lake_id),'Łowisko',100);
  const spotId=number(pick(x,'spotId',current.spot_id),'Spot',1,Number.MAX_SAFE_INTEGER);
  const depth=number(pick(x,'depthM',current.depth_m),'Głębokość',0,200);
  const capturedAt=date(pick(x,'capturedAt',current.captured_at),'Data');
  const note=text(pick(x,'note',current.note),'Notatka',2000);
  if(spotId&&!Number.isInteger(spotId))fail('Nieprawidłowy spot.');
  if(tripId&&!await one(env,'SELECT id FROM trips WHERE id=?',tripId))fail('Nie znaleziono wyjazdu.',404);
  if(lakeId&&!await one(env,'SELECT id FROM lakes WHERE id=?',lakeId))fail('Nie znaleziono łowiska.',404);
  if(spotId&&(!tripId||!await one(env,'SELECT id FROM spots WHERE id=? AND trip_id=? AND deleted_at IS NULL',spotId,tripId)))fail('Spot nie należy do wybranego wyjazdu.',400);
  if(tripId&&lakeId&&!await one(env,'SELECT id FROM trips WHERE id=? AND lake_id=?',tripId,lakeId))fail('Łowisko nie należy do wyjazdu.',400);
  return [name,tripId,lakeId,spotId,depth,capturedAt,note];
}
export async function handleDeeperMedia(request,env,id,part){
  if(!env.MEDIA)return json({ok:false,error:'Biblioteka mediów nie jest skonfigurowana.'},503);
  const method=request.method;
  if(!id&&method==='GET'){
    const tripId=new URL(request.url).searchParams.get('tripId');
    const rows=tripId?await all(env,`SELECT ${columns} FROM deeper_media d LEFT JOIN spots s ON s.id=d.spot_id AND s.trip_id=d.trip_id WHERE d.trip_id=? ORDER BY d.created_at DESC`,tripId):await all(env,`SELECT ${columns} FROM deeper_media d LEFT JOIN spots s ON s.id=d.spot_id AND s.trip_id=d.trip_id ORDER BY d.created_at DESC`);
    return json({ok:true,images:rows.map(r=>({...r,analysis:r.analysisJson?JSON.parse(r.analysisJson):null,analysisJson:undefined}))});
  }
  if(!id&&method==='POST'){
    if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))fail('Wymagany formularz ze zdjęciem.',415);
    if(Number(request.headers.get('content-length'))>MAX_BYTES+10000)fail('Obraz przekracza 8 MB.',413);
    const form=await request.formData(),file=form.get('image');
    if(!(file instanceof File))fail('Wybierz obraz.');
    if(file.size<32||file.size>MAX_BYTES)fail('Obraz musi mieć od 32 B do 8 MB.',413);
    const declared=file.type.toLowerCase(),ext=file.name.split('.').pop()?.toLowerCase();
    if(!mimeExt[declared]||ext!==mimeExt[declared]&&!(declared==='image/jpeg'&&ext==='jpeg'))fail('Dozwolone PNG, JPG i WebP.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    if(imageType(bytes)!==declared)fail('Zawartość pliku nie odpowiada typowi obrazu.');
    const x=Object.fromEntries(['name','tripId','lakeId','spotId','depthM','capturedAt','note'].map(k=>[k,form.get(k)||null]));
    const values=await fields(env,x);
    const id=crypto.randomUUID(),key=`screenshots/${id}.${mimeExt[declared]}`;
    await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:declared},customMetadata:{name:values[0]}});
    try{await run(env,'INSERT INTO deeper_media(id,object_key,name,mime_type,size_bytes,trip_id,lake_id,spot_id,depth_m,captured_at,note) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,key,values[0],declared,bytes.length,...values.slice(1));}
    catch(error){await env.MEDIA.delete(key);throw error;}
    return json({ok:true,id},201);
  }
  if(!id||!['GET','PATCH','DELETE'].includes(method))return json({ok:false,error:'Nie znaleziono endpointu.'},404);
  const row=await one(env,'SELECT * FROM deeper_media WHERE id=?',id);if(!row)fail('Nie znaleziono obrazu.',404);
  if(method==='GET'&&part==='/image'){
    const object=await env.MEDIA.get(row.object_key);if(!object)fail('Obraz jest chwilowo niedostępny.',404);
    return new Response(object.body,{headers:{'content-type':row.mime_type,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'inline'}});
  }
  if(part)return json({ok:false,error:'Nie znaleziono endpointu.'},404);
  if(method==='PATCH'){
    const x=await body(request),values=await fields(env,x,row);
    await run(env,'UPDATE deeper_media SET name=?,trip_id=?,lake_id=?,spot_id=?,depth_m=?,captured_at=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',...values,id);
    return json({ok:true});
  }
  if(method==='DELETE'){
    await env.MEDIA.delete(row.object_key);
    await run(env,'DELETE FROM deeper_media WHERE id=?',id);
    return json({ok:true});
  }
  return json({ok:false,error:'Nie znaleziono endpointu.'},404);
}
