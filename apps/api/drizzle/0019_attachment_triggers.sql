-- attachments: senkron ve denetim trigger'ları. İkili veri uploads biriminde, burada yalnızca künye.
DO $$
BEGIN
  DROP TRIGGER IF EXISTS attachments_before_write ON attachments;
  CREATE TRIGGER attachments_before_write BEFORE INSERT OR UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION anka_before_write();
  DROP TRIGGER IF EXISTS attachments_audit ON attachments;
  CREATE TRIGGER attachments_audit AFTER INSERT OR UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION anka_audit();
END
$$;
