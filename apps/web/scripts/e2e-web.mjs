#!/usr/bin/env node
/**
 * Web uçtan uca duman testi (apps/web). Sistemdeki Chrome/Edge ile çalışır.
 * Ortam: WEB_URL (http://localhost:8092), API_URL (http://localhost:3000), E2E_EMAIL, E2E_PASSWORD, BROWSER_CHANNEL (chrome|msedge), HEADED=1
 */
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:8092";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "sahip@ankafarm.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "degistir123";
const CHANNEL = process.env.BROWSER_CHANNEL ?? "chrome";

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const consoleLines = [];

async function api(path, input) {
  const login = await fetch(`${API_URL}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASSWORD } }),
  }).then((r) => r.json());
  const token = login.result.data.json.accessToken;
  const url = `${API_URL}/trpc/${path}` + (input ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  return res.result.data.json;
}
const serverGroups = async () => (await api("groups.list")).map((g) => g.name);
const serverAnimals = async () => Object.fromEntries((await api("animals.list", { includeInactive: true })).map((a) => [a.tagNo, a]));
const serverHealth = (animalId) => api("health.list", { animalId });
const serverPredictions = (animalId) => api("predictions.list", { animalId });

// 3000 portunu eski docker konteyneri kapmış olabilir; o bundle'da socket.io ve yeni tablolar yok.
// Testler tuhaf yerlerde patlamadan önce burada anlaşılsın.
{
  const res = await fetch(`${API_URL}/socket.io/?EIO=4&transport=polling`).catch(() => null);
  if (!res || !res.ok) {
    console.error(`API ${API_URL} beklenen sürüm değil (socket.io yanıt vermiyor). Docker api konteynerini durdur, 'corepack pnpm api' ile çalıştır.`);
    process.exit(1);
  }
}

const browser = await chromium.launch({ channel: CHANNEL, headless: process.env.HEADED !== "1" });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
page.on("console", (msg) => {
  const line = `[console.${msg.type()}] ${msg.text()}`;
  consoleLines.push(line);
  if (msg.type() === "error") log(line.slice(0, 300));
});
page.on("pageerror", (err) => log("[pageerror]", err.message));

let failed = false;
const step = async (name, fn) => {
  try {
    await fn();
    log("OK  ", name);
  } catch (err) {
    failed = true;
    log("FAIL", name, "→", err.message.split("\n")[0]);
    await page.screenshot({ path: `.e2e/${name.replace(/\W+/g, "_")}.png`, fullPage: true }).catch(() => {});
  }
};

try {
  await step("sayfa açılır ve crossOriginIsolated", async () => {
    await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
    if (!(await page.evaluate(() => self.crossOriginIsolated))) throw new Error("crossOriginIsolated değil");
  });

  await step("giriş yapılır", async () => {
    await page.getByTestId("login-email").waitFor({ timeout: 60_000 });
    await page.getByTestId("login-email").fill(EMAIL);
    await page.getByTestId("login-password").fill(PASSWORD);
    await page.getByTestId("login-submit").click();
    await page.getByTestId("kpi-total").waitFor({ timeout: 60_000 });
  });

  await step("ilk senkron biter, kalıcı depolama", async () => {
    await page.getByTestId("sync-banner").getByText("Güncel").waitFor({ timeout: 60_000 });
    await page.getByTestId("nav-settings").click();
    await page.getByText("Kalıcı (OPFS)").waitFor({ timeout: 10_000 });
  });

  await step("Gruplar'da Ana sürü görünür", async () => {
    await page.getByTestId("settings-groups").click();
    await page.getByRole("cell", { name: "Ana sürü", exact: true }).waitFor({ timeout: 30_000 });
  });

  const name1 = `Test ${Date.now() % 10000}`;
  await step("çevrimiçi grup eklenir ve sunucuya gider", async () => {
    await page.getByTestId("group-add").click();
    await page.getByTestId("group-name").fill(name1);
    await page.getByTestId("group-save").click();
    await page.getByRole("cell", { name: name1, exact: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    if (!(await serverGroups()).includes(name1)) throw new Error("sunucuda yok");
  });

  const name2 = `Offline ${Date.now() % 10000}`;
  await step("çevrimdışı grup eklenir, kuyrukta bekler", async () => {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByTestId("group-add").click();
    await page.getByTestId("group-name").fill(name2);
    await page.getByTestId("group-save").click();
    await page.getByRole("cell", { name: name2, exact: true }).waitFor({ timeout: 10_000 });
    await page.getByTestId("sync-banner").getByText(/Çevrimdışı|bekliyor/).waitFor({ timeout: 15_000 });
    if ((await serverGroups()).includes(name2)) throw new Error("çevrimdışıyken sunucuya gitmemeliydi");
  });

  await step("bağlantı gelince kuyruk boşalır", async () => {
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    for (let i = 0; i < 20; i++) {
      if ((await serverGroups()).includes(name2)) return;
      await page.waitForTimeout(1500);
    }
    throw new Error("30 sn içinde sunucuya ulaşmadı");
  });

  await step("yenileme sonrası veri yerelde durur", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("cell", { name: name1, exact: true }).waitFor({ timeout: 60_000 });
    await page.getByRole("cell", { name: name2, exact: true }).waitFor({ timeout: 15_000 });
  });

  await step("hayvan listesi tablo halinde", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByRole("columnheader", { name: "Küpe" }).waitFor({ timeout: 15_000 });
  });

  const tag1 = `TR-${Date.now() % 100000}`;
  await step("dışarıdan alınan hayvan eklenir ve sunucuya gider", async () => {
    await page.getByTestId("animal-add").click();
    await page.getByTestId("origin-purchased").click();
    await page.getByTestId("animal-tag").fill(tag1);
    await page.getByTestId("animal-name").fill("Pamuk");
    await page.getByTestId("animal-breed").click();
    await page.getByTestId("animal-breed-list").getByText("Kıvırcık", { exact: true }).click();
    await page.getByTestId("animal-save").click();
    await page.getByTestId("animal-edit").waitFor({ timeout: 15_000 });
    await page.getByRole("heading", { name: `${tag1} · Pamuk` }).waitFor({ timeout: 5_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    if (!animals[tag1] || animals[tag1].origin !== "purchased" || !animals[tag1].breedId) throw new Error("sunucuda eksik");
  });

  await step("aynı küpe numarası yerelde reddedilir", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId("animal-add").click();
    await page.getByTestId("origin-purchased").click();
    await page.getByTestId("animal-tag").fill(tag1.toLowerCase());
    await page.getByTestId("animal-breed").click();
    await page.getByTestId("animal-breed-list").getByText("Kıvırcık", { exact: true }).click();
    await page.getByTestId("animal-save").click();
    await page.getByText(/zaten kayıtlı/).first().waitFor({ timeout: 10_000 });
  });

  const tag2 = `TR-${(Date.now() + 7) % 100000}`;
  await step("burada doğan hayvan anne ile eklenir", async () => {
    await page.getByTestId("origin-born").click();
    await page.getByTestId("animal-tag").fill(tag2);
    await page.getByTestId("animal-mother").click();
    await page.getByTestId("animal-mother-list").getByText(tag1, { exact: true }).click();
    await page.getByTestId("animal-birthdate").fill("2026-03-10");
    await page.getByTestId("animal-save").click();
    await page.getByTestId("animal-edit").waitFor({ timeout: 15_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const child = animals[tag2];
    if (!child || child.motherId !== animals[tag1].id) throw new Error("anne bağı yok");
    if (child.birthDate !== "2026-03-10") throw new Error(`doğum tarihi ${child.birthDate}`);
    if (child.breedId !== animals[tag1].breedId) throw new Error("ırk anneden gelmedi");
  });

  await step("tartım: rozet, zaman çizelgesi, sunucuda türev kilo", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`animal-row-${tag1}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-weight").click();
    await page.getByTestId("weight-kg").fill("52,5");
    await page.getByTestId("weight-save").click();
    await page.getByTestId("badge-weight").getByText("52,5 kg").waitFor({ timeout: 10_000 });
    await page.getByTestId("timeline-weight").first().waitFor({ timeout: 10_000 });
    await page.getByTestId("timeline-created").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    if (animals[tag1].currentWeight !== 52.5) throw new Error(`sunucu current_weight ${animals[tag1].currentWeight}`);
  });

  await step("ikinci tartım farkı gösterir ve grafik çizilir", async () => {
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-weight").click();
    await page.getByTestId("weight-kg").fill("55");
    await page.getByTestId("weight-date").fill("2026-10-01");
    await page.getByTestId("weight-save").click();
    await page.getByText(/önceki tartıma göre \+2,5 kg/).first().waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-weight").click();
    await page.getByTestId("weight-chart").locator("canvas").first().waitFor({ timeout: 15_000 });
  });

  await step("sağlık kaydı: arınma rozeti ve sunucuda türev tarih", async () => {
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-health").click();
    await page.getByTestId("health-type-vaccine").click();
    await page.getByTestId("health-product").fill("Enterotoksemi");
    await page.getByTestId("health-dose").fill("2");
    await page.getByTestId("health-withdrawal").fill("7");
    await page.getByTestId("health-nextdue").fill("2027-03-20");
    await page.getByTestId("health-save").click();
    await page.getByTestId("badge-health").getByText(/Arınma/).waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-timeline").click();
    await page.getByTestId("timeline-health").first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const rec = (await serverHealth(animals[tag1].id)).find((r) => r.productName === "Enterotoksemi");
    if (!rec) throw new Error("sunucuda yok");
    // Uygulama seçilen yerel günü öğlen 12:00 olarak yazar; beklenti de yerel günden hesaplanır.
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    base.setDate(base.getDate() + 7);
    const expected = base.toISOString().slice(0, 10);
    if (rec.withdrawalUntil !== expected) throw new Error(`arınma ${rec.withdrawalUntil} ≠ ${expected}`);
    if (rec.nextDueAt !== "2027-03-20") throw new Error(`sonraki doz ${rec.nextDueAt}`);
  });

  await step("toplu parazit ilacı tüm sürüye girilir ve geri alınır", async () => {
    await page.getByTestId("nav-animalsbulk").click();
    await page.getByTestId("health-type-deworming").click();
    await page.getByTestId("health-product").fill("Ivermektin");
    await page.getByTestId("bulk-count").waitFor({ timeout: 10_000 });
    const total = Number((/\/\s*(\d+)/.exec(await page.getByTestId("bulk-count").innerText()) ?? [])[1]);
    if (!(total >= 2)) throw new Error("seçili sayısı beklenmedik");
    await page.getByTestId("bulk-save").click();
    await page.getByText(/hayvana parazit ilacı kaydı eklendi/).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const before = (await serverHealth(animals[tag2].id)).find((r) => r.productName === "Ivermektin");
    if (!before || !before.batchId) throw new Error("toplu kayıt sunucuda yok");
    await page.getByRole("button", { name: "Geri al" }).click();
    await page.waitForTimeout(4000);
    if ((await serverHealth(animals[tag2].id)).some((r) => r.productName === "Ivermektin")) throw new Error("geri alma yansımadı");
  });

  const tag3 = `TR-${(Date.now() + 13) % 100000}`;
  await step("koç eklenir", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId("animal-add").click();
    await page.getByTestId("origin-purchased").click();
    await page.getByTestId("sex-male").click();
    await page.getByTestId("animal-tag").fill(tag3);
    await page.getByTestId("animal-breed").click();
    await page.getByTestId("animal-breed-list").getByText("Kıvırcık", { exact: true }).click();
    await page.getByTestId("animal-save").click();
    await page.getByTestId("animal-edit").waitFor({ timeout: 15_000 });
  });

  await step("çiftleşme: akrabalık yok, gebe rozeti, sunucuda tahmin", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`animal-row-${tag1}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-breeding").click();
    await page.getByTestId("breeding-partner").click();
    await page.getByTestId("breeding-partner-list").getByText(tag3, { exact: true }).click();
    await page.getByTestId("relatedness").getByText("Ortak ata yok").waitFor({ timeout: 10_000 });
    await page.getByTestId("summary-partner").waitFor({ timeout: 5_000 });
    await page.getByTestId("breeding-save").click();
    await page.getByTestId("badge-pregnant").waitFor({ timeout: 10_000 });
    await page.getByTestId("pregnancy-line").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    if (!animals[tag1].isPregnant) throw new Error("sunucuda is_pregnant false");
    const p = (await serverPredictions(animals[tag1].id)).find((x) => x.type === "birth_date" && !x.evaluatedAt);
    if (!p || !p.targetDate?.startsWith(animals[tag1].expectedBirthAt)) throw new Error("doğum tahmini yok veya yanlış");
  });

  const tag4 = `TR-${(Date.now() + 29) % 100000}`;
  await step("doğum: yavru otomatik açılır, tahmin değerlendirilir, gebelik biter", async () => {
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-lambing").click();
    await page.getByTestId("lamb-tag-0").fill(tag4);
    await page.getByTestId("lamb-male-0").click();
    await page.getByTestId("lambing-save").click();
    await page.getByRole("heading", { name: tag4 }).waitFor({ timeout: 15_000 });
    await page.getByTestId("tab-pedigree").click();
    await page.getByTestId("pedigree-anne").getByText(tag1).waitFor({ timeout: 10_000 });
    await page.getByTestId("pedigree-baba").getByText(tag3).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const lamb = animals[tag4];
    if (!lamb || lamb.motherId !== animals[tag1].id || lamb.fatherId !== animals[tag3].id) throw new Error("anne veya baba bağı yanlış");
    if (lamb.origin !== "born_here" || lamb.birthType !== "single" || !lamb.birthId) throw new Error("yavru alanları eksik");
    if (animals[tag1].isPregnant) throw new Error("doğumdan sonra hâlâ gebe");
    const p = (await serverPredictions(animals[tag1].id)).find((x) => x.type === "birth_date");
    if (!p?.evaluatedAt || p.actualSourceTable !== "lambing_records" || typeof p.error !== "number") throw new Error("tahmin değerlendirilmedi");
  });

  await step("akrabalık uyarısı: kardeş çiftleştirmede ortak ata", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`animal-row-${tag2}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-breeding").click();
    await page.getByTestId("breeding-partner").click();
    await page.getByTestId("breeding-partner-list").getByText(tag4, { exact: true }).click();
    await page.getByTestId("relatedness").getByText(new RegExp(`Ortak ata ${tag1}`)).waitFor({ timeout: 10_000 });
    await page.getByRole("button", { name: "Vazgeç" }).click();
  });

  await step("gözlem: olağandışı rozeti, Bugün listesi, zaman çizelgesi", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`animal-row-${tag2}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-observation").click();
    await page.getByTestId("obs-cat-movement").click();
    await page.getByTestId("obs-sev-moderate").click();
    await page.getByTestId("obs-tag-Topallama").click();
    await page.getByTestId("obs-note").fill("Sol ön ayak");
    await page.getByTestId("obs-save").click();
    await page.getByTestId("badge-observation").getByText(/1 olağandışı/).waitFor({ timeout: 10_000 });
    await page.getByTestId("timeline-observation").first().waitFor({ timeout: 10_000 });
    await page.getByTestId("nav-today").click();
    await page.getByText(/Hareket · Topallama/).first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const rows = await api("sync.pull", { cursors: {}, limit: 1000 });
    const rec = rows.tables.observations.find((o) => o.animalId === animals[tag2].id && o.category === "movement");
    if (!rec || !rec.tags.includes("Topallama") || rec.severity !== "moderate") throw new Error("sunucuda gözlem eksik");
  });

  await step("canlı yenileme: ikinci tarayıcıda eklenen grup ilkinde kendiliğinden görünür", async () => {
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page2 = await ctx2.newPage();
    try {
      await page2.goto(WEB_URL, { waitUntil: "domcontentloaded" });
      await page2.getByTestId("login-email").fill(EMAIL);
      await page2.getByTestId("login-password").fill(PASSWORD);
      await page2.getByTestId("login-submit").click();
      await page2.getByTestId("sync-banner").getByText("Güncel").waitFor({ timeout: 60_000 });
      await page.getByTestId("nav-settings").click();
      await page.getByTestId("settings-groups").click();
      await page.getByRole("cell", { name: "Ana sürü", exact: true }).waitFor({ timeout: 15_000 });
      const name = `Canlı ${Date.now() % 10000}`;
      await page2.getByTestId("nav-settings").click();
      await page2.getByTestId("settings-groups").click();
      await page2.getByTestId("group-add").click();
      await page2.getByTestId("group-name").fill(name);
      await page2.getByTestId("group-save").click();
      // İlk tarayıcı hiçbir şey yapmadan, periyodik 60 sn'den çok önce görmeli.
      await page.getByRole("cell", { name, exact: true }).waitFor({ timeout: 20_000 });
    
  await step("profilden grup değiştirilir: rozet, zaman çizelgesi, sunucuda group_id", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`animal-row-${tag1}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-move").click();
    await page.getByTestId("move-group").click();
    await page.getByTestId("move-group-list").getByText(name1, { exact: true }).click();
    await page.getByTestId("move-reason").fill("Doğuma hazırlık");
    await page.getByTestId("move-save").click();
    await page.getByTestId("badge-group").getByText(name1, { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByTestId("timeline-group_move").first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const pulled = await api("sync.pull", { cursors: {}, limit: 1000 });
    const g1 = pulled.tables.groups.find((g) => g.name === name1);
    const animals = await serverAnimals();
    if (!g1 || animals[tag1].groupId !== g1.id) throw new Error(`sunucuda group_id ${animals[tag1].groupId} beklenen ${g1?.id}`);
  });

  await step("listeden toplu taşıma, grup filtresi ve grup sayıları", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`select-${tag1}`).click();
    await page.getByTestId(`select-${tag2}`).click();
    await page.getByTestId("selection-bar").getByText("2 seçili").waitFor({ timeout: 5_000 });
    await page.getByTestId("bulk-move").click();
    await page.getByTestId("move-group").click();
    await page.getByTestId("move-group-list").getByText(name2, { exact: true }).click();
    await page.getByTestId("move-save").click();
    await page.getByTestId(`group-cell-${tag1}`).getByText(name2, { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByTestId(`group-cell-${tag2}`).getByText(name2, { exact: true }).waitFor({ timeout: 10_000 });
    await page.getByTestId("animal-group-filter").click();
    await page.getByTestId("animal-group-filter-list").getByText(name2, { exact: true }).click();
    await page.getByTestId(`animal-row-${tag2}`).waitFor({ timeout: 5_000 });
    if (await page.getByTestId(`animal-row-${tag3}`).count()) throw new Error("filtre dışı hayvan listede");
    if ((await page.getByTestId(/^animal-row-/).count()) !== 2) throw new Error("filtrede 2 hayvan olmalı");
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-groups").click();
    await page.getByTestId(`group-count-${name2}`).getByText("2", { exact: true }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const pulled = await api("sync.pull", { cursors: {}, limit: 1000 });
    const g2 = pulled.tables.groups.find((g) => g.name === name2);
    const animals = await serverAnimals();
    if (!g2 || animals[tag1].groupId !== g2.id || animals[tag2].groupId !== g2.id) throw new Error("sunucuda toplu taşıma eksik");
    const mv = pulled.tables.group_movements.filter((m) => m.animalId === animals[tag1].id);
    if (mv.length !== 2 || !mv.some((m) => m.fromGroupId === (pulled.tables.groups.find((g) => g.name === name1) ?? {}).id)) throw new Error("hareket kayıtları eksik");
  });

  await step("QR: /a/<id> adresi profili açar, QR dialogu, elle giriş, girişsiz gelince giriş sonrası profile döner", async () => {
    const animals = await serverAnimals();
    const id1 = animals[tag1].id;
    await page.goto(`${WEB_URL}/a/${id1}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: `${tag1} · Pamuk` }).waitFor({ timeout: 30_000 });
    await page.getByTestId("animal-qr").click();
    await page.getByTestId("qr-canvas").waitFor({ timeout: 5_000 });
    const urlText = await page.getByTestId("qr-url").innerText();
    if (!urlText.endsWith(`/a/${id1}`)) throw new Error(`QR adresi ${urlText}`);
    await page.keyboard.press("Escape");
    await page.getByTestId("nav-scan").click();
    await page.getByTestId("scan-camera-off").waitFor({ timeout: 15_000 });
    await page.getByTestId("scan-manual").fill(urlText);
    await page.getByTestId("scan-submit").click();
    await page.getByRole("heading", { name: `${tag1} · Pamuk` }).waitFor({ timeout: 10_000 });
    await page.getByTestId("nav-scan").click();
    await page.getByTestId("scan-manual").fill(tag2.toLowerCase());
    await page.getByTestId("scan-submit").click();
    await page.getByRole("heading", { name: new RegExp(`^${tag2}`) }).waitFor({ timeout: 10_000 });
    await page.getByTestId("nav-scan").click();
    await page.getByTestId("scan-manual").fill("TR-YOK-999");
    await page.getByTestId("scan-submit").click();
    await page.getByText(/bulunamadı/).first().waitFor({ timeout: 5_000 });
    const ctx3 = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    try {
      const p3 = await ctx3.newPage();
      await p3.goto(`${WEB_URL}/a/${id1}`, { waitUntil: "domcontentloaded" });
      await p3.getByTestId("login-email").waitFor({ timeout: 30_000 });
      await p3.getByTestId("login-email").fill(EMAIL);
      await p3.getByTestId("login-password").fill(PASSWORD);
      await p3.getByTestId("login-submit").click();
      await p3.getByRole("heading", { name: `${tag1} · Pamuk` }).waitFor({ timeout: 60_000 });
    
  await step("Bugün v1: senkron kartı, son olaylar akışı, bekleyen işler", async () => {
    await page.getByTestId("nav-today").click();
    await page.getByTestId("today-sync").getByText(/güncel|bekliyor|Senkron/).first().waitFor({ timeout: 15_000 });
    await page.getByTestId("today-feed").locator("li").first().waitFor({ timeout: 15_000 });
    const n = await page.getByTestId("today-feed").locator("li").count();
    if (n < 5) throw new Error(`akışta ${n} olay var, en az 5 bekleniyordu`);
    await page.getByTestId("feed-group_move").first().waitFor({ timeout: 5_000 });
    await page.getByTestId("feed-observation").first().waitFor({ timeout: 5_000 });
    const kpi = await page.getByTestId("kpi-alerts").innerText();
    if (!/\d/.test(kpi)) throw new Error("bekleyen iş sayısı yok");
  });

  const feedName = `Yem ${(Date.now() + 41) % 100000}`;
  await step("stok: kalem açılır, alım bakiyeyi artırır, tüketim düşürür, kalan gün hesaplanır", async () => {
    await page.getByTestId("nav-stock").click();
    await page.getByTestId("stock-row-Yonca").waitFor({ timeout: 15_000 });
    await page.getByTestId("item-add").click();
    await page.getByTestId("item-name").fill(feedName);
    await page.getByTestId("item-min").fill("100");
    await page.getByTestId("item-save").click();
    await page.getByTestId(`stock-row-${feedName}`).waitFor({ timeout: 10_000 });

    await page.getByTestId("purchase-add").click();
    await page.getByTestId("purchase-item").click();
    await page.getByTestId("purchase-item-list").getByText(feedName, { exact: true }).click();
    await page.getByTestId("purchase-qty").fill("500");
    await page.getByTestId("purchase-price").fill("12,5");
    await page.getByTestId("purchase-preview").getByText(/6\.250/).waitFor({ timeout: 5_000 });
    await page.getByTestId("purchase-supplier").fill("Yem bayii");
    await page.getByTestId("purchase-save").click();
    await page.getByTestId(`stock-balance-${feedName}`).getByText("500 kg").waitFor({ timeout: 10_000 });

    await page.getByTestId("consumption-add").click();
    await page.getByTestId(`consumption-qty-${feedName}`).fill("25");
    await page.getByTestId("consumption-save").click();
    await page.getByTestId(`stock-balance-${feedName}`).getByText("475 kg").waitFor({ timeout: 10_000 });
    // 475 kg bakiye, 14 günlük pencerede 25 kg → floor(475 * 14 / 25) = 266 gün.
    await page.getByTestId(`stock-days-${feedName}`).getByText("266 gün").waitFor({ timeout: 10_000 });
    await page.getByTestId("stock-balance-Su").getByText("takip yok").waitFor({ timeout: 5_000 });

    await page.waitForTimeout(4000);
    const pulled = await api("sync.pull", { cursors: {}, limit: 1000 });
    const item = pulled.tables.stock_items.find((i) => i.name === feedName);
    if (!item || item.minStock == null) throw new Error("sunucuda kalem eksik");
    const buy = pulled.tables.purchases.find((p) => p.itemId === item.id);
    if (!buy || Number(buy.total) !== 6250 || Number(buy.unitPrice) !== 12.5) throw new Error(`sunucuda alım tutarı ${buy && buy.total}`);
    const used = pulled.tables.consumptions.filter((c) => c.itemId === item.id);
    if (used.length !== 1 || Number(used[0].quantity) !== 25) throw new Error("sunucuda tüketim eksik");
  });

  await step("stok: 'dünkü gibi' son günü doldurur", async () => {
    await page.getByTestId("consumption-add").click();
    await page.getByTestId("consumption-repeat").click();
    const value = await page.getByTestId(`consumption-qty-${feedName}`).inputValue();
    if (Number(value.replace(",", ".")) !== 25) throw new Error(`dünkü gibi ${value} doldurdu`);
    await page.getByRole("button", { name: "Vazgeç" }).click();
  });

  await step("stok: çevrimdışı tüketim kuyrukta bekler, bağlantı gelince gider", async () => {
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByTestId("consumption-add").click();
    await page.getByTestId(`consumption-qty-${feedName}`).fill("30");
    await page.getByTestId("consumption-save").click();
    await page.getByTestId(`stock-balance-${feedName}`).getByText("445 kg").waitFor({ timeout: 10_000 });
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    for (let i = 0; i < 20; i++) {
      const pulled = await api("sync.pull", { cursors: {}, limit: 1000 });
      const item = pulled.tables.stock_items.find((x) => x.name === feedName);
      const total = pulled.tables.consumptions.filter((c) => c.itemId === item.id).reduce((sum, c) => sum + Number(c.quantity), 0);
      if (total === 55) return;
      await page.waitForTimeout(1500);
    }
    throw new Error("çevrimdışı tüketim sunucuya ulaşmadı");
  });

  await step("finans: gider ve gelir, aylık özette alım da sayılır", async () => {
    const money = async (id) => Number((await page.getByTestId(id).innerText()).replace(/[^\d,]/g, "").replace(/\./g, "").replace(",", "."));
    await page.getByTestId("nav-finance").click();
    await page.getByTestId(`cost-row-${feedName}`).getByText(/6\.250/).waitFor({ timeout: 15_000 });
    const before = await money("kpi-expense");
    await page.getByTestId("expense-add").click();
    await page.getByTestId("expense-cat-vet").click();
    await page.getByTestId("expense-amount").fill("750");
    await page.getByTestId("expense-desc").fill("Sürü muayenesi");
    await page.getByTestId("expense-save").click();
    await page.getByTestId("expense-row-Veteriner").first().waitFor({ timeout: 10_000 });
    for (let i = 0; i < 20 && (await money("kpi-expense")) !== before + 750; i++) await page.waitForTimeout(500);
    if ((await money("kpi-expense")) !== before + 750) throw new Error("gider toplamı güncellenmedi");

    const incomeBefore = await money("kpi-income");
    await page.getByTestId("income-add").click();
    await page.getByTestId("income-cat-animal_sale").click();
    await page.getByTestId("income-amount").fill("9000");
    await page.getByTestId("income-save").click();
    for (let i = 0; i < 20 && (await money("kpi-income")) !== incomeBefore + 9000; i++) await page.waitForTimeout(500);
    if ((await money("kpi-income")) !== incomeBefore + 9000) throw new Error("gelir toplamı güncellenmedi");

    await page.waitForTimeout(4000);
    const pulled = await api("sync.pull", { cursors: {}, limit: 1000 });
    if (!pulled.tables.expenses.some((e) => e.category === "vet" && Number(e.amount) === 750)) throw new Error("sunucuda gider yok");
    if (!pulled.tables.incomes.some((i) => Number(i.amount) === 9000)) throw new Error("sunucuda gelir yok");
  });

  await step("günlük tur: hepsi normal varsayılanı, işaretli hayvan gözleme dönüşür, tur kaydı düşer", async () => {
    await page.getByTestId("nav-animalsround").click();
    await page.getByTestId("round-total").waitFor({ timeout: 15_000 });
    await page.getByTestId("round-marked").getByText("0", { exact: true }).waitFor({ timeout: 5_000 });
    await page.getByTestId(`round-row-${tag1}`).click();
    await page.getByTestId(`round-panel-${tag1}`).waitFor({ timeout: 5_000 });
    await page.getByTestId(`round-cat-${tag1}-digestive`).click();
    await page.getByTestId(`round-sev-${tag1}-moderate`).click();
    await page.getByTestId(`round-tag-${tag1}-İshal`).click();
    await page.getByTestId(`round-note-${tag1}`).fill("Sabah turunda");
    await page.getByTestId("round-marked").getByText("1", { exact: true }).waitFor({ timeout: 5_000 });
    await page.getByTestId("round-save").click();
    await page.getByTestId("kpi-total").waitFor({ timeout: 15_000 });

    await page.getByTestId("nav-animalsround").click();
    await page.getByTestId("round-status").getByText("Yapıldı").waitFor({ timeout: 15_000 });

    await page.waitForTimeout(4000);
    const animals = await serverAnimals();
    const pulled = await api("sync.pull", { cursors: {}, limit: 1000 });
    const marked = pulled.tables.observations.find((o) => o.animalId === animals[tag1].id && o.category === "digestive");
    if (!marked || marked.severity !== "moderate" || !marked.tags.includes("İshal")) throw new Error("işaretli hayvanın gözlemi sunucuda yok");
    const rounds = pulled.tables.observations.filter((o) => o.animalId === null && o.tags.includes("Günlük tur"));
    if (rounds.length === 0) throw new Error("tur kaydı sunucuda yok");
    if (!rounds.some((r) => /1 işaretli/.test(r.note ?? ""))) throw new Error(`tur özeti hatalı: ${rounds.map((r) => r.note).join("|")}`);
  });

  await step("raporlar: sürü, üretim ve para sekmeleri, grafikler çizilir", async () => {
    await page.getByTestId("nav-reports").click();
    await page.getByTestId("report-total").waitFor({ timeout: 15_000 });
    await page.getByTestId("chart-age").locator("canvas").first().waitFor({ timeout: 15_000 });
    await page.getByTestId("chart-breed").locator("canvas").first().waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-production").click();
    await page.getByTestId("report-births").waitFor({ timeout: 10_000 });
    await page.getByTestId("chart-births").locator("canvas").first().waitFor({ timeout: 10_000 });
    await page.getByTestId("tab-money").click();
    await page.getByTestId("chart-money").locator("canvas").first().waitFor({ timeout: 10_000 });
    await page.getByTestId("chart-consumption").locator("canvas").first().waitFor({ timeout: 10_000 });
    // Para sekmesindeki 12 aylık gider, bu ayki alım ve gideri kapsamalı.
    const expense = Number((await page.getByTestId("report-expense").innerText()).replace(/[^\d,]/g, "").replace(/\./g, "").replace(",", "."));
    if (!(expense >= 7000)) throw new Error(`12 ay gider ${expense}`);
  });

  await step("Bugün v2: sürü nabzı, stok uyarısı ve günlük tur kartı", async () => {
    await page.getByTestId("nav-today").click();
    await page.getByTestId("kpi-compliance").waitFor({ timeout: 15_000 });
    const compliance = await page.getByTestId("kpi-compliance").innerText();
    if (!/%\d+/.test(compliance)) throw new Error(`aşı uyumu okunamadı: ${compliance}`);
    await page.getByTestId("kpi-weight-trend").getByText(/kg/).waitFor({ timeout: 10_000 });
    await page.getByTestId("kpi-month-expense").getByText(/TL/).first().waitFor({ timeout: 10_000 });
    await page.getByText("Günlük tur yapıldı").waitFor({ timeout: 10_000 });
    await page.getByText(/Stok seviyeleri yeterli|gün$/).first().waitFor({ timeout: 10_000 });
  });

  await step("maliyet raporu ve senkron ekranı: hayvan başı gider, reddedilen kayıt düzeltilebilir", async () => {
    await page.getByTestId("nav-reports").click();
    await page.getByTestId("tab-money").click();
    await page.getByTestId("table-efficiency").waitFor({ timeout: 15_000 });
    const thisMonth = new Date().toISOString().slice(0, 7);
    const row = page.getByTestId(`efficiency-row-${thisMonth}`);
    await row.waitFor({ timeout: 10_000 });
    const cells = (await row.innerText()).split("	").map((c) => c.trim());
    // Ay, gider, hayvan, hayvan başı, yem gideri, kilo artışı, kg başına
    if (!/TL/.test(cells[1] ?? "")) throw new Error(`gider hücresi: ${cells[1]}`);
    if (!(Number(cells[2]) > 0)) throw new Error(`hayvan sayısı: ${cells[2]}`);
    if (!/TL/.test(cells[3] ?? "")) throw new Error(`hayvan başı: ${cells[3]}`);

    // Sunucunun reddedeceği bir kayıt: çevrimdışı negatif tartım yerelde de geçmez, bu yüzden
    // kuyrukta bekleyen bir kayıt üzerinden ekranı doğruluyoruz.
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByTestId("nav-stock").click();
    await page.getByTestId("consumption-add").click();
    await page.getByTestId(`consumption-qty-${feedName}`).fill("5");
    await page.getByTestId("consumption-save").click();
    await page.getByTestId("nav-settings").click();
    await page.getByTestId("settings-sync").click();
    await page.getByTestId("outbox-row-consumptions").getByText("Tüketim").waitFor({ timeout: 10_000 });
    await page.getByTestId("outbox-row-consumptions").getByRole("link", { name: "Kaydı aç" }).waitFor({ timeout: 5_000 });
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.getByTestId("sync-banner").getByText("Güncel").waitFor({ timeout: 30_000 });
  });
} finally {
      await ctx3.close();
    }
  });
} finally {
      await ctx2.close();
    }
  });

  await step("sürüden çıkış: arşive düşer, sunucuda durum, geri alınır", async () => {
    await page.getByTestId("nav-animals").click();
    await page.getByTestId(`animal-row-${tag3}`).click();
    await page.getByTestId("event-add").click();
    await page.getByTestId("event-exit").click();
    await page.getByTestId("exit-type-sold").click();
    await page.getByTestId("exit-price").fill("9000");
    await page.getByTestId("exit-reason").fill("Damızlık satış");
    await page.getByTestId("exit-save").click();
    await page.getByTestId("badge-exit").getByText(/Satıldı/).waitFor({ timeout: 10_000 });
    await page.getByTestId("timeline-exit").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    let animals = await serverAnimals();
    if (animals[tag3].status !== "sold") throw new Error(`sunucu status ${animals[tag3].status}`);
    await page.getByTestId("nav-animals").click();
    if (await page.getByTestId(`animal-row-${tag3}`).count()) throw new Error("satılan hayvan aktif listede");
    await page.getByTestId("filter-archived").click();
    await page.getByTestId(`animal-row-${tag3}`).click();
    await page.getByTestId("exit-undo").click();
    await page.getByTestId("badge-exit").waitFor({ state: "detached", timeout: 10_000 });
    await page.waitForTimeout(4000);
    animals = await serverAnimals();
    if (animals[tag3].status !== "active") throw new Error(`geri alma sonrası status ${animals[tag3].status}`);
  });
} finally {
  await page.screenshot({ path: ".e2e/final.png", fullPage: true }).catch(() => {});
  await browser.close();
  const errors = consoleLines.filter((l) => l.startsWith("[console.error]"));
  if (errors.length) {
    log(`--- ${errors.length} konsol hatası ---`);
    for (const e of errors.slice(0, 10)) console.log(e.slice(0, 500));
  }
  log(failed ? "SONUÇ: BAŞARISIZ" : "SONUÇ: TÜM ADIMLAR GEÇTİ");
  process.exit(failed ? 1 : 0);
}
