const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type'
  }
});
const bad = message => json({ ok: false, error: message }, 400);
const notFound = () => json({ ok: false, error: 'Not found' }, 404);
async function parseBody(request) { try { return await request.json(); } catch { return null; } }


async function bootstrap(env) {
  const anglersRaw = (await env.DB.prepare(`SELECT a.id,a.name,a.pb_kg storedPb,COALESCE(MAX(c.weight_kg),0) catchPb FROM anglers a LEFT JOIN catches c ON c.angler_id=a.id GROUP BY a.id,a.name,a.pb_kg ORDER BY a.name`).all()).results;
  const anglers = anglersRaw.map(a => ({ id:a.id, name:a.name, pbKg:Math.max(Number(a.storedPb||0),Number(a.catchPb||0)) }));
  const lakesRaw = (await env.DB.prepare(`SELECT id,name,country,latitude,longitude,image_url imageUrl,facts_json factsJson,source_url sourceUrl FROM lakes`).all()).results;
  const lakes = Object.fromEntries(lakesRaw.map(l => [l.id,{...l,facts:JSON.parse(l.factsJson||'{}')} ]));
  const trips = (await env.DB.prepare(`SELECT id,year,name,lake,lake_id lakeId,country,status,start_at AS start,end_at AS end,peg,latitude,longitude,lake_image AS lakeImage,facts_json AS factsJson,is_active AS isActive FROM trips ORDER BY is_active DESC,COALESCE(start_at,'9999') DESC`).all()).results;
  const output = [];
  for (const trip of trips) {
    const stats = await env.DB.prepare(`SELECT COUNT(*) fishCount,COALESCE(SUM(weight_kg),0) totalWeightKg,COALESCE(MAX(weight_kg),0) biggestFishKg FROM catches WHERE trip_id=?`).bind(trip.id).first();
    const biggest = await env.DB.prepare(`SELECT a.name anglerName,c.id,c.weight_kg weightKg,c.caught_at caughtAt FROM catches c JOIN anglers a ON a.id=c.angler_id WHERE c.trip_id=? ORDER BY c.weight_kg DESC,c.caught_at ASC LIMIT 1`).bind(trip.id).first();
    const topSpot = await env.DB.prepare(`SELECT COALESCE(s.name,c.spot) spot,COUNT(*) cnt FROM catches c LEFT JOIN spots s ON s.id=c.spot_id WHERE c.trip_id=? AND COALESCE(s.name,c.spot) IS NOT NULL AND TRIM(COALESCE(s.name,c.spot))<>'' GROUP BY COALESCE(s.name,c.spot) ORDER BY cnt DESC,spot ASC LIMIT 1`).bind(trip.id).first();
    output.push({ ...trip, isActive:Boolean(trip.isActive), facts:JSON.parse(trip.factsJson||'{}'), lakeProfile:lakes[trip.lakeId]||null, stats:{ fishCount:Number(stats?.fishCount||0), totalWeightKg:Number(stats?.totalWeightKg||0), biggestFishKg:Number(stats?.biggestFishKg||0), biggestFishAngler:biggest?.anglerName||null, bestSpot:topSpot?.spot||null } });
  }
  const record = await env.DB.prepare(`SELECT c.id,c.trip_id tripId,c.weight_kg weightKg,c.caught_at caughtAt,c.species,a.id anglerId,a.name anglerName,t.lake,t.year FROM catches c JOIN anglers a ON a.id=c.angler_id JOIN trips t ON t.id=c.trip_id ORDER BY c.weight_kg DESC,c.caught_at ASC LIMIT 1`).first();
  return { app:{name:'Dream Team',tagline:'Carp Fishing Trip Manager',activeTripId:output.find(x=>x.isActive)?.id||output[0]?.id||null}, anglers, trips:output, allTime:{anglers,dreamTeamRecord:record||null} };
}

async function updateTrip(request, env, id) {
  const x = await parseBody(request); if (!x) return bad('Invalid JSON');
  const c = await env.DB.prepare('SELECT * FROM trips WHERE id=?').bind(id).first(); if (!c) return notFound();
  const lake = String(x.lake ?? c.lake).trim(); if (!lake) return bad('Lake name is required');
  const year = Number(x.year ?? c.year);
  await env.DB.prepare(`UPDATE trips SET year=?,name=?,lake=?,country=?,status=?,start_at=?,end_at=?,peg=?,latitude=?,longitude=?,lake_image=?,facts_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(year, String(x.name ?? c.name).trim() || `${lake} ${year}`, lake, String(x.country ?? c.country ?? '—').trim() || '—', ['planning','active','archived'].includes(x.status) ? x.status : c.status, x.start ?? c.start_at, x.end ?? c.end_at, String(x.peg ?? c.peg ?? '—').trim() || '—', x.latitude ?? c.latitude, x.longitude ?? c.longitude, x.lakeImage ?? c.lake_image, x.facts ? JSON.stringify(x.facts) : c.facts_json, id).run();
  return json({ ok: true });
}

async function activate(env, id) {
  if (!await env.DB.prepare('SELECT id FROM trips WHERE id=?').bind(id).first()) return notFound();
  await env.DB.batch([
    env.DB.prepare('UPDATE trips SET is_active=0 WHERE is_active=1'),
    env.DB.prepare('UPDATE trips SET is_active=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id)
  ]);
  return json({ ok: true });
}

async function listCatches(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId'); if (!tripId) return bad('tripId is required');
  const q = await env.DB.prepare(`SELECT c.id,c.trip_id tripId,c.angler_id anglerId,a.name anglerName,c.caught_at caughtAt,c.weight_kg weightKg,c.species,c.spot,c.spot_id spotId,c.bait,c.rig,c.depth_m depthM,c.notes,c.photo_url photoUrl,c.created_at createdAt FROM catches c JOIN anglers a ON a.id=c.angler_id WHERE c.trip_id=? ORDER BY c.caught_at DESC,c.id DESC`).bind(tripId).all();
  return json({ ok:true, catches:q.results });
}

async function createCatch(request, env) {
  const x = await parseBody(request), weight = Number(x?.weightKg);
  if (!x?.tripId || !x?.anglerId || !Number.isFinite(weight) || weight <= 0) return bad('tripId, anglerId and positive weightKg are required');
  const spotId = x.spotId == null || x.spotId === '' ? null : Number(x.spotId);
  const q = await env.DB.prepare(`INSERT INTO catches(trip_id,angler_id,caught_at,weight_kg,species,spot,spot_id,bait,rig,depth_m,notes,photo_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(x.tripId,x.anglerId,x.caughtAt||new Date().toISOString(),weight,x.species||'Karp',x.spot||'Brak',Number.isFinite(spotId)?spotId:null,x.bait||null,x.rig||null,x.depthM??null,x.notes||null,x.photoUrl||null).run();
  await env.DB.prepare(`UPDATE anglers SET pb_kg=MAX(pb_kg,?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(weight,x.anglerId).run();
  return json({ ok:true,id:q.meta.last_row_id },201);
}

async function updateCatch(request, env, id) {
  const x = await parseBody(request); if (!x) return bad('Invalid JSON');
  const c = await env.DB.prepare('SELECT * FROM catches WHERE id=?').bind(id).first(); if (!c) return notFound();
  const weight = Number(x.weightKg ?? c.weight_kg); if (!(weight > 0)) return bad('weightKg must be positive');
  const spotIdRaw = x.spotId === undefined ? c.spot_id : x.spotId;
  const spotId = spotIdRaw == null || spotIdRaw === '' ? null : Number(spotIdRaw);
  await env.DB.prepare(`UPDATE catches SET angler_id=?,caught_at=?,weight_kg=?,species=?,spot=?,spot_id=?,bait=?,rig=?,depth_m=?,notes=?,photo_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(x.anglerId??c.angler_id,x.caughtAt??c.caught_at,weight,x.species??c.species,x.spot??c.spot,Number.isFinite(spotId)?spotId:null,x.bait??c.bait,x.rig??c.rig,x.depthM??c.depth_m,x.notes??c.notes,x.photoUrl??c.photo_url,id).run();
  await env.DB.prepare(`UPDATE anglers SET pb_kg=MAX(pb_kg,?),updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(weight,x.anglerId??c.angler_id).run();
  return json({ ok:true });
}

async function listSpots(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId'); if (!tripId) return bad('tripId is required');
  const q = await env.DB.prepare(`SELECT id,trip_id tripId,name,latitude,longitude,depth_m depthM,bottom_type bottomType,distance_m distanceM,notes,catches_count catchesCount,obstacles,best_time bestTime,best_wind bestWind,created_at createdAt FROM spots WHERE trip_id=? ORDER BY created_at,id`).bind(tripId).all();
  return json({ ok: true, spots: q.results });
}

async function createSpot(request, env) {
  const x = await parseBody(request); if (!x?.tripId || !String(x.name || '').trim()) return bad('tripId and name are required');
  const q = await env.DB.prepare(`INSERT INTO spots(trip_id,name,latitude,longitude,depth_m,bottom_type,distance_m,notes,obstacles,best_time,best_wind) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(x.tripId, String(x.name).trim(), x.latitude ?? null, x.longitude ?? null, x.depthM ?? null, x.bottomType || null, x.distanceM ?? null, x.notes || null, x.obstacles || null, x.bestTime || null, x.bestWind || null).run();
  return json({ ok: true, id: q.meta.last_row_id }, 201);
}

async function updateSpot(request, env, id) {
  const x = await parseBody(request); if (!x) return bad('Invalid JSON');
  const c = await env.DB.prepare('SELECT * FROM spots WHERE id=?').bind(id).first(); if (!c) return notFound();
  await env.DB.prepare(`UPDATE spots SET name=?,latitude=?,longitude=?,depth_m=?,bottom_type=?,distance_m=?,notes=?,obstacles=?,best_time=?,best_wind=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(x.name ?? c.name, x.latitude ?? c.latitude, x.longitude ?? c.longitude, x.depthM ?? c.depth_m, x.bottomType ?? c.bottom_type, x.distanceM ?? c.distance_m, x.notes ?? c.notes, x.obstacles ?? c.obstacles, x.bestTime ?? c.best_time, x.bestWind ?? c.best_wind, id).run();
  return json({ ok: true });
}

async function listChecklist(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId'); if (!tripId) return bad('tripId is required');
  const q = await env.DB.prepare(`SELECT id,trip_id tripId,category,label,assigned_to assignedTo,packed,quantity,notes,sort_order sortOrder,created_at createdAt FROM checklist_items WHERE trip_id=? ORDER BY category,sort_order,id`).bind(tripId).all();
  return json({ ok: true, items: q.results.map(x => ({ ...x, packed: Boolean(x.packed) })) });
}

async function createChecklist(request, env) {
  const x = await parseBody(request); if (!x?.tripId || !String(x.label || '').trim()) return bad('tripId and label are required');
  const q = await env.DB.prepare(`INSERT INTO checklist_items(trip_id,category,label,assigned_to,packed,quantity,notes,sort_order) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(x.tripId, x.category || 'Inne', String(x.label).trim(), x.assignedTo || null, x.packed ? 1 : 0, x.quantity || null, x.notes || null, Number(x.sortOrder || 0)).run();
  return json({ ok: true, id: q.meta.last_row_id }, 201);
}

async function patchChecklist(request, env, id) {
  const x = await parseBody(request); if (!x) return bad('Invalid JSON');
  const c = await env.DB.prepare('SELECT * FROM checklist_items WHERE id=?').bind(id).first(); if (!c) return notFound();
  await env.DB.prepare(`UPDATE checklist_items SET category=?,label=?,assigned_to=?,packed=?,quantity=?,notes=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .bind(x.category ?? c.category, x.label ?? c.label, x.assignedTo ?? c.assigned_to, x.packed == null ? c.packed : (x.packed ? 1 : 0), x.quantity ?? c.quantity, x.notes ?? c.notes, x.sortOrder ?? c.sort_order, id).run();
  return json({ ok: true });
}

async function documents(request, env) {
  const tripId = new URL(request.url).searchParams.get('tripId'); if (!tripId) return bad('tripId is required');
  const q = await env.DB.prepare(`SELECT id,kind,title,content,source_url sourceUrl,sort_order sortOrder FROM trip_documents WHERE trip_id=? ORDER BY sort_order,id`).bind(tripId).all();
  return json({ ok: true, documents: q.results });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS' } });
    const url = new URL(request.url);
    try {
      if (['POST','PUT','PATCH','DELETE'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return json({ ok:false, error:'Cross-origin write blocked' }, 403);
      }
      if (url.pathname === '/api/health' && request.method === 'GET') {
        const version = await env.DB.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
        const marker = await env.DB.prepare("SELECT value FROM app_settings WHERE key='supabase_import_v2'").first();
        return json({ ok: true, app: 'dream-team', database: 'connected', schemaVersion: version?.value || null, legacyImport: marker ? JSON.parse(marker.value) : null });
      }
      if (url.pathname === '/api/bootstrap' && request.method === 'GET') return json(await bootstrap(env));

      if (url.pathname === '/api/catches' && request.method === 'GET') return listCatches(request, env);
      if (url.pathname === '/api/catches' && request.method === 'POST') return createCatch(request, env);
      let match = url.pathname.match(/^\/api\/catches\/(\d+)$/);
      if (match && request.method === 'PUT') return updateCatch(request, env, Number(match[1]));
      if (match && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM catches WHERE id=?').bind(Number(match[1])).run(); return json({ ok: true }); }

      if (url.pathname === '/api/spots' && request.method === 'GET') return listSpots(request, env);
      if (url.pathname === '/api/spots' && request.method === 'POST') return createSpot(request, env);
      match = url.pathname.match(/^\/api\/spots\/(\d+)$/);
      if (match && request.method === 'PUT') return updateSpot(request, env, Number(match[1]));
      if (match && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM spots WHERE id=?').bind(Number(match[1])).run(); return json({ ok: true }); }

      if (url.pathname === '/api/checklist' && request.method === 'GET') return listChecklist(request, env);
      if (url.pathname === '/api/checklist' && request.method === 'POST') return createChecklist(request, env);
      match = url.pathname.match(/^\/api\/checklist\/(\d+)$/);
      if (match && request.method === 'PATCH') return patchChecklist(request, env, Number(match[1]));
      if (match && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM checklist_items WHERE id=?').bind(Number(match[1])).run(); return json({ ok: true }); }

      if (url.pathname === '/api/documents' && request.method === 'GET') return documents(request, env);

      match = url.pathname.match(/^\/api\/trips\/([^/]+)$/);
      if (match && request.method === 'PUT') return updateTrip(request, env, decodeURIComponent(match[1]));
      match = url.pathname.match(/^\/api\/trips\/([^/]+)\/activate$/);
      if (match && request.method === 'POST') return activate(env, decodeURIComponent(match[1]));

      if (url.pathname.startsWith('/api/')) return notFound();
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: 'Internal server error', detail: String(error?.message || error) }, 500);
    }
  }
};