-- Wygonin 2027: doprecyzowanie danych i grafiki na podstawie aktualnych źródeł.
UPDATE trips
SET lake_image='https://www.fishsurfing.com/photos/blog/3021_2.jpg?hash=64d1eb78bb6d92614dd528c9af28483a',
    facts_json=json_set(
      COALESCE(facts_json,'{}'),
      '$.waterSize','68 ha',
      '$.depth','maks. 21 m; średnia ok. 15 m na części głównej',
      '$.carpRecord','29,8 kg wg aktualnej karty BookingFish',
      '$.stands','34 stanowiska karpiowe',
      '$.mapImage','https://www.fishsurfing.com/photos/blog/3021_2.jpg?hash=64d1eb78bb6d92614dd528c9af28483a',
      '$.mapImageSource','Fishsurfing – Jezioro Wygonin',
      '$.fish','karp, amur, szczupak, jaź, węgorz, sum, leszcz, lin, płoć',
      '$.rods','maks. 4 wędki na osobę',
      '$.baitBoat','RC model dozwolony',
      '$.power','brak prądu na stanowiskach; zaplecze na Przystani',
      '$.sanitary','prysznic i WC na Przystani; toalety na wybranych stanowiskach + Toi Toi na parkingu',
      '$.researchUpdated','2026-09-03'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE id='poland-2027';

INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order)
SELECT 'poland-2027','strategy','Maj 2027 – jak podejść do Wygonina',
'W maju nie zakładaj jednej głębokości na cały tydzień. Przy szybko ogrzewającej się wodzie kontroluj zatoki, krawędzie roślinności, blaty i miejsca wystawione na ciepły wiatr. Po ochłodzeniu lub silnym froncie sprawdzaj spady i głębsze półki. Wygonin ma duży zakres głębokości i ryby mogą przebywać znacznie głębiej niż na typowej małej komercji. Zacznij od obserwacji i sondowania, a dopiero później zwiększaj nęcenie.',
'https://bookingfish.eu/lowiska/przystan-wygonin',61
WHERE NOT EXISTS (SELECT 1 FROM trip_documents WHERE trip_id='poland-2027' AND title='Maj 2027 – jak podejść do Wygonina');

INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order)
SELECT 'poland-2027','strategy','Rigi i prezentacja na Wygonin',
'Na czystych blatach i spadach zacznij od prostych, niezawodnych prezentacji: German Rig lub Slip D na wafter, ewentualnie Ronnie/Spinner na pop-up. W zatoce i przy zielsku przydatny jest Ronnie/Spinner, który dobrze prezentuje przynętę nad lekkimi zanieczyszczeniami i roślinnością. W 2026 z Wygonina opublikowano materiał z łowienia w gęstym zielsku na stanowisku 27, gdzie skuteczny był Ronnie Rig i hole często wymagały pontonu.',
'https://www.youtube.com/watch?v=hzvlX4vOh1g',62
WHERE NOT EXISTS (SELECT 1 FROM trip_documents WHERE trip_id='poland-2027' AND title='Rigi i prezentacja na Wygonin');

INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','7',CURRENT_TIMESTAMP);