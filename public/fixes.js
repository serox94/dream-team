(function () {
  const $ = (id) => document.getElementById(id);
  const language=()=>window.DreamLanguage?.get()||document.documentElement.lang||'pl';
  const say=(pl,en)=>language()==='en'?en:pl;
  const value=n=>window.DreamConditions.finite(n);
  const fmt=(n,dec=1,unit='')=>value(n)===null?'--':Number(n).toFixed(dec)+unit;
  const tr = value => window.DreamI18n?.t(value) || value;

  function getFishingSpotSafe() {
    try {
      if (typeof FISHING_SPOT !== "undefined" && FISHING_SPOT) return FISHING_SPOT;
    } catch (_) {}

    return {
      latitude: null,
      longitude: null,
      name: "Miejsce zasiadki"
    };
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function normalizeText(value, max = 200) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function formatVisibility(v){const n=value(v);return n===null?'--':n>=1000?fmt(n/1000,1,' km'):fmt(n,0,' m');}

  function formatHour(v,epoch){if(!v)return '--';if(value(epoch)!==null)return new Date(epoch*1000).toLocaleTimeString(language()==='en'?'en-GB':'pl-PL',{timeZone:window.DREAM_WEATHER_ZONE||'UTC',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'});return String(v).slice(11,16);}

  function formatDay(v){return new Date(v+'T12:00:00Z').toLocaleDateString(language()==='en'?'en-GB':'pl-PL',{timeZone:'UTC',weekday:'long',day:'2-digit',month:'2-digit'});}

  function weatherCodeToText(code) {
    if(value(code)===null)return say('Brak danych','No data');
    const map = {
      0: "Bezchmurnie",
      1: "Prawie bezchmurnie",
      2: "Małe zachmurzenie",
      3: "Pochmurno",
      45: "Mgła",
      48: "Szadź / mgła",
      51: "Lekka mżawka",
      53: "Mżawka",
      55: "Gęsta mżawka",
      56: "Marznąca mżawka",
      57: "Silna marznąca mżawka",
      61: "Lekki deszcz",
      63: "Deszcz",
      65: "Mocny deszcz",
      66: "Marznący deszcz",
      67: "Silny marznący deszcz",
      71: "Lekki śnieg",
      73: "Śnieg",
      75: "Mocny śnieg",
      77: "Ziarnisty śnieg",
      80: "Przelotny lekki deszcz",
      81: "Przelotny deszcz",
      82: "Mocne przelotne opady",
      85: "Przelotny śnieg",
      86: "Mocny przelotny śnieg",
      95: "Burza",
      96: "Burza z gradem",
      99: "Silna burza z gradem"
    };
    return map[Number(code)] || "Warunki zmienne";
  }

  function weatherCodeToIcon(code) {
    if(value(code)===null)return '❔';
    const num = Number(code);
    if (num === 0) return "☀️";
    if ([1, 2].includes(num)) return "⛅";
    if (num === 3) return "☁️";
    if ([45, 48].includes(num)) return "🌫️";
    if ([51, 53, 55, 56, 57].includes(num)) return "🌦️";
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(num)) return "🌧️";
    if ([71, 73, 75, 77, 85, 86].includes(num)) return "❄️";
    if ([95, 96, 99].includes(num)) return "⛈️";
    return "🌤️";
  }

  function windDirectionToText(deg){if(value(deg)===null||deg<0||deg>360)return '--';const dirs=['N','NE','E','SE','S','SW','W','NW'];return `${dirs[Math.round(deg/45)%8]} (${Math.round(deg)}°)`;}

  function getWindStrengthLabel(speed) {
    if(window.DreamConditions.finite(speed)===null)return say('brak danych','no data');
    const value = Number(speed);
    if (value < 5) return "bardzo słaby";
    if (value < 12) return "słaby";
    if (value < 20) return "umiarkowany";
    if (value < 28) return "odczuwalny";
    if (value < 38) return "mocny";
    if (value < 50) return "bardzo mocny";
    return "bardzo silny";
  }

  function getWindGustLabel(gusts) {
    if(window.DreamConditions.finite(gusts)===null)return say('brak danych','no data');
    const value = Number(gusts);
    if (value < 20) return "mało porywisty";
    if (value < 30) return "lekko porywisty";
    if (value < 40) return "porywisty";
    if (value < 50) return "mocno porywisty";
    return "bardzo porywisty";
  }

  function describeWind(speed, gusts) {
    return `${tr(getWindStrengthLabel(speed))}, ${tr(getWindGustLabel(gusts))}`;
  }

  function moonPhaseInfo(date = new Date()) {
    const lp = 2551443;
    const newMoon = new Date("2001-01-24T13:00:00Z").getTime();
    const phase = (((date.getTime() - newMoon) / 1000) % lp) / lp;
    const normalized = phase < 0 ? phase + 1 : phase;
    const illumination = Math.round((1 - Math.cos(normalized * 2 * Math.PI)) * 50);

    if (normalized < 0.03 || normalized > 0.97) return { name: "Nów", illumination: `${illumination}%` };
    if (normalized < 0.22) return { name: "Przybywający sierp", illumination: `${illumination}%` };
    if (normalized < 0.28) return { name: "Pierwsza kwadra", illumination: `${illumination}%` };
    if (normalized < 0.47) return { name: "Przybywający garb", illumination: `${illumination}%` };
    if (normalized < 0.53) return { name: "Pełnia", illumination: `${illumination}%` };
    if (normalized < 0.72) return { name: "Ubywający garb", illumination: `${illumination}%` };
    if (normalized < 0.78) return { name: "Ostatnia kwadra", illumination: `${illumination}%` };
    return { name: "Ubywający sierp", illumination: `${illumination}%` };
  }

  function getPressureTrend(p,index){return window.DreamConditions.trend(p,index)?.direction||say('brak danych','no data');}

  function getHourlyIndexForNow(data){return window.DreamConditions.hourIndex(data);}

  function pickNearestNightWindow(hourly,startIndex) {
    const indices=[];
    for(let i=Math.max(0,startIndex);i<(hourly.time||[]).length;i++){
      const hour=Number(hourly.time[i].slice(11,13));
      if(hour>=22||hour<=5)indices.push(i);
      else if(indices.length)break;
    }
    if(!indices.length)indices.push(startIndex);
    const vals=key=>indices.map(i=>hourly[key]?.[i]).map(v=>value(v)).filter(v=>v!==null);
    const min=key=>vals(key).length?Math.min(...vals(key)):null,max=key=>vals(key).length?Math.max(...vals(key)):null;
    return {temp:min('temperature_2m'),wind:max('wind_speed_10m'),gusts:max('wind_gusts_10m'),humidity:max('relative_humidity_2m'),visibility:min('visibility'),cloud:max('cloud_cover')};
  }

  function getNightCampRating(night) {
    if(Object.values(night).some(v=>v===null))return say('Niepełne dane','Incomplete data');
    if (night.gusts >= 45 || night.visibility < 300) return "Trudna noc";
    if (night.temp < 6 || night.wind > 25 || night.humidity > 92) return "Średnio komfortowo";
    return "Dobra noc";
  }



  function getBiteScore(snapshot){return window.DreamConditions.assess(snapshot,language()).grade;}

  function biteScoreToLabel(grade){return window.DreamConditions.label(grade,language());}

  function biteScoreToShortTactic(grade){return grade===0?say('Zadbaj o bezpieczeństwo','Prioritise safety'):say('Obserwuj wodę','Observe the water');}

  function getWeatherRating(current){return window.DreamConditions.assess(current,language()).label;}

  function getDailyAmplitude(hourly,index){const t=(hourly.temperature_2m||[]).slice(Math.max(0,index-6),index+18).filter(v=>value(v)!==null);return t.length>1?Math.max(...t)-Math.min(...t):null;}

  function buildWeatherInterpretation(current){const a=window.DreamConditions.assess(current,language());return [a.explanation,a.rule];}

  function buildCampInterpretation(night, moon) {
    const notes = [];

    if(night.temp===null)notes.push(say('Brak prognozy temperatury nocnej.','Night temperature forecast is unavailable.'));
    else if (night.temp < 6) notes.push("Noc zapowiada się chłodna — przyda się cieplejszy śpiwór i dodatkowa warstwa.");
    else if (night.temp < 11) notes.push("Temperatura nocna umiarkowana — komfortowo, ale warto mieć bluzę pod ręką.");
    else notes.push("Temperatura nocą wygląda całkiem przyjaźnie dla dłuższego siedzenia na stanowisku.");

    if (night.gusts > 40) notes.push("Porywy będą wyraźnie odczuwalne — dobrze poprawić namiot, pokrowce i lekkie rzeczy.");
    if (night.humidity > 90) notes.push("Bardzo wysoka wilgotność — rano może być mokro, cięższe powietrze i więcej rosy.");
    if (night.visibility!==null&&night.visibility < 500) notes.push("Niższa widzialność może oznaczać mgłę przy brzegu i bardziej surową noc.");

    notes.push(`Faza księżyca: ${moon.name}, oświetlenie około ${moon.illumination}.`);

    return notes;
  }

  function buildBiteAnalysis(data){const a=window.DreamConditions.assess(data.current,language());return {score:a.grade,label:a.label,notes:[say('Czynniki pozytywne:','Positive factors:'),...(a.positive.length?a.positive:[say('Brak w dostępnych danych.','None in the available data.')]),say('Czynniki negatywne:','Negative factors:'),...(a.negative.length?a.negative:[say('Nie wykryto istotnych utrudnień w tych danych.','No significant constraints found in these data.')]),a.uncertaintyText]};}

  function buildBestBiteWindow(data,index){let best=null,worst=null;const grades=[];for(let i=index;i<Math.min(data.hourly.time.length,index+24);i++){const score=getBiteScore(window.DreamConditions.snapshot(data.hourly,i));if(score===null)continue;grades.push(score);const item={index:i,time:data.hourly.time?.[i],epoch:data.hourly.time_epoch?.[i],score,label:biteScoreToLabel(score)};if(!best||score>best.score)best=item;if(!worst||score<worst.score)worst=item;}if(best?.score===0)best=null;const activityTrend=grades.length?Math.max(...grades)===Math.min(...grades)?'stabilna':'zmienne':'brak danych';return {best,worst,activityTrend};}

  function buildBiteTactic(score,bestWindow,current){return [window.DreamConditions.assess(current,language()).suggestion];}

  function setNotes(containerId, notes) {
    const container = $(containerId);
    if (!container) return;
    clearNode(container);

    notes.forEach((note) => {
      const item = el("div", "weather-note");
      item.appendChild(document.createTextNode(note));
      container.appendChild(item);
    });
  }

  async function fetchWeatherDataEnhanced() {
    const spot = getFishingSpotSafe();
    if (spot.latitude == null || spot.longitude == null) throw new Error("Uzupełnij GPS łowiska w panelu wyjazdów.");
    let response;try{response = await fetch(`/api/weather?tripId=${encodeURIComponent(window.DREAM_TRIP.id)}`, { signal: AbortSignal.timeout(22000),headers:{'accept-language':window.DreamLanguage?.get()||document.documentElement.lang||'pl'} });}catch(error){if(['AbortError','TimeoutError'].includes(error.name))throw new Error(tr('Pobieranie prognozy trwa zbyt długo. Spróbuj ponownie.'));if(error.name==='TypeError')throw new Error(tr('Brak połączenia z internetem. Spróbuj ponownie.'));throw error;}
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Błąd pobierania pogody: ${response.status}`);
    }
    return response.json();
  }

  function renderCurrentWeatherEnhanced(data) {
    window.DREAM_WEATHER_ZONE=data.timezone;
    const current=data.current;
    const dayIndex=Math.max(0,data.daily.time.indexOf(current.time.slice(0,10)));
    const hourly = data.hourly;
    const daily = data.daily;
    const currentIndex = getHourlyIndexForNow(data);
    const trend = getPressureTrend(hourly.pressure_msl, currentIndex);
    const rating = getWeatherRating(current, hourly, currentIndex);
    const description = weatherCodeToText(current.weather_code);
    const icon = weatherCodeToIcon(current.weather_code);
    const windDirection = windDirectionToText(current.wind_direction_10m);
    const windSummary = describeWind(current.wind_speed_10m, current.wind_gusts_10m);
    const spot = getFishingSpotSafe();
    const moon = moonPhaseInfo(new Date((data.current.time_epoch??Date.now()/1000)*1000));
    const night = pickNearestNightWindow(hourly, currentIndex);

    const biteAnalysis = buildBiteAnalysis(data, currentIndex);
    const bestWindow = buildBestBiteWindow(data, currentIndex);
    const biteTactic = buildBiteTactic(biteAnalysis.score, bestWindow, current);

    if ($("weather-current-condition-icon")) $("weather-current-condition-icon").textContent = icon;
    if ($("weather-summary-location")) $("weather-summary-location").textContent = spot.name || "Miejsce zasiadki";
    if ($("weather-summary-updated")) {
      $("weather-summary-updated").textContent = `Dane: ${current.time.replace("T", " ")} · ${data.timezone || Dream.zone()}`;
    }
    if ($("weather-rating-hero")) $("weather-rating-hero").textContent = `Ocena: ${rating}`;
    if ($("bite-chance-hero")) $("bite-chance-hero").textContent = `${say("Warunki","Conditions")}: ${biteAnalysis.label}`;

    if ($("weather-current-temp")) $("weather-current-temp").textContent = fmt(current.temperature_2m,1,'°C');
    if ($("weather-current-wind")) $("weather-current-wind").textContent = `${fmt(current.wind_speed_10m)} / ${fmt(current.wind_gusts_10m)} km/h`;
    if ($("weather-current-pressure")) $("weather-current-pressure").textContent = `${fmt(current.pressure_msl,0)} hPa / ${tr(trend)}`;
    if ($("weather-rating")) $("weather-rating").textContent = rating;
    if ($("weather-description")) $("weather-description").textContent = `${icon} ${tr(description)}`;
    if ($("weather-description-copy")) $("weather-description-copy").textContent = description;
    if ($("weather-pressure-note")) $("weather-pressure-note").textContent = `Trend: ${trend}`;
    if ($("weather-rating-note")) $("weather-rating-note").textContent = `Warunki: ${rating}`;

    if ($("weather-apparent-temp")) $("weather-apparent-temp").textContent = fmt(current.apparent_temperature,1,'°C');
    if ($("weather-wind-direction")) $("weather-wind-direction").textContent = `${windDirection} • ${windSummary}`;
    if ($("weather-wind-direction-copy")) $("weather-wind-direction-copy").textContent = `${windDirection} • ${windSummary}`;
    if ($("weather-cloud-cover")) $("weather-cloud-cover").textContent = fmt(current.cloud_cover,0,'%');
    if ($("weather-precipitation")) $("weather-precipitation").textContent = fmt(current.precipitation,1,' mm');
    if ($("weather-humidity")) $("weather-humidity").textContent = fmt(current.relative_humidity_2m,0,'%');
    if ($("weather-dew-point")) $("weather-dew-point").textContent = fmt(current.dew_point_2m,1,'°C');
    if ($("weather-visibility")) $("weather-visibility").textContent = formatVisibility(current.visibility);
    if ($("weather-uv")) $("weather-uv").textContent = fmt(current.uv_index);
    if ($("weather-sunshine")) $("weather-sunshine").textContent = value(daily.sunshine_duration?.[dayIndex])===null?'--':fmt(daily.sunshine_duration[dayIndex]/3600,0,' h');

    if ($("camp-night-temp")) $("camp-night-temp").textContent = fmt(night.temp,1,'°C');
    if ($("camp-night-wind")) $("camp-night-wind").textContent = fmt(night.wind,1,' km/h');
    if ($("camp-night-gusts")) $("camp-night-gusts").textContent = fmt(night.gusts,1,' km/h');
    if ($("camp-night-humidity")) $("camp-night-humidity").textContent = fmt(night.humidity,0,'%');
    if ($("camp-night-visibility")) $("camp-night-visibility").textContent = formatVisibility(night.visibility);
    if ($("camp-night-rating")) $("camp-night-rating").textContent = getNightCampRating(night);
    if ($("moon-phase")) $("moon-phase").textContent = moon.name;
    if ($("moon-illumination")) $("moon-illumination").textContent = moon.illumination;

    if ($("soil-temp")) $("soil-temp").textContent = fmt(hourly.soil_temperature_0cm?.[currentIndex],1,'°C');
    if ($("soil-moisture")) $("soil-moisture").textContent = value(hourly.soil_moisture_0_to_1cm?.[currentIndex])===null?'--':fmt(hourly.soil_moisture_0_to_1cm[currentIndex]*100,0,'%');

    if($('wind-arrow')) {
      $('wind-arrow').hidden=value(current.wind_direction_10m)===null;
      $("wind-arrow").style.transform = `translate(-50%, -86%) rotate(${value(current.wind_direction_10m)??0}deg)`;
    }
    if ($("wind-compass-text")) $("wind-compass-text").textContent = windDirection;
    if ($("wind-direction-long")) $("wind-direction-long").textContent = `${windDirection} • ${getWindStrengthLabel(current.wind_speed_10m)}`;
    if ($("wind-gusts-inline")) $("wind-gusts-inline").textContent = `${fmt(current.wind_gusts_10m,1," km/h")} • ${tr(getWindGustLabel(current.wind_gusts_10m))}`;
    if ($("wind-score-inline")) $("wind-score-inline").textContent = windSummary;

    if ($("bite-chance-main")) $("bite-chance-main").textContent = biteAnalysis.label;
    if ($("bite-score-note")) $("bite-score-note").textContent = say('Bez prognozy brań','No bite prediction');
    if ($("best-bite-window")) $("best-bite-window").textContent = bestWindow.best ? formatHour(bestWindow.best.time,bestWindow.best.epoch) : "--";
    if ($("best-bite-window-note")) $("best-bite-window-note").textContent = bestWindow.best ? `Ocena: ${bestWindow.best.label}` : "Brak danych";
    if($('bite-trend'))$('bite-trend').textContent=tr(bestWindow.activityTrend);
    if($('bite-trend-note'))$('bite-trend-note').textContent=say('Zmiany warunków pogodowych, nie aktywności ryb','Changes in weather conditions, not fish activity');
    if ($("bite-tactic-short")) $("bite-tactic-short").textContent = biteScoreToShortTactic(biteAnalysis.score);
    if($('bite-tactic-note'))$('bite-tactic-note').textContent=say('Obserwuj ryby i sprawdzaj prezentację zestawu','Observe fish and verify rig presentation');
    for(const [id,v]of [['weather-sunrise',daily.sunrise?.[dayIndex]],['weather-sunset',daily.sunset?.[dayIndex]]])if($(id))$(id).textContent=formatHour(v);
    if($('water-temp'))$('water-temp').textContent=say('Brak pomiaru','Not measured');
    if($('water-oxygen'))$('water-oxygen').textContent=say('Brak pomiaru','Not measured');
    if($('weather-source-status'))$('weather-source-status').textContent=(data.dreamteam?.stale?say('Ostatnia prognoza (brak połączenia z dostawcą) · ','Last forecast (provider unavailable) · '):'')+`Open-Meteo · ${data.timezone} · GPS ${data.dreamteam?.requestedCoordinates?.latitude??spot.latitude}, ${data.dreamteam?.requestedCoordinates?.longitude??spot.longitude} · ${say('pobrano','fetched')} ${data.dreamteam?.fetchedAt?new Date(data.dreamteam.fetchedAt).toLocaleString(language()==='en'?'en-GB':'pl-PL',{timeZone:data.timezone}):current.time}`;
    setNotes("weather-interpretation", buildWeatherInterpretation(current, hourly, currentIndex));
    setNotes("camp-interpretation", buildCampInterpretation(night, moon));
    setNotes("bite-analysis", biteAnalysis.notes);
    setNotes("bite-tactic-box", biteTactic);
    // Weather-based handling windows are not fishing bite forecasts.
    const carp=window.DreamCarpWeather?.render(data,language());
    if(carp?.available){
      if($("bite-chance-main"))$("bite-chance-main").textContent=carp.pressureShort;
      if($("bite-score-note"))$("bite-score-note").textContent=say('Zmiana w ostatnich 3 h, bez prognozy brań.','Change over 3 h, not a bite forecast.');
      if($("best-bite-window"))$("best-bite-window").textContent=carp.windowShort;
      if($("best-bite-window-note"))$("best-bite-window-note").textContent=say('Spokojniejsze 3 godziny na obsługę zestawów.','Calmer 3 hours for rig handling.');
      if($("bite-trend"))$("bite-trend").textContent=carp.riskLabel;
      if($("bite-trend-note"))$("bite-trend-note").textContent=say('Prognozowane zagrożenia w ciągu 24 h.','Forecast hazards within 24 h.');
      if($("bite-tactic-short"))$("bite-tactic-short").textContent=carp.shortTip;
      if($("bite-tactic-note"))$("bite-tactic-note").textContent=say('Wskazówka pogodowa, nie gwarancja brania.','Weather guidance, not a bite guarantee.');
      if($("bite-chance-hero"))$("bite-chance-hero").textContent=say('Plan 24 h: ','24 h plan: ')+carp.shortTip;
    }
  }

  function createWeatherChip(label, value, highlight = false) {
    const chip = el("div", `weather-chip-2${highlight ? " highlight" : ""}`);
    chip.appendChild(el("span", "", label));
    chip.appendChild(el("strong", "", value));
    return chip;
  }

  function renderHourlyWeatherEnhanced(data) {
    const container = $("weather-hourly-list");
    if (!container) return;
    clearNode(container);

    const startIndex = getHourlyIndexForNow(data);
    const endIndex = Math.min(data.hourly.time.length, startIndex + 24);

    for (let i = startIndex; i < endIndex; i += 1) {
      const card = el("details", "weather-hour-card");
      const top = el("summary", "weather-row-top");
      const title = el("div", "weather-row-title");
      const icon = el("div", "weather-row-icon", weatherCodeToIcon(data.hourly.weather_code?.[i]));

      const textWrap = el("div");
      textWrap.appendChild(el("div", "weather-row-time", formatHour(data.hourly.time?.[i],data.hourly.time_epoch?.[i])));
      textWrap.appendChild(el("div", "weather-row-desc", weatherCodeToText(data.hourly.weather_code?.[i])));
      title.appendChild(icon);
      title.appendChild(textWrap);

      const trend = getPressureTrend(data.hourly.pressure_msl, i);
      const hour = new Date(data.hourly.time?.[i]).getHours();
      const biteScore = getBiteScore({
        temperature_2m: data.hourly.temperature_2m?.[i],
        wind_speed_10m: data.hourly.wind_speed_10m?.[i],
        wind_gusts_10m: data.hourly.wind_gusts_10m?.[i],
        pressure_msl: data.hourly.pressure_msl?.[i],
        cloud_cover: data.hourly.cloud_cover?.[i],
        weather_code:data.hourly.weather_code?.[i],
        precipitation: data.hourly.precipitation?.[i]
      }, trend, hour);

      const rating = el("div", "section-chip", `${biteScoreToLabel(biteScore)}`);
      top.appendChild(title);
      top.appendChild(rating);
      if(top.tagName==='SUMMARY')top.appendChild(el('span','weather-hour-compact',`${fmt(data.hourly.temperature_2m?.[i],1)}°C · ${fmt(data.hourly.wind_speed_10m?.[i],0)} km/h · ${fmt(data.hourly.precipitation?.[i],1)} mm`));
      card.appendChild(top);

      const grid = el("div", "weather-chip-grid");
      grid.appendChild(createWeatherChip("🌡️ Temp.", `${fmt(data.hourly.temperature_2m?.[i],1)}°C`, true));
      grid.appendChild(createWeatherChip(say("🐟 Warunki","🐟 Conditions"), biteScoreToLabel(biteScore), true));
      grid.appendChild(createWeatherChip("🌬️ Wiatr", `${fmt(data.hourly.wind_speed_10m?.[i],1)} km/h`));
      grid.appendChild(createWeatherChip("💨 Porywy", `${fmt(data.hourly.wind_gusts_10m?.[i],1)} km/h`));
      grid.appendChild(createWeatherChip("🧭 Kierunek", windDirectionToText(data.hourly.wind_direction_10m?.[i])));
      grid.appendChild(createWeatherChip("🧭 Ciśnienie", `${fmt(data.hourly.pressure_msl?.[i],0)} hPa`));
      grid.appendChild(createWeatherChip("📈 Trend", trend));
      grid.appendChild(createWeatherChip("🌧️ Opad", `${fmt(data.hourly.precipitation?.[i],1)} mm`));
      grid.appendChild(createWeatherChip("☁️ Chmury", `${fmt(data.hourly.cloud_cover?.[i],0)}%`));
      grid.appendChild(createWeatherChip("💧 Wilgotność", `${fmt(data.hourly.relative_humidity_2m?.[i],0)}%`));
      grid.appendChild(createWeatherChip("🌫️ Rosa", `${fmt(data.hourly.dew_point_2m?.[i],1)}°C`));
      grid.appendChild(createWeatherChip("👀 Widzialność", formatVisibility(data.hourly.visibility?.[i])));
      grid.appendChild(createWeatherChip("☀️ UV", `${fmt(data.hourly.uv_index?.[i],1)}`));
      grid.appendChild(createWeatherChip("🌱 Gleba", `${fmt(data.hourly.soil_temperature_0cm?.[i],1)}°C`));

      card.appendChild(grid);
      container.appendChild(card);
    }
  }

  function renderDailyWeatherEnhanced(data) {
    const container = $("weather-daily-list");
    if (!container) return;
    clearNode(container);

    data.daily.time.forEach((time, index) => {
      const card = el("article", "weather-day-card");
      const top = el("div", "weather-row-top");
      const title = el("div", "weather-row-title");
      const icon = el("div", "weather-row-icon", weatherCodeToIcon(data.daily.weather_code?.[index]));

      const textWrap = el("div");
      textWrap.appendChild(el("div", "weather-row-time", formatDay(time)));
      textWrap.appendChild(el("div", "weather-row-desc", weatherCodeToText(data.daily.weather_code?.[index])));
      title.appendChild(icon);
      title.appendChild(textWrap);

      const tag = el("div", "section-chip", `UV max ${fmt(data.daily.uv_index_max?.[index],1)}`);
      top.appendChild(title);
      top.appendChild(tag);
      card.appendChild(top);

      const grid = el("div", "weather-chip-grid");
      grid.appendChild(createWeatherChip("🌡️ Min / Max", `${fmt(data.daily.temperature_2m_min?.[index],1)}°C / ${fmt(data.daily.temperature_2m_max?.[index],1)}°C`, true));
      grid.appendChild(createWeatherChip("🌧️ Opad", `${fmt(data.daily.precipitation_sum?.[index],1)} mm`));
      grid.appendChild(createWeatherChip("🌬️ Wiatr max", `${fmt(data.daily.wind_speed_10m_max?.[index],1)} km/h`));
      grid.appendChild(createWeatherChip("💨 Porywy", `${fmt(data.daily.wind_gusts_10m_max?.[index],1)} km/h`));
      grid.appendChild(createWeatherChip("🧭 Kierunek", windDirectionToText(data.daily.wind_direction_10m_dominant?.[index])));
      grid.appendChild(createWeatherChip("🌞 Słońce", value(data.daily.sunshine_duration?.[index])===null?'--':fmt(data.daily.sunshine_duration[index]/3600,0,' h')));

      card.appendChild(grid);
      container.appendChild(card);
    });
  }

  let lastGoodWeather=null;
  async function performWeatherRender() {
    if (!$("weather-current-temp")) return;

    try {
      if(lastGoodWeather?.tripId!==window.DREAM_TRIP.id)$("weather-current-temp").textContent = say("Ładowanie...","Loading...");
      const data = await fetchWeatherDataEnhanced();
      if(/^(Pogoda niedostępna:|Weather unavailable:)/.test($("app-notice")?.textContent||""))Dream.notice("");
      renderCurrentWeatherEnhanced(data);
      renderHourlyWeatherEnhanced(data);
      renderDailyWeatherEnhanced(data);
      lastGoodWeather={tripId:window.DREAM_TRIP.id,data,at:Date.parse(data.dreamteam?.fetchedAt)||Date.now()};
      if(data.dreamteam?.stale)Dream.notice(say('Dostawca pogody jest niedostępny. Pokazuję ostatnią prognozę z oznaczonym czasem pobrania — sprawdź aktualne ostrzeżenia przed wyjściem nad wodę.','The weather provider is unavailable. Showing the last forecast with its retrieval time — check current warnings before fishing.'),true);
    } catch (error) {
      console.error(error);
      const prefix=say('Pogoda niedostępna: ','Weather unavailable: ');
      Dream.notice(prefix+error.message,true);
      if(lastGoodWeather?.tripId===window.DREAM_TRIP.id&&Date.now()-lastGoodWeather.at<=1800000){
       const at=new Date(lastGoodWeather.at).toLocaleString(language()==='en'?'en-GB':'pl-PL');
       if($('weather-summary-updated'))$('weather-summary-updated').textContent=say('Ostatnia prognoza: ','Last forecast: ')+at;
       Dream.notice(prefix+error.message+say(' Pokazuję ostatnią prognozę, nie dane na żywo.',' Showing the last forecast, not live data.'),true);return;
      }
      lastGoodWeather=null;
      const ids = [
        "weather-current-temp",
        "weather-current-wind",
        "weather-current-pressure",
        "weather-rating",
        "weather-description",
        "weather-description-copy",
        "bite-chance-main",
        "best-bite-window",
        "bite-trend",
        "bite-tactic-short"
      ];
      ids.forEach((id) => {
        if ($(id)) $(id).textContent = say("Brak danych","Unavailable");
      });
      const unavailable=say('Brak prognozy — spróbuj odświeżyć dane.','Forecast unavailable — try refreshing.');
      for(const id of ['weather-summary-updated','weather-source-status','carp-weather-headline'])if($(id))$(id).textContent=unavailable;
      for(const id of ['carp-pressure','carp-wind','carp-rain','carp-air','carp-window','weather-rating-hero','bite-chance-hero'])if($(id))$(id).textContent=say('Brak danych','Unavailable');
      for(const id of ['weather-hourly-list','weather-daily-list'])if($(id))clearNode($(id));
      setNotes('carp-weather-actions',[unavailable]);
      setNotes("weather-interpretation", [say("Nie udało się pobrać danych pogodowych.","Could not retrieve weather data.")]);
      setNotes("camp-interpretation", [say("Brak danych do oceny obozowania.","No data to assess camping conditions.")]);
      setNotes("bite-analysis", [say("Brak danych do oceny warunków.","No data to assess conditions.")]);
      setNotes("bite-tactic-box", [say("Brak danych do rekomendacji.","No data for recommendations.")]);
    }
  }

  let weatherRenderPending=null;
  function renderEnhancedWeatherPage(){if(weatherRenderPending)return weatherRenderPending;const button=$('refresh-weather-btn');if(button)button.disabled=true;weatherRenderPending=performWeatherRender().finally(()=>{weatherRenderPending=null;if(button)button.disabled=false;});return weatherRenderPending;}

  function enhanceNavigationIcons() {
    const nav = document.querySelector(".main-nav");
    if (nav) nav.classList.add("nav-iconized");
  }

  function bindRefreshButton() {
    $("refresh-weather-btn")?.addEventListener("click", function () {
      renderEnhancedWeatherPage();
    });
  }

  async function init() {
    enhanceNavigationIcons();
    bindRefreshButton();
    if($("weather-current-temp"))setInterval(()=>{if(navigator.onLine!==false&&document.visibilityState!=="hidden")renderEnhancedWeatherPage();},600000);

    if ($("weather-current-temp")) {
      await renderEnhancedWeatherPage();
    }
  }

  window.DreamWeather = { init, render: renderEnhancedWeatherPage, getHourlyIndexForNow, pickNearestNightWindow, moonPhaseInfo };
})();
