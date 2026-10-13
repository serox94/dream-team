ALTER TABLE anglers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE anglers ADD COLUMN default_language TEXT NOT NULL DEFAULT 'pl';
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','26',CURRENT_TIMESTAMP);
