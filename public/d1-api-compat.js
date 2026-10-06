(() => {
  let bootstrapPromise = null;
  const activeTrip = async () => {
    if (window.DREAM_TRIP?.id) return window.DREAM_TRIP;
    if (!bootstrapPromise) bootstrapPromise = fetch('/api/bootstrap', { cache: 'no-store' }).then(r => r.json());
    const model = await bootstrapPromise;
    return model.trips.find(t => t.id === model.app.activeTripId) || model.trips[0];
  };

  async function api(path, options = {}) {
    const method = options.method || 'GET';
    if (method !== 'GET' && /\/\d+$/.test(path)) path += '?tripId=' + encodeURIComponent(window.DREAM_TRIP.id);
    return window.Dream.api(path, options);
  }
  function anglerId(name) {
    const found = window.DREAM_MODEL.anglers.find(a => a.name === name);
    if (!found) throw new Error('Nieznany uczestnik: ' + name);
    return found.id;
  }

  function parseQuantity(value) {
    if (value == null || value === '') return { quantity: null, unit: 'szt.' };
    const match = String(value).trim().match(/^([0-9]+(?:[.,][0-9]+)?)\s*(.*)$/);
    if (!match) return { quantity: null, unit: 'szt.' };
    return { quantity: Number(match[1].replace(',', '.')), unit: match[2] || 'szt.' };
  }

  function oldCatch(x) {
    return {
      id: x.id,
      person: x.anglerName,
      angler_id: x.anglerId,
      species: x.species,
      weight: Number(x.weightKg),
      bait: x.bait,
      spot: x.spot,
      spot_id: x.spotId ?? x.spot_id ?? null,
      note: x.notes,
      caught_at: x.caughtAt,
      created_at: x.createdAt || x.caughtAt
    };
  }

  function oldSpot(x) {
    return {
      id: x.id,
      name: x.name,
      distance_m: x.distanceM,
      depth_m: x.depthM,
      bottom_type: x.bottomType,
      note: x.notes,
      weed: x.weed, rig: x.rig, bait: x.bait,
      obstacles: x.obstacles,
      best_time: x.bestTime,
      best_wind: x.bestWind,
      created_at: x.createdAt || null
    };
  }

  function oldCheck(x) {
    const qty = parseQuantity(x.quantity);
    return {
      id: x.id,
      category: x.category,
      item_name: x.label,
      quantity: qty.quantity,
      unit: qty.unit,
      done: Boolean(x.packed),
      assigned_to: x.assignedTo || '',
      sort_order: x.sortOrder ?? 0,
      created_at: x.createdAt || null
    };
  }


  class Builder {
    constructor(table) {
      this.table = table;
      this.operation = 'select';
      this.payload = null;
      this.filters = [];
      this.singleMode = false;
      this.selected = '*';
    }
    select(columns = '*') { this.selected = columns; return this; }
    order(column, { ascending = true } = {}) { (this.orders ||= []).push([column, ascending]); return this; }
    insert(rows) { this.operation = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
    update(payload) { this.operation = 'update'; this.payload = payload; return this; }
    delete() { this.operation = 'delete'; return this; }
    eq(column, value) { this.filters.push([column, value]); return this; }
    in(column, values) { this.filters.push([column, { __in: Array.isArray(values) ? values : [] }]); return this; }
    single() { this.singleMode = true; return this; }
    maybeSingle() { this.singleMode = true; return this; }
    then(resolve, reject) { this.execute().then(resolve, reject); }

    async execute() {
      try {
        const trip = await activeTrip();
        if (!trip) return { data: this.singleMode ? null : [], error: null };

        if (this.operation === 'select') {
          let data = [];
          if (this.table === 'catches') {
            const out = await api(`/api/catches?tripId=${encodeURIComponent(trip.id)}`);
            data = out.catches.map(oldCatch);
          } else if (this.table === 'spots') {
            const out = await api(`/api/spots?tripId=${encodeURIComponent(trip.id)}`);
            data = out.spots.map(oldSpot);
          } else if (this.table === 'checklist_items') {
            const out = await api(`/api/checklist?tripId=${encodeURIComponent(trip.id)}`);
            data = out.items.map(oldCheck);
          }

          for (const [key, value] of this.filters) {
            if (value && typeof value === 'object' && Array.isArray(value.__in)) data = data.filter(row => value.__in.map(String).includes(String(row[key])));
            else data = data.filter(row => String(row[key]) === String(value));
          }
          for (const [column, asc] of [...(this.orders || [])].reverse()) data.sort((a,b) => String(a[column] ?? '').localeCompare(String(b[column] ?? ''), 'pl', { numeric:true }) * (asc?1:-1));
          if (this.singleMode) return { data: data[0] || null, error: null };
          return { data, error: null };
        }

        if (this.operation === 'insert') {
          const saved = [];
          for (const row of this.payload || []) {
            if (this.table === 'catches') {
              const out = await api('/api/catches', { method: 'POST', body: JSON.stringify({
                tripId: trip.id,
                anglerId: anglerId(row.person),
                weightKg: Number(row.weight),
                species: row.species || 'Karp',
                caughtAt: row.caught_at || new Date().toISOString(),
                spot: row.spot || null,
                bait: row.bait || null,
                notes: row.note || null,
                spotId: row.spot_id ?? null
              }) });
              saved.push({ ...row, id: out.id });
            } else if (this.table === 'spots') {
              const out = await api('/api/spots', { method: 'POST', body: JSON.stringify({
                tripId: trip.id,
                name: row.name,
                depthM: row.depth_m ?? null,
                distanceM: row.distance_m ?? null,
                bottomType: row.bottom_type || null,
                notes: row.note || null,
                obstacles: row.obstacles || null,
                bestTime: row.best_time || null,
                bestWind: row.best_wind || null
              }) });
              saved.push({ ...row, id: out.id });
            } else if (this.table === 'checklist_items') {
              const out = await api('/api/checklist', { method: 'POST', body: JSON.stringify({
                tripId: trip.id,
                category: row.category || 'Inne',
                label: row.item_name,
                packed: Boolean(row.done),
                assignedTo: row.assigned_to || null,
                quantity: row.quantity == null ? null : `${row.quantity}${row.unit ? ` ${row.unit}` : ''}`
              }) });
              saved.push({ ...row, id: out.id });
            }
          }
          return { data: this.singleMode ? (saved[0] || null) : saved, error: null };
        }

        const idFilter = this.filters.find(([key]) => key === 'id');
        const rawId = idFilter ? idFilter[1] : null;
        const ids = rawId && typeof rawId === 'object' && Array.isArray(rawId.__in) ? rawId.__in.map(Number).filter(Number.isFinite) : [];
        const id = ids.length ? null : (rawId == null ? null : Number(rawId));

        if (this.operation === 'update') {
          if (this.table === 'catches' && id) {
            await api(`/api/catches/${id}`, { method: 'PUT', body: JSON.stringify({
              anglerId: this.payload.person ? anglerId(this.payload.person) : undefined,
              weightKg: this.payload.weight,
              species: this.payload.species,
              caughtAt: this.payload.caught_at,
              spot: this.payload.spot,
              bait: this.payload.bait,
              notes: this.payload.note,
              spotId: this.payload.spot_id
            }) });
          } else if (this.table === 'spots' && id) {
            await api(`/api/spots/${id}`, { method: 'PUT', body: JSON.stringify({
              name: this.payload.name,
              depthM: this.payload.depth_m,
              distanceM: this.payload.distance_m,
              bottomType: this.payload.bottom_type,
              notes: this.payload.note,
              obstacles: this.payload.obstacles,
              bestTime: this.payload.best_time,
              bestWind: this.payload.best_wind
            }) });
          } else if (this.table === 'checklist_items' && (id || ids.length)) {
            const patch = {};
            if ('category' in this.payload) patch.category = this.payload.category;
            if ('item_name' in this.payload) patch.label = this.payload.item_name;
            if ('done' in this.payload) patch.packed = Boolean(this.payload.done);
            if ('assigned_to' in this.payload) patch.assignedTo = this.payload.assigned_to || null;
            if ('quantity' in this.payload || 'unit' in this.payload) patch.quantity = this.payload.quantity == null ? null : `${this.payload.quantity}${this.payload.unit ? ` ${this.payload.unit}` : ''}`;
            if (ids.length) {
              for (const oneId of ids) await api(`/api/checklist/${oneId}`, { method: 'PATCH', body: JSON.stringify(patch) });
            } else {
              await api(`/api/checklist/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
            }
          }
          if (!id && !ids.length) throw new Error('Aktualizacja wymaga identyfikatora wpisu.');
          return { data: this.singleMode ? { ...this.payload, id: id || ids[0] || null } : null, error: null };
        }

        if (this.operation === 'delete') {
          if (!id) return { data: null, error: null };
          if (this.table === 'catches') await api(`/api/catches/${id}`, { method: 'DELETE' });
          if (this.table === 'spots') await api(`/api/spots/${id}`, { method: 'DELETE' });
          if (this.table === 'checklist_items') await api(`/api/checklist/${id}`, { method: 'DELETE' });
          return { data: null, error: null };
        }

        return { data: null, error: null };
      } catch (error) {
        console.error('D1 compatibility error', this.table, error);
        return { data: this.singleMode ? null : [], error: { message: String(error?.message || error) } };
      }
    }
  }

  const compat = {
    from(table) { if (!['catches','spots','checklist_items'].includes(table)) throw new Error('Nieobsługiwana tabela'); return new Builder(table); },
    // Synchronization is handled explicitly by app.js (visibility-aware polling).
  };

  window.d1Client = compat;
})();
