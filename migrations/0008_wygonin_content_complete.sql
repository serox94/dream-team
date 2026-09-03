-- Wygonin 2027: pełny pakiet danych dla dynamicznych modułów Dream Team.
UPDATE trips
SET facts_json=json_set(
  COALESCE(facts_json,'{}'),
  '$.waterType','Jezioro polodowcowe / rynnowe',
  '$.waterSize','68 ha',
  '$.depth','maks. 21–23 m; bardzo zróżnicowane dno',
  '$.carpRecord','29,8 kg wg aktualnej karty BookingFish',
  '$.stands','34 stanowiska',
  '$.fish','karp, amur, szczupak, jaź, węgorz, sum, leszcz, lin, płoć',
  '$.rods','maks. 4 wędki / osoba; pakiety najczęściej 3 wędki / osoba',
  '$.baitBoat','modele RC dozwolone',
  '$.boat','ponton / łódź dozwolone; kamizelka obowiązkowa',
  '$.power','brak prądu na stanowiskach; prąd na Przystani Wygonin',
  '$.sanitary','prysznic na Przystani; toalety na stanowiskach / Toi Toi na parkingu',
  '$.address','Wygonin 12C, 83-430 Wygonin',
  '$.managerPhone','+48 510 410 410',
  '$.crossingPhone','+48 510 440 340',
  '$.access','15–16 dojazd tylko do rozładunku; 19–34 dojazd autem; pozostałe stanowiska mogą wymagać przeprawy',
  '$.crossing','przeprawę ustalić min. 2 dni wcześniej; wg BookingFish 100 zł / stanowisko w obie strony',
  '$.parking','bezpłatny parking przy Przystani; na 19–34 auto może zostać przy stanowisku',
  '$.camper','kamper / przyczepa kempingowa: brak wjazdu na stanowiska',
  '$.checkin','po przyjeździe SMS/MMS do managera z imieniem, numerem stanowiska i zdjęciem; analogicznie przy wyjeździe',
  '$.researchUpdated','2026-09-03'
), updated_at=CURRENT_TIMESTAMP
WHERE id='poland-2027';

DELETE FROM trip_documents WHERE trip_id='poland-2027';

INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order) VALUES
('poland-2027','overview','Charakter Jeziora Wygonin','Polodowcowe jezioro ok. 68 ha w Borach Tucholskich. Bardzo różnorodne: płytsze, zarośnięte zatoki, czyste blaty, spady, głębie ponad 20 m oraz zatopione drzewa. Stanowiska są zarówno leśne, jak i bardziej otwarte. To woda, na której trzeba czytać dno i reagować na warunki, a nie kopiować jedną taktykę przez cały tydzień.','https://www.carpwars.pl/final_wygonin/',10),
('poland-2027','overview','Ryby i potencjał łowiska','Wygonin słynie z dużych karpi i mocnego potencjału zawodniczego. Carp Wars podaje, że w sezonie poprzedzającym eliminacje 2025 odnotowano ponad 138 karpi 20+ na matach uczestników. Aktualna karta BookingFish pokazuje rekord 29,8 kg.','https://www.carpwars.pl/',11),
('poland-2027','strategy','Plan startowy na maj','Pierwsze godziny przeznacz na obserwację, sondowanie i wytypowanie 3 stref: jedna płytsza / nagrzewająca się, jedna pośrednia na spadzie lub blacie i jedna głębsza awaryjna. Nie zakładaj, że maj automatycznie oznacza tylko płytką wodę. Opiekun Wygonina zwraca uwagę, że karpie często przebywają na 10–12 m.','https://www.carpwars.pl/eliminacje-wygonin/',20),
('poland-2027','strategy','Gdzie szukać ryb','Najpierw sprawdzaj krawędzie roślinności, stoki blatów, przejścia twarde–miękkie, zatopione drzewa i miejsca wystawione na dłużej wiejący ciepły wiatr. Przy nagłym ochłodzeniu lub po froncie kontroluj głębsze półki i stabilniejszą wodę. Unikaj bezmyślnego obstawiania samych zaczepów.','https://www.carpwars.pl/final_wygonin/',21),
('poland-2027','strategy','Nęcenie','Zacznij oszczędnie i punktowo. Opiekun łowiska zaleca ograniczyć pływanie i nie obstawiać się markerami. Wygonin ma opinię wody, na której dobrze przygotowany orzech tygrysi potrafi działać bardzo dobrze. Suchy lub źle przygotowany materiał ziarnisty jest zabroniony.','https://www.carpwars.pl/eliminacje-wygonin/',22),
('poland-2027','strategy','Rigi na Wygonin','Na czystych blatach i spadach dobrym punktem startowym są German Rig lub Slip-D z wafterem. Przy zielsku i lekkich zanieczyszczeniach sprawdza się Ronnie / Spinner z pop-upem. W materiale z Wygonina z 2026 Ronnie Rig był używany skutecznie w gęstym zielsku, a część holi wymagała pontonu.','https://www.youtube.com/watch?v=hzvlX4vOh1g',23),
('poland-2027','strategy','Plan trzech kijów','Kij 1: płytka / nagrzewająca się strefa lub krawędź roślinności. Kij 2: twardszy blat albo krawędź spadu. Kij 3: mobilny — przenoszony pod pokazy ryb, zmianę wiatru albo głębszą półkę. Zmieniaj jeden parametr naraz, żeby wiedzieć co faktycznie działa.','https://www.carpwars.pl/final_wygonin/',24),
('poland-2027','rules','Wędki i wywózka','Maksymalnie 4 wędki na osobę, przy czym aktualne pakiety często obejmują 3 wędki na osobę. Liczbę wędek należy ustalić przy rezerwacji. Maksymalna wywózka 200 m. Karp wyłącznie metodą gruntową.','https://bookingfish.eu/lowiska/jezioro-wygonin',30),
('poland-2027','rules','Linki, zestaw i hak','Plecionka jest zabroniona jako linka główna i strzałówka; może być używana jako materiał przyponowy. Leadcore maks. 1,5 m. Jeden hak na zestaw; rozmiar od 6 do 1. Bezpieczny klips / system drop-off jest wymagany.','https://bookingfish.eu/lowiska/jezioro-wygonin',31),
('poland-2027','rules','Ochrona ryb','Wymagane są: duży podbierak min. 42 cale, odpowiednia mata / kołyska, sztywny worek do ważenia i CarpCare. Ryby powyżej 20 kg należy zgłosić opiekunowi; fotografia ma być wykonywana bezpiecznie, bez stania z rybą.','https://bookingfish.eu/lowiska/jezioro-wygonin',32),
('poland-2027','rules','Ziarna, ogień i zachowanie','Zakaz suchego lub źle przygotowanego ziarna, w tym surowego orzecha tygrysiego. Zakaz otwartego ognia w lesie. Obowiązuje cisza i porządek na stanowisku.','https://www.carpwars.pl/final_wygonin/',33),
('poland-2027','rules','Łódź i bezpieczeństwo','Łódź / ponton są dozwolone zgodnie z zasadami łowiska, a kamizelka ratunkowa jest obowiązkowa. Modele RC są dozwolone.','https://bookingfish.eu/lowiska/jezioro-wygonin',34),
('poland-2027','logistics','Adres i główny punkt','Przystań Wygonin, Wygonin 12C, 83-430 Wygonin. Manager: +48 510 410 410. Na Przystani jest bezpłatny parking.','https://przystanwygonin.pl/kontakt/',40),
('poland-2027','logistics','Dojazd do stanowisk','Na stanowiska 15–16 można dojechać autem do rozładunku, potem auto należy odstawić za szlaban. Na stanowiska 19–34 można dojechać autem i samochód może zostać przy stanowisku, jeśli nie blokuje przejazdu. Część pozostałych stanowisk jest przeprawowa.','https://bookingfish.eu/lowiska/jezioro-wygonin',41),
('poland-2027','logistics','Przeprawa','Przeprawę ustala się minimum 2 dni przed przyjazdem. BookingFish podaje koszt 100 zł za stanowisko w obie strony i kontakt do osoby odpowiedzialnej za przeprawy: +48 510 440 340. Możliwa jest też samodzielna przeprawa własnym pontonem i silnikiem.','https://bookingfish.eu/lowiska/jezioro-wygonin',42),
('poland-2027','logistics','Przyjazd i wyjazd','Od 01.04.2024 nie ma obowiązku meldowania się osobiście na Przystani. Po zajęciu stanowiska należy wysłać do managera SMS/MMS z informacją o zameldowaniu, imieniem i nazwiskiem, numerem stanowiska i zdjęciem stanowiska; przy wyjeździe analogiczne wymeldowanie ze zdjęciem.','https://bookingfish.eu/lowiska/jezioro-wygonin',43),
('poland-2027','facilities','Prąd i sanitariaty','Prąd jest dostępny wyłącznie na Przystani Wygonin — na stanowiskach nie ma zasilania. Prysznic znajduje się na Przystani. Łowisko podaje również toalety na stanowiskach / Toi Toi na parkingu.','https://bookingfish.eu/lowiska/jezioro-wygonin',50),
('poland-2027','facilities','Jedzenie i zaplecze','Carp Wars podaje możliwość zamawiania obiadów z dowozem na stanowiska z Karczmy Pod Klonami. Przed samym wyjazdem warto ponownie sprawdzić aktualność tej usługi i godziny działania.','https://www.carpwars.pl/final_wygonin/',51),
('poland-2027','reservation','Plan 2027','Planowany jest tygodniowy wyjazd w maju 2027. Dokładny termin i stanowisko nie są jeszcze wybrane. Po wyborze stanowiska system powinien zawęzić logistykę, głębokości i plan łowienia pod konkretną część jeziora.','https://bookingfish.eu/lowiska/jezioro-wygonin',60);

INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','8',CURRENT_TIMESTAMP);