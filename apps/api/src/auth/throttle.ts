import { TRPCError } from "@trpc/server";

/**
 * Giriş denemesi kısıtı. Genel hız sınırı (dakikada 300 istek) şifre denemesi için fazla cömert:
 * yönetici hesabı tüm kiracıları açtığı için dakikada yüzlerce deneme kabul edilemez.
 *
 * Sayaç bellekte tutulur; tek API konteyneri için yeterli. Birden fazla kopya çalıştırılırsa
 * ortak bir sayaç (Redis ya da tablo) gerekir — o zamana kadar kopya sayısı bir kalmalı.
 */
interface Bucket {
  count: number;
  windowStart: number;
  lockedUntil: number;
}

export interface ThrottleOptions {
  /** Kilitlemeden önceki başarısız deneme sayısı. */
  maxAttempts: number;
  /** Denemelerin sayıldığı pencere (ms). */
  windowMs: number;
  /** Kilit süresi (ms). */
  lockMs: number;
}

const buckets = new Map<string, Bucket>();

/** Bellek sınırsız büyümesin: pencereden ve kilitten çıkmış anahtarlar atılır. */
function sweep(now: number, windowMs: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.lockedUntil < now && now - bucket.windowStart > windowMs) buckets.delete(key);
  }
}

/** Kilitliyse hata atar. Her giriş denemesinden önce çağrılır. */
export function assertNotLocked(key: string, opts: ThrottleOptions) {
  const bucket = buckets.get(key);
  if (!bucket) return;
  const now = Date.now();
  if (bucket.lockedUntil > now) {
    const minutes = Math.ceil((bucket.lockedUntil - now) / 60_000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Çok fazla hatalı deneme. ${minutes} dakika sonra tekrar deneyin.`,
    });
  }
}

/** Başarısız deneme sayılır; eşik aşılınca anahtar kilitlenir. Kilitlendiyse true döner. */
export function recordFailure(key: string, opts: ThrottleOptions): boolean {
  const now = Date.now();
  sweep(now, opts.windowMs);
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > opts.windowMs) {
    buckets.set(key, { count: 1, windowStart: now, lockedUntil: 0 });
    return false;
  }
  bucket.count += 1;
  if (bucket.count >= opts.maxAttempts) {
    bucket.lockedUntil = now + opts.lockMs;
    bucket.count = 0;
    bucket.windowStart = now;
    return true;
  }
  return false;
}

/** Doğru şifre girildi: sayaç sıfırlanır. */
export function recordSuccess(key: string) {
  buckets.delete(key);
}

/** Yönetici hesabı tüm kiracıları açar; çiftlik girişinden daha sıkı. */
export const platformLoginThrottle: ThrottleOptions = { maxAttempts: 5, windowMs: 15 * 60_000, lockMs: 30 * 60_000 };
export const farmLoginThrottle: ThrottleOptions = { maxAttempts: 10, windowMs: 15 * 60_000, lockMs: 15 * 60_000 };

/** Sadece test içindir; sayaçları temizler. */
export function resetThrottle() {
  buckets.clear();
}
