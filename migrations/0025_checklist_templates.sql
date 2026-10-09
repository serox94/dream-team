CREATE TABLE IF NOT EXISTS checklist_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS checklist_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  label TEXT NOT NULL,
  assigned_to TEXT,
  quantity TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS template_items_parent ON checklist_template_items(template_id,sort_order);
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','25',CURRENT_TIMESTAMP);
