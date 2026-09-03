ALTER TABLE spots ADD COLUMN obstacles TEXT;
ALTER TABLE spots ADD COLUMN best_time TEXT;
ALTER TABLE spots ADD COLUMN best_wind TEXT;

CREATE TABLE IF NOT EXISTS trip_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  source_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_documents_trip ON trip_documents(trip_id, kind, sort_order);

INSERT INTO trip_documents (trip_id, kind, title, content, source_url, sort_order)
SELECT 'next-trip','booking','Rezerwacja 2026',
       'LodgingCarp – La Plaine des Bois 2. Stek 2 – Lodge dla 2 osób. Przyjazd 14.11.2026, wyjazd 21.11.2026. 2 wędkarzy, 0 osób niewędkujących. Przyjazd w sobotę między 12:00 a 14:00.',
       NULL, 10
WHERE NOT EXISTS (SELECT 1 FROM trip_documents WHERE trip_id='next-trip' AND kind='booking' AND title='Rezerwacja 2026');

INSERT INTO trip_documents (trip_id, kind, title, content, source_url, sort_order)
SELECT 'next-trip','rules','Najważniejsze zasady Plaine des Bois 2',
       'Łódka zanętowa jest dozwolona. Własna łódź jest zabroniona; dostępna jest łódź łowiska, a kamizelka ratunkowa jest obowiązkowa. Leadcore i strzałówki są zabronione. Przed wyjazdem zawsze zweryfikuj bieżący regulamin łowiska.',
       'https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/', 20
WHERE NOT EXISTS (SELECT 1 FROM trip_documents WHERE trip_id='next-trip' AND kind='rules' AND title='Najważniejsze zasady Plaine des Bois 2');

INSERT OR REPLACE INTO app_settings (key, value, updated_at)
VALUES ('schema_version', '4', CURRENT_TIMESTAMP);