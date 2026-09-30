# Encyklopedia i Deeper — przegląd źródeł

Stan: 30 września 2026. Katalog 44 materiałów z linkami, językiem, typem i datą publikacji, gdy była dostępna: `public/data/knowledge/sources.json`. Opracowania są własne; nie kopiują artykułów ani ilustracji. Źródła obejmują PL, EN, FR, DE i NL oraz materiały naukowe, techniczne, praktykę wędkarską, producentów i społeczności. Materiały producentów są oznaczone osobno.

## Zbieżne obserwacje

- Temperatura wody wpływa na metabolizm i trawienie, a niedostatek tlenu zmienia aktywność i dobrostan karpia. Zakresy temperatur w aplikacji są punktami startowymi, nie sztywnymi progami. `s01–s09`.
- Sonar pokazuje czas i siłę echa, nie zdjęcie dna. Szerokość wiązki, prędkość sondy, czułość i paleta wpływają na obraz. Mocniejszy powrót i drugie echo sugerują twardsze dno; materiał potwierdza się ciężarkiem/markerem. `s19–s26`, `s34–s35`.
- Łuki zależą od geometrii i ruchu; ikony ryb są klasyfikacją, nie identyfikacją karpia. Nawet funkcja AI Fish Detection CHIRP+ 4 ma ograniczenia przy falach i niestabilnym montażu. `s19`, `s24`, `s26`, `s30`, `s34`.
- Przy wyborze punktu lepsze jest powtórzenie skanu i porównanie struktury, zielska, twardości, obserwacji ryb oraz bezpieczeństwa holu niż wybór jednego szczytu. `s14–s19`, `s28`.

## Podejścia sporne lub słabo potwierdzone

- Nie ma wiarygodnej uniwersalnej mapy „smak → miesiąc”. Skład, uwalnianie sygnału, miejsce i ilość zanęty są ważniejsze od samej nazwy aromatu. Materiały firm przynętowych (`s10–s12`) pokazują także rozbieżność: „fishmeal” nie jest automatycznie ciężką, oleistą przynętą na zimę.
- Siła i kierunek wiatru mogą mieć sens lokalizacyjny, lecz chłodny wiatr, tlen i geometria wody zmieniają wynik. Sama zmiana ciśnienia nie dowodzi przyczyny brania.
- Brakuje mocnego, bezpośredniego potwierdzenia, że konkretna faza księżyca niezawodnie steruje braniami karpia słodkowodnego. Artykuł nie podaje „najlepszych dni”.
- Praktyka na mule jest różna: część wędkarzy łowi na żyznym osadzie, inni wybierają jego twardą krawędź. Niderlandzkie dyskusje (`s17`, `s40`) są oznaczone jako społeczność, a nie dowód naukowy.

## Granice i utrzymanie

- Deeper udostępnia różne ustawienia w START, PRO/PRO+ 2, CHIRP+ 2/3/4 i łódkach QUEST/Spark. Przed aktualizacją opisu modelu należy porównać aktualną instrukcję producenta (`s24`, `s27`, `s30–s33`).
- Schematy SVG są poglądowe. Nie użyto cudzych screenshotów ani zdjęć bez licencji. Lokalny tryb analizy screenshotu wyprowadza wskazówki wyłącznie z odpowiedzi użytkownika.
- JSON w `public/data/knowledge/` jest wersjonowany w Git. Artykuły mają stabilne `id`, kategorię, tagi, sekcje, `sourceIds` i powiązania. Test redakcyjny wykrywa brakujące źródła i odsyłacze. Dodanie wpisu nie wymaga migracji D1.
- Nowe moduły korzystają z istniejącej sesji Workera. Service Worker przechowuje tylko statyczne pliki i stosuje strategię najpierw sieć; po ręcznym wylogowaniu usuwa swoje kopie. Dostęp offline wymaga wcześniejszego załadowania na zaufanym urządzeniu.

## Kontrola uzupełniająca 30.09.2026

Dodano cztery źródła praktyczne: dwie publikacje francuskie (sondowanie z brzegu i porównanie żyznego osadu z twardym, ubogim dnem) oraz dwa polskie (ogólny poradnik z podpisanym autorem i apel PZW o dobrostan ryb w upał). Nowe wpisy s41–s44 powiązano z odpowiednimi artykułami. Bilans języków: EN 28, DE 4, NL 5, PL 4, FR 3. Nadal jest to nierównomierna próba źródeł; jej liczność nie dowodzi pełnego pokrycia każdego wariantu przynęty i typu dna.
