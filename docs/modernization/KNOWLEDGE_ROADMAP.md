# Rozbudowa wiedzy — plan redakcyjny bez niezweryfikowanych porad

Encyklopedia pozostaje statyczną, wersjonowaną bazą niezależną od wyjazdu,
łowiska i Tavily. W tej zmianie naprawiono indeksowanie pełnej treści PL/EN,
wyszukiwanie bez znaków diakrytycznych i otwieranie trafionych artykułów.
Zachowano obecne artykuły, źródła, diagnostykę, atlas i quiz.
Nie dodano nowych twierdzeń naukowych bez ich weryfikacji.

## Kolejność rozszerzeń istniejących artykułów

| Obszar | Zakres kolejnego uzupełnienia | Podstawa do sprawdzenia |
|---|---|---|
| Zachowanie i sezonowość | odróżnienie obserwacji od uogólnień; tlen, tarło, temperatura i dostępność pokarmu | obecne s01–s06: badania, FishBase, administracja przyrodnicza |
| Lokalizacja i dno | odczyt struktur, weryfikacja ciężarkiem/sonarem, ograniczenia interpretacji | obecne źródła podręcznika Deeper i artykułów o dnie |
| Temperatura wody | woda kontra powietrze; wpływ głębokości, pory pomiaru i ograniczeń próbkowania | s01–s04 oraz istniejące źródła warunków |
| Nęcenie | osobne scenariusze z uzasadnieniem, bez obietnic ilości i pewnych brań | publikacje naukowe w katalogu; praktyka wyraźnie oznaczona |
| Rigi, haki, prezentacja | matryca rodzaj dna × prezentacja × bezpieczeństwo; linki do istniejących Rigów/Węzłów | istniejące instrukcje producentów, oznaczenie interesu handlowego |
| Brak brań / problemy | diagnoza pojedynczej zmiany, sprawdzenie hipotez, ograniczenia wniosków | obecny moduł diagnostyczny i źródła przypisane artykułom |
| Dobrostan i bezpieczeństwo | scenariusze wysokiej temperatury i braku tlenu; zawsze priorytet lokalnego regulaminu | s07/s08 Angling Trust i właściwy operator łowiska |

Katalog wejściowy: `public/data/knowledge/sources.json`. Przed publikacją
każdego nowego akapitu sprawdzić oryginał, datę, gatunek, warunki badania i
zastosowanie do dorosłego karpia w danym środowisku. Nie przenosić wyników badań
młodocianych ryb na pewną prognozę brań dorosłych. Treści producenta i praktykę
oddzielać od badań. Rozbieżności pozostawić jawne.

Każde uzupełnienie ma mieć ID istniejącego artykułu, cytowane sourceIds,
poziom dowodu, ograniczenia, spójną wersję PL/EN i test wyszukiwania obu wersji.
Większe rozszerzenie treści wymaga przeglądu właściciela. Nie wymaga osobnych
stron rocznych, researchu dla nowego wyjazdu ani nowego modelu AI.
