import { fail } from './validation.js';

const variables = {
  current: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,uv_index',
  hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,uv_index,soil_temperature_0cm,soil_moisture_0_to_1cm',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,wind_gusts_10m_max,sunshine_duration,uv_index_max'
};

export async function weatherForTrip(env, tripId) {
  if (!tripId) fail('Wymagany tripId.');
  const location = await env.DB.prepare(`SELECT COALESCE(l.latitude,t.latitude) latitude,
    COALESCE(l.longitude,t.longitude) longitude FROM trips t LEFT JOIN lakes l ON l.id=t.lake_id
    WHERE t.id=?`).bind(tripId).first();
  if (!location) fail('Nie znaleziono wyjazdu.',404);
  if (location.latitude == null || location.longitude == null) fail('Uzupełnij GPS łowiska w panelu wyjazdów.',422);

  const params = new URLSearchParams({
    latitude:String(location.latitude), longitude:String(location.longitude),
    ...variables, timezone:'auto', forecast_days:'7'
  });
  try {
    const response = await (env.WEATHER_FETCH || fetch)(`https://api.open-meteo.com/v1/forecast?${params}`,{
      signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) fail(`Dostawca pogody zwrócił HTTP ${response.status}.`,502);
    const data = await response.json();
    if (!data.current || !data.hourly?.time || !data.daily?.time) fail('Dostawca pogody zwrócił niepełne dane.',502);
    return data;
  } catch (error) {
    if (error?.status === 502) throw error;
    fail('Nie udało się pobrać prognozy od dostawcy.',502);
  }
}
