const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const badRequest = message => json({ ok: false, error: message }, 400);
const notFound = () => json({ ok: false, error: 'Not found' }, 404);

async function parseJson(request) {
  try { return await request.json(); } catch { return null; }
}

async function getBootstrap(env) {
  const anglers = await env.DB.prepare('SELECT id, name, pb_kg AS pbKg FROM anglers ORDER BY name').all();
  const trips = await env.DB.prepare(`
    SELECT id, year, name, lake, country, status,
           start_at AS start, end_at AS end, peg,
           latitude, longitude, lake_image AS lakeImage,
           facts_json AS factsJson, is_active AS isActive
    FROM trips
    ORDER BY is_active DESC, COALESCE(start_at, '9999') DESC
  `).all();

  const mappedTrips = [];
  for (const trip of trips.results) {
    const stats = await env.DB.prepare(`
      SELECT COUNT(*) AS fishCount,
             COALESCE(SUM(weight_kg), 0) AS totalWeightKg,
             COALESCE(MAX(weight_kg), 0) AS biggestFishKg
      FROM catches WHERE trip_id = ?
    `).bind(trip.id).first();

    const biggest = await env.DB.prepare(`
      SELECT a.name AS anglerName
      FROM catches c JOIN anglers a ON a.id = c.angler_id
      WHERE c.trip_id = ?
      ORDER BY c.weight_kg DESC, c.caught_at ASC LIMIT 1
    `).bind(trip.id).first();

    const bestSpot = await env.DB.prepare(`
      SELECT spot, COUNT(*) AS cnt
      FROM catches
      WHERE trip_id = ? AND spot IS NOT NULL AND TRIM(spot) <> ''
      GROUP BY spot ORDER BY cnt DESC, spot ASC LIMIT 1
    `).bind(trip.id).first();

    mappedTrips.push({
      ...trip,
      isActive: Boolean(trip.isActive),
      facts: JSON.parse(trip.factsJson || '{}'),
      stats: {
        fishCount: Number(stats?.fishCount || 0),
        totalWeightKg: Number(stats?.totalWeightKg || 0),
        biggestFishKg: Number(stats?.biggestFishKg || 0),
        biggestFishAngler: biggest?.anglerName || null,
        bestSpot: bestSpot?.spot || null
      }
    });
  }

  return {
    app: {
      name: 'Dream Team',
      tagline: 'Carp Fishing Trip Manager',
      activeTripId: mappedTrips.find(t => t.isActive)?.id || mappedTrips[0]?.id || null
    },
    anglers: anglers.results,
    trips: mappedTrips
  };
}

async function updateTrip(request, env, id) {
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const current = await env.DB.prepare('SELECT * FROM trips WHERE id = ?').bind(id).first();
  if (!current) return notFound();

  const lake = String(body.lake ?? current.lake).trim();
  if (!lake) return badRequest('Lake name is required');
  const year = Number(body.year ?? current.year);
  const name = String(body.name ?? current.name).trim() || `${lake} ${year}`;
  const country = String(body.country ?? current.country ?? '—').trim() || '—';
  const peg = String(body.peg ?? current.peg ?? '—').trim() || '—';
  const start = body.start ?? current.start_at;
  const end = body.end ?? current.end_at;
  const status = ['planning', 'active', 'archived'].includes(body.status) ? body.status : current.status;
  const factsJson = body.facts ? JSON.stringify(body.facts) : current.facts_json;
  const latitude = body.latitude ?? current.latitude;
  const longitude = body.longitude ?? current.longitude;
  const lakeImage = body.lakeImage ?? current.lake_image;

  await env.DB.prepare(`
    UPDATE trips SET year=?, name=?, lake=?, country=?, status=?, start_at=?, end_at=?, peg=?, latitude=?, longitude=?, lake_image=?, facts_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(year, name, lake, country, status, start || null, end || null, peg, latitude ?? null, longitude ?? null, lakeImage || null, factsJson || '{}', id).run();
  return json({ ok: true });
}

async function setActiveTrip(env, id) {
  const exists = await env.DB.prepare('SELECT id FROM trips WHERE id = ?').bind(id).first();
  if (!exists) return notFound();
  await env.DB.batch([
    env.DB.prepare('UPDATE trips SET is_active = 0 WHERE is_active = 1'),
    env.DB.prepare('UPDATE trips SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id)
  ]);
  return json({ ok: true });
}

async function listCatches(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!tripId) return badRequest('tripId is required');
  const rows = await env.DB.prepare(`
    SELECT c.id, c.trip_id AS tripId, c.angler_id AS anglerId, a.name AS anglerName,
           c.caught_at AS caughtAt, c.weight_kg AS weightKg, c.species, c.spot, c.bait,
           c.rig, c.depth_m AS depthM, c.notes, c.photo_url AS photoUrl
    FROM catches c JOIN anglers a ON a.id = c.angler_id
    WHERE c.trip_id = ? ORDER BY c.caught_at DESC, c.id DESC
  `).bind(tripId).all();
  return json({ ok: true, catches: rows.results });
}

async function createCatch(request, env) {
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const tripId = String(body.tripId || '').trim();
  const anglerId = String(body.anglerId || '').trim();
  const weightKg = Number(body.weightKg);
  const caughtAt = body.caughtAt || new Date().toISOString();
  if (!tripId || !anglerId || !Number.isFinite(weightKg) || weightKg <= 0) return badRequest('tripId, anglerId and positive weightKg are required');
  const result = await env.DB.prepare(`
    INSERT INTO catches (trip_id, angler_id, caught_at, weight_kg, species, spot, bait, rig, depth_m, notes, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(tripId, anglerId, caughtAt, weightKg, String(body.species || 'Karp'), body.spot || null, body.bait || null, body.rig || null, body.depthM ?? null, body.notes || null, body.photoUrl || null).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function updateCatch(request, env, id) {
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const current = await env.DB.prepare('SELECT * FROM catches WHERE id=?').bind(id).first();
  if (!current) return notFound();
  const weightKg = Number(body.weightKg ?? current.weight_kg);
  if (!Number.isFinite(weightKg) || weightKg <= 0) return badRequest('weightKg must be positive');
  await env.DB.prepare(`UPDATE catches SET angler_id=?, caught_at=?, weight_kg=?, species=?, spot=?, bait=?, rig=?, depth_m=?, notes=?, photo_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(body.anglerId ?? current.angler_id, body.caughtAt ?? current.caught_at, weightKg, body.species ?? current.species, body.spot ?? current.spot, body.bait ?? current.bait, body.rig ?? current.rig, body.depthM ?? current.depth_m, body.notes ?? current.notes, body.photoUrl ?? current.photo_url, id).run();
  return json({ ok: true });
}

async function listSpots(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!tripId) return badRequest('tripId is required');
  const rows = await env.DB.prepare(`SELECT id, trip_id AS tripId, name, latitude, longitude, depth_m AS depthM, bottom_type AS bottomType, distance_m AS distanceM, notes, catches_count AS catchesCount FROM spots WHERE trip_id=? ORDER BY id DESC`).bind(tripId).all();
  return json({ ok: true, spots: rows.results });
}

async function createSpot(request, env) {
  const body = await parseJson(request);
  if (!body?.tripId || !String(body.name || '').trim()) return badRequest('tripId and name are required');
  const result = await env.DB.prepare(`INSERT INTO spots (trip_id,name,latitude,longitude,depth_m,bottom_type,distance_m,notes) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(body.tripId, String(body.name).trim(), body.latitude ?? null, body.longitude ?? null, body.depthM ?? null, body.bottomType || null, body.distanceM ?? null, body.notes || null).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function listChecklist(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId');
  if (!tripId) return badRequest('tripId is required');
  const rows = await env.DB.prepare(`SELECT id, trip_id AS tripId, category, label, assigned_to AS assignedTo, packed, quantity, notes, sort_order AS sortOrder FROM checklist_items WHERE trip_id=? ORDER BY category, sort_order, id`).bind(tripId).all();
  return json({ ok: true, items: rows.results.map(r => ({ ...r, packed: Boolean(r.packed) })) });
}

async function createChecklistItem(request, env) {
  const body = await parseJson(request);
  if (!body?.tripId || !String(body.label || '').trim()) return badRequest('tripId and label are required');
  const result = await env.DB.prepare(`INSERT INTO checklist_items (trip_id,category,label,assigned_to,packed,quantity,notes,sort_order) VALUES (?,?,?,?,?,?,?,?)`)
    .bind(body.tripId, body.category || 'Inne', String(body.label).trim(), body.assignedTo || null, body.packed ? 1 : 0, body.quantity || null, body.notes || null, Number(body.sortOrder || 0)).run();
  return json({ ok: true, id: result.meta.last_row_id }, 201);
}

async function updateChecklistItem(request, env, id) {
  const body = await parseJson(request);
  if (!body) return badRequest('Invalid JSON');
  const current = await env.DB.prepare('SELECT * FROM checklist_items WHERE id=?').bind(id).first();
  if (!current) return notFound();
  await env.DB.prepare(`UPDATE checklist_items SET category=?, label=?, assigned_to=?, packed=?, quantity=?, notes=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(body.category ?? current.category, body.label ?? current.label, body.assignedTo ?? current.assigned_to, body.packed == null ? current.packed : (body.packed ? 1 : 0), body.quantity ?? current.quantity, body.notes ?? current.notes, body.sortOrder ?? current.sort_order, id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        const db = await env.DB.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
        return json({ ok: true, app: 'dream-team', database: 'connected', schemaVersion: db?.value || null });
      }
      if (url.pathname === '/api/bootstrap' && request.method === 'GET') return json(await getBootstrap(env));

      if (url.pathname === '/api/catches' && request.method === 'GET') return listCatches(request, env);
      if (url.pathname === '/api/catches' && request.method === 'POST') return createCatch(request, env);
      const catchMatch = url.pathname.match(/^\/api\/catches\/(\d+)$/);
      if (catchMatch && request.method === 'PUT') return updateCatch(request, env, Number(catchMatch[1]));
      if (catchMatch && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM catches WHERE id=?').bind(Number(catchMatch[1])).run(); return json({ ok: true }); }

      if (url.pathname === '/api/spots' && request.method === 'GET') return listSpots(request, env);
      if (url.pathname === '/api/spots' && request.method === 'POST') return createSpot(request, env);
      const spotMatch = url.pathname.match(/^\/api\/spots\/(\d+)$/);
      if (spotMatch && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM spots WHERE id=?').bind(Number(spotMatch[1])).run(); return json({ ok: true }); }

      if (url.pathname === '/api/checklist' && request.method === 'GET') return listChecklist(request, env);
      if (url.pathname === '/api/checklist' && request.method === 'POST') return createChecklistItem(request, env);
      const checklistMatch = url.pathname.match(/^\/api\/checklist\/(\d+)$/);
      if (checklistMatch && request.method === 'PATCH') return updateChecklistItem(request, env, Number(checklistMatch[1]));
      if (checklistMatch && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM checklist_items WHERE id=?').bind(Number(checklistMatch[1])).run(); return json({ ok: true }); }

      const tripMatch = url.pathname.match(/^\/api\/trips\/([^/]+)$/);
      if (tripMatch && request.method === 'PUT') return updateTrip(request, env, decodeURIComponent(tripMatch[1]));
      const activeMatch = url.pathname.match(/^\/api\/trips\/([^/]+)\/activate$/);
      if (activeMatch && request.method === 'POST') return setActiveTrip(env, decodeURIComponent(activeMatch[1]));

      if (url.pathname.startsWith('/api/')) return notFound();
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: 'Internal server error', detail: String(error?.message || error) }, 500);
    }
  }
};