# Modernizacja DreamTeam — stan i kontynuacja

## Aktualny checkpoint (czytać przed historią poniżej)

- Etapy 0, 1 i 2: zakończone. Etap 2 wdrożony, schema 28; konta/PB/dane/offline mają realne dowody testowe opisane niżej.
- Etap 3: PASS na kodzie `6a9fce35226d685755c4ec9892e7c63c75ad4f3a`, wszystkie joby preview run `38249894300` PASS. 90/90 lokalnie + build + Validate/Responsive PASS.
- Etap 4: kod przygotowany; lokalna weryfikacja BLOCKED (environment_offline), pełne live/CI NOT TESTED do zakończenia nowego run. Etapy 5–7: do wykonania w tej kolejności.
- READY TO MERGE TO MAIN: NO. Produkcja/main bez zmian.

## Punkt wyjścia i przywracanie

- Gałąź: `feat/final-batch`.
- HEAD przed modernizacją: `20b7685260daa187c84b10ef445125027ceab11a` (punkt przywracania kodu; nie oznacza PASS całej aplikacji).
- Produkcja/main: `2d0da14d4637739dcefc61bab596be59778cd26f`. Nie scalać i nie wdrażać.
- Preview: `dream-team-preview`, osobna `dream-team-preview-db` i `dream-team-preview-media`; konfiguracja sprawdza różną tożsamość D1 względem produkcji.
- Schema kodu/preview: 27. Odczyt produkcji przez istniejący workflow: schema 20. Nie zakładać zgodności schematów.
- Przed etapem 2: wykonać prywatny snapshot/eksport preview D1 oraz odczyt liczb i identyfikatorów anglers/catches/trips/participants. Nie zapisywać danych sesji ani hashy w publicznych artefaktach. Snapshot D1 nie został wykonany w etapie 0; żadna migracja nie jest jeszcze wdrożona.
- Etap 1 zmienia tylko UI. Przywrócenie kodu bazowego nie wymaga cofania D1/R2. Nie usuwać zasobów produkcyjnych ani historycznych danych.

## Etap 0 — dowody

Źródła: bieżący kod, 75/75 testów lokalnych, run GitHub Actions `38208727708` dla dokładnego HEAD 20b7685, oraz bezpośredni odczyt ekranu Wyjazdów preview w przeglądarce (12.10.2026).

| Funkcja | Istnieje | Działa na preview | Wymaga poprawki | Niezaimplementowane |
|---|---|---|---|---|
| Wyjazdy, archiwum, CRUD, dane wieloletnie | tak | widok odczytany w UI; zapis kreatora: NOT TESTED w audycie | podział aktualne/nadchodzące/zakończone, pełne daty, przeniesienie administracji | nie |
| Checklisty/połowy/spoty/notatki offline | tak | PASS w job qa-offline ostatniego HEAD; pięć zapisów i konflikt | ponowna regresja po każdej zmianie kont | nie |
| Media Deeper, prywatne R2, 17 obrazów atlasu | tak | PASS w qa-media i staging R2 smoke | nie usuwać obrazów; dalsza kontrola treści | nie |
| Profile uczestników, PB, szablony | tak | PASS qa-extras ostatniego HEAD | utworzenie uczestnika przenieść z Wyjazdów do Ustawień | konta powiązane z profilem |
| Login/sesja wspólna, logout | tak | staging smoke PASS; profilowe konta: NOT TESTED | 730-dniowa sesja bez przypisania wędkarza; nowa migracja kont i zmiany hasła | indywidualne loginy i limit trzech kont |
| PL/EN, PWA/cache | tak | pełny zakres NOT TESTED: qa-language timeout przed zakończeniem, regresja pominięta | nadmiar przełączników, pełny audyt etapu 3 | nie |
| Kreator: nazwa/kraj/bezpośredni URL | tak, zmiana 725e55d | NOT TESTED: brak dowodu zakończonego E2E na tym HEAD | wymusić test braku requestu lake-candidates przy podanym URL | nie |
| Tavily | tak | binding dostępny; test jednorazowy wcześniej zarezerwowany: brak pełnego dowodu ekstrakcji | zweryfikować provenance, 38 pól, requesty i kredyty; nie zgadywać łowiska | nie |
| Workers AI | binding tak | BLOCKED; wyłączone, zero wywołań | niepotwierdzony darmowy limit; brak zgody na paid | nie |
| Pogoda PRO i miernik | tak | NOT TESTED naukowo i live w tym audycie | arbitralne wagi; brakujące odczyty zamieniane na zero; zbadać jednostki/czas/GPS | rzetelny opis niepewności |
| Encyklopedia/Deeper/quizy | tak | NOT TESTED co do poprawności źródeł w tym audycie | weryfikacja i rozszerzenie w etapach 5/6 | nie |
| Autoryzacja wszystkich API | wspólna bramka przed routingiem | smoke i testy automatyczne PASS | audyt kont po etapie 2; nie mieszać cache dwóch tożsamości | indywidualna tożsamość sesji |

Nie sumować powyższych wyników do ogólnego PASS. Test fixture ani sam binding nie zastępuje działającego UI lub rzeczywistego researchu.

## Ryzyka migracyjne (etap 2)

1. Zachować istniejące ID anglers i powiązania PB/połowów/trip_participants; nie tworzyć nowych profili Patryka/Maćka zamiast obecnych.
2. Wprowadzić konta jako powiązanie z anglers. Limit 3 aktywnych kont egzekwować atomowo po stronie D1, także przy równoległych żądaniach.
3. Wspólne hasło: istniejący sekret jako źródło inicjalizacji; późniejsze zmiany wyłącznie jako solony hash/KDF w prywatnej D1. Bez jawnych haseł w kodzie, logach, eksporcie i web storage.
4. Sesje muszą otrzymać ID konta; zaplanować obsługę/relogowanie istniejących sesji. Zmiana hasła powinna unieważnić stare sesje.
5. Utrzymać wspólne dane drużyny, jawnie wybrać zalogowanego autora nowego połowu, zachować ręczną zmianę autora i oryginalne historyczne połowy.
6. Kolejkę offline zachować przy aktualizacji aplikacji; przy przełączeniu kont nie wysyłać cudzych oczekujących zmian jako nowej tożsamości.
7. Przed migracją snapshot preview; po migracji porównanie liczby/ID istniejących danych; dopiero potem E2E kont na 390/1280.

## Kolejność i stan

- Etap 0: odczyt kodu i dowodów zakończony; pełne testy naukowe/providera pozostają oznaczone NOT TESTED/BLOCKED, bez deklaracji.
- Etap 1: kod gotowy, 76/76 testów lokalnych PASS; live preview po wdrożeniu: NOT TESTED. Język tylko login/Ustawienia, administracja w Ustawieniach, karty aktualne/nadchodzące/zakończone/archiwum. Dodano test live 390/1280: tworzenie, edycja i archiwizacja osobnego wyjazdu QA oraz sprzątanie tylko jego ID/nazwy w izolowanej D1. Wyniku CI nie wolno zakładać.
- Etapy 2–7: NOT TESTED / DO WYKONANIA. Nie rozpoczynać migracji kont przed przejściem bramki etapu 1.
- READY TO MERGE TO MAIN: NO — zakres etapów 1–7 nie został zakończony i pełna regresja bazowa nie jest potwierdzona.

## Pliki etapu 1

`public/trip-manager.js`, `public/pages/ustawienia.html`, `public/settings.js`, `public/i18n.js`, `public/dream-loader-v2.js`, `public/sw.js`, `tests/frontend.test.mjs`, `scripts/live-preview-language.mjs`, `scripts/live-preview-offline.mjs`, `scripts/live-preview-extras.mjs`, `scripts/live-preview-navigation.mjs`, `.github/workflows/preview-final-batch.yml`.

Ustawienia są inicjalizowane przed oznaczeniem aplikacji jako gotowej: eksport i logout nie mogą być klikane przed przypięciem obsługi. Etap 1 nie zmienia schematu D1, sesji ani danych użytkowników.

### Dalsza weryfikacja etapu 1

Run `38213090052` potwierdził CRUD wyjazdu i administrację na 390 px, media, offline, profile i system. Wykrył: nieprzetłumaczony prefiks przywracania i wyścig ponownej edycji podczas odświeżenia po zapisie na desktopie. Poprawki: jawna etykieta PL/EN, blokada interakcji `inert` na czas zapisu/odświeżenia i test opóźnionego odświeżenia oraz podwójnego submitu. Wynik ponownego live dla tych poprawek: NOT TESTED do zakończenia CI.

Bramka preview wymaga zgodności `APP_BUILD` i generacji `sw.js`; samo nowe API mogło wcześniej współistnieć ze starym assetem podczas propagacji wydania.

### Wznowienie po przerwaniu — 12 października

HEAD zweryfikowany bezpośrednio przez GitHub: `6707961ed655b7c99e7d8e107ca863903bd698d5`. Validate PASS. Preview run `38213892935`: language, extras (nawigacja 390/1280) i offline PASS; media FAIL podczas `page.reload` czekającego na `load`, regresja SKIPPED. Responsive run `38213895382` FAIL: stary selektor na Dashboardzie.

Naprawy testów: przejście do Ustawień i dokładnie jeden selektor; reload mediów czeka na commit nawigacji, gotowość aplikacji i kartę z zapisanym obrazem. Nie zmieniono bramek danych ani lokalizacji przełącznika. Test nawigacji rozszerzony o rzeczywiste tworzenie uczestnika/edycję PB oraz tworzenie/edycję łowiska na obu szerokościach; sprzątanie wyłącznie dokładnych ID/nazw nowych obiektów QA na izolowanym preview. Lokalne 76/76 PASS. Wynik nowych testów live: NOT TESTED do zakończenia nowego CI. Etap 1 pozostaje otwarty; migracji kont jeszcze nie wykonano.

### Etap 2 — projekt wdrożenia (bez migracji danych)

- Oddzielna tabela `auth_accounts`: ID konta, unikalny login bez rozróżniania wielkości liter, unikalne `angler_id` wskazujące obecny profil, aktywność. Limit trzech aktywnych kont egzekwowany przez trigger D1 przy INSERT/UPDATE, nie tylko przez UI. Nieaktywne/historyczne profile i połowy pozostają zachowane.
- Oddzielna prywatna tabela wspólnego poświadczenia: solony PBKDF2-SHA256 i wersja hasła. Żadnych hashy ani sekretów w `app_settings`, bootstrap lub eksporcie JSON. Pierwsza inicjalizacja ze skonfigurowanego sekretu Workers; brak hasła w migracji SQL/repozytorium.
- Sesja wskazuje konto i wersję poświadczenia. Login Patryk/Maciek wiąże się z obecnym `angler_id`, nigdy z nowym profilem. Trzeci uczestnik otrzymuje konto przez autoryzowaną funkcję Ustawień. Istniejący login techniczny może być wyłącznie jawnie skonfigurowanym aliasem jednego konta na preview dla CI, bez czwartego konta.
- Nowy połów wybiera wędkarza z tożsamości sesji; ręczny wybór innego autora pozostaje. Dane historyczne nie zmieniają autora ani PB.
- Wylogowanie: najpierw obsługa oczekującej kolejki, dopiero potem unieważnienie sesji. Obecny kod robi odwrotnie i usuwa kolejkę po potwierdzeniu. Kolejka musi zachować oryginalny payload i tożsamość właściciela; po zmianie konta nie wysyłać jej jako innego użytkownika. Zmiana hasła unieważnia stare sesje, ale nie usuwa oczekujących zapisów.
- Przed aktywacją: prywatny punkt przywracania preview i zestawienie istniejących ID/liczebności/PB; po migracji porównanie. Testy: dwa loginy, trzecie konto, odmowa czwartego/równoległych żądań, błędne hasło/rate-limit, zmiana wspólnego hasła, brak hashy w odpowiedziach, domyślny i ręczny autor, offline i ponowne logowanie na 390/1280. Produkcja bez zmian.

Stan etapu 2: PROJEKT, implementacja i migracja NOT TESTED. Nie przedstawiać tego projektu jako działającego logowania.

### Dowody nowego CI

Kod testów: `ff16701decfe387ee7676817ab4e18439d2b5e4d`; automatyczne bramki gałęzi: `e9cc8bce3a5086bf26ac4328b332216f2fd164d0` (`.github/workflows/responsive-qa.yml`, `.github/workflows/validate.yml`). Validate run `38215471208` PASS; Responsive run `38215471185` PASS (15 ekranów × 5 szerokości w PL/EN, przełączenie w Ustawieniach i niezależne urządzenia).

Preview run `38215466844`: language/media/extras/offline PASS. Log extras: rzeczywiste CRUD uczestnika/PB/łowiska/wyjazdu na 390 px o 07:04:33Z i 1280 px o 07:05:05Z; cleanup wyłącznie własnych obiektów zakończony. Media potwierdziły plik/schowek/reopen/edit/spot/full image/delete oraz D1/R2 i ochronę sesji; AI wyłączone. Regresja job `114700164869` FAIL w czwartym wariancie logowania (1280 EN): dwa GET /login timeout przed commit nawigacji, brak odpowiedzi HTTP; poprzednie trzy warianty po sześć widoków przeszły. Ponowiono wyłącznie ten job, bez zmiany testu i bez powtarzania CRUD. Wynik ponowienia: NOT TESTED do zakończenia.

Ręczny odczyt preview również potwierdził wyjazdy bez administracji i dokładnie jeden selektor w Ustawieniach, zero w nagłówku. Zauważony stary obiekt `QA navigation 1280 1791786983262` z poprzedniego wykonania pozostał na preview; nie usunięto go bez odrębnego potwierdzenia ID/powiązań. Nie należy mieszać go z obiektami nowego testu, które zostały posprzątane.

### Zamknięcie bramki etapu 1

Ponowienie regresji job `114701094610` w run `38215466844`: PASS — wszystkie 24 kombinacje (6 widoków × PL/EN × 390/1280), bez widocznych błędów aplikacji. Kod nie został zmieniony między próbami. Pierwszy timeout sieciowy pozostaje udokumentowany; jedno ponowienie przeszło.

| Funkcja | Stan przed | Stan po | Test | Wynik | Pozostałe problemy |
| --- | --- | --- | --- | --- | --- |
| Język w Ustawieniach | UI przeniesione, stary test Dashboard FAIL | Jeden przełącznik, poprawny test lokalizacji/persistencji | Responsive `38215471185` + live language/extras | PASS | Preferencje osobnych kont do etapu 2/3 |
| Media Deeper | Reload czekał na load, FAIL | Commit + gotowość UI + karta zapisanego pliku | Live media, D1/R2/schowek/401/17 obrazów | PASS | AI wyłączone zgodnie z bramką kosztową |
| Wyjazdy/archiwum | Rozdzielenie w kodzie, niedomknięta bramka | Tworzenie/edycja/archiwizacja i szczegóły łowiska na obu szerokościach | Live extras 390/1280 | PASS | Stary obiekt QA wymaga odrębnego sprawdzenia i sprzątania |
| Uczestnicy/PB/katalog łowisk | Formularze przeniesione | Rzeczywiste dodawanie i edycja w Ustawieniach | Live extras 390/1280 + serwerowa persistencja | PASS | Limit kont/login jeszcze niezaimplementowany |
| Offline | Istniejąca kolejka i sync | Regresja operacji i konfliktów nadal przechodzi | Live offline + Responsive fixture | PASS | Właściciel kolejki/logout przy zmianie kont do etapu 2 |
| Responsywność/regresja | Responsive FAIL; final regression SKIPPED | 15 ekranów/5 szerokości PL/EN; final preview 390/1280 PL/EN | Responsive + `114701094610` | PASS | Pierwsza próba live timeout /login; retry PASS |
| Konta maks. 3 i domyślny autor | Niezaimplementowane | Projekt migracji zapisany, bez aktywacji | Brak E2E kont | NOT TESTED | Cały etap 2 do wdrożenia po prywatnym checkpoint preview |
| Pełny audyt języka/warunków/content/security | Niezakończony | Brak deklaracji wykonania | Etapy 3–7 | NOT TESTED | Pozostaje zgodnie z kolejnością |

Etap 1: PASS dla przetestowanego zakresu, zamknięty. Etap 2: rozpoczęty projekt, implementacja/migracja do wykonania. READY TO MERGE TO MAIN: NO — etapy 2–7 pozostają; produkcja i main bez zmian. Ten checkpoint dokumentacji nie zmienia przetestowanego kodu (`e9cc8bce3a5086bf26ac4328b332216f2fd164d0`).

## Etap 2 — implementacja w toku

Zaimplementowano: migracja 0028 (konta na oryginalnych ID, atomowy limit 3), prywatne poświadczenie wspólnego hasła PBKDF2-SHA256/100000 + solony sekret Workers, sesje powiązane z kontem i wersją hasła, login Patryk/Maciek (alias istniejącego loginu CI tylko na preview), tworzenie profilu/loginu w jednej transakcji, konto i zmiana wspólnego hasła w Ustawieniach, domyślny autor połowu z możliwością zmiany, kolejka z właścicielem zachowana po wylogowaniu. Starsze zmiany bez właściciela wymagają jawnego przypisania w Ustawieniach; nie zgadywać tożsamości.

Przed migracją pipeline musi wykonać `preview-account-checkpoint.mjs`: Time Travel bookmark i kompletny prywatny snapshot (schemat+dane, również sesje) w prywatnym R2 `private-checkpoints/`; niezależny odczyt i SHA256 pliku. Dane nie trafiają do logów ani artefaktów. Po migracji pełne porównanie liczby i SHA256 każdej istniejącej tabeli biznesowej. Bez PASS tych kroków deployment preview nie jest wykonywany.

Lokalnie: 80/80 testów PASS; Worker dry-run build PASS. Nowe testy sprawdzają trzy loginy, równoległą próbę przekroczenia limitu/rollback profilu, historyczne ID/PB/połowy, zmianę hasła/unieważnienie sesji, brak hashy w eksporcie, właściciela offline i anulowanie logout przed unieważnieniem sesji. Realne preview/migracja/konta: NOT TESTED do zakończenia CI. Nowy job `qa-accounts` uruchamia rzeczywiste UI trzech kont/połowów na 390/1280, zmianę hasła z przywróceniem oryginalnego prywatnego hasha, logout/relogin/offline/replay; sprząta wyłącznie własne rekordy QA. Etap 2 nie jest jeszcze PASS.

### Etap 2 — rzeczywiste wdrożenie i E2E

Implementacja `72d4dfa00e8957127cb2b5f4ea6f96df850128b6`, poprawki `6927d9e` (Fetch checkpoint), `66448ce` (składnia QA + walidacja wszystkich skryptów), `5e5bf6a` (udział w wyjeździe przy edycji autora, kolejność QA i diagnostyka), `5e2456dd4b694298c713a9288f0689d238ecd832` (pełny formularz E2E, autor na starszych wyjazdach i generacja cache).

Prywatny punkt przywracania przed migracją: run `38218928833`, job `114710197144`, 07:39:42Z — pełny schemat i dane D1 w prywatnym R2, odczyt zwrotny SHA256 `39c17d99ec93abde901aac9ffcf61eb76bd0850e9ab17af94a9912528e24cd49`, bookmark Time Travel przechowywany w tej prywatnej kopii. Obiekty mają prefiks `private-checkpoints/accounts-6927d9ea9c48dbccc9e1193ea58594556322288b-`; kolejne punkty nie nadpisują wcześniejszych. Liczby przed migracją: 2 wędkarzy, 4 łowiska, 5 wyjazdów (w tym stary QA), 10 powiązań uczestników, 0 połowów, 52 spoty, 63 pozycje checklisty, 84 dokumenty. Migracja 0028 PASS, pełne porównanie SHA256 wszystkich tabel biznesowych PASS. Dane produkcyjne nie były migrowane.

Realne E2E kont na kodzie `5e2456d`: run `38221484979`, job `114719127670` PASS:

- 08:11:25Z: trzy loginy, limit 3/rollback czwartego profilu, oryginalne ID/PB, automatyczny autor/reset i ręczny autor, 390/1280.
- 08:11:47Z: anulowanie logout nie unieważnia sesji; logout zachowuje kolejkę; Maciek otrzymuje 403 przy próbie wysłania kolejki Patryka; właściciel po relogowaniu synchronizuje raz, replay nie duplikuje połowu.
- 08:12:00Z: zmiana hasła przez Ustawienia, unieważnienie starych sesji, login nowym hasłem, brak hashy/sektretów w eksporcie. Przywrócono dokładnie oryginalny prywatny hash z kolejną wersją, więc stare sesje nie wracają. Tymczasowy trzeci profil i własne połowy/wyjazd QA usunięte.

82/82 testów lokalnych PASS. Końcowe powiązane testy preview i regresja w tym run nadal IN PROGRESS — nie zamykać pełnej bramki etapu 2 przed ich wynikiem. Poprzedni powtarzający się timeout nawigacji ma dodaną diagnostykę: gotowość/notice/page errors oraz screenshot błędu. Nie zignorowano tej bramki.

### Zamknięcie Etapu 2

Run `38221484979` zakończony PASS po ponowieniu wyłącznie końcowej regresji (job `114726916334`). Pierwszy runner finalnej regresji anulowany po 12 minutach: dwa odczyty preflight bez własnego timeoutu czekały po ~5 minut na sieć, bez statusu HTTP. To nie był błąd formularza kont. Ponowienie na innym runnerze przeszło pełne 390/1280 PL/EN; nie powtarzano udanych operacji CRUD. Ograniczenia czasu preflight zostaną dołączone do następnego commitu QA.

| Funkcja | Stan przed | Stan po | Test | Wynik | Pozostałe problemy |
| --- | --- | --- | --- | --- | --- |
| Loginy Patryk/Maciek | Jedna wspólna sesja bez tożsamości | Indywidualne konta na tych samych ID, wspólne hasło | Unit + real E2E `114719127670` na 390/1280 | PASS | Preferencje języka per konto — etap 3 |
| Trzeci użytkownik | Profil bez loginu i limitu kont | Uczestnik i login atomowo; maks. 3 aktywne konta | D1 trigger, równoległy unit, UI trzeci + odmowa czwartego/rollback | PASS | Konto QA usunięte; rzeczywistego trzeciego dodaje użytkownik w Ustawieniach |
| Autor połowu | Pierwsza osoba na liście | Zalogowany wędkarz; reset formularza zachowuje domyślnego autora; ręczny wybór pozostaje | Trzy konta × dwa ekrany, manual author; starszy wyjazd unit | PASS | — |
| Hasło/sesje | Sekret Workers, wspólna sesja | Prywatny solony KDF + pepper; zmiana w Ustawieniach, wersja unieważnia sesje | Realna rotacja/relogin/401 starych sesji/restore, export bez hashy | PASS | Nie zmieniono hasła użytkowników po teście |
| Dane/PB/historia | Istniejące dane D1 | Wszystkie istniejące wiersze biznesowe bez zmian po migracji | Prywatny checkpoint R2/Time Travel + SHA256 przed/po | PASS | Stary obiekt QA z wcześniejszego etapu nadal zachowany |
| Offline/logout/zmiana konta | Logout usuwał kolejkę i unieważniał przed pytaniem | Właściciel w kolejce, zachowanie payloadu, odmowa obcego konta; jawne przypisanie legacy | Real UI cancel/logout/Maciek 403/Patryk relogin/sync/replay + unit | PASS | Starsze nieprzypisane zmiany wymagają potwierdzenia w Ustawieniach |
| Autoryzacja/regresja | Jedno konto | Konta chronią API i zachowują wspólny dostęp drużyny | Unit 82/82; Validate/Responsive PASS; wszystkie joby preview PASS | PASS | Native preflight timeout do ograniczenia w QA |

Etap 2: PASS i wdrożony na izolowanym preview. Przetestowany kod: `5e2456dd4b694298c713a9288f0689d238ecd832`, schema 28, cache 20261012-103. Etapy 3–7 pozostają do wykonania. READY TO MERGE TO MAIN: NO. Produkcja/main bez zmian.

## Etap 3 — implementacja i audyt w toku

Dodano jedną wspólną obsługę preferencji języka (`language-preference.js`) dla interfejsu konta na urządzeniu; anon/login zachowuje osobną preferencję. Patryk i Maciek na jednym telefonie mogą zachować różne PL/EN bez zmiany cudzego języka. Moduły Encyklopedii/Deepera, pogody i porad odczytują tę samą preferencję. Kontrolka pozostaje pojedyncza w Ustawieniach (oraz osobna na ekranie loginu); nie wróciła do nagłówka.

Błędy API otrzymują język żądania. Audyt statycznych komunikatów i etykiet walidacji wykrył m.in. brak tłumaczenia słowa „Waga” oraz nowe błędy kont; uzupełniono je bez tłumaczenia danych użytkownika. PL: „Dashboard” i „Research provider” mają polskie etykiety. Nazwy użytkowników i wartości źródłowe pozostają oznaczone jako dane/treść źródłowa. Preflight CI ma teraz własne 12-sekundowe limity dla login/settings/SW; zgodność SHA i generacji cache nadal obowiązuje.

Lokalnie 85/85 PASS + Worker dry-run PASS. Nowy live E2E `live-preview-user-language.mjs`: PL→EN→PL, reload, Patryk PL/Maciek EN na jednym urządzeniu, 15 widoków dla każdego konta na 390/1280, błędy API PL/EN. Do tego dotychczasowe 15 ekranów × pięć szerokości, interakcje/quizy i source-preservation w istniejących testach. Live nowego kodu: NOT TESTED do zakończenia CI. Nie oznaczać całego etapu 3 jako PASS na podstawie istnienia kodu i testów lokalnych.

### Etap 3 — wyniki pierwszej bramki

Kod `cb443dcf8e3953281622f556d9715714be3ca73c`: Validate PASS. Preview run `38226895003`: deployment/checkpoint/integralność, konta (ponowny pełny real E2E), language i offline PASS. Extras FAIL wyłącznie na oczekiwaniu starej etykiety „Research provider” w PL; Responsive FAIL na starej etykiecie „Research:”. Testy dostosowano do polskich etykiet, bez cofania lokalizacji. Media FAIL po upload/reload: brak data-ready w 30 s, wcześniej brak diagnostyki. Dodano wczesne rozpoznanie data-ready=error, log ścieżek oczekujących/nieudanych requestów, błędów skryptu i screenshot. Nie zadeklarowano naprawy nieznanej przyczyny timeoutu. Nowe preferencje dwóch użytkowników i końcowa regresja SKIPPED przez zależność od tych bramek. Etap 3 nadal otwarty.

Dalszy audyt etapu 3: PL używa „zrzut ekranu”, polskich komunikatów wyszukiwania źródeł i nazw rodzajów źródeł zamiast surowych wartości API (`manual`, `directory`, itd.). Dynamiczne błędy bootstrap/Encyklopedii i liczby zapisanych faktów mają EN. Moduły mediów i pogody wysyłają wybrany język do API. Nazwy źródeł i stare/nowe wartości cytatów są jawnie zachowane jako treść źródłowa. Testy błędów UI sprawdzają rzeczywistą klasę `status-danger` (wcześniejsze `.error` nie odpowiadało klasie notice). Lokalnie 87/87 + dry-run build PASS. Zmiany nie obejmują migracji danych. Wynik nowego kodu na preview pozostaje NOT TESTED do zakończenia CI.

Run `38244262366` / `f9e2b3b`: Validate/Responsive, konta, extras (CRUD na obu szerokościach), media i offline PASS. Media przeszły pełny cykl (11:45:36Z), bez diagnozy poprzedniego timeoutu; brak dowodu trwałej usterki UI. Language: mobilne Ustawienia PL→EN→reload→PL PASS, później FAIL przed odpowiedzią HTTP na /login w nowym profilu przeglądarki (trzy próby tej samej karty). Osobny pełny audyt EN uruchamia teraz świeży proces przeglądarki, zachowując wszystkie asercje logowania; błędy nawigacji zapisują diagnostykę. Tę poprawkę należy ocenić na kolejnym CI, a nie traktować jako już dowiedzioną naprawę. Etap 3 nie jest zamknięty.

`593f7a2` / run `38245188775`: Validate i Responsive PASS; pełny live audyt EN (15 widoków × 5 szerokości), konta, media, offline i extras PASS. Test dwóch użytkowników pozostał uruchomiony ponad 6 minut bez checkpointu wyniku. Analiza wykryła nieograniczone, równoległe pobieranie całego shell przy każdej nawigacji. Naprawa SW: jeden współdzielony refresh oraz marker generacji z 10-minutowym odstępem, timeout pobrań i zachowanie wpisów przy braku sieci. Unit dowodzi deduplikacji przy trzech jednoczesnych żądaniach i odczytu offline po nieudanym odświeżeniu; nie dowodzi, że wyjaśnia wszystkie poprzednie timeouty. 88/88 lokalnie PASS. Do testu dwóch użytkowników dodano checkpoint każdej nawigacji, diagnostykę i ograniczenie zamykania przeglądarki. Nowy commit zastąpi tylko pozostające read-only testy języka/regresji; wszystkie operacje CRUD i rotacja/przywrócenie hasła już zakończyły się PASS.


### Etap 3 — wykryta regresja pogody

Run `38247029441` / `5991fb6`: test użytkowników `114806355754` doszedł do Patryk/1280/PL/Pogoda i wykrył 1 rzeczywisty `#app-notice.status-danger`; brak zapisanej treści komunikatu uniemożliwia przypisanie konkretnego HTTP/native timeoutu. Nowa asercja pokazuje pełny komunikat, rejestruje status/error API pogody i nieudane requesty. Przegląd kodu dodatkowo potwierdził brak polskiej obsługi natywnych `TimeoutError/AbortError` w pogodzie. Poprawiono lokalizację tych błędów i wprowadzono maksymalnie dwie ograniczone próby samego odczytu dostawcy (9 s + 6 s; wyłącznie transport/5xx, bez ponawiania 429 i niepełnych danych); klient ma 22 s limitu. 90/90 testów lokalnych PASS, w tym rzeczywisty frontendowy timeout po polsku i kontrola liczby prób. Przyczyny pierwszego błędu nie przedstawiać jako dowiedzionej; wynik live poprawki: NOT TESTED do zakończenia nowego CI.


## Zamknięcie Etapu 3 — 12.10.2026

Kod: `6a9fce35226d685755c4ec9892e7c63c75ad4f3a`. Run preview `38249894300`: wszystkie osiem jobów PASS. Validate `38249898998` / Responsive `38249899036` PASS. Lokalnie 90/90 + Worker dry-run PASS. Brak migracji w tym etapie, schema pozostaje 28. Nie wywołano Workers AI.

- `114815977563`, 12:45:08Z / 12:46:41Z: Patryk PL, Maciek EN na tym samym urządzeniu (390/1280), PL→EN→PL, reload i relogin, po 15 widoków na konto, błędy API PL/EN. Zarejestrowane żądania pogody HTTP 200, brak widocznych błędów aplikacji.
- `114814840952`: 15 widoków × 360/390/412/768/1280, audyt EN bez polskich etykiet, mobilne Więcej→Ustawienia i pojedynczy przełącznik.
- `114817571697`, 12:50:35Z: finalna regresja 24 kombinacji (6 widoków × PL/EN × 390/1280), PASS, sprawdzana właściwa klasa błędu notice.
- Konta, offline, media i extras ponownie PASS na tym HEAD. Zrzuty poprzedniego bieżącego kodu (`593f7a2`) rzeczywiście obejrzano: domyślny Maciek/390 i Patryk/1280 oraz Ustawienia obu szerokości; nowe artefakty dostępne w powyższym run.

| Funkcja | Stan przed | Stan po | Test | Wynik | Pozostałe problemy |
|---|---|---|---|---|---|
| PL/EN w Ustawieniach na telefonie | Jeden selector, stary test/angielskie etykiety PL | Polski Panel główny, wyszukiwanie, media; pojedynczy selector w Ustawieniach | Responsive + live More→Settings | PASS | — |
| Preferencje dwóch kont | Wspólna preferencja urządzenia | Osobna preferencja konta na urządzeniu, osobny login | Real Patryk/Maciek PL/EN + reload/relogin 390/1280 | PASS | Preferencja interfejsu jest lokalna dla urządzenia, opisano to w UI |
| API i błędy połączenia | Braki etykiet EN; natywny timeout angielski w PL | Język żądania, komplet etykiet walidacji, lokalizowane błędy pogody/loadera | Unit + live błędy API + prognoza HTTP 200 | PASS | Dostawca może być niedostępny; awaria ma czytelny komunikat, bez fałszywych danych |
| Wiedza/quizy/dane źródłowe | Część modułów czytała tylko globalną preferencję | Wspólny odczyt języka konta; źródła i własne wartości pozostają oznaczone | Audyt EN 5 szerokości + Responsive interakcje + unit | PASS | Rzetelność merytoryczna nadal do etapów 4–6 |
| PWA/cache | Wielokrotne pełne warming przy każdej nawigacji | Jedno współdzielone odświeżenie, 10-minutowy odstęp, zachowanie cache po błędzie | Unit deduplication + real offline/owner queue + regresja | PASS | Nie udowodniono, że warming wyjaśniał wszystkie wcześniejsze timeouty |

Pliki etapu 3:

`.github/workflows/preview-final-batch.yml`, `docs/modernization-2026-10-12.md`, `public/app-plus.js`, `public/deeper-media.js`, `public/dream-core.js`, `public/dream-loader-v2.js`, `public/fixes.js`, `public/i18n.js`, `public/index.html`, `public/knowledge.js`, `public/language-preference.js`, `public/locales/pl.json`, `public/locales/runtime.en.json`, `public/login.html`, `public/pages/checklisty.html`, `public/pages/dojazd.html`, `public/pages/encyklopedia.html`, `public/pages/mapa.html`, `public/pages/pogoda.html`, `public/pages/polowy.html`, `public/pages/porady.html`, `public/pages/regulamin.html`, `public/pages/rigi.html`, `public/pages/sonar.html`, `public/pages/teren.html`, `public/pages/ustawienia.html`, `public/pages/wezly.html`, `public/pages/wyjazdy.html`, `public/settings.js`, `public/sw.js`, `public/trip-manager.js`, `public/trip-renderer-v2.js`, `scripts/live-preview-extras.mjs`, `scripts/live-preview-language.mjs`, `scripts/live-preview-media.mjs`, `scripts/live-preview-offline.mjs`, `scripts/live-preview-regression.mjs`, `scripts/live-preview-user-language.mjs`, `scripts/responsive-qa.mjs`, `scripts/wait-preview-build.mjs`, `src/api-language.js`, `src/auth.js`, `src/lake-research.js`, `src/weather.js`, `src/worker.js`, `tests/frontend.test.mjs`, `tests/i18n.test.mjs`, `tests/language-accounts.test.mjs`, `tests/shell-warming.test.mjs`, `tests/weather-failures.test.mjs`

Etap 3 zamknięty. Następny: Etap 4 — jednostki/GPS/czas/odświeżanie, braki pomiarów wody, naukowa korekta miernika warunków. READY TO MERGE TO MAIN: NO — etapy 4–7 jeszcze niezaliczone. Produkcja i main bez zmian.


## Etap 4 — kod i weryfikacja w toku

Zastąpiono niezweryfikowany indeks [-6,14] oceną praktycznych warunków na brzegu (kategorie, nie procent szansy brania). Dawne wagi ciśnienia, pory dnia, zachmurzenia i arbitralnych zakresów powietrza pod żerowanie usunięto z aktywnych ścieżek dashboard/Pogoda. Presja i Księżyc nie są predyktorami w tym module; wiatr opisuje ograniczenia obsługi sprzętu. Jawne pozytywne/negatywne czynniki, niepewność wysoka bez pomiaru wody/tlenu i zweryfikowanego modelu, praktyczna sugestia. Progi komfortu/safety są oznaczone jako reguły praktyczne, nie wyniki badań. Burza/skrajne warunki nie są równoważone pozytywnymi czynnikami. Braki nie są zerem.

API: jedna kompletna para GPS z łowiska (lub legacy wyjazdu), bez mieszania współrzędnych; jawne °C/km/h/mm, MSL w hPa; sunrise/sunset; 3 godziny historii; unixtime→IANA uwzględnia DST i zachowuje absolutne godziny przy jesiennym powtórzeniu 02:00. Woda/tlen: brak pomiarów, temperatura powierzchni modelu nie jest zastępstwem. Cache dashboardu rozróżnia wyjazd/GPS, przycisk refresh jest single-flight, aktywny widok odświeża co 10 min. Prognoza powietrza nie wybiera już strategii nęcenia jako pomiar wody; sezon opisano jako przybliżenie. Wartości wygenerowanej prognozy w popupie porad mają PL/EN.

Źródła pierwotne odczytane 12.10.2026: [Open-Meteo API](https://open-meteo.com/en/docs) (jednostki, modele/siatka, MSL, warstwa 0 cm, unixtime/DST, sunrise/sunset), [Bauer & Schlott 2006](https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-2109.2005.01426.x) (zimowe niedotlenienie i aktywność — nie uniwersalny model brań), [NWS](https://www.weather.gov/safety/lightning-safety-overview) (burza), [NASA](https://science.nasa.gov/moon/moon-phases/) i [dane SVS 5587](https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/mooninfo_2026.json) (przybliżony cykl, trzy próbki oświetlenia). Dla 12 Oct 2026 12:00 UTC NASA=3,74%, przybliżenie aplikacji=2%; dla 3 Jan=99,86% vs 100%; 1 Feb=99,71% vs 99%. To porównanie próbek, nie globalna gwarancja dokładności ani walidacja prognoz brań.

Weryfikacja lokalna przed odłączeniem: trzy nowe testy PASS (braki/zero, kategorie/skrajne scenariusze, DST/GPS/jednostki, renderer/single-flight) i Worker dry-run PASS. Pełna seria 94 testów: 93 PASS, 1 FAIL na timeout uruchomienia strony głównej. Izolowane powtórzenie też zakończyło się niepowodzeniem; potem executor zwrócił `409 Conflict environment_offline: Environment is not connected`. Nie przypisywać timeoutu kodowi lub CPU bez logów, których nie można teraz odczytać. Lokalny kanał wykonania BLOCKED. Zmiany odtworzono przez GitHub na potwierdzonym parent `b2b5204`; bez utraty checkpointów 2/3 i bez dostępu do produkcji. Runner GitHub jest niezależnym miejscem testów; bramka npm test/build musi przejść przed preview deploy. Dodatkowe testy Moon/przeciwdziałania użyciu powietrza jako wody wymagają wyniku CI. Nowy qa-weather rozdziela rzeczywisty dostawca/GPS/jednostki/czas od jawnie symulowanego storm/missing UI.

Pliki kandydata Etapu 4: `public/app-plus.js`, `public/dream-loader-v2.js`, `public/fixes.js`, `public/locales/runtime.en.json`, `public/pages/pogoda.html`, `public/sw.js`, `scripts/live-preview-offline.mjs`, `scripts/qa-weather.mjs`, `src/weather.js`, `tests/api.test.mjs`, `tests/weather-failures.test.mjs`, `.github/workflows/preview-final-batch.yml`, `src/trip-advice.js`, `public/trip-manager.js`, `public/locales/trip-advice.en.json`, `public/weather-conditions.js`, `tests/weather-conditions.test.mjs`, `scripts/live-preview-weather.mjs`.

Stan Etapu 4: IN PROGRESS / NOT TESTED na preview, do wyniku CI. Etapy 5–7 pozostają. READY TO MERGE TO MAIN: NO. Nie wykonano migracji danych w tym etapie, merge/main i produkcja bez zmian.


Etap 4, pierwsza bramka CI `38263116288` / `58fefdd`: 94/95 testów PASS, w tym wszystkie 14 bootstrapów (3,69 s), DST/GPS/jednostki/braki/renderer/Moon oraz niezmienność zaleceń względem temperatury powietrza. Lokalny timeout nie odtworzył się na runnerze, lokalne środowisko nadal BLOCKED. Responsive `38263116125` PASS. Jedyny FAIL: stary test porad dla czerwca oczekiwał zimowej dawki „kilka kulek” wyłącznie przez prognozę powietrza 8–12°C. Test teraz oczekuje małej punktowej porcji sezonowego punktu startowego i jawnej etykiety prognozy powietrza; niezależny nowy test porównuje te same zalecenia przy chłodnej/ciepłej prognozie. Błędnej zależności nie przywrócono. Deployment i E2E zostały poprawnie SKIPPED przez bramkę testów; brak deklaracji PASS Etapu 4 przed ponownym CI/live.


Etap 4, run `38263584133` / `c9af092`: Validate i Responsive PASS; preview wdrożono (Worker version `b1c75b83-7663-44dd-8e17-bb605f384e03`), checkpoint/integralność PASS. Konta, media, offline i extras PASS. `qa-weather` `114861607548` rzeczywisty Open-Meteo/GPS/jednostki/IANA/sunrise/sunset/brak pomiarów wody/niepewność oraz single refresh PASS na PL/EN × 390/1280; osobno jawnie symulowane brakujące pola/burza PASS. Audyt EN `114861607340` FAIL: jedna nowa etykieta „🧭 Kierunek wiatru (skąd wieje)” została po polsku na pięciu szerokościach; dictionary zawierał wersję bez ikony, a translator wymaga całego węzła. Dodano pełny klucz z ikoną. Testy użytkowników i finalnej regresji SKIPPED przez tę bramkę, nie przedstawiać ich jako PASS. Etap 4 nadal otwarty do ponownego CI.


Run `38264631031` / `cedec898`: Validate/Responsive PASS, EN audyt pięciu szerokości PASS (etykieta kierunku poprawiona). Pogoda FAIL na rzeczywistym HTTP 503; pojedyncze ponowienie odczytu potwierdziło PL/390 PASS, następnie redundantny GET testu API przekroczył 25 s. Nie przypisano tego kodowi aplikacji. Test teraz weryfikuje rzeczywistą odpowiedź /api/weather używaną przez widok, bez dodatkowego GET; sanitizuje błędy (bez nagłówków sesji) i wylogowuje własną sesję w finally. Offline: pierwszy FAIL na nawigacji mapa po 5 zapisach/synchronizacji/replay; własne dane posprzątano. Pojedyncze ponowienie job `114867759457` PASS. Dodano diagnostykę ścieżek/ready/login i najwyżej jedno ponowienie nawigacji przy TimeoutError (bez ponawiania zapisów lub data-ready=error). Nadal brak dowodu przyczyny pierwszego timeoutu; nie ukryto go. Konta/rotacja hasła, media i extras PASS, kolejne bramki SKIPPED przez pogodę. Kolejny deployment ponownie rotuje/przywraca prywatne hasło w QA kont, unieważniając wcześniejsze sesje QA. Etap 4 pozostaje otwarty.


Checkpoint 12.10, Etap 4: `39e264a` / run `38266236556` — Validate i Responsive PASS; konta, media, offline, nawigacja i EN audit PASS. Pogoda: rzeczywisty dostawca/renderer/single refresh/storm/missing PASS dla PL/390, EN/390 i PL/1280, lecz czwarta kombinacja EN/1280 zatrzymała się na nawigacji (30 s), również po jednym ponowieniu jobu. Brak dowodu przyczyny; testów użytkowników i finalnej regresji nie zaliczono (SKIPPED). Nowa wersja QA uruchamia osobny proces Chromium dla każdej kombinacji; zapisuje fazę i oczekujące ścieżki bez nagłówków sesji. Maksymalnie jedno ponowienie samej nawigacji przy TimeoutError, bez ponawiania zapisów ani data-ready=error. Wszystkie asercje dostawcy, GPS, jednostek, IANA, słońca, braków wody, niepewności, single refresh i symulowanej burzy zachowano. Wynik nowej wersji: NOT TESTED do CI.

Executor lokalny wrócił: aktualny kod Etapu 4 95/95 PASS, dry-run Worker PASS (bez deploymentu lub dostępu do produkcyjnego D1/R2). Pierwotny szkic Etapu 4 zachowano w stash, zsynchronizowano fast-forward na `feat/final-batch`. Kandydat Encyklopedii: 97/97 lokalnie PASS, zachowany osobno w stash do zamknięcia Etapu 4; nie jest wdrożony ani zaliczony. Lokalny Responsive QA BLOCKED — brak binarium Chromium; rzeczywisty Responsive na Actions PASS. Etap 4 nadal otwarty. READY TO MERGE TO MAIN: NO.


`9f68802` / run `38279443887`: QA pogody wykryło konkretny błąd zbierania dowodu, EN/390 — `Network.getResponseBody: No resource with given identifier found`. Odczyt Playwright Response po zmianie dokumentu nie ma gwarancji zachowania body. Nowy test kopiuje odpowiedź rzeczywistego window.fetch na stronie Pogody do zmiennej bieżącego dokumentu, bez dodatkowego GET, proxy, fixture lub zmiany danych; oryginalną odpowiedź oddaje aplikacji od razu. Kopia poprzedniej strony nie przechodzi do nowego dokumentu. Wymóg rzeczywistego HTTP 200, identyfikacji dostawcy i wszystkich metadanych pozostaje. Nie jest to jeszcze PASS Etapu 4: kolejna bramka live jest wymagana. Lokalny browser install również BLOCKED (pobierany ZIP Chromium ma 0 MiB/niepoprawną strukturę); CI dostarcza działający Chromium. Zrzuty `39e264a` dla PL/390 i PL/1280 rzeczywiście obejrzano: brak overflow, wynik opisany jako warunki na brzegu, bez procentowej prognozy brań.


## Zamknięcie Etapu 4 — 12.10.2026

Przetestowany kod: `31274bf20c68e91511b7e67ed17f0759c4050876`; preview run `38280317473`, wszystkie dziewięć jobów PASS. Validate `38280325323`/`38280317501` i Responsive `38280325626` PASS. Lokalny kod Etapu 4: 95/95 i Worker dry-run PASS. Schema pozostaje 28, bez migracji danych tego etapu; produkcja/main bez zmian.

- Pogoda `114917369861`: 16:56:45Z–16:57:16Z, PL/EN × 390/1280 — rzeczywisty fetch widoku z Open-Meteo, GPS przechowywanego łowiska, °C/km/h/mm/hPa, epoki i strefa IANA, słońce, brak pomiarów wody/tlenu, wysoka niepewność brań i pojedyncze żądanie po podwójnym kliknięciu PASS. Burza/brakujące pola to osobno oznaczone symulacje renderera, PASS.
- Media: pierwsza próba FAIL po reload z oczekującymi plikami; sam job ponowiono raz, `114919268379` PASS pełny lifecycle D1/R2/clipboard i usunięcie własnego obiektu. Nie udowodniono przyczyny wszystkich timeoutów sieci; pozostaje do kontroli odporności cache w Etapie 7.
- `114919753098`: 17:05:32Z / 17:08:38Z, dwa konta na jednym urządzeniu, 15 widoków na konto, PL/EN/PL/reload/relogin i błędy API PASS dla 390/1280.
- `114922086736`: 17:11:21Z, finalna regresja 24 kombinacji (6 widoków × PL/EN × 390/1280) PASS. Konta, EN audit, offline, media i nawigacja również PASS.
- Naprawiono jeden konkretny błąd QA: opóźniony odczyt body z poprzedniego dokumentu przez CDP; kopia rzeczywistego window.fetch w bieżącym dokumencie zachowuje sprawdzany payload. Nie przedstawiać tego jako dowodu przyczyny innych timeoutów. Zrzuty PL/390 i PL/1280 faktycznie obejrzano; aktualny kod interfejsu pogody pozostawał ten sam, kolejne commity korygowały QA i raport.

| Funkcja | Stan przed | Stan po | Test | Wynik | Pozostałe problemy |
|---|---|---|---|---|---|
| Ocena warunków | Niezweryfikowane wagi pogody/ciśnienia/godziny | Kategorie komfortu/ograniczeń, plusy/minusy, praktyczna sugestia i niepewność; bez procentu brań | Unit: invariance, braki, skrajności; real UI PL/EN 390/1280 | PASS | Brak zweryfikowanego modelu brań dla łowiska jest jawny |
| GPS/jednostki/czas | Część parametrów domyślna, brak absolutnych epok | Jedna kompletna para GPS, jawne jednostki, epoch + IANA/DST, sunrise/sunset | Unit jesiennego DST; live API/rendered response | PASS | Dane są prognozą modelową dla siatki |
| Woda/tlen | Możliwość pomylenia powierzchni modelu z wodą | Osobny brak pomiarów; powierzchnia 0 cm i gleba 0–1 cm opisane właściwie | Real UI i missing/zero renderer | PASS | Aplikacja nie ma czujnika wody/tlenu |
| Odświeżanie | Ryzyko równoległych kliknięć | Jedno aktywne żądanie; widoczny widok co 10 min, cache dashboardu po wyjeździe/GPS | Unit + live double click | PASS | Dostawca i transport mogą czasowo zawodzić; błędy jawne |
| Księżyc | Brak wyraźnej granicy znaczenia/dokładności | Przybliżenie astronomiczne, nie predyktor brań | 3 próbki NASA + oznaczenie w UI | PASS | Nie jest pełną efemerydą; porównanie próbek nie jest globalną gwarancją |
| Nęcenie w poradach | Zimowa dawka z temperatury powietrza | Air forecast jawnie opisany; przybliżony sezon i obserwacja, bez zastępowania pomiaru wody | Unit: różne powietrze, te same rekomendacje | PASS | Punkt startowy praktyczny, nie kalibracja biologiczna |

Pliki Etapu 4: `.github/workflows/preview-final-batch.yml`, `public/app-plus.js`, `public/dream-loader-v2.js`, `public/fixes.js`, `public/locales/runtime.en.json`, `public/pages/pogoda.html`, `public/sw.js`, `scripts/live-preview-offline.mjs`, `scripts/qa-weather.mjs`, `src/weather.js`, `tests/api.test.mjs`, `tests/weather-failures.test.mjs`, `src/trip-advice.js`, `public/trip-manager.js`, `public/locales/trip-advice.en.json`, `public/weather-conditions.js`, `tests/weather-conditions.test.mjs`, `scripts/live-preview-weather.mjs`, `tests/trip-advice.test.mjs`, `docs/modernization-2026-10-12.md`. Główna implementacja `58fefdd`, korekty `c9af092`, `cedec898`; dowód końcowy na `31274bf`. Etap 4 zamknięty. READY TO MERGE TO MAIN: NO — Etapy 5–7 pozostają.


## Etap 5 — implementacja Encyklopedii, bramka preview oczekująca

Zachowano wszystkie 14 ID tematów, 20 rodzajów dna, 20 profili, 7 zakresów temperatur i istniejące przewodniki oraz 8-krokową diagnostykę. Dodano 13 krótkich sekcji wewnątrz istniejących tematów (bez duplikowania artykułów): kontekst badań metabolizmu/młodych karpi, opis pomiaru wody, warstwowanie i tlen, oddychanie nocą, naturalny pokarm, rozdzielenie rozpoznania dna/prezentacji/bezpiecznego holu, ograniczenia instrukcji producentów, uczciwe porównanie aromatów, objawy stresu ryb, regulamin konkretnej wody/roku, scenariusz sezonowy, kontekst astronomiczny i bezpieczne schronienie podczas burzy. Poprawiono dawną poradę zbierania wędek w burzy: schronienie ma pierwszeństwo.

Każda sekcja ma widoczną kategorię (badania/technika, praktyka, producent lub zasady lokalne), nowe sekcje mają własne cytowane odnośniki. EN zachowuje metadane sekcji z PL i identyczną liczbę sekcji na temat. Dotychczasowe odnośniki zachowano; data „sprawdzone” jest wyświetlana tylko przy faktycznie odczytanych źródłach. Nie oznacza to niezależnej naukowej walidacji wszystkich dawnych doświadczeń praktycznych lub każdego smaku przynęty.

Kreator taktyki zaczyna od „Woda niezmierzona”, nie przyjmuje temperatury powietrza za wodę. Osobne potwierdzenie zasad i dobrostanu; zakaz/objawy stresu kończą poradę komunikatem przerwania łowienia, bez sugestii nęcenia. Nieznany stan ma jawną wysoką niepewność. Oryginalne 8 kroków „nie bierze” zachowano i przetestowano; skorygowano „przełowienie” na „podejrzenie przekarmienia”.

Odczytane źródła pierwotne: Becker 1992 (abstrakt; DOI `10.1111/j.1439-0426.1992.tb00664.x`), PMID 21440661/29275188 (metadane/fragment indeksu, nie deklaracja przeczytania pełnego artykułu), Bauer & Schlott 2006 (abstrakt), FAO Improving Pond Water Quality oraz Peteri 2009 Cyprinus carpio, Angling Trust Best Practice (również PDF) i Hot Weather 2025, Gardner Roddie Rig (instrukcja producenta), Mainline Essential Cell (materiał producenta), CC Moore winter fishmeal/PVA (fragment oficjalnego indeksu; bez twierdzenia o dostępie do całego tekstu po HTTP 403), NASA Moon Phases i NWS Lightning Safety Overview. Nowe źródła `s49`–`s53` obejmują FAO, Wody Polskie (portal do właściwego zarządcy i regulaminu — nie uniwersalny regulamin), NASA i NWS. Nie skopiowano hodowlanych dawek karmienia jako porady na zasiadkę.

Weryfikacja przed wdrożeniem: 97/97 unit/frontend/data PASS, w tym wykonanie rzeczywistego renderera PL/EN, brak pomiaru, safety stop, ponowny poprawny wybór i wszystkie kroki diagnostyki. JavaScript oraz git diff check PASS. Nowy `qa-knowledge` w Actions ma sprawdzić rzeczywisty preview PL/EN × 390/1280, 14 tematów, źródła/etykiety, niezmierzoną wodę, blokadę porady, pełne 8 kroków, brak polskich etykiet w wyniku EN i screenshoty. Cache `20261012-109`, loader `20261012-encyclopedia-2`; brak migracji D1 i zmian R2/danych użytkowników. Lokalny Chromium jest BLOCKED (brak prawidłowego pobrania binarium); live/Responsive muszą dostarczyć dowody na Actions.

Pliki Etapu 5: `.github/workflows/preview-final-batch.yml`, `public/data/knowledge/encyclopedia.json`, `public/data/knowledge/en/encyclopedia.json`, `public/data/knowledge/sources.json`, `public/data/knowledge/tools.json`, `public/data/knowledge/en/tools.json`, `public/knowledge.js`, `public/dream-loader-v2.js`, `public/sw.js`, `scripts/live-preview-offline.mjs`, `scripts/live-preview-knowledge.mjs`, `tests/knowledge-editorial.test.mjs`, `docs/modernization-2026-10-12.md`. Stan Etapu 5: IN PROGRESS — live NOT TESTED do zakończenia nowego CI. READY TO MERGE TO MAIN: NO.


Etap 5, `747c4c2` / run `38283192466`: 97/97 i Validate PASS; oba Responsive runy `38283198145`/`38283192450` PASS. Private checkpoint/integralność, brak nowych migracji, deployment i exact-build PASS. Read-only smoke FAIL `53 !== 48` — stara stała liczby źródeł nie uwzględnia pięciu nowych cytowań. Konta i pozostałe E2E poprawnie SKIPPED przez tę bramkę. Smoke teraz porównuje cały katalog z plikiem bieżącego checkoutu (nie tylko liczbę) i dodatkowo wymaga wszystkich 48 oryginalnych ID oraz unikalności. Nie wycofano nowych źródeł. Test żywego preview nadal oczekuje na nowy CI.
