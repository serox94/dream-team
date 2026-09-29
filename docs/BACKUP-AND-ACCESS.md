# Prywatny dostęp i kopie D1

## Stan i zasada wdrożenia

Produkcja korzysta z Cloudflare Worker `dream-team` i D1 `dream-team-db`. Audyt 29.09.2026 potwierdził backend D1 `production` i działające bookmarki Time Travel sprzed 6, 8 i 20 dni. Cloudflare podaje retencję 30 dni na Workers Paid i 7 dni na Free; działający bookmark sprzed 20 dni potwierdza dłuższe okno dla tej bazy. Nie wykonuj testowego restore na produkcyjnej D1.

Worker chroni aplikację, wszystkie zasoby poza `/login`, `/login.html`, `/login.css` i `/login.js`, oraz całe `/api/*`. Cloudflare Static Assets musi mieć `run_worker_first: true`. Formularz `/api/login` jest jedynym publicznym endpointem API. Działa jeden wspólny login i hasło, bez kont i poczty. `RYBY_LOGIN_USERNAME`, `RYBY_LOGIN_PASSWORD` oraz `RYBY_SESSION_SECRET` (minimum 32 znaki) to sekrety runtime Workera, przekazywane z GitHub Actions. Nie wpisuj ich do repozytorium ani do logów. Sekrety administracyjne `CLOUDFLARE_API_TOKEN` i `CLOUDFLARE_ACCOUNT_ID` służą tylko do deploymentu.

Udane logowanie ustawia podpisane cookie `__Host-ryby_session`, `HttpOnly; Secure; SameSite=Lax; Path=/`, ważne przez 730 dni i odnawiane przy korzystaniu z aplikacji. Losowy identyfikator sesji jest przechowywany w D1 wyłącznie jako skrót SHA-256. Zmiana hasła, loginu lub sekretu sesji unieważnia wszystkie sesje. Wylogowanie usuwa sesję z D1, więc skopiowane stare cookie nie działa. Hasło nigdy nie trafia do JavaScript ani pamięci przeglądarki. Limiter prób logowania dopuszcza osiem błędów na 15 minut z danego adresu IP. Na ekranie zarządzania wyjazdami jest przycisk „Wyloguj”.

Wdrożenie powinno najpierw sprawdzić obecność trzech sekretów GitHub Actions (bez odczytywania ich wartości), wdrożyć je jako sekrety Workera, przetestować kod lokalnie oraz build i dopiero uruchomić nową wersję. Zachowaj identyfikator wcześniejszej wersji Workera i commit do rollbacku. Po wdrożeniu sprawdź ścieżki bez sesji, błędny i poprawny login, ponowne otwarcie, odczyt, odmowę zapisu i eksportu bez sesji, eksport w sesji oraz wylogowanie. Nie dodawaj próbnych rekordów do produkcyjnej D1. Bez skonfigurowanych sekretów Worker zwraca 503 zamiast ujawniać prywatne dane.

## Niezależny backup R2

Oddzielny Worker `backup/` jest wdrożony z prywatnym R2 `dream-team-d1-backups`. Harmonogram `17 3 * * *` oznacza codziennie 03:17 UTC. R2 jest aktywne, a reguła `dream-team-retention-30d` usuwa obiekty `dream-team-db/` po 30 dniach. Kopia `dream-team-db/2026-09-29T12-13-16-112Z-0e481542-e52a-4da8-93be-376e57a4d2a4.sql` z 29.09.2026 o 12:13 UTC ma 109657 bajtów. Weryfikator sprawdził niepusty eksport w prywatnym R2, a restore do osobnej tymczasowej D1 porównał liczby rekordów w dziewięciu tabelach z produkcją. Wynik PASS; tymczasową D1 usunięto. Wcześniejsza kopia z 06:31 UTC ma 109082 bajty i również przeszła test odtworzenia.

Codzienny Worker ma osobny sekret runtime `D1_EXPORT_TOKEN` oraz binding R2. Token z uprawnieniem `Account → D1 → Edit`, ograniczony do właściwego konta, przeszedł pełen `POST /export` w Actions oraz zadziałał w Workerze. Samo D1 Read wcześniej zwracało `401` przy eksporcie. Szeroki token administracyjny służy tylko do wdrożeń przez Actions i nie jest sekretem runtime Workera backupu.

Cron jest wdrożony i aktywny; pierwsze wykonanie z harmonogramu 03:17 UTC nastąpi następnego dnia. Workflow `Deploy and verify D1 backup` można uruchomić ręcznie po zmianie kodu lub tokenu; wyzwala kopię i odtwarza ją wyłącznie do tymczasowej D1. Reguła R2 jest aktywna i prywatna; około 30 kopii będzie dostępnych po 30 udanych wykonaniach dziennych. Nie włączaj publicznej domeny R2. Monitoruj pierwsze uruchomienie crona, ponieważ sam test ręczny nie dowodzi jeszcze dostarczenia zdarzenia scheduled.

## Odtworzenie

Najpierw zachowaj bieżący stan i wybierz punkt Time Travel w dostępnym oknie. Jeśli to nie wystarczy, wybierz sprawdzony plik `.sql` w R2, utwórz osobną D1 i zaimportuj go tam. Porównaj liczby w tabelach, wyjazdy, połowy, checklisty i rekordy usunięte logicznie; sprawdź aplikację na testowym bindingu. Dopiero po weryfikacji skieruj produkcyjny binding na odtworzoną bazę. Zachowaj starą D1 i poprzednią wersję Workera do zakończenia kontroli. Time Travel na produkcyjnej D1 nadpisuje dane, więc wymaga osobnej decyzji o momencie przywrócenia.
