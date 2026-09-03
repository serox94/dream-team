-- Miłoszewskie: używamy oficjalnej mapy batymetrycznej zamiast zdjęcia bazowego Plaine 2.
UPDATE lakes
SET image_url='https://miloszewskie.pl/wp-content/uploads/2021/06/batymetria-300x300.jpg',
    facts_json=json_set(
      COALESCE(facts_json,'{}'),
      '$.mapImage','https://miloszewskie.pl/wp-content/uploads/2021/06/batymetria-300x300.jpg',
      '$.bathymetryImage','https://miloszewskie.pl/wp-content/uploads/2021/06/batymetria-300x300.jpg',
      '$.bottomHardnessImage','https://miloszewskie.pl/wp-content/uploads/2021/06/twardo%C5%9B%C4%87-295x300.jpg'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE id='miloszewskie';

UPDATE trips
SET lake_image='https://miloszewskie.pl/wp-content/uploads/2021/06/batymetria-300x300.jpg',
    updated_at=CURRENT_TIMESTAMP
WHERE id='miloszewskie-2027';

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','15',CURRENT_TIMESTAMP);
