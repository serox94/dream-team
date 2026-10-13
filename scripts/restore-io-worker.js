// Private operational gateway. SOURCE is read-only; writes go to dedicated recovery targets.
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
const response=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export default{async fetch(request,env){
 if(!env.RECOVERY_KEY||request.headers.get('x-recovery-key')!==env.RECOVERY_KEY)return response({ok:false},401);
 const path=new URL(request.url).pathname;
 try{
  if(path==='/ready'&&request.method==='GET')return response({ok:!!(env.SOURCE&&env.ARCHIVE&&env.RESTORED),bindingsReady:!!(env.SOURCE&&env.ARCHIVE&&env.RESTORED)});
  if(path==='/backup'&&request.method==='POST'){
   const entries=[];let cursor;const sourceEtags=new Map();
   do{const listed=await env.SOURCE.list({cursor});for(const info of listed.objects){sourceEtags.set(info.key,info.etag);const object=await env.SOURCE.get(info.key);if(!object)throw Error('SOURCE_CHANGED');if(info.etag!==object.etag)throw Error('SOURCE_CHANGED');const bytes=await object.arrayBuffer();const sha256=await digest(bytes);await env.ARCHIVE.put('objects/'+info.key,bytes,{httpMetadata:object.httpMetadata,customMetadata:object.customMetadata});const copy=await env.ARCHIVE.get('objects/'+info.key);if(!copy||await digest(await copy.arrayBuffer())!==sha256)throw Error('COPY_MISMATCH');entries.push({key:info.key,size:bytes.byteLength,sha256,httpMetadata:object.httpMetadata,customMetadata:object.customMetadata});}cursor=listed.truncated?listed.cursor:undefined;}while(cursor);
   const current=new Map();cursor=undefined;do{const listed=await env.SOURCE.list({cursor});for(const item of listed.objects)current.set(item.key,item.etag);cursor=listed.truncated?listed.cursor:undefined;}while(cursor);if(current.size!==sourceEtags.size||[...sourceEtags].some(([key,etag])=>current.get(key)!==etag))throw Error('SOURCE_CHANGED');
   const manifest={createdAt:new Date().toISOString(),entries};await env.ARCHIVE.put('manifest.json',JSON.stringify(manifest));return response({ok:true,objects:entries.length,manifestSha256:await digest(new TextEncoder().encode(JSON.stringify(manifest)))});
  }
  if(path==='/restore'&&request.method==='POST'){
   const object=await env.ARCHIVE.get('manifest.json');if(!object)throw Error('NO_MANIFEST');const manifest=await object.json();
   for(const row of manifest.entries){const object=await env.ARCHIVE.get('objects/'+row.key);if(!object||await digest(await object.arrayBuffer())!==row.sha256)throw Error('ARCHIVE_MISMATCH');}
   for(const row of manifest.entries){const bytes=await(await env.ARCHIVE.get('objects/'+row.key)).arrayBuffer();await env.RESTORED.put(row.key,bytes,{httpMetadata:row.httpMetadata,customMetadata:row.customMetadata});const copy=await env.RESTORED.get(row.key);if(!copy||await digest(await copy.arrayBuffer())!==row.sha256)throw Error('RESTORE_MISMATCH');}
   return response({ok:true,objects:manifest.entries.length,verified:true});
  }
  if(['/private-sql/source','/private-sql/checkpoint'].includes(path)&&request.method==='PUT'){
   const sqlKey=path.endsWith('/source')?'source.sql':'checkpoint.sql';
   const bytes=await request.arrayBuffer();await env.ARCHIVE.put(sqlKey,bytes,{httpMetadata:{contentType:'application/sql'}});const copy=await env.ARCHIVE.get(sqlKey);if(!copy||await digest(await copy.arrayBuffer())!==await digest(bytes))throw Error('SQL_COPY_MISMATCH');return response({ok:true,sha256:await digest(bytes)});
  }
  return response({ok:false},404);
 }catch(error){const safe=new Set(['SOURCE_CHANGED','COPY_MISMATCH','NO_MANIFEST','ARCHIVE_MISMATCH','RESTORE_MISMATCH','SQL_COPY_MISMATCH']);return response({ok:false,error:safe.has(error.message)?error.message:'RECOVERY_FAILED'},500);}
}};
