-- Wygonin 2027 / stanowisko 16: doprecyzowanie aktualnych zasad BookingFish.
UPDATE trips
SET facts_json=json_set(
      COALESCE(facts_json,'{}'),
      '$.pegCapacity','minimum 2 wędkarzy; każde stanowisko mieści 2 osoby, a dla nr 16 rezerwacja 2 osób jest wymagana poza wyjątkiem last-minute wg regulaminu',
      '$.pegAccess','Dojazd autem tylko na rozładunek i załadunek; następnie samochód odstawić za szlaban. Brak konieczności przeprawy łodzią.',
      '$.pegToilet','Toaleta dla wędkarzy jest wskazana przy stanowisku 16 w aktualnym regulaminie BookingFish.',
      '$.pegPower','Brak 230 V na stanowisku; prąd dostępny tylko na Przystani Wygonin.',
      '$.pegWater','Wodę pitną można pobrać na Przystani przed rozpoczęciem wędkowania.',
      '$.pegFishingBoundary','Umowna granica łowiska to środek / głęboka woda; należy respektować strefy sąsiadów. Maksymalna wywózka 200 m od stanowiska.',
      '$.pegBoatSafety','Ponton/łódź: kamizelka ratunkowa bezwzględnie obowiązkowa; zakaz pływania w woderach lub spodnio-butach.',
      '$.pegCurrentRulesChecked','2026-09-03'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE id='poland-2027';

DELETE FROM trip_documents WHERE trip_id='poland-2027' AND sort_order BETWEEN 86 AND 94;

INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order) VALUES
('poland-2027','logistics','Stanowisko 16 — aktualny dojazd','Aktualny regulamin BookingFish: stanowiska 15 i 16 mają dojazd samochodem tylko w celu rozpakowania i zapakowania sprzętu. Potem samochód musi zostać odstawiony za szlaban. Stanowisko 16 nie wymaga przeprawy łodzią.','https://bookingfish.eu/lowiska/jezioro-wygonin',86),
('poland-2027','facilities','Stanowisko 16 — toaleta, woda, prąd','BookingFish wskazuje toaletę dla wędkarzy przy stanowisku 16. Na stanowisku nie ma prądu; 230 V jest tylko na Przystani. Wodę pitną można pobrać na Przystani przed rozpoczęciem łowienia.','https://bookingfish.eu/lowiska/jezioro-wygonin',87),
('poland-2027','reservation','Stanowisko 16 — dwie osoby','Aktualny regulamin wymaga rezerwacji minimum dwóch osób na stanowisku 16, z wyjątkiem możliwości ustalanych przy rezerwacji krótszej niż 30 dni przed przyjazdem. Dla Dream Team Patryk + Maciek stanowisko jest zgodne z planowanym składem.','https://bookingfish.eu/lowiska/jezioro-wygonin',88),
('poland-2027','rules','Granice wody na stanowisku 16','Umowną granicą łowiska jest środek jeziora / głęboka woda. Trzeba respektować wyznaczone strefy stanowisk i nie wywozić zestawów dalej niż 200 m od stanowiska. Przed rozłożeniem 6 wędek potwierdzić z managerem granice względem sąsiednich stanowisk.','https://bookingfish.eu/lowiska/jezioro-wygonin',89),
('poland-2027','rules','Ponton na stanowisku 16','Korzystanie z łodzi i pontonu odbywa się na własną odpowiedzialność. Kamizelka ratunkowa jest bezwzględnie obowiązkowa. Pływanie w woderach lub spodnio-butach jest zabronione. Ruch środkiem pływającym podczas sesji powinien odbywać się w ramach własnego stanowiska.','https://bookingfish.eu/lowiska/jezioro-wygonin',90),
('poland-2027','strategy','Plan obozu na 16','Ponieważ samochód po rozładunku trzeba odstawić, cały ciężki sprzęt, akumulatory, wodę, jedzenie i rzeczy na pierwszą dobę warto rozładować od razu. Toaleta przy stanowisku redukuje potrzebę chodzenia na Przystań, ale ładowanie urządzeń i prysznic nadal wymagają korzystania z zaplecza Przystani.','https://bookingfish.eu/lowiska/jezioro-wygonin',91);

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','12',CURRENT_TIMESTAMP);
