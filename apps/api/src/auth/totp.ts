import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238). Hazır kütüphane yerine burada: algoritma kısa ve tam tanımlı, RFC'nin kendi
 * test vektörleriyle doğrulanıyor (totp.test.ts). Projede argon2 yerine scrypt, sharp yerine
 * tarayıcıda küçültme tercih edildiği gibi burada da yeni bağımlılık ve native derleme yok.
 */
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Kimlik doğrulayıcı uygulamalarının beklediği uzunluk: 160 bit. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Belirli bir zaman adımı için kod. `time` saniye cinsinden Unix zamanı. */
export function totpCode(secret: string, time: number = Math.floor(Date.now() / 1000), digits = DIGITS): string {
  const counter = Math.floor(time / STEP_SECONDS);
  const buf = Buffer.alloc(8);
  // JavaScript'te 32 biti aşan sayaç için iki yarım ayrı yazılır.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  // Dinamik kesme (RFC 4226 §5.4): son baytın alt dört biti ofseti verir.
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) | ((digest[offset + 1]! & 0xff) << 16) | ((digest[offset + 2]! & 0xff) << 8) | (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, "0");
}

/**
 * Kodu doğrular. `window` kadar önceki ve sonraki adım da kabul edilir: telefon saati birkaç
 * saniye kayabiliyor ve kullanıcı kodu son anda girebiliyor.
 */
export function verifyTotp(secret: string, code: string, window = 1, time: number = Math.floor(Date.now() / 1000)): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== DIGITS) return false;
  for (let drift = -window; drift <= window; drift++) {
    const expected = totpCode(secret, time + drift * STEP_SECONDS);
    // Sabit süreli karşılaştırma: kodun kaçıncı basamağa kadar tuttuğu zamandan anlaşılmasın.
    if (expected.length === clean.length && timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return true;
  }
  return false;
}

/** Kimlik doğrulayıcıya okutulan adres; QR bundan üretilir. */
export function otpauthUri(secret: string, account: string, issuer = "Anka Farm"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Telefon kaybolursa girişi açan tek kullanımlık kodlar. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(5)).slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z2-7]/g, "");
}
