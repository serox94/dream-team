// Versioned heuristic; coefficients are hypotheses, never calibrated catch probabilities.
((root)=>{
 const VERSION='carp-conditions-2.0.0',finite=v=>typeof v==='number'&&Number.isFinite(v),clamp=(v,a=-1,b=1)=>Math.max(a,Math.min(b,v));
 const critical=['temperature_2m','pressure_msl','cloud_cover','wind_speed_10m','wind_gusts_10m','precipitation','weather_code'];
 const codes=new Set([0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,99]);
 const at=(h,k,i)=>finite(h[k]?.[i])?h[k][i]:null;
 function waterFactor(m,epoch){
  if(!m||!finite(m.temperatureC)||!finite(m.depthM))return {value:0,weight:0,ageHours:null};
  const age=(epoch*1000-Date.parse(m.measuredAt))/3600000;
  if(!finite(age)||age<0||age>=24)return {value:0,weight:0,ageHours:age};
  // Conservative thermal context: cold and unusually warm water lower the index.
  // No positive optimum is inferred from growth studies; no temperature extrapolation.
  const thermal=m.temperatureC<10?clamp((m.temperatureC-10)/10):m.temperatureC>26?clamp((26-m.temperatureC)/8):0;
  const weight=10*(m.depthM===0?0.5:0.75)*Math.max(0,1-age/24);
  return {value:thermal*weight,weight,ageHours:age};
 }
 function trends(h,i){const now=at(h,'pressure_msl',i),out={};for(const k of [3,6,12]){const before=at(h,'pressure_msl',i-k),after=at(h,'pressure_msl',i+k);const contiguous=(j)=>j>=0&&j<h.time_epoch.length&&h.time_epoch[i]-h.time_epoch[j]===(i-j)*3600;out['past'+k]=now!==null&&before!==null&&contiguous(i-k)?now-before:null;out['next'+k]=now!==null&&after!==null&&contiguous(i+k)?after-now:null;}return out;}
 function hour(data,i,{measurement,solar}={}){
  const h=data.hourly,epoch=h.time_epoch?.[i],s=Object.fromEntries(critical.map(k=>[k,at(h,k,i)]));
  const missing=critical.filter(k=>s[k]===null);if(!codes.has(s.weather_code)&&!missing.includes('weather_code'))missing.push('weather_code');
  if(s.wind_speed_10m<0||s.wind_gusts_10m<0||s.precipitation<0||s.cloud_cover<0||s.cloud_cover>100)missing.push('range');
  const danger=[95,96,99].includes(s.weather_code)||s.wind_speed_10m>=40||s.wind_gusts_10m>=50||s.precipitation>=15||s.temperature_2m>=35||s.temperature_2m<=-15;
  const stale=Boolean(data.dreamteam?.stale)||data.dreamteam?.offline===true;
  const safety=danger?'DANGER':missing.length||stale?'UNKNOWN':s.wind_gusts_10m>=30||s.precipitation>=5?'WARNING':'SAFE';
  const t=trends(h,i);let altitude=solar?.(epoch);if(!finite(altitude)){missing.push('sun_position');altitude=null;}
  const L=altitude===null?0:clamp(1-Math.abs(altitude-0.04)/0.38);
  const month=Number(h.time[i]?.slice(5,7)),cold=[11,12,1,2,3].includes(month),C=s.cloud_cover===null?0:clamp((s.cloud_cover-50)/50)*(cold?-0.4:1);
  // Pressure interacts with cloud/wind/air changes once in F, never separate front bonuses.
  const delta=t.past3??(t.next3===null?null:-t.next3),cloudOld=at(h,'cloud_cover',i-3),windOld=at(h,'wind_speed_10m',i-3),airOld=at(h,'temperature_2m',i-3);
  const confirm=[cloudOld===null?0:clamp((s.cloud_cover-cloudOld)/40),windOld===null?0:clamp((s.wind_speed_10m-windOld)/12),airOld===null?0:clamp((s.temperature_2m-airOld)/6)].reduce((a,b)=>a+b,0)/3;
  const F=delta===null?0:clamp(-delta/3)*confirm;
  const W=s.wind_speed_10m===null?0:clamp(s.wind_speed_10m<3?-0.2:s.wind_speed_10m<=18?0.4:-(s.wind_speed_10m-18)/20)*(cold?0.5:1);
  const water=waterFactor(measurement,epoch),components={light:12*L,cloud:8*C,weatherChange:6*F,wind:4*W,water:water.value,moon:0,habitat:0,localObservations:0};
  const raw=50+Object.values(components).reduce((a,b)=>a+b,0),score=missing.length||!finite(epoch)?null:Math.round(clamp(raw,0,100));
  return {i,epoch,time:h.time[i],score,raw,components,trends:t,water,safety,missing,eligible:score!==null&&!['DANGER','UNKNOWN'].includes(safety),night:altitude!==null&&altitude< -0.1};
 }
 function windows(hours){const result=[];for(let i=0;i<=hours.length-3;i++){const span=hours.slice(i,i+3);if(span.every((h,j)=>h.eligible&&(!j||h.epoch-span[j-1].epoch===3600))){result.push({start:span[0].epoch,end:span[2].epoch+3600,score:Math.round(span.reduce((s,h)=>s+h.score,0)/3),hours:span});}}return result.sort((a,b)=>b.score-a.score||a.start-b.start);}
 function calculate(data,options={}){const start=root.DreamConditions?.hourIndex(data)??Math.max(0,data.hourly.time_epoch.findLastIndex(t=>t<=data.current.time_epoch));const hours=Array.from({length:Math.min(48,data.hourly.time.length-start)},(_,n)=>hour(data,start+n,options));const ranked=windows(hours),chosen=[];for(const item of ranked)if(chosen.every(w=>item.end<=w.start||item.start>=w.end))chosen.push(item);return {version:VERSION,hours,windows:ranked,nonOverlapping:chosen,best:ranked[0]??null,next:[...ranked].filter(w=>w.score>=55).sort((a,b)=>a.start-b.start)[0]??null,complete:hours.filter(h=>h.score!==null).length,biologicalConfidence:'low'};}
 root.DreamCarpIndex={VERSION,hour,calculate,trends,waterFactor,windows};
})(globalThis);
