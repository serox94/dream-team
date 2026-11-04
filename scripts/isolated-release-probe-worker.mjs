// Disposable fixture only. Never used as DreamTeam application code.
const results=new Map();
export default {async fetch(req,env,ctx){
 const url=new URL(req.url),id=url.searchParams.get('id');
 if(url.pathname==='/audit/result')return results.has(id)?Response.json(results.get(id)):new Response('pending',{status:404});
 if(url.pathname==='/audit/delay'){
  if(!/^(fg|bg)$/.test(id||''))return new Response('bad id',{status:400});
  await env.DB.prepare("INSERT INTO audit_writes(id,status) VALUES(?,'admitted')").bind(id).run();
  const finish=async()=>{
   for(let i=0;i<40;i++){
    if(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='view' AND name=?").bind('audit_gate_'+id).first()){
     try{await env.DB.prepare("UPDATE audit_writes SET status='committed' WHERE id=?").bind(id).run();return {fenced:false,committed:true}}
     catch(e){return {fenced:String(e.message).includes('RELEASE_WRITE_FENCED'),committed:false}}
    }
    await new Promise(r=>setTimeout(r,250));
   }
   return {fenced:false,error:'TEST_GATE_TIMEOUT'};
  };
  if(id==='bg'){ctx.waitUntil(finish().then(value=>results.set(id,value)).catch(()=>results.set(id,{fenced:false,error:'BACKGROUND_FAILED'})));return Response.json({admitted:true},{status:202})}
  return Response.json(await finish());
 }
 const rows=(await env.DB.prepare("SELECT key,value FROM app_settings WHERE key IN ('schema_version','maintenance_mode')").all()).results;
 const s=Object.fromEntries(rows.map(r=>[r.key,r.value]));
 if(url.pathname==='/api/bootstrap'&&s.maintenance_mode==='on')return new Response('maintenance',{status:503});
 if(s.schema_version!==env.APP_SCHEMA)return new Response('schema mismatch',{status:503});
 const trips=await env.DB.prepare('SELECT count(*) n FROM trips').first();
 return Response.json({schema:s.schema_version,trips:trips.n},{headers:{'x-build':env.APP_BUILD}});
}};
