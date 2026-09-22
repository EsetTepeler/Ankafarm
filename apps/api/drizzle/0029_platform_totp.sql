-- Yönetici hesabı tüm kiracıları açıyor; tek şifre yeterli koruma değil (2026-09-23).
-- TOTP (RFC 6238) ikinci adım olarak eklenir.
ALTER TABLE platform_admins ADD COLUMN totp_secret text;
--> statement-breakpoint
ALTER TABLE platform_admins ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE platform_admins ADD COLUMN totp_confirmed_at timestamptz;
--> statement-breakpoint

-- Telefon kaybolursa giriş tamamen kapanmasın. Kodlar tek kullanımlık ve yalnızca özeti saklanır;
-- veritabanını okuyan biri kodları ele geçiremesin.
CREATE TABLE platform_recovery_codes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  admin_id uuid NOT NULL REFERENCES platform_admins (id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX platform_recovery_admin_idx ON platform_recovery_codes (admin_id);
