import { fail } from './validation.js';

const variables = {
  current: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,uv_index',
  hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,precipitation_probability,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,uv_index,is_day,soil_temperature_0cm,soil_moisture_0_to_1cm',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max,sunshine_duration,uv_index_max,sunrise,sunset'
};

function normalizeTimes(data,location){
 const zone=data.timezone;let formatter;try{formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch{fail('Dostawca pogody zwrócił niepełne dane.',502);}
 const wall=value=>{if(value==null)return null;if(typeof value!=='number')return value;const p=Object.fromEntries(formatter.formatToParts(new Date(value*1000)).map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;};
 if(typeof data.current.time==='number'){data.current.time_epoch=data.current.time;data.current.time=wall(data.current.time);}
 if(typeof data.hourly.time[0]==='number'){data.hourly.time_epoch=[...data.hourly.time];data.hourly.time=data.hourly.time.map(wall);}
 // Keep provider calendar dates; convert actual instants with IANA/DST.
 data.daily.time=data.daily.time.map(v=>typeof v==='number'?new Date((v+(data.utc_offset_seconds||0))*1000).toISOString().slice(0,10):v);
 for(const field of ['sunrise','sunset'])if(data.daily[field])data.daily[field]=data.daily[field].map(wall);
 for(const group of ['current_units','hourly_units','daily_units'])if(data[group]){data[group].time='iso8601';if(group!=='daily_units')data[group].time_epoch='unixtime';}
 data.dreamteam={provider:'Open-Meteo',fetchedAt:new Date().toISOString(),requestedCoordinates:location,waterTemperature:null,dissolvedOxygen:null,measurementStatus:'not_measured'};return data;
}

export async function weatherForTrip(env, tripId) {
  if (!tripId) fail('Wymagany tripId.');
  const stored = await env.DB.prepare(`SELECT l.latitude lakeLatitude,l.longitude lakeLongitude,t.latitude tripLatitude,t.longitude tripLongitude FROM trips t LEFT JOIN lakes l ON l.id=t.lake_id
    WHERE t.id=?`).bind(tripId).first();
  if (!stored) fail('Nie znaleziono wyjazdu.',404);
  const lakePresent=stored.lakeLatitude!=null||stored.lakeLongitude!=null;
  const location={latitude:lakePresent?stored.lakeLatitude:stored.tripLatitude,longitude:lakePresent?stored.lakeLongitude:stored.tripLongitude};
  if(!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)||Math.abs(location.latitude)>90||Math.abs(location.longitude)>180)fail('Uzupełnij GPS łowiska w Ustawieniach.',422);

  const params = new URLSearchParams({
    latitude:String(location.latitude), longitude:String(location.longitude),
    ...variables,timezone:'auto',forecast_days:'7',past_hours:'3',temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm',timeformat:'unixtime'
  });
  const cache=env.WEATHER_CACHE??globalThis.caches?.default;
  const now=()=>env.WEATHER_NOW?.()??Date.now();
  // Cache public forecast data only, keyed by every provider parameter and environment.
  // No D1 data, cookies, accounts or trip IDs are stored in this cache.
  const key=new Request('https://dream-team.sewerynski00.workers.dev/__weather-cache/v1/'+(env.APP_ENV||'local')+'?'+params);
  let cached=null;
  try{const hit=await cache?.match(key);if(hit){const data=await hit.json(),age=now()-Date.parse(data.dreamteam?.fetchedAt);
   if(age>=0&&age<=1800000&&data.dreamteam?.requestedCoordinates?.latitude===location.latitude&&data.dreamteam?.requestedCoordinates?.longitude===location.longitude&&data.current&&data.hourly?.time?.length&&data.daily?.time?.length)cached={data,age};
  }}catch{/* A cache outage must not prevent a live provider request. */}
  const fromCache=stale=>({...cached.data,dreamteam:{...cached.data.dreamteam,stale,cacheAgeSeconds:Math.floor(cached.age/1000)}});
  if(cached?.age<=300000)return fromCache(false);
  try{
   const data=await fetchForecast(env,params,location);
   data.dreamteam.fetchedAt=new Date(now()).toISOString();data.dreamteam.stale=false;data.dreamteam.cacheAgeSeconds=0;
   try{await cache?.put(key,Response.json(data,{headers:{'cache-control':'public, max-age=1800'}}));}catch{/* Successful live weather remains usable without cache storage. */}
   return data;
  }catch(error){
   // Never present old weather as current. Do not fall back after bad parameters/data.
   if(cached&&error.weatherTransient)return fromCache(true);
   throw error;
  }
}

async function fetchForecast(env,params,location){
  // Two bounded attempts, no retry of quota/invalid requests, within both clients' budgets.
  for (let attempt=0;attempt<2;attempt++) {
    try {
      const response = await (env.WEATHER_FETCH || fetch)(`https://api.open-meteo.com/v1/forecast?${params}`,{
        signal:AbortSignal.timeout(attempt===0?9000:6000)
      });
      if (!response.ok) {
        if(attempt===0&&response.status>=500){await response.body?.cancel().catch(()=>{});continue;}
        const error=Object.assign(new Error(`Dostawca pogody zwrócił HTTP ${response.status}.`),{status:502,weatherTransient:response.status===429||response.status>=500});throw error;
      }
      const data = await response.json();
      if(data.current?.time==null||!Array.isArray(data.hourly?.time)||!data.hourly.time.length||!Array.isArray(data.daily?.time)||!data.daily.time.length||!data.timezone) fail('Dostawca pogody zwrócił niepełne dane.',502);
      return normalizeTimes(data,location);
    } catch (error) {
      if (error?.status === 502) throw error;
      const transport=['AbortError','TimeoutError','TypeError'].includes(error?.name);
      if(attempt===0&&transport)continue;
      const failure=Object.assign(new Error('Nie udało się pobrać prognozy od dostawcy.'),{status:502,weatherTransient:transport});throw failure;
    }
  }
}
