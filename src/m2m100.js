import {hash} from './content-translations.js';
export const MODEL='@cf/meta/m2m100-1.2b';
export const samples=[
 ['pl','Kulki proteinowe'],['pl','Podbierak'],['pl','Namiot'],['pl','Łódka zanętowa'],['pl','Mata karpiowa'],['pl','Zestaw końcowy'],['pl','Worek do ważenia'],['pl','Śpiwór'],['pl','Zapasowe baterie'],['pl','Podpórki pod wędki'],['pl','Przypon karpiowy'],['pl','Żyłka główna'],['pl','Haczyk bezzadziorowy'],['pl','Sygnalizator brań'],['pl','Zabierz podbierak i matę karpiową.'],['pl','Po zmroku ryby żerowały przy trzcinach.'],['pl','Na stanowisku jest prąd i woda pitna.'],
 ['en','Landing net'],['en','Bait boat'],['en','Sleeping bag'],['en','Carp unhooking mat'],['en','Terminal tackle'],['en','Weigh sling'],['en','Spare batteries'],['en','Rod rests'],['en','Barbless hook'],['en','Main line'],['en','Bite alarm'],['en','Bring a tent and a sleeping bag.'],['en','The fish were feeding near the reeds after dark.'],['en','The peg has electricity and drinking water.'],['en','Check the batteries before using the bait boat.']
];
const bytes=s=>new TextEncoder().encode(s).length;
export async function modelCall(env,text,source,target){
 // Account Free is checked by the preview operator. This durable additional budget
 // covers retries and concurrent tabs, and never refunds failed/time-out calls.
 const reserve=bytes(text)+1024,day=new Date().toISOString().slice(0,10),key='translation.budget.'+day;
 const limit=Math.min(240000,Number(env.TRANSLATION_DAILY_UNITS)||240000);
 const r=await env.DB.prepare(`INSERT INTO app_settings(key,value) SELECT ?,? WHERE ?<=? ON CONFLICT(key) DO UPDATE SET value=CAST(app_settings.value AS INTEGER)+CAST(excluded.value AS INTEGER) WHERE CAST(app_settings.value AS INTEGER)+CAST(excluded.value AS INTEGER)<=? RETURNING value`).bind(key,String(reserve),reserve,limit,limit).first();
 if(!r)throw Error('TRANSLATION_DAILY_BUDGET');
 let deadline;try{
  const response=await Promise.race([env.AI.run(MODEL,{text,source_lang:source==='pl'?'polish':'english',target_lang:target==='pl'?'polish':'english'}),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('PROVIDER_TIMEOUT')),12000);})]);
  const output=response?.translated_text;
  if(typeof output!=='string'||!output.trim()||output.length>20000)throw Error('INVALID_PROVIDER_OUTPUT');
  return output.trim();
 }catch(e){if(/quota|neuron|daily limit|free.*limit/i.test(e.message||''))throw Error('TRANSLATION_PROVIDER_QUOTA');throw e;}finally{clearTimeout(deadline);}
}
export function chunks(text){
 // Preserve paragraph/line boundaries, URL tokens and markdown prefixes. Short
 // chunks avoid the encoder's fixed sequence limit and are cached individually.
 const parts=[];for(const line of text.split(/(\n+)/)){
  if(!line||/^\n+$/.test(line)){parts.push({literal:line});continue;}
  const m=line.match(/^(\s*(?:#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)?)(.*?)(\s*)$/s);if(m[1])parts.push({literal:m[1]});
  const segments=m[2].split(/(https?:\/\/\S+)/g);
  for(const segment of segments){if(/^https?:\/\//.test(segment)||!/[a-ząćęłńóśźż]/i.test(segment)){parts.push({literal:segment});continue;}
   let remaining=segment;while(remaining.length>450){let n=remaining.lastIndexOf('. ',450)+1;if(n<150)n=remaining.lastIndexOf(' ',450);if(n<1)n=450;parts.push({text:remaining.slice(0,n)});remaining=remaining.slice(n);}
   if(remaining)parts.push({text:remaining});
  }if(m[3])parts.push({literal:m[3]});
 }return parts;
}
function preserveNumbers(original,translated){
 const pattern=/\b\d+(?:[.,]\d+)?\b/g,a=original.match(pattern)||[],b=translated.match(pattern)||[];
 if(a.length!==b.length||a.some((x,i)=>Number(x.replace(',','.'))!==Number(b[i].replace(',','.'))))throw Error('PROVIDER_TOKENS_CHANGED');
 let i=0;return translated.replace(pattern,()=>a[i++]);
}
export async function translateField(env,text,source,target){
 let calls=0;const out=[];
 for(const part of chunks(text)){
  if('literal'in part){out.push(part.literal);continue;}
  const value=part.text.trim(),left=part.text.match(/^\s*/)[0],right=part.text.match(/\s*$/)[0];
  if(!value){out.push(part.text);continue;}
  const key=await hash('m2m100-chunk-v1:'+value),cached=await env.DB.prepare('SELECT text FROM translation_cache WHERE source_hash=? AND source_language=? AND language=?').bind(key,source,target).first();
  let translated=cached?.text;
  if(!translated){if(calls>=2)return {deferred:true};calls++;
   const leaseKey='translation.lease.'+key+'.'+source+'.'+target,leaseValue=(Date.now()+60000)+':'+crypto.randomUUID();
   const lease=await env.DB.prepare(`INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(app_settings.value AS INTEGER)<? RETURNING value`).bind(leaseKey,leaseValue,Date.now()).first();
   if(lease?.value!==leaseValue)return {deferred:true};
   try{translated=preserveNumbers(value,await modelCall(env,value,source,target));
    await env.DB.prepare('INSERT OR IGNORE INTO translation_cache(source_hash,source_language,language,text,provider) VALUES(?,?,?,?,?)').bind(key,source,target,translated,'cloudflare_m2m100_chunk_v1').run();
   }finally{await env.DB.prepare('DELETE FROM app_settings WHERE key=? AND value=?').bind(leaseKey,leaseValue).run();}
  }out.push(left+translated+right);
 }return {text:out.join('')};
}
