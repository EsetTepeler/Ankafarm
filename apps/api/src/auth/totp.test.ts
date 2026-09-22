import assert from "node:assert/strict";
import { test } from "node:test";

import { base32Decode, base32Encode, generateRecoveryCodes, generateTotpSecret, otpauthUri, totpCode, verifyTotp } from "./totp";

/**
 * RFC 6238 Ek B'deki resmi test vektörleri (SHA-1, 8 hane). Kendi yazdığımız TOTP'un
 * standarda uyduğunu kanıtlar; uymazsa kimlik doğrulayıcı uygulamalar kodu kabul etmez.
 * Vektörlerdeki gizli anahtar ASCII "12345678901234567890".
 */
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));

test("RFC 6238 test vektörleri", () => {
  const cases: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [time, expected] of cases) {
    assert.equal(totpCode(RFC_SECRET, time, 8), expected, `t=${time}`);
  }
});

test("base32 gidiş dönüş", () => {
  for (const text of ["", "a", "ab", "abc", "abcd", "abcde", "12345678901234567890"]) {
    const bytes = Buffer.from(text, "ascii");
    assert.deepEqual(base32Decode(base32Encode(bytes)), bytes, text);
  }
});

test("üretilen gizli anahtar 160 bit ve base32", () => {
  const secret = generateTotpSecret();
  assert.match(secret, /^[A-Z2-7]+$/);
  assert.equal(base32Decode(secret).length, 20);
});

test("doğrulama: geçerli kod kabul, yanlış kod ret", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  assert.equal(verifyTotp(secret, totpCode(secret, now), 1, now), true);
  assert.equal(verifyTotp(secret, "000000", 1, now) && totpCode(secret, now) !== "000000", false);
});

test("doğrulama: bir adım kayma kabul, iki adım ret", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000;
  // Telefon saati kayabilir ve kullanıcı kodu son anda girebilir; bir adım tolere edilir.
  assert.equal(verifyTotp(secret, totpCode(secret, now - 30), 1, now), true);
  assert.equal(verifyTotp(secret, totpCode(secret, now + 30), 1, now), true);
  const twoStepsBack = totpCode(secret, now - 60);
  // Ender de olsa kodlar çakışabilir; çakışmadığı durumda reddedilmeli.
  if (twoStepsBack !== totpCode(secret, now) && twoStepsBack !== totpCode(secret, now - 30)) {
    assert.equal(verifyTotp(secret, twoStepsBack, 1, now), false);
  }
});

test("doğrulama: hane sayısı tutmayan girdi reddedilir", () => {
  const secret = generateTotpSecret();
  assert.equal(verifyTotp(secret, "12345"), false);
  assert.equal(verifyTotp(secret, "1234567"), false);
  assert.equal(verifyTotp(secret, ""), false);
});

test("otpauth adresi kimlik doğrulayıcının beklediği alanları taşır", () => {
  const uri = otpauthUri("JBSWY3DPEHPK3PXP", "admin@ornek.com");
  assert.ok(uri.startsWith("otpauth://totp/Anka%20Farm%3Aadmin%40ornek.com?"));
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /digits=6/);
  assert.match(uri, /period=30/);
});

test("kurtarma kodları benzersiz ve okunur", () => {
  const codes = generateRecoveryCodes(8);
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const code of codes) assert.match(code, /^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
});
