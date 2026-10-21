import '../public/domain-glossary.js';
import {entities,originals,hash} from './content-translations.js';
import {body,fail} from './validation.js';
// Controlled domain dictionary is exact-match only. It is not a general translation engine.
const {glossary,detect}=globalThis.DreamGlossary;export {glossary,detect};
export const providerReady=env=>env.TRANSLATION_ENABLED==='true'&&env.TRANSLATION_FREE_CONFIRMED==='true'&&Boolean(env.AI);
export async function processTranslations(request,env,active){
 if(!active?.account)fail('Wymagane logowanie indywidualne.',403);
 const x=await body(request);if(!x.tripId)fail('Wymagany tripId.');
 if(!await env.DB.prepare('SELECT id FROM trips WHERE id=?').bind(x.tripId).first())fail('Nie znaleziono wyjazdu.',404);
 let sources=[];for(const entity of Object.keys(entities))sources.push(...await originals(env,entity,null,x.tripId));
 if(x.changed){sources.sort((a,b)=>Number(b.entity===x.changed.entity&&b.recordId===String(x.changed.recordId))-Number(a.entity===x.changed.entity&&a.recordId===String(x.changed.recordId)));}
 const cursor=Number.isInteger(x.cursor)&&x.cursor>=0?x.cursor:0,scopeCount=sources.length,nextCursor=cursor+3<scopeCount?cursor+3:null;sources=sources.slice(cursor,cursor+3);
 let translated=0,manual=0,failed=0,processed=0;const hint=request.headers.get('accept-language')?.startsWith('en')?'en':'pl';
 for(const source of sources){
  const args=[source.entity,source.recordId,source.field];
  let meta=await env.DB.prepare('SELECT * FROM content_sources WHERE entity=? AND record_id=? AND field=?').bind(...args).first();
  if(x.source&&x.source.entity===source.entity&&String(x.source.recordId)===source.recordId&&x.source.field===source.field){
   if(!['pl','en'].includes(x.source.language)||x.source.sourceHash!==source.sourceHash)fail('Treść źródłowa zmieniła się.',409);
   meta={source_language:x.source.language};
  }
  const changed=x.changed?.entity===source.entity&&String(x.changed.recordId)===source.recordId;
  const language=changed?detect(source.sourceText,hint):(meta?.source_language||detect(source.sourceText,'pl')),target=language==='pl'?'en':'pl';
  if(!meta||meta.source_hash!==source.sourceHash||meta.source_language!==language)await env.DB.prepare(`INSERT INTO content_sources(entity,record_id,field,source_hash,source_language) VALUES(?,?,?,?,?) ON CONFLICT(entity,record_id,field) DO UPDATE SET source_hash=excluded.source_hash,source_language=excluded.source_language,updated_at=CURRENT_TIMESTAMP`).bind(...args,source.sourceHash,language).run();
  const existing=await env.DB.prepare('SELECT * FROM content_translations WHERE entity=? AND record_id=? AND field=? AND language=?').bind(...args,target).first();
  if(existing?.source_hash===source.sourceHash){if(existing.origin==='manual')manual++;continue;}
  // A changed source makes a manual correction stale; never silently replace it.
  if(existing?.origin==='manual'){manual++;continue;}
  const job=await env.DB.prepare('SELECT * FROM translation_jobs WHERE entity=? AND record_id=? AND field=? AND language=?').bind(...args,target).first();
  await env.DB.prepare(`INSERT INTO translation_jobs(entity,record_id,field,language,source_hash) VALUES(?,?,?,?,?) ON CONFLICT(entity,record_id,field,language) DO UPDATE SET status=CASE WHEN source_hash<>excluded.source_hash THEN 'pending' ELSE status END,attempts=CASE WHEN source_hash<>excluded.source_hash THEN 0 ELSE attempts END,source_hash=excluded.source_hash`).bind(...args,target,source.sourceHash).run();
  let output=glossary(source.sourceText,language,target),provider='glossary';
  const cached=await env.DB.prepare('SELECT text,provider FROM translation_cache WHERE source_hash=? AND source_language=? AND language=?').bind(source.sourceHash,language,target).first();if(cached){output=cached.text;provider=cached.provider;}
  if(!output&&providerReady(env)&&processed<8&&source.sourceText.length<=3000&&(!job||job.attempts<3)&&(!job||job.status==='pending'||Date.now()-Date.parse(job.updated_at+'Z')>60000)){
   const lease=await env.DB.prepare("UPDATE translation_jobs SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE entity=? AND record_id=? AND field=? AND language=? AND source_hash=? AND status<>'processing'").bind(...args,target,source.sourceHash).run();
   if(!lease.meta.changes)continue;
   processed++;provider='cloudflare_m2m100';
   let deadline;try{const response=await Promise.race([env.AI.run('@cf/meta/m2m100-1.2b',{text:source.sourceText,source_lang:language==='pl'?'polish':'english',target_lang:target==='pl'?'polish':'english'}),new Promise((_,reject)=>deadline=setTimeout(()=>reject(Error('PROVIDER_TIMEOUT')),12000))]);
    output=response?.translated_text;if(typeof output!=='string'||!output.trim()||output.length>20000)throw Error('INVALID_PROVIDER_OUTPUT');
    const tokens=v=>v.match(/https?:\/\/\S+|\b\d+(?:[.,]\d+)?\b/g)||[];
    if(JSON.stringify(tokens(output))!==JSON.stringify(tokens(source.sourceText)))throw Error('PROVIDER_TOKENS_CHANGED');
   }catch(error){output=null;failed++;await env.DB.prepare("UPDATE translation_jobs SET status='failed',attempts=attempts+1,last_error=?,updated_at=CURRENT_TIMESTAMP WHERE entity=? AND record_id=? AND field=? AND language=? AND source_hash=?").bind(['PROVIDER_TIMEOUT','INVALID_PROVIDER_OUTPUT','PROVIDER_TOKENS_CHANGED'].includes(error.message)?error.message:'PROVIDER_UNAVAILABLE',...args,target,source.sourceHash).run();}finally{clearTimeout(deadline);}
  }
  if(!output)continue;
  // The source may have changed while inference was in flight. Atomic source/revision guards prevent stale writes.
  const result=await env.DB.prepare(`INSERT INTO content_translations(entity,record_id,field,language,source_hash,translated_text,updated_by,origin) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${entities[source.entity].table} WHERE id=? AND ${source.column}=?) ON CONFLICT(entity,record_id,field,language) DO UPDATE SET source_hash=excluded.source_hash,translated_text=excluded.translated_text,origin=excluded.origin,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP,revision=content_translations.revision+1 WHERE content_translations.origin<>'manual'`).bind(...args,target,source.sourceHash,output,active.account.id,provider,source.recordId,source.raw).run();
  if(result.meta.changes){translated++;await env.DB.prepare('INSERT OR IGNORE INTO translation_cache(source_hash,source_language,language,text,provider) VALUES(?,?,?,?,?)').bind(source.sourceHash,language,target,output,provider).run();await env.DB.prepare("UPDATE translation_jobs SET status='complete',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE entity=? AND record_id=? AND field=? AND language=? AND source_hash=?").bind(...args,target,source.sourceHash).run();}
 }
 const stats=(await env.DB.prepare('SELECT status,COUNT(*) count FROM translation_jobs GROUP BY status').all()).results;
 return {ok:true,engine:providerReady(env)?'cloudflare_m2m100':'glossary_only',providerEnabled:providerReady(env),translated,manual,failed,stats,scopeCount,nextCursor};
}
