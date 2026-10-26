-- Additive, schema31 -> 32. Authentication and business rows are never deleted.
ALTER TABLE research_jobs ADD COLUMN confirmed_sources_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE research_jobs ADD COLUMN discovery_done INTEGER NOT NULL DEFAULT 0;
CREATE INDEX research_pending_dispatch ON research_jobs(started_at) WHERE status='pending';
CREATE INDEX research_lake_recent ON research_jobs(lake_id,started_at DESC);
CREATE TABLE lake_profile_versions(
 id TEXT PRIMARY KEY,lake_id TEXT NOT NULL REFERENCES lakes(id),digest TEXT NOT NULL,
 profile_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(lake_id,digest)
);
ALTER TABLE trips ADD COLUMN lake_snapshot_json TEXT;
ALTER TABLE trips ADD COLUMN lake_profile_version_id TEXT REFERENCES lake_profile_versions(id);
-- Preserve exactly the lake metadata visible before this release, including archive.
-- This snapshot does not claim current research was verified at a historical trip date.
UPDATE trips SET lake_snapshot_json=(SELECT json_object('id',l.id,'name',l.name,'country',l.country,'latitude',l.latitude,'longitude',l.longitude,'imageUrl',l.image_url,'sourceUrl',l.source_url,'facts',json(l.facts_json)) FROM lakes l WHERE l.id=trips.lake_id) WHERE lake_snapshot_json IS NULL;
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','32',CURRENT_TIMESTAMP);
