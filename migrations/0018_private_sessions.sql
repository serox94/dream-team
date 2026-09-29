CREATE TABLE IF NOT EXISTS auth_sessions (
  id_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_login_limits (
  id_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','18',CURRENT_TIMESTAMP);
