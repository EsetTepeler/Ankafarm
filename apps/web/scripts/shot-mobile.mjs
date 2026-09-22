/** Telefon boyutunda gezinme sorunlarını görmek için. iPhone 14 ölçüleri. */
import { chromium, devices } from "playwright";
const WEB_URL = process.env.WEB_URL ?? "http://localhost:8092";
const OUT = ".e2e/ui/m";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ ...devices["iPhone 14"], colorScheme: "dark" });
const page = await ctx.newPage();
await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-email").fill("sahip@ankafarm.local");
await page.getByTestId("login-password").fill("degistir123");
await page.getByTestId("login-submit").click();
await page.getByTestId("sync-banner").waitFor({ timeout: 90_000 });
await page.waitForTimeout(3000);
for (const [name, path] of [
  ["bugun", "/"],
  ["hayvanlar", "/animals"],
  ["ayarlar", "/settings"],
  ["gruplar", "/settings/groups"],
  ["senkron", "/settings/sync"],
  ["transferler", "/transfers"],
]) {
  await page.goto(`${WEB_URL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
// Hayvan profili: geri düğmesi listeye dönmeli
await page.goto(`${WEB_URL}/animals`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByRole("row").nth(1).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/profil.png` });
await browser.close();
console.log("ok");
