import {profile} from './lake-research.js';
import {weatherForTrip} from './weather.js';
import {InputError} from './validation.js';

const present=v=>v!==null&&v!==undefined&&String(v).trim()!=='';
const str=v=>present(v)?String(v).trim():'';
const lower=v=>str(v).toLocaleLowerCase('pl');
const deny=v=>/(zabronion|zakazan|niedozwolon|nie wolno|nie można|prohibited|forbidden|not allowed|interdit|verboten|verboden)/i.test(v);
const allow=v=>/(dozwolon|można|allowed|permitted|autorisé|erlaubt|toegestaan)/i.test(v);
const label={depth:'Głębokość',bottom:'Dno',weed:'Zielsko',rules:'Regulamin',rods:'Liczba wędek',bait_boats:'Łódka zanętowa',leadcore:'Leadcore',boats:'Środki pływające'};
const legacy={depth:['depth','pegPrimaryDepthWindow'],bottom:['bottom','pegBottom'],weed:['weed'],rules:['rulesText'],rods:['rods'],bait_boats:['baitBoat'],leadcore:['leadcore'],boats:['boat']};
const guide=(id)=>({id,url:`/pages/encyklopedia.html#${id}`});

export function generateTripAdvice({trip,lake,researchedFacts=[],weather=null}){
  const lakeFacts=lake.facts||{},tripFacts=trip.facts||{},facts=[],missing=[],resolved={};
  const add=(field,value,origin,url,confidence)=>{if(!present(value))return;facts.push({field,label:label[field]||field,value:str(value),origin,url:url||null,confidence});};
  add('trip',trip.name,'Wyjazd');add('dates',trip.start&&trip.end?`${trip.start.slice(0,10)} – ${trip.end.slice(0,10)}`:trip.start?.slice(0,10),'Wyjazd');
  add('lake',lake.name,'Profil łowiska',lake.sourceUrl);add('country',lake.country||trip.country,'Profil łowiska',lake.sourceUrl);
  for(const field of Object.keys(legacy)){
    const match=researchedFacts.find(f=>f.field===field&&f.status==='potwierdzone'&&present(f.value));
    const conflict=researchedFacts.some(f=>f.field===field&&f.status==='sprzeczne');
    const key=legacy[field].find(k=>present(lakeFacts[k])||present(tripFacts[k]));
    const value=match?.value||(!conflict&&key&&(present(tripFacts[key])?tripFacts[key]:lakeFacts[key]));
    if(value){resolved[field]=str(value);add(field,value,match?'Research: '+(match.sourceName||'źródło'):(present(tripFacts[key])?'Opis wyjazdu':'Profil łowiska'),match?.url||lake.sourceUrl,match?'źródłowe':'opis profilu — sprawdź aktualność');}
    else if(conflict)missing.push(`${label[field]} — sprzeczne źródła, sprawdź regulamin`);
  }
  if(trip.peg)add('peg',trip.peg,'Wyjazd');
  const forecast=weather?.daily?.time?.indexOf(trip.start?.slice(0,10));
  const forecastTemp=forecast>=0?((weather.daily.temperature_2m_min?.[forecast]+weather.daily.temperature_2m_max?.[forecast])/2):null;
  if(Number.isFinite(forecastTemp))add('weather',`Prognoza na początek: ${weather.daily.temperature_2m_min[forecast]}–${weather.daily.temperature_2m_max[forecast]}°C, wiatr do ${weather.daily.wind_speed_10m_max?.[forecast]??'?'} km/h`,'Prognoza Open-Meteo');
  if(!trip.start||!trip.end)missing.push('termin wyjazdu');
  if(!lake.country&&!trip.country)missing.push('kraj');
  for(const field of ['depth','bottom','weed','rules','rods','bait_boats'])if(!resolved[field]&&!missing.some(x=>x.startsWith(label[field])))missing.push(label[field].toLowerCase());
  if(!Number.isFinite(forecastTemp))missing.push('prognoza na termin (lub GPS / termin poza 7 dniami)');
  const bottom=lower(resolved.bottom+' '+tripFacts.pegBottom),weed=lower(resolved.weed),depth=lower(resolved.depth),rules=lower(resolved.rules),boat=lower(resolved.bait_boats),rods=lower(resolved.rods);
  const cold=Number.isFinite(forecastTemp)?forecastTemp<12:[11,12,1,2,3,4].includes(Number(trip.start?.slice(5,7)));
  const soft=/muł|mul|osad|silt|vase|schlamm/.test(bottom),hard=/żwir|zwir|tward|gravel|gravier|kies|hart/.test(bottom),vegetated=/gęst|dużo|wysok|dense|strong|stark/.test(weed),deep=/\b(?:1[5-9]|2\d|3\d)\s*m\b/.test(depth);
  const suggestions=[];
  const put=(name,value,basis,reference)=>suggestions.push({name,value,basis,reference:reference&&guide(({kulki:'przynety',kolor:'kolory','brak-bran':'problemy'})[reference]||reference)});
  put('Punkt startowy',cold?'Szukaj oznak ryb i sprawdź dwie głębokości; zacznij od małej porcji, nie nęć szeroko.':'Sprawdź ruch ryb, tlen i strefę zmiany dna; połóż kontrolny zestaw na potwierdzonym miejscu.',cold?'Termin / temperatura jako wskazówka; rzeczywista temperatura wody nieznana':'Profil i obserwacja na miejscu','temperatura');
  put('Przynęta i profil smakowy',cold?'Mały wafter lub bottom; porównaj neutralny/słodki z rybnym na dwóch zestawach.':'Bottom lub wafter; porównaj fishmeal/krill z prostym słodkim albo owocowym.', 'Punkt startowy z Encyklopedii, testuj reakcję ryb','kulki');
  put('Kolor',cold?'Naturalny jako kontrola, jeden jaśniejszy akcent tylko do porównania.':'Naturalny na czystej plamie; jeden kontrastowy akcent, jeśli potrzebna widoczność.','Warunki widoczności i reakcja ryb niepotwierdzone','kolor');
  put('Prezentacja i rig',soft||vegetated?'Lekki wafter albo niski pop-up; sprawdź, czy ciężarek i przypon nie toną w osadzie/zielsku. Ronnie/Spinner tylko przy bezpiecznej prezentacji.':hard?'Bottom/wafter na sprawdzonym twardym dnie; prosty German lub Slip D, sprawdź ostrość haka.':'Wafter na bezpiecznym montażu jako kontrola; dobierz rig po sprawdzeniu dna.',resolved.bottom||resolved.weed?'Dno / zielsko z profilu':'Dno nieznane — wybór warunkowy','dno');
  put('Nęcenie i ilość',cold?'Start: kilka kulek lub małe PVA przy zestawie; zwiększ dopiero po oznakach żerowania.':'Start: mała punktowa porcja (np. 0,2–0,5 kg na spot), oceniaj odpowiedź przed dokładaniem.', 'Orientacyjna porcja, zależy od obsady, regulaminu i aktywności','necenie');
  put('Miejsca',vegetated?'Czyste oczko lub krawędź zielska z bezpieczną drogą holu.':hard&&soft?'Granica żwiru i mułu, po potwierdzeniu echem i ciężarkiem.':hard?'Krawędź twardej plamy lub przejście głębokości.':deep?'Krawędź spadu i sąsiednia płytsza półka, porównane na dwóch przejazdach.':'Najpierw sprawdź dno, spad i oznaki ryb; bez danych o dnie nie wskazuj punktu.',resolved.bottom||resolved.weed||resolved.depth?'Profil łowiska; potwierdź na miejscu':'Brak danych o strukturze','dno');
  put('Plan B', 'Po 12 godzinach bez oznak ryb zmień jeden parametr: miejsce/głębokość albo wielkość porcji; drugi zestaw pozostaw jako kontrolę. Po zmianie pogody ponów obserwację.', 'Encyklopedia: brak brań i zmiana pogody','brak-bran');
  const restrictions=[];
  for(const field of ['bait_boats','boats','leadcore','rules'])if(resolved[field]&&deny(resolved[field]))restrictions.push(`${label[field]}: ${resolved[field]}`);
  if(!resolved.rules)restrictions.push('Regulamin niezweryfikowany: przed użyciem łódki, montażu i zanęty sprawdź aktualne zasady.');
  if(resolved.bait_boats&&!deny(boat)&&!allow(boat))restrictions.push('Status łódki jest niejednoznaczny — potwierdź przed użyciem.');
  if(resolved.rods&&!/\d/.test(rods))restrictions.push('Liczba wędek nie jest jednoznaczna — potwierdź limit przed rozstawieniem.');
  put('Ograniczenia',restrictions.length?restrictions.join(' '):`Nie wykryto jednoznacznego zakazu w dostępnych polach; sprawdź pełny aktualny regulamin${resolved.rods?' i limit wędek ('+resolved.rods+')':''}.`,'Tylko jawne zapisy; nie wnioskuj o zezwoleniu z braku danych');
  return {tripId:trip.id,tripName:trip.name,facts,suggestions,missing:[...new Set(missing)],incomplete:missing.length>0,weatherAvailable:Number.isFinite(forecastTemp),disclaimer:'To punkt startowy do sprawdzenia nad wodą, nie gwarancja brań. Opis profilu i prognoza nie zastępują aktualnego regulaminu.'};
}

export async function handleTripAdvice(env,tripId){
  const trip=await env.DB.prepare('SELECT id,name,country,start_at start,end_at end,peg,lake_id lakeId,facts_json factsJson FROM trips WHERE id=?').bind(tripId).first();
  if(!trip)throw new InputError('Nie znaleziono wyjazdu.',404);
  const data=await profile(env,trip.lakeId);
  let weather=null;
  const days=trip.start?Math.floor((Date.parse(trip.start)-Date.now())/86400000):Infinity;
  if(days>=-1&&days<=6&&data.lake.latitude!=null&&data.lake.longitude!=null){try{weather=await weatherForTrip(env,tripId);}catch{ /* Prognoza jest opcjonalna. */ }}
  let tripFacts={};try{tripFacts=JSON.parse(trip.factsJson||'{}');}catch{}
  return generateTripAdvice({trip:{...trip,facts:tripFacts},lake:data.lake,researchedFacts:data.facts,weather});
}
