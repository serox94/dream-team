// A new Worker can update its own existing D1 binding when the build token has
// permission to deploy code but cannot run `wrangler d1 migrations --remote`.
// Each operation is additive. The version marker is written in the same batch.
const migrationName='0017_trip_management_and_recovery.sql';
const exists=(rows,column)=>rows.some(row=>row.name===column);

let pending=null;
export async function ensureSchema(env){
  if(pending)return pending;
  pending=applySchema(env);
  try{return await pending;}finally{pending=null;}
}
async function applySchema(env){
  const version=await env.DB.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
  if(Number(version?.value)>=17)return;
  if(Number(version?.value)<16)throw new Error('Wymagane wcześniejsze migracje D1 (do wersji 16).');
  const cols=async name=>(await env.DB.prepare(`PRAGMA table_info(${name})`).all()).results;
  const [anglers,catches,spots,items]=await Promise.all(['anglers','catches','spots','checklist_items'].map(cols));
  const statements=[];
  const push=(sql,...args)=>statements.push(env.DB.prepare(sql).bind(...args));
  if(!exists(anglers,'baseline_pb_kg'))push('ALTER TABLE anglers ADD COLUMN baseline_pb_kg REAL');
  push("UPDATE anglers SET baseline_pb_kg=CASE WHEN id IN ('patryk','maciek') THEN 13 ELSE pb_kg END WHERE baseline_pb_kg IS NULL");
  for(const [table,columns] of [['catches',catches],['spots',spots],['checklist_items',items]])if(!exists(columns,'deleted_at'))push(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
  push('CREATE TABLE IF NOT EXISTS trip_participants (trip_id TEXT NOT NULL REFERENCES trips(id), angler_id TEXT NOT NULL REFERENCES anglers(id), PRIMARY KEY(trip_id,angler_id))');
  push('INSERT OR IGNORE INTO trip_participants(trip_id,angler_id) SELECT t.id,a.id FROM trips t CROSS JOIN anglers a');
  push("UPDATE lakes SET facts_json=json_set(facts_json,'$.contentPack','plaine2','$.timeZone','Europe/Paris'), image_url='/assets/img/lowisko.jpg' WHERE id='plaine2'");
  push("UPDATE lakes SET facts_json=json_set(facts_json,'$.timeZone','Europe/Warsaw') WHERE id IN ('wygonin','miloszewskie')");
  const migrationTable=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'").first();
  if(migrationTable)push('INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)',migrationName,migrationName);
  push("INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','17',CURRENT_TIMESTAMP)");
  try{await env.DB.batch(statements);}catch(error){
    // Two concurrent first requests can race; the other request may have won.
    const latest=await env.DB.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
    if(Number(latest?.value)<17)throw error;
  }
}
