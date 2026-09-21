#!/usr/bin/env node
/**
 * Senkron dayanıklılık testi (madde 4.1). Ana duman testinden ayrı çalışır çünkü yavaştır:
 * çok cihazlı çakışma, çıkış tarihi kuralı, büyük outbox, saat kayması ve tam yeniden senkron.
 *
 * Ortam: WEB_URL (http://localhost:8092), API_URL (http://localhost:3000), E2E_EMAIL, E2E_PASSWORD, HEADED=1
 */
import { chromium } from "playwright";

const WEB_URL = process.env.WEB_URL ?? "http://localhost:8092";
const API_URL = process.env.API_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL ?? "sahip@ankafarm.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "degistir123";
const CHANNEL = process.env.BROWSER_CHANNEL ?? "chrome";
const RUN = Math.random().toString(36).slice(2, 7).toUpperCase();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let tokenCache = null;
async function token() {
  if (tokenCache) return tokenCache;
  const res = await fetch(`${API_URL}/trpc/auth.login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: { email: EMAIL, password: PASSWORD } }),
  }).then((r) => r.json());
  tokenCache = res.result.data.json.accessToken;
  return tokenCache;
}

async function api(path, input) {
  const url = `${API_URL}/trpc/${path}` + (input ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}` : "");
  const res = await fetch(url, { headers: { authorization: `Bearer ${await token()}` } }).then((r) => r.json());
  if (!res.result) throw new Error(`api ${path}: ${JSON.stringify(res).slice(0, 200)}`);
  return res.result.data.json;
}

async function push(mutations) {
  const res = await fetch(`${API_URL}/trpc/sync.push`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ json: { mutations } }),
  }).then((r) => r.json());
  if (!res.result) throw new Error(`push: ${JSON.stringify(res).slice(0, 300)}`);
  return res.result.data.json;
}

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const browser = await chromium.launch({ channel: CHANNEL, headless: process.env.HEADED !== "1" });
let failed = false;

const step = async (name, fn) => {
  const started = Date.now();
  try {
    await fn();
    log("OK  ", name, `(${((Date.now() - started) / 1000).toFixed(1)} sn)`);
  } catch (err) {
    failed = true;
    log("FAIL", name, "→", err.message.split(String.fromCharCode(10))[0]);
  }
};

/** Giriş yapmış, ilk senkronu bitmiş bir tarayıcı bağlamı. */
async function device(label) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  await page.goto(WEB_URL, { waitUntil: "domcontentloaded" });
  await page.getByTestId("login-email").waitFor({ timeout: 60_000 });
  await page.getByTestId("login-email").fill(EMAIL);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.getByTestId("sync-banner").getByText("Güncel").waitFor({ timeout: 90_000 });
  return { label, context, page, close: () => context.close() };
}

const sql = (page, query, bind = []) => page.evaluate(([q, b]) => window.__ankaDb.query(q, b), [query, bind]);

try {
  // Testin kendi hayvanı: başka adımların verisine karışmasın.
  const tagNo = `ST-${RUN}`;
  const animalId = uuid();
  await step("hazırlık: test hayvanı sunucuya yazılır", async () => {
    const breeds = await api("breeds.list");
    const breedId = breeds.find((b) => b.species === "sheep")?.id;
    if (!breedId) throw new Error("koyun ırkı bulunamadı");
    const res = await push([
      {
        mutationId: uuid(),
        table: "animals",
        op: "insert",
        rowId: animalId,
        payload: { tagNo, name: "Stres", species: "sheep", sex: "female", origin: "purchased", breedId, acquiredAt: today() },
        clientCreatedAt: nowIso(),
      },
    ]);
    if (res.results[0].status !== "applied") throw new Error(JSON.stringify(res.results[0]));
  });

  await step("çakışma: iki cihaz aynı hayvanı çevrimdışı düzenler, son yazan kazanır, kaybeden denetimde kalır", async () => {
    const a = await device("A");
    const b = await device("B");
    try {
      // Önce iki cihazda da düzenleme ekranı açılır; çevrimdışına ondan sonra geçilir,
      // yoksa sayfa yüklemesi bile ağa takılır.
      for (const d of [a, b]) {
        await d.page.goto(`${WEB_URL}/animals/${animalId}/edit`, { waitUntil: "domcontentloaded" });
        await d.page.getByTestId("animal-name").waitFor({ timeout: 60_000 });
        await d.context.setOffline(true);
        await d.page.evaluate(() => window.dispatchEvent(new Event("offline")));
      }

      await a.page.getByTestId("animal-name").fill("A cihazı");
      await a.page.getByTestId("animal-save").click();
      await b.page.getByTestId("animal-name").fill("B cihazı");
      await b.page.getByTestId("animal-save").click();

      // A önce bağlanır, sonra B; sunucuda B kalmalı.
      for (const d of [a, b]) {
        await d.context.setOffline(false);
        await d.page.evaluate(() => window.dispatchEvent(new Event("online")));
        await d.page.getByTestId("sync-banner").getByText("Güncel").waitFor({ timeout: 60_000 });
      }

      let name = null;
      for (let i = 0; i < 20; i++) {
        const rows = await api("animals.list", { includeInactive: true });
        name = rows.find((x) => x.id === animalId)?.name;
        if (name === "B cihazı") break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (name !== "B cihazı") throw new Error(`sunucuda ad "${name}", son yazan kazanmadı`);

      // Kaybeden değer kaybolmadı: denetim kaydında duruyor.
      const audit = await api("audit.list", { recordId: animalId, limit: 50 });
      const sawA = audit.rows.some((r) => JSON.stringify(r.newData ?? {}).includes("A cihazı"));
      if (!sawA) throw new Error("kaybeden yazma denetim kaydında yok");

      // A cihazı da sunucudaki güncel değeri almalı.
      await a.page.goto(`${WEB_URL}/animals/${animalId}`, { waitUntil: "domcontentloaded" });
      await a.page.getByRole("heading", { name: new RegExp("B cihazı") }).waitFor({ timeout: 60_000 });
    } finally {
      await a.close();
      await b.close();
    }
  });

  await step("kural: çıkış sonrasına kayıt reddedilir, çıkış öncesi kayıt kabul edilir", async () => {
    const exitDay = today();
    const res = await push([
      { mutationId: uuid(), table: "exit_records", op: "insert", rowId: uuid(), payload: { animalId, type: "sold", exitedAt: exitDay, price: 1000 }, clientCreatedAt: nowIso() },
    ]);
    if (res.results[0].status !== "applied") throw new Error("çıkış kaydı uygulanmadı");

    const after = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const before = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const both = await push([
      { mutationId: uuid(), table: "weight_records", op: "insert", rowId: uuid(), payload: { animalId, weighedAt: after, weightKg: 50 }, clientCreatedAt: nowIso() },
      { mutationId: uuid(), table: "weight_records", op: "insert", rowId: uuid(), payload: { animalId, weighedAt: before, weightKg: 49 }, clientCreatedAt: nowIso() },
    ]);
    const [late, early] = both.results;
    if (late.status !== "rejected" || late.code !== "RULE") throw new Error(`çıkış sonrası kayıt ${late.status} oldu`);
    if (early.status !== "applied") throw new Error(`çıkış öncesi kayıt ${early.status} oldu: ${early.message ?? ""}`);
  });

  await step("kısmi batch: bir mutasyonun reddi diğerlerini durdurmaz", async () => {
    const good = uuid();
    const res = await push([
      { mutationId: uuid(), table: "observations", op: "insert", rowId: uuid(), payload: { animalId: uuid(), observedAt: nowIso(), category: "note", severity: "normal", tags: [] }, clientCreatedAt: nowIso() },
      { mutationId: uuid(), table: "groups", op: "insert", rowId: good, payload: { name: `Kısmi ${RUN}`, kind: "pen" }, clientCreatedAt: nowIso() },
    ]);
    if (res.results[0].status !== "rejected") throw new Error("olmayan hayvana gözlem kabul edildi");
    if (res.results[1].status !== "applied") throw new Error("sağlam mutasyon reddedildi");
    const groups = await api("groups.list");
    if (!groups.some((g) => g.id === good)) throw new Error("sağlam kayıt sunucuda yok");
  });

  await step("saat kayması: cihaz saati ileri olsa da kayıt kabul edilir", async () => {
    const future = new Date(Date.now() + 36 * 3600_000).toISOString();
    const res = await push([
      { mutationId: uuid(), table: "groups", op: "insert", rowId: uuid(), payload: { name: `Saat ${RUN}`, kind: "pen" }, clientCreatedAt: future },
    ]);
    if (res.results[0].status !== "applied") throw new Error(`ileri saatli kayıt ${res.results[0].status}`);
  });

  await step("büyük outbox: 250 kayıt parça parça gönderilir", async () => {
    const d = await device("C");
    try {
      const before = (await api("sync.pull", { cursors: {}, limit: 1000 })).tables.observations.length;
      await d.context.setOffline(true);
      await d.page.evaluate(() => window.dispatchEvent(new Event("offline")));

      // Uygulamanın kendi yazma yolu 250 kez tıklanamaz; yerel tabloya ve outbox'a doğrudan yazıp
      // senkron işçisinin parçalama davranışını ölçüyoruz.
      const ids = await d.page.evaluate(async (target) => {
        const made = [];
        const farm = (await window.__ankaDb.query("select value from meta where key = 'farmId'"))[0][0];
        for (let i = 0; i < 250; i++) {
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          made.push(id);
          await window.__ankaDb.query(
            "insert into observations (id, farm_id, created_at, updated_at, sync_seq, animal_id, observed_at, category, severity, tags, note) values (?,?,?,?,0,?,?,'note','normal','[]',?)",
            [id, farm, now, now, target, now, `stres ${i}`],
          );
          await window.__ankaDb.query(
            `insert into outbox (mutation_id, "table", op, row_id, payload, client_created_at, status, attempts) values (?,?,?,?,?,?,'pending',0)`,
            [crypto.randomUUID(), "observations", "insert", id, JSON.stringify({ animalId: target, observedAt: now, category: "note", severity: "normal", tags: [], note: `stres ${i}` }), now],
          );
        }
        return made;
      }, animalId);
      if (ids.length !== 250) throw new Error("yerel kayıtlar yazılamadı");

      await d.context.setOffline(false);
      await d.page.evaluate(() => window.dispatchEvent(new Event("online")));
      await d.page.getByTestId("nav-settings").click();
      await d.page.getByTestId("settings-sync").click();
      await d.page.getByRole("button", { name: "Şimdi senkronla" }).click();

      let pending = 250;
      for (let i = 0; i < 60; i++) {
        const rows = await sql(d.page, "select count(*) from outbox where status = 'pending'");
        pending = Number(rows[0][0]);
        if (pending === 0) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (pending !== 0) throw new Error(`${pending} kayıt kuyrukta kaldı`);

      const after = (await api("sync.pull", { cursors: {}, limit: 1000 })).tables.observations.length;
      if (after < before) throw new Error("sunucuda kayıt sayısı azaldı");
      const failedRows = await sql(d.page, "select count(*) from outbox where status = 'failed'");
      if (Number(failedRows[0][0]) !== 0) throw new Error("reddedilen kayıt var");
    } finally {
      await d.close();
    }
  });

  await step("tam yeniden senkron: imleçler sıfırlanınca veri eksiksiz geri gelir", async () => {
    const d = await device("D");
    try {
      const before = await sql(d.page, "select count(*) from animals");
      await sql(d.page, "delete from sync_cursors");
      await sql(d.page, "delete from animals");
      await d.page.getByTestId("nav-settings").click();
      await d.page.getByTestId("settings-sync").click();
      await d.page.getByRole("button", { name: "Şimdi senkronla" }).click();

      let after = 0;
      for (let i = 0; i < 60; i++) {
        const rows = await sql(d.page, "select count(*) from animals");
        after = Number(rows[0][0]);
        if (after >= Number(before[0][0])) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (after < Number(before[0][0])) throw new Error(`${before[0][0]} hayvandan ${after} tanesi geri geldi`);
    } finally {
      await d.close();
    }
  });
} finally {
  await browser.close();
  log(failed ? "SONUÇ: BAŞARISIZ" : "SONUÇ: TÜM ADIMLAR GEÇTİ");
  process.exit(failed ? 1 : 0);
}
