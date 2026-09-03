PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lakes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  latitude REAL,
  longitude REAL,
  image_url TEXT,
  facts_json TEXT NOT NULL DEFAULT '{}',
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE trips ADD COLUMN lake_id TEXT;
ALTER TABLE catches ADD COLUMN spot_id INTEGER;

INSERT OR REPLACE INTO lakes(id,name,country,latitude,longitude,image_url,facts_json,source_url,updated_at)
SELECT
  'plaine2',
  'LodgingCarp – La Plaine des Bois 2',
  'Francja',
  48.064130,
  2.757058,
  lake_image,
  facts_json,
  'https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/',
  CURRENT_TIMESTAMP
FROM trips WHERE id='next-trip';

INSERT OR REPLACE INTO lakes(id,name,country,latitude,longitude,image_url,facts_json,source_url,updated_at)
SELECT
  'wygonin',
  'Jezioro Wygonin',
  'Polska',
  latitude,
  longitude,
  lake_image,
  facts_json,
  'https://bookingfish.eu/lowiska/jezioro-wygonin',
  CURRENT_TIMESTAMP
FROM trips WHERE id='poland-2027';

UPDATE trips SET lake_id='plaine2' WHERE id IN ('next-trip','la-plaine-2026');
UPDATE trips SET lake_id='wygonin' WHERE id='poland-2027';

CREATE INDEX IF NOT EXISTS idx_trips_lake_id ON trips(lake_id);
CREATE INDEX IF NOT EXISTS idx_catches_spot_id ON catches(spot_id);

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','9',CURRENT_TIMESTAMP);
