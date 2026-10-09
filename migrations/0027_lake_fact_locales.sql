ALTER TABLE lake_facts ADD COLUMN original_text TEXT;
ALTER TABLE lake_facts ADD COLUMN source_language TEXT;
ALTER TABLE lake_facts ADD COLUMN normalized_value TEXT;
ALTER TABLE lake_facts ADD COLUMN translation_pl TEXT;
ALTER TABLE lake_facts ADD COLUMN translation_en TEXT;
UPDATE lake_facts SET original_text=COALESCE(evidence,value),normalized_value=value WHERE original_text IS NULL;
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','27',CURRENT_TIMESTAMP);
