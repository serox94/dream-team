-- Additive migration: no catches, spots or checklist rows are removed.
ALTER TABLE anglers ADD COLUMN baseline_pb_kg REAL;
-- The original, manually supplied PB was 13 kg for both anglers (0001).
-- Keep pb_kg untouched as legacy evidence; derive future PB from this baseline
-- plus non-deleted catches, so correcting a mistyped weight can lower the PB.
UPDATE anglers SET baseline_pb_kg = CASE WHEN id IN ('patryk','maciek') THEN 13 ELSE pb_kg END;
ALTER TABLE catches ADD COLUMN deleted_at TEXT;
ALTER TABLE spots ADD COLUMN deleted_at TEXT;
ALTER TABLE checklist_items ADD COLUMN deleted_at TEXT;

CREATE TABLE trip_participants (
  trip_id TEXT NOT NULL REFERENCES trips(id),
  angler_id TEXT NOT NULL REFERENCES anglers(id),
  PRIMARY KEY(trip_id, angler_id)
);
INSERT INTO trip_participants(trip_id,angler_id) SELECT t.id,a.id FROM trips t CROSS JOIN anglers a;

UPDATE lakes SET facts_json=json_set(facts_json,'$.contentPack','plaine2','$.timeZone','Europe/Paris'),
 image_url='/assets/img/lowisko.jpg' WHERE id='plaine2';
UPDATE lakes SET facts_json=json_set(facts_json,'$.timeZone','Europe/Warsaw') WHERE id IN ('wygonin','miloszewskie');
INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES('schema_version','17',CURRENT_TIMESTAMP);
