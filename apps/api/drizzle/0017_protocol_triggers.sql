-- health_protocols, protocol_items: senkron ve denetim trigger'ları.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['health_protocols', 'protocol_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_before_write', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION anka_before_write()', t || '_before_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION anka_audit()', t || '_audit', t);
  END LOOP;
END
$$;
