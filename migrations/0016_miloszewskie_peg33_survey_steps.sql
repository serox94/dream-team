UPDATE trips
SET facts_json=json_set(
      COALESCE(facts_json,'{}'),
      '$.pegSurveyStep1','Obserwacja powierzchni i wiatru, potem 5–7 przejazdów Deeperem wachlarzem z sektora 33 w stronę głębszej misy.',
      '$.pegSurveyStep2','Powtórnie sprawdź 3–4 najlepsze miejsca: krawędzie około 6–8 m, przejścia i wypłaszczenia w oknie 8,5–10,5 m oraz wyraźne granice twarde–miękkie.',
      '$.pegSurveyStep3','Dopiero po drugim skanie zapisz realne spoty i połóż 4 zestawy. Jedną wędkę zostaw mobilną pod zmianę głębokości lub ZIG, jeśli ryby są w toni.'
    ),
    updated_at=CURRENT_TIMESTAMP
WHERE id='miloszewskie-2027';

INSERT OR REPLACE INTO app_settings(key,value,updated_at)
VALUES('schema_version','16',CURRENT_TIMESTAMP);
