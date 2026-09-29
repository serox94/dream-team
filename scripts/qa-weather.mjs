// Deterministic weather for disposable UI and API previews.
export function weatherFixture(){
 const time=Array.from({length:72},(_,i)=>new Date(Date.UTC(2026,8,28,0)+i*3600000).toISOString().slice(0,16));
 const hourly={time};for(const k of ['temperature_2m','apparent_temperature','pressure_msl','wind_speed_10m','wind_gusts_10m','cloud_cover','precipitation','relative_humidity_2m','dew_point_2m','visibility','uv_index','weather_code','wind_direction_10m'])hourly[k]=time.map(()=>({pressure_msl:1015,visibility:10000,relative_humidity_2m:60}[k]??15));
 return {timezone:'Europe/Paris',current:{time:'2026-09-28T14:15',...Object.fromEntries(Object.entries(hourly).filter(([k])=>k!=='time').map(([k,v])=>[k,v[0]]))},hourly,daily:{time:['2026-09-28','2026-09-29','2026-09-30'],weather_code:[3,3,3],wind_direction_10m_dominant:[180,180,180],temperature_2m_max:[18,18,18],temperature_2m_min:[6,6,6],wind_speed_10m_max:[15,15,15],wind_gusts_10m_max:[25,25,25],precipitation_sum:[0,0,0],sunrise:['2026-09-28T07:00'],sunset:['2026-09-28T19:00'],sunshine_duration:[28000]}};
}
