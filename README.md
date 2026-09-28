# RYBY / Dream Team

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
- GitHub Actions sprawdza testy, migracje i build. Wdrożenie wykonuje istniejące połączenie Cloudflare z gałęzią `main`.
- Przed ręcznymi migracjami zewnętrznymi zawsze pobierz eksport i zweryfikuj kopię. Nie uruchamiaj ponownie starego importera Supabase z opcją wymuszonego czyszczenia.
- Ochrona zapisów i osobny codzienny eksport D1 do R2 są przygotowane. Wymagają skonfigurowania sekretów i zasobnika w Cloudflare; szczegóły: [backup i dostęp](docs/BACKUP-AND-ACCESS.md). Samo wdrożenie kodu nie aktywuje ochrony ani harmonogramu.

Szczegóły: [architektura](ARCHITECTURE.md), [audyt](docs/AUDIT-2026-09-28.md).
