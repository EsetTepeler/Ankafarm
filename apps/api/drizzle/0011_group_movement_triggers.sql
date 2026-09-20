-- Grup hareketi → hayvanın grubu. Silinmemiş son hareket (moved_at, created_at) hayvanın grubunu belirler;
-- son hareket de silinirse hayvan geldiği gruba döner. İstemci çevrimdışıyken aynı kuralı yerelde uygular.
CREATE OR REPLACE FUNCTION anka_refresh_animal_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_animal uuid := COALESCE(NEW.animal_id, OLD.animal_id);
  v_group uuid;
  v_found boolean := false;
BEGIN
  SELECT to_group_id, true INTO v_group, v_found
  FROM group_movements
  WHERE animal_id = v_animal AND deleted_at IS NULL
  ORDER BY moved_at DESC, created_at DESC
  LIMIT 1;
  IF NOT v_found THEN
    IF TG_OP = 'DELETE' THEN
      v_group := OLD.from_group_id;
    ELSE
      v_group := NEW.from_group_id;
    END IF;
  END IF;
  UPDATE animals SET group_id = v_group WHERE id = v_animal AND group_id IS DISTINCT FROM v_group;
  RETURN NULL;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS group_movements_refresh_group ON group_movements;
--> statement-breakpoint
CREATE TRIGGER group_movements_refresh_group AFTER INSERT OR UPDATE OR DELETE ON group_movements FOR EACH ROW EXECUTE FUNCTION anka_refresh_animal_group();
