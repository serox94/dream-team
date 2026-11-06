# PR #41 — formularz wiedzy offline

Baza naprawy: `55c0df6a14c5d559f67f9c33cf4b54b080be07bc`.
Gałąź pozostaje `feat/preview-carp-trip-modernization-20261105`.
Nie zmieniano main, danych Cloudflare ani produkcyjnego deploymentu.

## Przyczyna i odtworzenie

`knowledge.js` ładuje statyczne dane i wiąże lokalne formularze niezależnie od
bootstrapu aplikacji. `dream-loader-v2.js` miał jednak globalny listener submit
w fazie capture: dopóki `html[data-ready]` nie miało wartości true, wywoływał
preventDefault i stopImmediatePropagation dla KAŻDEGO formularza.
Gotowy handler formularza wiedzy nie otrzymywał więc zdarzenia. Nie było
wyjątku JavaScript: zatrzymanie było normalną ścieżką listenera.

Przypadek odtworzono w rzeczywistym Chromium przy wyłączonej sieci, z kompletną
powłoką Service Workera (113 zasobów, zero braków) i celowo oczekującym bootstrapem:

| Stan | Przed naprawą | Po naprawie |
|---|---|---|
| globalna gotowość aplikacji | brak | brak |
| formularz tactic, checkValidity | true | true |
| gotowość modułu wiedzy | niepublikowana | true po podpięciu handlerów |
| native submit | zatrzymany w capture | obsłużony lokalnie |
| wynik | pusty | rzeczywisty wynik taktyki |

To odróżnia błąd inicjalizacji między modułami od brakujących plików offline.
Samo czekanie w teście na globalne data-ready ukryłoby przyczynę i nie jest naprawą.

## Zmiana

- Moduł wiedzy publikuje własną gotowość dopiero po zakończeniu inicjalizacji
  narzędzi i podpięciu handlerów. Oznacza tylko znane lokalne formularze:
  tactic, sonarowy spot-picker i ćwiczenie geometrii.
- Loader przepuszcza te gotowe formularze bez oczekiwania na dane wyjazdu/API.
  Pozostałe formularze nadal są blokowane przy niegotowym bootstrapie.
- Obsługa błędu globalnego bootstrapu nie wyłącza gotowych lokalnych narzędzi.
  Stan aria-busy i blokada pointer-events odpowiadają gotowości komponentu.
- Nowa wersja powłoki PWA/loadera dostarcza tę poprawkę. Lista danych wiedzy
  offline i kompletności cache pozostaje sprawdzana; nie czyszczono kolejki zapisów.

## Regresje

Do pełnego Responsive UI QA włączono `scripts/qa-knowledge-offline.mjs`.
Test rozgrzewa prawdziwy cache SW, wyłącza sieć, blokuje bootstrap i klika
natywne przyciski formularzy. Sprawdza widoczny wynik w PL/EN przy 390/1440 px,
ponawia po błędzie bootstrapu, weryfikuje geometrię sonaru i zachowaną blokadę
niezwiązanych formularzy. Łącznie 16 przypadków, bez nieobsłużonych błędów JS.
Raport jest w `qa-screenshots/knowledge-offline/results.json`, wraz ze zrzutami,
w istniejącym artefakcie workflow Responsive UI QA.

Dostosowano stare testy do zaakceptowanych rozwijanych sekcji: testy otwierają
punktację, działania karty oraz archiwum przez interfejs i dopiero potem
sprawdzają wynik, edycję albumu i nawigację. Zachowano asercje zawartości,
zapisów, niezmienionego aktywnego wyjazdu, języków i danych historycznych.
Usunięto tymczasowy debug formularza, nie scenariusz offline.

Wyniki lokalne:

- `npm test`: 325 PASS, 0 FAIL.
- Pełny `scripts/responsive-qa.mjs`: PASS — 15 ekranów i login, pięć szerokości,
  PL/EN, narzędzia offline, kolejka i synchronizacja.
- `scripts/qa-knowledge-offline.mjs`: PASS — 16 przypadków pending/failed.
- `scripts/qa-astra-browser.mjs`: PASS — klawiatura, konflikty, offline,
  ostrzeżenia pogodowe, konta i tłumaczenia.
- `scripts/qa-pro2.mjs`: PASS — 16 scenariuszy, w tym pogoda/woda/offline.
- `scripts/qa-pro2-features.mjs`: PASS — albumy w archiwum, checklista i EN.

Narzędzia lokalne używały Playwright 1.63.0 oraz systemowego Chromium.
Workflow Actions używa przypiętego Playwright 1.63.0 i jego Chromium. Końcowe
wyniki Actions oraz dokładny SHA należy odczytać z runów tego PR; lokalne PASS
nie zastępuje zakończenia Validate i Responsive UI QA.
