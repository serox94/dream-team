# Modernizacja DreamTeam — stan i kontynuacja

## Punkt wyjścia i przywracanie

- Gałąź: `feat/final-batch`.
- HEAD przed modernizacją: `20b7685260daa187c84b10ef445125027ceab11a` (punkt przywracania kodu; nie oznacza PASS całej aplikacji).
- Produkcja/main: `2d0da14d4637739dcefc61bab596be59778cd26f`. Nie scalać i nie wdrażać.
- Preview: `dream-team-preview`, osobna `dream-team-preview-db` i `dream-team-preview-media`; konfiguracja sprawdza różną tożsamość D1 względem produkcji.
- Schema kodu/preview: 27. Odczyt produkcji przez istniejący workflow: schema 20. Nie zakładać zgodności schematów.
- Przed etapem 2: wykonać prywatny snapshot/eksport preview D1 oraz odczyt liczb i identyfikatorów anglers/catches/trips/participants. Nie zapisywać danych sesji ani hashy w publicznych artefaktach. Snapshot D1 nie został wykonany w etapie 0; żadna migracja nie jest jeszcze wdrożona.
- Etap 1 zmienia tylko UI. Przywrócenie kodu bazowego nie wymaga cofania D1/R2. Nie usuwać zasobów produkcyjnych ani historycznych danych.

## Etap 0 — dowody

Źródła: bieżący kod, 75/75 testów lokalnych, run GitHub Actions `38208727708` dla dokładnego HEAD 20b7685, oraz bezpośredni odczyt ekranu Wyjazdów preview w przeglądarce (12.10.2026).

| Funkcja | Istnieje | Działa na preview | Wymaga poprawki | Niezaimplementowane |
|---|---|---|---|---|
| Wyjazdy, archiwum, CRUD, dane wieloletnie | tak | widok odczytany w UI; zapis kreatora: NOT TESTED w audycie | podział aktualne/nadchodzące/zakończone, pełne daty, przeniesienie administracji | nie |
| Checklisty/połowy/spoty/notatki offline | tak | PASS w job qa-offline ostatniego HEAD; pięć zapisów i konflikt | ponowna regresja po każdej zmianie kont | nie |
| Media Deeper, prywatne R2, 17 obrazów atlasu | tak | PASS w qa-media i staging R2 smoke | nie usuwać obrazów; dalsza kontrola treści | nie |
| Profile uczestników, PB, szablony | tak | PASS qa-extras ostatniego HEAD | utworzenie uczestnika przenieść z Wyjazdów do Ustawień | konta powiązane z profilem |
| Login/sesja wspólna, logout | tak | staging smoke PASS; profilowe konta: NOT TESTED | 730-dniowa sesja bez przypisania wędkarza; nowa migracja kont i zmiany hasła | indywidualne loginy i limit trzech kont |
| PL/EN, PWA/cache | tak | pełny zakres NOT TESTED: qa-language timeout przed zakończeniem, regresja pominięta | nadmiar przełączników, pełny audyt etapu 3 | nie |
| Kreator: nazwa/kraj/bezpośredni URL | tak, zmiana 725e55d | NOT TESTED: brak dowodu zakończonego E2E na tym HEAD | wymusić test braku requestu lake-candidates przy podanym URL | nie |
| Tavily | tak | binding dostępny; test jednorazowy wcześniej zarezerwowany: brak pełnego dowodu ekstrakcji | zweryfikować provenance, 38 pól, requesty i kredyty; nie zgadywać łowiska | nie |
| Workers AI | binding tak | BLOCKED; wyłączone, zero wywołań | niepotwierdzony darmowy limit; brak zgody na paid | nie |
| Pogoda PRO i miernik | tak | NOT TESTED naukowo i live w tym audycie | arbitralne wagi; brakujące odczyty zamieniane na zero; zbadać jednostki/czas/GPS | rzetelny opis niepewności |
| Encyklopedia/Deeper/quizy | tak | NOT TESTED co do poprawności źródeł w tym audycie | weryfikacja i rozszerzenie w etapach 5/6 | nie |
| Autoryzacja wszystkich API | wspólna bramka przed routingiem | smoke i testy automatyczne PASS | audyt kont po etapie 2; nie mieszać cache dwóch tożsamości | indywidualna tożsamość sesji |

Nie sumować powyższych wyników do ogólnego PASS. Test fixture ani sam binding nie zastępuje działającego UI lub rzeczywistego researchu.

## Ryzyka migracyjne (etap 2)

1. Zachować istniejące ID anglers i powiązania PB/połowów/trip_participants; nie tworzyć nowych profili Patryka/Maćka zamiast obecnych.
2. Wprowadzić konta jako powiązanie z anglers. Limit 3 aktywnych kont egzekwować atomowo po stronie D1, także przy równoległych żądaniach.
3. Wspólne hasło: istniejący sekret jako źródło inicjalizacji; późniejsze zmiany wyłącznie jako solony hash/KDF w prywatnej D1. Bez jawnych haseł w kodzie, logach, eksporcie i web storage.
4. Sesje muszą otrzymać ID konta; zaplanować obsługę/relogowanie istniejących sesji. Zmiana hasła powinna unieważnić stare sesje.
5. Utrzymać wspólne dane drużyny, jawnie wybrać zalogowanego autora nowego połowu, zachować ręczną zmianę autora i oryginalne historyczne połowy.
6. Kolejkę offline zachować przy aktualizacji aplikacji; przy przełączeniu kont nie wysyłać cudzych oczekujących zmian jako nowej tożsamości.
7. Przed migracją snapshot preview; po migracji porównanie liczby/ID istniejących danych; dopiero potem E2E kont na 390/1280.

## Kolejność i stan

- Etap 0: odczyt kodu i dowodów zakończony; pełne testy naukowe/providera pozostają oznaczone NOT TESTED/BLOCKED, bez deklaracji.
- Etap 1: DO WYKONANIA — Ustawienia jako miejsce administracji/języka; Wyjazdy jako przegląd i kreator.
- Etapy 2–7: NOT TESTED / DO WYKONANIA. Nie rozpoczynać migracji kont przed przejściem bramki etapu 1.
- READY TO MERGE TO MAIN: NO — zakres etapów 1–7 nie został zakończony i pełna regresja bazowa nie jest potwierdzona.
