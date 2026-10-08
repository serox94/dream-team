const TRIP_START = window.DREAM_TRIP?.start ? new Date(window.DREAM_TRIP.start) : null;
const TRIP_END = window.DREAM_TRIP?.end ? new Date(window.DREAM_TRIP.end) : null;
const PB_CELEBRATION_STORAGE_KEY = "ryby2026_pb_celebrated_catches";

const d1Client = window.d1Client || null;

const FISHING_SPOT = {
  name: window.DREAM_TRIP?.lakeProfile?.name || window.DREAM_TRIP?.lake || 'Łowisko',
  latitude: window.DREAM_TRIP?.lakeProfile?.latitude ?? window.DREAM_TRIP?.latitude ?? null,
  longitude: window.DREAM_TRIP?.lakeProfile?.longitude ?? window.DREAM_TRIP?.longitude ?? null
};
const FALLBACK_CATCHES = [];

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

function defaultCarpSpecies(){return window.DreamI18n?.lang==='en'?'Carp':'Karp';}
function formatCaughtAt(value) { return value ? Dream.format(value) : 'Brak daty'; }
function formatDateForInput(value) { return Dream.dateInput(value); }

function formatHour(value) {
  return new Date(value).toLocaleString((document.documentElement.lang==='en'?'en-GB':'pl-PL'), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDay(value) {
  return new Date(value).toLocaleDateString((document.documentElement.lang==='en'?'en-GB':'pl-PL'), {
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
  const person = item.person || item.anglerName;
  if (!person) return false;
  const weight = Number(item.weight || item.weightKg || 0);
  const currentPb = Number(window.DREAM_MODEL?.anglers.find(a=>a.name===person)?.pbKg || 0);
  if (!(weight > currentPb)) return false;
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
  if (!Number.isFinite(parsedId) || !d1Client) return "";
  const { data, error } = await d1Client.from("spots").select("name").eq("id", parsedId).maybeSingle();
  if (error) {
    console.error("Błąd pobrania nazwy spotu:", error.message);
    return "";
  }
  return normalizeText(data?.name || "", 80);
}

function updateCountdown() {
  const countdownEl = $("countdown");
  if (!countdownEl) return;
  const english=window.DreamI18n?.lang==='en';
  const show=value=>{countdownEl.textContent=value;if($("dashboard-countdown"))$("dashboard-countdown").textContent=value;};

  if (!TRIP_START) { show(window.DREAM_TRIP?.status === 'archived' ? (english?'Archive · date unknown':'Archiwum · termin nieustalony') : (english?'Date to be confirmed':'Termin do ustalenia')); return; }
  const now = new Date();
  if (now < TRIP_START) {
    const diff = TRIP_START - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    show(english?`Trip in: ${days} days, ${hours} hr, ${minutes} min.`:`Do wyjazdu: ${days} dni, ${hours} godz., ${minutes} min.`);
    return;
  }

  if (now >= TRIP_START && (!TRIP_END || now <= TRIP_END)) {
    show(english?'Trip in progress':'Wyjazd trwa');
    return;
  }

  show(english?'Trip ended':'Wyjazd zakończony');
}
document.addEventListener('dream:i18n-ready',updateCountdown);

function setupMobileMenu() {
  const toggleBtn = $("menu-toggle");
  const nav = $("main-nav");
  if (!toggleBtn || !nav || toggleBtn.dataset.bound === "1") return;

  toggleBtn.dataset.bound = "1";

  const closeMenu = () => {
    nav.classList.remove("open");
    toggleBtn.setAttribute("aria-expanded", "false");
    $("bottom-more")?.setAttribute("aria-expanded", "false");
  };

  toggleBtn.addEventListener("click", () => {
    nav.classList.toggle("open");
    const expanded = nav.classList.contains("open");
    toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    $("bottom-more")?.setAttribute("aria-expanded", expanded ? "true" : "false");
  });
  $("bottom-more")?.addEventListener("click", () => toggleBtn.click());

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", event => {
    if (!nav.classList.contains("open")) return;
    if (nav.contains(event.target) || toggleBtn.contains(event.target) || $("bottom-more")?.contains(event.target)) return;
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
    const hour = Dream.hour(item.caught_at);
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

async function loadCatchesFromD1() {
  if (!d1Client) throw new Error('Brak połączenia z bazą.');
  const { data, error } = await d1Client.from("catches").select("*").order("caught_at", { ascending: false });
  if (error) {
    console.error("Błąd pobierania połowów:", error.message);
    throw new Error(error.message);
  }
  return data || [];
}

async function loadChecklistFromD1() {
  if (!d1Client) return [];
  const { data, error } = await d1Client
    .from("checklist_items")
    .select("*")
    .order("category", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Błąd pobierania checklisty:", error.message);
    throw new Error(error.message);
  }
  return data || [];
}

async function loadSpotsFromD1() {
  if (!d1Client) return [];
  const { data, error } = await d1Client.from("spots").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("Błąd pobierania spotów:", error.message);
    throw new Error(error.message);
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
    option.dataset.userContent=""; option.textContent = spot.name;
    select.appendChild(option);
  });

  select.value = current || "";
}

function validateCatchPayload(raw) {
  const person = normalizeText(raw.person, 60);
  const species = normalizeText(raw.species, 50);
  const bait = normalizeText(raw.bait, 50);
  const spotText = normalizeText(raw.spot, 80);
  const note = normalizeText(raw.note, 300);
  const weight = parseNumber(raw.weight, { min: 0.01, max: 99.99, allowNull: false });
  const spotId = raw.spot_id ? Number(raw.spot_id) : null;
  const caughtAt = raw.caught_at;

  if (!window.DREAM_TRIP.participants.some(a => a.name === person)) return { ok: false, message: "Wybierz osobę." };
  if (!species) return { ok: false, message: "Podaj gatunek." };
  if (!Number.isFinite(weight)) return { ok: false, message: "Podaj poprawną wagę od 0.01 do 99.99 kg." };
  if (!bait) return { ok: false, message: "Podaj przynętę." };
  
  if (!caughtAt) return { ok: false, message: "Podaj datę i godzinę połowu." };

  let caughtDate;
  try { caughtDate = new Date(Dream.fromInput(caughtAt)); } catch (e) { return {ok:false,message:e.message}; }
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
  $("person").value = item.person || "";
  $("species").value = item.species || defaultCarpSpecies();
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
  if($("species")) $("species").value=defaultCarpSpecies();
  $("catch-form-title").textContent = "Dodaj połów";
  $("save-catch-btn").textContent = "Dodaj połów";
  $("cancel-edit-catch-btn").classList.add("hidden");
  setDefaultCaughtAt();
  setMessage("form-message", "");
}

async function handleCatchSubmit(event) {
  event.preventDefault();
  if (!d1Client) return;

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
  let pendingSync = false;
  if (editId) {
    ({ data: savedCatch, error } = await d1Client
      .from("catches")
      .update(validation.payload)
      .eq("id", Number(editId))
      .select("id, person, weight, caught_at")
      .single());
  } else {
    try {
      const angler = window.DREAM_MODEL?.anglers?.find(a => a.name === validation.payload.person);
      if (!angler) throw new Error("Nieznany uczestnik wyjazdu.");
      const result = await Dream.api("/api/catches", {
        method: "POST",
        body: JSON.stringify({
          tripId: window.DREAM_TRIP.id,
          anglerId: angler.id,
          weightKg: validation.payload.weight,
          species: validation.payload.species,
          caughtAt: validation.payload.caught_at,
          spot: validation.payload.spot,
          spotId: validation.payload.spot_id,
          bait: validation.payload.bait,
          notes: validation.payload.note
        })
      });
      pendingSync = Boolean(result.pendingSync);
      savedCatch = { ...validation.payload, id: result.id };
    } catch (caught) {
      error = { message: caught?.message || String(caught) };
    }
  }

  if (error) {
    console.error("Błąd zapisu połowu:", error.message);
    setMessage("form-message", `Nie udało się zapisać połowu. ${error.message} Dane w formularzu pozostały.`, "error");
    return;
  }

  if (savedCatch) celebrateCatchIfNeeded(savedCatch, { play: !pendingSync });
  resetCatchForm();
  setMessage("form-message", pendingSync ? "Oczekuje na synchronizację." : (editId ? "Zmiany zapisane." : "Połów został dodany."), "success");
  try {
    if (!pendingSync) await Dream.refreshModel();
    await renderCatchesPage();
  }
  catch (error) { Dream.notice(`${pendingSync ? "Połów czeka na synchronizację." : "Połów zapisany."} Nie udało się odświeżyć listy: ${error.message}`,true); }
}

async function deleteCatch(id) {
  if (!d1Client) return;
  if (!window.confirm("Usunąć ten połów?")) return;
  const { error } = await d1Client.from("catches").delete().eq("id", id);
  if (error) {
    window.alert("Nie udało się usunąć połowu.");
    return;
  }
  await Dream.refreshModel();
  await renderCatchesPage();
  Dream.undo('catches', id, renderCatchesPage);
}

async function editCatch(id) {
  const catches = await loadCatchesFromD1();
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
    left.appendChild(el("div", "catch-meta", formatCaughtAt(item.caught_at)+(item.pendingSync?" · Oczekuje na synchronizację":"")));
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
    editBtn.disabled=deleteBtn.disabled=Boolean(item.pendingSync);
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
  const [catches, spots] = await Promise.all([loadCatchesFromD1(), loadSpotsFromD1()]);
  populateSpotSelect(spots);
  renderCatchSummary(catches, spots);
  renderCatchesList(catches, spots);
}

function bindCatchesPageEvents() {
  if (catchFormBound) return;
  catchFormBound = true;

  const catchForm=$("catch-form"),catchSave=$("save-catch-btn");
  // Keep the browser's native submit path. Custom click redispatch caused real
  // mobile/offline clicks to be consumed without a submit event.
  catchForm?.addEventListener("submit", guardedSubmit(handleCatchSubmit));
  if(catchForm)catchForm.dataset.bound="true";
  if(catchSave)catchSave.disabled=false;
  $("refresh-catches-btn")?.addEventListener("click", () => renderCatchesPage().catch(error=>Dream.notice(error.message,true)));
  $("cancel-edit-catch-btn")?.addEventListener("click", resetCatchForm);
  $("spot-id")?.addEventListener("change", async e => {
    const selectedId = Number(e.target.value);
    if (!Number.isFinite(selectedId)) return;
    const spots = await loadSpotsFromD1();
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
  const assigned_to = normalizeText(raw.assigned_to, 60) || null;
  const quantity = parseNumber(raw.quantity, { min: 0, max: 99999, allowNull: true });

  const allowedCategories = ["sprzęt", "zakupy", "jedzenie / picie"];
  const allowedUnits = ["szt.", "kg", "litry"];

  if (!category) return { ok: false, message: "Wybierz kategorię." };
  if (!itemName) return { ok: false, message: "Podaj nazwę pozycji." };
  if (Number.isNaN(quantity)) return { ok: false, message: "Ilość musi być liczbą 0 lub większą." };


  return {
    ok: true,
    payload: {
      category,
      item_name: itemName,
      quantity,
      unit,
      assigned_to,
      done: false
    }
  };
}

function fillChecklistFormForEdit(item) {
  $("edit-check-id").value = item.id;
  for (const [id, value] of [['check-category', item.category], ['check-unit', item.unit || 'szt.']]) {
    const select = $(id);
    if (![...select.options].some(o => o.value === value)) { const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option); }
  }
  $("check-category").value = item.category;
  $("check-name").value = item.item_name;
  $("check-quantity").value = item.quantity ?? "";
  $("check-unit").value = item.unit || "szt.";
  const assigned=$("check-assigned");
  if(assigned){
    if(item.assigned_to&&![...assigned.options].some(option=>option.value===item.assigned_to)){
      const option=document.createElement('option');option.value=item.assigned_to;option.textContent=item.assigned_to;assigned.append(option);
    }
    assigned.value=item.assigned_to||'';
  }
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
  if (!d1Client) return;

  const validation = validateChecklistPayload({
    category: $("check-category")?.value,
    item_name: $("check-name")?.value,
    quantity: $("check-quantity")?.value,
    unit: $("check-unit")?.value,
    assigned_to: $("check-assigned")?.value
  });

  if (!validation.ok) {
    setMessage("checklist-message", validation.message, "error");
    return;
  }

  const editId = $("edit-check-id")?.value;
  if (editId) delete validation.payload.done;
  setMessage("checklist-message", editId ? "Zapisywanie zmian..." : "Dodawanie pozycji...");

  let error;
  if (editId) {
    ({ error } = await d1Client.from("checklist_items").update(validation.payload).eq("id", Number(editId)));
  } else {
    ({ error } = await d1Client.from("checklist_items").insert([validation.payload]));
  }

  if (error) {
    console.error("Błąd zapisu checklisty:", error.message);
    setMessage("checklist-message", `Nie udało się zapisać pozycji. ${error.message} Dane w formularzu pozostały.`, "error");
    return;
  }

  resetChecklistForm();
  setMessage("checklist-message", editId ? "Zmiany zapisane." : "Pozycja została dodana.", "success");
  await renderChecklistPage();
}

async function deleteChecklistItem(id) {
  if (!d1Client) return;
  if (!window.confirm("Usunąć tę pozycję?")) return;
  const { error } = await d1Client.from("checklist_items").delete().eq("id", id);
  if (error) {
    window.alert("Nie udało się usunąć pozycji.");
    return;
  }
  await renderChecklistPage();
  Dream.undo('checklist', id, renderChecklistPage);
}

async function editChecklistItem(id) {
  const items = await loadChecklistFromD1();
  const item = items.find(row => Number(row.id) === Number(id));
  if (item) fillChecklistFormForEdit(item);
}

async function toggleChecklistItem(id, done) {
  if (!d1Client) return;
  const { error } = await d1Client.from("checklist_items").update({ done }).eq("id", id);
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
      if (item.pendingSync) metaText.push("Oczekuje na synchronizację");
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
  const items = await loadChecklistFromD1();
  renderChecklistSummary(items);
  renderChecklistGroups(items);
}

function bindChecklistPageEvents() {
  if (checklistFormBound) return;
  checklistFormBound = true;
  $("checklist-form")?.addEventListener("submit", guardedSubmit(handleChecklistSubmit));
  $("refresh-checklist-btn")?.addEventListener("click", () => renderChecklistPage().catch(error=>Dream.notice(error.message,true)));
  $("cancel-edit-check-btn")?.addEventListener("click", resetChecklistForm);
}

function validateSpotPayload(raw) {
  const name = normalizeText(raw.name, 60);
  const distance_m = parseNumber(raw.distance_m, { min: 0, max: 2000, allowNull: true });
  const depth_m = parseNumber(raw.depth_m, { min: 0, max: 100, allowNull: true });
  const bottom_type = normalizeText(raw.bottom_type, 60);
  const latitude = parseNumber(raw.latitude, { min: -90, max: 90, allowNull: true });
  const longitude = parseNumber(raw.longitude, { min: -180, max: 180, allowNull: true });
  const weed = normalizeText(raw.weed, 100);
  const rig = normalizeText(raw.rig, 100);
  const bait = normalizeText(raw.bait, 100);
  const note = normalizeText(raw.note, 500);
  const obstacles = normalizeText(raw.obstacles, 120);
  const best_time = normalizeText(raw.best_time, 60);
  const best_wind = normalizeText(raw.best_wind, 60);

  if (!name) return { ok: false, message: "Podaj nazwę spotu." };
  if (Number.isNaN(distance_m)) return { ok: false, message: "Odległość musi być liczbą 0 lub większą." };
  if (Number.isNaN(depth_m)) return { ok: false, message: "Głębokość musi być liczbą 0 lub większą." };
  if (Number.isNaN(latitude)) return { ok: false, message: "Szerokość GPS musi być liczbą od -90 do 90." };
  if (Number.isNaN(longitude)) return { ok: false, message: "Długość GPS musi być liczbą od -180 do 180." };

  return {
    ok: true,
    payload: {
      name,
      distance_m,
      depth_m,
      bottom_type: bottom_type || null,
      latitude,
      longitude,
      weed: weed || null,
      rig: rig || null,
      bait: bait || null,
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
  if ($("spot-latitude")) $("spot-latitude").value = item.latitude ?? "";
  if ($("spot-longitude")) $("spot-longitude").value = item.longitude ?? "";
  if ($("spot-weed")) $("spot-weed").value = item.weed || "";
  if ($("spot-rig")) $("spot-rig").value = item.rig || "";
  if ($("spot-bait")) $("spot-bait").value = item.bait || "";
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
  if (!d1Client) return;

  const validation = validateSpotPayload({
    name: $("spot-name")?.value,
    distance_m: $("spot-distance")?.value,
    depth_m: $("spot-depth")?.value,
    bottom_type: $("spot-bottom")?.value,
    latitude: $("spot-latitude")?.value,
    longitude: $("spot-longitude")?.value,
    weed: $("spot-weed")?.value,
    rig: $("spot-rig")?.value,
    bait: $("spot-bait")?.value,
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
    ({ error } = await d1Client.from("spots").update(validation.payload).eq("id", Number(editId)));
  } else {
    ({ error } = await d1Client.from("spots").insert([validation.payload]));
  }

  if (error) {
    console.error("Błąd zapisu spotu:", error.message);
    setMessage("spot-message", editId ? "Nie udało się zapisać zmian." : "Nie udało się dodać spotu.", "error");
    return;
  }

  resetSpotForm();
  setMessage("spot-message", editId ? "Zmiany zapisane." : "Spot został dodany.", "success");
  await renderSpotsPage();
  const spots = await loadSpotsFromD1();
  populateSpotSelect(spots);
}

async function deleteSpot(id) {
  if (!d1Client) return;

  const spots = await loadSpotsFromD1();
  const spot = spots.find(item => Number(item.id) === Number(id));
  const spotName = normalizeText(spot?.name || "", 80);

  if (!window.confirm("Usunąć ten spot?")) return;

  const { error } = await d1Client.from("spots").delete().eq("id", id);
  if (error) {
    window.alert("Nie udało się usunąć spotu.");
    return;
  }
  await renderSpotsPage();
  const refreshedSpots = await loadSpotsFromD1();
  populateSpotSelect(refreshedSpots);
  Dream.undo('spots', id, renderSpotsPage);
}

async function editSpot(id) {
  const controls=[...$("spot-form").querySelectorAll("input,select,button")],disabled=controls.map(control=>control.disabled);
  controls.forEach(control=>control.disabled=true);
  try {
    const spots = await loadSpotsFromD1();
    const item = spots.find(spot => Number(spot.id) === Number(id));
    if (item) fillSpotFormForEdit(item);
  } finally {controls.forEach((control,index)=>control.disabled=disabled[index]);}
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
    left.appendChild(el("div", "catch-meta", `Dodano: ${formatCaughtAt(item.created_at)}${item.pendingSync?" · Oczekuje na synchronizację":""}`));

    const actions = el("div", "inline-actions");
    const editBtn = el("button", "edit-btn", "Edytuj");
    editBtn.type = "button";
    editBtn.addEventListener("click", () => editSpot(item.id));
    const deleteBtn = el("button", "danger-btn", "Usuń");
    deleteBtn.type = "button";
    deleteBtn.addEventListener("click", () => deleteSpot(item.id));
    editBtn.disabled=deleteBtn.disabled=Boolean(item.pendingSync);
    actions.append(editBtn, deleteBtn);
    top.append(left, actions);

    const badges = el("div", "catch-badges");
    badges.appendChild(el("span", "badge", `Odległość: ${item.distance_m !== null && item.distance_m !== undefined ? `${Number(item.distance_m).toFixed(1)} m` : "brak"}`));
    badges.appendChild(el("span", "badge", `Głębokość: ${item.depth_m !== null && item.depth_m !== undefined ? `${Number(item.depth_m).toFixed(1)} m` : "brak"}`));
    badges.appendChild(el("span", "badge", `Dno: ${normalizeText(item.bottom_type || "brak", 60)}`));
    if (item.latitude != null && item.longitude != null) badges.appendChild(el("span", "badge", `GPS: ${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}`));

    article.append(top, badges);

    const meta = [];
    if (item.obstacles) meta.push(`Zaczepy: ${normalizeText(item.obstacles, 120)}`);
    if (item.best_time) meta.push(`Najlepsza pora: ${normalizeText(item.best_time, 60)}`);
    if (item.best_wind) meta.push(`Najlepszy wiatr: ${normalizeText(item.best_wind, 60)}`);
    if (item.weed) meta.push(`Zielsko: ${normalizeText(item.weed, 100)}`);
    if (item.rig) meta.push(`Rig: ${normalizeText(item.rig, 100)}`);
    if (item.bait) meta.push(`Przynęta: ${normalizeText(item.bait, 100)}`);
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
  const spots = await loadSpotsFromD1();
  renderSpotsSummary(spots);
  renderSpotsList(spots);
}

function bindSpotsPageEvents() {
  if (spotsFormBound) return;
  spotsFormBound = true;
  $("spot-form")?.addEventListener("submit", guardedSubmit(handleSpotSubmit));
  $("refresh-spots-btn")?.addEventListener("click", () => renderSpotsPage().catch(error=>Dream.notice(error.message,true)));
  $("cancel-edit-spot-btn")?.addEventListener("click", resetSpotForm);
}

function updateDashboard(catches, spots = [], checklist = []) {
  window.DREAM_LAST_CATCHES = catches;
  if (!$("total-weight")) return;
  const stats = getStats(catches, spots);
  $("total-weight").textContent = `${stats.totalWeight.toFixed(1)} kg`;
  $("total-fish").textContent = String(stats.totalFish);
  $("biggest-fish").textContent = stats.biggestFish;
  const biggest = [...catches].sort((a,b) => b.weight-a.weight || new Date(a.caught_at)-new Date(b.caught_at))[0];
  $("biggest-fish-person").textContent = biggest?.person || 'Brak';
  $("best-spot").textContent = stats.bestSpot;
  $("best-bait-global").textContent = stats.bestBait;
  $("best-hour-global").textContent = stats.bestHour;
  $("spots-count-dashboard").textContent = String(spots.length);
  for (const a of window.DREAM_TRIP.participants) {
    const person = getPersonStats(catches,a.name,spots), key='angler-'+a.id;
    for (const [field,value] of Object.entries({biggest:person.biggest.toFixed(1)+' kg',total:person.total.toFixed(1)+' kg',count:person.count,bait:person.bestBait,spot:person.bestSpot})) {
      if ($(key+'-'+field)) $(key+'-'+field).textContent=value;
    }
    const pb=window.DREAM_MODEL.anglers.find(p=>p.id===a.id)?.pbKg||0;
    if ($(key+'-pb-text')) $(key+'-pb-text').textContent=pb.toFixed(1)+' kg';
    if ($(key+'-pb-bar')) $(key+'-pb-bar').style.width=(pb?Math.min(person.biggest/pb*100,100):0)+'%';
  }
  const record=window.DREAM_MODEL.allTime.dreamTeamRecord;
  if ($('dream-team-alltime-value')) $('dream-team-alltime-value').textContent=record?`${Number(record.weightKg).toFixed(1)} kg · ${record.anglerName}`:'Brak zapisanych połowów';
  const lastEntryBox = $("last-entry");
  if (lastEntryBox) {
    clearNode(lastEntryBox);
    lastEntryBox.classList.remove("last-entry-list");
    if (!catches.length) {
      lastEntryBox.textContent = "Nie ma jeszcze połowów na tym wyjeździe. ";
      const link=el('a','dashboard-mini-link','Dodaj pierwszy połów →');link.href='/pages/polowy.html';lastEntryBox.append(link);
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

  if (typeof window.renderDashboardExtras === 'function') window.renderDashboardExtras(catches,spots,checklist);
  window.DreamField?.renderDashboard(window.DREAM_TRIP,checklist);
  window.renderDreamChart?.(catches);
}

function setupRealtime() {
  if (realtimeChannelsStarted) return;
  realtimeChannelsStarted = true;
  let running=false;
  const refresh=async()=>{
    if(running||document.hidden||document.querySelector('form[data-dirty="true"]')||document.querySelector('form[data-saving="true"]'))return;
    running=true;
    try {
      await Dream.refreshModel();
      if ($('total-weight')) await initDashboardPage();
      if ($('catches-list')) await renderCatchesPage();
      if ($('checklist-groups')) await renderChecklistPage();
      if ($('spots-list')) await renderSpotsPage();
    } catch(error) { Dream.notice('Nie udało się odświeżyć danych. '+error.message,true); }
    finally {running=false;}
  };
  setInterval(refresh,120000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
}

function guardedSubmit(handler) {
  return async event => {
    event.preventDefault();
    const form=event.currentTarget;
    if(form.dataset.saving==='true')return;
    form.dataset.saving='true';
    const buttons=[...form.querySelectorAll('button[type="submit"]')];buttons.forEach(b=>b.disabled=true);
    try {await handler(event);} catch(error){Dream.notice(error.message,true);}
    finally {delete form.dataset.saving;buttons.forEach(b=>b.disabled=false);}
  };
}

async function initDashboardPage() {
  const [catches, spots, checklist] = await Promise.all([
    loadCatchesFromD1(),
    loadSpotsFromD1(),
    loadChecklistFromD1()
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
  await window.DreamWeather?.init();
}

async function initSpotsPage() {
  bindSpotsPageEvents();
  await renderSpotsPage();
  setupRealtime();
}

function initKnowledgePage() {
  // same shared header/countdown/menu only
}

async function initApp() {
  document.querySelectorAll('form').forEach(form=>{
    form.addEventListener('input',()=>form.dataset.dirty='true');
    form.addEventListener('change',()=>form.dataset.dirty='true');
    form.addEventListener('reset',()=>delete form.dataset.dirty);
  });
  updateCountdown();
  setupMobileMenu();
  setInterval(updateCountdown, 60000);

  if ($("total-weight")) await initDashboardPage();
  if ($("catch-form")) await initCatchesPage();
  if ($("checklist-form")) await initChecklistPage();
  if ($("weather-current-temp")) await initWeatherPage();
  if ($("spot-form")) await initSpotsPage();
  if (document.querySelector(".knowledge-grid")) initKnowledgePage();
}

window.initDreamApp = initApp;

window.deleteCatch = deleteCatch;
window.editCatch = editCatch;
window.deleteChecklistItem = deleteChecklistItem;
window.editChecklistItem = editChecklistItem;
window.deleteSpot = deleteSpot;
window.editSpot = editSpot;
