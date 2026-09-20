#!/usr/bin/env node
/**
 * Web uçtan uca duman testi: giriş, pull, grup ekleme, çevrimdışı kuyruk, senkron.
 * Sistemdeki Edge veya Chrome'u sürer (Playwright indirmesi gerekmez).
 *
 * Ortam: WEB_URL (varsayılan http://localhost:8091), API_URL (http://localhost:3000),
 *        E2E_EMAIL, E2E_PASSWORD, BROWSER_CHANNEL (msedge | chrome), HEADED=1 görünür tarayıcı.
 */
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:8091";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "sahip@ankafarm.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "degistir123";
const CHANNEL = process.env.BROWSER_CHANNEL ?? "msedge";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const consoleLines = [];

async function serverGroups() {
  const login = await fetch(`${API_URL}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASSWORD } }),
  }).then((r) => r.json());
  const token = login.result.data.json.accessToken;
  const res = await fetch(`${API_URL}/trpc/groups.list`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  return res.result.data.json.map((g) => g.name);
}

async function serverAnimals() {
  const login = await fetch(`${API_URL}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASSWORD } }),
  }).then((r) => r.json());
  const token = login.result.data.json.accessToken;
  const res = await fetch(`${API_URL}/trpc/animals.list?input=${encodeURIComponent(JSON.stringify({ json: { includeInactive: true } }))}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return Object.fromEntries(res.result.data.json.map((a) => [a.tagNo, a]));
}

async function serverHealth(animalId) {
  const login = await fetch(`${API_URL}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASSWORD } }),
  }).then((r) => r.json());
  const token = login.result.data.json.accessToken;
  const res = await fetch(`${API_URL}/trpc/health.list?input=${encodeURIComponent(JSON.stringify({ json: { animalId } }))}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return res.result.data.json;
}

async function serverPredictions(animalId) {
  const login = await fetch(`${API_URL}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASSWORD } }),
  }).then((r) => r.json());
  const token = login.result.data.json.accessToken;
  const res = await fetch(`${API_URL}/trpc/predictions.list?input=${encodeURIComponent(JSON.stringify({ json: { animalId } }))}`, {
    headers: { authorization: `Bearer ${token}` },
  }).then((r) => r.json());
  return res.result.data.json;
}

const browser = await chromium.launch({ channel: CHANNEL, headless: process.env.HEADED !== "1" });
const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
const page = await context.newPage();
page.on("console", (msg) => {
  const line = `[console.${msg.type()}] ${msg.text()}`;
  consoleLines.push(line);
  if (msg.type() === "error" || msg.type() === "warning") log(line.slice(0, 400));
});
page.on("pageerror", (err) => {
  consoleLines.push(`[pageerror] ${err.message}`);
  log("[pageerror]", err.message);
});

let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    log("OK  ", name);
  } catch (err) {
    failed = true;
    log("FAIL", name, "→", err.message.split("\n")[0]);
    await page.screenshot({ path: `.expo/e2e-${name.replace(/\W+/g, "_")}.png` }).catch(() => {});
  }
};

try {
  await step("sayfa açılır ve SharedArrayBuffer var", async () => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    const sab = await page.evaluate(() => typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated);
    if (!sab) throw new Error("crossOriginIsolated değil");
  });

  await step("giriş formu gelir", async () => {
    await page.getByTestId("login-email").waitFor({ timeout: 120_000 });
  });

  await step("giriş yapılır", async () => {
    await page.getByTestId("login-email").fill(EMAIL);
    await page.getByTestId("login-password").fill(PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.getByText(/^Merhaba/).waitFor({ timeout: 60_000 });
  });

  await step("ilk senkron biter", async () => {
    await page.getByText(/Güncel · /).waitFor({ timeout: 60_000 });
  });

  await step("Gruplar ekranında Ana sürü görünür", async () => {
    await page.getByText("Ayarlar").last().click();
    await page.getByText("Gruplar ve bölmeler").click();
    await page.getByText("Ana sürü", { exact: true }).waitFor({ timeout: 30_000 });
  });

  const name1 = `Test ${Date.now() % 10000}`;
  await step("çevrimiçi grup eklenir ve sunucuya gider", async () => {
    await page.getByTestId("group-add").click();
    await page.getByTestId("group-name").fill(name1);
    await page.getByTestId("group-save").click();
    await page.getByText(name1).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const names = await serverGroups();
    if (!names.includes(name1)) throw new Error(`sunucuda yok: ${names.join(", ")}`);
  });

  const name2 = `Offline ${Date.now() % 10000}`;
  await step("çevrimdışı grup eklenir, kuyrukta bekler", async () => {
    await context.setOffline(true);
    await page.getByTestId("group-add").click();
    await page.getByTestId("group-name").fill(name2);
    await page.getByTestId("group-save").click();
    await page.getByText(name2).waitFor({ timeout: 10_000 });
    await page.getByTestId("sync-banner").getByText(/Çevrimdışı|ulaşılamıyor|bekliyor/).waitFor({ timeout: 15_000 });
    const names = await serverGroups();
    if (names.includes(name2)) throw new Error("çevrimdışıyken sunucuya gitmemeliydi");
  });

  await step("bağlantı gelince kuyruk boşalır", async () => {
    await context.setOffline(false);
    await page.getByText("Şimdi senkronla").first().waitFor({ timeout: 5_000 }).catch(() => {});
    // Tetikleyici: bağlantı olayı veya şerit dokunuşu
    const banner = page.getByTestId("sync-banner");
    if (await banner.count()) await banner.first().click();
    for (let i = 0; i < 20; i++) {
      if ((await serverGroups()).includes(name2)) return;
      await page.waitForTimeout(1500);
    }
    throw new Error("30 sn içinde sunucuya ulaşmadı");
  });

  await step("yenileme sonrası veri yerelde durur", async () => {
    // Geliştirme sunucusunda service worker yok; çevrimdışı yenileme PWA testinin (2.11) konusu.
    await context.setOffline(false);
    await page.reload({ waitUntil: "domcontentloaded" });
    // Yenileme Gruplar sayfasında yapıldı; oturum geri gelince aynı sayfa açılır.
    await page.getByText(name1).waitFor({ timeout: 60_000 });
    await page.getByText(name2).waitFor({ timeout: 15_000 });
    const url = page.url();
    if (!/settings\/groups/.test(url)) throw new Error(`beklenmeyen adres: ${url}`);
    await context.setOffline(false);
  });

  const tag1 = `TR-${Date.now() % 100000}`;
  await step("dışarıdan alınan hayvan eklenir ve sunucuya gider", async () => {
    await page.getByText("Hayvanlar").last().click();
    await page.getByTestId("animal-add").click();
    await page.getByTestId("origin-purchased").click();
    await page.getByTestId("animal-tag").fill(tag1);
    await page.getByTestId("animal-name").fill("Pamuk");
    await page.getByTestId("animal-breed").click();
    await page.getByTestId("picker-breed").getByText("Kıvırcık", { exact: true }).click();
    await page.getByTestId("animal-save").click();
    await page.getByText(`${tag1} · Pamuk`).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    if (!animals[tag1]) throw new Error("sunucuda yok");
    if (animals[tag1].origin !== "purchased" || !animals[tag1].breedId) throw new Error("alanlar eksik");
  });

  await step("aynı küpe numarası yerelde reddedilir", async () => {
    await page.goBack().catch(() => {});
    await page.getByTestId("animal-add").click();
    await page.getByTestId("origin-purchased").click();
    await page.getByTestId("animal-tag").fill(tag1.toLowerCase());
    await page.getByTestId("animal-breed").click();
    await page.getByTestId("picker-breed").getByText("Kıvırcık", { exact: true }).click();
    await page.getByTestId("animal-save").click();
    await page.getByText(/zaten kayıtlı/).first().waitFor({ timeout: 10_000 });
  });

  const tag2 = `TR-${(Date.now() + 7) % 100000}`;
  await step("burada doğan hayvan anne ile eklenir", async () => {
    await page.getByTestId("origin-born").click();
    await page.getByTestId("animal-tag").fill(tag2);
    await page.getByTestId("animal-mother").click();
    await page.getByTestId("picker-mother").getByText(tag1, { exact: true }).click();
    await page.getByTestId("animal-birthdate").fill("10.03.2026");
    await page.getByTestId("animal-birthdate").press("Tab");
    await page.getByTestId("animal-save").click();
    await page.getByText(tag2).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await page.getByTestId("animal-edit").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const child = animals[tag2];
    if (!child) throw new Error("sunucuda yok");
    if (child.motherId !== animals[tag1].id) throw new Error("anne bağı yok");
    if (child.birthDate !== "2026-03-10") throw new Error(`doğum tarihi yanlış: ${child.birthDate}`);
    if (child.breedId !== animals[tag1].id && child.breedId !== animals[tag1].breedId) throw new Error("ırk anneden gelmedi");
  });

  await step("tartım eklenir, rozet ve zaman çizelgesi güncellenir, sunucuda türev kilo oluşur", async () => {
    await page.getByText("Hayvanlar").last().click();
    await page.getByTestId(`animal-row-${tag1}`).click();
    await page.getByTestId("badge-weight").waitFor({ timeout: 15_000 });
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-weight").click();
    await page.getByTestId("weight-kg").fill("52,5");
    await page.getByTestId("weight-save").click();
    await page.getByTestId("badge-weight").getByText("52,5 kg").waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-timeline").click();
    await page.getByTestId("timeline-weight").first().waitFor({ timeout: 10_000 });
    await page.getByTestId("timeline-created").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    if (animals[tag1].currentWeight !== 52.5) throw new Error(`sunucu current_weight: ${animals[tag1].currentWeight}`);
  });

  await step("ikinci tartım farkı gösterir ve grafik çizilir", async () => {
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-weight").click();
    await page.getByTestId("weight-kg").fill("55");
    await page.getByTestId("weight-date").fill("01.10.2026");
    await page.getByTestId("weight-date").press("Tab");
    await page.getByTestId("weight-save").click();
    await page.getByText(/önceki tartıma göre \+2,5 kg/).first().waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-weight").click();
    await page.locator("svg path").first().waitFor({ timeout: 10_000 });
  });

  await step("sağlık kaydı eklenir, arınma rozeti ve sunucudaki türev tarih", async () => {
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-health").click();
    await page.getByTestId("health-type-vaccine").click();
    await page.getByTestId("health-product").fill("Enterotoksemi");
    await page.getByTestId("health-dose").fill("2");
    await page.getByTestId("health-withdrawal").fill("7");
    await page.getByTestId("health-nextdue").fill("20.03.2027");
    await page.getByTestId("health-nextdue").press("Tab");
    await page.getByTestId("health-save").click();
    await page.getByTestId("badge-health").getByText(/Arınma/).waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-timeline").click();
    await page.getByTestId("timeline-health").first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const rows = await serverHealth(animals[tag1].id);
    const rec = rows.find((r) => r.productName === "Enterotoksemi");
    if (!rec) throw new Error("sunucuda yok");
    const expected = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    if (rec.withdrawalUntil !== expected) throw new Error(`arınma tarihi ${rec.withdrawalUntil}, beklenen ${expected}`);
    if (rec.nextDueAt !== "2027-03-20") throw new Error(`sonraki doz ${rec.nextDueAt}`);
  });

  await step("toplu parazit ilacı tüm sürüye girilir ve geri alınır", async () => {
    await page.getByText("Hayvanlar").last().click();
    await page.getByTestId("bulk-health").click();
    await page.getByTestId("health-type-deworming").click();
    await page.getByTestId("health-product").fill("Ivermektin");
    await page.getByTestId("bulk-count").waitFor({ timeout: 10_000 });
    const countText = await page.getByTestId("bulk-count").innerText();
    const total = Number((/\/\s*(\d+)/.exec(countText) ?? [])[1]);
    if (!(total >= 2)) throw new Error(`seçili sayısı beklenmedik: ${countText}`);
    await page.getByTestId("bulk-save").click();
    await page.getByText(/hayvana parazit ilacı kaydı eklendi/).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const before = await serverHealth(animals[tag2].id);
    const batchRec = before.find((r) => r.productName === "Ivermektin");
    if (!batchRec || !batchRec.batchId) throw new Error("toplu kayıt sunucuda yok veya batch_id boş");
    await page.getByText("Geri al").click();
    await page.waitForTimeout(4000);
    const after = await serverHealth(animals[tag2].id);
    if (after.some((r) => r.productName === "Ivermektin")) throw new Error("geri alma sunucuya yansımadı");
  });

  const tag3 = `TR-${(Date.now() + 13) % 100000}`;
  await step("koç eklenir", async () => {
    await page.getByText("Hayvanlar").last().click();
    await page.getByTestId("animal-add").click();
    await page.getByTestId("origin-purchased").click();
    await page.getByTestId("sex-male").click();
    await page.getByTestId("animal-tag").fill(tag3);
    await page.getByTestId("animal-breed").click();
    await page.getByTestId("picker-breed").getByText("Kıvırcık", { exact: true }).click();
    await page.getByTestId("animal-save").click();
    await page.getByTestId("animal-edit").waitFor({ timeout: 15_000 });
  });

  await step("çiftleşme kaydı: akrabalık yok, gebe rozeti, sunucuda tahmin", async () => {
    await page.getByText("Hayvanlar").last().click();
    await page.getByTestId(`animal-row-${tag1}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-breeding").click();
    await page.getByTestId("breeding-partner").click();
    await page.getByTestId("picker-partner").getByText(tag3, { exact: true }).click();
    await page.getByTestId("relatedness").getByText("Ortak ata yok").waitFor({ timeout: 10_000 });
    await page.getByTestId("summary-partner").waitFor({ timeout: 5_000 });
    await page.getByTestId("breeding-save").click();
    await page.getByTestId("badge-pregnant").waitFor({ timeout: 10_000 });
    await page.getByTestId("pregnancy-line").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    if (!animals[tag1].isPregnant) throw new Error("sunucuda is_pregnant false");
    const preds = await serverPredictions(animals[tag1].id);
    const p = preds.find((x) => x.type === "birth_date" && !x.evaluatedAt);
    if (!p) throw new Error("doğum tarihi tahmini yok");
    if (!p.targetDate?.startsWith(animals[tag1].expectedBirthAt)) throw new Error(`tahmin ${p.targetDate} ≠ ${animals[tag1].expectedBirthAt}`);
  });

  const tag4 = `TR-${(Date.now() + 29) % 100000}`;
  await step("doğum kaydı: yavru otomatik açılır, tahmin değerlendirilir, gebelik biter", async () => {
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-lambing").click();
    await page.getByTestId("lamb-tag-0").fill(tag4);
    await page.getByTestId("lamb-male-0").click();
    await page.getByTestId("lambing-save").click();
    // Tek yavru: profil yavruya geçer.
    await page.getByText(tag4).filter({ visible: true }).first().waitFor({ timeout: 15_000 });
    await page.getByTestId("tab-pedigree").click();
    await page.getByTestId("pedigree-anne").getByText(tag1).waitFor({ timeout: 10_000 });
    await page.getByTestId("pedigree-baba").getByText(tag3).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const lamb = animals[tag4];
    if (!lamb) throw new Error("yavru sunucuda yok");
    if (lamb.motherId !== animals[tag1].id || lamb.fatherId !== animals[tag3].id) throw new Error("anne veya baba bağı yanlış");
    if (lamb.origin !== "born_here" || lamb.birthType !== "single" || !lamb.birthId) throw new Error("yavru alanları eksik");
    if (animals[tag1].isPregnant) throw new Error("doğumdan sonra hâlâ gebe");
    const preds = await serverPredictions(animals[tag1].id);
    const p = preds.find((x) => x.type === "birth_date");
    if (!p?.evaluatedAt || p.actualSourceTable !== "lambing_records") throw new Error("tahmin değerlendirilmedi");
    if (typeof p.error !== "number") throw new Error(`sapma sayı değil: ${p.error}`);
  });

  await step("akrabalık uyarısı: kardeş çiftleştirmede ortak ata", async () => {
    await page.getByText("Hayvanlar").last().click();
    await page.getByTestId(`animal-row-${tag2}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-breeding").click();
    await page.getByTestId("breeding-partner").click();
    await page.getByTestId("picker-partner").getByText(tag4, { exact: true }).click();
    await page.getByTestId("relatedness").getByText(new RegExp(`Ortak ata ${tag1}`)).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Vazgeç" }).click();
  });
} finally {
  await page.screenshot({ path: ".expo/e2e-final.png" }).catch(() => {});
  await browser.close();
  const errors = consoleLines.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[console.error]"));
  if (errors.length) {
    log(`--- ${errors.length} konsol hatası ---`);
    for (const e of errors.slice(0, 20)) console.log(e.slice(0, 600));
  }
  log(failed ? "SONUÇ: BAŞARISIZ" : "SONUÇ: TÜM ADIMLAR GEÇTİ");
  process.exit(failed ? 1 : 0);
}
