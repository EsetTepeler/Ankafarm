#!/usr/bin/env bash
# Geri yükleme provası (madde 4.2). Sunucuda çalıştırılır; canlı veritabanına dokunmaz.
#
# Ne yapar: en yeni pg_dump dosyasını geçici bir Postgres konteynerine yükler, tablo sayımlarını
# yazdırır ve konteyneri siler. Yedek dosyasının gerçekten geri yüklenebildiğini kanıtlar.
#
# Kullanım:  ./scripts/restore-test.sh [yedek-dosyası.sql.gz]
set -euo pipefail

PROJECT="${COMPOSE_PROJECT:-}"
BACKUP_VOLUME="${BACKUP_VOLUME:-}"
TEMP_CONTAINER="anka-restore-test"
TEMP_PASSWORD="restore-provasi"
PG_IMAGE="postgres:18-alpine"

log() { printf '%s %s\n' "$(date +%H:%M:%S)" "$*"; }

# Yedek biriminin adını bul: Coolify proje öneki eklediği için isim sabit değil.
if [ -z "$BACKUP_VOLUME" ]; then
  BACKUP_VOLUME=$(docker volume ls --format '{{.Name}}' | grep -E '(^|_)backups$' | head -1 || true)
fi
if [ -z "$BACKUP_VOLUME" ]; then
  echo "Yedek birimi bulunamadı. BACKUP_VOLUME=<volume-adı> ile çalıştır." >&2
  docker volume ls --format '  {{.Name}}' >&2
  exit 1
fi
log "Yedek birimi: $BACKUP_VOLUME"

# En yeni dump; parametre verilmişse o kullanılır.
DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP=$(docker run --rm -v "$BACKUP_VOLUME:/backups:ro" alpine:3 sh -c \
    "find /backups -name '*.sql.gz' -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-")
fi
if [ -z "$DUMP" ]; then
  echo "Yedek birimde .sql.gz dosyası yok. backup servisi çalışıyor mu?" >&2
  exit 1
fi
log "Denenecek dosya: $DUMP"

cleanup() {
  docker rm -f "$TEMP_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

log "Geçici Postgres başlatılıyor"
docker run -d --name "$TEMP_CONTAINER" \
  -e POSTGRES_PASSWORD="$TEMP_PASSWORD" -e POSTGRES_DB=restoretest -e POSTGRES_USER=restoretest \
  -v "$BACKUP_VOLUME:/backups:ro" "$PG_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$TEMP_CONTAINER" pg_isready -U restoretest -d restoretest >/dev/null 2>&1; then break; fi
  sleep 1
done

log "Yedek geri yükleniyor"
docker exec "$TEMP_CONTAINER" sh -c "gunzip -c '$DUMP' | psql -v ON_ERROR_STOP=1 -U restoretest -d restoretest" >/dev/null

log "Tablo sayımları:"
docker exec "$TEMP_CONTAINER" psql -U restoretest -d restoretest -tA -c "
  select 'hayvan: ' || count(*) from animals
  union all select 'sağlık kaydı: ' || count(*) from health_records
  union all select 'tartım: ' || count(*) from weight_records
  union all select 'gözlem: ' || count(*) from observations
  union all select 'ek dosya künyesi: ' || count(*) from attachments
  union all select 'denetim kaydı: ' || count(*) from audit_log;" | sed 's/^/  /'

ANIMALS=$(docker exec "$TEMP_CONTAINER" psql -U restoretest -d restoretest -tA -c "select count(*) from animals")
if [ "$ANIMALS" -lt 1 ]; then
  echo "Geri yükleme şüpheli: hayvan tablosu boş." >&2
  exit 1
fi

log "Prova başarılı. Not: fotoğraflar veritabanında değil, uploads yedeğinde (uploads-*.tar.gz)."
