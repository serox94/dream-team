# DreamTeam

Jedna aplikacja do wyjazdów wędkarskich na wiele lat.

Produkcja: https://dream-team.sewerynski00.workers.dev/

Źródłem produkcji jest `serox94/dream-team`. Repozytorium `serox94/ryby2026` pozostaje archiwum i źródłem wcześniejszych materiałów.

## Korzystanie

- **Wyjazdy i archiwum**: dodawanie wyjazdu, roku, terminu, uczestników, łowiska, kopiowanie checklisty, ustawienie aktywnego wyjazdu i archiwizacja.
- Lista w nagłówku wybiera oglądany wyjazd. Gwiazdka oznacza wspólny aktywny wyjazd. Sam podgląd nie zmienia aktywnego wyjazdu.
- Dane połowów, spotów i checklisty należą do wyjazdu. PB uwzględnia wszystkie lata i zapisany rekord sprzed aplikacji.
- Godziny są pokazywane w strefie czasowej łowiska. Brak terminu oznacza „termin do ustalenia”.
- Usunięcie wpisu można cofnąć od razu lub w panelu przywracania. Archiwizacja nie usuwa połowów.
- Panel pozwala pobrać kopię JSON całej bazy. Kopia zawiera również ukryte wpisy i historię importu.
- **Ustawienia**: kategorie checklisty, preferencje researchu, status offline i eksport. Zmiana nazwy kategorii przenosi także ukryte rekordy; usunięcie zajętej kategorii wymaga przeniesienia wpisów.
- **Łowiska**: profil i źródła są wspólne dla kolejnych wyjazdów. Kandydatów do nowej wody zatwierdza użytkownik. Fakty mają źródło, datę i status konfliktu; propozycje wyposażenia trafiają do checklisty dopiero po zatwierdzeniu.
- **Deeper**: instrukcje obejmują CHIRP+ 2 i Fish Deeper. Oficjalne ekrany otwierają się w dokumentacji Deeper, bez kopiowania obrazów do repozytorium.

## Uruchomienie i weryfikacja

Node.js 24, `npm ci`, `npm test`, `npm run build`.

`npm run dev` uruchamia standardowy serwer Wrangler. Najpierw zastosuj lokalne migracje poleceniem `npm run db:migrate:local`.

`npm run dev:qa` uruchamia lokalny podgląd z tym samym handlerem Worker i jednorazową bazą SQLite. Dane testowe znikają po zatrzymaniu procesu. Nie łączy się z produkcyjną bazą.

`/responsive-check.html` umożliwia kontrolę tych samych ekranów w ramce 360, 390 lub 1280 px. Jest narzędziem QA; nie jest emulatorem urządzenia mobilnego.

## Deployment i dane

- Cloudflare Workers: istniejący hosting i API; Cloudflare D1: istniejąca baza `dream-team-db`.
- Kod klienta i serwera nie łączy się z Supabase. Historyczny znacznik importu w D1 pozostaje w eksporcie jako część metadanych.
- `npm run deploy:production`: testy → przygotowanie assetów → deploy. Przy pierwszym żądaniu API nowy Worker przeprowadza addytywną migrację D1, zapisując również znacznik Wrangler.
- Migracja `0017` dodaje uczestników wyjazdu, podstawę PB i odzyskiwanie wpisów; nie usuwa oryginalnych rekordów.
- Migracja `0019` dodaje kategorie checklisty i źródła/fakty/historię researchu łowiska. Worker aktualizuje schemat przy pierwszym uwierzytelnionym żądaniu.
- Migracja `0020` dodaje limitowany dziennik wyszukiwania kandydatów przed utworzeniem profilu łowiska.
- Automatyczny provider Tavily jest opcjonalny. Bez sekretu `TAVILY_API_KEY` organizer i ręczne źródła działają normalnie. Klucz dodaje się wyłącznie jako Worker secret w darmowym planie z twardym limitem dostawcy; nie zapisuj go w repo, przeglądarce ani logach. Aplikacja rezerwuje najwyżej 8 kredytów na łowisko i 900 miesięcznie globalnie oraz odrzuca ponowienie przez 10 minut. Darmowy limit Tavily zależy od konfiguracji konta, więc przed dodaniem klucza trzeba potwierdzić brak płatnego overage. Cloudflare Workers AI nie jest włączone; ekstrakcja działa deterministycznie bez modelu.
- Codzienny cron Workera sprawdza łowiska z nadchodzącym terminem około 30 i 7 dni przed wyjazdem, gdy provider jest skonfigurowany i research jest włączony. Porównuje zapisane wartości z aktualną ekstrakcją i zapisuje różnice.
- GitHub Actions sprawdza testy, migracje i build. Wdrożenie wykonuje istniejące połączenie Cloudflare z gałęzią `main`.
- Przed ręcznymi migracjami zewnętrznymi zawsze pobierz eksport i zweryfikuj kopię. Nie uruchamiaj ponownie starego importera Supabase z opcją wymuszonego czyszczenia.
- Aplikacja i API są chronione sesją Workera. Codzienny eksport D1 do prywatnego R2 o 03:17 UTC jest aktywny i sprawdzany przez workflow kontroli kopii. Pierwszą kopię sprawdzono również przez odtworzenie do osobnej bazy. Szczegóły: [backup i dostęp](docs/BACKUP-AND-ACCESS.md).

Szczegóły: [architektura](ARCHITECTURE.md), [audyt](docs/AUDIT-2026-09-28.md).
