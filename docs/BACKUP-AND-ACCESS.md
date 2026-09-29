# Prywatny dostęp i kopie D1

## Stan i zasada wdrożenia

Produkcja korzysta z Cloudflare Worker `dream-team` i D1 `dream-team-db`. Audyt 29.09.2026 potwierdził backend D1 `production` i działające bookmarki Time Travel sprzed 6, 8 i 20 dni. Oznacza to w praktyce co najmniej 20 dni dostępnej historii; długości abonamentowej retencji nie udało się odczytać bez uprawnienia `Billing Read`. Nie wykonuj testowego restore na produkcyjnej D1.

Worker chroni aplikację, wszystkie zasoby poza `/login`, `/login.html`, `/login.css` i `/login.js`, oraz całe `/api/*`. Cloudflare Static Assets musi mieć `run_worker_first: true`. Formularz `/api/login` jest jedynym publicznym endpointem API. Działa jeden wspólny login i hasło, bez kont i poczty. `RYBY_LOGIN_USERNAME`, `RYBY_LOGIN_PASSWORD` oraz `RYBY_SESSION_SECRET` (minimum 32 znaki) to sekrety runtime Workera, przekazywane z GitHub Actions. Nie wpisuj ich do repozytorium ani do logów. Sekrety administracyjne `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` służą tylko do deploymentu.

Udane logowanie ustawia podpisane cookie `__Host-ryby_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, ważne przez 730 dni i odnawiane przy korzystaniu z aplikacji. Losowy identyfikator sesji jest przechowywany w D1 wyłącznie jako skrót SHA-256. Zmiana hasła, loginu lub sekretu sesji unieważnia wszystkie sesje. Wylogowanie usuwa sesję z D1, więc skopiowane stare cookie nie działa. Hasło nigdy nie trafia do JavaScript ani pamięci przeglądarki. Limiter prób logowania dopuszcza osiem błędów na 15 minut z danego adresu IP. Na ekranie zarządzania wyjazdami jest przycisk „Wyloguj”.

Wdrożenie powinno najpierw sprawdzić obecność trzech sekretów GitHub Actions (bez odczytywania ich wartości), wdrożyć je jako sekrety Workera, przetestować kod lokalnie oraz build i dopiero uruchomić nową wersję. Zachowaj identyfikator wcześniejszej wersji Workera i commit do rollbacku. Po wdrożeniu sprawdź ścieżki bez sesji, błędny i poprawny login, ponowne otwarcie, odczyt, odmowę zapisu i eksportu bez sesji, eksport w sesji oraz wylogowanie. Nie dodawaj próbnych rekordów do produkcyjnej D1. Bez skonfigurowanych sekretów Worker zwraca 503 zamiast ujawniać prywatne dane.

## Niezależny backup R2

Oddzielny Worker `backup/` eksportuje D1 do prywatnego R2 `dream-team-d1-backups`. Harmonogram `17 3 * * *` oznacza codziennie 03:17 UTC. Workflow sprawdza, że eksport SQL jest gotowy i niepusty; każdy udany eksport ma odrębną nazwę. Przed aktywacją potrzeba włączonej usługi R2. API R2 poprzednio zwróciło `403 NotEntitled (10042)`, więc bucketu nie można utworzyć samym deploymentem, jeśli stan usługi się nie zmienił.

Worker backupu wymaga osobnego tokenu runtime `D1_EXPORT_TOKEN`, ograniczonego do `Account → D1 → Read` na właściwym koncie, oraz identyfikatora konta. Szeroki token administracyjny GitHub Actions nie może stać się credentialem runtime. Binding `BACKUP_BUCKET` wskazuje prywatny bucket. Reguła lifecycle powinna usuwać obiekty pod prefiksem `dream-team-db/` po 30 dniach; przy jednym udanym eksporcie dziennie będzie około 30 kopii. Włączenie reguły dopiero po sprawdzeniu pierwszej poprawnej kopii. Nie włączaj publicznej domeny R2.

## Odtworzenie

Najpierw zachowaj bieżący stan i wybierz punkt Time Travel w dostępnym oknie. Jeśli to nie wystarczy, wybierz sprawdzony plik `.sql` w R2, utwórz osobną D1 i zaimportuj go tam. Porównaj liczby w tabelach, wyjazdy, połowy, checklisty i rekordy usunięte logicznie; sprawdź aplikację na testowym bindingu. Dopiero po weryfikacji skieruj produkcyjny binding na odtworzoną bazę. Zachowaj starą D1 i poprzednią wersję Workera do zakończenia kontroli. Time Travel na produkcyjnej D1 nadpisuje dane, więc wymaga osobnej decyzji o momencie przywrócenia.
