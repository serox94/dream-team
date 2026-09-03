const TRIP_START = new Date(window.DREAM_TRIP?.start || "2026-11-14T12:00:00+01:00");
const TRIP_END = new Date(window.DREAM_TRIP?.end || "2026-11-21T10:00:00+01:00");
const PB_TARGET = 13;
const PB_SOUND_THRESHOLD = 13;
const PB_CELEBRATION_STORAGE_KEY = "ryby2026_pb_celebrated_catches";

const supabaseClient = window.d1SupabaseCompat || window.supabaseClient || null;
window.supabaseClient = supabaseClient;

const FISHING_SPOT = {
  name: window.DREAM_TRIP?.lake || "LodgingCarp - La Plaine des Bois 2",
  latitude: Number(window.DREAM_TRIP?.latitude ?? 48.064130),
  longitude: Number(window.DREAM_TRIP?.longitude ?? 2.757058)
};

const FALLBACK_CATCHES = false ? [
  {
    person: "Patryk",
    species: "Karp",
    weight: 14.2,
    bait: "Scopex",
    spot: "Spot 3",
    note: null,
    caught_at: "2026-06-21T05:40:00"
  },
  {
    person: "Maciek",
    species: "Karp",
    weight: 11.8,
    bait: "Halibut",
    spot: "Spot 1",
    note: null,
    caught_at: "2026-06-21T22:10:00"
  },
  {
    person: "Patryk",
    species: "Karp",
    weight: 16.7,
    bait: "Scopex",
    spot: "Spot 3",
    note: null,
    caught_at: "2026-06-22T04:55:00"
  }
] : [];

let realtimeChannelsStarted = false;
let catchFormBound = false;
let checklistFormBound = false;
let spotsFormBound = false;
let weatherEventsBound = false;
let chartInstance = null;
let pbCelebrationPrimed = false;

function $(id) {
  return document.getElementById(id);
}

function normalizeText(value, maxLength = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, allowNull = true } = {}) {
  if (value === "" || value === null || value === undefined) return allowNull ? null : NaN;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return NaN;
  if (parsed < min || parsed > max) return NaN;
  return parsed;
}

function clearNode(node) {
  if (node) node.replaceChildren();
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== "" && text !== null && text !== undefined) node.textContent = text;
  return node;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function formatCaughtAt(value) {
  if (!value) return "Brak daty";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Brak daty";
  return date.toLocaleString("pl-PL");
}

function formatDateForInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function formatHour(value) {
  return new Date(value).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDay(value) {
  return new Date(value).toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit"
  });
}

function getPbCatchKey(item) {
  return String(item?.id ?? `${normalizeText(item?.person, 30)}-${item?.caught_at || ""}-${Number(item?.weight || 0).toFixed(2)}`);
}

function getCelebratedPbCatchKeys() {
  try {
    const raw = window.localStorage.getItem(PB_CELEBRATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_) {
    return [];
  }
}

function saveCelebratedPbCatchKeys(keys) {
  try {
    window.localStorage.setItem(PB_CELEBRATION_STORAGE_KEY, JSON.stringify([...new Set(keys.map(String))].slice(-250)));
  } catch (_) {}
}

function playPbCelebrationSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const startAt = ctx.currentTime + 0.03;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, startAt);
    master.gain.exponentialRampToValueAtTime(0.22, startAt + 0.04);
    master.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.75);
    master.connect(ctx.destination);

    const scheduleVoice = (freq, when, duration, type = "triangle", volume = 0.08, detune = 0) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      if (detune) osc.detune.setValueAtTime(detune, when);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(volume, when + 0.02);
      gain.gain.exponentialRampToValueAtTime(Math.max(volume * 0.55, 0.02), when + Math.max(duration - 0.12, 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

      osc.connect(gain);
      gain.connect(master);
      osc.start(when);
      osc.stop(when + duration + 0.02);
    };

    const hits = [
      { notes: [523.25, 659.25], when: startAt, duration: 0.22 },
      { notes: [659.25, 783.99], when: startAt + 0.18, duration: 0.24 },
      { notes: [783.99, 987.77], when: startAt + 0.37, duration: 0.28 },
      { notes: [1046.5, 1318.51], when: startAt + 0.62, duration: 0.72 }
    ];

    hits.forEach(({ notes, when, duration }, idx) => {
      notes.forEach((freq, noteIdx) => {
        scheduleVoice(freq, when, duration, noteIdx === 0 ? "triangle" : "sine", noteIdx === 0 ? 0.09 : 0.05, noteIdx === 0 ? -4 : 4);
      });
      if (idx < 3) {
        scheduleVoice(notes[0] / 2, when, Math.min(duration * 0.9, 0.24), "sine", 0.035, 0);
      }
    });

    scheduleVoice(783.99, startAt + 1.02, 0.55, "triangle", 0.06, -3);
    scheduleVoice(1046.5, startAt + 1.02, 0.62, "sine", 0.045, 3);

    window.setTimeout(() => {
      try { ctx.close(); } catch (_) {}
    }, 2100);
  } catch (_) {}
}

function celebrateCatchIfNeeded(item, { play = true } = {}) {
  if (!item) return false;
  window.DREAM_RUNTIME_PB = window.DREAM_RUNTIME_PB || Object.fromEntries((window.DREAM_MODEL?.allTime?.anglers || []).map(a => [a.name, Number(a.pbKg || 0)]));
  const person = item.person || item.anglerName || 'Patryk';
  const weight = Number(item.weight || item.weightKg || 0);
  const currentPb = Number(window.DREAM_RUNTIME_PB[person] || 0);
  if (!(weight > currentPb)) return false;
  window.DREAM_RUNTIME_PB[person] = weight;
  const key = getPbCatchKey(item);
  const storedKeys = new Set(getCelebratedPbCatchKeys());
  if (storedKeys.has(key)) return false;
  storedKeys.add(key);
  saveCelebratedPbCatchKeys([...storedKeys]);
  if (play) playPbCelebrationSound();
  return true;
}

function maybeCelebratePbMilestone(catches) {
  if (!Array.isArray(catches)) return;
  const storedKeys = new Set(getCelebratedPbCatchKeys());
  catches.forEach(item => storedKeys.add(getPbCatchKey(item)));
  saveCelebratedPbCatchKeys([...storedKeys]);
  pbCelebrationPrimed = true;
}


function setMessage(id, message, type = "") {
  const box = $(id);
  if (!box) return;
  box.textContent = message;
  box.className = "form-message";
  if (type) box.classList.add(type);
}

async function getSpotNameById(spotId) {
  const parsedId = Number(spotId);
  if (!Number.isFinite(parsedId) || !supabaseClient) return "";
  const { data, error } = await supabaseClient.from("spots").select("name").eq("id", parsedId).maybeSingle();
  if (error) {
    console.error("Błąd pobrania nazwy spotu:", error.message);
    return "";
  }
  return normalizeText(data?.name || "", 80);
}

function updateCountdown() {
  const countdownEl = $("countdown");
  if (!countdownEl) return;

  const now = new Date();
  if (now < TRIP_START) {
    const diff = TRIP_START - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    countdownEl.textContent = `Do wyjazdu: ${days} dni, ${hours} godz., ${minutes} min.`;
    return;
  }

  if (now >= TRIP_START && now <= TRIP_END) {
    countdownEl.textContent = "Status: wyjazd trwa";
    return;
  }

  countdownEl.textContent = "Status: wyjazd zakończony";
}

function setupMobileMenu() {
  const toggleBtn = $("menu-toggle");
  const nav = $("main-nav");
  if (!toggleBtn || !nav || toggleBtn.dataset.bound === "1") return;

  toggleBtn.dataset.bound = "1";

  const closeMenu = () => {
    nav.classList.remove("open");
    toggleBtn.setAttribute("aria-expanded", "false");
  };

  toggleBtn.addEventListener("click", () => {
    nav.classList.toggle("open");
    const expanded = nav.classList.contains("open");
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  });

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", event => {
    if (!nav.classList.contains("open")) return;
    if (nav.contains(event.target) || toggleBtn.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenu();
  });
}

function getSpotDisplayName(item, spots = []) {
  if (item?.spot_id !== null && item?.spot_id !== undefined) {
    const matchedSpot = spots.find(spot => Number(spot.id) === Number(item.spot_id));
    if (matchedSpot?.name) return matchedSpot.name;
  }
  return normalizeText(item?.spot || "", 80) || "Brak";
}

function getTopKey(items, extractor) {
  if (!items.length) return "Brak";
  const counts = new Map();
  items.forEach(item => {
    const value = normalizeText(extractor(item) || "Brak", 80) || "Brak";
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  let best = "Brak";
  let bestCount = 0;
  counts.forEach((count, key) => {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  });
  return best;
}

function getBestHourLabel(catches) {
  if (!catches.length) return "Brak";
  const counts = new Map();
  catches.forEach(item => {
    const hour = new Date(item.caught_at).getHours();
    if (!Number.isFinite(hour)) return;
    const label = `${String(hour).padStart(2, "0")}:00-${String(hour).padStart(2, "0")}:59`;
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  let best = "Brak";
  let bestCount = 0;
  counts.forEach((count, label) => {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  });
  return best;
}

function getStats(catches, spots = []) {
  const totalWeight = catches.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const biggestFishItem = catches.reduce((best, item) => {
    if (!best || Number(item.weight || 0) > Number(best.weight || 0)) return item;
    return best;
  }, null);

  return {
    totalWeight,
    totalFish: catches.length,
    biggestFish: biggestFishItem ? `${Number(biggestFishItem.weight).toFixed(1)} kg` : "Brak danych",
    biggestFishValue: biggestFishItem ? Number(biggestFishItem.weight) : 0,
    bestSpot: getTopKey(catches, item => getSpotDisplayName(item, spots)),
    bestBait: getTopKey(catches, item => item.bait),
    bestHour: getBestHourLabel(catches)
  };
}

function getPersonStats(catches, personName, spots = []) {
  const personCatches = catches.filter(item => item.person === personName);
  if (!personCatches.length) {
    return {
      biggest: 0,
      total: 0,
      count: 0,
      bestBait: "Brak",
      bestSpot: "Brak"
    };
  }

  return {
    biggest: Math.max(...personCatches.map(item => Number(item.weight || 0))),
    total: personCatches.reduce((sum, item) => sum + Number(item.weight || 0), 0),
    count: personCatches.length,
    bestBait: getTopKey(personCatches, item => item.bait),
    bestSpot: getTopKey(personCatches, item => getSpotDisplayName(item, spots))
  };
}

async function loadCatchesFromSupabase() {
  if (!supabaseClient) return FALLBACK_CATCHES;
  const { data, error } = await supabaseClient.from("catches").select("*").order("caught_at", { ascending: false });
  if (error) {
    console.error("Błąd pobierania połowów:", error.message);
    return FALLBACK_CATCHES;
  }
  return data || [];
}

async function loadChecklistFromSupabase() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient
    .from("checklist_items")
    .select("*")
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Błąd pobierania checklisty:", error.message);
    return [];
  }
  return data || [];
}

async function loadSpotsFromSupabase() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from("spots").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("Błąd pobierania spotów:", error.message);
    return [];
  }
  return data || [];
}

function setDefaultCaughtAt() {
  const input = $("caught_at");
  if (!input || input.value) return;
  input.value = formatDateForInput(new Date().toISOString());
}

function populateSpotSelect(spots) {
  const select = $("spot-id");
  if (!select) return;
  const current = select.value;
  clearNode(select);

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Brak powiązania";
  select.appendChild(defaultOption);

  spots.forEach(spot => {
    const option = document.createElement("option");
    option.value = String(spot.id);
    option.textContent = spot.name;
    select.appendChild(option);
  });

  select.value = current || "";
}

function validateCatchPayload(raw) {
  const person = normalizeText(raw.person, 30);
  const species = normalizeText(raw.species, 50);
  const bait = normalizeText(raw.bait, 50);
  const spotText = normalizeText(raw.spot, 80);
  const note = normalizeText(raw.note, 300);
  const weight = parseNumber(raw.weight, { min: 0.01, max: 99.99, allowNull: false });
  const spotId = raw.spot_id ? Number(raw.spot_id) : null;
  const caughtAt = raw.caught_at;

  if (!["Patryk", "Maciek"].includes(person)) return { ok: false, message: "Wybierz osobę." };
  if (!species) return { ok: false, message: "Podaj gatunek." };
  if (!Number.isFinite(weight)) return { ok: false, message: "Podaj poprawną wagę od 0.01 do 99.99 kg." };
  if (!bait) return { ok: false, message: "Podaj przynętę." };
  
  if (!caughtAt) return { ok: false, message: "Podaj datę i godzinę połowu." };

  const caughtDate = new Date(caughtAt);
  if (Number.isNaN(caughtDate.getTime())) return { ok: false, message: "Nieprawidłowa data połowu." };
  if (caughtDate.getTime() > Date.now() + 5 * 60 * 1000) return { ok: false, message: "Data połowu nie może być z przyszłości." };

  return {
    ok: true,
    payload: {
      person,
      species,
      weight,
      bait,
      spot: spotText || "Brak",
      spot_id: Number.isFinite(spotId) ? spotId : null,
      note: note || null,
      caught_at: caughtDate.toISOString()
    }
  };
}

function fillCatchFormForEdit(item) {
  $("edit-catch-id").value = item.id;
  $("person").value = item.person || "Patryk";
  $("species").value = item.species || "Karp";
  $("weight").value = item.weight ?? "";
  $("bait").value = item.bait || "";
  $("spot").value = item.spot || "";
  $("spot-id").value = item.spot_id ?? "";
  $("note").value = item.note || "";
  $("caught_at").value = formatDateForInput(item.caught_at);
  $("catch-form-title").textContent = "Edytuj połów";
  $("save-catch-btn").textContent = "Zapisz zmiany";
  $("cancel-edit-catch-btn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetCatchForm() {
  const form = $("catch-form");
  if (!form) return;
  form.reset();
  $("edit-catch-id").value = "";
  $("catch-form-title").textContent = "Dodaj połów";
  $("save-catch-btn").textContent = "Dodaj połów";
  $("cancel-edit-catch-btn").classList.add("hidden");
  setDefaultCaughtAt();
  setMessage("form-message", "");
}

async function handleCatchSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const selectedSpotId = $("spot-id")?.value;
  let resolvedSpotText = normalizeText($("spot")?.value, 80);
  if (!resolvedSpotText && selectedSpotId) {
    resolvedSpotText = await getSpotNameById(selectedSpotId);
    if (resolvedSpotText && $("spot")) $("spot").value = resolvedSpotText;
  }

  const formValues = {
    person: $("person")?.value,
    species: $("species")?.value,
    weight: $("weight")?.value,
    bait: $("bait")?.value,
    spot: resolvedSpotText,
    spot_id: selectedSpotId,
    note: $("note")?.value,
    caught_at: $("caught_at")?.value
  };

  const validation = validateCatchPayload(formValues);
  if (!validation.ok) {
    setMessage("form-message", validation.message, "error");
    return;
  }

  const editId = $("edit-catch-id")?.value;
  setMessage("form-message", editId ? "Zapisywanie zmian..." : "Zapisywanie połowu...");

  let error;
  let savedCatch = null;
  if (editId) {
    ({ data: savedCatch, error } = await supabaseClient
      .from("catches")
      .update(validation.payload)
      .eq("id", Number(editId))
      .select("id, person, weight, caught_at")
      .single());
  } else {
    ({ data: savedCatch, error } = await supabaseClient
      .from("catches")
      .insert([validation.payload])
      .select("id, person, weight, caught_at")
      .single());
  }

  if (error) {
    console.error("Błąd zapisu połowu:", error.message);
    setMessage("form-message", editId ? "Nie udało się zapisać zmian." : "Nie udało się dodać połowu.", "error");
    return;
  }

  if (savedCatch) celebrateCatchIfNeeded(savedCatch, { play: true });

  setMessage("form-message", editId ? "Zmiany zapisane." : "Połów został dodany.", "success");
  resetCatchForm();
  await renderCatchesPage();
}

async function deleteCatch(id) {
  if (!supabaseClient) return;
  if (!window.confirm("Usunąć ten połów?")) return;
  const { error } = await supabaseClient.from("catches").delete().eq("id", id);
  if (error) {
    window.alert("Nie udało się usunąć połowu.");
    return;
  }
  await renderCatchesPage();
}

async function editCatch(id) {
  const catches = await loadCatchesFromSupabase();
  const item = catches.find(c => Number(c.id) === Number(id));
  if (item) fillCatchFormForEdit(item);
}

function renderCatchSummary(catches, spots) {
  const countEl = $("catch-count");
  if (!countEl) return;
  const stats = getStats(catches, spots);
  $("catch-count").textContent = String(catches.length);
  $("catch-total-weight").textContent = `${stats.totalWeight.toFixed(1)} kg`;
  $("catch-biggest").textContent = stats.biggestFish;
  $("catch-best-spot").textContent = stats.bestSpot;
  $("catch-best-bait").textContent = stats.bestBait;
  $("catch-best-hour").textContent = stats.bestHour;
}

function renderCatchesList(catches, spots) {
  const list = $("catches-list");
  if (!list) return;
  clearNode(list);

  if (!catches.length) {
    list.appendChild(el("div", "empty-box", "Brak zapisanych połowów."));
    return;
  }

  catches.forEach(item => {
    const article = el("article", "catch-item");
    const top = el("div", "catch-item-top");
    const left = el("div");
    left.appendChild(el("h4", "", `${item.person} - ${item.species}`));
    left.appendChild(el("div", "catch-meta", formatCaughtAt(item.caught_at)));
    if (item.spot_id) {
      left.appendChild(el("div", "muted-small", `Powiązany spot: ${getSpotDisplayName(item, spots)}`));
    }

    const actions = el("div", "inline-actions");
    const editBtn = el("button", "edit-btn", "Edytuj");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => editCatch(item.id));
    const deleteBtn = el("button", "danger-btn", "Usuń");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => deleteCatch(item.id));
    actions.append(editBtn, deleteBtn);
    top.append(left, actions);

    const badges = el("div", "catch-badges");
    badges.appendChild(el("span", "badge", `Waga: ${Number(item.weight).toFixed(1)} kg`));
    badges.appendChild(el("span", "badge", `Przynęta: ${normalizeText(item.bait, 50)}`));
    badges.appendChild(el("span", "badge", `Spot: ${getSpotDisplayName(item, spots)}`));

    article.appendChild(top);
    article.appendChild(badges);

    if (item.note) {
      article.appendChild(el("div", "catch-note", normalizeText(item.note, 300)));
    }

    list.appendChild(article);
  });
}

async function renderCatchesPage() {
  const list = $("catches-list");
  if (!list) return;
  list.innerHTML = '<div class="empty-box">Ładowanie połowów...</div>';
  const [catches, spots] = await Promise.all([loadCatchesFromSupabase(), loadSpotsFromSupabase()]);
  populateSpotSelect(spots);
  renderCatchSummary(catches, spots);
  renderCatchesList(catches, spots);
}

function bindCatchesPageEvents() {
  if (catchFormBound) return;
  catchFormBound = true;

  $("catch-form")?.addEventListener("submit", handleCatchSubmit);
  $("refresh-catches-btn")?.addEventListener("click", renderCatchesPage);
  $("cancel-edit-catch-btn")?.addEventListener("click", resetCatchForm);
  $("spot-id")?.addEventListener("change", async e => {
    const selectedId = Number(e.target.value);
    if (!Number.isFinite(selectedId)) return;
    const spots = await loadSpotsFromSupabase();
    const selectedSpot = spots.find(spot => Number(spot.id) === selectedId);
    if (selectedSpot && !normalizeText($("spot")?.value, 80)) {
      $("spot").value = selectedSpot.name;
    }
  });
}

function validateChecklistPayload(raw) {
  const category = normalizeText(raw.category, 40);
  const itemName = normalizeText(raw.item_name, 80);
  const unit = normalizeText(raw.unit, 20) || "szt.";
  const quantity = parseNumber(raw.quantity, { min: 0, max: 99999, allowNull: true });

  const allowedCategories = ["sprzęt", "zakupy", "jedzenie / picie"];
  const allowedUnits = ["szt.", "kg", "litry"];

  if (!allowedCategories.includes(category)) return { ok: false, message: "Wybierz poprawną kategorię." };
  if (!itemName) return { ok: false, message: "Podaj nazwę pozycji." };
  if (Number.isNaN(quantity)) return { ok: false, message: "Ilość musi być liczbą 0 lub większą." };
  if (!allowedUnits.includes(unit)) return { ok: false, message: "Wybierz poprawną jednostkę." };

  return {
    ok: true,
    payload: {
      category,
      item_name: itemName,
      quantity,
      unit,
      done: false
    }
  };
}

function fillChecklistFormForEdit(item) {
  $("edit-check-id").value = item.id;
  $("check-category").value = item.category;
  $("check-name").value = item.item_name;
  $("check-quantity").value = item.quantity ?? "";
  $("check-unit").value = item.unit || "szt.";
  $("checklist-form-title").textContent = "Edytuj pozycję";
  $("save-check-btn").textContent = "Zapisz zmiany";
  $("cancel-edit-check-btn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetChecklistForm() {
  $("checklist-form")?.reset();
  $("edit-check-id").value = "";
  $("checklist-form-title").textContent = "Dodaj pozycję";
  $("save-check-btn").textContent = "Dodaj pozycję";
  $("cancel-edit-check-btn").classList.add("hidden");
  setMessage("checklist-message", "");
}

async function handleChecklistSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const validation = validateChecklistPayload({
    category: $("check-category")?.value,
    item_name: $("check-name")?.value,
    quantity: $("check-quantity")?.value,
    unit: $("check-unit")?.value
  });

  if (!validation.ok) {
    setMessage("checklist-message", validation.message, "error");
    return;
  }

  const editId = $("edit-check-id")?.value;
  setMessage("checklist-message", editId ? "Zapisywanie zmian..." : "Dodawanie pozycji...");

  let error;
  if (editId) {
    ({ error } = await supabaseClient.from("checklist_items").update(validation.payload).eq("id", Number(editId)));
  } else {
    ({ error } = await supabaseClient.from("checklist_items").insert([validation.payload]));
  }

  if (error) {
    console.error("Błąd zapisu checklisty:", error.message);
    setMessage("checklist-message", editId ? "Nie udało się zapisać zmian." : "Nie udało się dodać pozycji.", "error");
    return;
  }

  setMessage("checklist-message", editId ? "Zmiany zapisane." : "Pozycja została dodana.", "success");
  resetChecklistForm();
  await renderChecklistPage();
}

async function deleteChecklistItem(id) {
  if (!supabaseClient) return;
  if (!window.confirm("Usunąć tę pozycję?")) return;
  const { error } = await supabaseClient.from("checklist_items").delete().eq("id", id);
  if (error) {
    window.alert("Nie udało się usunąć pozycji.");
    return;
  }
  await renderChecklistPage();
}

async function editChecklistItem(id) {
  const items = await loadChecklistFromSupabase();
  const item = items.find(row => Number(row.id) === Number(id));
  if (item) fillChecklistFormForEdit(item);
}

async function toggleChecklistItem(id, done) {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.from("checklist_items").update({ done }).eq("id", id);
  if (error) {
    console.error("Błąd aktualizacji checklisty:", error.message);
    return;
  }
  await renderChecklistPage();
}

function renderChecklistSummary(items) {
  $("check-all-count").textContent = String(items.length);
  $("check-done-count").textContent = String(items.filter(item => item.done).length);
  $("check-open-count").textContent = String(items.filter(item => !item.done).length);
}

function renderChecklistGroups(items) {
  const container = $("checklist-groups");
  if (!container) return;
  clearNode(container);

  if (!items.length) {
    container.appendChild(el("div", "empty-box", "Brak pozycji na liście."));
    return;
  }

  const categories = [...new Set(items.map(item => item.category))];
  categories.forEach(category => {
    const section = el("section", "checklist-group");
    section.appendChild(el("h4", "", category));
    const itemsWrap = el("div", "checklist-items");

    items.filter(item => item.category === category).forEach(item => {
      const row = el("div", "check-item-row");
      const left = el("div", "check-item-left");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = Boolean(item.done);
      checkbox.addEventListener("change", () => toggleChecklistItem(item.id, checkbox.checked));

      const content = el("div", "check-item-content");
      const title = el("div", `check-item-title${item.done ? " done" : ""}`, item.item_name);
      const metaText = [];
      if (item.quantity !== null && item.quantity !== undefined) metaText.push(`${Number(item.quantity)} ${item.unit}`);
      metaText.push(item.done ? "Spakowane" : "Do ogarnięcia");
      const meta = el("div", "check-item-meta", metaText.join(" • "));
      content.append(title, meta);
      left.append(checkbox, content);

      const actions = el("div", "check-item-actions");
      const editBtn = el("button", "edit-btn", "Edytuj");
      editBtn.type = "button";
      editBtn.addEventListener("click", () => editChecklistItem(item.id));
      const deleteBtn = el("button", "danger-btn", "Usuń");
      deleteBtn.type = "button";
      deleteBtn.addEventListener("click", () => deleteChecklistItem(item.id));
      actions.append(editBtn, deleteBtn);

      row.append(left, actions);
      itemsWrap.appendChild(row);
    });

    section.appendChild(itemsWrap);
    container.appendChild(section);
  });
}

async function renderChecklistPage() {
  const container = $("checklist-groups");
  if (!container) return;

  if (typeof window.renderChecklistPagePlus === "function") {
    await window.renderChecklistPagePlus();
    return;
  }

  container.innerHTML = '<div class="empty-box">Ładowanie checklist...</div>';
  const items = await loadChecklistFromSupabase();
  renderChecklistSummary(items);
  renderChecklistGroups(items);
}

function bindChecklistPageEvents() {
  if (checklistFormBound) return;
  checklistFormBound = true;
  $("checklist-form")?.addEventListener("submit", handleChecklistSubmit);
  $("refresh-checklist-btn")?.addEventListener("click", renderChecklistPage);
  $("cancel-edit-check-btn")?.addEventListener("click", resetChecklistForm);
}

function validateSpotPayload(raw) {
  const name = normalizeText(raw.name, 60);
  const distance_m = parseNumber(raw.distance_m, { min: 0, max: 2000, allowNull: true });
  const depth_m = parseNumber(raw.depth_m, { min: 0, max: 100, allowNull: true });
  const bottom_type = normalizeText(raw.bottom_type, 60);
  const note = normalizeText(raw.note, 500);
  const obstacles = normalizeText(raw.obstacles, 120);
  const best_time = normalizeText(raw.best_time, 60);
  const best_wind = normalizeText(raw.best_wind, 60);

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

function fillSpotFormForEdit(item) {
  $("edit-spot-id").value = item.id;
  $("spot-name").value = item.name || "";
  $("spot-distance").value = item.distance_m ?? "";
  $("spot-depth").value = item.depth_m ?? "";
  $("spot-bottom").value = item.bottom_type || "";
  $("spot-note").value = item.note || "";
  if ($("spot-obstacles")) $("spot-obstacles").value = item.obstacles || "";
  if ($("spot-best-time")) $("spot-best-time").value = item.best_time || "";
  if ($("spot-best-wind")) $("spot-best-wind").value = item.best_wind || "";
  $("spot-form-title").textContent = "Edytuj spot";
  $("save-spot-btn").textContent = "Zapisz zmiany";
  $("cancel-edit-spot-btn").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetSpotForm() {
  $("spot-form")?.reset();
  if ($("edit-spot-id")) $("edit-spot-id").value = "";
  if ($("spot-form-title")) $("spot-form-title").textContent = "Dodaj spot";
  if ($("save-spot-btn")) $("save-spot-btn").textContent = "Dodaj spot";
  if ($("cancel-edit-spot-btn")) $("cancel-edit-spot-btn").classList.add("hidden");
  setMessage("spot-message", "");
}

async function handleSpotSubmit(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const validation = validateSpotPayload({
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
    setMessage("spot-message", validation.message, "error");
    return;
  }

  const editId = $("edit-spot-id")?.value;
  setMessage("spot-message", editId ? "Zapisywanie zmian..." : "Dodawanie spotu...");

  let error;
  if (editId) {
    ({ error } = await supabaseClient.from("spots").update(validation.payload).eq("id", Number(editId)));
  } else {
    ({ error } = await supabaseClient.from("spots").insert([validation.payload]));
  }

  if (error) {
    console.error("Błąd zapisu spotu:", error.message);
    setMessage("spot-message", editId ? "Nie udało się zapisać zmian." : "Nie udało się dodać spotu.", "error");
    return;
  }

  setMessage("spot-message", editId ? "Zmiany zapisane." : "Spot został dodany.", "success");
  resetSpotForm();
  await renderSpotsPage();
  const spots = await loadSpotsFromSupabase();
  populateSpotSelect(spots);
}

async function deleteSpot(id) {
  if (!supabaseClient) return;

  const spots = await loadSpotsFromSupabase();
  const spot = spots.find(item => Number(item.id) === Number(id));
  const spotName = normalizeText(spot?.name || "", 80);

  if (!window.confirm("Usunąć ten spot?")) return;

  const { error: catchesError } = await supabaseClient
    .from("catches")
    .update({ spot: spotName || "Usunięty spot", spot_id: null })
    .eq("spot_id", Number(id));

  if (catchesError) {
    console.error("Błąd odpinania połowów od spotu:", catchesError.message);
    window.alert("Nie udało się bezpiecznie odpiąć połowów od tego spotu.");
    return;
  }

  const { error } = await supabaseClient.from("spots").delete().eq("id", id);
  if (error) {
    window.alert("Nie udało się usunąć spotu.");
    return;
  }
  await renderSpotsPage();
  const refreshedSpots = await loadSpotsFromSupabase();
  populateSpotSelect(refreshedSpots);
}

async function editSpot(id) {
  const spots = await loadSpotsFromSupabase();
  const item = spots.find(spot => Number(spot.id) === Number(id));
  if (item) fillSpotFormForEdit(item);
}

function renderSpotsSummary(spots) {
  const countEl = $("spots-count");
  if (!countEl) return;
  const distances = spots.filter(spot => spot.distance_m !== null && spot.distance_m !== undefined).map(spot => Number(spot.distance_m));
  const depths = spots.filter(spot => spot.depth_m !== null && spot.depth_m !== undefined).map(spot => Number(spot.depth_m));
  $("spots-count").textContent = String(spots.length);
  $("spots-avg-distance").textContent = distances.length ? `${average(distances).toFixed(1)} m` : "--";
  $("spots-avg-depth").textContent = depths.length ? `${average(depths).toFixed(1)} m` : "--";
}

function renderSpotsList(spots) {
  const list = $("spots-list");
  if (!list) return;
  clearNode(list);

  if (!spots.length) {
    list.appendChild(el("div", "empty-box", "Brak zapisanych spotów."));
    return;
  }

  spots.forEach(item => {
    const article = el("article", "spot-card");
    const top = el("div", "spot-card-top");
    const left = el("div");
    left.appendChild(el("h4", "", item.name));
    left.appendChild(el("div", "catch-meta", `Dodano: ${formatCaughtAt(item.created_at)}`));

    const actions = el("div", "inline-actions");
    const editBtn = el("button", "edit-btn", "Edytuj");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => editSpot(item.id));
    const deleteBtn = el("button", "danger-btn", "Usuń");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => deleteSpot(item.id));
    actions.append(editBtn, deleteBtn);
    top.append(left, actions);

    const badges = el("div", "catch-badges");
    badges.appendChild(el("span", "badge", `Odległość: ${item.distance_m !== null && item.distance_m !== undefined ? `${Number(item.distance_m).toFixed(1)} m` : "brak"}`));
    badges.appendChild(el("span", "badge", `Głębokość: ${item.depth_m !== null && item.depth_m !== undefined ? `${Number(item.depth_m).toFixed(1)} m` : "brak"}`));
    badges.appendChild(el("span", "badge", `Dno: ${normalizeText(item.bottom_type || "brak", 60)}`));

    article.append(top, badges);

    const meta = [];
    if (item.obstacles) meta.push(`Zaczepy: ${normalizeText(item.obstacles, 120)}`);
    if (item.best_time) meta.push(`Najlepsza pora: ${normalizeText(item.best_time, 60)}`);
    if (item.best_wind) meta.push(`Najlepszy wiatr: ${normalizeText(item.best_wind, 60)}`);
    if (meta.length) {
      article.appendChild(el("div", "catch-note", meta.join(" • ")));
    }

    if (item.note) {
      article.appendChild(el("div", "catch-note", normalizeText(item.note, 500)));
    }

    list.appendChild(article);
  });
}

async function renderSpotsPage() {
  const list = $("spots-list");
  if (!list) return;

  if (typeof window.renderSpotsPagePlus === "function") {
    await window.renderSpotsPagePlus();
    return;
  }

  list.innerHTML = '<div class="empty-box">Ładowanie spotów...</div>';
  const spots = await loadSpotsFromSupabase();
  renderSpotsSummary(spots);
  renderSpotsList(spots);
}

function bindSpotsPageEvents() {
  if (spotsFormBound) return;
  spotsFormBound = true;
  $("spot-form")?.addEventListener("submit", handleSpotSubmit);
  $("refresh-spots-btn")?.addEventListener("click", renderSpotsPage);
  $("cancel-edit-spot-btn")?.addEventListener("click", resetSpotForm);
}

function weatherCodeToText(code) {
  const map = {
    0: "Bezchmurnie",
    1: "Przeważnie pogodnie",
    2: "Częściowe zachmurzenie",
    3: "Pochmurno",
    45: "Mgła",
    48: "Mgła osadzająca",
    51: "Lekka mżawka",
    53: "Mżawka",
    55: "Silna mżawka",
    61: "Słaby deszcz",
    63: "Deszcz",
    65: "Silny deszcz",
    80: "Przelotne opady",
    81: "Przelotny deszcz",
    82: "Silne przelotne opady",
    95: "Burza"
  };
  return map[code] || `Kod ${code}`;
}

function windDirectionToText(deg) {
  if (deg === null || deg === undefined) return "Brak";
  const dirs = ["Północ", "Północny-wschód", "Wschód", "Południowy-wschód", "Południe", "Południowy-zachód", "Zachód", "Północny-zachód"];
  const index = Math.round(Number(deg) / 45) % 8;
  return `${dirs[index]} (${Math.round(Number(deg))}°)`;
}

function getHourlyIndexForNow(data) {
  const currentTime = data?.current?.time;
  const hourlyTimes = data?.hourly?.time || [];
  if (!currentTime || !hourlyTimes.length) return 0;
  const direct = hourlyTimes.indexOf(currentTime);
  if (direct !== -1) return direct;

  const target = new Date(currentTime).getTime();
  let bestIndex = 0;
  let bestDiff = Infinity;
  hourlyTimes.forEach((time, index) => {
    const diff = Math.abs(new Date(time).getTime() - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function getPressureTrend(hourlyPressure, currentIndex = 0) {
  if (!hourlyPressure || hourlyPressure.length < 2) return "Brak danych";
  const start = Number(hourlyPressure[currentIndex] ?? hourlyPressure[0]);
  const compareIndex = Math.min(hourlyPressure.length - 1, currentIndex + 6);
  const end = Number(hourlyPressure[compareIndex] ?? start);
  const diff = end - start;
  if (diff >= 2) return "Rośnie";
  if (diff <= -2) return "Spada";
  return "Stabilne";
}

function getWeatherRating(current, hourly, currentIndex) {
  const wind = Number(current.wind_speed_10m || 0);
  const gusts = Number(current.wind_gusts_10m || 0);
  const pressure = Number(current.pressure_msl || 0);
  const precipitation = Number(current.precipitation || 0);
  const trend = getPressureTrend(hourly.pressure_msl, currentIndex);

  let score = 0;
  if (wind >= 8 && wind <= 22) score += 2;
  else if (wind > 22) score += 1;
  if (gusts <= 35) score += 1;
  else if (gusts > 55) score -= 1;
  if (pressure >= 1005 && pressure <= 1020) score += 2;
  else if (pressure >= 995 && pressure <= 1025) score += 1;
  if (trend === "Spada") score += 2;
  else if (trend === "Stabilne") score += 1;
  if (precipitation > 0 && precipitation <= 2) score += 1;
  if (precipitation > 5) score -= 1;

  if (score >= 6) return "Dobre";
  if (score >= 3) return "Średnie";
  return "Słabe";
}

function getMoonPhaseInfo(dateInput) {
  const date = new Date(dateInput);
  const knownNewMoon = new Date("2000-01-06T18:14:00Z");
  const synodicMonth = 29.53058867;
  const daysSince = (date - knownNewMoon) / 86400000;
  const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
  const illumination = (1 - Math.cos((2 * Math.PI * phase) / synodicMonth)) / 2;

  let name = "Nów";
  if (phase < 1.84566) name = "Nów";
  else if (phase < 5.53699) name = "Przybywający sierp";
  else if (phase < 9.22831) name = "Pierwsza kwadra";
  else if (phase < 12.91963) name = "Przybywający garb";
  else if (phase < 16.61096) name = "Pełnia";
  else if (phase < 20.30228) name = "Ubywający garb";
  else if (phase < 23.99361) name = "Ostatnia kwadra";
  else if (phase < 27.68493) name = "Ubywający sierp";

  return { name, illumination: `${Math.round(illumination * 100)}%` };
}

function pickNearestNightWindow(hourly) {
  if (!hourly?.time?.length) {
    return { temp: 0, wind: 0, gusts: 0, humidity: 0, visibility: 0 };
  }

  const buckets = new Map();
  const now = new Date();

  hourly.time.forEach((time, index) => {
    const date = new Date(time);
    const hour = date.getHours();
    const isNight = hour >= 22 || hour <= 5;
    if (!isNight) return;

    const bucketDate = new Date(date);
    if (hour <= 5) bucketDate.setDate(bucketDate.getDate() - 1);
    const key = bucketDate.toISOString().slice(0, 10);

    if (!buckets.has(key)) {
      buckets.set(key, {
        startTime: date,
        temp: [],
        wind: [],
        gusts: [],
        humidity: [],
        visibility: []
      });
    }

    const bucket = buckets.get(key);
    bucket.temp.push(Number(hourly.temperature_2m?.[index] || 0));
    bucket.wind.push(Number(hourly.wind_speed_10m?.[index] || 0));
    bucket.gusts.push(Number(hourly.wind_gusts_10m?.[index] || 0));
    bucket.humidity.push(Number(hourly.relative_humidity_2m?.[index] || 0));
    bucket.visibility.push(Number(hourly.visibility?.[index] || 0));
  });

  const windows = [...buckets.values()].sort((a, b) => a.startTime - b.startTime);
  const selected = windows.find(window => window.startTime.getTime() >= now.getTime() - 6 * 60 * 60 * 1000) || windows[0];
  if (!selected) return { temp: 0, wind: 0, gusts: 0, humidity: 0, visibility: 0 };

  return {
    temp: average(selected.temp),
    wind: average(selected.wind),
    gusts: average(selected.gusts),
    humidity: average(selected.humidity),
    visibility: average(selected.visibility)
  };
}

function getNightCampRating(night) {
  let score = 0;
  if (night.temp >= 10 && night.temp <= 18) score += 2;
  else if (night.temp >= 6 && night.temp < 10) score += 1;
  if (night.wind <= 18) score += 2;
  else if (night.wind <= 28) score += 1;
  if (night.gusts <= 30) score += 1;
  else if (night.gusts > 45) score -= 1;
  if (night.humidity <= 88) score += 1;
  else score -= 1;
  if (night.visibility >= 3000) score += 1;
  else score -= 1;

  if (score >= 5) return "Komfortowa";
  if (score >= 2) return "Średnia";
  return "Ciężka";
}

function buildWeatherInterpretation(current, hourly, currentIndex) {
  const notes = [];
  const wind = Number(current.wind_speed_10m || 0);
  const gusts = Number(current.wind_gusts_10m || 0);
  const pressure = Number(current.pressure_msl || 0);
  const direction = windDirectionToText(current.wind_direction_10m);
  const trend = getPressureTrend(hourly.pressure_msl, currentIndex);

  if (trend === "Spada") notes.push("Ciśnienie spada - często daje okno aktywności przed zmianą pogody.");
  else if (trend === "Rośnie") notes.push("Ciśnienie rośnie - ryby mogą brać ostrożniej, warto łowić precyzyjnie.");
  else notes.push("Ciśnienie jest stabilne - warunki są bardziej przewidywalne.");

  if (wind >= 8 && wind <= 22) notes.push(`Wiatr jest sensowny (${wind.toFixed(1)} km/h). Kierunek: ${direction}.`);
  else if (wind > 22) notes.push(`Wiatr jest mocny (${wind.toFixed(1)} km/h, porywy ${gusts.toFixed(1)} km/h).`);
  else notes.push(`Wiatr jest słaby (${wind.toFixed(1)} km/h). Ryby mogą być bardziej ostrożne.`);

  if (pressure >= 1022) notes.push(`Ciśnienie jest wysokie (${pressure.toFixed(0)} hPa).`);
  else if (pressure <= 1000) notes.push(`Ciśnienie jest niskie (${pressure.toFixed(0)} hPa). To bywa dobry moment pod aktywność.`);

  return notes;
}

function buildCampInterpretation(night, moonInfo) {
  const notes = [];
  const rating = getNightCampRating(night);
  notes.push(`Ocena nocy na obozowanie: ${rating}.`);
  if (night.wind > 25) notes.push("Noc zapowiada się wietrznie - sprawdź namiot, śledzie i luźne rzeczy.");
  else notes.push("Wiatr nocą nie wygląda groźnie.");

  if (night.humidity > 88) notes.push("Wilgotność nocą będzie wysoka - spodziewaj się rosy i mokrego obozowiska.");
  if (night.visibility < 2000) notes.push("Widzialność nocą może być słaba - możliwa mgła.");
  notes.push(`Faza księżyca: ${moonInfo.name} (${moonInfo.illumination}). Traktuj to jako dodatek, nie wyrocznię.`);
  return notes;
}

function setWeatherNotes(containerId, notes) {
  const container = $(containerId);
  if (!container) return;
  clearNode(container);
  notes.forEach(note => {
    container.appendChild(el("div", "weather-note", note));
  });
}

async function fetchWeatherData() {
  const params = new URLSearchParams({
    latitude: String(FISHING_SPOT.latitude),
    longitude: String(FISHING_SPOT.longitude),
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
  if (!response.ok) throw new Error(`Błąd pogody: ${response.status}`);
  return response.json();
}

function renderWeatherCurrent(data) {
  const current = data.current;
  const hourly = data.hourly;
  const daily = data.daily;
  const currentIndex = getHourlyIndexForNow(data);
  const trend = getPressureTrend(hourly.pressure_msl, currentIndex);
  const rating = getWeatherRating(current, hourly, currentIndex);

  $("weather-current-temp").textContent = `${Number(current.temperature_2m).toFixed(1)}°C`;
  $("weather-current-wind").textContent = `${Number(current.wind_speed_10m).toFixed(1)} / ${Number(current.wind_gusts_10m).toFixed(1)} km/h`;
  $("weather-current-pressure").textContent = `${Number(current.pressure_msl).toFixed(0)} hPa / ${trend}`;
  $("weather-rating").textContent = rating;
  $("weather-description").textContent = weatherCodeToText(current.weather_code);
  $("weather-apparent-temp").textContent = `${Number(current.apparent_temperature).toFixed(1)}°C`;
  $("weather-wind-direction").textContent = windDirectionToText(current.wind_direction_10m);
  $("weather-cloud-cover").textContent = `${Math.round(Number(current.cloud_cover || 0))}%`;
  $("weather-precipitation").textContent = `${Number(current.precipitation || 0).toFixed(1)} mm`;
  $("weather-humidity").textContent = `${Math.round(Number(current.relative_humidity_2m || 0))}%`;
  $("weather-dew-point").textContent = `${Number(current.dew_point_2m || 0).toFixed(1)}°C`;

  const currentVisibility = Number(current.visibility || 0);
  $("weather-visibility").textContent = currentVisibility >= 1000 ? `${(currentVisibility / 1000).toFixed(1)} km` : `${Math.round(currentVisibility)} m`;
  $("weather-uv").textContent = current.uv_index !== null && current.uv_index !== undefined ? Number(current.uv_index).toFixed(1) : "--";
  $("weather-sunshine").textContent = `${Math.round((daily.sunshine_duration?.[0] || 0) / 3600)} h`;

  setWeatherNotes("weather-interpretation", buildWeatherInterpretation(current, hourly, currentIndex));

  const night = pickNearestNightWindow(hourly);
  const moonInfo = getMoonPhaseInfo(new Date());
  $("camp-night-temp").textContent = `${night.temp.toFixed(1)}°C`;
  $("camp-night-wind").textContent = `${night.wind.toFixed(1)} km/h`;
  $("camp-night-gusts").textContent = `${night.gusts.toFixed(1)} km/h`;
  $("camp-night-humidity").textContent = `${Math.round(night.humidity)}%`;
  $("camp-night-visibility").textContent = night.visibility >= 1000 ? `${(night.visibility / 1000).toFixed(1)} km` : `${Math.round(night.visibility)} m`;
  $("camp-night-rating").textContent = getNightCampRating(night);
  $("moon-phase").textContent = moonInfo.name;
  $("moon-illumination").textContent = moonInfo.illumination;
  setWeatherNotes("camp-interpretation", buildCampInterpretation(night, moonInfo));

  $("soil-temp").textContent = `${Number(hourly.soil_temperature_0cm?.[currentIndex] || 0).toFixed(1)}°C`;
  $("soil-moisture").textContent = `${Math.round(Number(hourly.soil_moisture_0_to_1cm?.[currentIndex] || 0) * 100)}%`;
}

function renderWeatherHourly(data) {
  const container = $("weather-hourly-list");
  if (!container) return;
  clearNode(container);

  const startIndex = getHourlyIndexForNow(data);
  const endIndex = Math.min(data.hourly.time.length, startIndex + 24);
  for (let i = startIndex; i < endIndex; i += 1) {
    const row = el("div", "weather-row");
    row.appendChild(el("strong", "", formatHour(data.hourly.time[i])));
    row.appendChild(el("div", "weather-chip", `${Number(data.hourly.temperature_2m[i]).toFixed(1)}°C`));
    row.appendChild(el("div", "weather-chip", `${Number(data.hourly.wind_speed_10m[i]).toFixed(1)} / ${Number(data.hourly.wind_gusts_10m[i]).toFixed(1)} km/h`));
    row.appendChild(el("div", "weather-chip", windDirectionToText(data.hourly.wind_direction_10m[i])));
    row.appendChild(el("div", "weather-chip", `${Number(data.hourly.pressure_msl[i]).toFixed(0)} hPa`));
    row.appendChild(el("div", "weather-chip", `${Number(data.hourly.precipitation[i] || 0).toFixed(1)} mm`));
    row.appendChild(el("div", "weather-chip", weatherCodeToText(data.hourly.weather_code[i])));
    container.appendChild(row);
  }
}

function renderWeatherDaily(data) {
  const container = $("weather-daily-list");
  if (!container) return;
  clearNode(container);

  data.daily.time.forEach((time, index) => {
    const row = el("div", "weather-row");
    row.appendChild(el("strong", "", formatDay(time)));
    row.appendChild(el("div", "weather-chip", weatherCodeToText(data.daily.weather_code[index])));
    row.appendChild(el("div", "weather-chip", `Min ${Number(data.daily.temperature_2m_min[index]).toFixed(1)}°C / Max ${Number(data.daily.temperature_2m_max[index]).toFixed(1)}°C`));
    row.appendChild(el("div", "weather-chip", `Opad ${Number(data.daily.precipitation_sum[index] || 0).toFixed(1)} mm`));
    row.appendChild(el("div", "weather-chip", `Wiatr ${Number(data.daily.wind_speed_10m_max[index] || 0).toFixed(1)} km/h`));
    row.appendChild(el("div", "weather-chip", `Porywy ${Number(data.daily.wind_gusts_10m_max[index] || 0).toFixed(1)} km/h`));
    row.appendChild(el("div", "weather-chip", `Słońce ${Math.round((data.daily.sunshine_duration[index] || 0) / 3600)} h`));
    container.appendChild(row);
  });
}

async function renderWeatherPage() {
  if (!$("weather-current-temp")) return;
  try {
    $("weather-current-temp").textContent = "Ładowanie...";
    const data = await fetchWeatherData();
    renderWeatherCurrent(data);
    renderWeatherHourly(data);
    renderWeatherDaily(data);
  } catch (error) {
    console.error(error);
    [
      "weather-current-temp",
      "weather-current-wind",
      "weather-current-pressure",
      "weather-rating"
    ].forEach(id => {
      if ($(id)) $(id).textContent = "Błąd";
    });
    if ($("weather-description")) $("weather-description").textContent = "Nie udało się pobrać pogody";
    setWeatherNotes("weather-interpretation", ["Nie udało się pobrać danych pogodowych."]);
    setWeatherNotes("camp-interpretation", ["Brak danych do oceny obozowania."]);
  }
}

function bindWeatherPageEvents() {
  if (weatherEventsBound) return;
  weatherEventsBound = true;
  $("refresh-weather-btn")?.addEventListener("click", renderWeatherPage);
}

function updateDashboard(catches, spots = [], checklist = []) {
  if (!$("total-weight")) return;

  const globalStats = getStats(catches, spots);
  const patrykStats = getPersonStats(catches, "Patryk", spots);
  const maciekStats = getPersonStats(catches, "Maciek", spots);

  $("total-weight").textContent = `${globalStats.totalWeight.toFixed(1)} kg`;
  $("total-fish").textContent = String(globalStats.totalFish);
  $("biggest-fish").textContent = globalStats.biggestFish;
  const biggestFishItem = catches.reduce((best, item) => {
    if (!best) return item;
    return Number(item.weight || 0) > Number(best.weight || 0) ? item : best;
  }, null);
  const biggestFishPerson = biggestFishItem ? normalizeText(biggestFishItem.person, 40) : "Brak";
  if ($("biggest-fish-person")) $("biggest-fish-person").textContent = biggestFishPerson;
  $("best-spot").textContent = globalStats.bestSpot;
  $("best-bait-global").textContent = globalStats.bestBait;
  $("best-hour-global").textContent = globalStats.bestHour;
  $("spots-count-dashboard").textContent = String(spots.length);

  $("patryk-biggest").textContent = `${patrykStats.biggest.toFixed(1)} kg`;
  $("patryk-total").textContent = `${patrykStats.total.toFixed(1)} kg`;
  $("patryk-count").textContent = String(patrykStats.count);
  $("patryk-bait").textContent = patrykStats.bestBait;
  $("patryk-spot").textContent = patrykStats.bestSpot;
  $("patryk-pb-text").textContent = `${patrykStats.biggest.toFixed(1)} kg`;
  $("patryk-pb-bar").style.width = `${Math.min((patrykStats.biggest / PB_TARGET) * 100, 100)}%`;

  $("maciek-biggest").textContent = `${maciekStats.biggest.toFixed(1)} kg`;
  $("maciek-total").textContent = `${maciekStats.total.toFixed(1)} kg`;
  $("maciek-count").textContent = String(maciekStats.count);
  $("maciek-bait").textContent = maciekStats.bestBait;
  $("maciek-spot").textContent = maciekStats.bestSpot;
  $("maciek-pb-text").textContent = `${maciekStats.biggest.toFixed(1)} kg`;
  $("maciek-pb-bar").style.width = `${Math.min((maciekStats.biggest / PB_TARGET) * 100, 100)}%`;

  const lastEntryBox = $("last-entry");
  if (lastEntryBox) {
    clearNode(lastEntryBox);
    lastEntryBox.classList.remove("last-entry-list");
    if (!catches.length) {
      lastEntryBox.textContent = "Brak zapisanych połowów.";
    } else {
      lastEntryBox.classList.add("last-entry-list");
      const sorted = [...catches].sort((a, b) => new Date(b.caught_at) - new Date(a.caught_at)).slice(0, 3);

      sorted.forEach(item => {
        const card = el("article", "last-entry-item");
        const top = el("div", "last-entry-top");
        top.appendChild(el("strong", "", `${item.person} - ${item.species}`));
        top.appendChild(el("span", "last-entry-weight", `${Number(item.weight).toFixed(1)} kg`));

        const meta = el("div", "last-entry-meta");
        meta.appendChild(el("span", "", `Przynęta: ${normalizeText(item.bait, 50)}`));
        meta.appendChild(el("span", "", `Spot: ${getSpotDisplayName(item, spots)}`));
        meta.appendChild(el("span", "", formatCaughtAt(item.caught_at)));

        card.append(top, meta);
        lastEntryBox.appendChild(card);
      });
    }
  }

  maybeCelebratePbMilestone(catches);

  const ctx = document.getElementById("fishChart");
  if (typeof window.renderDashboardExtras === "function") {
    window.renderDashboardExtras();
  }

  if (ctx && window.Chart) {
    const labels = ["Patryk", "Maciek"];
    const values = labels.map(name =>
      catches
        .filter(item => item.person === name)
        .reduce((sum, item) => sum + Number(item.weight || 0), 0)
    );

    if (chartInstance) chartInstance.destroy();

    chartInstance = new window.Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Łączna waga ryb (kg)",
          data: values,
          backgroundColor: ["rgba(73,166,255,0.7)", "rgba(61,220,151,0.7)"],
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => `${value} kg`
            }
          }
        }
      }
    });
  }
}

function setupRealtime() {
  if (!supabaseClient || realtimeChannelsStarted) return;
  realtimeChannelsStarted = true;

  const rerenderAll = async () => {
    if ($("total-weight")) {
      const [catches, spots, checklist] = await Promise.all([
        loadCatchesFromSupabase(),
        loadSpotsFromSupabase(),
        loadChecklistFromSupabase()
      ]);
      updateDashboard(catches, spots, checklist);
    }
    if ($("catches-list")) await renderCatchesPage();
    if ($("checklist-groups")) await renderChecklistPage();
    if ($("spots-list")) await renderSpotsPage();
  };

  supabaseClient.channel("realtime-catches")
    .on("postgres_changes", { event: "*", schema: "public", table: "catches" }, rerenderAll)
    .subscribe();

  supabaseClient.channel("realtime-checklist")
    .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, rerenderAll)
    .subscribe();

  supabaseClient.channel("realtime-spots")
    .on("postgres_changes", { event: "*", schema: "public", table: "spots" }, rerenderAll)
    .subscribe();
}

async function initDashboardPage() {
  const [catches, spots, checklist] = await Promise.all([
    loadCatchesFromSupabase(),
    loadSpotsFromSupabase(),
    loadChecklistFromSupabase()
  ]);
  updateDashboard(catches, spots, checklist);
  setupRealtime();
}

async function initCatchesPage() {
  setDefaultCaughtAt();
  bindCatchesPageEvents();
  await renderCatchesPage();
  setupRealtime();
}

async function initChecklistPage() {
  bindChecklistPageEvents();
  await renderChecklistPage();
  setupRealtime();
}

async function initWeatherPage() {
  bindWeatherPageEvents();
  await renderWeatherPage();
}

async function initSpotsPage() {
  bindSpotsPageEvents();
  await renderSpotsPage();
  setupRealtime();
}

function initKnowledgePage() {
  // same shared header/countdown/menu only
}

function initApp() {
  updateCountdown();
  setupMobileMenu();
  setInterval(updateCountdown, 60000);

  if ($("total-weight")) initDashboardPage();
  if ($("catch-form")) initCatchesPage();
  if ($("checklist-form")) initChecklistPage();
  if ($("weather-current-temp")) initWeatherPage();
  if ($("spot-form")) initSpotsPage();
  if (document.querySelector(".knowledge-grid")) initKnowledgePage();
}

function bootApp() {
  if (window.RybyAuth && !window.RybyAuth.isAuthenticated()) {
    document.addEventListener("ryby:auth-success", initApp, { once: true });
    return;
  }
  initApp();
}

document.addEventListener("DOMContentLoaded", bootApp);

window.deleteCatch = deleteCatch;
window.editCatch = editCatch;
window.deleteChecklistItem = deleteChecklistItem;
window.editChecklistItem = editChecklistItem;
window.deleteSpot = deleteSpot;
window.editSpot = editSpot;
