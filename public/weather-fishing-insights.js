// Forecast-based carp angling decision support. Never turns air weather into fish bite probabilities.
(() => {
  const n = v => typeof v === 'number' && Number.isFinite(v) ? v : null;
  const tr = (lang,pl,en) => lang === 'en' ? en : pl;
  const at = (hours,key,index) => n(hours?.[key]?.[index]);
  const fmt = (number,unit='',digits=0) => number===null?'—':number.toFixed(digits)+unit;
  const dateHour = time => typeof time==='string' ? time.slice(11,16) : '—';
  const storm = code => [95,96,99].includes(code);
  const codes=new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
  const complete=s=>codes.has(s.weather_code)&&['wind_speed_10m','wind_gusts_10m','precipitation'].every(k=>n(s[k])!==null&&s[k]>=0);
  const hazard = x => storm(x.weather_code) || (n(x.wind_gusts_10m)!==null && x.wind_gusts_10m>=50) || (n(x.wind_speed_10m)!==null && x.wind_speed_10m>=40);
  const wrap = degrees => ((degrees%360)+360)%360;
  const compass = (deg,lang) => {
    if(deg===null)return '—';
    const names=lang==='en'?['N','NE','E','SE','S','SW','W','NW']:['N','NE','E','SE','S','SW','W','NW'];
    return names[Math.round(wrap(deg)/45)%8]+' ('+Math.round(wrap(deg))+'°)';
  };
  const risk = (s,lang) => {
    if(storm(s.weather_code))return tr(lang,'Burza — przerwij aktywności nad wodą i schroń się w budynku lub zamkniętym samochodzie.','Thunderstorm — stop exposed activities and shelter in a substantial building or enclosed car.');
    if(hazard(s))return tr(lang,'Silny wiatr lub porywy: nie korzystaj z łódki i zabezpiecz obóz; sprawdź lokalne ostrzeżenia.','Strong wind or gusts: avoid boats, secure camp and check local warnings.');
    return null;
  };
  function safety(data,lang='pl'){
    const h=data?.hourly||{},index=Math.max(0,window.DreamConditions?.hourIndex(data)??0);
    const samples=(h.time||[]).slice(index,index+24).map((time,j)=>({time,weather_code:h.weather_code?.[index+j],wind_speed_10m:at(h,'wind_speed_10m',index+j),wind_gusts_10m:at(h,'wind_gusts_10m',index+j),precipitation:at(h,'precipitation',index+j)}));
    const coverage=samples.filter(complete).length;
    const instant=(s,i)=>n(h.time_epoch?.[index+i])!==null?h.time_epoch[index+i]*1000:Date.parse(s.time);
    const continuous=samples.every((s,i)=>Number.isFinite(instant(s,i))&&(!i||instant(s,i)-instant(samples[i-1],i-1)===3600000));
    const known=samples.length===24&&coverage===24&&continuous&&complete(data?.current||{});
    const events=[...(data?.current?[{...data.current,time:tr(lang,'teraz','now')}]:[]),...samples];
    const threats=events.filter(hazard),messages=[];
    for(const type of ['storm','wind']){
      const group=events.filter(s=>type==='storm'?storm(s.weather_code):!storm(s.weather_code)&&hazard(s));
      if(group.length){const times=[...new Set(group.map(s=>typeof s.time==='string'&&s.time.includes('T')?dateHour(s.time):String(s.time??'—')))];messages.push(times.join(', ')+' · '+risk(group[0],lang));}
    }
    const state=threats.length?'DANGER':!known?'UNKNOWN':samples.some(s=>s.wind_gusts_10m>=30||s.precipitation>=5)?'WARNING':'SAFE';
    if(!known)messages.push(tr(lang,'Niepełne dane bezpieczeństwa: ','Incomplete safety data: ')+coverage+'/24 h. '+tr(lang,'Nie można potwierdzić spokojnych warunków.','Calm conditions cannot be confirmed.'));
    return {state,complete:known,coverage,count:samples.length,messages,threats,samples};
  }
  function analyse(data,lang='pl') {
    const assessment=safety(data,lang);
    const hours=data?.hourly||{},idx=window.DreamConditions?.hourIndex(data)??0;
    const total=Array.isArray(hours.time)?hours.time.length:0;
    if(!total)return {available:false,safety:assessment,headline:tr(lang,'Brak prognozy godzinowej.','Hourly forecast unavailable.'),notes:assessment.messages,riskLabel:tr(lang,'Brak danych do oceny zagrożeń','Insufficient hazard data')};
    const forward=Array.from({length:Math.min(24,total-idx)},(_,i)=>idx+i);
    const in12=forward.slice(0,12);
    const samples=forward.map(i=>({i,time:hours.time[i],weather_code:hours.weather_code?.[i],wind_speed_10m:at(hours,'wind_speed_10m',i),wind_gusts_10m:at(hours,'wind_gusts_10m',i),precipitation:at(hours,'precipitation',i)}));
    const pressureNow=at(hours,'pressure_msl',idx)??n(data.current?.pressure_msl);
    const pressureOld=idx>=3?at(hours,'pressure_msl',idx-3):null;
    const pressureNext=at(hours,'pressure_msl',idx+6);
    const delta=pressureOld!==null&&pressureNow!==null?pressureNow-pressureOld:null;
    const futureDelta=pressureNow!==null&&pressureNext!==null?pressureNext-pressureNow:null;
    const temperatures=forward.map(i=>at(hours,'temperature_2m',i)).filter(v=>v!==null);
    const windSpeeds=forward.map(i=>at(hours,'wind_speed_10m',i)).filter(v=>v!==null);
    const gusts=forward.map(i=>at(hours,'wind_gusts_10m',i)).filter(v=>v!==null);
    const rain12=in12.map(i=>at(hours,'precipitation',i));
    const totalRain=rain12.length&&rain12.every(v=>v!==null)?rain12.reduce((sum,x)=>sum+x,0):null;
    const probabilities=in12.map(i=>at(hours,'precipitation_probability',i)).filter(v=>v!==null);
    const probability=probabilities.length?Math.max(...probabilities):null;
    const maxWind=windSpeeds.length?Math.max(...windSpeeds):null;
    const maxGust=gusts.length?Math.max(...gusts):null;
    const directionNow=n(data.current?.wind_direction_10m)??at(hours,'wind_direction_10m',idx);
    const directionLater=at(hours,'wind_direction_10m',idx+12);
    const threats=samples.filter(s=>hazard(s));
    const noStorm=assessment.complete&&assessment.state==='SAFE';
    const pressureText=delta===null?tr(lang,'Trend 3 h: brak danych','3 h trend: unavailable'):
      tr(lang,'Ostatnie 3 h: ','Past 3 h: ')+(delta>=0?'+':'')+fmt(delta,' hPa',1);
    const pressureOut=fmt(pressureNow,' hPa')+' · '+pressureText+(futureDelta!==null?tr(lang,' · za 6 h: ',' · in 6 h: ')+(futureDelta>=0?'+':'')+fmt(futureDelta,' hPa',1):'');
    const windOut=tr(lang,'Teraz z ','From ')+compass(directionNow,lang)+
      tr(lang,' · szczyt 24 h: ',' · next 24 h peak: ')+fmt(maxWind,' km/h')+
      tr(lang,', porywy ', ', gusts ')+fmt(maxGust,' km/h')+
      (directionLater!==null?tr(lang,' · kierunek za 12 h: ',' · direction in 12 h: ')+compass(directionLater,lang):'');
    const rainOut=tr(lang,'Suma 12 h: ','Next 12 h total: ')+fmt(totalRain,' mm',1)+
      (probability!==null?tr(lang,' · maks. prawdopodobieństwo w pojedynczej godzinie: ',' · maximum probability in a single hour: ')+fmt(probability,'%',0):'');
    const tempOut=temperatures.length?
      tr(lang,'Powietrze 24 h: ','24 h air: ')+fmt(Math.min(...temperatures),'°C',1)+'–'+fmt(Math.max(...temperatures),'°C',1):
      tr(lang,'Brak zakresu temperatury powietrza.','Air temperature range unavailable.');
    // This is a work/safety window, NOT a prediction of bites.
    let windowStart=null;
    for(let offset=0;offset<Math.min(19,samples.length-2);offset++){
      const span=samples.slice(offset,offset+3);
      if(assessment.complete&&span.every(s=>complete(s)&&
        !hazard(s)&&s.wind_speed_10m<22&&s.wind_gusts_10m<30&&s.precipitation<1.5)){
        windowStart=span[0].time;break;
      }
    }
    const windowText=windowStart?tr(lang,'Spokojniejsze 3 h od ','Calmer 3 h starting ')+dateHour(windowStart):
      tr(lang,'Brak potwierdzonego spokojnego okna 3 h.','No confirmed calm 3 h window.');
    const notes=[...assessment.messages];
    const safetyNote=assessment.messages.length>0;
    if(totalRain!==null&&totalRain>=5)notes.push(tr(lang,'Przewidywane opady: zabezpiecz namiot, zasilanie i przynęty; zweryfikuj lokalne ostrzeżenia.','Rain forecast: secure shelter, power and bait; check local alerts.'));
    if(maxGust!==null&&maxGust>=30&&maxGust<50)notes.push(tr(lang,'Porywy mogą utrudnić wywózkę zestawów i pracę łódki zanętowej. Oceniaj warunki bezpośrednio na wodzie.','Gusts may complicate bait boats and rig placement. Assess actual conditions at the lake.'));
    if(directionNow!==null)notes.push(tr(lang,'Wiatr wieje z ','Wind blows from ')+compass(directionNow,lang)+tr(lang,'. Sprawdź falowanie oraz brzeg, na który wieje; kierunek wiatru sam nie wskazuje miejsca karpi.','. Check surface waves and the windward bank; wind direction alone does not locate carp.'));
    if(delta!==null&&Math.abs(delta)>=2)notes.push(tr(lang,'Ciśnienie zmieniło się o ','Pressure changed by ')+fmt(delta,' hPa',1)+tr(lang,' w 3 h. Obserwuj reakcję ryb zamiast traktować zmianę jako pewną prognozę brań.',' over 3 h. Observe fish response rather than treating pressure as a bite predictor.'));
    if(temperatures.length&&Math.max(...temperatures)-Math.min(...temperatures)>=6)notes.push(tr(lang,'Duże dobowe wahanie temperatury POWIETRZA. Nie zakładaj takiej samej zmiany temperatury głębokiej wody.','Large AIR temperature range. Do not assume the deep-water temperature changes by the same amount.'));
    notes.push(tr(lang,'Przed zmianą miejsca sprawdź oznaki żerowania, echosondę i prezentację zestawu; mierz temperaturę wody, jeśli masz sprzęt.','Before moving rigs, check feeding signs, sonar and rig presentation; measure water temperature if equipped.'));
    if(!safetyNote&&noStorm&&notes.length<3)notes.unshift(tr(lang,'Brak wykrytych skrajnych warunków w 24 h, ale sprawdzaj bieżącą pogodę i ostrzeżenia.','No extreme conditions identified in the next 24 h; keep checking live weather and warnings.'));
    const headline=assessment.state==='DANGER'?tr(lang,'Uwaga: ryzyko pogodowe w ciągu 24 h','Warning: weather hazard within 24 h'):
      !assessment.complete?tr(lang,'Niepełna prognoza — bezpieczeństwo niepotwierdzone','Incomplete forecast — safety unknown'):
      maxGust!==null&&maxGust>=30?tr(lang,'Najważniejszy czynnik: porywy wiatru','Key issue: wind gusts'):
      totalRain!==null&&totalRain>=5?tr(lang,'Najważniejszy czynnik: opady','Key issue: rainfall'):
      tr(lang,'Analiza 24 h: obserwacja ryb + bezpieczna obsługa zestawów','24 h analysis: fish observations + safe rig handling');
    return {available:true,safety:assessment,headline,pressure:pressureOut,wind:windOut,rain:rainOut,air:tempOut,window:windowText,notes,
      pressureShort:delta===null?'—':(delta>=0?'+':'')+fmt(delta,' hPa',1),
      windowShort:windowStart?dateHour(windowStart):'—',
      riskLabel:assessment.state==='DANGER'?tr(lang,'Zagrożenie pogodowe','Weather hazard'):!assessment.complete?tr(lang,'Brak danych do oceny zagrożeń','Insufficient hazard data'):maxGust!==null&&maxGust>=30?tr(lang,'Silne porywy','Strong gusts'):tr(lang,'Brak alarmu w prognozie','No forecast hazard'),
      shortTip:assessment.state==='UNKNOWN'?tr(lang,'Sprawdź ostrzeżenia','Check warnings'):assessment.state==='DANGER'?tr(lang,'Bezpieczeństwo','Safety first'):maxGust!==null&&maxGust>=30?tr(lang,'Kontroluj wiatr','Check wind'):tr(lang,'Obserwuj wodę','Observe the water'),
      limitations:tr(lang,'Brak pomiarów temperatury wody, głębokości warstw i danych o żerowaniu. To analiza pogody i planu działań, NIE prognoza brań ani procent szansy na rybę. Faza Księżyca jest informacyjna.','No measured water temperature, water-layer depths or feeding data. This is weather-based planning, NOT a bite forecast or catch probability. Moon phase is informational.'),
      count:forward.length,threatCount:threats.length};
  }
  function render(data,lang){
    const report=analyse(data,lang);
    const targets={'carp-weather-headline':report.headline,'carp-pressure':report.pressure,'carp-wind':report.wind,
      'carp-rain':report.rain,'carp-air':report.air,'carp-window':report.window,'carp-limitations':report.limitations};
    for(const [id,txt] of Object.entries(targets)){const el=document.getElementById(id);if(el)el.textContent=txt||'—';}
    const list=document.getElementById('carp-weather-actions');
    if(list){list.replaceChildren();const extra=document.getElementById('carp-weather-more-actions');extra?.replaceChildren();(report.notes||[]).forEach((note,i)=>{const li=document.createElement('li');li.textContent=note;(i>=3&&extra?extra:list).append(li);});if(extra?.parentElement)extra.parentElement.hidden=!extra.children.length;}
    return report;
  }
  window.DreamCarpWeather={analyse,render,safety};
})();
