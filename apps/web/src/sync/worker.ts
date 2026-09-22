import { REMOVALS_CURSOR, syncedTables, type MutationEnvelope, type SyncedTable } from "@anka/shared";
import { asc, count, eq, inArray, sql } from "drizzle-orm";

import { getDb, withLocalTransaction } from "@/db";
import { attachments, localTables, meta, outbox, syncCursors, uploadQueue } from "@/db/schema";
import { base64ToBlob } from "@/features/attachments/image";
import { useAuthStore } from "@/lib/auth";
import { getApiUrl } from "@/lib/config";
import { getApiClient } from "@/lib/trpc";

import { notifyLocalChange } from "./events";
import { useSyncStore } from "./store";

const PUSH_BATCH = 100;
const PULL_LIMIT = 500;

let running = false;
let queued = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let backoffUntil = 0;
let failures = 0;

/** Yerel yazmalar arka arkaya gelir; 1,5 saniye toplayıp tek senkron başlatır. */
export function scheduleSync(reason: string, delayMs = 1500) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow(reason);
  }, delayMs);
}

/** Push sonra pull. Eşzamanlı çağrılar tek çalışmaya sıkışır; çalışırken gelen istek sonraya kalır. */
const BACKGROUND_REASONS = new Set(["start", "foreground", "periodic", "online", "queued"]);
/** Sunucudan "changed" geldi: kısma uygulanmaz, pull hemen yapılır. */
const REMOTE_REASON = "remote";
const MIN_BACKGROUND_INTERVAL_MS = 15_000;
let lastSuccessAt = 0;

export async function syncNow(reason: string): Promise<void> {
  const store = useSyncStore.getState();
  if (useAuthStore.getState().status !== "signedIn") return;
  if (running) {
    // Çalışırken gelen yerel yazma veya elle istek sonraya kalır; arka plan tetikleyicileri yok sayılır.
    if (!BACKGROUND_REASONS.has(reason) || reason === REMOTE_REASON) queued = true;
    return;
  }
  if (Date.now() < backoffUntil && reason !== "manual") {
    await refreshCounts();
    return;
  }
  // Web'de pencere odağı her değiştiğinde AppState "active" gelir; kuyruk boşsa sık sık pull atma.
  if (BACKGROUND_REASONS.has(reason) && Date.now() - lastSuccessAt < MIN_BACKGROUND_INTERVAL_MS) {
    await refreshCounts();
    if (useSyncStore.getState().pending === 0) return;
  }
  running = true;
  store.set({ status: "syncing" });
  try {
    await ensureLocalFarm();
    await pushOutbox();
    await pullAll();
    await processUploads();
    failures = 0;
    backoffUntil = 0;
    lastSuccessAt = Date.now();
    useSyncStore.getState().set({ status: "idle", serverReachable: true, lastError: null, lastSyncAt: new Date().toISOString() });
  } catch (err) {
    failures += 1;
    // Üstel bekleme: 5 sn, 10, 20 ... en çok 5 dk. Ağ hatasında sessiz, kayıtlar outbox'ta bekler.
    backoffUntil = Date.now() + Math.min(5_000 * 2 ** (failures - 1), 300_000);
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync] ${reason} başarısız:`, err);
    useSyncStore.getState().set({ status: "error", serverReachable: !isNetworkError(err), lastError: message });
  } finally {
    await refreshCounts();
    running = false;
    if (queued) {
      queued = false;
      void syncNow("queued");
    }
  }
}

function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /network|fetch|failed to fetch|timeout|ECONN|Load failed/i.test(msg);
}

/** Aynı cihazda başka çiftliğe girildiyse yerel veriyi sıfırla. */
async function ensureLocalFarm() {
  const user = useAuthStore.getState().user;
  if (!user) return;
  const db = getDb();
  const [row] = await db.select().from(meta).where(eq(meta.key, "farmId")).limit(1);
  if (row?.value === user.farmId) return;
  await withLocalTransaction(async (tx) => {
    for (const t of Object.values(localTables)) await tx.delete(t);
    await tx.delete(outbox);
    await tx.delete(syncCursors);
    await tx.insert(meta).values({ key: "farmId", value: user.farmId }).onConflictDoUpdate({ target: meta.key, set: { value: user.farmId } });
  });
  notifyLocalChange(syncedTables);
}

async function pushOutbox() {
  const api = getApiClient();
  const db = getDb();
  for (;;) {
    const rows = await db
      .select()
      .from(outbox)
      .where(eq(outbox.status, "pending"))
      .orderBy(asc(outbox.clientCreatedAt))
      .limit(PUSH_BATCH);
    if (rows.length === 0) return;

    const mutations: MutationEnvelope[] = rows.map((r) => ({
      mutationId: r.mutationId,
      table: r.table as SyncedTable,
      op: r.op as MutationEnvelope["op"],
      rowId: r.rowId,
      payload: r.payload as Record<string, unknown>,
      clientCreatedAt: r.clientCreatedAt,
    }));

    const { results } = await api.sync.push.mutate({ mutations });

    await withLocalTransaction(async (tx) => {
      const done = results.filter((r) => r.status !== "rejected").map((r) => r.mutationId);
      if (done.length) await tx.delete(outbox).where(inArray(outbox.mutationId, done));
      for (const r of results) {
        if (r.status === "rejected") {
          await tx
            .update(outbox)
            .set({ status: "failed", rejectionCode: r.code, lastError: r.message, attempts: sql`${outbox.attempts} + 1` })
            .where(eq(outbox.mutationId, r.mutationId));
        }
      }
    });

    if (rows.length < PUSH_BATCH) return;
  }
}

async function pullAll() {
  const api = getApiClient();
  const db = getDb();
  for (let round = 0; round < 50; round++) {
    const cursorRows = await db.select().from(syncCursors);
    const cursors = Object.fromEntries(cursorRows.map((c) => [c.table, c.cursor]));
    const res = await api.sync.pull.query({ cursors, limit: PULL_LIMIT });

    const changed: SyncedTable[] = [];
    await withLocalTransaction(async (tx) => {
      for (const table of syncedTables) {
        // Sunucu bu tabloyu tanımıyorsa (deploy sırasında eski API) veya rol görmüyorsa alan boş gelir.
        const rows = (res.tables[table] ?? []) as Record<string, unknown>[];
        if (rows.length === 0) continue;
        changed.push(table);
        const local = localTables[table] as any;
        for (const row of rows) {
          const values = toLocalRow(row);
          await tx.insert(local).values(values).onConflictDoUpdate({ target: local.id, set: values });
        }
      }
      // Silinme akışı: satır artık bu çiftlikte değil (transfer). Soft delete'ten farkı,
      // satırın sunucudaki pull sorgusuna bir daha hiç girmemesi; yerel kopya burada silinir.
      for (const removal of res.removals ?? []) {
        const local = localTables[removal.tableName] as any;
        if (!local) continue;
        await tx.delete(local).where(eq(local.id, removal.rowId));
        if (!changed.includes(removal.tableName)) changed.push(removal.tableName);
      }
      const cursorKeys: (SyncedTable | typeof REMOVALS_CURSOR)[] = [...syncedTables, REMOVALS_CURSOR];
      for (const table of cursorKeys) {
        const cursor = res.cursors[table];
        if (cursor == null) continue;
        await tx
          .insert(syncCursors)
          .values({ table, cursor })
          .onConflictDoUpdate({ target: syncCursors.table, set: { cursor } });
      }
    });
    if (changed.length) notifyLocalChange(changed);
    if (!res.hasMore) return;
  }
}

/** Postgres timestamptz metni: "2026-09-21 09:00:00+00". Saat dilimi eki iki haneli olabilir. */
const PG_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:\d{2})?|Z)?$/;

/**
 * Sunucu satırı → yerel satır: Date alanları ve Postgres timestamptz metinleri ISO'ya çevrilir.
 * Aynı sütunda iki biçim bulunursa metin karşılaştırması şaşar (' ' < 'T'), tarih filtreleri sessizce
 * satır kaçırırdı; 0007_fix_pg_timestamps eski satırları onarır.
 */
function toLocalRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (typeof v === "string" && PG_TIMESTAMP.test(v)) {
      const iso = new Date(v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
      out[k] = Number.isNaN(iso.getTime()) ? v : iso.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}


/**
 * Yükleme kuyruğu: künye push edildikten sonra baytlar sunucuya gider.
 * 404 gelirse künye henüz sunucuda yoktur, bir sonraki turda yeniden denenir.
 */
async function processUploads() {
  const db = getDb();
  const rows = await db.select().from(uploadQueue).where(eq(uploadQueue.status, "pending")).limit(5);
  if (rows.length === 0) return;
  const token = useAuthStore.getState().accessToken;
  if (!token) return;

  for (const row of rows) {
    try {
      const blob = base64ToBlob(row.data, row.mime);
      const res = await fetch(`${getApiUrl()}/uploads/${row.attachmentId}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": row.mime },
        body: blob,
      });
      if (res.status === 404) {
        // Künye henüz push edilmemiş; sıradaki turda tekrar dene.
        await db.update(uploadQueue).set({ attempts: row.attempts + 1, lastError: "Künye sunucuda bekleniyor" }).where(eq(uploadQueue.attachmentId, row.attachmentId));
        continue;
      }
      if (!res.ok) throw new Error(`Yükleme reddedildi (${res.status})`);
      const result = (await res.json()) as { storagePath: string };
      await withLocalTransaction(async (tx) => {
        await tx.update(attachments).set({ storagePath: result.storagePath }).where(eq(attachments.id, row.attachmentId));
        await tx.delete(uploadQueue).where(eq(uploadQueue.attachmentId, row.attachmentId));
      });
      notifyLocalChange(["attachments"]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.update(uploadQueue).set({ attempts: row.attempts + 1, lastError: message }).where(eq(uploadQueue.attachmentId, row.attachmentId));
      // Ağ hatası tüm turu durdurmasın; bir sonraki senkronda devam eder.
      if (row.attempts >= 5) await db.update(uploadQueue).set({ status: "failed" }).where(eq(uploadQueue.attachmentId, row.attachmentId));
      break;
    }
  }
}

export async function refreshCounts() {
  const db = getDb();
  const [p] = await db.select({ n: count() }).from(outbox).where(eq(outbox.status, "pending"));
  const [f] = await db.select({ n: count() }).from(outbox).where(eq(outbox.status, "failed"));
  useSyncStore.getState().set({ pending: p?.n ?? 0, failed: f?.n ?? 0 });
}

/** Reddedilen kaydı yeniden kuyruğa al (kullanıcı düzelttikten sonra) veya sil. */
export async function retryFailed(mutationId: string) {
  await getDb().update(outbox).set({ status: "pending", lastError: null, rejectionCode: null }).where(eq(outbox.mutationId, mutationId));
  await refreshCounts();
  scheduleSync("retry", 0);
}

export async function discardFailed(mutationId: string) {
  await getDb().delete(outbox).where(eq(outbox.mutationId, mutationId));
  await refreshCounts();
}
