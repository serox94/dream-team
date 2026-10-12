// Practical shore/camp constraints, not a statistical model of carp bites.
(() => {
 const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
 const text={
  "good": [
    "Łatwiejsze warunki na brzegu",
    "Easier shore conditions"
  ],
  "hard": [
    "Utrudnione warunki na brzegu",
    "Challenging shore conditions"
  ],
  "danger": [
    "Zagrożenie pogodowe",
    "Weather hazard"
  ],
  "unknown": [
    "Brak danych do oceny",
    "Insufficient data"
  ],
  "dry": [
    "Brak opadu w odczycie — łatwiejsza obsługa sprzętu.",
    "No precipitation in the reading — easier gear handling."
  ],
  "windOk": [
    "Niewielki wiatr i porywy — łatwiejsza kontrola zestawów.",
    "Light wind and gusts — easier rig control."
  ],
  "wet": [
    "Opad utrudnia obsługę sprzętu; osłoń elektronikę.",
    "Precipitation complicates gear handling; cover electronics."
  ],
  "rainHard": [
    "Silniejszy opad utrudnia zasiadkę; przygotuj osłonę.",
    "Heavier precipitation complicates the session; prepare shelter."
  ],
  "windHard": [
    "Wiatr lub porywy utrudniają kontrolę zestawów i obozowanie.",
    "Wind or gusts complicate rig control and camping."
  ],
  "windDanger": [
    "Silny wiatr lub porywy: unikaj wywożenia zestawów i sprawdź lokalne ostrzeżenia.",
    "Strong wind or gusts: avoid boating rigs out and check local warnings."
  ],
  "storm": [
    "Prognoza wskazuje burzę. Przerwij łowienie na otwartym terenie i wodzie; szukaj bezpiecznego budynku lub zamkniętego samochodu.",
    "Thunderstorm forecast. Stop exposed fishing; seek a safe building or enclosed vehicle."
  ],
  "cold": [
    "Mróz utrudnia obsługę sprzętu i zwiększa ryzyko wychłodzenia.",
    "Freezing air complicates gear handling and increases cold exposure."
  ],
  "heat": [
    "Upał: zabezpiecz siebie przed przegrzaniem i zmierz temperaturę oraz tlen wody.",
    "Hot air: protect yourself from heat and measure water temperature and oxygen."
  ],
  "fog": [
    "Mgła: ograniczona widoczność utrudnia orientację nad wodą.",
    "Fog: reduced visibility complicates navigation near water."
  ],
  "extreme": [
    "Ekstremalne warunki: ogranicz narażenie i sprawdź lokalne ostrzeżenia.",
    "Extreme conditions: limit exposure and check local warnings."
  ],
  "missing": [
    "Niepełny odczyt meteorologiczny; brakujących danych nie zastępujemy zerem.",
    "Incomplete meteorological reading; missing data is never replaced with zero."
  ],
  "uncertainty": [
    "Niepewność brań: wysoka. Brak pomiarów temperatury i tlenu wody oraz modelu dopasowanego do tego łowiska.",
    "Bite uncertainty: high. No measured water temperature or oxygen and no model fitted to this lake."
  ],
  "explanation": [
    "To orientacyjna ocena komfortu i ograniczeń zasiadki. Wiatr, ciśnienie, faza Księżyca i temperatura powietrza nie określają tu szansy brania.",
    "This is a practical assessment of comfort and constraints. Wind, pressure, moon phase and air temperature do not determine bite likelihood here."
  ],
  "suggestion": [
    "Obserwuj ryby, sprawdź prezentację zestawu i mierz warunki w wodzie. Zmieniaj jedną rzecz naraz; dawkę zanęty dopasuj do zaobserwowanego żerowania.",
    "Observe fish, check rig presentation and measure water conditions. Change one thing at a time; match feed to observed feeding."
  ],
  "sourceRule": [
    "Progi wiatru, opadu i temperatury to ostrożne reguły praktyczne, zależne od stanowiska i sprzętu. Nie są modelem naukowym ani zamiennikiem lokalnych ostrzeżeń.",
    "Wind, rain and temperature thresholds are cautious practical rules that depend on the swim and equipment. They are not a scientific model or a substitute for local warnings."
  ]
};
 const say=(key,lang)=>text[key][lang==='en'?1:0];
 function assess(snapshot={},lang='pl'){
  const range=(v,min,max)=>{const n=finite(v);return n!==null&&n>=min&&n<=max?n:null;};
  const temp=range(snapshot.temperature_2m,-80,60),wind=range(snapshot.wind_speed_10m,0,300),gusts=range(snapshot.wind_gusts_10m,0,400),rain=range(snapshot.precipitation,0,500),code=[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99].includes(snapshot.weather_code)?snapshot.weather_code:null;
  const missing=[['temperature_2m',temp],['wind_speed_10m',wind],['wind_gusts_10m',gusts],['precipitation',rain],['weather_code',code]].filter(([,v])=>v===null).map(([key])=>key);
  const positive=[],negative=[];let grade=2;const storm=[95,96,99].includes(code),strong=(wind!==null&&wind>=40)||(gusts!==null&&gusts>=50);
  if(rain===0)positive.push(say('dry',lang));else if(rain!==null&&rain>0)negative.push(say('wet',lang));
  if(wind!==null&&gusts!==null&&wind<20&&gusts<30)positive.push(say('windOk',lang));
  if((wind!==null&&wind>=25)||(gusts!==null&&gusts>=35)){grade=1;negative.push(say('windHard',lang));}if(rain!==null&&rain>2){grade=1;negative.push(say('rainHard',lang));}
  if(temp!==null&&(temp<0||temp>=30)){grade=Math.min(grade,1);negative.push(say(temp<0?'cold':'heat',lang));}
  if([45,48].includes(code)){grade=Math.min(grade,1);negative.push(say('fog',lang));}
  if((temp!==null&&(temp<=-15||temp>=35))||(rain!==null&&rain>=15)){grade=0;negative.push(say('extreme',lang));}
  if(strong){grade=0;negative.push(say('windDanger',lang));}if(storm){grade=0;negative.push(say('storm',lang));}
  if(missing.length){negative.push(say('missing',lang));if(grade!==0)grade=null;}
  return {grade,label:say(grade===null?'unknown':grade===0?'danger':grade===1?'hard':'good',lang),positive,negative,missing,uncertainty:'high',uncertaintyText:say('uncertainty',lang),explanation:say('explanation',lang),suggestion:storm?say('storm',lang):strong?say('windDanger',lang):grade===0?say('extreme',lang):say('suggestion',lang),rule:say('sourceRule',lang)};
 }
 function trend(p,index){if(index<3)return null;const before=finite(p?.[index-3]),now=finite(p?.[index]);if(before===null||now===null)return null;const delta=now-before;return {delta,direction:delta>2?'rośnie':delta< -2?'spada':'stabilne'};}
 const snapshot=(hourly,index)=>Object.fromEntries(['temperature_2m','wind_speed_10m','wind_gusts_10m','precipitation','weather_code'].map(key=>[key,hourly[key]?.[index]]));
 function hourIndex(data){const epochs=data.hourly?.time_epoch;if(Array.isArray(epochs)&&finite(data.current?.time_epoch)!==null){let found=0;for(let i=0;i<epochs.length&&epochs[i]<=data.current.time_epoch;i++)found=i;return found;}const times=data.hourly?.time||[],hour=data.current?.time?.slice(0,13)+':00',exact=times.indexOf(hour);if(exact>=0)return exact;const next=times.findIndex(t=>t>=hour);return next<0?times.length-1:next;}
 window.DreamConditions={assess,trend,finite,snapshot,hourIndex,label:(grade,lang)=>say(grade===null?'unknown':grade===0?'danger':grade===1?'hard':'good',lang),text};
})();
