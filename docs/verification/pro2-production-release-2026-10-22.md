# DreamTeam PR #14 — produkcja, 22 października 2026

DEPLOYMENT: **SUCCESS**. Maintenance: **OFF**. Wydanie zakończono o 03:53 UTC (05:53 Europe/Berlin).

## Aktywna wersja

- Aplikacja: `4294ce0718f706f2ee72b0c32757ee6913ce1de0` — dokładnie zatwierdzony kandydat.
- PR #14 scalony do main: `2a2f9bf062a8e145e27573374b27b6f6e3198c54`.
- Pełne drzewo Git aplikacji zgodne z kandydatem: `8232c7f2decbb0c8bec4562e415203d3ba7bae89`.
- Worker: `dream-team`; aktywna wersja `fec4759e-c439-489a-bff1-6c4ebb6f799b`, ruch 100%.
- Produkcja: https://dream-team.sewerynski00.workers.dev
- D1: istniejąca `dream-team-db`, schemat i rejestr migracji **30**. Zastosowano wyłącznie przyrostową migrację 0030.

## Dane i odtwarzanie

Zachowano **4 wyjazdy, 3 połowy, 103 pozycje checklist i 84 dokumenty**. Nie kopiowano testowej bazy na produkcję. Istniejące 4 konta, hasła i 3 sesje zostały zachowane; testowe sesje utworzone przez operatora usunięto. Logowanie Patryka i Maćka przed wdrożeniem oraz ciągłość tych sesji po wdrożeniu PASS.

Konto `ryby` pozostaje aktywne i chronione. Jego dane uwierzytelniające są niezmienione; istniejąca flaga wymuszenia zmiany hasła pozostaje ustawiona. Nie resetowano hasła ani nie twierdzimy, że wykonano interaktywne logowanie tym kontem.

Świeży prywatny backup D1 bezpośrednio przed maintenance, bookmark i poprzednia konfiguracja Workera zachowane. SHA-256 SQL: `cf980795f32b447aa871c1c262542aa651f3a962ef65b6e0557210bebadf8fa7`. Klucz backupu: `private-releases/pro2-39718448811-pre-maintenance.sql`. Poprzednia wersja Workera: `27ea7f61-1feb-4404-bb26-9478c51c88bd`, build `a21b8af58c7c29510b2889042f36800df7e46da1`.

Przed maintenance wykonano świeże odtworzenie D1, próbę 29→30, porównanie wszystkich pierwotnych kolumn biznesowych i danych uwierzytelniających oraz odtworzenie R2. R2 ma rzeczywiście **0 obiektów**; inwentaryzacja i porównanie źródła przed/po PASS. Końcowe D1: foreign_key_check bez błędów, quick_check ok. Usunięto tylko zwrócone przez API identyfikatory własnych 4 testowych checklist, 2 połowów i 1 pomiaru wody; oryginalne dane nie zostały edytowane.

## Tłumaczenia

Produkcja po sprzątnięciu: **400 complete, 0 pending, 0 failed, 0 processing, 0 superseded**. Zaimportowano wyłącznie 400 zapisanych tłumaczeń z pasującym rekordem, polem, hashem aktualnego źródła i językiem. Przeniesiono właściwy cache; wykluczono 11 wpisów QA/niepasujących. Nie przenoszono kont, sesji ani danych testowych.

Istniejące preview pozostaje na tej samej bazie, z 411 zapisanymi tłumaczeniami, kolejką 410 complete / 5 superseded i zachowanymi 400 pierwotnymi tłumaczeniami. Nie uruchomiono ponownie backfillu ani benchmarków.

Rzeczywisty test dwóch kont PASS: Patryk PL `Namiot` → Maciek EN **Tent**; Maciek EN `Landing net` → Patryk PL **Podbierak**. Te same rekordy i wspólny status spakowania potwierdzono w API i mobilnym UI.

Dwa nowe zdania miały pusty cache pełnego pola i przeszły przez M2M100 z korektą Llama 3.3 70B:

| Kierunek | Wejście | Rzeczywista odpowiedź modelu |
| --- | --- | --- |
| PL→EN | Sprawdź zapasową latarkę przed wieczornym obchodem stanowiska. | Check the spare torch before the evening round of the peg. |
| EN→PL | Pack the spare headlamp before the evening walk around the lake. | Zapakuj zapasową latarkę przed wieczornym spacerem wokół jeziora. |

Nazwy handlowe **Hot Garlic / Mainline** pozostały bez zmian. Gatunki w produkcyjnym UI: Karp lustrzeń → Mirror carp, Amur → Grass carp. Archiwum: 14 aktualnych tłumaczeń potwierdzonych przez API. Zachowano wcześniejsze dowody edycji i pozostałych sześciu nazw handlowych; nie powtarzano całego audytu.

Workers AI pozostaje na darmowym planie, bez aktywacji Workers Paid lub nowej subskrypcji. Darmowy limit konta: **10 000 neurons/dzień, twarde zatrzymanie**. Dziennik aplikacji 22.10: **1002 / 240000 jednostek**, pozostało 238998. Jednostki są lokalną miarą budżetu, nie rzeczywistym pomiarem neurons całego konta. Wywołania są ograniczane budżetem i cache; poprawnych 400 zapisanych tłumaczeń nie przeliczano.

## Testy rzeczywistej produkcji

- Pogoda i Połowy PL/EN × 390/1440: **4/4 konfiguracje PASS**, bez overflow i błędów JavaScript.
- Rzeczywisty Open-Meteo, 48 godzin indeksu, wybór godziny i rozkład punktacji PASS.
- Ręczny zapis w formularzu Deeper: 13,5°C, 1 m; potwierdzony odczytem D1, następnie usunięto wyłącznie pomiar testowy.
- PWA: gotowy service worker, reload offline i dostęp do wspólnej checklisty PASS.
- Google Photos: album przypisany wyłącznie `next-trip`, Francja **14–21.11.2026**. Przyciski w Połowach i Archiwum PASS w obu językach i szerokościach. Wyjazd czerwcowy nie otrzymał albumu.
- Cron aplikacji `0 6 * * *` i backupu `17 3 * * *` zachowane. Zweryfikowano konfigurację; nie wyzwalano nowego zdarzenia cron poza harmonogramem, nie obserwowano jeszcze kolejnego uruchomienia po wydaniu.

## Zgoda, bramki i dowody

Odbiór wizualny: **APPROVED** zgodnie z decyzją właściciela. GitHub nie miał wymaganych reviewerów deploymentu; nie zmieniano reguł ochrony środowiska. Jednorazowo zapisaną zgodę właściciela w zmiennej środowiska produkcyjnego usunięto po sukcesie, po wymaganym przez GitHub ponownym uwierzytelnieniu.

Pierwsza próba przygotowania `39717863862` została poprawnie zatrzymana przed zmianami produkcji z powodu 1 aktywnego Cloudflare Build. Po zakończeniu buildu świeże przygotowanie **39718077896 PASS**. Wydanie **39718448811 PASS**, job **119626091568**, operator **2066f11d189d3a6289a243547c593fb62f4a4685**. Przed maintenance kolejka builds i równoległych wydań była pusta. Manifest prywatny był świeży, odtworzenie i rzeczywisty zapis 400 tłumaczeń na izolowanej bazie potwierdzone przed maintenance.

Nie powtarzano ważnych benchmarków ani pełnych testów. Zachowano dowody UI 39642960743 i dwóch kont 39638708808. Historyczny run 39637591723 miał 8/8 testów kont PASS, lecz cały workflow FAILURE przez dawny receipt; nie przedstawiamy go jako zakończonego sukcesem workflow.

Dowody wdrożenia: https://github.com/serox94/dream-team/actions/runs/39718448811
Artefakt `pro2-production-safe-status`, ID 12400940480, zawiera deploy.json, smoke.json i 12 rzeczywistych screenshotów: Pogoda, Połowy, Archiwum × PL/EN × 390/1440.

Uwaga interpretacyjna: pola `production`, `publicHealth`, `migrations:29` oraz `productionWrites:0` w surowym deploy.json opisują początkowy odczyt preflight. Końcowy stan opisują `activeCommit`, `activeWorker`, `schema:30`, `deployment:SUCCESS` i niniejszy raport. Nie oznaczają one braku wykonanej migracji lub deploymentu.

