import {body,fail,text} from './validation.js';
// Closed map excludes logins, IDs, URLs, GPS, timestamps, measurements and auth tables.
export const entities={
 trips:{table:'trips',fields:['peg','facts_json']},lakes:{table:'lakes',fields:['facts_json']},
 catches:{table:'catches',fields:['notes']},spots:{table:'spots',fields:['name','bottom_type','notes','obstacles','best_time','best_wind','weed']},
 checklist:{table:'checklist_items',fields:['label','notes']},categories:{table:'checklist_categories',fields:['name']},
 notes:{table:'trip_notes',fields:['title','content']},documents:{table:'trip_documents',fields:['title','content']},
 research:{table:'lake_facts',fields:['value']}
};
const encoder=new TextEncoder();
export const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))),v=>v.toString(16).padStart(2,'0')).join('');
const meaningful=value=>typeof value==='string'&&value.trim()&&!/^https?:|^\/assets\/|^\d+(?:[.,]\d+)?$/.test(value.trim());
function fields(row,config){
 const out=[];for(const name of config.fields){const value=row[name];if(name==='facts_json'){
  let facts;try{facts=JSON.parse(value);}catch{continue;}
  const visit=(object,prefix)=>{for(const [key,item] of Object.entries(object||{})){if(!['rulesText','logisticsText','adviceText','depth','waterSize','description','equipment','facilities','notes'].includes(key))continue;const path=prefix+'.'+key;if(meaningful(item))out.push({field:path,sourceText:item,column:name,raw:value});else if(item&&typeof item==='object'&&!Array.isArray(item))visit(item,path);}};visit(facts,'facts');
 }else if(meaningful(value))out.push({field:name,sourceText:value,column:name,raw:value});}return out;
}
export async function originals(env,entity,recordId,tripId){
 const config=entities[entity];if(!config)fail('Nieznany rodzaj treści.',400,'INVALID_CONTENT_ENTITY');
 let where='',params=[];
 if(recordId){where=' WHERE id=?';params=[recordId];}
 else if(tripId){if(['trips','lakes','research'].includes(entity)){
   where=entity==='trips'?' WHERE id=?':entity==='lakes'?' WHERE id=(SELECT lake_id FROM trips WHERE id=?)':' WHERE lake_id=(SELECT lake_id FROM trips WHERE id=?)';params=[tripId];
  }else if(entity!=='categories'){where=' WHERE trip_id=?';params=[tripId];}}
 const rows=(await env.DB.prepare(`SELECT id,${config.fields.join(',')} FROM ${config.table}${where} ORDER BY id`).bind(...params).all()).results;
 const result=[];for(const row of rows)for(const item of fields(row,config))result.push({entity,recordId:String(row.id),...item,sourceHash:await hash(item.sourceText)});return result;
}
export async function handleContentTranslations(request,env,active){
 const url=new URL(request.url),language=url.searchParams.get('language')||'en';if(!['pl','en'].includes(language))fail('Wybierz język PL lub EN.',400,'INVALID_LANGUAGE');
 if(request.method==='GET'){
  const entity=url.searchParams.get('entity'),recordId=url.searchParams.get('recordId'),tripId=url.searchParams.get('tripId');
  if(!entity&&!tripId)fail('Wymagany tripId.',400,'CONTENT_SCOPE_REQUIRED');
  const source=[];for(const key of entity?[entity]:Object.keys(entities))source.push(...await originals(env,key,recordId,tripId));
  const saved=(await env.DB.prepare('SELECT entity,record_id,field,source_hash,translated_text,updated_at,revision,origin FROM content_translations WHERE language=?').bind(language).all()).results;
  const byKey=new Map(saved.map(t=>[[t.entity,t.record_id,t.field].join('|'),t]));
  return {ok:true,automaticTranslation:env.TRANSLATION_ENABLED==='true'&&env.TRANSLATION_FREE_CONFIRMED==='true'?'cloudflare_m2m100':'glossary_only_provider_not_enabled',language,records:source.map(({column,raw,...item})=>{const translated=byKey.get([item.entity,item.recordId,item.field].join('|'));return {...item,translation:translated?.translated_text??'',revision:translated?.revision??0,status:!translated?'missing':translated.source_hash===item.sourceHash?'current':'stale',updatedAt:translated?.updated_at??null,origin:translated?.origin??null};})};
 }
 if(request.method!=='PUT')fail('Niedozwolona metoda.',405);
 if(!active?.account)fail('Wymagane logowanie indywidualne.',403,'INDIVIDUAL_ACCOUNT_REQUIRED');
 const x=await body(request),entity=text(x.entity,'Rodzaj treści',40,true),id=text(String(x.recordId??''),'Rekord',100,true),field=text(x.field,'Pole',200,true);
 if(!['pl','en'].includes(x.language))fail('Wybierz język PL lub EN.',400,'INVALID_LANGUAGE');
 const source=(await originals(env,entity,id)).find(s=>s.field===field);if(!source)fail('Nie znaleziono tekstu źródłowego.',404,'CONTENT_NOT_FOUND');
 if(x.sourceHash!==source.sourceHash)fail('Treść źródłowa zmieniła się. Odśwież tłumaczenie.',409,'CONTENT_SOURCE_CHANGED');
 const translated=text(x.translation,'Tłumaczenie',20000,true),tokens=value=>value.match(/https?:\/\/\S+|(?<![\p{L}\p{N}_])[+-]?\d+(?:[.,]\d+)?/gu)||[];
 if(JSON.stringify(tokens(source.sourceText))!==JSON.stringify(tokens(translated)))fail('Tłumaczenie musi zachować liczby i adresy źródła.',400,'TRANSLATION_TOKENS_CHANGED');
 if(!Number.isInteger(x.revision)||x.revision<0)fail('Nieprawidłowa wersja tłumaczenia.',400,'INVALID_TRANSLATION_VERSION');
 const result=await env.DB.prepare(`INSERT INTO content_translations(entity,record_id,field,language,source_hash,translated_text,updated_by) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM ${entities[entity].table} WHERE id=? AND ${source.column}=?) AND (?=0 AND NOT EXISTS(SELECT 1 FROM content_translations WHERE entity=? AND record_id=? AND field=? AND language=?) OR EXISTS(SELECT 1 FROM content_translations WHERE entity=? AND record_id=? AND field=? AND language=? AND revision=?)) ON CONFLICT(entity,record_id,field,language) DO UPDATE SET source_hash=excluded.source_hash,translated_text=excluded.translated_text,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP,revision=content_translations.revision+1,origin='manual'`)
 .bind(entity,id,field,x.language,source.sourceHash,translated,active.account.id,id,source.raw,x.revision,entity,id,field,x.language,entity,id,field,x.language,x.revision).run();
 if(!result.meta.changes)fail('Treść lub tłumaczenie zmieniły się. Odśwież formularz.',409,'CONTENT_TRANSLATION_CONFLICT');
 return {ok:true};
}
