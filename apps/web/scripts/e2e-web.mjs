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
