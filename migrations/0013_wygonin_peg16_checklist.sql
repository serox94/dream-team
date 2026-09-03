-- Wygonin 2027 / stanowisko 16: rzeczy wynikające bezpośrednio z logistyki i regulaminu.
DELETE FROM checklist_items
WHERE trip_id='poland-2027' AND notes LIKE 'AUTO:PEG16:%';

INSERT INTO checklist_items(trip_id,category,label,assigned_to,packed,quantity,notes,sort_order) VALUES
('poland-2027','Stanowisko 16','Stacja zasilania / duży powerbank',NULL,0,'1','AUTO:PEG16: brak prądu na stanowisku; 230 V tylko na Przystani',10),
('poland-2027','Stanowisko 16','Powerbanki USB',NULL,0,'2+','AUTO:PEG16: telefony, czołówki, Deeper i drobna elektronika',11),
('poland-2027','Stanowisko 16','Ładowarki USB / 12 V + komplet przewodów',NULL,0,'komplet','AUTO:PEG16: przygotować ładowanie bez stałego 230 V',12),
('poland-2027','Stanowisko 16','Baterie do łódki zanętowej + ładowanie',NULL,0,'komplet','AUTO:PEG16: zaplanować pełny tydzień bez gniazdka na stanowisku',13),
('poland-2027','Stanowisko 16','Deeper CHIRP+2 + ładowarka',NULL,0,'1','AUTO:PEG16: pierwszy etap po przyjeździe to sondowanie spadu',14),
('poland-2027','Stanowisko 16','Pojemniki z wodą pitną na pierwszą dobę',NULL,0,'zapas','AUTO:PEG16: wodę pitną można pobrać na Przystani przed łowieniem',15),
('poland-2027','Stanowisko 16','Wózek / taczka awaryjna do transportu',NULL,0,'1','AUTO:PEG16: auto tylko rozładunek/załadunek; potem za szlabanem',16),
('poland-2027','Bezpieczeństwo','Kamizelki ratunkowe',NULL,0,'2','AUTO:PEG16: obowiązkowe przy każdym korzystaniu z łodzi/pontonu',20),
('poland-2027','Bezpieczeństwo','Ponton / łódź + pompka',NULL,0,'1','AUTO:PEG16: potrzebny do wywózki/holu jeśli używany; ruch w ramach własnej strefy',21),
('poland-2027','Bezpieczeństwo','Silnik + akumulator do pontonu',NULL,0,'1 kpl.','AUTO:PEG16: jeśli korzystamy z własnego pontonu; sprawdzić naładowanie przed wyjazdem',22),
('poland-2027','Bezpieczeństwo','Czołówki z trybem czerwonym / niskim światłem',NULL,0,'2','AUTO:PEG16: regulamin wymaga ciszy i ograniczenia jasnego światła',23),
('poland-2027','Carp Care','Podbierak min. 42 cale',NULL,0,'1+','AUTO:PEG16: wymóg regulaminu',30),
('poland-2027','Carp Care','Kołyska lub gruba mata min. 5 cm ze sztywnymi bokami',NULL,0,'1','AUTO:PEG16: wymóg regulaminu ochrony ryb',31),
('poland-2027','Carp Care','Worek do ważenia ze sztywnymi ramionami',NULL,0,'1','AUTO:PEG16: wymóg regulaminu',32),
('poland-2027','Carp Care','CarpCare / środek do dezynfekcji',NULL,0,'1','AUTO:PEG16: obowiązkowy sprzęt ochrony ryb',33),
('poland-2027','Łowienie','6 zestawów głównych — 3 Patryk + 3 Maciek','Patryk + Maciek',0,'6','AUTO:PEG16: plan startowy zgodny z pakietem 3 wędki/os.; regulamin max 4/os.',40),
('poland-2027','Łowienie','Zestawy German / Slip-D do twardego dna',NULL,0,'kilka','AUTO:PEG16: wariant na czyste fragmenty i półki',41),
('poland-2027','Łowienie','Zestawy Ronnie / Spinner do mułu lub lekkiego zielska',NULL,0,'kilka','AUTO:PEG16: wariant po sprawdzeniu dna',42),
('poland-2027','Łowienie','Dobrze przygotowany orzech tygrysi',NULL,0,'wg planu','AUTO:PEG16: polecany na Wygoninie; surowy/źle przygotowany jest zabroniony',43),
('poland-2027','Przyjazd','Telefon z zapisanym numerem managera +48 510 410 410',NULL,0,'1','AUTO:PEG16: SMS/MMS meldunek i wymeldowanie ze zdjęciem stanowiska',50),
('poland-2027','Przyjazd','Zdjęcie stanowiska po przyjeździe i przed wyjazdem',NULL,0,'2','AUTO:PEG16: wymagane do SMS/MMS meldunku/wymeldowania',51),
('poland-2027','Przyjazd','Potwierdzenie granic wody stanowiska 16 z managerem',NULL,0,'1','AUTO:PEG16: przed rozłożeniem 6 zestawów potwierdzić granice z sąsiadami',52);

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','13',CURRENT_TIMESTAMP);
