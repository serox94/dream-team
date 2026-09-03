UPDATE trips
SET facts_json = json_set(
  COALESCE(facts_json,'{}'),
  '$.accommodation', 'Chalet ok. 15 m² · 2 pojedyncze łóżka · zadaszony taras ok. 10 m²',
  '$.kitchen', 'płyta indukcyjna 2-polowa · lodówka z małym zamrażalnikiem · mikrofalówka · czajnik · ekspres kapsułkowy · toster · naczynia i garnki',
  '$.heating', 'grzejniki elektryczne i wentylator zapewnione na miejscu',
  '$.notAvailable', 'brak Wi‑Fi · brak TV · brak klimatyzacji · brak wody w środku domku · pościel/ręczniki nie są zapewnione',
  '$.fishCare', '2 maty i 2 worki do ważenia zapewnia łowisko; własnych nie wolno używać; obowiązkowo zabrać środek do dezynfekcji ryb',
  '$.hooks', 'wyłącznie haki bezzadziorowe — bez wyjątków',
  '$.line', 'plecionka jako linka główna zabroniona; na przyponie stosuj fluorocarbon lub dozwoloną plecionkę w otulinie',
  '$.leaders', 'leadcore i strzałówki zabronione; dopuszczone Korda Dark Matter Safe Zone leaders',
  '$.leadSafety', 'zestaw musi umożliwiać uwolnienie ciężarka po zerwaniu',
  '$.bait', 'kulki z konserwantami zabronione; świeże przynęty bez konserwantów; przygotowane produkty można zamówić w sklepie łowiska min. 2 tygodnie wcześniej',
  '$.markers', 'markery rurowe dozwolone; markery H / z linką zabronione',
  '$.parking', 'po rozładunku samochód należy odstawić na wyznaczony parking',
  '$.tents', 'tylko namioty i parasole zielone lub kamuflaż',
  '$.fire', 'ognisko na ziemi zabronione; grill dozwolony',
  '$.swimming', 'kąpiel zabroniona',
  '$.keepSacks', 'worki do przetrzymywania ryb zabronione',
  '$.shop', 'sklep łowiska: przynęty i materiały eksploatacyjne można zamówić wcześniej; zalecane minimum 2 tygodnie przed przyjazdem',
  '$.motorRental', 'możliwy wynajem silnika 55 lb + 2 akumulatory litowe 100 Ah',
  '$.contact', '+33 6 58 17 54 92',
  '$.officialSource', 'https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/'
), updated_at=CURRENT_TIMESTAMP
WHERE id='next-trip';

DELETE FROM trip_documents WHERE trip_id='next-trip' AND kind='rules' AND title='Pełny skrót regulaminu Plaine 2';
INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order) VALUES(
'next-trip','rules','Pełny skrót regulaminu Plaine 2',
'Przyjazd 12:00–14:00, wyjazd 9:00–10:00; poza godzinami brama może być zamknięta. Po rozładunku auto na parking. Tylko zielone/camo namioty i parasole. Zakaz kąpieli i ognisk na ziemi; grill dozwolony. Łódź łowiska jest dostępna bezpłatnie, kamizelka obowiązkowa, własna łódź zabroniona. Łódka zanętowa dozwolona. Używaj wyłącznie mat i worków do ważenia zapewnionych przez łowisko; zabierz środek do dezynfekcji. Haki wyłącznie bezzadziorowe. Leadcore i strzałówki zabronione; dozwolone Korda Dark Matter Safe Zone leaders. Zestaw musi uwalniać ciężarek po zerwaniu. Markery rurowe dozwolone, H-marker/z linką zabroniony. Worki do przetrzymywania ryb zabronione. Kulki z konserwantami zabronione — tylko świeże przynęty bez konserwantów. Właściciel może kontrolować sprzęt; złamanie zasad może oznaczać natychmiastowe usunięcie bez zwrotu kosztów.',
'https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/',30);

DELETE FROM trip_documents WHERE trip_id='next-trip' AND kind='equipment' AND title='Wyposażenie domku';
INSERT INTO trip_documents(trip_id,kind,title,content,source_url,sort_order) VALUES(
'next-trip','equipment','Wyposażenie domku',
'Chalet ok. 15 m²: 2 pojedyncze łóżka, kuchnia z płytą indukcyjną, lodówką z małą zamrażarką, mikrofalówką, czajnikiem, ekspresem kapsułkowym, tosterem, naczyniami i garnkami. Grzejnik elektryczny i wentylator są zapewnione. Na zewnątrz stół piknikowy i zimna woda; sanitariaty kilka metrów dalej. Brak Wi‑Fi, TV i klimatyzacji. Pościel i ręczniki nie są zapewnione.',
'https://lodgingcarp.com/en/destination/la-plaine-des-bois-etang-2/',40);

INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','5',CURRENT_TIMESTAMP);