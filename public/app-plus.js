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
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  function formatDateTimePL(value) {
    if (!value) return "Brak danych";
    const date = new Date(value);
    return date.toLocaleString("pl-PL", {
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
      latitude: 48.06406,
      longitude: 2.756781,
      name: "La Plaine des Bois Etang 2"
    };
  }

  async function fetchDashboardWeatherAlerts() {
    const spot = getSpotCoordsSafe();
    const params = new URLSearchParams({
      latitude: String(spot.latitude),
      longitude: String(spot.longitude),
      hourly: "temperature_2m,pressure_msl,wind_speed_10m,wind_gusts_10m,cloud_cover,precipitation",
      daily: "wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum",
      timezone: "auto",
      forecast_days: "3"
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!response.ok) throw new Error(`Weather ${response.status}`);
    return response.json();
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

  async function renderDashboardExtras() {
    if (!$("total-weight") || typeof loadCatchesFromSupabase !== "function") return;

    try {
      const [catches, spots, checklistItems] = await Promise.all([
        loadCatchesFromSupabase(),
        typeof loadSpotsFromSupabase === "function" ? loadSpotsFromSupabase() : [],
        typeof loadChecklistFromSupabase === "function" ? loadChecklistFromSupabase() : []
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
        const dayKey = new Date(item.caught_at).toLocaleDateString("pl-PL");
        dayTotals.set(dayKey, (dayTotals.get(dayKey) || 0) + Number(item.weight || 0));

        const hourKey = new Date(item.caught_at).getHours().toString().padStart(2, "0") + ":00";
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
      let dashboardWarning = openChecklist > 0
        ? `Brakuje jeszcze ${openChecklist} rzeczy z checklist.`
        : "Checklisty wyglądają dobrze.";

      try {
        const weather = await fetchDashboardWeatherAlerts();
        const nowIndex = 0;
        const limit = Math.min(weather.hourly.time.length, 24);
        let bestScore = -999;
        let bestIndex = 0;

        for (let i = 0; i < limit; i += 1) {
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
        const bestHourEndDate = new Date(bestDate.getTime() + 3 * 60 * 60 * 1000);
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
      } catch (_) {}

      renderAlertCards([
        {
          title: "🎣 Dziś najlepsze okno brań",
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
      <div class="filter-bar">
        <button type="button" class="filter-btn active" data-filter="all">Wszystkie</button>
        <button type="button" class="filter-btn" data-filter="open">Do zrobienia</button>
        <button type="button" class="filter-btn" data-filter="done">Zrobione</button>
      </div>

      <select id="check-sort-select">
        <option value="category">Sortuj: kategoria</option>
        <option value="name">Sortuj: nazwa</option>
        <option value="created">Sortuj: data dodania</option>
      </select>

      <div class="toolbar-actions">
        <button type="button" id="check-trip-only-btn" class="secondary-btn">Tylko rzeczy na wyjazd</button>
        <button type="button" id="check-uncheck-all-btn" class="secondary-btn">Odznacz wszystko</button>
      </div>

      <div id="check-toolbar-status" class="status-chip status-info">Tryb standardowy</div>
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
    return items.filter((item) => item.category === "sprzęt" || item.category === "jedzenie / picie");
  }

  function bindChecklistPlusEvents() {
    const toolbar = $("check-toolbar");
    if (!toolbar || toolbar.dataset.bound === "1") return;
    toolbar.dataset.bound = "1";

    toolbar.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        APP_STATE.checklistFilter = btn.dataset.filter;
        toolbar.querySelectorAll("[data-filter]").forEach((n) => n.classList.remove("active"));
        btn.classList.add("active");
        renderChecklistPagePlus();
      });
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
      if (!window.supabaseClient) return;
      const items = await loadChecklistFromSupabase();
      const ids = items.filter((item) => item.done).map((item) => Number(item.id));
      if (!ids.length) return;
      const { error } = await supabaseClient.from("checklist_items").update({ done: false }).in("id", ids);
      if (error) {
        window.alert("Nie udało się odznaczyć wszystkich pozycji.");
        return;
      }
      await renderChecklistPagePlus();
    });
  }

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
      const order = { "sprzęt": 1, "zakupy": 2, "jedzenie / picie": 3 };
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

    if (!items.length) {
      container.appendChild(createNode("div", "empty-box", "Brak pozycji dla wybranego filtra."));
      return;
    }

    const categories = [...new Set(items.map((item) => item.category))];

    categories.forEach((category) => {
      const section = createNode("section", "checklist-group");
      section.appendChild(createNode("h4", "", category));
      const wrap = createNode("div", "checklist-items");

      items
        .filter((item) => item.category === category)
        .forEach((item) => {
          const row = createNode("div", `check-item-row ${item.done ? "is-done" : "is-open"}`);

          const left = createNode("div", "check-item-left");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.checked = Boolean(item.done);
          checkbox.addEventListener("change", async () => {
            if (!window.supabaseClient) return;
            const { error } = await supabaseClient.from("checklist_items").update({ done: checkbox.checked }).eq("id", item.id);
            if (error) {
              window.alert("Nie udało się zaktualizować pozycji.");
              return;
            }
            await renderChecklistPagePlus();
          });

          const content = createNode("div", "check-item-content");
          const title = createNode("div", `check-item-title${item.done ? " done" : ""}`, normalizeTextSafe(item.item_name, 80));

          const metaParts = [];
          if (item.quantity !== null && item.quantity !== undefined) {
            metaParts.push(`${Number(item.quantity)} ${item.unit}`);
          }
          metaParts.push(item.done ? "Spakowane / gotowe" : "Do ogarnięcia");

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
    if (!$("checklist-groups") || typeof loadChecklistFromSupabase !== "function") return;

    ensureChecklistToolbar();
    bindChecklistPlusEvents();

    const container = $("checklist-groups");
    container.innerHTML = '<div class="empty-box">Ładowanie checklist...</div>';

    const items = await loadChecklistFromSupabase();
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
          Nie znalazłem publicznej mapy batymetrycznej tego łowiska. Najlepszy ruch: zapisuj własne głębokości,
          rodzaj dna, zaczepy, najlepszy czas i krótki opis tego, czego spodziewać się na danym miejscu.
        </div>
      </article>
    `;
    lastPanel.insertAdjacentElement("afterend", section);
  }

  function validateSpotPayloadPlus(raw) {
    const name = normalizeTextSafe(raw.name, 60);
    const distance_m = parseNum(raw.distance_m);
    const depth_m = parseNum(raw.depth_m);
    const bottom_type = normalizeTextSafe(raw.bottom_type, 60);
    const note = normalizeTextSafe(raw.note, 500);
    const obstacles = normalizeTextSafe(raw.obstacles, 120);
    const best_time = normalizeTextSafe(raw.best_time, 60);
    const best_wind = normalizeTextSafe(raw.best_wind, 60);

    if (!name) return { ok: false, message: "Podaj nazwę spotu." };
    if (Number.isNaN(distance_m)) return { ok: false, message: "Odległość musi być liczbą 0 lub większą." };
    if (Number.isNaN(depth_m)) return { ok: false, message: "Głębokość musi być liczbą 0 lub większą." };

    return {
      ok: true,
      payload: {
        name,
        distance_m,
        depth_m,
        bottom_type: bottom_type || null,
        note: note || null,
        obstacles: obstacles || null,
        best_time: best_time || null,
        best_wind: best_wind || null
      }
    };
  }

  function fillSpotFormForEditPlus(item) {
    if ($("edit-spot-id")) $("edit-spot-id").value = item.id;
    if ($("spot-name")) $("spot-name").value = item.name || "";
    if ($("spot-distance")) $("spot-distance").value = item.distance_m ?? "";
    if ($("spot-depth")) $("spot-depth").value = item.depth_m ?? "";
    if ($("spot-bottom")) $("spot-bottom").value = item.bottom_type || "";
    if ($("spot-note")) $("spot-note").value = item.note || "";
    if ($("spot-obstacles")) $("spot-obstacles").value = item.obstacles || "";
    if ($("spot-best-time")) $("spot-best-time").value = item.best_time || "";
    if ($("spot-best-wind")) $("spot-best-wind").value = item.best_wind || "";
    if ($("spot-form-title")) $("spot-form-title").textContent = "Edytuj spot";
    if ($("save-spot-btn")) $("save-spot-btn").textContent = "Zapisz zmiany";
    if ($("cancel-edit-spot-btn")) $("cancel-edit-spot-btn").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetSpotFormPlus() {
    $("spot-form")?.reset();
    if ($("edit-spot-id")) $("edit-spot-id").value = "";
    if ($("spot-form-title")) $("spot-form-title").textContent = "Dodaj spot";
    if ($("save-spot-btn")) $("save-spot-btn").textContent = "Dodaj spot";
    if ($("cancel-edit-spot-btn")) $("cancel-edit-spot-btn").classList.add("hidden");
    if (typeof setMessage === "function") setMessage("spot-message", "");
  }

  async function handleSpotSubmitPlus(event) {
    event.preventDefault();
    if (!window.supabaseClient) return;

    const validation = validateSpotPayloadPlus({
      name: $("spot-name")?.value,
      distance_m: $("spot-distance")?.value,
      depth_m: $("spot-depth")?.value,
      bottom_type: $("spot-bottom")?.value,
      note: $("spot-note")?.value,
      obstacles: $("spot-obstacles")?.value,
      best_time: $("spot-best-time")?.value,
      best_wind: $("spot-best-wind")?.value
    });

    if (!validation.ok) {
      if (typeof setMessage === "function") setMessage("spot-message", validation.message, "error");
      return;
    }

    const editId = $("edit-spot-id")?.value;
    if (typeof setMessage === "function") {
      setMessage("spot-message", editId ? "Zapisywanie zmian..." : "Dodawanie spotu...");
    }

    let error;
    if (editId) {
      ({ error } = await supabaseClient.from("spots").update(validation.payload).eq("id", Number(editId)));
    } else {
      ({ error } = await supabaseClient.from("spots").insert([validation.payload]));
    }

    if (error) {
      console.error("Błąd zapisu spotu:", error.message);
      if (typeof setMessage === "function") {
        setMessage("spot-message", editId ? "Nie udało się zapisać zmian." : "Nie udało się dodać spotu.", "error");
      }
      return;
    }

    if (typeof setMessage === "function") {
      setMessage("spot-message", editId ? "Zmiany zapisane." : "Spot został dodany.", "success");
    }
    resetSpotFormPlus();
    await renderSpotsPagePlus();
  }

  async function editSpotPlus(id) {
    if (typeof loadSpotsFromSupabase !== "function") return;
    const spots = await loadSpotsFromSupabase();
    const item = spots.find((row) => Number(row.id) === Number(id));
    if (item) fillSpotFormForEditPlus(item);
  }

  function renderSpotsSummaryPlus(spots, catches) {
    setText("spots-count", String(spots.length));

    const distances = spots.map((spot) => Number(spot.distance_m)).filter((v) => Number.isFinite(v));
    const depths = spots.map((spot) => Number(spot.depth_m)).filter((v) => Number.isFinite(v));

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
      editBtn.addEventListener("click", () => editSpotPlus(item.id));

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
      meta1.innerHTML = `<span>Zaczepy / uwagi</span><strong>${normalizeTextSafe(item.obstacles || "brak", 120)}</strong>`;
      const meta2 = createNode("div", "spot-meta-box");
      meta2.innerHTML = `<span>Najlepsza pora</span><strong>${normalizeTextSafe(item.best_time || "brak", 60)}</strong>`;
      const meta3 = createNode("div", "spot-meta-box");
      meta3.innerHTML = `<span>Najlepszy wiatr</span><strong>${normalizeTextSafe(item.best_wind || "brak", 60)}</strong>`;
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
    if (!$("spots-list") || typeof loadSpotsFromSupabase !== "function") return;
    ensureMapExtras();

    const list = $("spots-list");
    list.innerHTML = '<div class="empty-box">Ładowanie spotów...</div>';

    const [spots, catches] = await Promise.all([
      loadSpotsFromSupabase(),
      typeof loadCatchesFromSupabase === "function" ? loadCatchesFromSupabase() : []
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

  function bootPlus() {
    if (window.RybyAuth && !window.RybyAuth.isAuthenticated()) {
      document.addEventListener("ryby:auth-success", initPlus, { once: true });
      return;
    }
    initPlus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootPlus);
  } else {
    bootPlus();
  }
})();
