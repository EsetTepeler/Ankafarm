-- Senkron sıra numarası, denetim kaydı ve trigger'lar. Bölüm 3.2 ve 4.5.
CREATE SEQUENCE IF NOT EXISTS sync_seq;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION anka_before_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.sync_seq := nextval('sync_seq');
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION anka_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  v_device uuid := nullif(current_setting('app.device_id', true), '')::uuid;
  v_mutation uuid := nullif(current_setting('app.mutation_id', true), '')::uuid;
BEGIN
  INSERT INTO audit_log (farm_id, table_name, record_id, action, old_data, new_data, user_id, device_id, mutation_id)
  VALUES (
    COALESCE(NEW.farm_id, OLD.farm_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    lower(TG_OP),
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END,
    v_user,
    v_device,
    v_mutation
  );
  RETURN NULL;
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['breeds', 'groups', 'animals', 'group_movements'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_before_write', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION anka_before_write()', t || '_before_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION anka_audit()', t || '_audit', t);
  END LOOP;
END
$$;
