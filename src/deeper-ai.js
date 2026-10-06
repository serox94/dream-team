import {fail,body,text} from './validation.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const run=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).run();
const MODEL='@cf/google/gemma-4-26b-a4b-it';
const prompt=`Interpret a Fish Deeper CHIRP+ 2 sonar screenshot conservatively. Reply in Polish as JSON only, with string keys observed,bottom,hardness,weed,structure,fishEcho,interference,spotsA,spotsB,spotsC,confidence. Use "nie wiadomo" where the image does not support a claim. A colored band alone does not prove gravel or silt; a fish icon or arch does not identify species. Spots A/B/C are hypotheses to verify, never guarantees. Do not infer fish species. Keep each value under 300 characters.`;
function normalize(raw){
 let value=raw?.response??raw?.choices?.[0]?.message?.content??raw?.result??raw;
 if(Array.isArray(value))value=value.map(p=>p.text||'').join('');
 if(typeof value==='string'){
  try{value=JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/g,''));}
  catch{value={observed:value,bottom:'nie wiadomo',hardness:'nie wiadomo',weed:'nie wiadomo',structure:'nie wiadomo',fishEcho:'nie wiadomo',interference:'nie wiadomo',spotsA:'nie wiadomo',spotsB:'nie wiadomo',spotsC:'nie wiadomo',confidence:'niska'};}
 }
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Model nie zwrócił czytelnego wyniku.',502);
 const fields=['observed','bottom','hardness','weed','structure','fishEcho','interference','spotsA','spotsB','spotsC'];
 const result=Object.fromEntries(fields.map(k=>[k,text(value[k]??'nie wiadomo',k,300,true)]));
 result.confidence=['niska','średnia','wysoka'].includes(value.confidence)?value.confidence:'niska';
 result.warning='Echo sonaru wymaga ponownego przejazdu i sprawdzenia miejsca. Model nie rozpoznaje gatunku ryby.';
 result.model=MODEL;
 return result;
}
function base64(bytes){let str='';for(let i=0;i<bytes.length;i+=0x8000)str+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(str);}
export async function handleDeeperAI(request,env,id,action){
 const row=await one(env,'SELECT object_key,mime_type mimeType,size_bytes sizeBytes FROM deeper_media WHERE id=?',id);
 if(!row)fail('Nie znaleziono screenshota.',404);
 if(action==='analyze'&&request.method==='POST'){
  if(!env.AI||env.AI_FREE_ONLY!=='true')return json({ok:false,error:'Analiza AI oczekuje na potwierdzenie planu Free i binding AI. Użyj analizy bez AI.'},503);
  if(row.sizeBytes>2*1024*1024)fail('Do analizy AI obraz musi mieć najwyżej 2 MB. Zmniejsz rozmiar w telefonie.',413);
  const day=new Date().toISOString().slice(0,10),attemptId=crypto.randomUUID();
  const inserted=await run(env,"INSERT INTO deeper_ai_attempts(id,day_utc,media_id) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM deeper_ai_attempts WHERE day_utc=?)<10",attemptId,day,id,day);
  if(!inserted.meta?.changes)return json({ok:false,error:'Dzisiejszy limit 10 analiz został wyczerpany.'},429);
  try{
   const object=await env.MEDIA.get(row.object_key);if(!object)fail('Brakuje obrazu w bibliotece.',404);
   const bytes=new Uint8Array(await object.arrayBuffer());
   const answer=await env.AI.run(MODEL,{messages:[{role:'user',content:prompt}],image:`data:${row.mimeType};base64,${base64(bytes)}`,max_tokens:500,temperature:0.2},{rejectIfBusy:true});
   const analysis=normalize(answer);
   await run(env,"UPDATE deeper_ai_attempts SET status='completed' WHERE id=?",attemptId);
   return json({ok:true,analysis,remaining:9-(await one(env,'SELECT COUNT(*) n FROM deeper_ai_attempts WHERE day_utc=?',day)).n+1});
  }catch(error){await run(env,"UPDATE deeper_ai_attempts SET status='failed' WHERE id=?",attemptId);if(error.status)throw error;return json({ok:false,error:'Model nie odpowiedział. Spróbuj później lub użyj analizy bez AI.'},502);}
 }
 if(action==='analysis'&&request.method==='PUT'){
  const {analysis}=await body(request);
  const clean=normalize(analysis);
  await run(env,'UPDATE deeper_media SET analysis_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',JSON.stringify(clean),id);
  return json({ok:true});
 }
 if(action==='analysis'&&request.method==='DELETE'){
  await run(env,'UPDATE deeper_media SET analysis_json=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?',id);
  return json({ok:true});
 }
 return json({ok:false,error:'Nie znaleziono endpointu.'},404);
}
