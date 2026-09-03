import fs from 'node:fs';

// Remove every runtime dependency on the retired Supabase backend.
{
  const file = 'public/d1-supabase-compat.js';
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/\n  async function browserLegacyFallback\(table, tripId\) \{[\s\S]*?\n  \}\n\n  class Builder/, '\n\n  class Builder');
  s = s.replace(/          } else if \(this\.table === 'spots'\) \{[\s\S]*?            data = out\.spots\.map\(oldSpot\);\n/, `          } else if (this.table === 'spots') {
            const out = await api(\`/api/spots?tripId=\${encodeURIComponent(trip.id)}\`);
            data = out.spots.map(oldSpot);
`);
  s = s.replace(/          } else if \(this\.table === 'checklist_items'\) \{[\s\S]*?            data = out\.items\.map\(oldCheck\);\n/, `          } else if (this.table === 'checklist_items') {
            const out = await api(\`/api/checklist?tripId=\${encodeURIComponent(trip.id)}\`);
            data = out.items.map(oldCheck);
`);
  fs.writeFileSync(file, s);
}

// Remove Supabase importer from Worker and tighten API mutations to same-origin browser calls.
{
  const file = 'src/worker.js';
  let s = fs.readFileSync(file, 'utf8');
  s = s.replace(/\nconst OLD_URL =[\s\S]*?\nasync function bootstrap\(env\) \{/, '\n\nasync function bootstrap(env) {');
  s = s.replace(/\n      if \(url\.pathname === '\/api\/legacy-import'[\s\S]*?;\n/, '\n');

  // Same-origin protection for state-changing browser requests. GET remains public for the app.
  s = s.replace("    const url = new URL(request.url);\n    try {", `    const url = new URL(request.url);
    try {
      if (['POST','PUT','PATCH','DELETE'].includes(request.method)) {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return json({ ok:false, error:'Cross-origin write blocked' }, 403);
      }`);
  fs.writeFileSync(file, s);
}

// Display the all-time Dream Team record without replacing the per-trip record.
{
  const file = 'public/trip-renderer-v2.js';
  let s = fs.readFileSync(file, 'utf8');
  const needle = `    for (const person of ['Patryk','Maciek']) {`;
  const insert = `    const record = window.DREAM_MODEL?.allTime?.dreamTeamRecord;
    const statsGrid = document.querySelector('main .stats-grid');
    if (record && statsGrid && !document.getElementById('dream-team-alltime-record')) {
      const card = document.createElement('article');
      card.id = 'dream-team-alltime-record';
      card.className = 'stat-card status-success';
      card.innerHTML = '<span class="label">👑 Rekord Dream Team — wszystkie wyjazdy</span><strong>' + Number(record.weightKg||0).toFixed(1) + ' kg · ' + esc(record.anglerName||'—') + '</strong>';
      statsGrid.appendChild(card);
    }
`;
  if (!s.includes('dream-team-alltime-record')) s = s.replace(needle, insert + needle);
  fs.writeFileSync(file, s);
}

// Validation must catch the exact regressions that caused the recent problems.
{
  const file = '.github/workflows/validate.yml';
  let y = fs.readFileSync(file, 'utf8');
  if (!y.includes('Check runtime architecture')) {
    y = y.replace('      - name: Apply all migrations locally', `      - name: Check runtime architecture
        run: |
          ! grep -R -E "dream-loader\\.js|wygonin-launcher|wygonin-encyclopedia|catch-fix" public/index.html public/pages/*.html
          ! grep -E "@import.*ryby2026|supabase\\.co|sb_publishable" public/style.css public/d1-supabase-compat.js src/worker.js
          for f in public/index.html public/pages/*.html; do test "$(grep -o 'dream-loader-v2.js' "$f" | wc -l)" -eq 1; done
      - name: Apply all migrations locally`);
  }
  fs.writeFileSync(file, y);
}
