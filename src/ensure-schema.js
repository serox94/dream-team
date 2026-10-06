// A new Worker can update its own existing D1 binding when the build token has
// permission to deploy code but cannot run `wrangler d1 migrations --remote`.
// Each operation is additive. The version marker is written in the same batch.
const migrationName='0017_trip_management_and_recovery.sql';
const sessionMigration='0018_private_sessions.sql';
const exists=(rows,column)=>rows.some(row=>row.name===column);

let pending=null;
export async function ensureSchema(env){
  if(pending)return pending;
  pending=applySchema(env);
  try{return await pending;}finally{pending=null;}
}
async function applySchema(env){
  const version=await env.DB.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
  if(Number(version?.value)>=23)return;
  if(Number(version?.value)<16)throw new Error('Wymagane wcześniejsze migracje D1 (do wersji 16).');
  const cols=async name=>(await env.DB.prepare(`PRAGMA table_info(${name})`).all()).results;
  const statements=[];
  const push=(sql,...args)=>statements.push(env.DB.prepare(sql).bind(...args));
  if(Number(version?.value)<17){
    const [anglers,catches,spots,items]=await Promise.all(['anglers','catches','spots','checklist_items'].map(cols));
    if(!exists(anglers,'baseline_pb_kg'))push('ALTER TABLE anglers ADD COLUMN baseline_pb_kg REAL');
    push("UPDATE anglers SET baseline_pb_kg=CASE WHEN id IN ('patryk','maciek') THEN 13 ELSE pb_kg END WHERE baseline_pb_kg IS NULL");
    for(const [table,columns] of [['catches',catches],['spots',spots],['checklist_items',items]])if(!exists(columns,'deleted_at'))push(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
    push('CREATE TABLE IF NOT EXISTS trip_participants (trip_id TEXT NOT NULL REFERENCES trips(id), angler_id TEXT NOT NULL REFERENCES anglers(id), PRIMARY KEY(trip_id,angler_id))');
    push('INSERT OR IGNORE INTO trip_participants(trip_id,angler_id) SELECT t.id,a.id FROM trips t CROSS JOIN anglers a');
    push("UPDATE lakes SET facts_json=json_set(facts_json,'$.contentPack','plaine2','$.timeZone','Europe/Paris'), image_url='/assets/img/lowisko.jpg' WHERE id='plaine2'");
    push("UPDATE lakes SET facts_json=json_set(facts_json,'$.timeZone','Europe/Warsaw') WHERE id IN ('wygonin','miloszewskie')");
    push("INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','17',CURRENT_TIMESTAMP)");
  }
  const migrationTable=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations'").first();
  if(migrationTable&&Number(version?.value)<17)push('INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)',migrationName,migrationName);
  if(Number(version?.value)<18){
    push('CREATE TABLE IF NOT EXISTS auth_sessions (id_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL)');
    push('CREATE TABLE IF NOT EXISTS auth_login_limits (id_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL)');
    if(migrationTable)push('INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)',sessionMigration,sessionMigration);
  }
  if(Number(version?.value)<19){
  push('CREATE TABLE IF NOT EXISTS checklist_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, sort_order INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  push("INSERT OR IGNORE INTO checklist_categories(id,name,sort_order) VALUES ('equipment','sprzęt',1),('shopping','zakupy',2),('food','jedzenie / picie',3)");
  push('INSERT OR IGNORE INTO checklist_categories(id,name,sort_order) SELECT lower(hex(randomblob(16))),category,100 FROM checklist_items WHERE deleted_at IS NULL GROUP BY category');
  push('CREATE TABLE IF NOT EXISTS lake_sources (id TEXT PRIMARY KEY,lake_id TEXT NOT NULL REFERENCES lakes(id),url TEXT NOT NULL,title TEXT NOT NULL,source_type TEXT NOT NULL,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(lake_id,url))');
  push("CREATE TABLE IF NOT EXISTS lake_facts (id TEXT PRIMARY KEY,lake_id TEXT NOT NULL REFERENCES lakes(id),field TEXT NOT NULL,value TEXT NOT NULL,source_id TEXT REFERENCES lake_sources(id),evidence TEXT,confidence REAL NOT NULL DEFAULT 0.5,status TEXT NOT NULL DEFAULT 'potwierdzone',checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(lake_id,field,source_id))");
  push('CREATE TABLE IF NOT EXISTS lake_research_runs (id TEXT PRIMARY KEY,lake_id TEXT NOT NULL REFERENCES lakes(id),status TEXT NOT NULL,provider TEXT NOT NULL,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT,message TEXT,credits_used INTEGER NOT NULL DEFAULT 0)');
  push('CREATE TABLE IF NOT EXISTS lake_fact_changes (id TEXT PRIMARY KEY,lake_id TEXT NOT NULL REFERENCES lakes(id),field TEXT NOT NULL,old_value TEXT NOT NULL,new_value TEXT NOT NULL,source_id TEXT REFERENCES lake_sources(id),changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  push('CREATE INDEX IF NOT EXISTS lake_facts_lake ON lake_facts(lake_id,field)');
  push('CREATE INDEX IF NOT EXISTS lake_runs_lake ON lake_research_runs(lake_id,started_at)');
  if(migrationTable)push("INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)",'0019_lake_research_and_categories.sql','0019_lake_research_and_categories.sql');
  }
  if(Number(version?.value)<20){
    push('CREATE TABLE IF NOT EXISTS lake_candidate_searches (id TEXT PRIMARY KEY,query_key TEXT NOT NULL,status TEXT NOT NULL,credits_used INTEGER NOT NULL DEFAULT 1,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)');
    push('CREATE INDEX IF NOT EXISTS lake_candidate_searches_query ON lake_candidate_searches(query_key,started_at)');
    if(migrationTable)push("INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)",'0020_lake_candidate_searches.sql','0020_lake_candidate_searches.sql');
  }
  if(Number(version?.value)<21){
    push('CREATE TABLE IF NOT EXISTS deeper_media (id TEXT PRIMARY KEY,object_key TEXT NOT NULL UNIQUE,name TEXT NOT NULL,mime_type TEXT NOT NULL,size_bytes INTEGER NOT NULL,trip_id TEXT REFERENCES trips(id),lake_id TEXT REFERENCES lakes(id),spot_id INTEGER REFERENCES spots(id),depth_m REAL,captured_at TEXT,note TEXT,analysis_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    push('CREATE INDEX IF NOT EXISTS deeper_media_trip ON deeper_media(trip_id,created_at)');
    if(migrationTable)push("INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)",'0021_deeper_media.sql','0021_deeper_media.sql');
  }
  if(Number(version?.value)<22){
    push("CREATE TABLE IF NOT EXISTS deeper_ai_attempts (id TEXT PRIMARY KEY,day_utc TEXT NOT NULL,media_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'started',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    push('CREATE INDEX IF NOT EXISTS deeper_ai_attempts_day ON deeper_ai_attempts(day_utc)');
    if(migrationTable)push("INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)",'0022_deeper_ai_limits.sql','0022_deeper_ai_limits.sql');
  }
  if(Number(version?.value)<23){
    const spots=await cols('spots');
    for(const field of ['weed','rig','bait'])if(!exists(spots,field))push(`ALTER TABLE spots ADD COLUMN ${field} TEXT`);
    if(migrationTable)push("INSERT INTO d1_migrations(name) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM d1_migrations WHERE name=?)",'0023_spot_sonar_context.sql','0023_spot_sonar_context.sql');
  }
  push("INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','23',CURRENT_TIMESTAMP)");
  try{await env.DB.batch(statements);}catch(error){
    // Two concurrent first requests can race; the other request may have won.
    const latest=await env.DB.prepare("SELECT value FROM app_settings WHERE key='schema_version'").first();
    if(Number(latest?.value)<23)throw error;
  }
}
