#!/bin/bash
# İlk kurulumda çalışır (yalnızca boş veri dizininde). İçgörü servisi için ayrı DB rolü:
# her tabloda okuma, sadece insights tablosunda yazma (bölüm 4.6).
set -euo pipefail

INSIGHTS_PASSWORD="${INSIGHTS_DB_PASSWORD:-}"
if [ -z "$INSIGHTS_PASSWORD" ]; then
  echo "INSIGHTS_DB_PASSWORD verilmedi, insights rolü atlanıyor" >&2
  exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'insights') THEN
    CREATE ROLE insights LOGIN PASSWORD '${INSIGHTS_PASSWORD}';
  ELSE
    ALTER ROLE insights WITH LOGIN PASSWORD '${INSIGHTS_PASSWORD}';
  END IF;
END
\$\$;

GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO insights;
GRANT USAGE ON SCHEMA public TO insights;

-- Mevcut ve gelecekteki tablolarda okuma.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO insights;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO insights;

-- Yazma yalnızca insights tablosunda; migration sonradan oluşturacağı için burada koşullu.
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'insights') THEN
    GRANT INSERT, UPDATE ON TABLE insights TO insights;
  END IF;
END
\$\$;
SQL

echo "insights rolü hazır"
