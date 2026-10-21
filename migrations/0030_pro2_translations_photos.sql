-- Additive only. No business records, accounts, passwords or sessions are rewritten.
ALTER TABLE trips ADD COLUMN google_photos_url TEXT;
CREATE TABLE water_measurements (
 id TEXT PRIMARY KEY,trip_id TEXT NOT NULL REFERENCES trips(id),lake_id TEXT NOT NULL REFERENCES lakes(id),
 temperature_c REAL NOT NULL CHECK(temperature_c>=0 AND temperature_c<=40),
 measured_at TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('deeper','thermometer','other')),
 depth_m REAL NOT NULL DEFAULT 0 CHECK(depth_m>=0 AND depth_m<=100),note TEXT,
 created_by TEXT NOT NULL REFERENCES auth_accounts(id),revision INTEGER NOT NULL DEFAULT 1,
 mutation_id TEXT NOT NULL UNIQUE,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX water_trip_time ON water_measurements(trip_id,measured_at DESC);
ALTER TABLE content_translations ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual';
CREATE TABLE content_sources (
 entity TEXT NOT NULL,record_id TEXT NOT NULL,field TEXT NOT NULL,source_hash TEXT NOT NULL,
 source_language TEXT NOT NULL CHECK(source_language IN ('pl','en')),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(entity,record_id,field)
);
CREATE TABLE translation_jobs (
 entity TEXT NOT NULL,record_id TEXT NOT NULL,field TEXT NOT NULL,language TEXT NOT NULL,
 source_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(entity,record_id,field,language)
);
CREATE TABLE translation_cache (
 source_hash TEXT NOT NULL,source_language TEXT NOT NULL,language TEXT NOT NULL,text TEXT NOT NULL,
 provider TEXT NOT NULL,PRIMARY KEY(source_hash,source_language,language)
);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','30',CURRENT_TIMESTAMP);
