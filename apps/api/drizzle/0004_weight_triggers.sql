-- weight_records: senkron ve denetim trigger'ları + animals.current_weight türevi.
CREATE TRIGGER weight_records_before_write BEFORE INSERT OR UPDATE ON weight_records FOR EACH ROW EXECUTE FUNCTION anka_before_write();
--> statement-breakpoint
CREATE TRIGGER weight_records_audit AFTER INSERT OR UPDATE OR DELETE ON weight_records FOR EACH ROW EXECUTE FUNCTION anka_audit();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION anka_refresh_current_weight() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_animal uuid := COALESCE(NEW.animal_id, OLD.animal_id);
  v_weight numeric;
BEGIN
  SELECT weight_kg INTO v_weight
  FROM weight_records
  WHERE animal_id = v_animal AND deleted_at IS NULL
  ORDER BY weighed_at DESC, created_at DESC
  LIMIT 1;
  -- animals üzerindeki before_write trigger'ı sync_seq'i yeniler; istemciler yeni kiloyu pull ile alır.
  UPDATE animals SET current_weight = v_weight WHERE id = v_animal AND current_weight IS DISTINCT FROM v_weight;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER weight_records_refresh_current AFTER INSERT OR UPDATE OR DELETE ON weight_records FOR EACH ROW EXECUTE FUNCTION anka_refresh_current_weight();
