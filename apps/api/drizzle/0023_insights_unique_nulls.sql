-- Çiftlik geneli bulgularda animal_id boş. Postgres varsayılanında iki NULL farklı sayıldığı için
-- upsert eşleşmiyor ve aynı bulgu her hesapta yeniden ekleniyordu. NULLS NOT DISTINCT bunu çözer.
DELETE FROM insights a USING insights b
WHERE a.ctid < b.ctid
  AND a.farm_id = b.farm_id
  AND a.type = b.type
  AND a.animal_id IS NOT DISTINCT FROM b.animal_id;
--> statement-breakpoint
DROP INDEX IF EXISTS insights_farm_animal_type_uq;
--> statement-breakpoint
CREATE UNIQUE INDEX insights_farm_animal_type_uq ON insights (farm_id, animal_id, type) NULLS NOT DISTINCT;
