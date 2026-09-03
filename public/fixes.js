(function () {
  const $ = (id) => document.getElementById(id);

  function getSupabaseClientSafe() {
    try {
      if (typeof window !== "undefined" && window.supabaseClient) return window.supabaseClient;
    } catch (_) {}
    try {
      if (typeof supabaseClient !== "undefined" && supabaseClient) return supabaseClient;
    } catch (_) {}
    return null;
  }

  function getFishingSpotSafe() {
    try {
      if (typeof FISHING_SPOT !== "undefined" && FISHING_SPOT) return FISHING_SPOT;
    } catch (_) {}

    return {
      latitude: 50.0,
      longitude: 5.0,
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

  function formatVisibility(value) {
    const num = Number(value || 0);
    if (num >= 1000) return `${(num / 1000).toFixed(1)} km`;
    return `${Math.round(num)} m`;
  }

  function formatHour(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  }

  function formatDay(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit"
    });
  }

  function weatherCodeToText(code) {
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

  function windDirectionToText(deg) {
    const value = Number(deg || 0);
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(value / 45) % 8;
    return `${dirs[index]} (${Math.round(value)}°)`;
  }

  function getWindStrengthLabel(speed) {
    const value = Number(speed || 0);
    if (value < 5) return "bardzo słaby";
    if (value < 12) return "słaby";
    if (value < 20) return "umiarkowany";
    if (value < 28) return "odczuwalny";
    if (value < 38) return "mocny";
    if (value < 50) return "bardzo mocny";
    return "bardzo silny";
  }

  function getWindGustLabel(gusts) {
    const value = Number(gusts || 0);
    if (value < 20) return "mało porywisty";
    if (value < 30) return "lekko porywisty";
    if (value < 40) return "porywisty";
    if (value < 50) return "mocno porywisty";
    return "bardzo porywisty";
  }

  function describeWind(speed, gusts) {
    return `${getWindStrengthLabel(speed)}, ${getWindGustLabel(gusts)}`;
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

  function getPressureTrend(pressures, currentIndex) {
    const prev = Number(pressures?.[Math.max(0, currentIndex - 3)] ?? 0);
    const current = Number(pressures?.[currentIndex] ?? 0);
    const diff = current - prev;
    if (diff > 2) return "rośnie";
    if (diff < -2) return "spada";
    return "stabilne";
  }

  function getHourlyIndexForNow(data) {
    const currentTime = data?.current?.time;
    const hourly = data?.hourly?.time || [];
    const index = hourly.indexOf(currentTime);
    if (index >= 0) return index;

    const now = Date.now();
    let closestIndex = 0;
    let closestDiff = Infinity;

    hourly.forEach((value, idx) => {
      const diff = Math.abs(new Date(value).getTime() - now);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = idx;
      }
    });

    return closestIndex;
  }

  function pickNearestNightWindow(hourly, startIndex) {
    const times = hourly.time || [];
    const start = Math.max(0, startIndex);

    for (let i = start; i < times.length; i += 1) {
      const hour = new Date(times[i]).getHours();
      if (hour >= 22 || hour <= 5) {
        return {
          temp: Number(hourly.temperature_2m?.[i] || 0),
          wind: Number(hourly.wind_speed_10m?.[i] || 0),
          gusts: Number(hourly.wind_gusts_10m?.[i] || 0),
          humidity: Number(hourly.relative_humidity_2m?.[i] || 0),
          visibility: Number(hourly.visibility?.[i] || 0),
          cloud: Number(hourly.cloud_cover?.[i] || 0)
        };
      }
    }

    return {
      temp: Number(hourly.temperature_2m?.[start] || 0),
      wind: Number(hourly.wind_speed_10m?.[start] || 0),
      gusts: Number(hourly.wind_gusts_10m?.[start] || 0),
      humidity: Number(hourly.relative_humidity_2m?.[start] || 0),
      visibility: Number(hourly.visibility?.[start] || 0),
      cloud: Number(hourly.cloud_cover?.[start] || 0)
    };
  }

  function getNightCampRating(night) {
    if (night.gusts >= 45 || night.visibility < 300) return "Trudna noc";
    if (night.temp < 6 || night.wind > 25 || night.humidity > 92) return "Średnio komfortowo";
    return "Dobra noc";
  }

  function getHourWeightForBites(hour) {
    if ((hour >= 4 && hour <= 8) || (hour >= 19 && hour <= 23)) return 2;
    if ((hour >= 9 && hour <= 11) || (hour >= 16 && hour <= 18)) return 1;
    return 0;
  }

  function getBiteScore(snapshot, trend, hour) {
    let score = 0;

    const temp = Number(snapshot.temperature_2m || 0);
    const wind = Number(snapshot.wind_speed_10m || 0);
    const gusts = Number(snapshot.wind_gusts_10m || 0);
    const pressure = Number(snapshot.pressure_msl || 0);
    const cloud = Number(snapshot.cloud_cover || 0);
    const rain = Number(snapshot.precipitation || 0);

    if (pressure >= 1002 && pressure <= 1022) score += 2;
    else if (pressure >= 995 && pressure <= 1028) score += 1;
    else score -= 1;

    if (trend === "stabilne") score += 2;
    else if (trend === "rośnie") score += 1;
    else score -= 1;

    if (temp >= 12 && temp <= 23) score += 2;
    else if (temp >= 8 && temp <= 27) score += 1;
    else score -= 1;

    if (wind >= 8 && wind <= 22) score += 2;
    else if (wind >= 4 && wind < 8) score += 1;
    else if (wind > 30) score -= 1;

    if (gusts <= 30) score += 1;
    else if (gusts > 40) score -= 1;

    if (cloud >= 25 && cloud <= 85) score += 2;
    else if (cloud > 85) score += 1;

    if (rain > 0 && rain <= 1.5) score += 1;
    else if (rain > 4) score -= 1;

    score += getHourWeightForBites(hour);

    return score;
  }

  function biteScoreToLabel(score) {
    if (score >= 10) return "Bardzo wysoka";
    if (score >= 8) return "Wysoka";
    if (score >= 6) return "Dobra";
    if (score >= 4) return "Średnia";
    return "Słaba";
  }

  function biteScoreToShortTactic(score) {
    if (score >= 10) return "Mocno naciskaj";
    if (score >= 8) return "Dobra zasiadka";
    if (score >= 6) return "Warto pilnować";
    if (score >= 4) return "Warunki średnie";
    return "Trudniejsze warunki";
  }

  function getWeatherRating(current, hourly, currentIndex) {
    let score = 0;
    const pressureTrend = getPressureTrend(hourly.pressure_msl, currentIndex);
    const wind = Number(current.wind_speed_10m || 0);
    const gusts = Number(current.wind_gusts_10m || 0);
    const cloud = Number(current.cloud_cover || 0);
    const rain = Number(current.precipitation || 0);
    const pressure = Number(current.pressure_msl || 0);

    if (wind >= 8 && wind <= 24) score += 2;
    if (gusts <= 35) score += 1;
    if (cloud >= 20 && cloud <= 85) score += 2;
    if (rain <= 1.5) score += 1;
    if (pressure >= 1000 && pressure <= 1024) score += 1;
    if (pressureTrend === "stabilne") score += 2;
    if (pressureTrend === "rośnie") score += 1;

    if (score >= 8) return "Bardzo dobre";
    if (score >= 6) return "Dobre";
    if (score >= 4) return "Średnie";
    return "Słabe";
  }

  function getDailyAmplitude(hourly, currentIndex) {
    const start = Math.max(0, currentIndex - 6);
    const end = Math.min(hourly.temperature_2m.length, currentIndex + 18);
    const slice = hourly.temperature_2m.slice(start, end).map(Number);
    if (!slice.length) return 0;
    return Math.max(...slice) - Math.min(...slice);
  }

  function buildWeatherInterpretation(current, hourly, currentIndex) {
    const notes = [];
    const wind = Number(current.wind_speed_10m || 0);
    const gusts = Number(current.wind_gusts_10m || 0);
    const trend = getPressureTrend(hourly.pressure_msl, currentIndex);
    const cloud = Number(current.cloud_cover || 0);
    const rain = Number(current.precipitation || 0);

    if (trend === "stabilne") notes.push("Stabilne ciśnienie wygląda dobrze pod spokojniejsze żerowanie ryb.");
    else if (trend === "rośnie") notes.push("Ciśnienie rośnie — warunki mogą się porządkować, warto obserwować aktywność.");
    else notes.push("Ciśnienie spada — możliwa zmiana pogody, pilnuj frontu i reakcji ryb.");

    if (wind >= 8 && wind <= 24) notes.push("Wiatr jest w sensownym zakresie i może pracować na wodzie na plus.");
    else if (wind < 8) notes.push("Słaby wiatr — woda może być zbyt spokojna i mniej żywa.");
    else notes.push("Wiatr jest już dość mocny — ustawienie zestawów i komfort łowienia mogą być gorsze.");

    if (gusts > 35) notes.push("Mocniejsze porywy mogą pogarszać kontrolę nad zestawem i sygnalizacją.");
    if (cloud >= 20 && cloud <= 85) notes.push("Umiarkowane zachmurzenie zwykle daje przyjemniejsze światło i lepszy komfort.");
    if (rain > 1.5) notes.push("Wyższy opad — przygotuj osłonę stanowiska i pilnuj elektroniki.");

    if (!notes.length) notes.push("Warunki są dość neutralne — obserwuj wodę i reaguj na zmiany.");
    return notes;
  }

  function buildCampInterpretation(night, moon) {
    const notes = [];

    if (night.temp < 6) notes.push("Noc zapowiada się chłodna — przyda się cieplejszy śpiwór i dodatkowa warstwa.");
    else if (night.temp < 11) notes.push("Temperatura nocna umiarkowana — komfortowo, ale warto mieć bluzę pod ręką.");
    else notes.push("Temperatura nocą wygląda całkiem przyjaźnie dla dłuższego siedzenia na stanowisku.");

    if (night.gusts > 40) notes.push("Porywy będą wyraźnie odczuwalne — dobrze poprawić namiot, pokrowce i lekkie rzeczy.");
    if (night.humidity > 90) notes.push("Bardzo wysoka wilgotność — rano może być mokro, cięższe powietrze i więcej rosy.");
    if (night.visibility < 500) notes.push("Niższa widzialność może oznaczać mgłę przy brzegu i bardziej surową noc.");

    notes.push(`Faza księżyca: ${moon.name}, oświetlenie około ${moon.illumination}.`);

    return notes;
  }

  function buildBiteAnalysis(data, currentIndex) {
    const hourly = data.hourly;
    const current = data.current;
    const hour = new Date(data.current.time).getHours();
    const trend = getPressureTrend(hourly.pressure_msl, currentIndex);
    const currentScore = getBiteScore(current, trend, hour);
    const label = biteScoreToLabel(currentScore);
    const amplitude = getDailyAmplitude(hourly, currentIndex);

    const notes = [];
    const pressure = Number(current.pressure_msl || 0);
    const temp = Number(current.temperature_2m || 0);
    const wind = Number(current.wind_speed_10m || 0);
    const gusts = Number(current.wind_gusts_10m || 0);
    const cloud = Number(current.cloud_cover || 0);
    const rain = Number(current.precipitation || 0);

    notes.push(`Obecna szansa na branie: ${label}. Punktacja aktywności: ${currentScore}.`);

    if (pressure >= 1002 && pressure <= 1022) {
      notes.push(`Ciśnienie ${Math.round(pressure)} hPa jest w dobrym zakresie pod aktywność ryb.`);
    } else if (pressure < 995 || pressure > 1028) {
      notes.push(`Ciśnienie ${Math.round(pressure)} hPa jest mniej korzystne i może osłabiać żerowanie.`);
    } else {
      notes.push(`Ciśnienie ${Math.round(pressure)} hPa jest jeszcze akceptowalne, ale nie idealne.`);
    }

    if (trend === "stabilne") {
      notes.push("Trend ciśnienia jest stabilny, co zwykle pomaga utrzymać bardziej przewidywalne żerowanie.");
    } else if (trend === "rośnie") {
      notes.push("Ciśnienie rośnie, więc warunki mogą iść w stronę poprawy.");
    } else {
      notes.push("Ciśnienie spada, więc aktywność może być nierówna i zależna od zmiany pogody.");
    }

    if (temp >= 12 && temp <= 23) {
      notes.push(`Temperatura ${temp.toFixed(1)}°C jest bardzo dobra pod regularne brania.`);
    } else if (temp >= 8 && temp <= 27) {
      notes.push(`Temperatura ${temp.toFixed(1)}°C jest jeszcze sensowna, choć nie idealna.`);
    } else {
      notes.push(`Temperatura ${temp.toFixed(1)}°C może ograniczać aktywność ryb.`);
    }

    if (amplitude <= 6) {
      notes.push(`Amplituda temperatury około ${amplitude.toFixed(1)}°C wygląda stabilnie i sprzyja spokojniejszym warunkom.`);
    } else {
      notes.push(`Amplituda temperatury około ${amplitude.toFixed(1)}°C jest dość duża, więc zachowanie ryb może się szybciej zmieniać.`);
    }

    if (wind >= 8 && wind <= 22) {
      notes.push(`Wiatr ${wind.toFixed(1)} km/h wygląda korzystnie — pracuje na powierzchni i może poprawiać aktywność.`);
    } else if (wind < 4) {
      notes.push(`Wiatr ${wind.toFixed(1)} km/h jest słaby — woda może być zbyt spokojna.`);
    } else if (wind > 30) {
      notes.push(`Wiatr ${wind.toFixed(1)} km/h jest mocny i może utrudniać łowienie.`);
    } else {
      notes.push(`Wiatr ${wind.toFixed(1)} km/h jest neutralny.`);
    }

    if (gusts > 40) {
      notes.push(`Porywy ${gusts.toFixed(1)} km/h są wysokie i mogą pogarszać kontrolę nad zestawem.`);
    } else {
      notes.push(`Porywy ${gusts.toFixed(1)} km/h nie powinny mocno przeszkadzać.`);
    }

    if (cloud >= 25 && cloud <= 85) {
      notes.push(`Zachmurzenie ${Math.round(cloud)}% wygląda dobrze — światło jest bardziej miękkie, co bywa korzystne.`);
    } else if (cloud < 20) {
      notes.push(`Małe zachmurzenie (${Math.round(cloud)}%) oznacza sporo światła, więc ryby mogą być ostrożniejsze.`);
    } else {
      notes.push(`Duże zachmurzenie (${Math.round(cloud)}%) może pomagać, o ile nie towarzyszy temu załamanie pogody.`);
    }

    if (rain > 0 && rain <= 1.5) {
      notes.push(`Lekki opad (${rain.toFixed(1)} mm) może działać na plus i pobudzać wodę.`);
    } else if (rain > 4) {
      notes.push(`Silniejszy opad (${rain.toFixed(1)} mm) może pogarszać komfort i rozbijać rytm łowienia.`);
    } else {
      notes.push("Brak istotnych opadów — warunki są spokojniejsze i bardziej stabilne.");
    }

    if (getHourWeightForBites(hour) === 2) {
      notes.push("Aktualna pora dnia należy do najlepszych okien aktywności ryb.");
    } else if (getHourWeightForBites(hour) === 1) {
      notes.push("Pora dnia jest umiarkowanie dobra i warto pilnować sygnałów z wody.");
    } else {
      notes.push("To nie jest najmocniejsze okno aktywności — większe szanse mogą pojawić się rano lub wieczorem.");
    }

    return { notes, score: currentScore, label, amplitude };
  }

  function buildBestBiteWindow(data, currentIndex) {
    const hourly = data.hourly;
    const limit = Math.min(hourly.time.length, currentIndex + 24);

    let best = null;
    let worst = null;

    for (let i = currentIndex; i < limit; i += 1) {
      const hour = new Date(hourly.time[i]).getHours();
      const snapshot = {
        temperature_2m: hourly.temperature_2m[i],
        wind_speed_10m: hourly.wind_speed_10m[i],
        wind_gusts_10m: hourly.wind_gusts_10m[i],
        pressure_msl: hourly.pressure_msl[i],
        cloud_cover: hourly.cloud_cover[i],
        precipitation: hourly.precipitation[i]
      };

      const trend = getPressureTrend(hourly.pressure_msl, i);
      const score = getBiteScore(snapshot, trend, hour);

      const item = {
        index: i,
        time: hourly.time[i],
        score,
        label: biteScoreToLabel(score)
      };

      if (!best || item.score > best.score) best = item;
      if (!worst || item.score < worst.score) worst = item;
    }

    let activityTrend = "stabilna";
    if (best && worst) {
      if (best.index - currentIndex <= 6 && best.score - worst.score >= 2) activityTrend = "poprawa";
      else if (worst.index - currentIndex <= 6 && worst.score < best.score) activityTrend = "pogorszenie";
    }

    return { best, worst, activityTrend };
  }

  function buildBiteTactic(score, bestWindow, current) {
    const notes = [];
    const wind = Number(current.wind_speed_10m || 0);
    const rain = Number(current.precipitation || 0);
    const cloud = Number(current.cloud_cover || 0);

    if (score >= 10) {
      notes.push("Warunki są bardzo mocne pod aktywność ryb — warto być gotowym na szybszą reakcję i częściej kontrolować zestawy.");
      notes.push("To dobry moment na pełne skupienie na łowieniu, szczególnie w aktywnych godzinach.");
    } else if (score >= 8) {
      notes.push("Warunki są dobre — warto pilnować brań i nie odpuszczać bardziej perspektywicznych miejsc.");
      notes.push("To sensowny czas na regularne dokładanie towaru i utrzymanie stanowiska w pracy.");
    } else if (score >= 6) {
      notes.push("Warunki są umiarkowanie dobre — łowić warto, ale trzeba bardziej liczyć na cierpliwość i poprawne podanie zestawu.");
      notes.push("Najwięcej sensu ma polowanie na lepsze godziny i utrzymanie porządku w taktyce.");
    } else {
      notes.push("Warunki są słabsze — nastaw się bardziej na przeczekanie i wykorzystanie lepszego okna pogodowego.");
      notes.push("Teraz kluczowa będzie cierpliwość, prostota i dobra obserwacja wody.");
    }

    if (wind >= 8 && wind <= 22) notes.push("Wiatr pracuje na plus, więc warto wykorzystać bardziej aktywną stronę wody.");
    if (rain > 0 && rain <= 1.5) notes.push("Lekki opad może poprawić aktywność — dobrze zachować gotowość szczególnie przy zmianie światła.");
    if (cloud < 20) notes.push("Przy małym zachmurzeniu warto liczyć się z ostrożniejszym zachowaniem ryb w pełnym świetle.");

    if (bestWindow?.best) {
      notes.push(`Najmocniejsze przewidywane okno aktywności: ${formatHour(bestWindow.best.time)} (${bestWindow.best.label}).`);
    }

    return notes;
  }

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
    const params = new URLSearchParams({
      latitude: String(spot.latitude),
      longitude: String(spot.longitude),
      current: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "dew_point_2m",
        "precipitation",
        "weather_code",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "visibility",
        "uv_index"
      ].join(","),
      hourly: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "dew_point_2m",
        "precipitation",
        "weather_code",
        "pressure_msl",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "cloud_cover",
        "visibility",
        "uv_index",
        "soil_temperature_0cm",
        "soil_moisture_0_to_1cm"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max",
        "wind_direction_10m_dominant",
        "wind_gusts_10m_max",
        "sunshine_duration",
        "uv_index_max"
      ].join(","),
      timezone: "auto",
      forecast_days: "7"
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) throw new Error(`Błąd pobierania pogody: ${response.status}`);
    return response.json();
  }

  function renderCurrentWeatherEnhanced(data) {
    const current = data.current;
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
    const moon = moonPhaseInfo(new Date());
    const night = pickNearestNightWindow(hourly, currentIndex);

    const biteAnalysis = buildBiteAnalysis(data, currentIndex);
    const bestWindow = buildBestBiteWindow(data, currentIndex);
    const biteTactic = buildBiteTactic(biteAnalysis.score, bestWindow, current);

    if ($("weather-current-condition-icon")) $("weather-current-condition-icon").textContent = icon;
    if ($("weather-summary-location")) $("weather-summary-location").textContent = spot.name || "Miejsce zasiadki";
    if ($("weather-summary-updated")) {
      $("weather-summary-updated").textContent = `Aktualizacja: ${new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
    }
    if ($("weather-rating-hero")) $("weather-rating-hero").textContent = `Ocena: ${rating}`;
    if ($("bite-chance-hero")) $("bite-chance-hero").textContent = `Brania: ${biteAnalysis.label}`;

    if ($("weather-current-temp")) $("weather-current-temp").textContent = `${Number(current.temperature_2m).toFixed(1)}°C`;
    if ($("weather-current-wind")) $("weather-current-wind").textContent = `${Number(current.wind_speed_10m).toFixed(1)} / ${Number(current.wind_gusts_10m).toFixed(1)} km/h`;
    if ($("weather-current-pressure")) $("weather-current-pressure").textContent = `${Number(current.pressure_msl).toFixed(0)} hPa / ${trend}`;
    if ($("weather-rating")) $("weather-rating").textContent = rating;
    if ($("weather-description")) $("weather-description").textContent = `${icon} ${description}`;
    if ($("weather-description-copy")) $("weather-description-copy").textContent = description;
    if ($("weather-pressure-note")) $("weather-pressure-note").textContent = `Trend: ${trend}`;
    if ($("weather-rating-note")) $("weather-rating-note").textContent = `Warunki: ${rating}`;

    if ($("weather-apparent-temp")) $("weather-apparent-temp").textContent = `${Number(current.apparent_temperature).toFixed(1)}°C`;
    if ($("weather-wind-direction")) $("weather-wind-direction").textContent = `${windDirection} • ${windSummary}`;
    if ($("weather-wind-direction-copy")) $("weather-wind-direction-copy").textContent = `${windDirection} • ${windSummary}`;
    if ($("weather-cloud-cover")) $("weather-cloud-cover").textContent = `${Math.round(Number(current.cloud_cover || 0))}%`;
    if ($("weather-precipitation")) $("weather-precipitation").textContent = `${Number(current.precipitation || 0).toFixed(1)} mm`;
    if ($("weather-humidity")) $("weather-humidity").textContent = `${Math.round(Number(current.relative_humidity_2m || 0))}%`;
    if ($("weather-dew-point")) $("weather-dew-point").textContent = `${Number(current.dew_point_2m || 0).toFixed(1)}°C`;
    if ($("weather-visibility")) $("weather-visibility").textContent = formatVisibility(current.visibility);
    if ($("weather-uv")) $("weather-uv").textContent = current.uv_index !== null && current.uv_index !== undefined ? Number(current.uv_index).toFixed(1) : "--";
    if ($("weather-sunshine")) $("weather-sunshine").textContent = `${Math.round((daily.sunshine_duration?.[0] || 0) / 3600)} h`;

    if ($("camp-night-temp")) $("camp-night-temp").textContent = `${night.temp.toFixed(1)}°C`;
    if ($("camp-night-wind")) $("camp-night-wind").textContent = `${night.wind.toFixed(1)} km/h`;
    if ($("camp-night-gusts")) $("camp-night-gusts").textContent = `${night.gusts.toFixed(1)} km/h`;
    if ($("camp-night-humidity")) $("camp-night-humidity").textContent = `${Math.round(night.humidity)}%`;
    if ($("camp-night-visibility")) $("camp-night-visibility").textContent = formatVisibility(night.visibility);
    if ($("camp-night-rating")) $("camp-night-rating").textContent = getNightCampRating(night);
    if ($("moon-phase")) $("moon-phase").textContent = moon.name;
    if ($("moon-illumination")) $("moon-illumination").textContent = moon.illumination;

    if ($("soil-temp")) $("soil-temp").textContent = `${Number(hourly.soil_temperature_0cm?.[currentIndex] || 0).toFixed(1)}°C`;
    if ($("soil-moisture")) $("soil-moisture").textContent = `${Math.round(Number(hourly.soil_moisture_0_to_1cm?.[currentIndex] || 0) * 100)}%`;

    if ($("wind-arrow")) {
      $("wind-arrow").style.transform = `translate(-50%, -86%) rotate(${Number(current.wind_direction_10m || 0)}deg)`;
    }
    if ($("wind-compass-text")) $("wind-compass-text").textContent = windDirection;
    if ($("wind-direction-long")) $("wind-direction-long").textContent = `${windDirection} • ${getWindStrengthLabel(current.wind_speed_10m)}`;
    if ($("wind-gusts-inline")) $("wind-gusts-inline").textContent = `${Number(current.wind_gusts_10m || 0).toFixed(1)} km/h • ${getWindGustLabel(current.wind_gusts_10m)}`;
    if ($("wind-score-inline")) $("wind-score-inline").textContent = windSummary;

    if ($("bite-chance-main")) $("bite-chance-main").textContent = biteAnalysis.label;
    if ($("bite-score-note")) $("bite-score-note").textContent = `Punktacja: ${biteAnalysis.score}`;
    if ($("best-bite-window")) $("best-bite-window").textContent = bestWindow.best ? formatHour(bestWindow.best.time) : "--";
    if ($("best-bite-window-note")) $("best-bite-window-note").textContent = bestWindow.best ? `Ocena: ${bestWindow.best.label}` : "Brak danych";
    if ($("bite-trend")) {
      $("bite-trend").textContent =
        bestWindow.activityTrend === "poprawa"
          ? "Poprawa"
          : bestWindow.activityTrend === "pogorszenie"
            ? "Pogorszenie"
            : "Stabilnie";
    }
    if ($("bite-trend-note")) {
      $("bite-trend-note").textContent =
        bestWindow.activityTrend === "poprawa"
          ? "Najbliższe godziny wyglądają lepiej"
          : bestWindow.activityTrend === "pogorszenie"
            ? "Warunki mogą osłabnąć"
            : "Bez dużych zmian";
    }
    if ($("bite-tactic-short")) $("bite-tactic-short").textContent = biteScoreToShortTactic(biteAnalysis.score);
    if ($("bite-tactic-note")) {
      $("bite-tactic-note").textContent = bestWindow.best ? `Pilnuj szczególnie około ${formatHour(bestWindow.best.time)}` : "Obserwuj wodę";
    }

    setNotes("weather-interpretation", buildWeatherInterpretation(current, hourly, currentIndex));
    setNotes("camp-interpretation", buildCampInterpretation(night, moon));
    setNotes("bite-analysis", biteAnalysis.notes);
    setNotes("bite-tactic-box", biteTactic);
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
      const card = el("article", "weather-hour-card");
      const top = el("div", "weather-row-top");
      const title = el("div", "weather-row-title");
      const icon = el("div", "weather-row-icon", weatherCodeToIcon(data.hourly.weather_code[i]));

      const textWrap = el("div");
      textWrap.appendChild(el("div", "weather-row-time", formatHour(data.hourly.time[i])));
      textWrap.appendChild(el("div", "weather-row-desc", weatherCodeToText(data.hourly.weather_code[i])));
      title.appendChild(icon);
      title.appendChild(textWrap);

      const trend = getPressureTrend(data.hourly.pressure_msl, i);
      const hour = new Date(data.hourly.time[i]).getHours();
      const biteScore = getBiteScore({
        temperature_2m: data.hourly.temperature_2m[i],
        wind_speed_10m: data.hourly.wind_speed_10m[i],
        wind_gusts_10m: data.hourly.wind_gusts_10m[i],
        pressure_msl: data.hourly.pressure_msl[i],
        cloud_cover: data.hourly.cloud_cover[i],
        precipitation: data.hourly.precipitation[i]
      }, trend, hour);

      const rating = el("div", "section-chip", `${biteScoreToLabel(biteScore)}`);
      top.appendChild(title);
      top.appendChild(rating);
      card.appendChild(top);

      const grid = el("div", "weather-chip-grid");
      grid.appendChild(createWeatherChip("🌡️ Temp.", `${Number(data.hourly.temperature_2m[i]).toFixed(1)}°C`, true));
      grid.appendChild(createWeatherChip("🐟 Brania", biteScoreToLabel(biteScore), true));
      grid.appendChild(createWeatherChip("🌬️ Wiatr", `${Number(data.hourly.wind_speed_10m[i]).toFixed(1)} km/h`));
      grid.appendChild(createWeatherChip("💨 Porywy", `${Number(data.hourly.wind_gusts_10m[i]).toFixed(1)} km/h`));
      grid.appendChild(createWeatherChip("🧭 Kierunek", windDirectionToText(data.hourly.wind_direction_10m[i])));
      grid.appendChild(createWeatherChip("🧭 Ciśnienie", `${Number(data.hourly.pressure_msl[i]).toFixed(0)} hPa`));
      grid.appendChild(createWeatherChip("📈 Trend", trend));
      grid.appendChild(createWeatherChip("🌧️ Opad", `${Number(data.hourly.precipitation[i] || 0).toFixed(1)} mm`));
      grid.appendChild(createWeatherChip("☁️ Chmury", `${Math.round(Number(data.hourly.cloud_cover[i] || 0))}%`));
      grid.appendChild(createWeatherChip("💧 Wilgotność", `${Math.round(Number(data.hourly.relative_humidity_2m[i] || 0))}%`));
      grid.appendChild(createWeatherChip("🌫️ Rosa", `${Number(data.hourly.dew_point_2m[i] || 0).toFixed(1)}°C`));
      grid.appendChild(createWeatherChip("👀 Widzialność", formatVisibility(data.hourly.visibility[i])));
      grid.appendChild(createWeatherChip("☀️ UV", `${Number(data.hourly.uv_index?.[i] || 0).toFixed(1)}`));
      grid.appendChild(createWeatherChip("🌱 Gleba", `${Number(data.hourly.soil_temperature_0cm?.[i] || 0).toFixed(1)}°C`));

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
      const icon = el("div", "weather-row-icon", weatherCodeToIcon(data.daily.weather_code[index]));

      const textWrap = el("div");
      textWrap.appendChild(el("div", "weather-row-time", formatDay(time)));
      textWrap.appendChild(el("div", "weather-row-desc", weatherCodeToText(data.daily.weather_code[index])));
      title.appendChild(icon);
      title.appendChild(textWrap);

      const tag = el("div", "section-chip", `UV max ${Number(data.daily.uv_index_max?.[index] || 0).toFixed(1)}`);
      top.appendChild(title);
      top.appendChild(tag);
      card.appendChild(top);

      const grid = el("div", "weather-chip-grid");
      grid.appendChild(createWeatherChip("🌡️ Min / Max", `${Number(data.daily.temperature_2m_min[index]).toFixed(1)}°C / ${Number(data.daily.temperature_2m_max[index]).toFixed(1)}°C`, true));
      grid.appendChild(createWeatherChip("🌧️ Opad", `${Number(data.daily.precipitation_sum[index] || 0).toFixed(1)} mm`));
      grid.appendChild(createWeatherChip("🌬️ Wiatr max", `${Number(data.daily.wind_speed_10m_max[index] || 0).toFixed(1)} km/h`));
      grid.appendChild(createWeatherChip("💨 Porywy", `${Number(data.daily.wind_gusts_10m_max[index] || 0).toFixed(1)} km/h`));
      grid.appendChild(createWeatherChip("🧭 Kierunek", windDirectionToText(data.daily.wind_direction_10m_dominant[index] || 0)));
      grid.appendChild(createWeatherChip("🌞 Słońce", `${Math.round((data.daily.sunshine_duration[index] || 0) / 3600)} h`));

      card.appendChild(grid);
      container.appendChild(card);
    });
  }

  async function renderEnhancedWeatherPage() {
    if (!$("weather-current-temp")) return;

    try {
      $("weather-current-temp").textContent = "Ładowanie...";
      const data = await fetchWeatherDataEnhanced();
      renderCurrentWeatherEnhanced(data);
      renderHourlyWeatherEnhanced(data);
      renderDailyWeatherEnhanced(data);
    } catch (error) {
      console.error(error);
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
        if ($(id)) $(id).textContent = "Błąd";
      });
      setNotes("weather-interpretation", ["Nie udało się pobrać danych pogodowych."]);
      setNotes("camp-interpretation", ["Brak danych do oceny obozowania."]);
      setNotes("bite-analysis", ["Brak danych do analizy brań."]);
      setNotes("bite-tactic-box", ["Brak danych do rekomendacji."]);
    }
  }

  async function overrideChecklistSubmit(event) {
    const form = $("checklist-form");
    if (!form) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const client = getSupabaseClientSafe();
    if (!client) return;

    const editId = $("edit-check-id")?.value || "";
    const category = normalizeText($("check-category")?.value, 40);
    const itemName = normalizeText($("check-name")?.value, 80);
    const unit = normalizeText($("check-unit")?.value, 20) || "szt.";
    const quantityRaw = $("check-quantity")?.value;
    const quantity = quantityRaw === "" ? null : Number(quantityRaw);

    const allowedCategories = ["sprzęt", "zakupy", "jedzenie / picie"];
    const allowedUnits = ["szt.", "kg", "litry"];

    const message = $("checklist-message");
    const setMessage = (text, type = "") => {
      if (!message) return;
      message.textContent = text;
      message.className = `form-message ${type}`.trim();
    };

    if (!allowedCategories.includes(category)) {
      setMessage("Wybierz poprawną kategorię.", "error");
      return;
    }

    if (!itemName) {
      setMessage("Podaj nazwę pozycji.", "error");
      return;
    }

    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) {
      setMessage("Ilość musi być liczbą 0 lub większą.", "error");
      return;
    }

    if (!allowedUnits.includes(unit)) {
      setMessage("Wybierz poprawną jednostkę.", "error");
      return;
    }

    setMessage(editId ? "Zapisywanie zmian..." : "Dodawanie pozycji...");

    try {
      if (editId) {
        const { data: existing, error: existingError } = await client
          .from("checklist_items")
          .select("done")
          .eq("id", Number(editId))
          .single();

        if (existingError) throw existingError;

        const { error } = await client
          .from("checklist_items")
          .update({
            category,
            item_name: itemName,
            quantity,
            unit,
            done: Boolean(existing?.done)
          })
          .eq("id", Number(editId));

        if (error) throw error;
        setMessage("Zmiany zapisane.", "success");
      } else {
        const { error } = await client
          .from("checklist_items")
          .insert([{
            category,
            item_name: itemName,
            quantity,
            unit,
            done: false
          }]);

        if (error) throw error;
        setMessage("Pozycja została dodana.", "success");
      }

      form.reset();
      if ($("edit-check-id")) $("edit-check-id").value = "";
      if ($("checklist-form-title")) $("checklist-form-title").textContent = "Dodaj pozycję";
      if ($("save-check-btn")) $("save-check-btn").textContent = "Dodaj pozycję";
      if ($("cancel-edit-check-btn")) $("cancel-edit-check-btn").classList.add("hidden");

      if (typeof renderChecklistPage === "function") {
        await renderChecklistPage();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error(error);
      setMessage(editId ? "Nie udało się zapisać zmian." : "Nie udało się dodać pozycji.", "error");
    }
  }

  function enhanceNavigationIcons() {
    const nav = document.querySelector(".main-nav");
    if (nav) nav.classList.add("nav-iconized");
  }

  function bindRefreshButton() {
    $("refresh-weather-btn")?.addEventListener("click", function () {
      renderEnhancedWeatherPage();
    });
  }

  function bindChecklistFix() {
    const form = $("checklist-form");
    if (!form) return;
    form.addEventListener("submit", overrideChecklistSubmit, true);
  }

  function init() {
    enhanceNavigationIcons();
    bindRefreshButton();

    if ($("weather-current-temp")) {
      renderEnhancedWeatherPage();
    }
  }

  function bootFixes() {
    if (window.RybyAuth && !window.RybyAuth.isAuthenticated()) {
      document.addEventListener("ryby:auth-success", init, { once: true });
      return;
    }
    init();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootFixes);
  } else {
    bootFixes();
  }
})();
