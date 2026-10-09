CREATE TABLE IF NOT EXISTS deeper_media (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  trip_id TEXT REFERENCES trips(id),
  lake_id TEXT REFERENCES lakes(id),
  spot_id INTEGER REFERENCES spots(id),
  depth_m REAL,
  captured_at TEXT,
  note TEXT,
  analysis_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deeper_media_trip ON deeper_media(trip_id,created_at);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','21',CURRENT_TIMESTAMP);
