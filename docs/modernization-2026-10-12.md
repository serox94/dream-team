# Modernizacja DreamTeam — stan i kontynuacja

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
