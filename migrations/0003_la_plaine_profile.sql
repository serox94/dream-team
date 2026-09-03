UPDATE trips
SET latitude = 48.064130,
    longitude = 2.757058,
    lake_image = COALESCE(lake_image, 'https://raw.githubusercontent.com/serox94/ryby2026/main/assets/img/lowisko.jpg'),
    facts_json = json_set(
      COALESCE(facts_json, '{}'),
      '$.waterSize', '2 ha',
      '$.depth', 'średnio 2,5 m · max 4 m',
      '$.carpRecord', '28 kg',
      '$.rods', 'wg regulaminu / maks. 2 wędkarzy na stanowisko',
      '$.baitBoat', 'dozwolona',
      '$.power', 'prąd w domku',
      '$.sanitary', '2 prysznice · 2 toalety · umywalka',
      '$.water', 'zimna woda przy domku',
      '$.boat', '1 łódź w cenie · kamizelka obowiązkowa · własna łódź zabroniona',
      '$.address', 'Clos du Lyot, 45210 Fontenay-sur-Loing, Francja',
      '$.arrival', 'sobota 12:00–14:00',
      '$.departure', '9:00–10:00',
      '$.source', 'https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/'
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE id = 'next-trip';

INSERT OR REPLACE INTO app_settings (key, value, updated_at)
VALUES ('schema_version', '3', CURRENT_TIMESTAMP);