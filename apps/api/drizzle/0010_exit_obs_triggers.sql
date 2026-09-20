-- exit_records, observations, observation_tags: senkron ve denetim trigger'ları; çıkış → hayvan durumu; mevcut çiftliklere etiket tohumu.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exit_records', 'observations', 'observation_tags'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_before_write', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION anka_before_write()', t || '_before_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION anka_audit()', t || '_audit', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Hayvanın durumu: silinmemiş son çıkış kaydı varsa ona göre, yoksa aktif.
CREATE OR REPLACE FUNCTION anka_refresh_animal_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_animal uuid := COALESCE(NEW.animal_id, OLD.animal_id);
  v_type text;
  v_status animal_status;
BEGIN
  SELECT type::text INTO v_type
  FROM exit_records
  WHERE animal_id = v_animal AND deleted_at IS NULL
  ORDER BY exited_at DESC, created_at DESC
  LIMIT 1;
  v_status := CASE v_type WHEN 'died' THEN 'dead' WHEN 'sold' THEN 'sold' WHEN 'slaughtered' THEN 'slaughtered' WHEN 'lost' THEN 'lost' ELSE 'active' END;
  UPDATE animals SET status = v_status WHERE id = v_animal AND status IS DISTINCT FROM v_status;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER exit_records_refresh_status AFTER INSERT OR UPDATE OR DELETE ON exit_records FOR EACH ROW EXECUTE FUNCTION anka_refresh_animal_status();
--> statement-breakpoint
-- Var olan çiftliklere hazır gözlem etiketleri (yeni çiftliklerde bootstrapFarm tohumlar).
INSERT INTO observation_tags (farm_id, category, label, is_seed)
SELECT f.id, v.category::observation_category, v.label, true
FROM farms f
CROSS JOIN (VALUES
  ('movement', 'Topallama'), ('movement', 'Yatıp kalkamama'),
  ('respiratory', 'Öksürük'), ('respiratory', 'Burun akıntısı'), ('respiratory', 'Hızlı nefes'),
  ('digestive', 'İshal'), ('digestive', 'Şişkinlik'), ('digestive', 'İştahsızlık'),
  ('appearance', 'Tüy dökülmesi'), ('appearance', 'Göz akıntısı'), ('appearance', 'Yara'),
  ('behavior', 'Durgunluk'), ('behavior', 'Sürüden ayrılma'), ('behavior', 'Huzursuzluk'),
  ('udder', 'Meme şişliği'),
  ('feeding', 'Az yedi'), ('feeding', 'Yemedi')
) AS v(category, label)
ON CONFLICT DO NOTHING;
