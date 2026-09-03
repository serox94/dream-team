-- Wygonin 2027: obecne stanowisko 16 = stare stanowisko 11 na historycznej mapie batymetrycznej przekazanej przez użytkownika.
-- Nie traktujemy historycznych numerów jako aktualnych numerów stanowisk.
UPDATE trips
SET peg='Stanowisko 16',
    facts_json=json_set(
      COALESCE(facts_json,'{}'),
      '$.peg','16',
      '$.pegName','Stanowisko 16',
      '$.historicalPeg','11',
      '$.pegNumberingNote','Obecne stanowisko 16 odpowiada staremu stanowisku 11 na historycznej mapie Wygonina.',
      '$.pegBathymetry','Historyczna mapa pokazuje przed starym 11 / obecnym 16 szybkie zejście z brzegu przez kolejne izobaty w kierunku głównej rynny. Oś rynny przed tym sektorem ma około 20–23 m; najgłębszy oznaczony punkt 24,8 m leży dalej na wschód i nie jest punktem bezpośrednio przed stanowiskiem.',
      '$.pegPrimaryDepthWindow','Priorytet do sprawdzenia Deeperem: około 8–12 m oraz górne i dolne krawędzie spadu; następnie 12–15 m. Głębsze 15–20+ m jako strefa rezerwowa zależnie od temperatury, frontu i lokalizacji ryb.',
      '$.pegOrientation','Stanowisko leży na południowym brzegu głównej części jeziora; podstawowy kierunek poszukiwania to od brzegu na północ / północny-wschód w stronę rynny.',
      '$.pegMapConfidence','Numeracja 16=stare 11 została potwierdzona na przekazanej mapie. Dokładne odległości, twardość dna i zaczepy wymagają pomiaru na miejscu.',
      '$.pegResearchUpdated','2026-09-03'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE id='poland-2027';

DELETE FROM trip_documents WHERE trip_id='poland-2027' AND sort_order BETWEEN 72 AND 89;

INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order) VALUES
('poland-2027','overview','Stanowisko 16 = stare 11','Aktualne stanowisko 16 odpowiada staremu stanowisku 11 na historycznej mapie Wygonina. Od teraz wszystkie analizy starej mapy dla numeru 11 odnosimy do naszego stanowiska 16, ale nie przenosimy automatycznie starej numeracji na inne stanowiska bez potwierdzenia.',NULL,72),
('poland-2027','overview','Co pokazuje batymetria przed 16','Historyczna mapa pokazuje, że sektor przed starym 11 / obecnym 16 schodzi z południowego brzegu w stronę głównej rynny. Kolejne izobaty układają się dość ciasno, więc najważniejszym elementem stanowiska jest spad, a nie jedna płaska półka. W osi jeziora przed tym sektorem występuje woda około 20–23 m. Punkt 24,8 m znajduje się dalej na wschód i nie powinien być traktowany jako domyślny cel dla stanowiska 16.',NULL,73),
('poland-2027','strategy','Gdzie szukać — strefa A: górna krawędź spadu','Pierwszy priorytet po przyjeździe: znaleźć Deeperem górną część spadu przed stanowiskiem, zanim dno zacznie gwałtowniej schodzić. W maju ta strefa może szybciej reagować na słońce i ciepły wiatr. Szukamy nie konkretnej liczby metrów z mapy, lecz twardego albo czystego miejsca na górnej krawędzi.',NULL,74),
('poland-2027','strategy','Gdzie szukać — strefa B: 8–12 m','To podstawowe okno do sprawdzenia. Rady opiekuna Wygonina mówią, że karpie często przebywają na 10–12 m, a historyczna mapa stanowiska 16 pokazuje dostęp do mocnego spadu prowadzącego do rynny. Tu szukamy załamania stoku, półeczki, zmiany twardości albo czystego pasa na zboczu.','https://www.carpwars.pl/eliminacje-wygonin/',75),
('poland-2027','strategy','Gdzie szukać — strefa C: 12–15 m','Drugi stabilny poziom do testu, szczególnie gdy ryby nie pokazują się na górze spadu albo po chłodnej nocy. Nie kładziemy wszystkich zestawów na identycznej głębokości: jeden lub dwa zestawy powinny testować niższą część stoku / przejście w stronę rynny.',NULL,76),
('poland-2027','strategy','Gdzie szukać — strefa D: 15–20+ m','Głębsza woda jest planem rezerwowym przy ochłodzeniu, mocnym froncie lub wyraźnych wskazaniach ryb na sonarze. Wygonin ma ponad 20 m głębokości i ryby korzystają z głębi, ale nie ma sensu od pierwszej godziny wozić całego zestawu sześciu wędek do centralnej rynny.','https://www.carpwars.pl/eliminacje-wygonin/',77),
('poland-2027','strategy','Plan 6 wędek — start na stanowisku 16','Start 3+3. Zestaw 1: górna krawędź spadu. Zestaw 2: okolice 8–12 m. Zestaw 3: 12–15 m. Zestaw 4: drugi wariant na najlepszej znalezionej strukturze, ale z inną przynętą lub prezentacją. Zestaw 5: mobilny pod pokazy ryb / zmianę wiatru. Zestaw 6: głębsza kontrola 15–20+ m tylko po potwierdzeniu sonarowym albo przy warunkach przemawiających za głębią. Dzięki temu od pierwszej doby zbieramy informacje zamiast obstawiać jedną teorię.',NULL,78),
('poland-2027','strategy','Sondowanie Deeperem — kolejność','Najpierw 4–6 szerokich przejazdów wachlarzem od brzegu w stronę rynny. Potem powtórne przejazdy przez miejsca, gdzie zmienia się nachylenie, twardość lub roślinność. Zapisujemy co najmniej cztery spoty: górna krawędź, środkowy spad 8–12 m, niższy spad 12–15 m i głęboka kontrola. Dopiero po drugim przejeździe ustawiamy dokładne punkty wywózki.',NULL,79),
('poland-2027','strategy','Kierunek pracy stanowiska 16','Z historycznej mapy wynika, że naturalnym kierunkiem poszukiwania jest północ / północny-wschód od południowego brzegu, w kierunku osi głównej rynny. Nie oznacza to prawa do łowienia dowolnie w bok; granice wody z sąsiadami trzeba potwierdzić na miejscu z managerem przed rozstawieniem sześciu zestawów.',NULL,80),
('poland-2027','strategy','Maj — decyzja płytko czy głęboko','Ciepły wiatr i kilka stabilnych dni: zaczynamy wyżej na stoku i kontrolujemy 8–12 m. Zimna noc, spadek temperatury lub front: większy udział 12–15 m i pojedyncza kontrola głębiej. Pokazy ryb mają pierwszeństwo przed teorią. Jeśli sonar pokazuje ryby zawieszone nad stokiem, zestaw kładziemy na trasie ich przemieszczania, niekoniecznie w najgłębszym punkcie.',NULL,81),
('poland-2027','strategy','Nęcenie na stromym sektorze','Na spadzie trzeba unikać sytuacji, w której kulki i ziarno staczają się daleko od zestawu. Na stromych fragmentach nęcimy małymi porcjami i precyzyjnie; większe karmienie dopiero na znalezionym wypłaszczeniu lub półce. Orzech tygrysi tylko prawidłowo przygotowany. Ograniczamy niepotrzebne pływanie i liczbę markerów.','https://www.carpwars.pl/eliminacje-wygonin/',82),
('poland-2027','strategy','Rigi pod sektor 16','Twardy czysty fragment: German Rig / Slip-D z wafterem. Miększe dno lub lekki osad: krótki Ronnie/Spinner z pop-upem albo wyważona prezentacja, która nie zapadnie się w muł. Na stromym stoku ważniejsze od nazwy rigu jest stabilne ułożenie ciężarka i przyponu po opuszczeniu zestawu. Każdy punkt po wywózce kontrolujemy pod kątem zsuwania zestawu.',NULL,83),
('poland-2027','strategy','Hol z głębi i ze spadu','Przy braniu z dolnej części spadu ryba może próbować iść równolegle do krawędzi albo w głębię. Ponton i kamizelka muszą być gotowe przed położeniem głębszych zestawów. Nie zostawiamy wędek bez nadzoru; przy konieczności holu z pontonu druga osoba kontroluje pozostałe linki i kierunek łodzi.','https://bookingfish.eu/lowiska/jezioro-wygonin',84),
('poland-2027','strategy','Dane, które dopiszemy po pierwszej godzinie','Po przyjeździe zapisujemy w mapie spotów: GPS / kierunek, odległość, głębokość, rodzaj dna, nachylenie, zielsko, zaczepy oraz rezultat każdej wędki. Historyczna mapa daje plan startowy, ale dokładną mapę stanowiska 16 budujemy własnym Deeperem CHIRP+2.',NULL,85);

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','11',CURRENT_TIMESTAMP);
