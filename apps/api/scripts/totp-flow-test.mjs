#!/usr/bin/env node
/**
 * 2FA akışının uçtan uca doğrulaması: kurulum, kodla giriş, yanlış kod, kurtarma kodu,
 * kodun tek kullanımlık olması ve kapatma. Gerçek TOTP kodları burada üretilir.
 */
import { createHmac } from "node:crypto";

const API = process.env.API_URL ?? "http://localhost:3000";
const EMAIL = process.env.PLATFORM_ADMIN_EMAIL ?? "admin@ankafarm.local";
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? "degistir123";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of input.toUpperCase().replace(/[^A-Z2-7]/g, "")) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret, time = Math.floor(Date.now() / 1000)) {
  const counter = Math.floor(time / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const digest = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

let failed = false;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` → ${detail}` : ""}`);
  if (!ok) failed = true;
};

/** tRPC query'leri GET ister; POST ile çağırmak "Unsupported POST-request" hatası verir ve
 *  asıl kontrolü gizler. Bu yüzden sorgular için ayrı yardımcı. */
async function query(path, token, input) {
  const qs = input ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "";
  const res = await fetch(`${API}/trpc/${path}${qs}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }).then((r) => r.json());
  return { data: res.result?.data?.json, error: res.error?.json?.message };
}

async function call(path, input, token) {
  const res = await fetch(`${API}/trpc/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ json: input ?? {} }),
  }).then((r) => r.json());
  return { data: res.result?.data?.json, error: res.error?.json?.message };
}

const login = await call("platform.login", { email: EMAIL, password: PASSWORD });
check("şifreyle giriş", !!login.data?.accessToken, login.error ?? "");
let token = login.data.accessToken;

const setup = await call("platform.totpSetup", {}, token);
check("kurulum anahtarı üretildi", !!setup.data?.secret && setup.data.uri.startsWith("otpauth://"), setup.error ?? "");
const secret = setup.data.secret;

const badEnable = await call("platform.totpEnable", { code: "000000" }, token);
check("yanlış kodla açılmıyor", !!badEnable.error, badEnable.error ?? "açıldı!");

const enabled = await call("platform.totpEnable", { code: totp(secret) }, token);
check("doğru kodla açıldı", Array.isArray(enabled.data?.recoveryCodes) && enabled.data.recoveryCodes.length === 8, enabled.error ?? "");
const recovery = enabled.data.recoveryCodes;

// Artık şifre tek başına yetmemeli.
const second = await call("platform.login", { email: EMAIL, password: PASSWORD });
check("şifre tek başına token vermiyor", second.data?.status === "totp" && !second.data?.accessToken, JSON.stringify(second.data?.status));
const challenge = second.data.challengeToken;

const challengeAsToken = await query("platform.farms", challenge);
check("aşama tokenı yetki vermiyor", !!challengeAsToken.error, challengeAsToken.error ?? "veri döndü!");

const wrongCode = await call("platform.loginTotp", { challengeToken: challenge, code: "123456" });
check("yanlış kod reddediliyor", !!wrongCode.error, wrongCode.error ?? "kabul edildi!");

const login2 = await call("platform.login", { email: EMAIL, password: PASSWORD });
const good = await call("platform.loginTotp", { challengeToken: login2.data.challengeToken, code: totp(secret) });
check("doğru kodla oturum açılıyor", !!good.data?.accessToken, good.error ?? "");
token = good.data.accessToken;

// Kurtarma kodu: telefon kaybolduğunda.
const login3 = await call("platform.login", { email: EMAIL, password: PASSWORD });
const rec = await call("platform.loginTotp", { challengeToken: login3.data.challengeToken, code: recovery[0] });
check("kurtarma koduyla giriş", !!rec.data?.accessToken && rec.data.usedRecovery === true, rec.error ?? "");

const login4 = await call("platform.login", { email: EMAIL, password: PASSWORD });
const recAgain = await call("platform.loginTotp", { challengeToken: login4.data.challengeToken, code: recovery[0] });
check("kurtarma kodu tek kullanımlık", !!recAgain.error, recAgain.error ?? "ikinci kez kabul edildi!");

const me = await query("platform.me", token);
check("kalan kurtarma kodu 7", me.data?.totpEnabled === true && me.data?.recoveryCodesLeft === 7, JSON.stringify(me.data));

const badOff = await call("platform.totpDisable", { password: "yanlissifre" }, token);
check("yanlış şifreyle kapatılmıyor", !!badOff.error, badOff.error ?? "kapandı!");

const off = await call("platform.totpDisable", { password: PASSWORD }, token);
check("şifreyle kapatıldı", off.data?.ok === true, off.error ?? "");

const after = await call("platform.login", { email: EMAIL, password: PASSWORD });
check("kapandıktan sonra tek adım", !!after.data?.accessToken, after.error ?? "");

console.log(failed ? "\nSONUÇ: BAŞARISIZ" : "\nSONUÇ: TÜM ADIMLAR GEÇTİ");
process.exit(failed ? 1 : 0);
