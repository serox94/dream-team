# DreamTeam — runda 2 po odbiorze Preview

Kontynuacja jednej gałęzi `feat/preview-carp-trip-modernization-20261105` od
opublikowanego `75ae1f1a599b5bfe0bd8e736c543e4dca060f4d8`.
Lokalną historyczną dokumentację przekazania połączono ze zdalną historią tej
samej gałęzi, bez force-pusha, nowego PR ani zmian main/PR #28.

**Nie wdrożono tej rundy na Preview. Nie jest to raport PREVIEW READY.**
Adres Preview nadal jest blokowany w tej sesji przez proxy (CONNECT HTTP 403),
nie ma przypisanych sekretów Cloudflare. Nie obchodzono tych ograniczeń.

## Poprawki

1. **Encyklopedia/Deeper:** wyniki są bezpośrednim sąsiadem pola wyszukiwania,
   z liczbą, tytułem i opisem. Niepowiązane sekcje chowają się podczas szukania.
   Kliknięcie otwiera konkretny artykuł z uwzględnieniem wysokości nagłówka.
   Kolejne zapytanie wraca do widocznego pola i listy. Trafienia w tytułach mają
   pierwszeństwo przed samym wystąpieniem w treści. PL/EN i normalizacja polskich
   znaków pozostają obsługiwane; wyczyszczenie zapytania przywraca narzędzia.
2. **Checklisty:** całkowicie usunięto przycisk Pokaż ukryte. Kategorie z
   istniejącymi pozycjami są dostępne bez tego przełącznika, również nieaktywne.
   Nie kasowano kategorii ani pozycji. Filtry osób nadal wynikają z uczestników
   wyjazdu i nie dołączają wspólnych pozycji do filtra osoby.
3. **Stany danych:** przed odczytem są kreski i informacja o ładowaniu; błąd
   odczytu nie jest pustą listą. Licznik podaje nazwę wyjazdu i pełną liczbę jego
   pozycji niezależnie od filtra. Pusta odpowiedź ma jednoznaczny opis kontekstu.
   Nieprawidłowy format odpowiedzi jest błędem. Starsza równoległa odpowiedź nie
   może nadpisać nowszego odczytu. Nie wykonuje się fallbacku do danych innej wyprawy.
4. **Pogoda PRO:** nowy układ temperatury, wiatru/opadów, bezpieczeństwa i okna
   aktywności, mocniejsza hierarchia kart, czytelniejsze dni/godziny i wykresy.
   Szczegółowy rozkład punktacji jest zamknięty w rozwijanej sekcji; analityka
   zachowana. Alert jest widoczny wysoko niezależnie od statusu. Zmieniono tylko
   prezentację; funkcje obliczeń, źródła, prognozy, punkty i warunki bezpieczeństwa
   nie zostały zmienione. `carp-index.js`, `weather-conditions.js`,
   `weather-fishing-insights.js` i `src/weather.js` są bez zmian względem 75ae1f1.
5. **Wyjazdy:** lista, edycja i zarządzanie łowiskiem to odrębne widoki z powrotem
   do listy. Archiwum/zakończone i działania karty są rozwijane. Usunięto duplikat
   karty terenowej w tym widoku. Materiały źródłowe i propozycje administracyjne
   nie pojawiają się na zwykłej liście. Automatyczny wybór profilu nie dopisuje
   już lakeId do URL; jawne wybranie profilu nadal ma poprawny link.
6. **Menu/nagłówek:** kompaktowy panel z grupami Wyprawa/Nad wodą/Wiedza/Konto,
   zamknięciem, Escape i zamknięciem poza panelem. Dolna nawigacja pozostała.
   Podczas przewijania mobilny nagłówek zwija dodatkowy wiersz, zachowując wybór
   wyjazdu i ważne kontrolki. Żaden link nawigacyjny nie został usunięty.
7. **Start:** wyniki uczestników, przygotowanie, pogoda, ostatni połów i działania
   pozostają na głównym widoku. Dodatkowe statystyki, wykresy i powtarzające się
   skróty są w rozwijanych szczegółach. Nie kasowano statystyk ani ich danych.
8. **Stabilność/PWA:** formularze nie wysyłają danych przed ukończeniem bootstrapu.
   Cache powłoki ma nową wersję i obejmuje nowy moduł prezentacji. Kolejka zapisów
   offline i izolacja kont pozostają w istniejącym mechanizmie, bez czyszczenia.

Nowy `round-two-ui.js` przenosi istniejące węzły z zachowaniem handlerów; nie
zastępuje warstwy danych ani nie wprowadza nowego routera/modelu aplikacji.
Nie uruchamiano Tavily. Nie dodano migracji, cleanupu zdalnego ani nowych środowisk.

## Dowody lokalne

- Pełny `npm test`: **321 PASS / 0 FAIL**.
- `npm run build`: **PASS**, wrangler deploy **--dry-run**; brak deploymentu.
- `scripts/qa-round-two.mjs`: rzeczywisty Chromium, **32 przypadki wyszukiwania**
  (zielsko, muł, temperatura, twardość × dwa moduły × PL/EN × 390/1440 px).
  Test mierzy, czy pierwszy wynik jest pod polem i nad dolną nawigacją, a nie
  tylko w DOM. Następnie klika wynik i sprawdza widoczny artykuł poniżej nagłówka.
- **15 pozostałych interakcji**: rozwijanie statystyk/wykresów; osobne widoki
  tworzenia i edycji wyjazdu, zarządzania łowiskiem i powrotu; 48 h i punktacja;
  checklisty; menu; EN; wolny bootstrap/formularz; opóźniony odczyt checklisty;
  kompletna nowa powłoka offline (113 zasobów, 0 braków), odczyt i synchronizacja
  odhaczenia po powrocie sieci.
- **62 zrzuty**: porównanie kodu 75ae1f1 z nową wersją na identycznych lokalnych
  danych, 390/1440 px; dodatkowe ujęcia EN. Wyniki i PNG: `qa-round-two/`.
- Baseline był odłączonym lokalnym checkoutem do porównania, nie nową gałęzią
  funkcjonalną i nie nowym środowiskiem Cloudflare.

Uruchomienie (istniejący systemowy Chromium i Playwright):

```sh
DREAMTEAM_PLAYWRIGHT_MODULE=/tmp/dreamteam-browser/node_modules/playwright/index.mjs DREAMTEAM_CHROMIUM_PATH=/usr/bin/chromium DREAMTEAM_BASELINE_ROOT=/tmp/dreamteam-round2-before node scripts/qa-round-two.mjs
```

Baseline jest opcjonalny; bez niego wykonywane są sprawdzenia aktualnej wersji.
Wszystkie dane w tych testach są jednorazowym lokalnym SQLite.

## Niewykonane: rozstrzygnięcie zdalnego zgłoszenia „0 z 0”

Prześledzono kod: odczyt `/api/checklist?tripId=…` jest per wyjazd; suma jest
liczona PRZED filtrowaniem osoby/statusu. Ukryta kategoria sama nie wyjaśnia
zerowego globalnego licznika. Poprawiono realne błędy stanów ładowania/błędu
oraz brak kontekstu pustej listy. **Nie stwierdzono ani nie założono utraty danych.**
Bez dostępu do rzeczywistego Preview nie potwierdzono, który wyjazd/API/cache
spowodował zgłoszenie na telefonie. Ta część pozostaje do sprawdzenia przez Work.

Work powinien najpierw, tylko do odczytu:

1. Na urządzeniu z objawem zapisać nazwę/ID wybranego wyjazdu, ID z selecta,
   `DREAM_TRIP.id`, `Dream.readTrip()`, tripId w URL i aktywny wyjazd bootstrapu.
2. Sprawdzić status, kształt i liczbę `items` dokładnie tej odpowiedzi
   `/api/checklist?tripId=…`; zanotować online/offline i aktywne filtry.
3. Porównać z liczbami D1 WYŁĄCZNIE istniejącego Preview, np.:

```sql
SELECT t.id,t.name,t.status,t.is_active,
       COUNT(c.id) AS items,
       COALESCE(SUM(CASE WHEN c.packed=1 THEN 1 ELSE 0 END),0) AS packed
FROM trips t
LEFT JOIN checklist_items c ON c.trip_id=t.id AND c.deleted_at IS NULL
GROUP BY t.id,t.name,t.status,t.is_active
ORDER BY t.is_active DESC,t.name;
```

4. Sprawdzić wersję kodu/SW (`ryby-shell-20261105-round2-1`) i kompletność cache.
   Nie czyścić localStorage/kolejki offline ani danych witryny, by wymusić wynik.
5. Jeżeli wybrano pusty wyjazd QA zamiast wyjazdu z historią, potwierdzić to
   liczbami i wyborem użytkownika. Nie usuwać QA ani historii i nie zmieniać
   globalnie aktywnej wyprawy bez zgody. Jeśli API zwraca pozycje, a UI zero,
   zachować diagnostykę błędu/cache i wrócić z konkretnym przypadkiem.

## Przekazanie wdrożenia do Work

Użyć tej SAMEJ gałęzi i tylko istniejącego `dream-team-preview`. Przed zmianami
ponownie zweryfikować WSZYSTKIE bindingi i świeży backup D1/R2 według
[PREVIEW_HANDOFF.md](PREVIEW_HANDOFF.md), punktów 1–4. Historyczna sekcja importu
bundle z rundy 1 nie jest potrzebna, jeżeli gałąź jest już dostępna w GitHub.
Nie używać konfiguracji produkcyjnej do wdrożenia. Nie wykonywać migracji,
czyszczenia baz ani usuwania testowych wyjazdów. Nie zmieniać main ani PR #28.

Po wdrożeniu powtórzyć powyższe cztery hasła i kliknięcia na rzeczywistym Preview,
sprawdzić licznik na telefonie właściciela, wolną sieć, aktualizację z poprzedniej
PWA, offline i PL/EN. Zebrać SHA, wersję Workera i zrzuty z prawdziwego adresu.
Dopiero ta weryfikacja może dać PREVIEW READY.

## Wybrane porównania (lokalny Chromium, dane testowe)

| Widok | Przed (75ae1f1) | Po |
|---|---|---|
| 390px · pl-sonar-zielsko | [PNG](round-two-shots/before-390-pl-sonar-zielsko.png) | [PNG](round-two-shots/after-390-pl-sonar-zielsko.png) |
| 390px · pl-encyklopedia-zielsko | [PNG](round-two-shots/before-390-pl-encyklopedia-zielsko.png) | [PNG](round-two-shots/after-390-pl-encyklopedia-zielsko.png) |
| 1440px · pl-sonar-zielsko | [PNG](round-two-shots/before-1440-pl-sonar-zielsko.png) | [PNG](round-two-shots/after-1440-pl-sonar-zielsko.png) |
| 1440px · pl-encyklopedia-zielsko | [PNG](round-two-shots/before-1440-pl-encyklopedia-zielsko.png) | [PNG](round-two-shots/after-1440-pl-encyklopedia-zielsko.png) |
| 390px · weather | [PNG](round-two-shots/before-390-weather.png) | [PNG](round-two-shots/after-390-weather.png) |
| 1440px · weather | [PNG](round-two-shots/before-1440-weather.png) | [PNG](round-two-shots/after-1440-weather.png) |
| 390px · menu | [PNG](round-two-shots/before-390-menu.png) | [PNG](round-two-shots/after-390-menu.png) |
| 390px · trips | [PNG](round-two-shots/before-390-trips.png) | [PNG](round-two-shots/after-390-trips.png) |
| 390px · home | [PNG](round-two-shots/before-390-home.png) | [PNG](round-two-shots/after-390-home.png) |

Pełne pomiary: [round-two-verification.json](round-two-verification.json). Pełna paczka 62 PNG jest w `qa-round-two/evidence.zip`.
