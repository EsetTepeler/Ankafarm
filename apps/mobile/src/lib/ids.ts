import * as Crypto from "expo-crypto";

/**
 * UUIDv7: ilk 48 bit milisaniye zaman damgası, kalanı rastgele. Sıralı olduğu için
 * toplu senkronda Postgres indekslerini parçalamaz (bölüm 9).
 */
export function newId(): string {
  const bytes = new Uint8Array(16);
  Crypto.getRandomValues(bytes);
  const ts = Date.now();
  bytes[0] = Math.floor(ts / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ts / 2 ** 32) & 0xff;
  bytes[2] = (ts >>> 24) & 0xff;
  bytes[3] = (ts >>> 16) & 0xff;
  bytes[4] = (ts >>> 8) & 0xff;
  bytes[5] = ts & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // sürüm 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // varyant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
