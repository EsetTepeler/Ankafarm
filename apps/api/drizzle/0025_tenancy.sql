-- Faz 7.1 ve 7.2: kiracı kimliği, çiftlik durumu ve platform yöneticisi.
-- Çiftlik kodu transferde hedefi göstermek için kullanılır; çiftlik adı aranabilir değil ki
-- bir kiracı diğerlerinin listesini çıkaramasın.
CREATE TYPE farm_status AS ENUM ('active', 'suspended');
--> statement-breakpoint
ALTER TABLE farms ADD COLUMN code text;
--> statement-breakpoint
ALTER TABLE farms ADD COLUMN status farm_status NOT NULL DEFAULT 'active';
--> statement-breakpoint

-- Mevcut çiftliklere kod üret: karışan harf ve rakam yok (0/O, 1/I gibi).
UPDATE farms
SET code = 'CF-' || (
  SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 31)::int + 1, 1), '')
  FROM generate_series(1, 6)
)
WHERE code IS NULL;
--> statement-breakpoint
ALTER TABLE farms ALTER COLUMN code SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX farms_code_uq ON farms (code);
--> statement-breakpoint

-- Platform yöneticisi çiftlik kullanıcısı değil: ayrı tabloda durur, tokenı ayrı tür taşır.
-- Aynı tabloda olsaydı farm_id'si boş bir kullanıcı her çiftlik sorgusunda özel durum olurdu.
CREATE TABLE platform_admins (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- Yönetici oturumları da döndürmeli refresh token kullanır; çiftlik oturumlarıyla aynı tabloda
-- durmasın diye ayrı tablo, ama aynı sözleşme.
CREATE TABLE platform_refresh_tokens (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  admin_id uuid NOT NULL REFERENCES platform_admins (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX platform_refresh_admin_idx ON platform_refresh_tokens (admin_id);
