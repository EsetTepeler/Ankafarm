# Anka Farm: Küçükbaş Çiftlik Yönetim Paneli, Genel Plan

Son güncelleme: 2026-09-20
Durum: Faz 1 ve Faz 2 tamam (2.11 saha testi sahipte), Faz 3 başladı; uçtan uca test 46 adım geçiyor. Yayında: https://farmanka.com (web) ve https://api.farmanka.com (API), Hostinger KVM 2 üzerinde Coolify, Let's Encrypt otomatik. Repo: github.com/EsetTepeler/Ankafarm. Faz 5 tamam (5.12 LLM ayrı karar). Kalanlar: 2.11 iOS saha testi, 3.4 push, 4.4 Coolify prod, Faz 6 saha cihazı.

---

## 1. Özet

Amaç: Koyun ve keçi yetiştirilen bir küçükbaş çiftliği için her hayvanın kimliğini, sağlığını, üremesini, kilosunu, beslenmesini ve soy ağacını takip eden; çiftliğin stok, gider ve gelirini aylık raporlayan; telefon, tablet ve web'den aynı şekilde kullanılan tek bir uygulama.

Kullanıcılar: çiftlik sahibi (bilgisayar ve iPhone) ve veteriner (tablet). Kayıtların çoğunu sahip girer, veteriner sağlık kayıtlarını. Biz hiç veri yüklemiyoruz; sürü uygulamadan girilir. Bakıcı rolü ileride eklenebilsin diye hazır.

Kesinleşen kararlar:

- Web uygulaması, native yok: `apps/web`, Vite + React 19 + TypeScript. Bilgisayar ve tabletten tarayıcıyla, iPhone'da ana ekrana eklenen PWA. Masaüstü önce.
- UI: Tailwind v4 + shadcn/ui (Radix, Nova preset), lucide ikonlar. Referans: VisActor Next.js dashboard şablonu (sol menü, kart ızgarası, açık ve koyu tema). Kendi tema tokenları `apps/web/src/index.css`.
- Grafik: VisActor `@visactor/react-vchart` (kurulu, ilk grafik kilo eğrisinde kullanılacak).
- Backend: kendi API'miz. Node 22, TypeScript, Fastify, tRPC, Drizzle ORM, Socket.IO. Veritabanı PostgreSQL 18 (yerleşik `uuidv7()`).
- İçgörü servisi: Python 3.12, FastAPI, pandas. Hayvan ve çiftlik verisinden istatistik ve kural tabanlı bulgular üretir, Türkçe cümle olarak yazar (bölüm 3.5).
- Barındırma: kendi sunucumuzda Coolify. Tüm sistem repo kökündeki tek `docker-compose.yml` ile ayağa kalkar: db, api, insights, web, backup.
- Veri sunucuda durur. Bir cihazda girilen kayıt diğer cihazlarda Socket.IO ile anında görünür. Veri için build alınmaz.
- Arayüz güncellemeleri deploy ile anında; PWA service worker (vite-plugin-pwa, autoUpdate) kabuğu önbellekler, API ve config.json asla önbelleklenmez.
- Çevrimdışı öncelikli: ahırda sürekli Wi-Fi yok. Uygulama kayıtları önce tarayıcıdaki SQLite'a (wasm, Web Worker, OPFS'te kalıcı dosya) yazar, bağlantı gelince senkron eder. Bağlantı olmadan her ekran çalışır. OPFS için sayfa COOP/COEP (`require-corp`) başlıklarıyla gelmeli; Vite dev sunucusu ve nginx bunu verir.
- Tasarım ilkeleri: `farm_id` ile çoklu çiftlik baştan hazır. `species` alanı ile koyun ve keçi aynı tabloda. Tüm kayıtlar istemci tarafında üretilen UUIDv7 taşır (zaman damgalı ve sıralı; günlerce biriken kayıt toplu basıldığında Postgres indekslerini parçalamaz); olay zamanı (`occurred_at`) ile kayıt zamanı ayrıdır. Bu sayede telefon da, ileride ahırdaki saha cihazı da günler sonra senkron olabilir.
- Saha cihazı hazırlığı: ileride ahırda bir mikrodenetleyici veya küçük bilgisayar (gateway) günde bir kez toplu veri gönderecek. API bunun için cihaz kimlikli, tekrar güvenli toplu alım ucu sunar (bölüm 3.6). Bugün yapılmıyor, veri modeli hazır kuruluyor.

Sürümler (0.1 ile kesinleşti, 2026-09-20): Node 24, pnpm 12 (global kurulum yok, `corepack pnpm ...` ile, kök `package.json` içinde pinli; izole node_modules, dolaylı bağımlılık doğrudan import edilecekse pakete açıkça eklenir), Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6.0, React Native Paper 5.15, zod 4, date-fns 4, Fastify 5, tRPC 11, Drizzle 0.45, TanStack Query 5, zustand 5. Python 3.14 kök dizindeki `.venv` içinde (plan 3.12+ diyor, yerelde 3.14). Docker 29, Postgres 18.6.

Ürün konsepti:

- **Hayvan profili bir dijital ikiz.** Başlıkta yaş, cinsiyet, son kilo ve alan bazlı durum rozetleri (sağlık, beslenme, kilo, üreme). Altında hayvanın bütün yaşamı tek zaman çizelgesinde. "Bu koyuna ne oldu?" sorusunun cevabı tek ekranda.
- **Her şey bir olay.** Kilo, aşı, ilaç, hastalık, gözlem, çiftleşme, doğum, grup değişimi, not ve çıkış ayrı tablolarda saklanır ama uygulama hepsini tek `AnimalEvent` tipi ve tek zaman çizelgesi olarak sunar. Yeni olay eklemek profilden tek dokunuş.
- **"Bugün" ekranı ana ekran.** Uygulama açılınca kritik uyarılar, bugünkü işler, yaklaşan doğumlar, yem stok durumu ve bu ayın gideri. Sahibin her sabah uygulamayı açma sebebi bu ekran.
- **Beklenen ile gerçekleşen ayrı tutulur.** Beklenen doğum tarihi, tahmini kilo gibi değerler `predictions` tablosuna yazılır; gerçek değer gelince sapma hesaplanır. Bugün kural tabanlı tahminlerle başlar, yıllar içinde biriken veri gerçek tahmin modellerine zemin olur.
- **Olaylar silinmez, düzeltilir.** Yanlış giriş soft delete ile kapatılır, düzeltme denetim kaydında eski ve yeni değerle görünür. Sistem zamanla hayvan yaşam döngüsü veri setine dönüşür.

Karar geçmişi:

- 2026-09-20 akşam: **Expo/React Native bırakıldı, frontend web oldu.** Sebep: native uygulamaya gerek yok (PC + tablet tarayıcı, iPhone PWA), RN Web masaüstünde zayıf, visx/MUI/shadcn kullanılamıyordu, expo-sqlite web alfa ve dev sunucusu proxy istiyordu. Yeni `apps/web`: Vite + shadcn/ui + Tailwind + VisActor. API, ortak paket, senkron protokolü, yerel şema ve feature depoları olduğu gibi taşındı; sadece ekranlar ve DB adaptörü yeniden yazıldı. `apps/mobile` 2026-09-21'de silindi.

- 2026-09-20: Supabase yerine kendi API ve tek docker compose. Sebep: Coolify üzerinde tek compose ile deploy istendi; self-host Supabase on küsur konteyner ve zor bakım demek.
- 2026-09-20: Backend'in saf JavaScript'e çevrilmesi düşünüldü, vazgeçildi. TypeScript ve tRPC kalıyor.
- 2026-09-20: Python içgörü servisi eklendi. Hayvan başına ve çiftlik geneli otomatik bulgular, Türkçe metin (bölüm 3.5, 4.7, Faz 5).
- 2026-09-20: Çiftlik bilgileri alındı (bölüm 10). Hayvan formu "burada doğdu / dışarıdan alındı" iki akışlı oldu. Toplu aşı girişi Faz 1'e alındı. Çevrimdışı çalışma, Excel içe aktarma ve aşı protokolleri düşük öncelik.
- 2026-09-20: Ürün konsepti netleşti: olay ve zaman çizelgesi merkezli profil, genel gözlem sistemi (`feed_observations` ve `animal_notes` yerine `observations`), Bugün ekranı, `predictions` tablosu, QR tarama Faz 1'e, damızlık kontrolü çiftleşme formuna. Tam olay kaynaklama (event sourcing) yapılmıyor; soft delete ve denetim kaydı yeterli.
- 2026-09-20: Ahırda sürekli Wi-Fi olmadığı öğrenildi, önceki "internet var" bilgisi düzeltildi. Çevrimdışı öncelikli mimari Faz 1'in başına alındı (1.2: expo-sqlite + Drizzle, outbox, push/pull senkron). İleride günde bir senkron olacak saha cihazı için bölüm 3.6 ve Faz 6 eklendi.
- 2026-09-20: Üç risk notu işlendi. iOS için PWA seçeneği 2.11'deki saha testine bağlandı, karar orada. QR içeriği küpe numarası yerine profil web adresi oldu. Socket.IO olayları satır başına değil batch başına tek olay, istemcide biriktirme.
- 2026-09-20: Üç teknik not işlendi. Kimlikler UUIDv7, Postgres 18'e yükseltildi. Outbox'ta reddedilen mutasyon kuyruğu tıkamaz, iş kuralları olay zamanına göre değerlendirilir. PWA yolunda OPFS tabanlı SQLite B planı 2.11'e yazıldı.

---

## 2. Kullanıcılar ve roller

| Rol | Yetki |
|---|---|
| owner | Her şey. Silme, finans, ayarlar, kullanıcı yönetimi. |
| worker | Hayvan ve stok kaydı girer, düzenler. Silemez. Finans ve raporları göremez. |
| vet | Sağlık kayıtlarını girer ve düzenler. Diğer her şeyi sadece okur. |

Yetki API katmanında tRPC middleware ile uygulanır, arayüz sadece gizler.

---

## 3. Teknoloji ve mimari

### 3.1 Uygulama katmanı (web)

- Vite 8, React 19, TypeScript 6, react-router 8 (SPA, `/a/<uuid>` QR yolu dahil).
- Tailwind v4 + shadcn/ui bileşenleri (`src/components/ui`), kendi bileşenler (`PageHeader`, `StatTile`, `EmptyState`, `SyncStatus`, `AppShell`). Sol menü 768 px altında çekmeceye döner.
- Yerel veritabanı: `@sqlite.org/sqlite-wasm` bir Web Worker'da (`src/db/sqlite.worker.ts`), OPFS dosyası `/anka.sqlite3`; OPFS yoksa bellek içi ve Ayarlar'da uyarı. Drizzle `sqlite-proxy` sürücüsü, aynı yerel şema ve bundle'a gömülü migration'lar (`.sql` Vite eklentisiyle metin olarak).
- TanStack Query yerel sorguları sarar (`networkMode: always`); tRPC client senkron uçları, auth ve raporlar için.
- Tema: `src/lib/theme.tsx`, `.dark` sınıfı, tercih localStorage.
- PWA: vite-plugin-pwa, manifest ve service worker; iOS'ta ana ekrana ekle.

Eski Expo katmanı (arşiv, `apps/mobile`, silinecek):

- Expo SDK 57, TypeScript 6, Expo Router (dosya tabanlı yönlendirme, typed routes, web'de URL desteği, web çıktısı `single` yani SPA).
- React Native Paper: tema, form bileşenleri, liste, dialog, snackbar.
- expo-sqlite + Drizzle (sqlite-core): cihazdaki yerel veritabanı. Sunucudaki tabloların aynası artı `outbox` ve `sync_cursors`. Migration'lar cihazda `useMigrations` ile. Ekranlar buradan okur, formlar buraya yazar.
- TanStack Query: yerel veritabanı sorgularını sarar, senkron sonrası invalidation. Rapor gibi sadece çevrimiçi ekranlarda sunucu önbelleği.
- tRPC client: senkron uçları (`sync.push`, `sync.pull`), auth, raporlar ve dosya yükleme. Uçtan uca tip güvenliği, tipler paylaşılan paketten.
- socket.io-client: `changed` olayı gelince pull tetikler, kopunca otomatik yeniden bağlanma. Bağlantı yokken sessiz.
- Web: bilgisayarda çevrimiçi öncelikli, aynı senkron uçları. iOS için PWA yolu seçilirse (bölüm 10, madde 2.11) telefondaki Safari'de de yerel veritabanı ve outbox çalışmak zorunda; expo-sqlite'ın web desteği orada doğrulanır, yetmezse IndexedDB tabanlı yedek katman yazılır.
- react-native-svg + d3: kilo grafiği, aylık gider, tüketim, stok trendi.
- Zustand: küçük UI durumu (seçili çiftlik, filtreler). Sunucu verisi Zustand'a girmez.
- Form: React state + zod (paylaşılan şemalar). react-hook-form gerekirse eklenir; şimdilik gerekmedi.
- Tarih: date-fns, Türkçe locale.

### 3.2 Backend katmanı

- Node 22 + Fastify. tRPC router'ları alan bazlı: animals (timeline dahil), health, breeding, weights, observations, stock, finance, reports, reminders, insights, predictions, audit, settings.
- Drizzle ORM: tablo şeması TypeScript'te, migration dosyaları `apps/api/drizzle` altında. View, fonksiyon ve trigger'lar SQL migration olarak yazılır (bölüm 4.5).
- Auth: e-posta + şifre, scrypt hash (Node yerleşik, native bağımlılık yok), kısa ömürlü access token (JWT, 15 dk) ve uzun ömürlü döndürmeli refresh token (rastgele, veritabanında sha256 özeti, 90 gün). Kayıt açık değil, kullanıcıyı owner açar. Roller `users.role` alanından okunur, tRPC middleware ile uygulanır.
- Senkron uçları: `sync.push` outbox'taki mutasyonları toplu alır, her biri kendi işleminde ve `mutation_id` ile tekrar güvenli (idempotent) uygulanır. Yanıt mutasyon başına sonuç döner: `applied`, `duplicate` veya `rejected { code, message }`. Bir mutasyonun reddi diğerlerini durdurmaz. `sync.pull` verilen `sync_seq` imlecinden sonra değişen satırları tablo bazında döner, soft delete dahil. Her tabloda `sync_seq bigint`, global sequence'ten trigger ile her yazmada yenilenir.
- İş kuralları olay zamanına göre değerlendirilir, sunucuya ulaşma zamanına göre değil. Ölüm tarihinden önce yapılmış bir aşı, ölüm kaydından sonra ulaşsa da kabul edilir; ölümden sonraki tarihli kayıt reddedilir ve sebebi yanıtta döner.
- Çakışma: aynı satıra iki taraftan yazıldıysa son yazan kazanır, kaybeden değer `audit_log`'da kalır. Olay tabloları ekleme ağırlıklı olduğu için nadir.
- Realtime: Socket.IO. Olay satır başına değil, push veya ingest batch'i başına bir kez yayılır: `{ farmId, tables: [...], count }`. 50 hayvana toplu aşı tek olay. İstemci gelen olayları 500 ms biriktirir ve tek `sync.pull` yapar; pull imleç tabanlı olduğu için kaç olay geldiği fark etmez. Odalar çiftlik bazlı.
- Cihaz alım ucu: REST `POST /ingest/batch`, cihaz API anahtarı ile, sadece yazma (bölüm 3.6).
- Dosya: fotoğraf ve belgeler `uploads` volume'unda. Yükleme API üzerinden, sharp ile boyutlandırma, erişim oturum kontrolüyle.
- Zamanlanmış işler: API içinde node-cron. Günlük hatırlatıcı üretimi, stok uyarısı, aylık özet.
- Push bildirim: sunucudan Expo Push API'ye istek.

### 3.3 Veri akışı

1. Kullanıcı formu doldurur. Girdi paylaşılan zod şemasıyla doğrulanır, kayıt cihazdaki SQLite'a yazılır ve `outbox` tablosuna bir mutasyon eklenir. Ekran anında güncellenir, bağlantı gerekmez.
2. Bağlantı varsa senkron işçisi outbox'ı sırayla `sync.push` ile gönderir. Sunucu her mutasyonu `mutation_id` ile tekrar güvenli uygular, Postgres'e yazar, trigger'lar türev veriyi günceller (doğumdan yavru, sağlık kaydından hatırlatıcı). Reddedilen mutasyon istemcide `failed` olur ve sıra devam eder; ağ veya sunucu hatasında kuyruk durur, üstel bekleme ile yeniden dener.
3. API `changed` olayını Socket.IO ile çiftlik odasına yayar. Açık diğer istemciler `sync.pull` ile kendi imleçlerinden sonrasını çeker, yerel veritabanını günceller, ekran yenilenir.
4. Bağlantı yoksa outbox birikir; üstte "senkron bekliyor: 3 kayıt" göstergesi. Bağlantı gelince önce push, sonra pull. Sahip ahırda girer, eve gelince telefon kendiliğinden gönderir.
5. Saha cihazı (ileride) aynı ilkeyle günde bir kez `POST /ingest/batch` gönderir; sunucu tarafında aynı uygulama katmanından geçer.

### 3.4 Dağıtım: Coolify, tek docker compose

Repo kökündeki `docker-compose.yml`, Coolify'da "Docker Compose" build pack ile git'ten deploy edilir. Her push'ta Coolify imajları yeniden kurar.

| Servis | İmaj / build | Görev |
|---|---|---|
| db | postgres:18-alpine | Veritabanı, `pgdata` volume |
| api | `apps/api/Dockerfile` | Fastify + tRPC + Socket.IO, `uploads` volume, port 3000 |
| insights | `apps/insights/Dockerfile` | Python FastAPI, içgörü hesabı, sadece iç ağ, port 8000 |
| web | `docker/web.Dockerfile` | `expo export` çıktısını nginx ile servis eder, port 80 |
| backup | prodrigestivill/postgres-backup-local | Günlük pg_dump, `backups` volume, 30 gün saklama |

Taslak (Coolify'ın `SERVICE_*` sihirli değişkenleri ve imaj etiketleri kurulum sırasında güncel dokümana göre doğrulanacak):

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: ankafarm
      POSTGRES_USER: ankafarm
      POSTGRES_PASSWORD: ${SERVICE_PASSWORD_DB}
      INSIGHTS_DB_PASSWORD: ${SERVICE_PASSWORD_INSIGHTS}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/db-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ankafarm"]
      interval: 10s
      retries: 5

  api:
    build: ./apps/api
    environment:
      SERVICE_FQDN_API_3000:
      DATABASE_URL: postgres://ankafarm:${SERVICE_PASSWORD_DB}@db:5432/ankafarm
      JWT_SECRET: ${SERVICE_BASE64_64_JWT}
      WEB_ORIGIN: ${SERVICE_URL_WEB}
      INSIGHTS_URL: http://insights:8000
    volumes:
      - uploads:/app/uploads
    depends_on:
      db:
        condition: service_healthy

  insights:
    build: ./apps/insights
    environment:
      DATABASE_URL: postgres://insights:${SERVICE_PASSWORD_INSIGHTS}@db:5432/ankafarm
      TZ: Europe/Istanbul
    depends_on:
      db:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
    environment:
      SERVICE_FQDN_WEB_80:
      API_URL: ${SERVICE_URL_API}
    depends_on: [api]

  backup:
    image: prodrigestivill/postgres-backup-local:18
    environment:
      POSTGRES_HOST: db
      POSTGRES_DB: ankafarm
      POSTGRES_USER: ankafarm
      POSTGRES_PASSWORD: ${SERVICE_PASSWORD_DB}
      SCHEDULE: "@daily"
      BACKUP_KEEP_DAYS: "30"
    volumes:
      - backups:/backups
    depends_on: [db]

volumes:
  pgdata:
  uploads:
  backups:
```

Notlar:

- Alan adları: `app.<domain>` web, `api.<domain>` API. TLS Coolify'ın Traefik'i ile otomatik.
- Web imajı API adresini derleme anında değil çalışma anında alır: nginx açılışta `API_URL` ile `config.json` üretir, uygulama onu okur. Böylece aynı imaj staging ve prod'da çalışır.
- API konteyneri açılışta `drizzle migrate` çalıştırır, sonra sunucuyu başlatır.
- Ortamlar: Coolify'da `staging` ve `prod` diye iki compose kaynağı, aynı repo, farklı branch.
- Mobil: EAS Build ile APK/AAB ve iOS build, EAS Update ile OTA. Bunlar Coolify dışında.
- Geliştirme: yerelde `docker compose up db` ile sadece Postgres, api ve mobil `pnpm dev` ile.
- Sunucu: 2 vCPU, 4 GB RAM yeterli. Hetzner CX22 sınıfı. Python servisi yaklaşık yarım GB ekler.

### 3.5 İçgörü servisi (Python)

Amaç: girilen ham kayıtlardan hayvan başına ve çiftlik geneli için otomatik bulgular üretmek ve bunları Türkçe cümle olarak sunmak. Örnekler:

- "Kilosu son 30 günde 4,2 kg (%9) düştü."
- "Önceki 30 günün 28'inde düzenli yedi, 3 gündür yemiyor."
- "Aynı yaş grubunun ortalamasının %18 üzerinde, aşırı kilolu olabilir."
- "Bu ay yonca tüketimi hayvan başına geçen aya göre %12 arttı, kilo artışı değişmedi."

Bu işin özü doğal dil işleme değil: istatistik ve kural tabanlı anomali tespiti, artı şablonla Türkçe metin üretimi. Gerçek NLP iki yerde isteğe bağlı olarak sonda duruyor.

Teknoloji: Python 3.12+ (yerelde 3.14, kök `.venv`), FastAPI, pandas, numpy, psycopg 3, APScheduler, pydantic. Araçlar: uv, ruff, pytest.

Çalışma şekli:

- Ayrı konteyner (`insights`). Sadece iç ağdan erişilir, dışarıya port açmaz. Uygulama Python'a hiç bağlanmaz, her şey Node API üzerinden geçer.
- Veritabanını doğrudan okur. `insights` adlı ayrı bir DB rolü: tüm tablolarda SELECT, sadece `insights` tablosunda INSERT ve UPDATE. Rol `docker/db-init/01-roles.sh` ile ilk kurulumda oluşur.
- Tetikleme: her gece 03:00 tam hesap. Gün içinde her `sync.push` veya cihaz batch'inden sonra Node API etkilenen hayvanlar için `POST /compute/animal/{id}` çağırır, 30 saniye debounce ile. Tüketim ve gider kaydından sonra `POST /compute/farm/{id}`. Kayıtlar günler sonra gelebilir; kurallar `occurred_at` üzerinden çalışır, kayıt zamanına bakmaz.
- Bildirim: Python sonucu yazdıktan sonra Postgres `NOTIFY insights_changed`. Node API `LISTEN` ile dinler, Socket.IO `changed` olayını yayar, uygulama içgörü listesini yeniler.
- Her kural saf bir Python fonksiyonu: veri çerçevesi alır, bulgu listesi döner. Eşikler `farms.settings.insights` altında çiftliğe göre ayarlanır, kodda sabit değil. Her kuralın birim testi var.
- Metin üretimi: Türkçe şablonlar sayılarla doldurulur. Sayılar `data` alanında ayrıca saklanır ki arayüz grafik çizebilsin.
- Küçük sürü kuralı: akran karşılaştırması (overweight, underweight, low_adg) aynı grupta en az 8 akran varsa çalışır, yoksa atlanır. 23 hayvanla çoğu kural mutlak eşiklerle çalışır; sürü büyüdükçe akran kuralları kendiliğinden devreye girer.
- Tahminler: Python, kilo eğilimi ve stok bitişi gibi tahminleri `predictions` tablosuna yazar; gece işi gerçekleşen kayıtları eşleştirip sapmayı hesaplar (bölüm 4.8).
- Gözlem birleştirme: servis teşhis koymaz, gözlemleri birleştirir. "3 gündür topallama, yem azalması ve durgunluk birlikte" gibi bulgular veterinere yönlendirir.

Kural kataloğu, ilk sürüm. Hayvan bazlı:

| Kural | Mantık | Varsayılan eşik |
|---|---|---|
| weight_drop | Son tartım, 30 gün öncekine göre düştü | %5 uyarı, %10 kritik |
| weight_trend_down | Son 5 tartımda doğrusal regresyon eğimi negatif | Günde 50 g |
| overweight / underweight | Aynı tür, cinsiyet ve yaş grubu ortalamasına göre z-skoru | ±1,5 |
| low_adg | Yavruda günlük ortalama kilo artışı akranlarının altında | Akran ortalamasının %70'i |
| feed_stopped | Ardışık "yemedi" günleri, öncesinde düzenli yiyordu | 2 gün |
| feed_reduced | Ardışık "az yedi" veya "yemedi" günleri | 4 gün |
| feed_per_animal_drop | Grubunda hayvan başı tüketim önceki 2 haftaya göre düştü | %15 |
| no_weighing | Tartılmayalı uzun süre oldu | 60 gün |
| withdrawal_active | İlaç arınma süresi devam ediyor | Süre boyunca |
| vaccine_overdue | `next_due_at` geçti | 0 gün |
| disease_recurring | Aynı hastalık kısa sürede tekrar etti | 90 günde 2 kez |
| birth_due | Beklenen doğuma az kaldı | 7 gün |
| pregnancy_check_due | Çiftleşmeden sonra kontrol yapılmadı | 45 gün |
| long_lambing_interval | Son doğumdan bu yana beklenenden uzun süre geçti | 400 gün |
| multi_observation | Son 3 günde birden fazla kategoride olağandışı gözlem (örn. topallama + az yedi + durgun) | 2 kategori, mild ve üstü |
| observation_worsening | Aynı kategoride şiddet art arda arttı | 2 kayıt |

Çiftlik geneli:

| Kural | Mantık |
|---|---|
| farm_cost_trend | Aylık gider önceki 3 ay ortalamasına ve geçen yılın aynı ayına göre |
| farm_feed_per_animal | Hayvan başı yem tüketimi ve maliyeti trendi, kalem bazında |
| farm_feed_vs_gain | Yem tüketimi arttı ama sürü kilo artışı artmadı |
| farm_mortality | Ölüm ve çıkış oranı önceki döneme göre |
| farm_birth_rate | Doğum oranı ve anne başına yavru, mevsim karşılaştırması |
| farm_growth_curves | Yaş grubu büyüme eğrileri ve sürü ortalamaları (rapor verisi) |
| farm_stock_runout | Mevcut tüketim hızıyla stok bitiş tarihi |
| farm_feed_refusal_spike | Yemeyen hayvan sayısı ani arttı, sürü sağlığı uyarısı |

İsteğe bağlı, ileride, bir LLM sağlayıcısı gerektirir:

- Serbest metin notları tarama: "topallıyor", "ishal" gibi belirtileri etiketleyip sağlık kaydı önerme.
- Türkçe soru sorma: "bu ay kaç kuzu doğdu", "en çok kilo alan beş koyun" gibi soruları SQL'e çevirip cevaplama.
- Haftalık çiftlik özeti paragrafı.

Bunlar kural motoru çalıştıktan sonra ayrı karar olarak ele alınır.

Yapay zeka yol haritası:

| Sürüm | Katman | Örnek çıktı | Ne zaman |
|---|---|---|---|
| V1 | Kural motoru | "Son 30 günde %5 kilo kaybetti." | Faz 5 |
| V2 | İstatistiksel analiz | "Kendi yaş grubunun %18 altında." | Faz 5, en az 8 akran |
| V3 | Tahmin | "Mevcut eğilimle 30 gün sonra 65 kg." Önce doğrusal eğilim, `predictions` tablosuna yazılır, gerçekleşenle ölçülür. Gerçek ML modeli yeterli veri birikince. | 5.13, ML sonra |
| V4 | LLM | "Bu ay çiftlikte ne değişti?" Sohbet, not tarama, haftalık özet. | 5.12, ayrı karar |
| V5 | IoT ve görüntü işleme | Hareket paterni, otomatik tartı, kamerayla sayım. | Kapsam dışı; `observations` ve `predictions` bunu engellemeyecek kadar esnek |

V3 için dürüst not: 23 hayvanla makine öğrenmesi anlamlı sonuç vermez. Bugün değerli olan, tahmin ve gerçekleşme çiftlerinin ilk günden birikmesi. Model o veri üzerine yıllar sonra kurulur.

### 3.6 Saha cihazı (gateway) ve toplu alım

Gelecek durum: ahırda bir mikrodenetleyici (ESP32 sınıfı) veya küçük bilgisayar (Raspberry Pi sınıfı) tartı, RFID okuyucu veya sensörlerden veri toplar, yerelde biriktirir, günde bir kez sunucuya gönderir. Bugün yapılmıyor; API ve veri modeli buna hazır kurulur, cihaz seçilince Faz 6 başlar.

- **Kimlik:** `devices` tablosu, cihaz başına API anahtarı (hash'li saklanır), `last_seen_at`, `last_sync_at`. Anahtar Ayarlar'dan üretilir ve iptal edilir.
- **Uç:** REST `POST /ingest/batch`, `Authorization: Bearer <cihaz anahtarı>`. Gövde: cihazın ürettiği UUID'li olay listesi. Her olayda `occurred_at` (cihaz saati), `type`, `payload`. Aynı UUID ikinci kez gelirse yok sayılır; cihaz onay alana kadar tekrar gönderebilir.
- **Olay türleri:** `weight` (küpe no veya RFID artı kg), `rfid_seen` (okuyucudan geçiş), `sensor_reading` (sıcaklık, nem, su seviyesi), `observation` (ileride, cihaz sınıflandırması).
- **Eşleme:** RFID veya küpe no ile hayvan bulunursa doğrudan ilgili olay tablosuna `source = device` ile yazılır. Bulunamazsa `ingest_pending` kuyruğuna düşer; sahip Bugün ekranında hayvana eşler veya reddeder.
- **Sensörler:** `sensor_readings` zaman serisi tablosu. Çiftlik geneli kurallar buradan da beslenir (su seviyesi düştü, sıcaklık eşik altı).
- **Saat:** cihaz saati kayabilir. Sunucu `received_at` ayrıca tutar, `occurred_at` cihazınki kalır. Büyük sapma varsa cihaz kartında uyarı.
- **Sözleşme aynı:** telefon outbox'ı da, cihaz batch'i de "istemci UUID'li, `occurred_at`'lı, tekrar güvenli toplu yazma" sözleşmesini kullanır. Sunucuda tek uygulama katmanı, iki giriş kapısı (tRPC `sync.push` kullanıcı token'ıyla, REST `ingest` cihaz anahtarıyla).
- **Güvenlik:** cihaz anahtarı sadece `ingest` ucunu çağırabilir, hiçbir şey okuyamaz. Hız sınırı ve batch boyutu sınırı var.
- **Referans istemci:** cihaz seçilince batch biriktirme ve tekrar gönderme mantığı için örnek kod (MicroPython veya C, cihaza göre) Faz 6'da yazılır.

---

## 4. Veri modeli

Tüm tablolarda ortak: `id uuid` (UUIDv7; istemci `uuid` paketinin `v7()` fonksiyonuyla, sunucu tarafı eklemeler Postgres `uuidv7()` ile üretir), `farm_id uuid`, `created_at`, `updated_at`, `created_by`, `sync_seq bigint` (global sequence, trigger ile her yazmada yenilenir, pull imleci). Olay tablolarında ek olarak `source` (app | web | device | import), `device_id`, `recorded_at` (cihazda kayıt anı; olay zamanı ayrı alanda). Aşağıda sadece tabloya özgü alanlar yazıldı.

### 4.1 Çekirdek

- **farms**: `name`, `location`, `settings jsonb` (gebelik süresi, para birimi, varsayılan birimler).
- **users**: `email` (tekil), `password_hash`, `full_name`, `role`, `phone`, `active`, `last_login_at`.
- **refresh_tokens**: `user_id`, `token_hash`, `expires_at`, `revoked_at`, `device`.
- **breeds**: `name`, `species` (sheep | goat), `is_seed` (tohumlanan mı, sahip eklediği mi). Çiftlik oluşturulunca yaygın ırklarla tohumlanır. Koyun: Kıvırcık, Merinos, Akkaraman, Morkaraman, Sakız, İvesi, Dağlıç, Karayaka, İle de France, Romanov, Suffolk, Texel, Dorper, Melez. Keçi: Kıl, Saanen, Alpin, Damascus, Ankara, Boer, Melez. Sahip listeye yeni ırk ekleyebilir.
- **groups**: `name`, `kind` (pen | pasture | quarantine | nursery), `capacity`, `active`. Padok, bölme ve mera burada. Çiftlik oluşturulunca "Ana sürü" grubu otomatik açılır; başka grup açılmadıkça her şey oraya girer.
- **animals**:
  - Kimlik: `tag_no` (resmi küpe, zorunlu, çiftlik içinde tekil), `rfid`, `name`, `species`, `breed_id`, `breed_note` (melez açıklaması), `sex` (female | male | castrated).
  - Köken: `origin` (born_here | purchased), `acquired_at` (alınma tarihi), `source` (satıcı), `purchase_price`. Burada doğanda anne zorunlu, baba isteğe bağlı; dışarıdan alınanda anne baba boş, ırk zorunlu. Fiyat girilirse `animal_purchase` kategorisinde gider kaydı açılır.
  - Doğum: `birth_date`, `birth_date_estimated bool`, `birth_type` (single | twin | triplet | quad), `birth_id` (lambing kaydı), `mother_id`, `father_id`.
  - Durum: `status` (active | sold | dead | slaughtered | lost), `group_id`, `photo_path`, `notes`.
  - Türev: `current_weight` (son tartım, trigger ile), `is_pregnant`, `expected_birth_at`.
- **group_movements**: `animal_id`, `from_group_id`, `to_group_id`, `moved_at`, `reason`.

### 4.2 Hayvan kayıtları (olay tabloları)

Aşağıdaki tabloların hepsi birer olaydır ve zaman çizelgesine düşer. Her tablonun kendi tarih alanı var (`weighed_at`, `applied_at`, `born_at`...), `v_animal_timeline` bunları `occurred_at` olarak birleştirir. Hepsinde ortak: `deleted_at`, `deleted_by`, `delete_reason`. Fiziksel silme yok; düzeltmeler `audit_log` üzerinden eski ve yeni değerle izlenir.

- **weight_records**: `animal_id`, `weighed_at`, `weight_kg numeric(6,2)`, `note`.
- **health_records**: `animal_id`, `type` (vaccine | medication | deworming | disease | exam | hoof | shearing | other), `product_name`, `dose`, `dose_unit`, `applied_at`, `vet_name`, `next_due_at`, `withdrawal_days`, `withdrawal_until` (hesaplanır), `cost`, `batch_id` (toplu işlemde ortak), `notes`.
- **health_protocols**: `name`, `species`, `active`. Çiftliğin yıllık aşı ve bakım programı.
- **protocol_items**: `protocol_id`, `type`, `product_name`, `trigger` (age_days | interval_days | fixed_month), `value int`, `repeat bool`.
- **breeding_records**: `female_id`, `male_id`, `method` (natural | ai), `mated_at`, `expected_birth_at` (mated_at + tür gebelik süresi), `pregnancy_checked_at`, `pregnancy_result` (pending | positive | negative), `notes`.
- **lambing_records**: `mother_id`, `father_id`, `breeding_id`, `born_at`, `difficulty` (easy | assisted | hard | cesarean), `live_count`, `stillborn_count`, `notes`. Her canlı yavru için `animals` satırı açılır ve `birth_id` bağlanır.
- **observations**: `animal_id` (veya `group_id`, sürü geneli gözlem için), `observed_at`, `category` (feeding | movement | behavior | respiratory | digestive | appearance | udder | reproductive | note | other), `severity` (normal | mild | moderate | severe), `tags text[]`, `note`, `photo_path`. Sahada görülen her şey buraya: "topallıyor", "burun akıntısı var", "durgun", "öksürüyor". Beslenme hızlı girişi de bu tabloya yazar: yedi = normal, az yedi = mild, yemedi = severe. Serbest not `category = note`, şiddet `normal`. Teşhis değil gözlem; teşhis `health_records` içinde `disease` olarak veteriner tarafından girilir.
- **observation_tags**: `category`, `label`, `is_seed`. Kategoriye bağlı hazır etiketler tohumlanır (hareket: topallama, yatıp kalkamama; solunum: öksürük, burun akıntısı, hızlı nefes; sindirim: ishal, şişkinlik, iştahsızlık; görünüm: tüy dökülmesi, göz akıntısı, yara; davranış: durgunluk, sürüden ayrılma, huzursuzluk). Sahip ekleyebilir.
- **exit_records**: `animal_id`, `type` (sold | died | slaughtered | lost), `exited_at`, `reason`, `price`, `buyer`, `notes`. Kayıt açılınca hayvanın `status` alanı güncellenir.

### 4.3 Stok ve finans

- **stock_items**: `name`, `category` (feed | water | medicine | supply | other), `unit` (kg | bale | liter | bucket | m3 | piece), `min_stock`, `track_stock` (false ise bakiye tutulmaz, sadece tüketim sayılır), `active`. Çiftlik oluşturulunca tohumlanır: yonca (kg), saman (balya), arpa (kg), su (kova, `track_stock` false, yağmur suyu). Sahip kalem ekler ve düzenler.
- **purchases**: `item_id`, `purchased_at`, `quantity`, `unit_price`, `total`, `supplier`, `document_path`, `notes`. Stoğa giriş ve aynı zamanda gider.
- **consumptions**: `item_id`, `consumed_on date`, `quantity`, `group_id` (null ise tüm çiftlik), `animal_id` (bireysel yemleme için), `notes`. Stoktan çıkış.
- **expenses**: `category` (animal_purchase | water | electricity | labor | vet | fuel | equipment | rent | tax | other), `spent_at`, `amount`, `description`, `animal_id` (hayvan alımında), `document_path`. Stok dışı giderler.
- **incomes**: `category` (animal_sale | milk | wool | manure | subsidy | other), `received_at`, `amount`, `animal_id`, `description`.

### 4.4 Sistem

- **reminders**: `title`, `type`, `due_at`, `animal_id`, `group_id`, `source_table`, `source_id`, `done_at`, `done_by`. Sağlık kaydı ve protokolden otomatik üretilir, elle de eklenir.
- **attachments**: `entity_table`, `entity_id`, `storage_path`, `kind` (photo | invoice | document), `mime`.
- **audit_log**: `table_name`, `record_id`, `action`, `old_data jsonb`, `new_data jsonb`, `user_id`, `device_id`, `mutation_id`. Trigger ile dolar.
- **devices**: `name`, `kind` (gateway | scale | rfid_reader | sensor), `api_key_hash`, `active`, `last_seen_at`, `last_sync_at`, `clock_offset_seconds`, `firmware_version`, `notes`.
- **ingest_pending**: `device_id`, `event_id` (cihaz UUID'si), `occurred_at`, `received_at`, `type`, `payload jsonb`, `status` (pending | matched | rejected), `matched_animal_id`, `resolved_by`, `resolved_at`.
- **sensor_readings**: `device_id`, `measured_at`, `metric` (temperature | humidity | water_level | other), `value numeric`, `unit`. Zaman serisi, `(device_id, metric, measured_at)` indeksli.
- **applied_mutations**: `mutation_id` (tekil), `applied_at`, `user_id`, `device_id`. Push ve ingest tekrarlarını yakalamak için; 90 günden eskiler temizlenir.

İstemci tarafı, sadece SQLite'ta:

- **outbox**: `mutation_id`, `table`, `op` (insert | update | soft_delete), `row_id`, `payload`, `created_at`, `status` (pending | failed), `attempts`, `last_error`, `rejection_code`. Sunucu onaylayınca satır silinir; reddedilen `failed` kalır ve ilgili yerel kayıt "senkron edilemedi" işaretiyle görünür.
- **sync_cursors**: tablo başına son alınan `sync_seq`.
- **upload_queue**: fotoğraf ve belgeler için yerel yol, hedef kayıt, durum.

### 4.5 View ve fonksiyonlar

- `v_animal_timeline`: tüm olay tablolarını `(animal_id, occurred_at, event_type, title, summary, payload jsonb, source_table, source_id, created_by)` biçiminde birleştirir. Uygulamadaki `AnimalEvent` tipiyle birebir. Uygulama çevrimdışıyken zaman çizelgesini yerel SQLite'tan `packages/shared` içindeki `toAnimalEvent` eşleyicileriyle kurar; view sunucu, rapor ve Python için. İkisi aynı şekli üretir, testle doğrulanır. Yeni olay tablosu eklenince ikisine de eklenir.
- `fn_pedigree(animal_id, depth)`: recursive CTE ile n nesil ata.
- `fn_offspring(animal_id)`: yavrular ve torunlar.
- `fn_relatedness(female_id, male_id)`: ortak atalar, en yakın ortak atanın kaç nesil uzakta olduğu, yaklaşık akrabalık katsayısı. Çiftleşme formunda anında uyarı.
- `fn_breeding_summary(animal_id)`: doğum sayısı, toplam yavru, ölü doğum, yavru yaşama oranı, ortalama doğum aralığı; erkek için babası olduğu yavrular ve onların ortalama doğum kilosu. Çiftleşme formunda geçmiş performans kartı.
- `v_prediction_accuracy`: `predictions` tablosunda gerçekleşeni gelen kayıtlar için sapma ve `model_version` bazlı ortalama hata.
- `v_stock_levels`: kalem bazında alım eksi tüketim, gün cinsinden kalan süre.
- `v_monthly_costs`: ay, kategori, kalem bazında gider toplamı.
- `v_group_daily_feed_per_animal`: grup tüketimi bölü o günkü hayvan sayısı.
- `fn_dashboard(farm_id)`: pano sayıları tek çağrıda.
- Trigger'lar: `sync_seq` yenile, `current_weight` güncelle, doğumdan yavru oluştur, çıkıştan status güncelle, sağlık kaydından hatırlatıcı üret, `withdrawal_until` hesapla, audit yaz.

Hepsi Drizzle SQL migration dosyalarında yaşar; API bunları Drizzle üzerinden çağırır.

### 4.6 Güvenlik

- Yetki API katmanında: her tRPC prosedürü oturumdaki `farm_id` ile filtreler. İstemciden gelen `farm_id` hiçbir zaman kabul edilmez.
- Rol kısıtları tRPC middleware'de: silme prosedürleri sadece `owner`. `worker` finans ve rapor prosedürlerini çağıramaz. `vet` sadece sağlık prosedürlerini yazar.
- Token saklama: mobilde SecureStore. Web'de access token bellekte, refresh token şimdilik localStorage (0.3). HttpOnly cookie'ye geçiş 4.x'te, çapraz alan adı için SameSite=None ve CORS credentials ayarıyla birlikte.
- Dosyalar doğrudan servis edilmez, API oturum kontrolüyle döner.
- API'ye hız sınırı (giriş denemeleri), CORS sadece web alan adına.
- Şifreler scrypt (N=2^15, r=8, p=1), en az sekiz karakter. argon2 yerine seçildi: Node yerleşik, native derleme yok, Docker imajı tek dosya.
- Python servisi ayrı DB rolü ile çalışır, dışarıya port açmaz, Node API dışında kimse çağıramaz.
- Çevrimdışı kullanım için refresh token ömrü uzun (90 gün). Yerel SQLite cihaz şifresiyle korunur; telefon kilidi yeterli, ayrıca şifreleme yok.
- Cihaz anahtarları sadece `ingest` ucuna erişir, `farm_id` anahtara bağlıdır, istemciden gelmez.

### 4.7 İçgörüler

- **insights**: `animal_id` (çiftlik geneli için null), `type` (bölüm 3.5 kataloğundaki kural adı), `severity` (info | warning | critical), `title`, `message`, `data jsonb` (hesapta kullanılan sayılar), `computed_at`, `valid_until`, `acknowledged_at`, `acknowledged_by`, `snoozed_until`.
- Tekillik: `(farm_id, animal_id, type)` için tek aktif kayıt. Yeniden hesapta upsert; koşul ortadan kalkınca `valid_until` geçmişe çekilir, silinmez.
- Eşikler ayrı tablo değil, `farms.settings.insights` jsonb altında. Örnek: `{ "weight_drop_pct": 5, "feed_stopped_days": 2, "no_weighing_days": 60 }`.
- Trigger yok; bu tabloya sadece Python yazar, Node okur ve `acknowledged_at` ile `snoozed_until` alanlarını günceller.

### 4.8 Tahminler

- **predictions**: `animal_id` (çiftlik geneli için null), `type` (birth_date | weight | lamb_count | weaning_weight | feed_runout), `predicted_value numeric`, `predicted_payload jsonb` (aralık, girdi özeti), `confidence` (0 ile 1, kural tabanlıysa null), `predicted_at`, `target_date`, `model_version` (örn. `gestation-rule-v1`, `weight-trend-v1`), `source` (rule | stats | ml), `actual_value`, `actual_source_table`, `actual_source_id`, `evaluated_at`, `error` (gerçek eksi tahmin).
- Kim yazar: Faz 1'de Node, kural tabanlı. Çiftleşme kaydı açılınca `birth_date` tahmini yazılır. Faz 5'ten itibaren Python: kilo eğilimi, stok bitişi, yavru sayısı.
- Kim değerlendirir: ilgili gerçek kayıt girilince (doğum, tartım) Node servisi `actual_value` doldurur. Gece işi eksik kalanları tarar.
- Amaç: bugün "beklenen 18 Ekim, gerçek 21 Ekim, sapma +3 gün" göstermek; yıllar içinde model doğruluğunu ölçülebilir kılmak. Gerçek ML bu tablo dolmadan başlamaz.

---

## 5. Ekranlar ve modüller

Expo Router yapısı ve içerik:

- **Giriş**: e-posta + şifre, şifre sıfırlama.
- **Bugün** `/`: ana ekran. Sırayla: senkron durumu (bekleyen kayıt, son senkron; ileride cihazın son görülme zamanı ve eşleşmeyen kayıtlar), kritik uyarılar (yemeyen, aşısı geciken, olağandışı gözlemi olan), bugünkü işler (tartılacaklar, gebelik kontrolü, hatırlatıcılar), yaklaşan doğumlar (kaç gün kaldı), yem stok kalan gün, bu ayın gideri, öne çıkan içgörüler. Üstte KPI şeridi: sürü sayısı, aşı uyumu yüzdesi, kilo eğilimi, yem trendi, aktif sağlık uyarısı sayısı, gebe sayısı. Tek yapay skor yok; her rakam ölçülebilir ve dokununca kaynağına gider.
- **Hayvanlar** `/animals`: liste, küpe no ile hızlı arama, filtre (tür, cinsiyet, grup, durum, gebe), sıralama, QR tarama. Kart görünümü telefonda, tablo görünümü tablet ve web'de.
- **Hayvan profili** `/animals/[id]`: dijital ikiz. Başlık kartı: küpe no, isim, yaş (yıl ve ay), cinsiyet, ırk, son kilo ve alan bazlı durum rozetleri (sağlık, beslenme, kilo, üreme; yeşil, sarı, kırmızı). Rozetler Faz 5'e kadar Node'daki basit kurallardan gelir (aşı gecikmiş, arınma sürüyor, 3 gündür olağandışı gözlem), sonra içgörülerden. İlk sekme Zaman çizelgesi: tüm olaylar tarih sırasıyla, tür filtresi, sonsuz kaydırma, beklenen ile gerçekleşen yan yana. Diğer sekmeler: İçgörüler, Sağlık, Üreme, Kilo (grafik), Gözlemler, Soy ağacı, Yavruları, Fotoğraflar. Sağ altta "olay ekle" düğmesi: tartım, aşı, ilaç, gözlem, not, grup değişimi, çıkış.
- **İçgörüler** `/insights`: çiftlik geneli bulgular, hayvan bazlı bulguların şiddete göre listesi, okundu ve sustur işlemleri, eşik ayarlarına kısayol.
- **Hayvan ekle / düzenle** `/animals/new`, `/animals/[id]/edit`. İlk soru "nereden geldi":
  - Burada doğdu: anne seçimi zorunlu (aktif dişiler arasından küpe no veya isimle arama), baba seçimi isteğe bağlı (erkekler arasından), doğum tarihi, doğum tipi. Irk anneden gelir, değiştirilebilir. Doğum kaydı da otomatik açılır.
  - Dışarıdan alındı: ırk zorunlu (listeden, yoksa oradan yeni ekle), alınma tarihi, satıcı, fiyat (isteğe bağlı, girilirse gider kaydı açılır), tahmini doğum tarihi veya yaş.
  - Ortak alanlar: küpe no, cinsiyet, tür, grup (varsayılan Ana sürü), fotoğraf, not. "Kaydet ve yeni ekle" ile 21 hayvan arka arkaya girilir.
- **Toplu işlem** `/bulk`: varsayılan seçim "tüm aktif hayvanlar", tek dokunuşla sürünün tamamına aşı veya ilaç girilir. İstenirse grup, filtre veya tek tek seçim. Aynı ekrandan tartım, grup taşıma ve kırkım da toplu girilir. Tekli giriş hayvan profilinden.
- **Üreme** `/breeding`: çiftleşme kayıtları, gebelik takvimi, beklenen doğumlar. Çiftleşme formu dişi ve erkek seçilince anında gösterir: akrabalık kontrolü (ortak ata, kaç nesil), iki hayvanın geçmiş performansı (doğum sayısı, yavru sayısı, yaşama oranı), erkeğin diğer yavrularının ortalama doğum kilosu. Uyarı engellemez, sahip bilerek kaydeder.
- **Stok** `/stock`: kalemler, stok seviyeleri, alım girişi, günlük tüketim girişi.
- **Finans** `/finance`: giderler, gelirler, aylık özet.
- **Raporlar** `/reports`: bölüm 6'daki raporlar, tarih aralığı seçimi, dışa aktarma.
- **Hatırlatıcılar** `/reminders`: bugün, bu hafta, geciken; tamamla.
- **Değişiklik geçmişi** `/audit`: kim, ne zaman, hangi hayvanda, neyi değiştirdi; eski ve yeni değer yan yana ("Kilo: 61,2 → 63,4 kg"). Hayvan profilinden o hayvana filtreli açılır. Worker rolü geldiğinde asıl değerini gösterir.
- **Ayarlar** `/settings`: çiftlik bilgisi, ırklar, gruplar, gözlem etiketleri, aşı protokolleri, stok kalemleri, içgörü eşikleri, kullanıcılar, cihazlar ve API anahtarları, senkron durumu, yedek ve dışa aktarma.

Arayüz ilkeleri: büyük dokunma alanları, en sık işlemler iki dokunuşta, her formda "kaydet ve yeni ekle", bağlantı yokken her şey çalışır ve üstte küçük "senkron bekliyor" göstergesi durur, tüm metinler Türkçe.

---

## 6. Raporlar ve pano

Hayvan raporları:

- Sürü yapısı: tür, cinsiyet, yaş grubu, ırk dağılımı.
- Doğum performansı: doğum oranı, anne başına yavru sayısı, ölü doğum oranı, doğum zorluğu dağılımı, mevsime göre.
- Büyüme: günlük ortalama kilo artışı, sütten kesim kilosu, yaş gruplarına göre kilo eğrisi.
- Sağlık: aşı takvimine uyum, hastalık sıklığı, ilaç maliyeti, arınma süresi devam eden hayvanlar.
- Çıkışlar: satış, ölüm, kesim; nedenleri ve gelirleri.

Stok ve finans raporları:

- Aylık gider dağılımı, kategori ve kalem bazında, geçen ayla ve geçen yılın aynı ayıyla karşılaştırma.
- Kalem bazında aylık tüketim: yonca, saman, arpa kg; su m3.
- Stok seviyeleri ve kalan gün; minimum altına düşünce uyarı.
- Hayvan başı aylık maliyet ve grup başı maliyet.
- Kilo artışı başına yem maliyeti.
- Gelir ve gider dengesi, aylık ve yıllık.

Grafik türleri: çizgi (kilo, tüketim trendi), çubuk (aylık gider), yığılmış çubuk (kategori dağılımı), halka (yem kalem payı), soy ağacı (özel SVG).

---

## 7. Fazlar

Her madde numaralı. Yönlendirme "2.3'ü yapalım" şeklinde olabilir. Tamamlananlar `[x]` ile işaretlenir.

Öncelik sırası (2026-09-20):

| Öncelik | Geliştirme | Maddeler |
|---|---|---|
| Yüksek | Çevrimdışı öncelikli senkron | 1.2, 2.10, 4.1 |
| Yüksek | Olay ve zaman çizelgesi merkezli profil | 1.5, 1.13 |
| Yüksek | Genel gözlem sistemi | 1.13, 2.6 |
| Yüksek | Bugün ekranı | 1.17, 2.8 |
| Yüksek | QR tarama | 1.16 |
| Yüksek | Tahmin veri modeli | 1.1, 1.9, 1.10 |
| Orta | Damızlık analitiği | 1.9, 3.7 |
| Orta | Değişiklik geçmişi ekranı | 3.9 |
| Düşük | Tahmin modelleri | 5.13 |
| Düşük | LLM asistan | 5.12 |
| Sonra | Saha cihazı (gateway) | Faz 6, cihaz alınınca |
| Sonra | Görüntü işleme | Kapsam dışı, bölüm 3.5 yol haritası |

### Faz 0: Kurulum

- [x] 0.1 Monorepo: pnpm workspaces, `apps/mobile`, `apps/api`, `packages/shared`. Expo projesi: TypeScript, Expo Router, Paper, tema, Türkçe locale. (2026-09-20: web export ve typecheck temiz; `apps/api` sadece yer tutucu, 0.2'de dolacak.)
- [x] 0.2 API iskeleti: Fastify, tRPC, Drizzle, Postgres bağlantısı, health endpoint, ilk migration (`farms`, `users`, `refresh_tokens`). (2026-09-20. Notlar: şifre hash'i argon2 yerine Node'un yerleşik scrypt'i, native bağımlılık olmasın ve Docker imajı tek dosya kalsın diye. Migration'lar API açılışında otomatik. Yerel Docker Postgres host portu 5433, çünkü 5432 makinedeki yerel Postgres servisine ait.)
- [x] 0.3 Auth: giriş, refresh (döndürmeli), çıkış, sahip kullanıcı açar (`users.create`), rol middleware'i, seed ile ilk sahip hesabı. (2026-09-20. Refresh token web'de de gövdede döner ve localStorage'da tutulur; HttpOnly cookie sertleştirmesi 4.x'te, çapraz alan adı CORS ve SameSite ayarıyla birlikte.)
- [x] 0.4 Mobil auth akışı: giriş ekranı, SecureStore/localStorage token saklama, açılışta refresh ile oturum geri getirme, 401'de tek seferlik yenileme ve tekrar. Sunucuya ulaşılamazsa oturum korunur (çevrimdışı açılış). (2026-09-20)
- [x] 0.5 Uygulama iskeleti: sekmeli navigasyon (Bugün, Hayvanlar, Stok, Ayarlar), tema, Splash, Ayarlar'da hesap, çiftlik, kullanıcı listesi, çıkış. (2026-09-20)
- [x] 0.6 Docker: `docker-compose.yml` (db, api, web, backup; insights Faz 5'te eklenecek), `docker-compose.override.yml` yerel portlar, api ve web Dockerfile'ları, nginx SPA yedeği ve `config.json` üreten açılış betiği. Yerelde `docker compose up --build` ile test edildi: API konteynerde migration ve login çalıştı, web 8080'de index, config.json ve `/a/<uuid>` yedeği döndü. (2026-09-20. İmajlar: api 261 MB, web 100 MB.)
- [x] 0.7 Coolify: Hostinger KVM 2 (Ubuntu 24.04, 8 GB), repo bağlı, alan adları farmanka.com ve api.farmanka.com (Turhost DNS, dns1/dns2.turhost.com), TLS otomatik, www → ana adres. Deploy'da öğrenilenler: Dockerfile kök tsconfig.base.json'ı kopyalamalı; lockfile'da eski peer çözümleri kalabiliyor (yeniden çözümle); Coolify `expose` satırından portu okur. (2026-09-21) Sahip hesabı için `SEED_OWNER_EMAIL` ve `SEED_OWNER_PASSWORD` Coolify'da ortam değişkeni olarak verilir.
- [x] 0.8 Araçlar: Prettier, .editorconfig, oxlint (Vite ile). CI (GitHub Actions): tip kontrolü, API ve web derlemesi, `scripts/check-migrations.mjs` ile migration/journal tutarlılığı. Uçtan uca testler CI'da koşmuyor (tarayıcı ve veritabanı ister), yerelde `corepack pnpm e2e` ve `sync-stress`. (2026-09-21)
- [x] 0.9 Web'e geçiş (2026-09-20 akşam): `apps/web` iskeleti, shadcn kurulumu, tema, kabuk (sol menü, üst çubuk, senkron rozeti, tema düğmesi), giriş, Bugün (gerçek KPI'lar: sürü, dişi/erkek, gebe, uyarılar; işler, doğumlar, son tartımlar), Hayvanlar tablo, Ayarlar (çiftlik, hesap, kullanıcılar, sistem), Gruplar, Senkron durumu. `scripts/e2e-web.mjs` 9 adım geçiyor (OPFS kalıcılığı dahil). Sonra profil (Olaylar / Özet / Sağlık / Kilo / Üreme / Soy ağacı sekmeleri, olay ekleme menüsü, tartım ve sağlık dialogları), hayvan formu (aranabilir seçiciler), toplu sağlık (grup seçici + tablo, geri al), üreme ve soy ağacı bölümleri taşındı; kilo grafiği VisActor. e2e 20 adım geçiyor. Tema nötr gri (kahve tonu kaldırıldı, kullanıcı isteği).

### Faz 1: Hayvan çekirdeği

Her özellik maddesi çevrimdışı çalışır: yerel SQLite'a yazar, outbox'a düşer, senkronla sunucuya gider. Bu her maddede tekrar yazılmadı, bölüm 9'daki kural geçerli.

- [x] 1.1 Migration: `breeds`, `groups`, `animals`, `group_movements`, `audit_log` ve trigger'ı, `predictions`, `applied_mutations`, `sync_seq` sequence ve trigger'ı; okuma router'ları (`animals`, `breeds`, `groups` list) ve `farm_id` filtresi. Seed: 21 ırk, "Ana sürü". (2026-09-20. Doğrulandı: trigger'lar sync_seq ve audit_log'u dolduruyor, audit satırında user_id ve mutation_id var.)
- [x] 1.2 Çevrimdışı altyapı. Sunucu: `sync.push` mutasyon başına sonuç (applied, duplicate, rejected VALIDATION/CONFLICT/NOT_FOUND/FORBIDDEN), her mutasyon kendi işleminde, `sync.pull` tablo başına imleç; curl ile doğrulandı. İstemci: expo-sqlite + Drizzle sqlite-proxy sürücüsü (tamamen asenkron), bundle'a gömülü migration ve kendi asenkron migrator, UUIDv7 (`lib/ids.ts`), `outbox`, `sync_cursors`, `meta`, senkron işçisi (push sonra pull, üstel bekleme, 1,5 sn birleştirme), tetikleyiciler, SyncBanner (cihaz ağı ile sunucu erişilebilirliği ayrı), Ayarlar > Gruplar ve Ayarlar > Senkron durumu. (2026-09-20. Uçtan uca web testi `scripts/e2e-web.mjs` ile sistem Chrome'unda geçti: giriş, ilk pull, çevrimiçi grup ekleme sunucuda görüldü, çevrimdışı ekleme kuyrukta bekledi ve bağlantı gelince sunucuya gitti, yenileme sonrası yerel veri durdu. Öğrenilenler: expo-sqlite web senkron çağrılarda zaman aşımı, o yüzden asenkron; Expo 57 dev sunucusu HTML'e COOP/COEP eklemediği için `web-dev-proxy.mjs`; sqlite-proxy sürücüsü `casing` ayarını sadece üçüncü argümandan okur; TanStack Query `networkMode: "always"` yoksa çevrimdışıyken yerel sorgular askıya alınır. Gerçek telefonda test ve `toAnimalEvent` 1.5'te.)
- [x] 1.3 Hayvan listesi: küpe no ve isimle arama, tür, cinsiyet ve arşiv çipleri, küpe sırası, satırda ırk, grup, yaş ve son kilo; senkron bekleyen satırda bulut simgesi. Yerel veritabanından okur (`features/animals/repo.ts`). (2026-09-20. Tablet ve web için tablo görünümü sonra.)
- [x] 1.4 Hayvan ekle/düzenle formu: "burada doğdu / dışarıdan alındı" akışı, anne ve baba seçimi (aynı tür, aranabilir), ırk anneden gelir, ırk seçimi ve yeni ırk ekleme, melez açıklaması, tarih alanı GG.AA.YYYY, küpe no yerel tekillik ve paylaşılan zod doğrulaması, alan bazlı hata mesajları, "kaydet ve yeni ekle", düzenleme modu. Profil yer tutucusu `[id].tsx` (başlık kartı; zaman çizelgesi 1.5'te). (2026-09-20. e2e: dışarıdan alınan ve burada doğan hayvan sunucuda doğru alanlarla görüldü, aynı küpe yerelde reddedildi. Ertelenen: fotoğraf kuyruğu 3.8'e, alım fiyatından otomatik gider kaydı Faz 2.5'e, doğumda otomatik doğum kaydı 1.10'a. Form durumu React state + zod; react-hook-form gerekmedi.)
- [x] 1.5 Profil ekranı: başlık kartı (tür, cinsiyet, ırk, yaş; kilo, grup, durum ve senkron rozetleri), Özet / Zaman çizelgesi / Kilo sekmeleri, "Olay ekle" düğmesi (seçim dialogu). `AnimalEvent` tipi ve eşleyiciler `packages/shared/src/events.ts` (`createdEvent`, `weightEvent`, `groupMoveEvent`, `buildTimeline`); cihazda yerel tablolardan kurulur (`features/animals/timeline.ts`). (2026-09-20. `v_animal_timeline` SQL view ertelendi: sunucu ve Python ihtiyaç duyana kadar eşleyici tek kaynak; ilk gerçek ihtiyaç Faz 5. Her sonraki olay tablosu eşleyicisini ve kartını ekler.)
- [x] 1.6 Kilo kayıtları: `weight_records` sunucu ve yerel migration, senkron kaydı, tartım dialogu (kg, tarih, not), Kilo sekmesinde liste ve çizgi grafik (`charts/LineChart.tsx`, react-native-svg + d3), zaman çizelgesinde önceki tartıma göre fark, `anka_refresh_current_weight` trigger'ı sunucuda ve aynı hesap yerelde (outbox'sız). (2026-09-20. e2e: tartım sonrası rozet, zaman çizelgesi ve sunucudaki türev kilo doğrulandı; ikinci tartımda +2,5 kg farkı ve grafik.)
- [x] 1.7 Sağlık kayıtları: `health_records` sunucu ve yerel migration, senkron kaydı (vet rolü de yazar), ortak `HealthForm` (tür çipleri, ürün, doz ve birim, tarih, veteriner, sonraki doz, arınma günü, maliyet, not), profilde Sağlık sekmesi ve rozet (arınma sürüyor / doz gecikmiş / sonraki doz), zaman çizelgesinde sağlık olayı. `withdrawal_until` sunucuda trigger ile, cihazda aynı hesapla. (2026-09-20. e2e: sunucudaki türev arınma tarihi bugün+7 olarak doğrulandı.)
- [x] 1.8 Toplu sağlık girişi (`animals/bulk.tsx`, listedeki iğne düğmesi): varsayılan tüm aktif hayvanlar, grup çipiyle daraltma, tek tek çıkarma, aynı form, ortak `batch_id`; kaydettikten sonra "Geri al" hepsini soft delete eder (sahip). Tek yerel işlemde yazılır, tek push ile gider (`insertManyLocal`, `softDeleteManyLocal`). (2026-09-20. e2e: 13 hayvana toplu parazit ilacı, sunucuda batch_id ile görüldü, geri alma sunucuya yansıdı.)
- [x] 1.9 Üreme: `breeding_records` her katmanda, çiftleşme dialogu (eş seçici, anlık akrabalık kontrolü yerel soy ağacından, iki hayvanın geçmiş performansı), gebelik kontrolü (gebe / değil), `is_pregnant` ve `expected_birth_at` sunucuda trigger, cihazda aynı kural; çiftleşme kaydı sunucuda `predictions`'a `birth_date` tahmini yazar (`modules/sync/hooks.ts`). SQL: `fn_pedigree`, `fn_offspring`, `fn_relatedness` (migration 0008). (2026-09-20. e2e: gebe rozeti ve sunucudaki tahmin doğrulandı; kardeş çiftleştirmede ortak ata uyarısı.)
- [x] 1.10 Doğum: `lambing_records`, doğum dialogu (tarih, zorluk, ölü doğum, her canlı yavru için küpe ve cinsiyet); yavrular otomatik hayvan olur (burada doğdu, anne ve baba, ırk ve grup anneden, `birth_id`), gebelik biter, tahmin gerçekleşenle eşleşir ve sapma gün olarak yazılır. (2026-09-20. e2e: yavru sunucuda anne/baba/birth_id ile, tahmin `evaluated_at` dolu.)
- [x] 1.11 Soy ağacı: profilde sekme, üç nesil ata ve yavrular, tamamı yerel veritabanından (`features/animals/pedigree.ts`); sunucu SQL fonksiyonları raporlar için. (2026-09-20)
- [x] 1.12 Çıkış kayıtları ve arşiv: `exit_records` her katmanda, sunucu trigger'ı `anka_refresh_animal_status` durumu türetir, istemci çevrimdışıyken aynı kuralı yerelde uygular; profilde çıkış dialogu, arşiv listesi, sahip için geri alma. (2026-09-20)
- [x] 1.13 Gözlemler: `observations` ve `observation_tags` her katmanda, çiftlik açılışında etiket tohumu, kategori + şiddet + etiket seçimli dialog, profilde Gözlemler sekmesi ve "son 3 gün olağandışı" rozeti, Bugün listesinde olağandışı gözlemler, zaman çizelgesi kartı. Fotoğraf 1.17'ye kaldı. (2026-09-20)
- [x] 1.14 Realtime: `modules/realtime` Socket.IO gateway (JWT handshake, `farm:<id>` odası), `sync.push` sonrası batch başına tek `changed` olayı, istemci `sync/realtime.ts` 500 ms biriktirip tek pull; e2e'de ikinci tarayıcıdan eklenen grup ilkinde kendiliğinden görünüyor. (2026-09-20)
- [x] 1.15 Grup yönetimi ve hayvan taşıma: `group_movements` her katmanda, sunucu trigger'ı `anka_refresh_animal_group` (son silinmemiş hareket grubu belirler, son hareket silinirse geldiği gruba döner; migration 0011), istemci aynı kuralı yerelde uygular. Profilde "Grup değiştir", listede çoklu seçim + "Gruba taşı" (tek push), listede grup filtresi (dropdown+arama, `?group=` parametresi), Gruplar sayfasında hayvan sayısı, kapasite aşımı uyarısı, düzenleme; içinde hayvan olan grup silinemez. (2026-09-21)
- [x] 1.16 QR tarama (web): QR içeriği profil adresi `https://app.<domain>/a/<uuid>`; `/scan` sayfası tarayıcı kamerasıyla okur (Chrome/Android'de yerleşik BarcodeDetector, diğerlerinde jsQR), adresi yerel veritabanında çözer ve profili açar, çevrimdışı çalışır; kamera yoksa küpe no veya adres elle girilir. Profilde QR dialogu (canvas, bağlantı kopyala, tek etiket yazdır). Girişsiz gelen `/a/<id>` giriş sonrası aynı profile döner. Alan adına bakılmaz, eski etiketler taşınmada geçerli kalır. Toplu PDF basımı 3.5'te. (2026-09-21)
- [x] 1.17 Bugün ekranı v1: senkron kartı (durum, son senkron, şimdi senkronla), KPI şeridi (sürü, dişi/erkek, gebe, bekleyen iş; 60 gündür tartılmayan sayısı), bugünkü işler (geciken doz, olağandışı gözlem, 45 günü geçen gebelik kontrolü, süren arınma), yaklaşan doğumlar kaç gün kaldı rozetiyle, çiftlik geneli son olaylar akışı (`useRecentEvents`, paylaşılan eşleyiciler, toplu sağlık tek satır). Hepsi yerel veriden. (2026-09-21)

### Faz 2: Stok, finans, pano

- [x] 2.1 Migration 0012 (tablolar) ve 0013 (trigger'lar, view'lar): `stock_items`, `purchases`, `consumptions`, `expenses`, `incomes`; senkron ve denetim trigger'ları, alım tutarı türevi (`anka_purchase_amounts`), `v_stock_levels`, `v_monthly_costs`, `v_monthly_income`. Kalem tohumu (yonca, saman, arpa, su) yeni ve mevcut çiftliklere. Finans satırları yalnızca sahibin cihazına pull edilir. (2026-09-21)
- [x] 2.2 Stok kalemleri ve alım girişi: Stok ekranı, kalem dialogu (ad, kategori, birim, alt sınır, bakiye tut anahtarı), alım dialogu (birim fiyat ↔ toplam otomatik), alım listesi. (2026-09-21)
- [x] 2.3 Günlük tüketim girişi: tek dialogda tüm yem, su ve malzeme kalemleri, varsayılan tüm sürü, "dünkü gibi" son günü doldurur, hepsi tek yerel işlem ve tek push. Su kova bazlı, bakiyesi tutulmaz. (2026-09-21)
- [x] 2.4 Stok seviyeleri: kalem başına bakiye, son 14 gün tüketimi, kalan gün rozeti (7 günden az kırmızı, 14 günden az sarı), alt sınır uyarısı; hesap `shared/stock.ts` içinde, sunucu view'ı ile birebir aynı. (2026-09-21)
- [x] 2.5 Gider ve gelir girişi: Finans ekranı (sahip rolüne açık), ay seçici, gider/gelir/fark kutuları, kategori dağılımı çubukları, gider ve gelir defterleri. Stok alımları aylık gidere kalem adıyla girer, iki kez sayılmaz. (2026-09-21)
- [x] 2.6 Günlük tur ekranı (`/animals/round`): sürü listesi, varsayılan "hepsi normal", hayvana dokununca kategori, şiddet, hazır etiket ve not açılır. Kaydet hem işaretli hayvanların gözlemlerini hem de sürü düzeyinde tur kaydını (hayvansız satır, `DAILY_ROUND_TAG`) tek işlemde yazar; Bugün ekranı turun yapılıp yapılmadığını gösterir. (2026-09-21)
- [x] 2.7 Raporlar ekranı: Sürü sekmesi (yaş grubu halkası, ırk dağılımı, ortalama kilo), Üretim sekmesi (aylık doğan yavru, doğum zorluğu, sağlık kayıtları ve maliyeti, çıkışlar), Para sekmesi (12 aylık gider/gelir çubukları, kalem bazında aylık tüketim). Ortak VisActor sarmalayıcıları `charts/Charts.tsx`; tümü yerel veriden. (2026-09-21)
- [x] 2.8 Bugün ekranı v2: ikinci KPI şeridi (aşı uyumu, kilo eğilimi, yem trendi, bu ay gider; bakıcıda gider yerine stok uyarısı), "Stok ve günlük tur" kartı (kalan günü azalan kalemler, turun durumu). Hesaplar `useHerdPulse` içinde yerel veriden; Faz 5'te içgörü servisi bunların üzerine kurulacak. (2026-09-21)
- [x] 2.9 Hayvan başı maliyet ve yem verimliliği: Raporlar > Para sekmesinde aylık tablo (gider, o ay çiftlikteki hayvan sayısı, hayvan başı maliyet, yem gideri, kilo artışı, kg başına yem maliyeti). Yem gideri tüketimden hesaplanır (kalem ortalama birim fiyatı × o ay tüketilen miktar), böylece toplu alım tek aya yığılmaz. Hayvan sayısı geçmişe dönük: giriş tarihi ay sonundan önce, çıkışı ay başından sonra olanlar. (2026-09-21)
- [x] 2.10 Senkron durumu ekranı: bekleyen ve reddedilen kayıtlar Türkçe adlarıyla (tablo, işlem, red sebebi), "Kaydı aç" ile düzeltilecek ekrana gider, yeniden dene ve sil, son senkron zamanı, "Şimdi senkronla". Stok ve finans kayıtları da outbox'tan geçiyor. Fotoğraf kuyruğu 3.8'de eklenecek. (2026-09-21)
- [ ] 2.11 iOS yolu testi (PWA mı native mi): Expo web çıktısını PWA olarak kur (manifest, service worker, ana ekrana ekle), babanın iPhone'unda bir hafta gerçek kullanım. Ölçülenler: yerel veritabanı Safari'de çalışıyor mu, bir hafta sonra veri duruyor mu, uygulama açılınca senkron güvenilir mi, kamera ile QR okuma, web push izni. Sonuç bölüm 10'daki karara girer.
  - Depolama: expo-sqlite'ın web'de hangi katmanı kullandığı (IndexedDB mi OPFS mi) ilk gün doğrulanır. IndexedDB ise B planı hazır: wa-sqlite + OPFS, Drizzle'a `sqlite-proxy` sürücüsüyle bağlanır. OPFS Web Worker ister; nginx'te gerekirse COOP ve COEP başlıkları. `navigator.storage.persist()` çağrılır.
  - Test ana ekrana eklenmiş uygulamada yapılır, Safari sekmesinde değil; ikisinin depolaması ayrıdır.

### Faz 3: Verimlilik

- [x] 3.1 Toplu işlem ekranı üç sekme oldu (`/animals/bulk`): Sağlık (kırkım dahil, 1.8), Tartım (sırayla kilo, Enter bir alt satıra geçer, son kiloya göre fark, tek push) ve Grup taşıma (seçilenler tek harekette). (2026-09-21)
- [x] 3.2 Aşı ve bakım programı (Ayarlar > Aşı ve bakım programı): `health_protocols` ve `protocol_items` tabloları (migration 0016/0017), üç tetikleyici (yaşa göre, aralıklı, sabit ay), tek tuşla örnek program (enterotoksemi, çiçek, parazit, tırnak, kuzu aşısı). Her madde her aktif hayvan için hatırlatıcı üretir; kayıt tutulmaz, sağlık kaydı girilince iş kendiliğinden ileri kayar. (2026-09-21)
- [x] 3.3 Hatırlatıcılar ekranı (`/reminders`): geciken, bugün, bu hafta, sonra ve tamamlananlar. Elle girilenler yeni `reminders` tablosunda (migration 0014/0015, her rol yazabilir); aşı dozu, arınma bitişi ve gebelik kontrolü kayıtlardan türetilir, tabloya yazılmaz (tek doğruluk kaynağı kaydın kendisi). Tamamla, geri al, sil. (2026-09-21)
- [ ] 3.4 Push bildirim. Native yolda Expo Notifications ve Expo Push API. PWA yolunda web push: VAPID anahtarı, service worker, iOS 16.4 ve sonrası ana ekrana eklenmiş olma şartı. Sunucuda tek bildirim servisi, iki taşıyıcı. node-cron ile zamanlama.
- [x] 3.5 QR etiket basımı: hayvan listesinde seçim → "Etiket yazdır"; üç boyutta A4 etiket sayfası (QR, küpe no, isim, çiftlik adı), yazdırma penceresinden PDF olarak kaydedilir. Dayanıklı malzeme önerisi dialogda. Profildeki tek etiket de aynı üreticiyi kullanır. (2026-09-21)
- [x] 3.6 Dışa aktarma (Ayarlar > Dışa aktarma): 14 tablo için CSV (noktalı virgül + UTF-8 BOM, Türkçe Excel doğrudan açar) ve hepsi tek ZIP. Kimlikler yerine okunur değerler yazılır (küpe no, ırk, kalem adı). Cihazdaki veriden üretilir, çevrimdışı çalışır. İçe aktarma yapılmadı: mevcut kayıt yok, ihtiyaç doğarsa ayrı ele alınır.
- [x] 3.7 Damızlık ekranı (`/breeding`): koç tablosu (eş sayısı, doğum, yavru, doğum başına, yaşama oranı, yavruların ortalama doğum kilosu ve günlük artışı), anne tablosu (doğum, yavru, yaşama, doğum aralığı, gebelik durumu), seçilen koçlar için yan yana karşılaştırma kartları. Tamamı yerel veriden. (2026-09-21)
- [x] 3.8 Fotoğraf ve belge ekleri: `attachments` tablosu (künye senkron, migration 0018/0019), ikili veri sunucudaki uploads biriminde; `PUT/GET/DELETE /uploads/:id` uçları, yetki kontrolü ve COEP için `Cross-Origin-Resource-Policy`. İstemci görseli yüklemeden önce 1600 px jpeg'e küçültür, çevrimdışıyken cihazda `upload_queue` içinde bekletir ve bağlantı gelince yükler; profilde Fotoğraflar sekmesi, Senkron ekranında yükleme kuyruğu. sharp yerine tarayıcıda küçültme: API'ye native bağımlılık eklenmedi, ahır bağlantısından da az veri gider. (2026-09-21)
- [x] 3.9 Değişiklik geçmişi (`/audit`, sahip yetkisi): çiftlik geneli akış, kayıt türü filtresi, hayvan profilinden o kayda filtreli giriş. Her satırda kim, ne zaman, hangi alan neyden neye değişti; teknik alanlar (updated_at, sync_seq) gizlenir, enum ve tarihler Türkçe gösterilir. Sunucu ucu `audit.list` imleçli sayfalama ile. (2026-09-21)

### Faz 4: Dayanıklılık ve yayın

- [x] 4.1 Senkron sağlamlaştırma: `apps/web/scripts/sync-stress.mjs` (7 adım, `corepack pnpm sync-stress`): iki cihazın aynı hayvanı çevrimdışı düzenlemesi (son yazan kazanır, kaybeden denetim kaydında kalır), çıkış tarihi kuralı (çıkıştan sonrasına kayıt RULE ile reddedilir, öncesine kabul edilir), kısmi batch (bir ret diğerlerini durdurmaz), saat kayması (ileri tarihli cihaz saati kabul edilir), 250 kayıtlık outbox'ın parça parça gönderimi, imleç sıfırlanınca tam yeniden senkron. Kural sunucuda `ruleViolation` olarak eklendi. (2026-09-21)
- [x] 4.2 Yedekleme: `backup` servisi günlük pg_dump (30 gün, 8 hafta, 12 ay), yeni `uploads-backup` servisi günlük fotoğraf/belge arşivi (fotoğraflar veritabanında değil, pg_dump kapsamıyordu), sunucu dışı haftalık kopya için rclone tarifi ve `scripts/restore-test.sh` geri yükleme provası (geçici konteynere yükler, tablo sayımlarını yazdırır). Sahibin tek tıkla dışa aktarımı 3.6'da. README'de "Yedekleme" bölümü. (2026-09-21)
- [x] 4.3 Performans: 217 hayvan ve 5.744 sağlık kaydıyla ölçüldü, en yavaş ekran 162 ms; liste sanallaştırma gerekmedi (gerekirse önce sayfalama denenecek). Görsel sıkıştırma 3.8'de tarayıcıda. Yerel indeksler tamamlandı (`animals.tag_no`, `health_records.next_due_at`, `health_records.withdrawal_until`; migration 0011). Program işleri (madde, gün) ikilisine göre gruplanıyor ve son uygulamalar tek sorguda çekiliyor; bu ikisi olmadan hatırlatıcı ekranı binlerce kayıtta kilitleniyordu. (2026-09-21)
- [ ] 4.4 Prod: Coolify'da prod compose kaynağı. iOS yolu 2.11 sonucuna göre: PWA ise web yayını yeterli; native ise Apple Developer hesabı, EAS Build, TestFlight veya App Store, EAS Update kanalı. Android build veterinerin tabletine göre.
- [x] 4.5 İzleme: Ayarlar > Sistem durumu (sahip) — sunucu ayakta kalma süresi, veritabanı boyutu, fotoğraf/belge sayısı ve boyutu, denetim kaydı sayısı, iki yedeğin yaşı. Yedek 36 saatten eskiyse veya hiç yoksa kırmızı uyarı; API yedek birimini salt okunur bağlar (`system.status`). Coolify uptime ve disk uyarıları sunucu tarafında ayrıca açılır. (2026-09-21)

### Faz 5: İçgörü servisi (Python)

Faz 2 bittikten sonra başlanabilir, Faz 3 ile paralel yürür. Kilo ve beslenme verisi birikmeden kurallar anlamlı sonuç vermez.

- [x] 5.1 `apps/insights`: FastAPI + APScheduler, pytest, ruff yapılandırması, Dockerfile, compose'da `insights` servisi (dışarıya port açmaz), `docker/db-init/01-roles.sh` ile ayrı `insights` DB rolü (her tabloda SELECT, yalnızca insights tablosunda yazma). pandas kullanılmadı: bu makinede yüklenemiyor ve 23 hayvanlık çiftlikte standart kütüphane fazlasıyla yeterli, imaj da küçük kalıyor. (2026-09-21)
- [x] 5.2 `insights` tablosu (migration 0020, tekillik 0023 `NULLS NOT DISTINCT` — çiftlik geneli bulgularda animal_id boş olduğu için kayıtlar her hesapta çoğalıyordu), `NOTIFY insights_changed` → Node `LISTEN` → Socket.IO `insights` olayı, tRPC `insights` router'ı (liste, okudum, ertele). (2026-09-21)
- [x] 5.3 Veri katmanı (`db.py`): sürü, tartım, sağlık, gözlem, üreme, doğum kayıtları tek geçişte; çiftlik için aylık gider/gelir/yem/kilo artışı/ölüm/doğum toplamları ve stok seviyeleri. 225 hayvanlık veride tam hesap 0,5 saniye. (2026-09-21)
- [x] 5.4 Kilo kuralları: `weight_drop` (%5 uyarı, %10 kritik), `weight_trend_down` (en küçük kareler eğimi), `overweight`/`underweight` (akran z-skoru, en az 8 akran), `low_adg`, `no_weighing`. (2026-09-21)
- [x] 5.5 Beslenme kuralları: `feed_stopped` (2 gün üst üste yemedi, kritik), `feed_reduced` (4 gün az yedi), çiftlik düzeyinde `farm_feed_per_animal` ve `farm_feed_refusal_spike`. (2026-09-21)
- [x] 5.6 Sağlık ve üreme kuralları: `withdrawal_active`, `vaccine_overdue`, `disease_recurring`, `birth_due`/`birth_overdue`, `pregnancy_check_due`, `long_lambing_interval`, `multi_observation`, `observation_worsening`. (2026-09-21)
- [x] 5.7 Çiftlik geneli kurallar: `farm_cost_trend`, `farm_feed_per_animal`, `farm_feed_vs_gain`, `farm_mortality`, `farm_birth_rate`, `farm_stock_runout`, `farm_feed_refusal_spike`. (2026-09-21)
- [x] 5.8 Türkçe metin (`nlg.py`): binlik ayraç, kilo, para, yüzde ve tarih biçimleri; her bulgunun sayıları `data` alanında ayrıca duruyor (arayüz grafik çizebilsin). Şiddet info/warning/critical. 27 birim testi. (2026-09-21)
- [x] 5.9 Her gece 03:00 tam hesap (APScheduler); `POST /compute/animal/{farm}/{animal}`, `/compute/farm/{farm}`, `/compute/all` uçları 30 sn debounce ile. Node `sync.push` sonrası etkilenen hayvan veya çiftlik için ateşle-unut tetikler (`planRecompute`); servis kapalıysa kayıt yine düşer, gece işi yakalar. (2026-09-21)
- [x] 5.10 Arayüz: `/insights` ekranı (şiddet sayıları, okudum, ertele), hayvan profilinde İçgörüler sekmesi ve sayaç, Bugün ekranında en acil üç bulgu. Socket.IO `insights` olayıyla anında tazelenir. (2026-09-21)
- [x] 5.11 Eşik ayarları (Ayarlar > İçgörü eşikleri): on eşik (kilo kaybı, tartımsız gün, yem, gebelik kontrolü, doğum aralığı, stok, gider sıçraması, en az akran) `farms.settings.insights` altına yazılır; varsayılanla aynı değer yazılmaz, servis onu kendi varsayılanından okur. (2026-09-21)
- [ ] 5.12 İsteğe bağlı, ayrı karar: LLM ile not tarama, Türkçe soru sorma, haftalık özet.
- [x] 5.13 Tahmin üretimi: kilo (30 gün sonrası, doğrusal eğilim, `weight-trend-v1`) ve stok bitişi (`feed-runout-v1`) her gece yazılır; hedef tarihi geçen kilo tahmini ±7 gün içindeki tartımla eşleşir ve sapma hesaplanır. `v_prediction_accuracy` görünümü model bazında ortalama hata verir. Doğum tahmininde hata düzeltildi: gerçekleşen alanına sapma yazılıyordu, artık tahmin ve gerçekleşen aynı ölçekte (çiftleşmeden doğuma gün). Gerçek ML modeli bu veri birikince ayrı karar. (2026-09-21)

### Faz 6: Saha cihazı (gateway)

Cihaz alındığında başlar. Sözleşme bölüm 3.6'da; API tarafı cihazdan önce yazılıp sahte istemciyle test edilebilir.

- [ ] 6.1 `devices`, `ingest_pending`, `sensor_readings` migration'ları; Ayarlar'da cihaz ekleme, API anahtarı üretme ve iptal.
- [ ] 6.2 `POST /ingest/batch` ucu: anahtar doğrulama, `applied_mutations` ile tekrar güvenliği, hayvan eşleme, `received_at`, saat sapması hesabı, hız ve boyut sınırı.
- [ ] 6.3 Sahte cihaz istemcisi (Node script): batch üretir, kesik bağlantıda tekrar gönderir; uçtan uca test.
- [ ] 6.4 Eşleşmeyen kayıtlar: Bugün'de kart, sahip hayvana eşler veya reddeder.
- [ ] 6.5 Sensör verisi görünümü ve çiftlik kurallarına bağlanması (su seviyesi, sıcaklık).
- [ ] 6.6 Cihaz durumu: Bugün'de son görülme, gecikmiş senkron uyarısı, saat sapması uyarısı.
- [ ] 6.7 Gerçek cihaz yazılımı: seçilen donanıma göre referans istemci (MicroPython veya C), yerel biriktirme, günde bir gönderim, onay alana kadar saklama.

---

## 8. Klasör yapısı

pnpm workspaces ile monorepo:

```
Anka_Farm/
  apps/
    mobile/                 Expo: iOS, Android, Web
      app/                  Expo Router ekranları
        (auth)/login.tsx
        (app)/index.tsx     Bugün
        (app)/animals/...
        (app)/stock/...
        (app)/finance/...
        (app)/reports/...
        (app)/settings/...
      src/
        components/         Ortak UI bileşenleri
        features/           Alan bazlı modüller (hooks, components)
        lib/                trpc.ts, socket.ts, queryClient.ts, theme.ts, auth.ts
        db/                 sqlite şeması (Drizzle sqlite-core), migration'lar, client
        sync/               outbox, senkron işçisi, imleçler, bağlantı durumu
        charts/             svg + d3 grafik bileşenleri
        utils/              tarih, birim, para formatları
    api/                    Fastify + tRPC + Drizzle
      src/
        modules/            animals/ health/ breeding/ weights/ observations/ stock/
                            finance/ reports/ insights/ predictions/ audit/ ...
                            (her biri: router.ts, service.ts)
        sync/               push, pull, applied_mutations, çakışma kuralı
        ingest/             cihaz REST ucu, anahtar doğrulama, eşleme, pending
        db/                 schema.ts, client.ts
        auth/
        realtime/
        jobs/               node-cron görevleri
      drizzle/              migration dosyaları (tablo + view + trigger SQL)
      Dockerfile
    insights/               Python içgörü servisi
      src/insights/
        api.py              FastAPI uçları: /compute/animal/{id}, /compute/farm/{id}, /health
        scheduler.py        gece hesabı (APScheduler)
        db.py               sorgular, pandas veri çerçeveleri, NOTIFY
        rules/              weight.py feeding.py health.py breeding.py farm.py
        nlg/                Türkçe şablonlar
        settings.py         eşiklerin farms.settings'ten okunması
      tests/
      pyproject.toml
      Dockerfile
  packages/
    shared/                 zod şemaları, enum'lar, tipler, sabitler (iki tarafta ortak)
      events.ts             AnimalEvent birleşik tipi ve olay türü sabitleri
      mappers/              toAnimalEvent eşleyicileri (sunucu ve cihazda aynı)
      sync.ts               mutasyon zarfı, push/pull şemaları, ingest batch şeması
      observations.ts       gözlem kategorileri, şiddet, hazır etiketler
  docker/
    web.Dockerfile          expo export + nginx
    nginx.conf
    entrypoint.sh           API_URL'den config.json üretir
    db-init/01-roles.sh     insights DB rolü, ilk kurulumda çalışır
  docker-compose.yml
  docs/
    PLAN.md
```

---

## 9. Kurallar

- Kod, tablo ve alan adları İngilizce. Arayüz metinleri Türkçe.
- Her şema değişikliği Drizzle migration dosyasıyla yapılır, veritabanına elle dokunulmaz.
- Silme yerine `status` veya `deleted_at` tercih edilir; hayvan kaydı asla fiziksel silinmez.
- Para birimi TL, `numeric(12,2)`. Kilo `numeric(6,2)`. Tarihler UTC saklanır, yerel gösterilir.
- zod şemaları `packages/shared` içinde tek yerde tanımlanır. API girdi doğrulaması ve form doğrulaması aynı şemayı kullanır, tipler oradan türer.
- Her yazma önce yerel SQLite'a, sonra outbox'a. Doğrudan tRPC mutasyonu çağıran özellik eksik sayılır; istisna auth, dosya yükleme ve sadece çevrimiçi raporlar.
- Kimlikler UUIDv7. İstemci `uuid` paketinin `v7()` fonksiyonuyla, sunucu tarafı eklemeler (trigger ile açılan yavru kaydı gibi) Postgres `uuidv7()` ile üretir. UUIDv4 kullanılmaz.
- Outbox kuyruk başı tıkanmaz. Sunucunun reddettiği mutasyon (4xx, iş kuralı) `failed` olur ve sıradaki gönderilir; ağ ve sunucu hatası (5xx, zaman aşımı) kuyruğu durdurur ve yeniden dener. Reddedilen kayıt yerelde "senkron edilemedi" işaretiyle kalır, kullanıcı düzeltir veya siler; sessizce kaybolmaz.
- Sunucuya gelen her yazma (push veya ingest) `mutation_id` taşır ve tekrar güvenlidir. Aynı id ikinci kez gelirse sessizce yok sayılır.
- Olay zamanı (`occurred_at` ve tablo bazlı karşılıkları) kullanıcının girdiği zamandır, kayıt ve senkron zamanı değil. Kurallar ve raporlar olay zamanına bakar.
- Sunucu tarafında `sync.push` veya ingest batch'i sonrası `changed` olayı yayılır, batch başına bir kez. Satır başına olay yayan kod hatalıdır. İstemci olayları biriktirir ve tek pull yapar.
- QR ve paylaşılan bağlantılar her zaman web adresi taşır, uygulama adresten kimliği ayıklar. Ham kimlik veya küpe numarası gömülmez.
- Sırlar `.env` dosyasında, repoya girmez. `.env.example` güncel tutulur.
- Python tarafı: her kural saf fonksiyon ve testli, eşikler koddan değil ayarlardan gelir, ruff temiz geçer.
- Uygulama Python servisine doğrudan bağlanmaz; içgörüler de dahil her veri Node API üzerinden gelir.
- Olay tablolarında fiziksel silme yok. "Sil" soft delete yapar ve sebep ister. Düzeltme, denetim kaydında eski ve yeni değerle görünür. Tam olay kaynaklama (event sourcing) yapılmaz; bu kadarı yeter.
- Sunucudan gelen zaman damgaları ISO'ya çevrilir (`sync/worker.ts`, `toLocalRow`). Postgres timestamptz metni "2026-09-21 09:00:00+00" biçiminde gelir; yerel yazmalar ISO olduğu için aynı sütunda iki biçim bulunursa metin karşılaştırması şaşar ve tarih filtreleri sessizce satır kaçırır.
- Yeni olay tablosu eklenince aynı değişiklikte: paylaşılan zod şeması ve `syncedTables`, sunucu `syncRegistry` ve `pullChanges`, sunucu migration + trigger SQL (before_write ve audit), yerel şema + migration + `localTables`, `events.ts` eşleyicisi ve zaman çizelgesi kartı. Hepsi birlikte gider. `v_animal_timeline` SQL view'ı Python ihtiyaç duyunca (Faz 5) aynı eşleyici mantığıyla yazılır.
- Beklenen değer üreten her özellik (gebelik, büyüme, stok) `predictions` tablosuna yazar; gerçekleşen gelince eşleştirilir.
- Her faz sonunda gerçek cihazda test, sonra sonraki faz.

---

## 10. Çiftlik bilgileri

2026-09-20 itibarıyla sahipten alınan bilgiler. Plan bunlara göre şekillendi.

| Konu | Durum | Plana etkisi |
|---|---|---|
| Sürü | 21 koyun ve 2 kuzu, yeni alındı. Mevcut kayıt yok. | Biz veri yüklemiyoruz, sahip uygulamadan girer. İlk yükleme için Excel gerekmez. Akran karşılaştırma kuralları küçük sürüde atlanır. |
| Yeni hayvan girişi | Burada doğan için anne ve baba seçilir. Dışarıdan alınan için sadece ırk seçilir (İle de France, Kıvırcık gibi). | Hayvan formu iki akışlı, `origin` alanı. Irk listesi tohumlanır, sahip yeni ırk ekleyebilir. |
| İnternet | Ahırda sürekli Wi-Fi yok. Sahip kayıtları girer, kaydeder, çıkar. | Çevrimdışı öncelikli mimari, Faz 1.2. Telefon yerel veritabanına yazar, bağlantı gelince kendiliğinden senkron. |
| Saha cihazı | İleride ahırda bir mikrodenetleyici günde bir kez sistemi güncelleyecek. | Cihaz alım ucu ve veri modeli baştan hazır (bölüm 3.6), gerçekleştirme Faz 6. |
| Cihazlar | Sahip bilgisayar ve iPhone. Veteriner tablet. | Web ve iOS öncelikli. Veteriner rolü ilk günden gerçek kullanıcı. Android build sonra. |
| Su | Sayaç yok. Yağmur suyu toplanıyor, kovayla veriliyor. | "Su" kalemi kova birimli, stok bakiyesi tutulmaz, isteğe bağlı tüketim kaydı. Su gideri yok. |
| Yemleme | Bireysel yemleme yok, oluğa günlük yem konuyor. | Tüketim kaydı varsayılan olarak tüm sürü. Bireysel "yedi / yemedi" gözlemi isteğe bağlı. |
| Aşı | Tüm sürü birlikte aşılanıyor. | Toplu aşı girişi Faz 1'de (1.8). Tekli giriş profilden. Protokol şablonları ve Excel'den aşı yükleme isteğe bağlı. |
| Gelir | Henüz yok. | Gelir modülü duruyor, sahip ilerde kendisi girer. Öncelik düşük. |

Hâlâ açık:

- Veterinerin tableti iPad mi Android mi? Android ise Faz 4'te Android build gerekir; web tarayıcı her iki durumda çalışır.
- iOS dağıtımı: iki yol var, karar 2.11'deki bir haftalık saha testinden sonra.
  - **PWA, ücretsiz.** Expo web çıktısı Safari'den ana ekrana eklenir, uygulama gibi açılır. iOS 16.4 ve sonrasında web push çalışır. Riskler: yerel veritabanının Safari'de çalışması (expo-sqlite web desteği deneysel, yetmezse IndexedDB katmanı gerekir), Safari'nin uzun süre kullanılmayan sitelerin depolamasını boşaltabilmesi (ana ekrana eklenmiş uygulamalar büyük ölçüde muaf ama garanti değil), arka planda senkron yok (uygulama açılınca senkron), Safari'de yerleşik barkod okuyucu olmadığından QR için JS kütüphanesi. Depolama için B planı OPFS tabanlı wa-sqlite (2.11).
  - **Native, Apple Developer hesabı yıllık ücretli.** Güvenilir SQLite, arka plan senkronu, TestFlight veya App Store, EAS Update ile OTA.
  - **Yol:** geliştirme boyunca PWA ile sıfır maliyetle ilerle, 2.11'de babanın telefonunda test et. Bir hafta boyunca ahırda girilen veri kaybolmadan senkron oluyorsa PWA'da kal. Depolama veya senkron güvenilirliği zayıf çıkarsa hesabı aç; ahırdaki verinin kaybolma riski yıllık ücretten pahalı.