export const PARSER_VERSION='2026-10-22-v6';
// Conservative, evidence-preserving rules. No model calls and no historical rewrites.
export const concepts={
 rods:['Wędki','Rods',/\brods?\b|hengels?|ruten|cannes|wędk/iu],bait_boats:['Łódki zanętowe','Bait boats',/bait\s*boats?|feeding\s*boats?|voerboten|futterboot|bateaux? amorceurs?|łódk.{0,12}zanęt/iu],
 boats:['Łodzie','Boats',/\bboats?\b|\bboot\b|boten|bateaux|łodzi|łódź/iu],leadcore:['Leadcore','Leadcore',/leadcore/iu],hooks:['Haki','Hooks',/hooks?|haken|hameçons|haczy/iu],rigs:['Zestawy i leadery','Rigs and leaders',/rigs?|leaders?|shock.?leader|zestaw|przypon|vorfach|montage/iu],
 net:['Podbierak','Landing net',/landing\s*nets?|schepnet|kescher|épuisette|podbierak/iu],mat:['Mata','Unhooking mat',/unhooking\s*mat|onthaakmat|ab.?hakmatte|matelas|mat[ayę] (?:karpi|do)/iu],sling:['Sling i przechowywanie','Sling and retention',/sling|storage\s*bag|retention|zak[ -]?do|worek|worków/iu],disinfectant:['Dezynfekcja ran','Wound disinfectant',/disinfect|antisept|wound|desinf|dezynfek|ontsmet/iu],
 lifejacket:['Kamizelka ratunkowa','Life jacket',/life\s*jacket|reddingsvest|schwimmweste|gilet de sauvetage|kamizelk/iu],distance:['Dystans łowienia','Fishing distance',/further|distance|afstand|entfernung|odległo|dystans/iu],bait:['Przynęty i nęcenie','Bait and feeding',/particles?|tiger\s*nuts?|peanuts?|baitfish|live bait|dead bait|boilies|zanęt|orzech|partikel|appât/iu],
 fishcare:['Ochrona ryb','Fish care',/sturgeon|carp.{0,30}(?:unhook|weigh|photograph)|unhook.{0,30}carp|catch.{0,5}release|jesiotr|ochron.{0,8}ryb/iu],safety:['Bezpieczeństwo','Safety',/fire|barbecue|\bbbq\b|bucket|safety|veilig|feuer|ogień|bezpieczeń/iu],camp:['Obóz','Camp',/tents?|bivv|namiot|zelt|tente/iu],
 depth:['Głębokość','Depth',/depth|deep|diepte|tiefe|profond|głęboko/iu],area:['Powierzchnia (z datą źródła)','Area (source date)',/hectares?|\bha\b|powierzch|oppervlakte|fläche/iu],bottom:['Dno','Bottom',/bottom|lake bed|bodem|fond du|dno/iu],weed:['Roślinność','Weed',/weed|waterplant|herbier|kraut|roślinno/iu],fish:['Ryby i rekordy (z datą źródła)','Fish and records (source date)',/carp|sturgeon|catfish|pike|karp|jesiotr|steur|meerval|record/iu],pegs:['Stanowiska','Swims',/swims?|pegs?|stekken?|postes?|stanowisk/iu],
 electricity:['Prąd','Electricity',/electricity|electrical|\bpower\b|stroom|elektriciteit|électricité|strom|prąd/iu],toilets:['Toalety','Toilets',/toilets?|\bwc\b|toilettes/iu],showers:['Prysznice','Showers',/showers?|douche|dusche|prysznic/iu],parking:['Parking','Parking',/parking|parkeren|parkplatz|stationnement/iu],water:['Woda pitna','Drinking water',/drinking water|drinkwater|trinkwasser|eau potable|wod[ay] pitn/iu],shop:['Sklep','Shop',/\bshop\b|winkel|magasin|geschäft|sklep/iu],rental:['Wynajem','Rental',/rental|renting|hire|huur|location de|wynajem/iu],arrival:['Przyjazd / wyjazd','Arrival / departure',/arrival|departure|aankomst|vertrek|anreise|abreise|arrivée|départ|przyjazd|wyjazd/iu],contact:['Kontakt i dojazd','Contact and access',/\baddress\b|adres|contact|telephone|e-mail|email|@|postal|route/iu]
};
const prohibited=/prohibit|forbidden|not permitted|not allowed|not allow|not use|no (?:own|live|petrol|diesel|storage)|strictly (?:not|forbid)|verboden|niet toegestaan|interdit|verboten|nicht erlaubt|zakaz|zabronion|nie wolno/iu;
const mandatory=/compulsory|mandatory|required|must|obligat|verplicht|pflicht|obowiązk|wymagan|należy/iu;
const allowed=/allowed|permitted|may (?:be|use)|can (?:be|use)|toegestaan|erlaubt|autorisé|dozwolon|można/iu;
export function classifyRule(text){
 const optional=/not (?:required|mandatory|compulsory)|niet verplicht|nicht erforderlich|nie (?:jest )?wymagan|non obligatoire/iu.test(text);
 const max=/not (?:(?:allowed (?:to fish )?)|fish )?(?:further|more) than|maximum|maximaal|maksymaln/iu.test(text);
 const base=optional?'PERMITTED':max?'PERMITTED':prohibited.test(text)?'PROHIBITED':mandatory.test(text)?'REQUIRED':allowed.test(text)?'PERMITTED':'UNKNOWN';
 const affirmative=text.replace(/not (?:allowed|permitted)|niet toegestaan|nicht erlaubt|nie (?:jest )?dozwolon\w*/giu,'');
 const mixed=prohibited.test(text)&&allowed.test(affirmative);
 const conditional=/\b(?:if|unless|except|only|when|provided that)\b|alleen|tenzij|nur|wenn|sauf|uniquement|seulement|tylko|jeżeli|pod warunkiem/iu.test(text)||max;
 return {rule:mixed||conditional&&base!=='UNKNOWN'?'CONDITIONAL':base,base:mixed?'UNKNOWN':base,optional,conditional:conditional||mixed};
}
export function sourceScope(url,confirmedUrl){
 try{const a=new URL(url),b=new URL(confirmedUrl);if(a.protocol!=='https:'||a.hostname!==b.hostname||a.username||a.password||a.port)return 'reject';const p=decodeURIComponent(a.pathname).toLowerCase(),c=decodeURIComponent(b.pathname).toLowerCase();
 if(/lagoon/.test(p)!==/lagoon/.test(c)&&/lagoon|adventure-lake/.test(p))return 'reject';
 const water=c.match(/(?:lake|lac|plaine|pond)[-_ ]?(\d+)/);if(water&&new RegExp('(?:lake|lac|plaine|pond)[-_ ]?(?!'+water[1]+')(\\d+)').test(p))return 'reject';
 return /contact|plattegrond|map|route/.test(p)?'site':'lake';}catch{return 'reject';}
}
export function discoverUrls(content,confirmedUrl){
 const links=[...String(content).matchAll(/\]\((https:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g)].map(m=>m[1]);
 const unique=[...new Set(links.map(u=>{try{const x=new URL(u);x.hash='';return x.href;}catch{return '';}}))].filter(u=>u!==confirmedUrl&&sourceScope(u,confirmedUrl)!=='reject'&&!/\.(?:jpg|png|webp|zip|mp4)(?:$|\?)/i.test(u));
 const useful=/reglement|regulamin|rules|regulations|fishing-adventure-lake|plattegrond|map|contact|facilit|voorzien|infrastruct|equipment|ausstatt|ste[kc]|pegs|swims|\.pdf/iu;
 return unique.filter(u=>useful.test(u)).sort((a,b)=>score(b)-score(a)).slice(0,7);
 function score(u){return (/\/en\//.test(u)?8:0)+(/contact/.test(u)?7:0)+(/plattegrond|map/.test(u)?10:0)+(/facilit|voorzien|equipment/.test(u)?12:0)+(/reglement|rules/.test(u)?5:0)+(/\/fishing-adventure-lake\/$/.test(u)?10:0);}
}
const clean=s=>s.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_#>]/g,'').replace(/\s+/g,' ').trim();
export function parseResearch(content,{url,language=null,checkedAt=new Date().toISOString(),scope='lake'}={}){
 const body=String(content).split(/\n#{4,6}\s*fishing adventure\s*\n/i)[0].replace(/^[\s\S]*?(?=^#{1,3} )/m,'');
 const rows=body.split(/\n\s*\n|\n(?=\s*(?:\d+[.)]|[-*] ))/).map(clean).filter(x=>x.length>=20&&x.length<=2200),out=[];
 for(const paragraph of rows){
  // Each numbered rule retains its exception/provided-equipment context.
  if(/adventure lagoon/i.test(paragraph)&&!/fishing adventure lake/i.test(paragraph))continue;
  const sentences=paragraph.length>900?paragraph.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ż])/):[paragraph];
  for(const evidence of sentences){if(evidence.length<20||evidence.length>1200||/^home\s|cookie|privacy policy|all rights reserved/i.test(evidence))continue;
   for(const [field,[pl,en,rx]] of Object.entries(concepts)){
    if(!rx.test(evidence))continue;if(field==='boats'&&concepts.bait_boats[2].test(evidence)&&!/(?:electric motor|petrol|rental|life jacket|manned)/i.test(evidence))continue;
    if(scope==='site'&&!['contact','parking','toilets','showers','shop','water','map'].includes(field))continue;
    const relevant=evidence.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ż])/u).filter(sentence=>rx.test(sentence)).join(' ');
    let c=classifyRule(relevant||evidence),normalized=null;
    if(field==='rods'){const m=evidence.match(/\b(\d+|three|drie|drei|trois|trzy)\s+(?:rods?|hengels?|ruten|cannes|wędki)/iu);if(m)normalized=Number.isFinite(+m[1])?+m[1]:3;}
    if(field==='depth'){const m=evidence.match(/(?:depth|deep|diepte|tiefe|profondeur|głęboko).{0,45}?(\d+(?:[.,]\d+)?)\s*(?:met(?:re|er)s?|m)\b/iu)||evidence.match(/(\d+(?:[.,]\d+)?)\s*m(?:et(?:re|er)s?)?\s*(?:deep|depth|tief|diep)/iu);if(!m)continue;normalized=Number(m[1].replace(',','.'));}
    if(field==='distance'){const m=evidence.match(/(\d+)\s*(?:met(?:re|er)s?|m)\b/iu);if(m)normalized=+m[1];}
    if(field==='area'){const m=evidence.match(/(\d+(?:[.,]\d+)?)\s*(?:hectares?|ha)\b/iu);if(m)normalized=Number(m[1].replace(',','.'));}
    // Navigation titles and gear catalogues are not regulations. Keep descriptive
    // facts only when the sentence contains a concrete value or assertion.
    const ruleField=['rods','bait_boats','boats','leadcore','hooks','rigs','net','mat','sling','disinfectant','lifejacket','distance','bait','fishcare','safety','camp'].includes(field);
    const informative=/\b(?:is|are|has|have|available|provided|supplied|offers?|equipped|open|allowed|prohibited|forbidden|must|required|compulsory|only|up to|maximum|minimum)\b|toegestaan|verboden|verplicht|beschikbaar|aanwezig|erlaubt|verboten|pflicht|vorhanden|autorisé|interdit|obligatoire|disponible|dozwolon|zabronion|obowiązk|dostępn|wynajem|\d/iu.test(relevant);
    if(!informative)continue;
    if(ruleField&&c.rule==='UNKNOWN'&&!/(?:provided|supplied).{0,50}(?:free|gratis)|free of charge/iu.test(evidence))continue;
    if(field==='rods'&&c.base==='UNKNOWN'&&normalized==null)continue;
    const provided=/(?:supplied|provided|available|ter beschikking|bereitgestellt|zapewnia).{0,60}(?:free|gratis|bezpłat)|free of charge/iu.test(evidence);
    const ownership=/\bown\b|eigen|propre|własn/iu.test(evidence)?'own':'unspecified';
    out.push({parserVersion:PARSER_VERSION,field,labelPl:field==='distance'&&c.conditional?'Maksymalny dystans łowienia':pl,labelEn:field==='distance'&&c.conditional?'Maximum fishing distance':en,evidence,sourceLanguage:language||languageFromUrl(url),...c,normalized,swimNumbers:field==='electricity'?electricitySwims(evidence):[],quantityKind:field==='area'&&/added|larger|extra|powiększ|vergroot/i.test(evidence)?'change':'absolute',provided,ownership,scope,verification:'source_supported',checkedAt,url,effectiveYear:(evidence.match(/\b(20\d{2})\b/)||[])[1]||null});
   }
  }
 }
 return [...new Map(out.map(f=>[f.field+'|'+f.evidence.toLowerCase(),f])).values()];
}
function languageFromUrl(url){return url?.match(/\/(en|nl|de|fr|pl)\//)?.[1]||null;}
export function gpsCandidates(content,url){
 const out=[];for(const m of String(content).matchAll(/(?:@|!3d|[?&](?:q|query|ll)=|GPS[:\s]*|coordinates?[:\s]*)(-?\d{1,2}\.\d{4,})(?:[,; ]+|!4d)(-?\d{1,3}\.\d{4,})/gi)){
 const latitude=+m[1],longitude=+m[2];if(Math.abs(latitude)>90||Math.abs(longitude)>180)continue;
 const context=String(content).slice(Math.max(0,m.index-70),m.index+100),kind=/parking|parkeren/i.test(context)?'parking':/reception|receptie|recepcj/i.test(context)?'reception':/lake|meer|jezior/i.test(context)?'lake':'unknown';out.push({latitude,longitude,kind,url,evidence:clean(context),status:'proposed'});
 }return [...new Map(out.map(p=>[p.latitude+','+p.longitude,p])).values()];
}
export function researchGear(facts){return facts.filter(f=>f.base==='REQUIRED'&&!f.optional&&!f.provided&&['disinfectant','lifejacket'].includes(f.field)).map(f=>({label:f.labelPl,labelEn:f.labelEn,reason:f.evidence,sourceUrl:f.url,sourceType:'regulation',conditional:f.conditional}));}

export function electricitySwims(text){const positive=String(text).split(/(?<=[.!?])\s+/u).find(s=>/electricity|power|stroom|prąd/iu.test(s)&&!/not available|no power|geen stroom|brak prądu/iu.test(s)&&/available|beschikbaar|aanwezig|dostępn/iu.test(s));const list=positive?.match(/(?:swims?|pegs?|stekken?|stanowisk\w*)\s*(?:numbers?\s*)?[:#]?\s*(\d{1,3}\b(?:\s*(?:[,;]|\band\b|\ben\b|\bi\b)\s*\d{1,3}\b)*)/iu)?.[1];return list?[...new Set((list.match(/\d+/g)||[]).map(Number))]:[];}
