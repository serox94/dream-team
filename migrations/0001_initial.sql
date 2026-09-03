PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS anglers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pb_kg REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  lake TEXT NOT NULL,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','active','archived')),
  start_at TEXT,
  end_at TEXT,
  peg TEXT,
  latitude REAL,
  longitude REAL,
  lake_image TEXT,
  facts_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_trip ON trips(is_active) WHERE is_active = 1;

CREATE TABLE IF NOT EXISTS catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  angler_id TEXT NOT NULL,
  caught_at TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK(weight_kg > 0),
  species TEXT NOT NULL DEFAULT 'karp',
  spot TEXT,
  bait TEXT,
  rig TEXT,
  depth_m REAL,
  notes TEXT,
  photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (angler_id) REFERENCES anglers(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_catches_trip ON catches(trip_id);
CREATE INDEX IF NOT EXISTS idx_catches_trip_caught ON catches(trip_id, caught_at DESC);

CREATE TABLE IF NOT EXISTS spots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  name TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  depth_m REAL,
  bottom_type TEXT,
  distance_m REAL,
  notes TEXT,
  catches_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  assigned_to TEXT,
  packed INTEGER NOT NULL DEFAULT 0 CHECK(packed IN (0,1)),
  quantity TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checklist_trip ON checklist_items(trip_id, category, sort_order);

CREATE TABLE IF NOT EXISTS trip_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  section TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO anglers (id, name, pb_kg) VALUES
  ('patryk', 'Patryk', 13.0),
  ('maciek', 'Maciek', 13.0);

INSERT OR IGNORE INTO trips (
  id, year, name, lake, country, status, start_at, end_at, peg, lake_image, facts_json, is_active
) VALUES (
  'next-trip', 2026, 'Następny wyjazd', 'Łowisko do ustawienia', '—', 'planning', NULL, NULL, '—',
  'https://raw.githubusercontent.com/serox94/ryby2026/main/assets/img/lowisko.jpg',
  '{"waterSize":"—","depth":"—","carpRecord":"—","rods":"—","baitBoat":"—","power":"—"}', 1
);

INSERT OR IGNORE INTO trips (
  id, year, name, lake, country, status, start_at, end_at, peg, lake_image, facts_json, is_active
) VALUES (
  'la-plaine-2026', 2026, 'Ryby 2026', 'LodgingCarp – La Plaine des Bois 2', 'Francja', 'archived',
  '2026-06-20T14:00:00+02:00', '2026-06-27T10:00:00+02:00', 'Plaine 2',
  'https://raw.githubusercontent.com/serox94/ryby2026/main/assets/img/lowisko.jpg',
  '{"waterSize":"dane z wyjazdu 2026","depth":"dane z wyjazdu 2026","carpRecord":"dane z wyjazdu 2026","rods":"wg regulaminu wyjazdu","baitBoat":"wg regulaminu wyjazdu","power":"dostępny wg danych wyjazdu"}', 0
);

INSERT OR REPLACE INTO app_settings (key, value) VALUES ('schema_version', '1');
