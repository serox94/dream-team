# DreamTeam — modernizacja wypraw i istniejącego Preview

Gałąź: `feat/preview-carp-trip-modernization-20261105`.
Baza: main `e1dfde72b74aa005021330dfee52c9d0ad2c17e9`.
PR #28 nie był używany ani zmieniany. Nie scalano do main.
**Status wdrożenia: NIE WDROŻONO. Nie PREVIEW READY.**

## Wykonane funkcje A–I

| Zakres | Zmiana |
|---|---|
| A. Start | Wyraźny mobilny przycisk otwiera informacje konkretnego wybranego wyjazdu. Parametr tripId ma pierwszeństwo przed poprzednim wyborem urządzenia i zapisuje wybór dla kolejnych zakładek. |
| B. Połowy | Formularz ma osobę, gatunek, wagę, przynętę, spot z mapy i datę/godzinę. Usunięto pola tekstowego spotu i notatki. Edycja nie kasuje starych notatek ani starego tekstowego spotu. |
| C. Checklisty | Formularz i podsumowanie nad listą. Dynamiczne Wszystko / uczestnicy / Wspólne; filtr osoby nie dodaje wspólnych. Wyszukiwanie obejmuje treść, tłumaczenie, właściciela i notatki, toleruje brak polskich znaków i ujawnia trafienia w zwiniętych/ukrytych kategoriach. Pokaż ukryte ma aria-pressed. |
| D. Pogoda PRO | Lifting typografii, kart, indeksu warunków, prognoz godzinowych i siedmiodniowych, odstępów, focusu i układu mobilnego. Zmiany wyłącznie CSS; silnik prognozy, punktacja i ostrzeżenia nie zostały zmienione. |
| E. Mapy | Formularz ma pięć pól: nazwa, odległość, głębokość, dno, notatka. Usunięto kartę szkicu. Zachowano listę, statystyki skuteczności, połączenia z połowami i stare dane zaawansowane przy edycji. |
| F. Sonar | Wyszukiwanie pełnej treści CHIRP+ 2, także zapytaniami w drugim języku. Usunięto interfejs własnych screenshotów i ich analizy; zachowano atlas referencyjny, quiz, podręcznik i narzędzia. Endpointy i dane D1/R2 nie zostały usunięte. |
| G. Encyklopedia | Wyszukiwanie pełnej treści PL/EN, bez zależności od łowiska; wyniki artykułów są otwierane. Baza wiedzy pozostaje dostępna również bez wyjazdu. Zachowano istniejącą wiedzę i narzędzia; dalsza rozbudowa ma osobny plan redakcyjny. |
| H. Research | Usunięto powielane automatyczne bloki źródłowe z Dojazdu, Map i Porad. Materiały profili łowisk w Wyjazdach są w wydzielonym zwijanym miejscu do weryfikacji. Rozpoznane techniczne surowe raporty nie są zwykłymi poradami; zachowano regulaminy i dokumenty potwierdzonych danych. Istniejący regulamin nie jest już zestawiany z komunikatem o jego braku. |
| I. Kolejne sezony | Nowe łowisko można zapisać bez researchu i źródeł, wyjazd wybiera je wraz z terminem, osobami i stanowiskiem. Zapis URL nie uruchamia dostawcy. Nowe wyjazdy ani harmonogram nie inicjują Tavily. Ręcznie zatwierdzony profil aktualizuje bieżące wyprawy; archiwizacja utrwala osobną wersję i późniejsze zmiany łowiska nie nadpisują historii. |

Pozostał jeden wspólny model checklisty i istniejące konta. Test Paddy'ego
obejmuje faktyczne logowanie, dodanie i odhaczenie jego pozycji w tej samej
checkliście. Nie zmieniano polityki haseł, limitów kont ani architektury D1/R2.
Nie dodano nowego modelu AI ani osobnych stron dla kolejnych lat.
Nie dodano migracji ani automatycznej przebudowy istniejących danych.
Jawnie uruchamiane narzędzia przygotowania źródeł pozostają dostępne;
wyłączono automatyczne rozpoczynanie researchu, nie kasowano jego historii.

## Testy i dowody lokalne

- `npm test`: **316 PASS, 0 FAIL**. Istniejące regresje obejmują również konta,
  autoryzację, offline, synchronizację, konflikty wersji, statystyki, mapy,
  pogodę, tłumaczenia i historyczne dane. Testy starych formularzy dostosowano
  do nowego interfejsu, zachowując sprawdzenie zapisu/edycji/bezpieczeństwa.
- `npm run build`: PASS, lokalny build + **wrangler deploy --dry-run**.
  Nie był to deployment. Domyślna konfiguracja w repo zawiera produkcyjne
  nazwy — nie wolno użyć jej do wdrożenia Preview.
- `scripts/qa-modernization.mjs`: prawdziwy lokalny Chromium, **14 scenariuszy
  PASS**, szerokości 390 i 1280 px, PL/EN, **28 zrzutów ekranów**.
  Każda instancja używa jednorazowego lokalnego SQLite i danych testowych.
- Wyniki i PNG: katalog `qa-modernization/` (celowo poza historią git),
  `results.json`, paczka `evidence.zip`. Skrypt odtwarza komplet dowodów.
- Nie uruchamiano tych testów na prawdziwym Preview. Nie zgłoszono live PASS.

Odtworzenie Chromium (gdy nie jest zainstalowany w repo):

```sh
npm install --prefix /tmp/dreamteam-browser --cache /tmp/dreamteam-npm-cache --no-audit --no-fund playwright@1.56.1
DREAMTEAM_PLAYWRIGHT_MODULE=/tmp/dreamteam-browser/node_modules/playwright/index.mjs DREAMTEAM_CHROMIUM_PATH=/usr/bin/chromium node scripts/qa-modernization.mjs
```

W środowisku z Playwright i jego przeglądarką wystarczy
`node scripts/qa-modernization.mjs`. Ustawienie ścieżki systemowego Chromium
jest potrzebne tylko tam, gdzie używana jest już zainstalowana przeglądarka.

## Znalezione i naprawione błędy

1. Trafienie wyszukiwarki mogło pozostać w zwiniętej lub ukrytej kategorii.
2. Odhaczenie istniejącego elementu ukrytej kategorii było odrzucane przez API.
   Nowych pozycji nadal nie można tworzyć w nieaktywnej kategorii.
3. Link do informacji wyprawy nie niósł tożsamości wyjazdu; stary wybór
   urządzenia mógł przywrócić inny kontekst podczas nawigacji.
4. Formularze mogły nadpisać historyczne pola wartościami pustymi po ich
   usunięciu z interfejsu. Aktualizacje pomijają teraz te pola.
5. Pusty profil łowiska był zamrażany przy tworzeniu przyszłego wyjazdu,
   więc późniejsza zweryfikowana wiedza nie docierała do planowanej wyprawy.
6. Zapis łowiska/linków mógł inicjować research, choć użytkownik zapisywał
   tylko dane. Brak linku w formularzu uruchamiał wyszukiwanie automatycznie.
7. Dodatkowe bloki researchu powielały treści zakładek i mogły pokazywać
   nieprzetworzone akapity. Oddzielono je od zwykłej prezentacji danych.
8. Brak zapisanych zasad w researchu bywał raportowany mimo istniejących
   utrzymywanych regulaminów. Zmieniono warunek pustego komunikatu.

## Kolejne ulepszenia — rekomendacje, nie nowe moduły

1. Przejrzeć redakcyjnie materiały łowisk PL/EN i uzupełnić zatwierdzone profile.
   To da większą wartość niż ponowne automatyczne generowanie surowych raportów.
2. Rozwinąć istniejące artykuły według [planu wiedzy](KNOWLEDGE_ROADMAP.md),
   z kontrolą oryginałów i poziomu dowodu dla każdego nowego akapitu.
3. Rozważyć czytelny ekran porównania konfliktów offline, jeśli właściciel
   zatwierdzi większą zmianę UX. Obecna kolejka/ochrona kont pozostała sprawna.
4. Rozważyć przekrojowe statystyki sezonów i wersjonowany obieg zatwierdzania
   materiałów. Nie wdrażano dodatkowego modułu analitycznego ani AI.

## Blokada i przekazanie

Ta sesja nie ma przypisanych sekretów Cloudflare, a wymuszona polityka sieci
nie dopuszcza API Cloudflare ani adresu Preview. Nie dało się odczytać zdalnych
bindingów, wykonać i zweryfikować świeżego backupu ani wdrożyć kodu.
Nie zmieniono produkcji, Preview, zdalnej D1/R2 ani historycznych baz.

Kompletna kolejność kontroli, backupów, wdrożenia i live UAT:
[PREVIEW_HANDOFF.md](PREVIEW_HANDOFF.md). Work ma użyć WYŁĄCZNIE istniejącego
`dream-team-preview`; niespełniony warunek backupu lub izolacji oznacza BLOCKED.
