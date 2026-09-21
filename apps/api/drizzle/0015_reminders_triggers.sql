-- reminders: senkron ve denetim trigger'ları.
DO $$
BEGIN
  DROP TRIGGER IF EXISTS reminders_before_write ON reminders;
  CREATE TRIGGER reminders_before_write BEFORE INSERT OR UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION anka_before_write();
  DROP TRIGGER IF EXISTS reminders_audit ON reminders;
  CREATE TRIGGER reminders_audit AFTER INSERT OR UPDATE OR DELETE ON reminders FOR EACH ROW EXECUTE FUNCTION anka_audit();
END
$$;
