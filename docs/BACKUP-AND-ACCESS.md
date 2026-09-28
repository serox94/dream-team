# Kopie D1 i uprawnienia do zapisu

## Stan wdrożenia

Produkcja korzysta wyłącznie z Cloudflare D1 `dream-team-db`. Wersja kodu przygotowuje kontrolę dostępu, ale do chwili dodania sekretu `RYBY_API_WRITE_TOKEN` zapisy i pełny eksport nadal są publiczne. Oddzielny Worker w katalogu `backup/` **nie jest wdrożony**: nie zakłada istnienia zasobnika R2 ani poświadczeń Cloudflare. Sam `npm run build` nie uruchamia harmonogramu. Żadna z tych zmian nie zapisuje, nie odtwarza i nie czyści danych produkcyjnych.

## Aktywacja ochrony zapisów

1. Administrator Cloudflare tworzy losowy klucz o długości przynajmniej 32 znaków i dodaje go jako sekret Workera `dream-team`: `RYBY_API_WRITE_TOKEN`. Nie umieszczamy klucza w repozytorium, D1 ani w zwykłej zmiennej `vars`.
2. Uczestnicy otrzymują klucz bezpiecznym kanałem. Po pierwszej próbie zapisu aplikacja wyświetli okno z zamaskowanym polem hasła; przechowuje klucz w `sessionStorage` bieżącej karty, a następnie używa w nagłówku `Authorization: Bearer ...`. Po 401 umożliwia podanie nowego klucza.
3. Administrator sprawdza, czy zapis bez klucza i pobranie `/api/export` bez klucza zwracają 401, a prawidłowy klucz pozwala na odczyt kopii i wpis w środowisku testowym. Na produkcji wystarczy sprawdzić odmowę 401 bez tworzenia próbnego wpisu.

Wspólny klucz ogranicza zapisy, ale nie identyfikuje autora zmian. Odczyt ekranów, w tym informacji o wyjazdach i łowiskach, pozostaje publiczny. Jeśli również odczyt ma być prywatny, można włączyć Cloudflare Access dla całego Workera i określić dopuszczone osoby; wymaga to polityki konta Cloudflare. Odwołanie sekretu wymaga zastąpienia go nowym, nie jego skasowania: brak sekretu przy obecnej konfiguracji przywraca publiczne zapisy.

## Regularne kopie

Cloudflare D1 Time Travel działa automatycznie na bazach z backendem `version: production`: 7 dni na planie Free lub 30 dni na Paid. Należy najpierw odczytać `wrangler d1 info dream-team-db` na zalogowanym koncie i sprawdzić `version`; tego nie można ustalić z publicznego Workera. Przywrócenie Time Travel nadpisuje bazę i **nie jest** rutynowym testem kopii na produkcji.

Do przechowywania niezależnego eksportu dłużej niż okno Time Travel przygotowano odrębny Worker `backup/`. Codziennie o **03:17 UTC** rozpoczyna tylko odczytowy eksport SQL D1 przez API Cloudflare i zapisuje plik w prywatnym zasobniku R2 pod unikalną nazwą. Workflow ponawia zadanie, jeśli eksport nie jest gotowy, oraz zgłasza błąd pustego pliku. Nie wystawia publicznego endpointu ani nie używa Supabase.

Do aktywacji potrzebne są na koncie Cloudflare:

1. prywatny zasobnik R2 `dream-team-d1-backups` (bez domeny publicznej),
2. identyfikator konta jako sekret `CLOUDFLARE_ACCOUNT_ID` i token API uprawniony do eksportu wskazanej D1 jako sekret `D1_EXPORT_TOKEN` Workera `dream-team-d1-backup`,
3. uprawnienie do wdrożenia osobnego Workera z `backup/wrangler.jsonc` oraz sprawdzenie jego pierwszego zaplanowanego wykonania i obecności niepustego obiektu w R2.

Kod jest sprawdzany przez `npm test` i `npx wrangler deploy --dry-run --config backup/wrangler.jsonc`. Wdrożenie i uruchomienie harmonogramu wymagają autoryzacji konta Cloudflare; obecne środowisko nie ma takiego dostępu. Po pierwszym udanym eksporcie trzeba przetestować odtworzenie na **osobnej testowej D1**, porównać liczbę rekordów i ustawić okres przechowywania R2. Nigdy nie wykonuj odtwarzania testowego na produkcyjnej D1.
