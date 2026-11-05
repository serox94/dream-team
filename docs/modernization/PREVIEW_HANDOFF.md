# Przekazanie wdrożenia do Work — wyłącznie istniejące Preview

Status: **NIE WDROŻONO / NIE PREVIEW READY**. Sesja Codex nie ma przypisanych
sekretów Cloudflare ani dostępu sieciowego do API Cloudflare i wskazanego Preview.
Nie obchodzono ograniczeń przez Actions, inne tokeny ani dodatkowe środowisko.
Lokalny Chromium/SQLite nie jest dowodem działania wdrożonego Preview.

Gałąź: `feat/preview-carp-trip-modernization-20261105`, od
`e1dfde72b74aa005021330dfee52c9d0ad2c17e9` (aktualny main przy rozpoczęciu).
Nie używać PR #28, nie scalać do main i nie wdrażać `dream-team`.

## 0. Pobranie kodu

Publikacja gałęzi została odrzucona przez serwer Git (`commit_refs_rules`).
Zaimportować `implementation.bundle` z paczki przekazania według README,
zweryfikować bazę i diff; nie pobierać kodu z PR #28 ani nie używać force-push.

## 1. Odczyt tożsamości i konfiguracji — bez zmian zdalnych

1. Potwierdzić dostęp Work do właściwego konta i **istniejącego** Workera
   `dream-team-preview`. Zapisać aktywny UUID wersji jako punkt powrotu.
2. Odczytać aktualne settings/bindings i pełne metadane aktywnej wersji.
   DB musi wskazywać istniejące `dream-team-preview-db`, MEDIA — istniejące
   `dream-team-preview-media`. Zweryfikować UUID D1 po API, nie tylko nazwę.
3. Odrzucić konfigurację wskazującą produkcyjny UUID D1
   `b64c7a2c-8694-41c6-b54a-857b88bf2c96`, `dream-team-db`,
   `dream-team-media`, `dream-team-d1-backups`, produkcyjne service bindings
   lub niepotwierdzone zasoby. Sprawdzić WSZYSTKIE bindingi, także dodatkowe.
4. Zachować istniejące ustawienia Preview, konta, sekrety, flagi AI i języków.
   APP_ENV musi być `preview`, INDIVIDUAL_ACCOUNTS — `true`, APP_BUILD — SHA
   zatwierdzonego kodu. Nie kopiować produkcyjnego wrangler.jsonc do deploymentu.
5. Sprawdzić schemat D1 (kod wymaga 32), registry migracji i stan maintenance.
   Ta gałąź nie dodaje migracji. Przy innym schemacie zatrzymać wdrożenie;
   nie wykonywać automatycznie wszystkich historycznych migracji.

Brak uprawnień do któregokolwiek odczytu oznacza BLOCKED. Nie uruchamiać
provisioningu ani fallbacku tworzącego bazę/bucket. W szczególności istniejący
`scripts/preview-config.mjs` potrafi tworzyć brakujące zasoby — nie jest
zamiennikiem tego sprawdzenia. Nie zajmować dodatkowego slotu D1.

## 2. Świeży, zweryfikowany backup PRZED zmianami

1. Wyeksportować pełną D1 Preview do prywatnego miejsca poza public/assets.
   Zachować schemat, dane, registry migracji, triggery i sqlite_sequence.
   Zapisać SHA256, liczbę bajtów, UUID źródła, czas i wyniki kontroli.
2. Odtworzyć eksport do tymczasowego **lokalnego** SQLite/D1. Sprawdzić
   integralność, foreign_key_check, zestaw tabel, liczniki rekordów i sekwencje.
   Nie używać historycznej ani nowej zdalnej bazy jako celu próby.
3. Pobrać pełny paginowany inventory R2 Preview. Skopiować każdy obiekt do
   prywatnego backupu wraz z kluczem, metadanymi HTTP/custom i rozmiarem.
   Zweryfikować SHA256 pobranych bajtów; sam ETag nie zastępuje SHA256.
4. Powtórzyć odczyt inventory/metadanych i porównać ze stanem przed kopią.
   Udokumentować kompletność i próbę odczytu/odtworzenia kopii lokalnej.
   Przy równoległych zapisach, brakujących obiektach lub braku list/read
   backup jest NIEZWERYFIKOWANY i wdrożenie pozostaje BLOCKED.
5. Nie tworzyć kopii wewnątrz tego samego bucketu przed zakończeniem backupu.
   Nie usuwać ani nadpisywać oryginałów; nie raportować PASS dla samego exportu.

## 3. Wdrożenie istniejącego Workera

Po spełnieniu punktów 1–2 Work może użyć swojego istniejącego kontrolowanego
procesu deploymentu, z konfiguracją odtworzoną z ODCZYTANYCH bindingów Preview
oraz dokładnym SHA tej gałęzi. Build lokalny: `npm ci`, `npm test`, `npm run build`
(ostatnia komenda zawiera wyłącznie wrangler deploy --dry-run).

Przed aktywacją ponownie potwierdzić nazwę Workera, UUID D1, wszystkie R2,
sekrety bez ujawniania wartości, zmienne, flagi, brak produkcyjnych cronów/routes.
Nie ma powodu uruchamiać SQL migracyjnego ani przetwarzania Tavily.
Przy zmianie aktywnej wersji lub bindingów przez innego operatora przerwać.

## 4. UAT na rzeczywistym adresie

Tylko `https://dream-team-preview.sewerynski00.workers.dev/`:

- Logowanie każdego istniejącego konta, PL/EN, urządzenie mobilne i desktop.
- Wybrać inny wyjazd, otworzyć „Najważniejsze nad wodą”, przejść do kolejnej
  zakładki i potwierdzić, że nadal wybrany jest ten sam wyjazd.
- Checklisty: formularz/podsumowanie u góry; Wszystko/uczestnicy/Wspólne;
  Paddy z własnym kontem; wyszukiwanie bez polskich znaków; ukryte kategorie;
  odhaczanie, offline i synchronizacja dokładnie jednej zmiany po reconnect.
- Połów: sześć pól, zachowanie starej notatki po korekcie wagi, połączenie ze
  spotem, statystyki. Spot: pięć pól, zachowane stare GPS/rig/roślinność/notatki
  historyczne i powiązane połowy. Używać oznaczonego wyjazdu testowego.
- Sonar/encyklopedia: treść artykułów, PL/EN i zapytania w obu językach,
  atlas/quiz/narzędzia. Brak interfejsu uploadu/analizy screenshotów;
  istniejące obiekty D1/R2 muszą pozostać nienaruszone.
- Pogoda: te same obliczenia i ostrzeżenia, 24/48 h, wszystkie zwrócone dni,
  temperatura wody i wykresy, brak overflow przy 390 i 1280 px.
- Nowe łowisko bez źródeł → nowy wyjazd → późniejsze ręczne uzupełnienie
  profilu → aktualizacja zakładek. Brak nowych jobs/wywołań Tavily.
  Archiwizacja musi zachować profil sprzed kolejnej aktualizacji łowiska.
- Brak surowych duplikatów researchu w normalnych zakładkach; źródła i
  zatwierdzone regulaminy pozostają dostępne. Nie usuwać danych historycznych.

Zebrać SHA, UUID wersji, raport bindingów/backupów, wyniki interakcji i nowe
zrzuty desktop/mobile z TEGO adresu. Dopiero wtedy można zgłosić PREVIEW READY.
W razie błędu przywrócić zapisaną poprzednią wersję Workera; ta zmiana nie ma
migracji, więc nie wykonywać destrukcyjnego rollbacku danych.
