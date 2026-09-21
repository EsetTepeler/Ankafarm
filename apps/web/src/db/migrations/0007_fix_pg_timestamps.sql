-- Sunucudan gelen timestamptz metinleri "2026-09-21 09:00:00+00" biçimindeydi; yerel yazmalar ISO.
-- İki biçim metin olarak karşılaştırılınca (boşluk < 'T') tarih filtreleri şaşıyordu.
-- Bundan sonrasını sync/worker.ts düzeltiyor, burada mevcut satırlar onarılır.
UPDATE observations SET observed_at = replace(observed_at, ' ', 'T') WHERE observed_at LIKE '____-__-__ %';
--> statement-breakpoint
UPDATE weight_records SET weighed_at = replace(weighed_at, ' ', 'T') WHERE weighed_at LIKE '____-__-__ %';
--> statement-breakpoint
UPDATE health_records SET applied_at = replace(applied_at, ' ', 'T') WHERE applied_at LIKE '____-__-__ %';
--> statement-breakpoint
UPDATE group_movements SET moved_at = replace(moved_at, ' ', 'T') WHERE moved_at LIKE '____-__-__ %';
