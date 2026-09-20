import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

function deriveKey(password: string, salt: Buffer, keylen: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, { N, r, p, maxmem: PARAMS.maxmem }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Format: scrypt$N$r$p$salt$hash (base64url). Yerleşik crypto, native bağımlılık yok. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await deriveKey(password, salt, PARAMS.keylen, PARAMS.N, PARAMS.r, PARAMS.p);
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, nStr, rStr, pStr, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !nStr || !rStr || !pStr || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = await deriveKey(
    password,
    Buffer.from(saltB64, "base64url"),
    expected.length,
    Number(nStr),
    Number(rStr),
    Number(pStr),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
