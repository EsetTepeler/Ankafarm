/** UI gözden geçirme: her ekranın açık ve koyu temada ekran görüntüsü. */
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:8092";
const OUT = process.env.OUT ?? ".e2e/ui";
const pages = [
  ["bugun", "/"],
  ["hayvanlar", "/animals"],
  ["hatirlaticilar", "/reminders"],
  ["icgoruler", "/insights"],
  ["gunluk-tur", "/animals/round"],
  ["toplu", "/animals/bulk"],
  ["damizlik", "/breeding"],
  ["stok", "/stock"],
  ["finans", "/finance"],
  ["raporlar", "/reports"],
  ["qr", "/scan"],
  ["ayarlar", "/settings"],
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("login-page-shot").waitFor({ timeout: 5_000 }).catch(() => {});
await page.screenshot({ path: `${OUT}/00-giris.png`, fullPage: false });
await page.getByTestId("login-email").fill("sahip@ankafarm.local");
await page.getByTestId("login-password").fill("degistir123");
await page.getByTestId("login-submit").click();
await page.getByTestId("sync-banner").waitFor({ timeout: 60_000 });
await page.waitForTimeout(3000);

for (const [name, path] of pages) {
  await page.goto(`${WEB_URL}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}
// Hayvan profili
await page.goto(`${WEB_URL}/animals`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("row").nth(1).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/hayvan-profili.png`, fullPage: false });

// Koyu tema
await page.goto(`${WEB_URL}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Koyu temaya geç/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/bugun-koyu.png`, fullPage: false });
await page.goto(`${WEB_URL}/animals`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${OUT}/hayvanlar-koyu.png`, fullPage: false });

await browser.close();
console.log("hazır:", OUT);
