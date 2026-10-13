CREATE TABLE IF NOT EXISTS deeper_ai_attempts (
  id TEXT PRIMARY KEY,
  day_utc TEXT NOT NULL,
  media_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS deeper_ai_attempts_day ON deeper_ai_attempts(day_utc);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','22',CURRENT_TIMESTAMP);
