-- İçgörü servisi rolü migration'dan sonra da yazabilsin (rol db-init'te oluşur, tablo burada).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'insights') THEN
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO insights;
    GRANT INSERT, UPDATE ON TABLE insights TO insights;
  END IF;
END
$$;
