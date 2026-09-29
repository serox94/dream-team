# Kopie D1 i uprawnienia do zapisu

## Stan wdrożenia

Produkcja korzysta wyłącznie z Cloudflare D1 `dream-team-db`. Audyt GitHub Actions z 29.09.2026 potwierdził właściwe konto, produkcyjną wersję D1 i działające bookmarki Time Travel, również sprzed 20 dni. Nie odczytaliśmy abonamentu (API wymaga `Billing Read`), lecz historyczny bookmark starszy niż 7 dni wskazuje na 30-dniowe okno dostępne na planie Paid. Produkcyjny `/api/health` działa. W Workerze `dream-team` nie ma sekretu `RYBY_API_WRITE_TOKEN`, więc zapisy i pełny eksport nadal są publiczne.

Oddzielny Worker w katalogu `backup/` **nie jest wdrożony**. API R2 zwróciło 403, kod `10042` (`NotEntitled`): na koncie trzeba aktywować usługę/subskrypcję R2 przed utworzeniem bucketu. Nie jest to błąd nazwy bucketu. Audyt Cloudflare Access zwrócił 403, kod `9999`; przed wyborem tej metody trzeba potwierdzić Zero Trust i uprawnienie `Access: Apps and Policies Read/Edit`. Szerszy token GitHub Actions służy wyłącznie do administracji i nie może być instalowany jako sekret runtime backupu. Tymczasowy, tylko odczytowy workflow audytu nie zapisuje pełnych odpowiedzi API ani wartości sekretów.

## Aktywacja ochrony zapisów

1. Administrator Cloudflare tworzy losowy klucz o długości przynajmniej 32 znaków i dodaje go jako sekret Workera `dream-team`: `RYBY_API_WRITE_TOKEN`. Nie umieszczamy klucza w repozytorium, D1 ani w zwykłej zmiennej `vars`.
2. Uczestnicy otrzymują klucz bezpiecznym kanałem. Po pierwszej próbie zapisu aplikacja wyświetli okno z zamaskowanym polem hasła; przechowuje klucz w `sessionStorage` bieżącej karty, a następnie używa w nagłówku `Authorization: Bearer ...`. Po 401 umożliwia podanie nowego klucza.
3. Administrator sprawdza, czy zapis bez klucza i pobranie `/api/export` bez klucza zwracają 401, a prawidłowy klucz pozwala na odczyt kopii i wpis w środowisku testowym. Na produkcji wystarczy sprawdzić odmowę 401 bez tworzenia próbnego wpisu.

Wspólny klucz ogranicza zapisy, ale nie identyfikuje autora zmian. Odczyt ekranów, w tym informacji o wyjazdach i łowiskach, pozostaje publiczny. Jeśli również odczyt ma być prywatny, można włączyć Cloudflare Access dla całego Workera i określić dopuszczone osoby; wymaga to polityki konta Cloudflare. Odwołanie sekretu wymaga zastąpienia go nowym, nie jego skasowania: brak sekretu przy obecnej konfiguracji przywraca publiczne zapisy.

### Wybór dla prywatnej aplikacji dwóch osób

Preferowana konfiguracja to **Cloudflare Access dla całego Workera `dream-team`**, z regułą dopuszczającą dokładnie dwa adresy e-mail i logowaniem przez jednorazowy kod e-mail. Po zalogowaniu sesja działa w przeglądarce telefonu i komputera, a polityka obejmuje również odczyt i `/api/export` na wszystkich adresach Workera. Nie należy dodawać ogólnej reguły dopuszczającej dowolny adres e-mail. Wymaga to dostępu do Zero Trust i potwierdzenia obu adresów w panelu; przed włączeniem trzeba sprawdzić logowanie na obu urządzeniach. Metoda `RYBY_API_WRITE_TOKEN` pozostaje przygotowaną alternatywą, gdy polityka Access nie jest dostępna; wtedy każdy użytkownik musi podać ten sam klucz osobno w każdej sesji, a odczyt nadal jest publiczny. Nie włączaj ochrony bez możliwości cofnięcia polityki albo przywrócenia poprzedniej wersji Workera.

## Regularne kopie

Cloudflare D1 Time Travel działa automatycznie na bazach z backendem `version: production`: 7 dni na planie Free lub 30 dni na Paid. Należy najpierw odczytać `wrangler d1 info dream-team-db` na zalogowanym koncie i sprawdzić `version`; tego nie można ustalić z publicznego Workera. Przywrócenie Time Travel nadpisuje bazę i **nie jest** rutynowym testem kopii na produkcji.

Do przechowywania niezależnego eksportu dłużej niż okno Time Travel przygotowano odrębny Worker `backup/`. Codziennie o **03:17 UTC** rozpoczyna tylko odczytowy eksport SQL D1 przez API Cloudflare i zapisuje plik w prywatnym zasobniku R2 pod unikalną nazwą. Workflow ponawia zadanie, jeśli eksport nie jest gotowy, oraz zgłasza błąd pustego pliku. Nie wystawia publicznego endpointu ani nie używa Supabase.

Do aktywacji potrzebne są na koncie Cloudflare:

1. prywatny zasobnik R2 `dream-team-d1-backups` (bez domeny publicznej),
2. identyfikator konta jako sekret `CLOUDFLARE_ACCOUNT_ID` i token API uprawniony do eksportu wskazanej D1 jako sekret `D1_EXPORT_TOKEN` Workera `dream-team-d1-backup`,
3. uprawnienie do wdrożenia osobnego Workera z `backup/wrangler.jsonc` oraz sprawdzenie jego pierwszego zaplanowanego wykonania i obecności niepustego obiektu w R2.

Kod jest sprawdzany przez `npm test` i `npx wrangler deploy --dry-run --config backup/wrangler.jsonc`. GitHub Actions ma dostęp do D1, lecz wdrożenie backupu czeka na aktywację R2 oraz osobny token runtime z minimalnym zakresem `Account → D1 → Read`, ograniczony do właściwego konta. API eksportu D1 należy potwierdzić tym tokenem przed zapisem do Workera. Po pierwszym udanym eksporcie trzeba przetestować odtworzenie na **osobnej testowej D1**, porównać liczbę rekordów i ustawić okres przechowywania R2. Nigdy nie wykonuj odtwarzania testowego na produkcyjnej D1.

Docelowa reguła R2: przechowuj **30 dni** kopii dla prefiksu `dream-team-db/`, czyli przy jednym udanym eksporcie dziennie około 30 kopii; przed włączeniem reguły upewnij się, że pierwszy eksport istnieje i można go odczytać. Sam Worker nie usuwa wcześniejszych kopii. Liczba kopii jest faktyczną liczbą udanych wykonań, nie gwarancją przy awarii harmonogramu.

### Odtworzenie po awarii

1. Zablokuj zapisy w aplikacji i zapisz bieżący stan oraz punkt przywracania, jeżeli baza jeszcze odpowiada. W pierwszej kolejności sprawdź D1 Time Travel i właściwy punkt w czasie w okresie dostępnej retencji.
2. W przypadku utraty bazy wybierz ostatni sprawdzony obiekt `.sql` z prywatnego R2. Pobierz go z uprawnionego konta Cloudflare. Nie udostępniaj pliku publicznie.
3. Utwórz **nową** D1 i zaimportuj SQL do niej. Porównaj tabele oraz liczby rekordów, w szczególności wyjazdy, połowy, checklisty i rekordy usunięte logicznie; przetestuj aplikację z testowym bindingiem tej bazy.
4. Dopiero po weryfikacji skieruj binding `DB` Workera na nową D1 i sprawdź odczyt oraz zapis. Zachowaj starą bazę i poprzednią konfigurację Workera do chwili zakończenia kontroli; cofnięcie aplikacji polega na przywróceniu poprzedniego bindingu i wersji Workera.

Operacja Time Travel nadpisuje wskazaną D1, więc przed użyciem na produkcji należy zachować oddzielny eksport i uzgodnić moment przywrócenia. Test odtworzenia SQL należy wykonać wyłącznie na nowej bazie.
