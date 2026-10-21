import test from 'node:test';import assert from 'node:assert/strict';
import '../public/domain-glossary.js';import {chunks,modelCall,translateField} from '../src/m2m100.js';import {handleContentTranslations,hash} from '../src/content-translations.js';import {database,initializeTestAccounts} from './db.mjs';
test('PL/EN classifier recognises ASCII English independently of interface language and covers domain phrases',()=>{
 for(const s of ['Landing net','Bait boat','Sleeping bag','Bring a tent and a sleeping bag.','The fish were feeding near the reeds after dark.','Check spare batteries before using the bait boat.','Terminal tackle'])assert.equal(DreamGlossary.detect(s,'pl'),'en',s);
 for(const s of ['Namiot','Podbierak','Kulki proteinowe','Zabierz namiot i podbierak','Przed wyjazdem sprawdz baterie','Łódka zanętowa'])assert.equal(DreamGlossary.detect(s,'en'),'pl',s);
});
test('chunks bound encoder input and preserve URLs, line breaks and markdown markers',()=>{
 const s='# Porada\n- '+('Sprawdź sprzęt. '.repeat(60))+' https://example.com/17\n';const c=chunks(s);assert.ok(c.filter(p=>p.text).every(p=>p.text.length<=450));assert.equal(c.map(p=>p.literal??p.text).join(''),s);
});
test('durable budget fails closed and concurrent duplicate chunks make one model call',async()=>{
 const DB=database();let calls=0;const env={DB,TRANSLATION_DAILY_UNITS:'1200',AI:{run:async()=>{calls++;await new Promise(r=>setTimeout(r,20));return {translated_text:'Bring equipment.'};}}};
 try{const a=await Promise.all([translateField(env,'Zabierz sprzęt.','pl','en'),translateField(env,'Zabierz sprzęt.','pl','en')]);assert.equal(calls,1);assert.ok(a.some(x=>x.deferred));assert.equal((await translateField(env,'Zabierz sprzęt.','pl','en')).text,'Bring equipment.');env.TRANSLATION_DAILY_UNITS='20';await assert.rejects(()=>modelCall(env,'Sprawdź sprzęt','pl','en'),/TRANSLATION_DAILY_BUDGET/);assert.equal(calls,1);}finally{DB.close();}
});

test('long cached historical documents use bounded bulk D1 reads rather than one per fragment',async()=>{
 const DB=database(),input=Array.from({length:60},(_,i)=>'Sprawdź sprzęt '+String.fromCharCode(65+i%26)+String.fromCharCode(65+Math.floor(i/26))+'.').join('\n');let reads=0;
 try{for(const c of chunks(input))if(c.text?.trim())DB.sqlite.prepare('INSERT OR IGNORE INTO translation_cache VALUES(?,?,?,?,?)').run(await hash('m2m100-chunk-v1:'+c.text.trim()),'pl','en','Check equipment.','cloudflare_m2m100_chunk_v1');
 const env={DB:{prepare(sql){reads++;return DB.prepare(sql);}},AI:{run(){throw Error('cache should prevent inference');}}};assert.ok((await translateField(env,input,'pl','en')).text.includes('Check equipment.'));assert.ok(reads<=2,'long cached read must not exceed subrequest budget');
 }finally{DB.close();}
});

test('automatic numbers preserve decimal values next to units and reject a changed sign',async()=>{
 const DB=database(),env={DB,AI:{run:async()=>({translated_text:'Temperature -1.3°C; depth 2 m.'})}};
 try{assert.equal((await translateField(env,'Temperatura -1,3°C; głębokość 2m.','pl','en')).text,'Temperature -1,3°C; depth 2 m.');env.AI.run=async()=>({translated_text:'Temperature 1.3°C; depth 3 m.'});await assert.rejects(()=>translateField(env,'Temperatura -1,3°C; głębokość 3m.','pl','en'),/PROVIDER_TOKENS_CHANGED/);}finally{DB.close();}
});

test('reclassified English originals cannot be replaced by old automatic English round-trip output',async()=>{
 const DB=database(),env={DB,INDIVIDUAL_ACCOUNTS:'true',RYBY_LOGIN_USERNAME:'fixture',RYBY_LOGIN_PASSWORD:'fixture-password',RYBY_SESSION_SECRET:'fixture-only-secret-more-than-32-chars'};
 try{await initializeTestAccounts(env);const actor=DB.sqlite.prepare("SELECT id FROM auth_accounts WHERE username='Patryk'").get().id,text='Bring a tent and a sleeping bag.',id=String(DB.sqlite.prepare("INSERT INTO checklist_items(trip_id,category,label) VALUES('next-trip','sprzęt',?)").run(text).lastInsertRowid),h=await hash(text);
 DB.sqlite.prepare('INSERT INTO content_sources(entity,record_id,field,source_hash,source_language) VALUES(?,?,?,?,?)').run('checklist',id,'label',h,'en');
 DB.sqlite.prepare('INSERT INTO content_translations(entity,record_id,field,language,source_hash,translated_text,updated_by,origin) VALUES(?,?,?,?,?,?,?,?)').run('checklist',id,'label','en',h,'Wrong old English output',actor,'cloudflare_m2m100');
 const data=await handleContentTranslations(new Request('https://test/api/content-translations?tripId=next-trip&language=en'),env,{}),row=data.records.find(r=>r.entity==='checklist'&&r.recordId===id&&r.field==='label');assert.equal(row.status,'original');assert.equal(row.translation,text);assert.equal(DB.sqlite.prepare('SELECT label FROM checklist_items WHERE id=?').get(id).label,text);
 }finally{DB.close();}
});

test('review prompt requires Arabic digits while numeric validation still rejects changed values',async()=>{
 const DB=database();let input;const env={DB,TRANSLATION_REVIEW_ENABLED:'true',AI:{run:async(model,x)=>{if(model.includes('m2m100'))return {translated_text:'Choose three zones at 10–12 m.'};input=x;return {response:'Choose 3 zones at 10–12 m.'};}}};
 try{assert.equal((await translateField(env,'Wybierz 3 strefy na 10–12 m.','pl','en')).text,'Choose 3 zones at 10–12 m.');assert.match(input.messages[0].content,/\["3","10","12"\]/);assert.match(input.messages[0].content,/never spell them out/);}finally{DB.close();}
});
