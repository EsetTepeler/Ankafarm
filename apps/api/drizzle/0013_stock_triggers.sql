-- stok ve finans tabloları: senkron ve denetim trigger'ları, alım tutarı türevi,
-- mevcut çiftliklere kalem tohumu, stok seviyesi ve aylık maliyet view'ları.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_items', 'purchases', 'consumptions', 'expenses', 'incomes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_before_write', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION anka_before_write()', t || '_before_write', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_audit', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION anka_audit()', t || '_audit', t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Alımda birim fiyat ile toplam birbirini tamamlar; istemci çevrimdışıyken aynı hesabı yerelde yapar.
CREATE OR REPLACE FUNCTION anka_purchase_amounts() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.total IS NULL AND NEW.unit_price IS NOT NULL THEN
    NEW.total := round(NEW.unit_price * NEW.quantity, 2);
  ELSIF NEW.unit_price IS NULL AND NEW.total IS NOT NULL AND NEW.quantity > 0 THEN
    NEW.unit_price := round(NEW.total / NEW.quantity, 2);
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS purchases_amounts ON purchases;
--> statement-breakpoint
CREATE TRIGGER purchases_amounts BEFORE INSERT OR UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION anka_purchase_amounts();
--> statement-breakpoint
-- Var olan çiftliklere hazır kalemler (yeni çiftliklerde bootstrapFarm tohumlar).
INSERT INTO stock_items (farm_id, name, category, unit, track_stock)
SELECT f.id, v.name, v.category::stock_category, v.unit::stock_unit, v.track_stock
FROM farms f
CROSS JOIN (VALUES
  ('Yonca', 'feed', 'kg', true),
  ('Saman', 'feed', 'bale', true),
  ('Arpa', 'feed', 'kg', true),
  ('Su', 'water', 'bucket', false)
) AS v(name, category, unit, track_stock)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Kalem bazında bakiye ve kalan gün. Takip edilmeyen kalemde (yağmur suyu) bakiye yok, tüketim sayılır.
CREATE OR REPLACE VIEW v_stock_levels AS
SELECT
  i.farm_id,
  i.id AS item_id,
  i.name,
  i.category,
  i.unit,
  i.min_stock,
  i.track_stock,
  COALESCE(p.qty, 0) AS purchased,
  COALESCE(c.qty, 0) AS consumed,
  COALESCE(c14.qty, 0) AS consumed_14d,
  CASE WHEN i.track_stock THEN COALESCE(p.qty, 0) - COALESCE(c.qty, 0) END AS balance,
  CASE
    WHEN i.track_stock AND COALESCE(c14.qty, 0) > 0 AND COALESCE(p.qty, 0) - COALESCE(c.qty, 0) > 0
    -- Bölmeyi tek adımda yap: önce günlük ortalamayı hesaplayıp bölmek yuvarlama hatası veriyor
    -- ve istemcideki daysOfStockLeft ile bir gün sapıyordu.
    THEN floor((COALESCE(p.qty, 0) - COALESCE(c.qty, 0)) * 14 / COALESCE(c14.qty, 0))
  END AS days_left
FROM stock_items i
LEFT JOIN LATERAL (SELECT sum(quantity) AS qty FROM purchases WHERE item_id = i.id AND deleted_at IS NULL) p ON true
LEFT JOIN LATERAL (SELECT sum(quantity) AS qty FROM consumptions WHERE item_id = i.id AND deleted_at IS NULL) c ON true
LEFT JOIN LATERAL (
  SELECT sum(quantity) AS qty FROM consumptions
  WHERE item_id = i.id AND deleted_at IS NULL AND consumed_on > CURRENT_DATE - 14
) c14 ON true
WHERE i.deleted_at IS NULL;
--> statement-breakpoint
-- Aylık gider: alımlar kalem kategorisiyle, stok dışı giderler kendi kategorisiyle. Alım iki kez sayılmaz.
CREATE OR REPLACE VIEW v_monthly_costs AS
SELECT farm_id, month, category, item_id, item_name, sum(amount) AS amount
FROM (
  SELECT
    p.farm_id,
    date_trunc('month', p.purchased_at)::date AS month,
    (CASE i.category WHEN 'feed' THEN 'feed' WHEN 'water' THEN 'water' WHEN 'medicine' THEN 'vet' ELSE 'equipment' END)::text AS category,
    i.id AS item_id,
    i.name AS item_name,
    COALESCE(p.total, 0) AS amount
  FROM purchases p
  JOIN stock_items i ON i.id = p.item_id
  WHERE p.deleted_at IS NULL
  UNION ALL
  SELECT e.farm_id, date_trunc('month', e.spent_at)::date, e.category::text, NULL::uuid, NULL::text, e.amount
  FROM expenses e
  WHERE e.deleted_at IS NULL
) x
GROUP BY farm_id, month, category, item_id, item_name;
--> statement-breakpoint
CREATE OR REPLACE VIEW v_monthly_income AS
SELECT farm_id, date_trunc('month', received_at)::date AS month, category::text AS category, sum(amount) AS amount
FROM incomes
WHERE deleted_at IS NULL
GROUP BY farm_id, 2, 3;
