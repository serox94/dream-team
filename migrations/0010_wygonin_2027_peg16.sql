-- Wygonin 2027: stanowisko 16 + research ukierunkowany na logistykę i plan startowy.
UPDATE trips
SET peg='Stanowisko 16',
    facts_json=json_set(
      COALESCE(facts_json,'{}'),
      '$.peg','16',
      '$.pegName','Stanowisko 16',
      '$.pegCapacity','minimum 2 wędkarzy wg aktualnego regulaminu BookingFish',
      '$.pegAccess','Dojazd autem tylko na rozładunek i załadunek; po rozładunku auto odstawić za szlaban.',
      '$.pegCrossing','Przeprawa łodzią nie jest wymagana dla stanowiska 16.',
      '$.pegPower','Brak prądu na stanowisku; zasilanie dostępne na Przystani.',
      '$.pegWaterPlan','Brak wiarygodnej publicznej batymetrii przypisanej dokładnie do stanowiska 16 — głębokości i kierunki zestawów wyznaczyć sondą po przyjeździe, nie zgadywać.',
      '$.pegHistory','Stanowisko 16 ma udokumentowany potencjał: 18,95 kg podczas eliminacji IBCC oraz opisana zasiadka z rybą 19,3 kg po dwóch cichych nocach.',
      '$.pegResearchUpdated','2026-09-03'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE id='poland-2027';

DELETE FROM trip_documents WHERE trip_id='poland-2027' AND sort_order BETWEEN 61 AND 79;

INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order) VALUES
('poland-2027','reservation','Stanowisko 16 — potwierdzony wybór','Dream Team: Patryk + Maciek. Wybrane stanowisko na Wygonin 2027: numer 16. Aktualny regulamin BookingFish zalicza 16 do stanowisk wymagających rezerwacji dla minimum dwóch osób, więc pasuje do naszego składu.','https://bookingfish.eu/lowiska/jezioro-wygonin',61),
('poland-2027','logistics','Stanowisko 16 — dojazd','Na stanowisko 16 można dojechać samochodem wyłącznie w celu rozpakowania i późniejszego zapakowania sprzętu. Po rozładunku samochód trzeba odstawić za szlaban. Stanowisko 16 nie znajduje się na liście stanowisk wymagających przeprawy łodzią.','https://bookingfish.eu/lowiska/jezioro-wygonin',62),
('poland-2027','facilities','Stanowisko 16 — obóz','Na stanowisku nie ma prądu. Prąd i prysznic są na terenie Przystani Wygonin. Przed rozpoczęciem łowienia można pobrać na Przystani wodę pitną. Na tydzień trzeba zaplanować powerbanki / stację zasilania i ładowanie urządzeń bez zakładania dostępu do 230 V na stanowisku.','https://bookingfish.eu/lowiska/jezioro-wygonin',63),
('poland-2027','strategy','Stanowisko 16 — plan sondowania','Nie znalazłem wiarygodnej publicznej mapy batymetrycznej, która przypisywałaby konkretne głębokości i przeszkody bezpośrednio do stanowiska 16. Nie wpisujemy fikcyjnych metrów. Po przyjeździe Deeper CHIRP+2: najpierw szeroki rekonesans, potem zaznaczyć krawędzie spadów, twardsze placki, przejścia twarde–miękkie, roślinność i ewentualne zaczepy. Dopiero z realnego skanu powstają spoty w aplikacji.','https://bookingfish.eu/lowiska/jezioro-wygonin',64),
('poland-2027','strategy','Stanowisko 16 — pierwsze 6 zestawów','Patryk i Maciek: start 3+3 wędki. Nie kładziemy sześciu zestawów w jednej strefie. Po sondowaniu: 2 zestawy na najlepszej strukturze / twardym przejściu, 2 na innej głębokości lub krawędzi spadu, 1 pod obserwowane ryby / wiatr, 1 mobilny do testów. Przy braku aktywności zmieniamy pojedynczy parametr i zapisujemy wynik.','https://www.carpwars.pl/eliminacje-wygonin/',65),
('poland-2027','strategy','Stanowisko 16 — maj','Maj nie oznacza automatycznie łowienia wyłącznie płytko. Wygonin jest głębokim jeziorem rynnowym; praktyczne wskazówki z łowiska mówią, by nie bać się 10–12 m. W ciepłym, stabilnym okresie i przy nagrzewającym wietrze kontrolować płytsze półki; przy ochłodzeniu / froncie również stabilniejszą, głębszą wodę.','https://www.carpwars.pl/eliminacje-wygonin/',66),
('poland-2027','strategy','Stanowisko 16 — nęcenie','Start punktowy i oszczędny. Nie robimy ciężkiego dywanu przed rozpoznaniem aktywności. Dobrze przygotowany orzech tygrysi jest wskazywany jako skuteczna opcja na Wygoninie; suche lub źle ugotowane ziarna są zabronione. Ograniczyć niepotrzebne pływanie i nadmiar markerów.','https://www.carpwars.pl/eliminacje-wygonin/',67),
('poland-2027','strategy','Stanowisko 16 — rigi','Punkt startowy: German/Slip-D + wafter na czystym twardym dnie; Ronnie/Spinner + pop-up przy zielsku lub lekkim detrytusie. Ostateczny wybór dopiero po sprawdzeniu dna. Regulamin: jedna przynęta/hak w zestawie, plecionka nie jako linka główna/strzałówka, bezpieczny system uwalniania ciężarka.','https://bookingfish.eu/lowiska/jezioro-wygonin',68),
('poland-2027','overview','Stanowisko 16 — udokumentowana ryba','W eliminacjach do IBCC 2021 na stanowisku 16 Jacek Bednarek złowił karpia 18,95 kg; w tamtym momencie była to największa ryba półmetka zawodów. To historyczny dowód potencjału stanowiska, nie gwarancja aktualnej trasy ryb.','https://karpiarze.pl/eliminacje-do-ibcc-2021/',69),
('poland-2027','logistics','Przyjazd na 16 — procedura','Po zajęciu stanowiska wyślij managerowi +48 510 410 410 SMS/MMS: zameldowanie, imię i nazwisko, stanowisko 16 oraz zdjęcie stanowiska. Przed wyjazdem analogiczne wymeldowanie i zdjęcie. Osobiste meldowanie na Przystani zostało zniesione.','https://bookingfish.eu/lowiska/jezioro-wygonin',70),
('poland-2027','strategy','Stanowisko 16 — czego jeszcze nie zakładamy','Nie znalazłem aktualnego, wiarygodnego publicznego źródła podającego dla stanowiska 16 dokładną głębokość, azymuty łowienia, granice wody z sąsiadami ani położenie konkretnych zaczepów. Te dane trzeba zebrać na miejscu Deeperem i obserwacją albo uzyskać bezpośrednio od managera. Aplikacja nie będzie prezentować zgadywanych danych jako faktów.','https://bookingfish.eu/lowiska/jezioro-wygonin',71),
('poland-2027','strategy','Stanowisko 16 — cierpliwość potwierdzona relacją','W opublikowanej relacji z zasiadki dokładnie na stanowisku 16 pierwsze dwie noce były bez brania. Wędkarze zamiast chaotycznie przerzucać zestawy sprawdzili dno kamerą i utrzymali spokój na miejscówkach; następnie o 13:40 złowili karpia 19,3 kg. Dla naszego planu: po poprawnym sondowaniu nie resetować wszystkich sześciu zestawów po jednej cichej nocy — najpierw obserwacja, kontrola prezentacji i pojedyncze korekty.','https://meus.net.pl/el-el-senor-lokomotywa-z-wygonin/',72),
('poland-2027','strategy','Stanowisko 16 — ponton jako narzędzie, nie ruch ciągły','Relacja ze stanowiska 16 opisuje wywózkę i hol z pontonu, ale jednocześnie celowe ograniczanie ruchu na wodzie dla zachowania spokoju miejscówek. Ponton przygotować do sondowania, bezpiecznej wywózki i holu, lecz nie pływać bez potrzeby. Kamizelka ratunkowa obowiązkowa.','https://meus.net.pl/el-el-senor-lokomotywa-z-wygonin/',73);

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','10',CURRENT_TIMESTAMP);
