# DreamTeam — naprawy audytu Astry i stan wydania

Aktualizacja: 2026-10-20. **DEPLOYMENT: BLOCKED — automatyczna kontrola zatwierdzeń odrzuciła ręczne uruchomienie wydania i wymaga świeżego potwierdzenia użytkownika.** Nie obchodzono tej blokady. Nie uruchomiono maintenance, migracji ani inicjalizacji kont na produkcji.

## Wersje i dowody

- Przetestowany kandydat: `338003870e52b53ee26d17a55375d6c1c4dacbf4`, gałąź `fix/astra-audit-20261019`.
- Zbiorczy PR #13: MERGED; commit scalenia `e5b3d6bf866907c914a6abd1ed6b3a1e54e81525`. Drzewa kandydata i scalenia są identyczne, co potwierdza porównanie GitHub bez zmienionych plików.
- PR #12: MERGED przez włączenie jego historii do PR #13; wykorzystano istniejące poprawki odporności pogody, bez podwójnej implementacji.
- Validate `39369006593`: **PASS, 156/156 testów**, lokalne migracje i buildy Workera/backup Workera PASS.
- Responsive UI QA `39369006650`: **PASS**, wszystkie kroki, PL/EN, 15 ekranów, szerokości 360/390/412/768/1280, rzeczywisty Chromium i interakcje.
- Prywatny preflight `39368680476`: **PASS** — świeża kopia produkcji, D1/R2 restore, migracja 28→29 i ponowny restore 29.
- Ostatnia potwierdzona produkcja: commit `600d1f55ad0481a77cfc725a7a1810ea15347ee0`, Worker `d43aa522-4781-4259-a298-72b6e9793288`, D1 28, maintenance OFF. Ten batch wykonał **0 zapisów D1, 0 zapisów mediów i 0 deploymentów produkcyjnych**. Późniejszy lokalny odczyt HTTP został odrzucony statusem 403; nie potraktowano go jako dowodu awarii aplikacji ani nowego odczytu jej wersji.

## Wszystkie 15 ustaleń

Statusy poniżej dotyczą naprawionego i przetestowanego kandydata. Nie oznaczają wdrożenia na produkcję.

| Ustalenie | Status | Poprawka i dowód odbioru |
|---|---|---|
| H01 — ostatnie konto | FIXED | Migracja 0029: atomowe triggery blokujące wyłączenie/usunięcie ostatniego konta i modyfikację chronionej tożsamości; odwołanie sesji w tej samej transakcji dopiero przy udanej zmianie. Testy równoległości, CAS, resetu i ochrony konta PASS; własne wyłączenie wymaga potwierdzenia. |
| H02 — braki danych pogodowych | FIXED | Walidacja kodów WMO, obserwacji bieżącej, wiatru/porywów/opadów i ciągłego pokrycia 24 godzin. Braki dają UNKNOWN, bez uspokajającego okna. Testy jednostkowe i rzeczywisty Chromium PL/EN: brak kodów, tylko dwie godziny oraz burze PASS. |
| H03 — burza na dashboardzie | FIXED | Dashboard i Pogoda PRO używają tej samej agregacji zagrożeń; widoczne burze teraz i później, z pierwszeństwem przed zwykłą pogodą/pakowaniem. Renderowane przypadki PL/EN 390/1280 PASS. |
| M01 — awaria Pogody PRO | FIXED | Poprawki PR #12: cache zależny od GPS/parametrów, 5 minut świeżości, maksymalnie 30 minut jawnie oznaczonego fallbacku, zakończenie loadingu przy pierwszym błędzie, retry/recovery. Testy błędów i browser refresh outage PASS. |
| M02 — kolejność zagrożeń | FIXED | Burza jest pierwsza; wcześniejszy wiatr nie usuwa późniejszych alarmów ani ich godzin. Jednostkowe i renderowane PL/EN wind-before-storm PASS. |
| M03 — pierwsza pogoda offline | VERIFIED | Zależność weather-fishing-insights jest w wersjonowanym warm manifeście. Przyczyną runu 39260423981 był dodatkowo testowy Promise potraktowany przez Playwright jako prawda przed wynikiem CacheStorage. Nowy gate rzeczywiście czeka na znacznik, kontroler i wszystkie pliki. Regresja niekompletnego cache PASS; Chromium potwierdził **91/91** zasobów i pierwsze wejście offline z data-ready=true w PL/EN. |
| M04 — wyścig PL/EN | VERIFIED | Wstawienie selektora do rzeczywistego rodzica, jeden selektor w Ustawieniach. Cztery przypadki język/kolejność słownika PASS; przełączanie i trwałość preferencji w Chromium PASS. |
| M05 — brakujące tłumaczenia UI | FIXED | Uzupełnione pogoda, konta i błędy API. Scanner kończy QA błędem dla pozostałości PL, z wyraźnymi wyjątkami dla treści użytkownika/źródeł. Wszystkie pięć szerokości × 15 ekranów PL/EN PASS; formularz pierwszego hasła i edytor treści działają w Chromium. |
| M06 — usuwanie zajętej kategorii w EN | VERIFIED | Stabilny kod CATEGORY_NOT_EMPTY zamiast dopasowania polskiego tekstu. Testy PL/EN interakcji przenoszą wpisy z zachowaniem ID i packed. Nie usuwano rzeczywistych kategorii. |
| M07 — strefy czasowe | VERIFIED | Backend sprawdza rzeczywiste IANA; błędna strefa zwraca 400 bez zmiany preferencji. Frontend toleruje stare nieprawidłowe wartości. Celowane testy PASS. |
| M08 — paginacja R2 | VERIFIED | Odczyt wszystkich stron Worker/REST, wykrywanie powtórzonego/błędnego kursora i wybór najnowszej daty globalnie. Testy ponad 1000 obiektów oraz krótkich stron PASS. Świeży rzeczywisty inwentarz/restore istniejącego pustego R2 PASS. |
| M09 — dostępność konfliktów offline | VERIFIED | Natywny przycisk/dialog, jawne serwer/moje/anuluj, fokus i komunikat błędu. Testy DOM i rzeczywista obsługa samą klawiaturą w PL/EN PASS. |
| M10 — ramki prywatnych ekranów | FIXED | Prywatny HTML ma CSP frame-ancestors 'none' i X-Frame-Options DENY. Testy odpowiedzi kandydata PASS. Nagłówki nowej produkcji pozostają NOT TESTED do wydania. |
| L01 — długość Pogody PRO | VERIFIED | Alarmy/decyzje/źródło na początku; 24 zwarte, rozwijane godziny; pozostałe pomiary zachowane w details. Chromium 390/1280 potwierdził 24 zamknięte karty i rozwinięcie jednej. |
| L02 — start i złożoność | VERIFIED | Równoległe niezależne słowniki EN, moduły pogodowe tylko na dashboardzie/pogodzie. Kontrolowany pomiar rzeczywistego i18n przy 80 ms na odczyt: 264 ms sekwencyjnie, 90 ms równolegle; wszystkie trzy nowe odczyty startują w 1 ms. To pomiar fixture, nie obietnica przyspieszenia całej produkcji ani naprawy nieudowodnionego wycieku pamięci. |

Dalsze przyczyny błędów testu przeglądarkowego naprawiono bez wyłączania asercji: rzeczywiste rozwinięcie sekcji Dodaj uczestnika i kategorii checklisty oraz odczyt sesji przez fetch przeglądarki zamiast osobnego klienta HTTP ignorującego Secure cookie na lokalnym HTTP. Końcowy run jest pełnym PASS.

## Konta i treści użytkowników

- Trzy indywidualne konta wędkarzy, domyślny autor połowu oraz ręczna zmiana autora: Chromium PASS dla Patryka, Maćka i syntetycznego trzeciego konta. Nie tworzono trzeciego konta w produkcji.
- Konto systemowe ryby: oddzielny stabilny profil/ID, własny solony hash PBKDF2 z pepperem Workera, najwyżej trzy konta wędkarzy plus konto chronione. Nie może być wyłączone/usunięte/zmienione przez UI/API/równoległe SQL. Profil systemowy nie zawyża PB/statystyk ani listy wędkarzy.
- Pierwszy login blokuje prywatne dane do zmiany hasła; pierwsza rotacja wymaga też obecnego hasła zespołu, aby publicznie wskazane słabe hasło początkowe nie umożliwiało przejęcia konta. Chromium potwierdził pełny cykl na izolowanej bazie. **Produkcyjne konto jeszcze nie zostało zainicjalizowane.**
- Żadne istniejące hasło, konto ani sesja produkcyjna nie zostały zmienione. Operator ma zachować je podczas wydania, bez globalnego unieważniania sesji.
- Treści PL/EN: oddzielne wersjonowane tłumaczenia z SHA-256 źródła, rewizją CAS, oznaczeniem nieaktualności i zachowaniem liczb/URL. Oryginały pozostają bez zmian. Rzeczywisty edytor, zapis, odczyt offline i zmiana źródła: Chromium PASS.
- **Automatyczne tłumaczenie: NIEZAIMPLEMENTOWANE — brak skonfigurowanego dostawcy.** Ręczny workflow działa. Nie wysłano prywatnej treści do zewnętrznego translatora, Tavily ani AI. Pozostaje późniejsza decyzja: wybrać i zatwierdzić dostawcę albo pozostać przy ręcznej korekcie. Nie jest to automatyczne tłumaczenie PASS.

## Kopia i bramka wydania

Preflight PASS: 26 tabel / 261 rekordów, zgodne ID/PB/połowy/checklisty/archiwum, schemat, FK i liczniki; D1 28 odtworzona w nowej bazie, jawna migracja 0029, drugi restore schematu 29. SHA-256 prywatnego SQL: `a21dc7fdf97e3ed6cafbc4416e63421986f57b2b6c79d514348544e622f4da75`. Bookmark Time Travel i konfiguracja Workera zapisane prywatnie. R2 ma 0 obiektów; pełny inwentarz/kopia/hash/restore PASS, bez zapisów do produkcyjnych mediów.

Kopia została przygotowana dla 5107b05; różnica do 3380038 dotyczy wyłącznie testu przeglądarkowego. Operator sprawdza dokładny git diff i odrzuca jakąkolwiek zmianę runtime, migracji, zależności lub workflow przy próbie ponownego użycia dowodu. Test tej odmowy PASS. Samo wydanie wykona dodatkowy świeży zamrożony checkpoint i odtworzenie pod maintenance.

Ręczny workflow `deploy-private.yml`, branch `ops/astra-release-20261019`, operator `52f1270efac5517ddedf4761c2c43e95a66b8e7f`, action deploy, kandydat 3380038. Prywatny manifest i zaszyfrowana koperta inicjalizacji są przygotowane; brak jawnego hasła w repo/logach/artefaktach. Concurrency dream-team-production; żadnego deploymentu na push ani włączania Builds. Wymagane poświadczenia i poprzednia wersja są ponownie sprawdzane przed maintenance.

**Jedyna bieżąca blokada:** automatyczna kontrola zatwierdzeń odrzuciła kliknięcie Run workflow. Podała wymóg świeżej zgody bezpośrednio przed operacją obejmującą produkcyjny maintenance, migrację, inicjalizację konta i zaszyfrowane poświadczenie. Nie próbowano zastępczego workflow, pośredniego wykonania ani ponownego kliknięcia.

Po świeżym potwierdzeniu: ręczny dispatch → kontrola kolejki/CI/konfiguracji → maintenance HTTP/zapisy/cron → zamrożony D1/R2 checkpoint i restore → jawna migracja 28→29 i nowe trzy rekordy konta systemowego → izolowany smoke i dokładny deploy 3380038 → smoke produkcji/ciągłość sesji/D1/R2/PL-EN/pogoda/telefon → zakończenie maintenance. Błąd oznacza maintenance ON i zachowanie prywatnego manifestu; żadnego automatycznego rollbacku schematu 28 na 29.

**READY TO MERGE TO MAIN: YES — PR #13 już scalony.**
**READY TO DEPLOY PRODUCTION: NO — wymagane świeże potwierdzenie odrzuconego dispatchu; techniczne testy i preflight PASS.**
**DEPLOYMENT: BLOCKED. Produkcyjny smoke nowej wersji: NOT TESTED.**
