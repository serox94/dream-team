-- Aktualizacja planu wyjazdów po przełożeniu wyprawy 2026.
-- Zachowujemy pierwotny termin jako historię, ustawiamy nowy termin jako aktywny
-- i dodajemy neutralny plan na 2027 bez zgadywania łowiska wybranego przez Maćka.

UPDATE trips
SET name = 'Francja 2026 – termin przełożony',
    status = 'archived',
    is_active = 0,
    facts_json = json_set(COALESCE(facts_json, '{}'), '$.tripState', 'Termin przełożony'),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'la-plaine-2026';

UPDATE trips
SET year = 2026,
    name = 'Francja 2026',
    lake = 'LodgingCarp – La Plaine des Bois 2',
    country = 'Francja',
    status = 'active',
    start_at = '2026-11-14T12:00:00+01:00',
    end_at = '2026-11-21T10:00:00+01:00',
    peg = 'Stek 2 – Lodge (2 osoby)',
    facts_json = json_set(
      COALESCE(facts_json, '{}'),
      '$.fishermen', 2,
      '$.nonFishermen', 0,
      '$.arrivalNote', 'Przyjazd w sobotę 12:00–14:00; wcześniejszy przyjazd nie jest możliwy',
      '$.tripState', 'Potwierdzony nowy termin'
    ),
    is_active = 1,
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'next-trip';

INSERT OR IGNORE INTO trips (
  id, year, name, lake, country, status, start_at, end_at, peg, lake_image, facts_json, is_active
) VALUES (
  'poland-2027', 2027, 'Polska 2027', 'Łowisko wybiera Maciek', 'Polska', 'planning',
  NULL, NULL, 'Do ustalenia', NULL,
  '{"tripState":"Planowanie","decisionOwner":"Maciek","waterSize":"—","depth":"—","carpRecord":"—","rods":"—","baitBoat":"—","power":"—"}', 0
);
