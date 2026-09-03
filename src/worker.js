const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' }
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

  await env.DB.prepare(`
    UPDATE trips SET year=?, name=?, lake=?, country=?, status=?, start_at=?, end_at=?, peg=?, facts_json=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(year, name, lake, country, status, start || null, end || null, peg, factsJson || '{}', id).run();

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
  const url = new URL(request.url);
  const tripId = url.searchParams.get('tripId');
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
  `).bind(
    tripId, anglerId, caughtAt, weightKg,
    String(body.species || 'karp'), body.spot || null, body.bait || null,
    body.rig || null, body.depthM ?? null, body.notes || null, body.photoUrl || null
  ).run();

  return json({ ok: true, id: result.meta.last_row_id }, 201);
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
