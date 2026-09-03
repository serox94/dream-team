import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/serox94/ryby2026/main';
const API = 'https://api.github.com/repos/serox94/ryby2026/contents';
const OUT = 'public';

const files = [
  'index.html',
  'style.css','ui-plus.css','weather-plus.css','media-plus.css','app.js','app-plus.js','fixes.js','dashboard-chart.js',
  'pages/polowy.html','pages/pogoda.html','pages/dojazd.html','pages/regulamin.html','pages/wezly.html','pages/rigi.html','pages/checklisty.html','pages/mapa.html','pages/porady.html'
];

async function get(url, binary = false) {
  const r = await fetch(url, { headers: { 'user-agent': 'dream-team-build' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
}

function patchHtml(html) {
  html = html.replace(/<script>[\s\S]*?ryby2026_auth_v1[\s\S]*?<\/script>/i, '');
  html = html.replaceAll('Ryby 2026', 'Dream Team');
  html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>\s*/g, '');
  html = html.replace(/<script src="(?:\.\.\/)?auth\.js"><\/script>\s*/g, '');
  html = html.replace(/<script src="(?:\.\.\/)?app\.js"><\/script>\s*/g, '');
  html = html.replace(/<script src="(?:\.\.\/)?fixes\.js"><\/script>\s*/g, '');
  html = html.replace(/<script src="(?:\.\.\/)?app-plus\.js"><\/script>\s*/g, '');
  html = html.replace(/<script src="(?:\.\.\/)?dashboard-chart\.js"><\/script>\s*/g, '');
  html = html.replace(/<script src="(?:\.\.\/)?dream-loader\.js"><\/script>\s*/g, '');
  html = html.replace('</body>', '<script src="/dream-loader.js"></script></body>');
  html = html.replace(/<span class="section-chip">czerwiec<\/span>/gi, '<span class="section-chip">warunki</span>');
  return html;
}

function patchAppJs(js) {
  js = js.replace('const TRIP_START = new Date("2026-06-20T14:00:00");', 'const TRIP_START = new Date(window.DREAM_TRIP?.start || "2026-11-14T12:00:00+01:00");');
  js = js.replace('const TRIP_END = new Date("2026-06-27T10:00:00");', 'const TRIP_END = new Date(window.DREAM_TRIP?.end || "2026-11-21T10:00:00+01:00");');
  js = js.replace(/const SUPABASE_URL =[\s\S]*?window\.supabaseClient = supabaseClient;\n/, 'const supabaseClient = window.d1SupabaseCompat || window.supabaseClient || null;\nwindow.supabaseClient = supabaseClient;\n');
  js = js.replace(/const FISHING_SPOT = \{[\s\S]*?\};/, `const FISHING_SPOT = {\n  name: window.DREAM_TRIP?.lake || "LodgingCarp - La Plaine des Bois 2",\n  latitude: Number(window.DREAM_TRIP?.latitude ?? 48.064130),\n  longitude: Number(window.DREAM_TRIP?.longitude ?? 2.757058)\n};`);
  js = js.replace('const FALLBACK_CATCHES = [', 'const FALLBACK_CATCHES = false ? [');
  js = js.replace(/\n\];\n\nlet realtimeChannelsStarted/, '\n] : [];\n\nlet realtimeChannelsStarted');
  // Spot is optional in Dream Team. A catch can be saved before a map spot is created.
  js = js.replace('if (!spotText && !spotId) return { ok: false, message: "Podaj spot albo wybierz spot z mapy." };', 'if (!spotText && !spotId) raw.spot = "Brak";');
  js = js.replace('spot: spotText || null,', 'spot: spotText || "Brak",');
  return js;
}

for (const path of files) {
  let text = await get(`${RAW}/${path}`);
  if (path.endsWith('.html')) text = patchHtml(text);
  if (path === 'app.js') text = patchAppJs(text);
  const target = join(OUT, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, text);
}

await mkdir(join(OUT, 'assets/img/rigi'), { recursive: true });
for (const image of ['lowisko.jpg', 'patryk-maciek.jpeg']) {
  await writeFile(join(OUT, 'assets/img', image), await get(`${RAW}/assets/img/${image}`, true));
}

const list = JSON.parse(await get(`${API}/assets/img/rigi?ref=main`));
for (const f of list) {
  if (f.type !== 'file' || !/\.(jpe?g|png|webp)$/i.test(f.name)) continue;
  await writeFile(join(OUT, 'assets/img/rigi', f.name), await get(f.download_url, true));
}

const extraCss = `\n/* Dream Team additions */\n.dream-trip-select{margin-top:10px;max-width:420px;background:#111923;color:#fff;border:1px solid #2c3745;border-radius:9px;padding:9px 11px;font:inherit}.dream-trip-select:focus{outline:2px solid #5fa9ff;outline-offset:2px}\n`;
const style = await get(`${RAW}/style.css`);
await writeFile(join(OUT, 'style.css'), style + extraCss);

// Runtime Dream Team files are intentionally NOT downloaded from Ryby2026.
// They stay in public/ and are the stable integration layer for D1 + multi-trip rendering.
console.log('Dream Team frontend synced from Ryby 2026; local Dream Team runtime files preserved');
