import test from 'node:test';import assert from 'node:assert/strict';
import '../public/domain-glossary.js';import {chunks,modelCall,translateField} from '../src/m2m100.js';import {database} from './db.mjs';
test('PL/EN classifier recognises ASCII English independently of interface language and covers domain phrases',()=>{
 for(const s of ['Landing net','Bait boat','Sleeping bag','Bring a tent and a sleeping bag.','The fish were feeding near the reeds after dark.','Check spare batteries before using the bait boat.','Terminal tackle'])assert.equal(DreamGlossary.detect(s,'pl'),'en',s);
 for(const s of ['Namiot','Podbierak','Kulki proteinowe','Zabierz namiot i podbierak','Przed wyjazdem sprawdz baterie','Łódka zanętowa'])assert.equal(DreamGlossary.detect(s,'en'),'pl',s);
});
test('chunks bound encoder input and preserve URLs, line breaks and markdown markers',()=>{
 const s='# Porada\n- '+('Sprawdź sprzęt. '.repeat(60))+' https://example.com/17\n';const c=chunks(s);assert.ok(c.filter(p=>p.text).every(p=>p.text.length<=450));assert.equal(c.map(p=>p.literal??p.text).join(''),s);
});
test('durable budget fails closed and concurrent duplicate chunks make one model call',async()=>{
 const DB=database();let calls=0;const env={DB,TRANSLATION_DAILY_UNITS:'1200',AI:{run:async()=>{calls++;await new Promise(r=>setTimeout(r,20));return {translated_text:'Bring equipment.'};}}};
 try{const a=await Promise.all([translateField(env,'Zabierz sprzęt.','pl','en'),translateField(env,'Zabierz sprzęt.','pl','en')]);assert.equal(calls,1);assert.ok(a.some(x=>x.deferred));assert.equal((await translateField(env,'Zabierz sprzęt.','pl','en')).text,'Bring equipment.');await assert.rejects(()=>modelCall(env,'Sprawdź sprzęt','pl','en'),/TRANSLATION_DAILY_BUDGET/);assert.equal(calls,1);}finally{DB.close();}
});
