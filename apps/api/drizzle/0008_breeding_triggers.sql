-- breeding_records ve lambing_records: senkron ve denetim trigger'ları, gebelik türevi, soy ağacı fonksiyonları.
CREATE TRIGGER breeding_records_before_write BEFORE INSERT OR UPDATE ON breeding_records FOR EACH ROW EXECUTE FUNCTION anka_before_write();
--> statement-breakpoint
CREATE TRIGGER breeding_records_audit AFTER INSERT OR UPDATE OR DELETE ON breeding_records FOR EACH ROW EXECUTE FUNCTION anka_audit();
--> statement-breakpoint
CREATE TRIGGER lambing_records_before_write BEFORE INSERT OR UPDATE ON lambing_records FOR EACH ROW EXECUTE FUNCTION anka_before_write();
--> statement-breakpoint
CREATE TRIGGER lambing_records_audit AFTER INSERT OR UPDATE OR DELETE ON lambing_records FOR EACH ROW EXECUTE FUNCTION anka_audit();
--> statement-breakpoint
-- Dişinin gebelik durumu: sonrasında doğum olmayan, olumsuz çıkmamış son çiftleşme varsa gebe.
CREATE OR REPLACE FUNCTION anka_refresh_pregnancy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_female uuid;
  v_expected date;
BEGIN
  IF TG_TABLE_NAME = 'breeding_records' THEN
    v_female := COALESCE(to_jsonb(NEW) ->> 'female_id', to_jsonb(OLD) ->> 'female_id')::uuid;
  ELSE
    v_female := COALESCE(to_jsonb(NEW) ->> 'mother_id', to_jsonb(OLD) ->> 'mother_id')::uuid;
  END IF;

  SELECT b.expected_birth_at INTO v_expected
  FROM breeding_records b
  WHERE b.female_id = v_female
    AND b.deleted_at IS NULL
    AND b.pregnancy_result <> 'negative'
    AND NOT EXISTS (
      SELECT 1 FROM lambing_records l
      WHERE l.mother_id = v_female AND l.deleted_at IS NULL AND l.born_at >= b.mated_at
    )
  ORDER BY b.mated_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE animals SET is_pregnant = true, expected_birth_at = v_expected
    WHERE id = v_female AND (is_pregnant IS DISTINCT FROM true OR expected_birth_at IS DISTINCT FROM v_expected);
  ELSE
    UPDATE animals SET is_pregnant = false, expected_birth_at = NULL
    WHERE id = v_female AND (is_pregnant OR expected_birth_at IS NOT NULL);
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
CREATE TRIGGER breeding_records_refresh_pregnancy AFTER INSERT OR UPDATE OR DELETE ON breeding_records FOR EACH ROW EXECUTE FUNCTION anka_refresh_pregnancy();
--> statement-breakpoint
CREATE TRIGGER lambing_records_refresh_pregnancy AFTER INSERT OR UPDATE OR DELETE ON lambing_records FOR EACH ROW EXECUTE FUNCTION anka_refresh_pregnancy();
--> statement-breakpoint
-- Atalar: (hayvan, ata, nesil, hat). Hat 'M' anne, 'F' baba; 'MF' annenin babası.
CREATE OR REPLACE FUNCTION fn_pedigree(p_animal uuid, p_depth int DEFAULT 4)
RETURNS TABLE (animal_id uuid, ancestor_id uuid, generation int, line text) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE anc AS (
    SELECT p_animal AS animal_id, p_animal AS ancestor_id, 0 AS generation, ''::text AS line
    UNION ALL
    SELECT anc.animal_id, x.parent_id, anc.generation + 1, anc.line || x.tag
    FROM anc
    JOIN animals a ON a.id = anc.ancestor_id
    CROSS JOIN LATERAL (VALUES (a.mother_id, 'M'), (a.father_id, 'F')) AS x(parent_id, tag)
    WHERE x.parent_id IS NOT NULL AND anc.generation < p_depth
  )
  SELECT animal_id, ancestor_id, generation, line FROM anc WHERE generation > 0
$$;
--> statement-breakpoint
-- Yavrular ve torunlar: (hayvan, yavru, nesil).
CREATE OR REPLACE FUNCTION fn_offspring(p_animal uuid, p_depth int DEFAULT 3)
RETURNS TABLE (animal_id uuid, descendant_id uuid, generation int) LANGUAGE sql STABLE AS $$
  WITH RECURSIVE des AS (
    SELECT p_animal AS animal_id, p_animal AS descendant_id, 0 AS generation
    UNION ALL
    SELECT des.animal_id, c.id, des.generation + 1
    FROM des
    JOIN animals c ON (c.mother_id = des.descendant_id OR c.father_id = des.descendant_id) AND c.deleted_at IS NULL
    WHERE des.generation < p_depth
  )
  SELECT animal_id, descendant_id, generation FROM des WHERE generation > 0
$$;
--> statement-breakpoint
-- Ortak atalar: her ortak ata için iki taraftaki en yakın nesil.
CREATE OR REPLACE FUNCTION fn_relatedness(p_female uuid, p_male uuid, p_depth int DEFAULT 4)
RETURNS TABLE (ancestor_id uuid, female_generation int, male_generation int) LANGUAGE sql STABLE AS $$
  SELECT f.ancestor_id, min(f.generation), min(m.generation)
  FROM fn_pedigree(p_female, p_depth) f
  JOIN fn_pedigree(p_male, p_depth) m ON m.ancestor_id = f.ancestor_id
  GROUP BY f.ancestor_id
  UNION ALL
  -- Doğrudan ebeveynlik: erkek dişinin atasıysa veya tersi.
  SELECT p_male, min(f.generation), 0 FROM fn_pedigree(p_female, p_depth) f WHERE f.ancestor_id = p_male GROUP BY f.ancestor_id
  UNION ALL
  SELECT p_female, 0, min(m.generation) FROM fn_pedigree(p_male, p_depth) m WHERE m.ancestor_id = p_female GROUP BY m.ancestor_id
$$;
