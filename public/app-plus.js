(() => {
  const $ = (id) => document.getElementById(id);

  const STATUS_CLASSES = ["status-info", "status-success", "status-warn", "status-danger"];

  const APP_STATE = {
    checklistFilter: "all",
    checklistSort: "category",
    checklistTripOnly: false
  };

  function clearStatusClasses(node) {
    if (!node) return;
    node.classList.remove(...STATUS_CLASSES);
  }

  function applyStatus(node, status) {
    if (!node) return;
    clearStatusClasses(node);
    if (status) node.classList.add(`status-${status}`);
  }

  function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value;
  }

  function normalizeTextSafe(value, max = 200) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  }

  function formatDatePL(value) {
    if (!value) return "Brak danych";
    const date = new Date(value);
    return date.toLocaleDateString("pl-PL", {
      timeZone: Dream.zone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function formatDateTimePL(value) {
    if (!value) return "Brak danych";
    const date = new Date(value);
    return date.toLocaleString("pl-PL", {
      timeZone: Dream.zone(),
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatHourPL(value) {
    if (!value) return "Brak";
    const date = new Date(value);
    return date.toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function average(values) {
    if (!values.length) return 0;
    return values.reduce((sum, val) => sum + Number(val || 0), 0) / values.length;
  }

  function getMode(values, fallback = "Brak danych") {
    if (!values.length) return fallback;
    const counter = new Map();

    values.forEach((value) => {
      const key = String(value ?? "").trim();
      if (!key) return;
      counter.set(key, (counter.get(key) || 0) + 1);
    });

    let bestKey = fallback;
    let bestCount = 0;

    counter.forEach((count, key) => {
      if (count > bestCount) {
        bestCount = count;
        bestKey = key;
      }
    });

    return bestKey;
  }

  function getSpotName(item, spotsMap) {
    if (Number.isFinite(Number(item.spot_id)) && spotsMap.has(Number(item.spot_id))) {
      return spotsMap.get(Number(item.spot_id)).name;
    }
    return normalizeTextSafe(item.spot || "Brak", 80) || "Brak";
  }

  function getWeatherStatusByRating(text) {
    const value = String(text || "").toLowerCase();
    if (value.includes("bardzo") || value.includes("wysoka") || value.includes("dobre")) return "success";
    if (value.includes("dobra") || value.includes("średnia") || value.includes("średnie")) return "warn";
    if (value.includes("słabe") || value.includes("słaba") || value.includes("trudniejsze")) return "danger";
    return "info";
  }

  function getCountStatus(value) {
    if (value <= 0) return "danger";
    if (value <= 2) return "warn";
    return "success";
  }

  function getOpenItemsStatus(value) {
    if (value <= 0) return "success";
    if (value <= 3) return "warn";
    return "danger";
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

  function parseNum(value, allowNull = true) {
    if (value === "" || value === null || value === undefined) return allowNull ? null : NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function createNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clearNode(node) {
    if (!node) return;
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function getSpotCoordsSafe() {
    try {
      if (typeof FISHING_SPOT !== "undefined" && FISHING_SPOT) return FISHING_SPOT;
    } catch (_) {}
    return {
      latitude: null,
      longitude: null,
      name: "Łowisko"
    };
  }

  let dashboardWeatherCache=null;
  async function fetchDashboardWeatherAlerts() {
    if(dashboardWeatherCache && Date.now()-dashboardWeatherCache.at<600000)return dashboardWeatherCache.data;
    const spot = getSpotCoordsSafe();
    if (spot.latitude == null || spot.longitude == null) throw new Error("Brak GPS łowiska.");
    const response = await fetch(`/api/weather?tripId=${encodeURIComponent(window.DREAM_TRIP.id)}`, {signal:AbortSignal.timeout(18000)});
    if (!response.ok) throw new Error(`Weather ${response.status}`);
    const data=await response.json();
    dashboardWeatherCache={at:Date.now(),data};
    return data;
  }

  function getPressureTrend(pressures, currentIndex) {
    const prev = Number(pressures?.[Math.max(0, currentIndex - 3)] ?? 0);
    const current = Number(pressures?.[currentIndex] ?? 0);
    const diff = current - prev;
    if (diff > 2) return "rośnie";
    if (diff < -2) return "spada";
    return "stabilne";
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

  function biteScoreLabel(score) {
    if (score >= 10) return "Bardzo wysoka";
    if (score >= 8) return "Wysoka";
    if (score >= 6) return "Dobra";
    if (score >= 4) return "Średnia";
    return "Słaba";
  }

  function createAlertsSection() {
    let section = $("dashboard-alerts");
    if (section) return section;

    const main = document.querySelector("main.container.page-content");
    const hero = document.querySelector(".hero-card");
    if (!main || !hero) return null;

    section = document.createElement("section");
    section.id = "dashboard-alerts";
    section.className = "alert-grid";
    hero.insertAdjacentElement("afterend", section);
    return section;
  }

  function renderAlertCards(cards) {
    const wrap = createAlertsSection();
    if (!wrap) return;
    clearNode(wrap);

    cards.forEach((card) => {
      const article = createNode("article", `alert-card status-${card.status || "info"}`);
      article.appendChild(createNode("small", "", card.title));
      article.appendChild(createNode("strong", "", card.value));
      wrap.appendChild(article);
    });
  }

  async function renderDashboardExtras(cachedCatches, cachedSpots, cachedChecklist) {
    if (!$("total-weight") || typeof loadCatchesFromD1 !== "function") return;

    try {
      const [catches, spots, checklistItems] = cachedCatches ? [cachedCatches, cachedSpots, cachedChecklist] : await Promise.all([
        loadCatchesFromD1(),
        typeof loadSpotsFromD1 === "function" ? loadSpotsFromD1() : [],
        typeof loadChecklistFromD1 === "function" ? loadChecklistFromD1() : []
      ]);

      const spotsMap = new Map(spots.map((spot) => [Number(spot.id), spot]));
      const sortedCatches = [...catches].sort((a, b) => new Date(b.caught_at) - new Date(a.caught_at));
      const latestCatch = sortedCatches[0] || null;
      const weights = catches.map((item) => Number(item.weight || 0)).filter((n) => Number.isFinite(n) && n > 0);
      const avgWeight = weights.length ? average(weights).toFixed(1) : "0.0";

      const dayTotals = new Map();
      const hourTotals = new Map();
      const baits = [];
      const spotNames = [];

      catches.forEach((item) => {
        const dayKey = Dream.day(item.caught_at);
        dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + Number(item.weight || 0));

        const hourKey = Dream.hour(item.caught_at).toString().padStart(2, "0") + ":00";
        hourTotals.set(hourKey, (hourTotals.get(hourKey) || 0) + 1);

        baits.push(normalizeTextSafe(item.bait, 80));
        spotNames.push(getSpotName(item, spotsMap));
      });

      let bestDay = "Brak danych";
      let bestDayWeight = 0;
      dayTotals.forEach((value, key) => {
        if (value > bestDayWeight) {
          bestDayWeight = value;
          bestDay = `${key} (${value.toFixed(1)} kg)`;
        }
      });

      let bestHour = "Brak danych";
      let bestHourCount = 0;
      hourTotals.forEach((value, key) => {
        if (value > bestHourCount) {
          bestHourCount = value;
          bestHour = `${key} (${value} brań)`;
        }
      });

      const bestBait = getMode(baits, "Brak danych");
      const bestSpot = getMode(spotNames, "Brak danych");
      const openChecklist = checklistItems.filter((item) => !item.done).length;
      const doneChecklist=checklistItems.length-openChecklist;
      setText('dashboard-check-progress',checklistItems.length?`${doneChecklist}/${checklistItems.length}`:'Pusta lista');
      setText('dashboard-check-inline',checklistItems.length?`${doneChecklist} z ${checklistItems.length} spakowane`:'Pusta lista');
      if($('dashboard-check-bar'))$('dashboard-check-bar').style.width=checklistItems.length?`${doneChecklist/checklistItems.length*100}%`:'0%';
      setText("dashboard-last-fish", latestCatch ? `${Number(latestCatch.weight).toFixed(1)} kg` : "Brak");
      setText("dashboard-best-day", bestDay);
      setText("dashboard-best-hour", bestHour);
      setText("dashboard-most-bait", bestBait);
      setText("dashboard-most-spot", bestSpot);
      setText("dashboard-avg-weight", `${avgWeight} kg`);

      applyStatus($("total-weight")?.closest(".stat-card"), catches.length ? "success" : "info");
      applyStatus($("total-fish")?.closest(".stat-card"), catches.length ? "success" : "warn");
      applyStatus($("biggest-fish")?.closest(".stat-card"), catches.length ? "success" : "info");
      applyStatus($("biggest-fish-person")?.closest(".stat-card"), catches.length ? "success" : "info");
      applyStatus($("best-spot")?.closest(".stat-card"), bestSpot !== "Brak danych" ? "info" : "warn");
      applyStatus($("spots-count-dashboard")?.closest(".stat-card"), spots.length ? "success" : "warn");

      let bestBiteWindow = "Brak danych";
      let tomorrowWind = "Brak danych";
      let currentWeather = "Brak prognozy";
      let dashboardWarning = openChecklist > 0
        ? `Brakuje jeszcze ${openChecklist} rzeczy z checklist.`
        : "Checklisty wyglądają dobrze.";

      try {
        const weather = await fetchDashboardWeatherAlerts();
        const temp=Number(weather.current?.temperature_2m),wind=Number(weather.current?.wind_speed_10m);
        if(Number.isFinite(temp)&&Number.isFinite(wind))currentWeather=`${temp.toFixed(0)}°C · wiatr ${wind.toFixed(0)} km/h`;
        setText('dashboard-weather-now',currentWeather);
        const localNow = Dream.dateInput(new Date().toISOString(), weather.timezone || Dream.zone());
        const nowIndex = Math.max(0, weather.hourly.time.findIndex(t => t >= localNow.slice(0,13)+':00'));
        const limit = Math.min(weather.hourly.time.length, nowIndex + 24);
        let bestScore = -999;
        let bestIndex = 0;

        for (let i = nowIndex; i < limit; i += 1) {
          const hour = new Date(weather.hourly.time[i]).getHours();
          const trend = getPressureTrend(weather.hourly.pressure_msl, i);
          const score = getBiteScore({
            temperature_2m: weather.hourly.temperature_2m[i],
            wind_speed_10m: weather.hourly.wind_speed_10m[i],
            wind_gusts_10m: weather.hourly.wind_gusts_10m[i],
            pressure_msl: weather.hourly.pressure_msl[i],
            cloud_cover: weather.hourly.cloud_cover[i],
            precipitation: weather.hourly.precipitation[i]
          }, trend, hour);

          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }

        const bestDate = new Date(weather.hourly.time[bestIndex]);
        const bestHourStart = bestDate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        const bestHourEndDate = new Date(bestDate.getTime() + 60 * 60 * 1000);
        const bestHourEnd = bestHourEndDate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
        bestBiteWindow = `${bestHourStart}–${bestHourEnd} (${biteScoreLabel(bestScore)})`;

        const tomorrowWindValue = Number(weather.daily.wind_speed_10m_max?.[1] || 0);
        const tomorrowGustsValue = Number(weather.daily.wind_gusts_10m_max?.[1] || 0);
        tomorrowWind = `${tomorrowWindValue.toFixed(1)} km/h • ${describeWind(tomorrowWindValue, tomorrowGustsValue)}`;
        if (tomorrowWindValue >= 28 || tomorrowGustsValue >= 40) {
          dashboardWarning = `Uwaga: jutro wiatr będzie mocny i wyraźnie porywisty.`;
        } else if (tomorrowWindValue >= 20 || tomorrowGustsValue >= 30) {
          dashboardWarning = `Jutro wiatr będzie odczuwalny, ustaw stanowisko z głową.`;
        } else if (openChecklist > 0) {
          dashboardWarning = `Brakuje jeszcze ${openChecklist} rzeczy z checklist.`;
        }
      } catch (_) { setText('dashboard-weather-now','Brak prognozy'); }

      renderAlertCards([
        {
          title: "Teraz nad wodą",
          value: currentWeather,
          status: currentWeather === "Brak prognozy" ? "info" : "success"
        },
        {
          title: "🎣 Najbliższe 24 h · orientacyjne warunki",
          value: bestBiteWindow,
          status: bestBiteWindow === "Brak danych" ? "info" : "success"
        },
        {
          title: "🌬️ Jutro wiatr",
          value: tomorrowWind,
          status: tomorrowWind === "Brak danych"
            ? "info"
            : tomorrowWind.includes("bardzo mocny") || tomorrowWind.includes("bardzo porywisty") || tomorrowWind.includes("mocny, mocno porywisty")
              ? "danger"
              : tomorrowWind.includes("odczuwalny") || tomorrowWind.includes("porywisty")
                ? "warn"
                : "info"
        },
        {
          title: "📦 Do spakowania",
          value: openChecklist > 0 ? `${openChecklist} rzeczy` : "Nic nie brakuje",
          status: openChecklist > 0 ? "warn" : "success"
        },
        {
          title: "✅ Spakowane",
          value: `${checklistItems.filter((item) => item.done).length} rzeczy`,
          status: checklistItems.filter((item) => item.done).length > 0 ? "success" : "info"
        }
      ]);
    } catch (error) {
      console.error("Błąd rozszerzonego dashboardu:", error);
    }
  }

  function ensureChecklistToolbar() {
    if ($("check-toolbar")) return;

    const section = document.querySelector("#checklist-groups")?.closest(".panel-card");
    if (!section) return;

    const sectionHead = section.querySelector(".section-head");
    if (!sectionHead) return;

    const toolbar = document.createElement("div");
    toolbar.id = "check-toolbar";
    toolbar.className = "check-toolbar";
    toolbar.innerHTML = `
      <div id="check-progress" class="check-progress" role="status">Wczytywanie postępu…</div>
      <div class="check-category-tools"><button type="button" id="check-add-category" class="secondary-btn">+ Kategoria</button><button type="button" id="check-show-hidden" class="secondary-btn">Pokaż ukryte</button></div>
      <form id="check-category-create" class="check-category-create hidden"><label for="check-category-name">Nazwa nowej kategorii</label><input id="check-category-name" maxlength="100" required><button type="submit">Dodaj kategorię</button></form>
      <details class="check-category-manager"><summary>Zarządzaj kategoriami</summary><div id="check-category-manager-list"></div></details>
      <div class="filter-bar">
        <button type="button" class="filter-btn active" data-filter="all">Wszystkie</button>
        <button type="button" class="filter-btn" data-filter="open">Do zrobienia</button>
        <button type="button" class="filter-btn" data-filter="done">Zrobione</button>
      </div>

      <label class="check-search-label" for="check-search">Szukaj na liście</label>
      <input id="check-search" type="search" placeholder="Szukaj rzeczy…" autocomplete="off" />

      <details class="check-options">
      <summary>Sortowanie i inne opcje</summary>
      <select id="check-sort-select" aria-label="Sortowanie checklisty">
        <option value="category">Sortuj: kategoria</option>
        <option value="name">Sortuj: nazwa</option>
        <option value="created">Sortuj: data dodania</option>
      </select>

      <div class="toolbar-actions">
        <button type="button" id="check-trip-only-btn" class="secondary-btn">Tylko rzeczy na wyjazd</button>
        <button type="button" id="check-uncheck-all-btn" class="secondary-btn">Odznacz wszystko</button>
      </div>

      <div id="check-toolbar-status" class="status-chip status-info">Tryb standardowy</div>
      </details>
    `;

    sectionHead.insertAdjacentElement("afterend", toolbar);

    const summaryPanel = document.querySelector("#check-open-count")?.closest(".panel-card");
    if (summaryPanel && !$("check-extra-stats")) {
      const extra = document.createElement("div");
      extra.id = "check-extra-stats";
      extra.className = "small-stat-row";
      extra.innerHTML = `
        <div class="small-stat-box">
          <span>Brakuje na wyjazd</span>
          <strong id="check-trip-open-count">0</strong>
        </div>
        <div class="small-stat-box">
          <span>Sprzęt otwarty</span>
          <strong id="check-equipment-open-count">0</strong>
        </div>
        <div class="small-stat-box">
          <span>Zakupy otwarte</span>
          <strong id="check-shopping-open-count">0</strong>
        </div>
        <div class="small-stat-box">
          <span>Jedzenie / picie otwarte</span>
          <strong id="check-food-open-count">0</strong>
        </div>
      `;
      summaryPanel.appendChild(extra);
    }
  }

  function getTripItems(items) {
    return items.filter((item) => item.category !== "zakupy");
  }

  function bindChecklistPlusEvents() {
    const toolbar = $("check-toolbar");
    if (!toolbar || toolbar.dataset.bound === "1") return;
    toolbar.dataset.bound = "1";
    $('check-add-category').onclick=()=>{$('check-category-create').classList.toggle('hidden');$('check-category-name').focus();};
    $('check-category-create').onsubmit=async event=>{event.preventDefault();try{await Dream.api('/api/checklist-categories',{method:'POST',body:JSON.stringify({name:$('check-category-name').value})});$('check-category-create').reset();$('check-category-create').classList.add('hidden');await refreshChecklistCategories();Dream.notice('Dodano kategorię.');}catch(error){Dream.notice(error.message,true);}};
    $('check-show-hidden').onclick=()=>{APP_STATE.showHiddenCategories=!APP_STATE.showHiddenCategories;$('check-show-hidden').textContent=APP_STATE.showHiddenCategories?'Ukryj nieaktywne':'Pokaż ukryte';renderChecklistGroupsPlus(filterChecklistItems(APP_STATE.checklistItems||[]));};

    toolbar.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        APP_STATE.checklistFilter = btn.dataset.filter;
        toolbar.querySelectorAll("[data-filter]").forEach((n) => n.classList.remove("active"));
        btn.classList.add("active");
        renderChecklistPagePlus();
      });
    });

    $("check-search")?.addEventListener("input", (event) => {
      APP_STATE.checklistSearch = event.target.value.trim().toLocaleLowerCase('pl');
      renderChecklistGroupsPlus(filterChecklistItems(APP_STATE.checklistItems || []));
    });

    $("check-sort-select")?.addEventListener("change", (e) => {
      APP_STATE.checklistSort = e.target.value;
      renderChecklistPagePlus();
    });

    $("check-trip-only-btn")?.addEventListener("click", () => {
      APP_STATE.checklistTripOnly = !APP_STATE.checklistTripOnly;
      renderChecklistPagePlus();
    });

    $("check-uncheck-all-btn")?.addEventListener("click", async () => {
      if (!window.d1Client) return;
      const items = await loadChecklistFromD1();
      const ids = items.filter((item) => item.done).map((item) => Number(item.id));
      if (!ids.length) return;
      if (!window.confirm(`Odznaczyć ${ids.length} pozycji w tym wyjeździe?`)) return;
      const { error } = await d1Client.from("checklist_items").update({ done: false }).in("id", ids);
      if (error) {
        window.alert("Nie udało się odznaczyć wszystkich pozycji.");
        return;
      }
      await renderChecklistPagePlus();
    });
  }

  async function refreshChecklistCategories(){
    const response=await Dream.api('/api/checklist-categories');window.DREAM_CATEGORIES=response.categories;
    const select=$('check-category'),value=select?.value;
    if(select){select.replaceChildren(...response.categories.filter(c=>c.active).map(c=>{const option=document.createElement('option');option.value=c.name;option.textContent=c.name;return option;}));if(response.categories.some(c=>c.active&&c.name===value))select.value=value;}
    renderChecklistCategoryManager();renderChecklistGroupsPlus(filterChecklistItems(APP_STATE.checklistItems||[]));
  }
  function renderChecklistCategoryManager(){
    const host=$('check-category-manager-list');if(!host)return;clearNode(host);
    const categories=window.DREAM_CATEGORIES||[];
    for(const [index,c] of categories.entries()){
      const row=createNode('div','check-category-manage-row');
      const name=document.createElement('input');name.value=c.name;name.maxLength=100;name.setAttribute('aria-label',`Nazwa kategorii ${c.name}`);
      const save=createNode('button','secondary-btn','Zapisz nazwę');save.type='button';save.onclick=async()=>changeCategory(c,{name:name.value});
      const up=createNode('button','secondary-btn','↑');up.type='button';up.setAttribute('aria-label',`Przenieś ${c.name} wyżej`);up.disabled=index===0;up.onclick=()=>moveCategory(c,categories[index-1]);
      const down=createNode('button','secondary-btn','↓');down.type='button';down.setAttribute('aria-label',`Przenieś ${c.name} niżej`);down.disabled=index===categories.length-1;down.onclick=()=>moveCategory(c,categories[index+1]);
      const hide=createNode('button','secondary-btn',c.active?'Ukryj':'Pokaż');hide.type='button';hide.onclick=()=>changeCategory(c,{active:!c.active});
      const target=document.createElement('select');target.setAttribute('aria-label',`Przenieś pozycje z ${c.name} do`);target.innerHTML='<option value="">Kategoria docelowa przy usuwaniu</option>';for(const other of categories.filter(x=>x.id!==c.id&&x.active)){const option=document.createElement('option');option.value=other.id;option.textContent=other.name;target.append(option);}
      const del=createNode('button','danger-btn','Usuń');del.type='button';del.onclick=async()=>{if(!confirm(`Usunąć kategorię ${c.name}? Pozycje pozostaną na liście tylko po przeniesieniu.`))return;try{if(target.value)await Dream.api(`/api/checklist-categories/${encodeURIComponent(c.id)}`,{method:'PATCH',body:JSON.stringify({moveToId:target.value})});await Dream.api(`/api/checklist-categories/${encodeURIComponent(c.id)}`,{method:'DELETE',body:'{}'});await refreshChecklistCategories();await renderChecklistPagePlus();Dream.notice('Usunięto kategorię, zachowując pozycje i statusy.');}catch(error){Dream.notice(error.message,true);}};
      row.append(name,save,up,down,hide,target,del);host.append(row);
    }
  }
  async function changeCategory(c,changes){try{await Dream.api(`/api/checklist-categories/${encodeURIComponent(c.id)}`,{method:'PATCH',body:JSON.stringify(changes)});await refreshChecklistCategories();await renderChecklistPagePlus();Dream.notice('Kategoria zapisana.');}catch(error){Dream.notice(error.message,true);}}
  async function moveCategory(c,other){try{await Dream.api(`/api/checklist-categories/${encodeURIComponent(c.id)}`,{method:'PATCH',body:JSON.stringify({sortOrder:other.sortOrder})});await Dream.api(`/api/checklist-categories/${encodeURIComponent(other.id)}`,{method:'PATCH',body:JSON.stringify({sortOrder:c.sortOrder})});await refreshChecklistCategories();}catch(error){Dream.notice(error.message,true);}}

  function renderChecklistSummaryPlus(items) {
    const all = items.length;
    const done = items.filter((item) => item.done).length;
    const open = items.filter((item) => !item.done).length;
    const tripOpen = getTripItems(items).filter((item) => !item.done).length;
    const equipmentOpen = items.filter((item) => item.category === "sprzęt" && !item.done).length;
    const shoppingOpen = items.filter((item) => item.category === "zakupy" && !item.done).length;
    const foodOpen = items.filter((item) => item.category === "jedzenie / picie" && !item.done).length;

    setText("check-all-count", String(all));
    setText("check-done-count", String(done));
    setText("check-open-count", String(open));
    setText("check-trip-open-count", String(tripOpen));
    setText("check-equipment-open-count", String(equipmentOpen));
    setText("check-shopping-open-count", String(shoppingOpen));
    setText("check-food-open-count", String(foodOpen));
    setText("check-progress", `Spakowane ${done} z ${all} · pozostało ${open}`);

    applyStatus($("check-all-count")?.closest(".mini-stats div"), all ? "info" : "warn");
    applyStatus($("check-done-count")?.closest(".mini-stats div"), done ? "success" : "warn");
    applyStatus($("check-open-count")?.closest(".mini-stats div"), getOpenItemsStatus(open));

    const statusNode = $("check-toolbar-status");
    if (statusNode) {
      clearStatusClasses(statusNode);
      if (APP_STATE.checklistTripOnly) {
        statusNode.textContent = "Widok: rzeczy na wyjazd";
        statusNode.classList.add("status-warn");
      } else {
        statusNode.textContent = "Widok: standardowy";
        statusNode.classList.add("status-info");
      }
    }
  }

  function sortChecklistItems(items) {
    const list = [...items];
    if (APP_STATE.checklistSort === "name") {
      list.sort((a, b) => normalizeTextSafe(a.item_name).localeCompare(normalizeTextSafe(b.item_name), "pl"));
    } else if (APP_STATE.checklistSort === "created") {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      const order = Object.fromEntries((window.DREAM_CATEGORIES||[]).map(c=>[c.name,c.sortOrder]));
      list.sort((a, b) => {
        const left = order[a.category] || 99;
        const right = order[b.category] || 99;
        if (left !== right) return left - right;
        return normalizeTextSafe(a.item_name).localeCompare(normalizeTextSafe(b.item_name), "pl");
      });
    }
    return list;
  }

  function filterChecklistItems(items) {
    let list = [...items];

    if (APP_STATE.checklistSearch) {
      list = list.filter((item) => `${item.item_name} ${item.category} ${item.quantity ?? ''} ${item.unit ?? ''}`.toLocaleLowerCase('pl').includes(APP_STATE.checklistSearch));
    }

    if (APP_STATE.checklistFilter === "done") {
      list = list.filter((item) => item.done);
    } else if (APP_STATE.checklistFilter === "open") {
      list = list.filter((item) => !item.done);
    }

    if (APP_STATE.checklistTripOnly) {
      list = getTripItems(list).filter((item) => !item.done);
    }

    return sortChecklistItems(list);
  }

  function renderChecklistGroupsPlus(items) {
    const container = $("checklist-groups");
    if (!container) return;
    clearNode(container);

    const definitions=window.DREAM_CATEGORIES||[];
    const categories=[...definitions.filter(c=>c.active||APP_STATE.showHiddenCategories).map(c=>c.name),...new Set(items.map(item=>item.category).filter(name=>!definitions.some(c=>c.name===name)))];
    if(!categories.length){container.appendChild(createNode('div','empty-box','Brak kategorii. Dodaj pierwszą kategorię.'));return;}
    const stateKey=`dream-check-collapsed-${window.DREAM_TRIP?.id||'default'}`;
    let saved={};try{saved=JSON.parse(localStorage.getItem(stateKey)||'{}');}catch{}
    categories.forEach((category,index) => {
      const definition=definitions.find(c=>c.name===category),all=(APP_STATE.checklistItems||[]).filter(item=>item.category===category),done=all.filter(item=>item.done).length;
      const section = createNode("details", "checklist-group");
      section.dataset.category=category;
      section.open=saved[definition?.id||category]??index===0;
      const header=createNode('summary','check-category-summary',`${category}${definition&&!definition.active?' · ukryta':''}  ${done}/${all.length}`);
      section.append(header);section.addEventListener('toggle',()=>{saved[definition?.id||category]=section.open;localStorage.setItem(stateKey,JSON.stringify(saved));});
      const wrap = createNode("div", "checklist-items");
      if(definition?.active){const add=createNode('button','secondary-btn check-add-in-category','+ Dodaj pozycję');add.type='button';add.onclick=()=>{const select=$('check-category');select.value=category;$('checklist-form').scrollIntoView({behavior:'smooth',block:'start'});$('check-name').focus();};wrap.append(add);}

      items
        .filter((item) => item.category === category)
        .forEach((item) => {
          const row = createNode("div", `check-item-row ${item.done ? "is-done" : "is-open"}`);

          const left = createNode("label", "check-item-left");
          const checkbox = document.createElement("input");
          checkbox.id = `check-item-${item.id}`;
          left.htmlFor = checkbox.id;
          checkbox.setAttribute("aria-label", `Spakowane: ${item.item_name}`);
          checkbox.type = "checkbox";
          checkbox.checked = Boolean(item.done);
          checkbox.addEventListener("change", async () => {
            if (!window.d1Client) return;
            checkbox.disabled = true;
            const { error } = await d1Client.from("checklist_items").update({ done: checkbox.checked }).eq("id", item.id);
            if (error) {
              checkbox.checked = Boolean(item.done);
              checkbox.disabled = false;
              Dream.notice('Nie udało się zapisać zmiany. Sprawdź internet i spróbuj ponownie.',true);
              return;
            }
            await renderChecklistPagePlus();
          });

          const content = createNode("div", "check-item-content");
          const title = createNode("div", `check-item-title${item.done ? " done" : ""}`, normalizeTextSafe(item.item_name, 80));

          const metaParts = [];
          if (item.pendingSync) metaParts.push("Oczekuje na synchronizację");
          if (item.quantity !== null && item.quantity !== undefined) {
            metaParts.push(`${Number(item.quantity)} ${item.unit}`);
          }
          metaParts.push(item.done ? "Spakowane / gotowe" : "Do ogarnięcia");
          if(item.assigned_to)metaParts.push(`Dla: ${item.assigned_to}`);

          const meta = createNode("div", "check-item-meta", metaParts.join(" • "));
          const badges = createNode("div", "check-item-badges");

          const catBadge = createNode("span", "check-item-badge", item.category);
          const statusBadge = createNode("span", "check-item-badge", item.done ? "✅ gotowe" : "🟡 otwarte");
          badges.append(catBadge, statusBadge);

          content.append(title, meta, badges);
          left.append(checkbox, content);

          const actions = createNode("div", "check-item-actions");
          const editBtn = createNode("button", "edit-btn", "Edytuj");
          editBtn.type = "button";
          editBtn.addEventListener("click", () => typeof editChecklistItem === "function" && editChecklistItem(item.id));

          const deleteBtn = createNode("button", "danger-btn", "Usuń");
          deleteBtn.type = "button";
          deleteBtn.addEventListener("click", () => typeof deleteChecklistItem === "function" && deleteChecklistItem(item.id));

          actions.append(editBtn, deleteBtn);
          row.append(left, actions);
          wrap.appendChild(row);
        });

      section.appendChild(wrap);
      container.appendChild(section);
    });
  }

  async function renderChecklistPagePlus() {
    if (!$("checklist-groups") || typeof loadChecklistFromD1 !== "function") return;

    ensureChecklistToolbar();
    bindChecklistPlusEvents();

    const container = $("checklist-groups");
    container.innerHTML = '<div class="empty-box">Ładowanie checklist...</div>';

    const items = await loadChecklistFromD1();
    APP_STATE.checklistItems = items;
    renderChecklistCategoryManager();
    renderChecklistSummaryPlus(items);
    renderChecklistGroupsPlus(filterChecklistItems(items));
  }

  function ensureDashboardExtraGrid() {
    if ($("dashboard-extra-grid")) return;
    const target = $("last-entry")?.closest(".two-column");
    if (!target) return;

    const section = document.createElement("section");
    section.id = "dashboard-extra-grid";
    section.className = "dashboard-extra-grid";
    section.innerHTML = `
      <article class="dashboard-mini-card">
        <span>Ostatnia ryba</span>
        <strong id="dashboard-last-fish">Brak</strong>
      </article>
      <article class="dashboard-mini-card">
        <span>Najlepszy dzień</span>
        <strong id="dashboard-best-day">Brak danych</strong>
      </article>
      <article class="dashboard-mini-card">
        <span>Najlepsza godzina</span>
        <strong id="dashboard-best-hour">Brak danych</strong>
      </article>
      <article class="dashboard-mini-card">
        <span>Najczęstsza przynęta</span>
        <strong id="dashboard-most-bait">Brak danych</strong>
      </article>
      <article class="dashboard-mini-card">
        <span>Najskuteczniejszy spot</span>
        <strong id="dashboard-most-spot">Brak danych</strong>
      </article>
      <article class="dashboard-mini-card">
        <span>Średnia waga ryby</span>
        <strong id="dashboard-avg-weight">0.0 kg</strong>
      </article>
    `;
    target.insertAdjacentElement("beforebegin", section);
  }

  function ensureMapExtras() {
    if ($("map-extra-panel")) return;
    const main = document.querySelector("main.container.page-content");
    const lastPanel = $("spots-list")?.closest(".panel-card");
    if (!main || !lastPanel) return;

    const section = document.createElement("section");
    section.id = "map-extra-panel";
    section.className = "two-column";
    section.innerHTML = `
      <article class="panel-card">
        <div class="section-head">
          <h3>🧠 Skuteczność spotów</h3>
          <span class="section-chip">na podstawie połowów</span>
        </div>

        <div class="mini-stats">
          <div><span>Najskuteczniejszy spot</span><strong id="spots-best-effectiveness">Brak danych</strong></div>
          <div><span>Najwięcej brań</span><strong id="spots-best-count">Brak danych</strong></div>
          <div><span>Najlepsza średnia waga</span><strong id="spots-best-weight">Brak danych</strong></div>
        </div>
      </article>

      <article class="panel-card">
        <div class="section-head">
          <h3>🗺️ Szkic dna / notatka własna</h3>
          <span class="section-chip">własne dane</span>
        </div>

        <div class="spot-map-hint">
          Mapy łowiska są punktem odniesienia. Zapisuj również własne głębokości,
          rodzaj dna, zaczepy, najlepszy czas i krótki opis tego, czego spodziewać się na danym miejscu.
        </div>
      </article>
    `;
    lastPanel.insertAdjacentElement("afterend", section);
  }

  function renderSpotsSummaryPlus(spots, catches) {
    setText("spots-count", String(spots.length));

    const distances = spots.filter(spot => spot.distance_m != null).map(spot => Number(spot.distance_m)).filter(Number.isFinite);
    const depths = spots.filter(spot => spot.depth_m != null).map(spot => Number(spot.depth_m)).filter(Number.isFinite);

    setText("spots-avg-distance", distances.length ? `${average(distances).toFixed(1)} m` : "--");
    setText("spots-avg-depth", depths.length ? `${average(depths).toFixed(1)} m` : "--");

    const bySpot = new Map();

    catches.forEach((item) => {
      const spotId = Number(item.spot_id);
      if (!Number.isFinite(spotId)) return;
      if (!bySpot.has(spotId)) {
        bySpot.set(spotId, { count: 0, weight: 0 });
      }
      const row = bySpot.get(spotId);
      row.count += 1;
      row.weight += Number(item.weight || 0);
    });

    let bestByCount = "Brak danych";
    let bestCount = 0;
    let bestByAvgWeight = "Brak danych";
    let bestAvgWeight = 0;

    spots.forEach((spot) => {
      const stats = bySpot.get(Number(spot.id)) || { count: 0, weight: 0 };
      if (stats.count > bestCount) {
        bestCount = stats.count;
        bestByCount = `${spot.name} (${stats.count})`;
      }
      if (stats.count > 0) {
        const avgW = stats.weight / stats.count;
        if (avgW > bestAvgWeight) {
          bestAvgWeight = avgW;
          bestByAvgWeight = `${spot.name} (${avgW.toFixed(1)} kg)`;
        }
      }
    });

    setText("spots-best-effectiveness", bestByCount);
    setText("spots-best-count", bestByCount);
    setText("spots-best-weight", bestByAvgWeight);
  }

  function renderSpotsListPlus(spots, catches) {
    const list = $("spots-list");
    if (!list) return;
    clearNode(list);

    if (!spots.length) {
      list.appendChild(createNode("div", "empty-box", "Brak zapisanych spotów."));
      return;
    }

    const catchesBySpot = new Map();
    catches.forEach((item) => {
      const spotId = Number(item.spot_id);
      if (!Number.isFinite(spotId)) return;
      if (!catchesBySpot.has(spotId)) catchesBySpot.set(spotId, []);
      catchesBySpot.get(spotId).push(item);
    });

    spots.forEach((item) => {
      const linkedCatches = catchesBySpot.get(Number(item.id)) || [];
      const avgWeight = linkedCatches.length
        ? average(linkedCatches.map((row) => Number(row.weight || 0))).toFixed(1)
        : null;

      const article = createNode("article", "spot-card");
      const top = createNode("div", "spot-card-top");
      const left = createNode("div");
      left.appendChild(createNode("h4", "", item.name));
      left.appendChild(createNode("div", "catch-meta", `Dodano: ${formatDateTimePL(item.created_at)}`));

      const actions = createNode("div", "inline-actions");
      const editBtn = createNode("button", "edit-btn", "Edytuj");
      editBtn.type = "button";
      editBtn.addEventListener("click", () => window.editSpot(item.id));

      const deleteBtn = createNode("button", "danger-btn", "Usuń");
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", () => {
        if (typeof window.deleteSpot === "function") {
          window.deleteSpot(item.id);
          return;
        }
        window.alert("Brak funkcji usuwania spotu.");
      });

      actions.append(editBtn, deleteBtn);
      top.append(left, actions);

      const badges = createNode("div", "catch-badges");
      badges.appendChild(createNode("span", "badge", `Odległość: ${item.distance_m !== null && item.distance_m !== undefined ? `${Number(item.distance_m).toFixed(1)} m` : "brak"}`));
      badges.appendChild(createNode("span", "badge", `Głębokość: ${item.depth_m !== null && item.depth_m !== undefined ? `${Number(item.depth_m).toFixed(1)} m` : "brak"}`));
      badges.appendChild(createNode("span", "badge", `Dno: ${normalizeTextSafe(item.bottom_type || "brak", 60)}`));

      article.append(top, badges);

      const metaGrid = createNode("div", "spot-meta-grid");
      const meta1 = createNode("div", "spot-meta-box");
      meta1.innerHTML = `<span>Zaczepy / uwagi</span><strong data-user-content>${Dream.esc(normalizeTextSafe(item.obstacles || window.DreamI18n?.t("brak") || "brak", 120))}</strong>`;
      const meta2 = createNode("div", "spot-meta-box");
      meta2.innerHTML = `<span>Najlepsza pora</span><strong data-user-content>${Dream.esc(normalizeTextSafe(item.best_time || window.DreamI18n?.t("brak") || "brak", 60))}</strong>`;
      const meta3 = createNode("div", "spot-meta-box");
      meta3.innerHTML = `<span>Najlepszy wiatr</span><strong data-user-content>${Dream.esc(normalizeTextSafe(item.best_wind || window.DreamI18n?.t("brak") || "brak", 60))}</strong>`;
      const meta4 = createNode("div", "spot-meta-box");
      meta4.innerHTML = `<span>Skuteczność</span><strong>${linkedCatches.length ? `${linkedCatches.length} brań • śr. ${avgWeight} kg` : "Brak połowów"}</strong>`;

      metaGrid.append(meta1, meta2, meta3, meta4);
      article.appendChild(metaGrid);

      if (item.note) {
        article.appendChild(createNode("div", "catch-note", normalizeTextSafe(item.note, 500)));
      }

      list.appendChild(article);
    });
  }

  async function renderSpotsPagePlus() {
    if (!$("spots-list") || typeof loadSpotsFromD1 !== "function") return;
    ensureMapExtras();

    const list = $("spots-list");
    list.innerHTML = '<div class="empty-box">Ładowanie spotów...</div>';

    const [spots, catches] = await Promise.all([
      loadSpotsFromD1(),
      typeof loadCatchesFromD1 === "function" ? loadCatchesFromD1() : []
    ]);

    renderSpotsSummaryPlus(spots, catches);
    renderSpotsListPlus(spots, catches);
  }

  function bindSpotsPageEventsPlus() {
    if (!$("spot-form")) return;
    if ($("spot-form").dataset.plusBound === "1") return;
    $("spot-form").dataset.plusBound = "1";
  }

  function enhanceWeatherPageStatuses() {
    const currentRating = $("weather-rating");
    const biteChance = $("bite-chance-main");
    const heroChance = $("bite-chance-hero");
    const tactic = $("bite-tactic-short");

    if (currentRating) {
      const status = getWeatherStatusByRating(currentRating.textContent);
      applyStatus(currentRating.closest(".stat-card"), status);
    }

    if (biteChance) {
      const status = getWeatherStatusByRating(biteChance.textContent);
      applyStatus(biteChance.closest(".stat-card"), status);
    }

    if (heroChance) {
      const wrap = heroChance.closest(".hero-pill");
      if (wrap) {
        clearStatusClasses(wrap);
        wrap.classList.add(`status-${getWeatherStatusByRating(heroChance.textContent)}`);
      }
    }

    if (tactic) {
      const status = getWeatherStatusByRating(tactic.textContent);
      applyStatus(tactic.closest(".stat-card"), status);
    }

    document.querySelectorAll(".weather-hour-card .section-chip, .weather-day-card .section-chip").forEach((chip) => {
      const status = getWeatherStatusByRating(chip.textContent);
      clearStatusClasses(chip);
      chip.classList.add(`status-${status}`);
    });
  }

  function observeWeatherChanges() {
    if (!$("weather-rating")) return;
    const target = document.body;
    const observer = new MutationObserver(() => {
      enhanceWeatherPageStatuses();
    });
    observer.observe(target, { childList: true, subtree: true, characterData: true });
    setTimeout(enhanceWeatherPageStatuses, 600);
    setTimeout(enhanceWeatherPageStatuses, 1500);
  }

  function enhanceRegulaminStatuses() {
    if (!document.title.toLowerCase().includes("regulamin")) return;

    document.querySelectorAll(".weather-note, .knowledge-card, .mini-stats div").forEach((node) => {
      const text = node.textContent.toLowerCase();

      if (text.includes("zabron")) {
        applyStatus(node, "danger");
      } else if (text.includes("obowiązk")) {
        applyStatus(node, "warn");
      } else if (text.includes("dozwolon") || text.includes("można") || text.includes("autoryz")) {
        applyStatus(node, "success");
      } else {
        applyStatus(node, "info");
      }
    });
  }

  function initDashboardPlus() {
    ensureDashboardExtraGrid();
  }

  function initChecklistPlus() {
    if (!$("checklist-groups")) return;
    ensureChecklistToolbar();
    bindChecklistPlusEvents();
  }

  function initMapPlus() {
    if (!$("spots-list")) return;
    ensureMapExtras();
    bindSpotsPageEventsPlus();
  }

  function initGeneralStatuses() {
    enhanceRegulaminStatuses();
    observeWeatherChanges();
  }

  function initPlus() {
    initDashboardPlus();
    initChecklistPlus();
    initMapPlus();
    initGeneralStatuses();
  }

  window.renderDashboardExtras = renderDashboardExtras;
  window.renderChecklistPagePlus = renderChecklistPagePlus;
  window.renderSpotsPagePlus = renderSpotsPagePlus;

  window.initDreamPlus = initPlus;
})();
