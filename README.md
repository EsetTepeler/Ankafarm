# Anka Farm

Küçükbaş çiftlik yönetim paneli. Plan, mimari ve fazlar: [docs/PLAN.md](docs/PLAN.md).

## Yapı

- `apps/web` Web uygulaması: Vite + React + Tailwind + shadcn/ui, tarayıcıda SQLite (OPFS) ile çevrimdışı çalışır, PWA.
- `apps/api` Fastify + tRPC + Drizzle API. Açılışta migration ve seed çalıştırır.
- `apps/insights` Python içgörü servisi (Faz 5, henüz yok).
- `packages/shared` zod şemaları, olay eşleyicileri, ortak sabitler.
- `docker/` web imajı, nginx ve açılış betiği. `docker-compose.yml` tüm sistem.

## Gereksinimler

- Node 24. pnpm global kurulmaz; `corepack pnpm ...` ile çalışır (kök `package.json` içinde pinli).
- Docker (yerel Postgres ve tam sistem denemesi için).
- Python 3.12+ (`.venv` kök dizinde, Faz 5 için).

## Yerel geliştirme

```
corepack pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env

docker compose up -d db          # Postgres 18, host portu 5433
corepack pnpm api                # API: http://localhost:3000 (tsx watch, her origin'e izin verir)
corepack pnpm web                # Web: http://localhost:8090 (Vite, COOP/COEP başlıklarını kendisi verir)
corepack pnpm typecheck
```

API'yi Docker konteynerinden çalıştırıyorsan (`docker compose up -d api`), kök `.env` içindeki `SERVICE_URL_WEB` virgülle ayrılmış izinli adres listesidir; 8090 orada olmalı.

İlk açılışta hiç kullanıcı yoksa `apps/api/.env` içindeki `SEED_OWNER_*` ile sahip hesabı açılır.

Uçtan uca web testi (sistemdeki Chrome ile, indirme yok; API ve web çalışırken):

```
WEB_URL=http://localhost:8090 corepack pnpm e2e
```

Migration üretmek: sunucu `corepack pnpm --filter @anka/api db:generate` (şema `apps/api/src/db/schema/`, trigger SQL'leri elle yazılır); tarayıcı `corepack pnpm --filter @anka/web exec drizzle-kit generate` (şema `apps/web/src/db/schema.ts`).

## Tam sistem, Docker ile

```
docker compose up --build -d
```

- Web: http://localhost:8080 (nginx, `API_URL` ile `config.json` üretir)
- API: http://localhost:3000/health
- Postgres: localhost:5433
- Yedek: veritabanı, fotoğraflar ve sunucu dışı kopya; ayrıntı aşağıda "Yedekleme" bölümünde

Port eşlemeleri `docker-compose.override.yml` içindedir; Coolify o dosyayı okumaz ve alan adlarını kendi verir.

## Coolify

1. Repoyu bağla, kaynak türü Docker Compose, dosya `docker-compose.yml`.
2. `db`, `api` ve `web` için Coolify `SERVICE_PASSWORD_DB`, `SERVICE_BASE64_64_JWT`, `SERVICE_URL_WEB`, `SERVICE_URL_API` değerlerini üretir; `api` ve `web` servislerine alan adı ver.
3. `SEED_OWNER_EMAIL` ve `SEED_OWNER_PASSWORD` ortam değişkenlerini ekle (ilk sahip hesabı).
4. Deploy. `api` açılışta migration çalıştırır; `web` açılışta `API_URL` ile `config.json` yazar.

## Yedekleme

Üç katman var:

1. **Veritabanı**: `backup` servisi her gün `pg_dump` alır (`backups` volume). Saklama: 30 gün, 8 hafta, 12 ay.
2. **Fotoğraf ve belgeler**: `uploads-backup` servisi her gün `uploads` birimini `backups/uploads/uploads-*.tar.gz` olarak arşivler, 30 günden eskiyi siler. Fotoğraflar veritabanında durmadığı için bu ayrı katman şart.
3. **Sunucu dışı kopya**: haftada bir yedekleri uzak depoya at. Sunucuda bir kez kur:

   ```bash
   # rclone kurulumu ve uzak depo tanımı (Hetzner Storage Box, S3, Drive...)
   curl https://rclone.org/install.sh | sudo bash
   rclone config   # "anka" adında bir remote oluştur

   # Yedek biriminin sunucudaki yolu (Coolify proje öneki ekler)
   docker volume inspect $(docker volume ls --format '{{.Name}}' | grep -E '(^|_)backups$' | head -1) --format '{{.Mountpoint}}'

   # Haftalık kopya: crontab -e
   0 4 * * 0 rclone sync /var/lib/docker/volumes/<backups-volume>/_data anka:ankafarm-yedek --log-file /var/log/anka-yedek.log
   ```

### Geri yükleme provası

Yedeğin gerçekten açıldığını kanıtlar; canlı veritabanına dokunmaz:

```bash
./scripts/restore-test.sh              # en yeni dump
./scripts/restore-test.sh /backups/daily/ankafarm-20260921.sql.gz
```

Geçici bir Postgres konteynerine yükler, tablo sayımlarını yazdırır, konteyneri siler. **Ayda bir çalıştır.**

### Gerçek geri yükleme

```bash
docker compose stop api web
gunzip -c <dump>.sql.gz | docker compose exec -T db psql -U ankafarm -d ankafarm
docker run --rm -v <backups-volume>:/backups:ro -v <uploads-volume>:/data alpine:3 \
  sh -c 'tar -xzf /backups/uploads/<arşiv>.tar.gz -C /data'
docker compose start api web
```

Sahip ayrıca Ayarlar > Dışa aktarma ekranından tüm kayıtları CSV/ZIP olarak indirebilir; bu, sunucudan bağımsız üçüncü bir kopyadır.

