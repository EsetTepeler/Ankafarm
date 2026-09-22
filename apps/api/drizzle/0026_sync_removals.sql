-- Faz 7.4: bir satırın bir çiftlikten tamamen çıkması.
-- Bugüne kadar silme "soft delete" ile yapılıyordu: satır çiftlikte kalıyor, deleted_at doluyordu.
-- Transferde hayvan B'ye geçince A'nın pull sorgusu (farm_id = A) onu bir daha hiç döndürmüyor,
-- yani A'nın cihazındaki kopya sonsuza kadar kalıyordu. Bu tablo o boşluğu kapatır: A'nın
-- akışına "bu satırı yerelden sil" kaydı düşer.
CREATE TABLE sync_removals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  farm_id uuid NOT NULL REFERENCES farms (id),
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  sync_seq bigint NOT NULL DEFAULT 0,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- anka_before_write UPDATE'te bu sütuna yazdığı için tabloda bulunmak zorunda.
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX sync_removals_farm_seq_idx ON sync_removals (farm_id, sync_seq);
--> statement-breakpoint
-- Aynı satır için tekrar kayıt açılmasın; yeniden düşerse sync_seq güncellenir.
CREATE UNIQUE INDEX sync_removals_farm_row_uq ON sync_removals (farm_id, table_name, row_id);
--> statement-breakpoint
-- sync_seq'i diğer senkron tablolarıyla aynı global diziden alır ki imleç sırası bozulmasın.
CREATE TRIGGER sync_removals_before_write BEFORE INSERT OR UPDATE ON sync_removals
  FOR EACH ROW EXECUTE FUNCTION anka_before_write();
