-- Çiftlik sahibi samanı balya değil kilo olarak tutuyor (2026-09-22 geri bildirimi).
-- Yalnızca hiç hareket görmemiş kalemler dönüştürülür: alım veya tüketim girilmişse
-- miktarlar balya cinsinden kaydedilmiş demektir, bunları kilo saymak veriyi bozardı.
-- Hareket görmüş kalemin birimini sahibi Stok ekranından kendisi değiştirir.
UPDATE stock_items s
SET unit = 'kg', updated_at = now()
WHERE s.name = 'Saman'
  AND s.unit = 'bale'
  AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.item_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM consumptions c WHERE c.item_id = s.id);
