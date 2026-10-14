# Weather recovery checkpoint — 2026-10-14

Pogoda PRO po nieudanym pobraniu Open-Meteo czyściła wartości i pozostawiała analizę w stanie „Analizuję…”. Poprawka dodaje 5-minutowy cache prognozy według GPS i wszystkich parametrów dostawcy. Przy błędzie transportu, HTTP 429 lub 5xx używa ostatniej prognozy maksymalnie przez 30 minut, z jawnym oznaczeniem starszych danych i zachowaniem czasu pobrania. Błędne parametry, niepoprawna odpowiedź, zmieniony GPS ani starsza prognoza nie są używane jako aktualna pogoda. Nie zwiększono liczby ponowień ani nie dodano dostawców.

Pierwszy błąd kończy stan ładowania i czyści rekomendacje bez danych. Nieudane odświeżenie zachowuje ostatnie dane z ostrzeżeniem. Dashboard oznacza starszą prognozę w PL/EN; cache Service Workera zawiera brakujący moduł analizy.

Dowody:
- Produkcja 600d1f5: wszystkie 4 wyjazdy HTTP 200 i zgodne GPS; Francja 2026, Pogoda PRO/dashboard, 390 PL / 1280 EN, bez overflow i błędów JS — run 38520548975. Awarii ze zrzutu nie udało się odtworzyć; brak historycznej diagnostyki upstream pozwalającej ustalić dokładny powód transportowy.
- Nowe scenariusze odporności, istniejące testy błędów i analizy: 12 PASS; integracyjny status błędu API PASS. Validate i Responsive UI QA dla finalnego commitu PASS.
- Finalny run 38523084028: Chromium na jednorazowej lokalnej D1 PASS; prywatny Worker Cloudflare, rzeczywisty Open-Meteo i 4 wyjazdy: pobranie, cache bez dodatkowego wywołania, oznaczona prognoza przy symulowanej awarii i limit 30 minut — PASS. Worker testowy usunięty, źródłowa D1 tylko SELECT.

Nie zmieniono produkcyjnego kodu, danych, kont, haseł, sesji ani maintenance. Bez migracji, Tavily i Workers AI. Wdrożenie tej poprawki wymaga osobnej zgody: wcześniejsza zgoda dotyczyła wyłącznie 600d1f5.

Candidate: `138e26d85f1a37c892303e0eec12f28755cca18d`. PR #12 is ready for review, not merged. Production was checked again after verification: HTTP 200, APP_BUILD 600d1f55ad0481a77cfc725a7a1810ea15347ee0, individual auth, maintenance OFF.

The private probe's first attempts failed on publication readiness (HTTP401); an authenticated readiness check resolved it without changing the gate. The successful final run 38523084028 passed all edge cases for four trips and both Chromium languages/sizes. Temporary Worker cleanup succeeded.

No production code deployment, migration, data edit, account initialization, secret change or mass session revocation was performed. A separate approval is required for merging and deploying PR #12.
