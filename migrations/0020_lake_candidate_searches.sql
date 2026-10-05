CREATE TABLE IF NOT EXISTS lake_candidate_searches (
  id TEXT PRIMARY KEY,
  query_key TEXT NOT NULL,
  status TEXT NOT NULL,
  credits_used INTEGER NOT NULL DEFAULT 1,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS lake_candidate_searches_query ON lake_candidate_searches(query_key,started_at);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','20',CURRENT_TIMESTAMP);
