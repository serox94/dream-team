ALTER TABLE spots ADD COLUMN weed TEXT;
ALTER TABLE spots ADD COLUMN rig TEXT;
ALTER TABLE spots ADD COLUMN bait TEXT;
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','23',CURRENT_TIMESTAMP);
