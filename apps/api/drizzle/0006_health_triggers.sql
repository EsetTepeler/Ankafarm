-- health_records: senkron ve denetim trigger'ları + withdrawal_until türevi.
CREATE OR REPLACE FUNCTION anka_health_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.sync_seq := nextval('sync_seq');
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  -- Arınma bitişi: uygulama tarihi + gün. İstemci aynı hesabı yerelde yapar.
  IF NEW.withdrawal_days IS NULL THEN
    NEW.withdrawal_until := NULL;
  ELSE
    NEW.withdrawal_until := (NEW.applied_at AT TIME ZONE 'UTC')::date + NEW.withdrawal_days;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER health_records_before_write BEFORE INSERT OR UPDATE ON health_records FOR EACH ROW EXECUTE FUNCTION anka_health_before_write();
--> statement-breakpoint
CREATE TRIGGER health_records_audit AFTER INSERT OR UPDATE OR DELETE ON health_records FOR EACH ROW EXECUTE FUNCTION anka_audit();
