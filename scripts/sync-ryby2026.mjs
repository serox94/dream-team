import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const RAW = 'https://raw.githubusercontent.com/serox94/ryby2026/main';
const API = 'https://api.github.com/repos/serox94/ryby2026/contents';
const OUT = 'public/legacy';

const files = [
  'style.css','ui-plus.css','weather-plus.css','media-plus.css','app.js','app-plus.js','fixes.js','dashboard-chart.js',
  'pages/pogoda.html','pages/wezly.html','pages/rigi.html','pages/porady.html','pages/regulamin.html','pages/dojazd.html'
];

async function get(url, binary = false) {
  const r = await fetch(url, { headers: { 'user-agent': 'dream-team-build' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : await r.text();
}

function patchHtml(html) {
  html = html.replace(/<script>[\s\S]*?ryby2026_auth_v1[\s\S]*?<\/script>/i, '');
  html = html.replaceAll('Ryby 2026', 'Dream Team');
  html = html.replaceAll('20.06.2026, 14:00', '<span data-trip-start>—</span>');
  html = html.replaceAll('27.06.2026, 10:00', '<span data-trip-end>—</span>');
  html = html.replace(/<p class="subtitle">[\s\S]*?<\/p>/i, '<p class="subtitle" data-trip-subtitle>Ładowanie aktywnego wyjazdu…</p>');
  html = html.replaceAll('../assets/img/', './assets/img/');
  html = html.replaceAll('../style.css', './style.css');
  html = html.replaceAll('../ui-plus.css', './ui-plus.css');
  html = html.replaceAll('../weather-plus.css', './weather-plus.css');
  html = html.replaceAll('../media-plus.css', './media-plus.css');
  html = html.replaceAll('../app.js', './app.js');
  html = html.replaceAll('../app-plus.js', './app-plus.js');
  html = html.replaceAll('../fixes.js', './fixes.js');
  html = html.replaceAll('../dashboard-chart.js', './dashboard-chart.js');
  html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/g, '');
  html = html.replace(/<script src="\.\.\/auth\.js"><\/script>/g, '');
  html = html.replace('</body>', '<script src="./dream-bridge.js"></script></body>');
  html = html.replace(/href="\.\.\/index\.html"/g, 'href="/"');
  html = html.replace(/href="polowy\.html"/g, 'href="/#catches"');
  html = html.replace(/href="checklisty\.html"/g, 'href="/#checklists"');
  html = html.replace(/href="mapa\.html"/g, 'href="/#map"');
  html = html.replace(/href="pogoda\.html"/g, 'href="./pogoda.html"');
  html = html.replace(/href="wezly\.html"/g, 'href="./wezly.html"');
  html = html.replace(/href="rigi\.html"/g, 'href="./rigi.html"');
  html = html.replace(/href="porady\.html"/g, 'href="./porady.html"');
  html = html.replace(/href="regulamin\.html"/g, 'href="./regulamin.html"');
  html = html.replace(/href="dojazd\.html"/g, 'href="./dojazd.html"');
  return html;
}

for (const path of files) {
  const text = await get(`${RAW}/${path}`);
  const target = join(OUT, path.startsWith('pages/') ? path.slice(6) : path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, path.endsWith('.html') ? patchHtml(text) : text);
}

await mkdir(join(OUT, 'assets/img/rigi'), { recursive: true });
const rootImage = await get(`${RAW}/assets/img/lowisko.jpg`, true);
await writeFile(join(OUT, 'assets/img/lowisko.jpg'), rootImage);

const list = JSON.parse(await get(`${API}/assets/img/rigi?ref=main`));
for (const f of list) {
  if (f.type !== 'file' || !/\.(jpe?g|png|webp)$/i.test(f.name)) continue;
  await writeFile(join(OUT, 'assets/img/rigi', f.name), await get(f.download_url, true));
}

const bridge = `
(async()=>{try{const r=await fetch('/api/bootstrap',{cache:'no-store'});const m=await r.json();const t=m.trips.find(x=>x.id===m.app.activeTripId)||m.trips[0];if(!t)return;document.querySelectorAll('[data-trip-subtitle]').forEach(x=>x.textContent=t.lake);const f=v=>v?new Intl.DateTimeFormat('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(v)):'—';document.querySelectorAll('[data-trip-start]').forEach(x=>x.textContent=f(t.start));document.querySelectorAll('[data-trip-end]').forEach(x=>x.textContent=f(t.end));document.title=document.title.replace('Ryby 2026','Dream Team');}catch(e){console.error('Dream Team bridge',e)}})();
`;
await writeFile(join(OUT, 'dream-bridge.js'), bridge);
console.log('Ryby 2026 modules synced to public/legacy');
