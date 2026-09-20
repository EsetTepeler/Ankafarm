import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";

import bundledMigrations from "./migrations/migrations";
import * as schema from "./schema";

/**
 * Tarayıcıdaki yerel veritabanı: SQLite (wasm) bir Web Worker'da, dosya OPFS'te.
 * Ekranlar buradan okur, formlar buraya yazar (bölüm 3.3). Drizzle sqlite-proxy sürücüsü
 * her sorguyu worker'a iletir; sonuçlar ham satır dizileri olarak döner.
 */
export type LocalDb = SqliteRemoteDatabase<typeof schema>;

interface BundledMigrations {
  journal: { entries: { idx: number; when: number; tag: string }[] };
  migrations: Record<string, string>;
}

type Method = "run" | "all" | "values" | "get";
type Pending = { resolve: (rows: unknown[]) => void; reject: (err: Error) => void };

class SqliteBridge {
  private worker: Worker;
  private pending = new Map<number, Pending>();
  private seq = 0;
  readonly ready: Promise<{ persistent: boolean }>;

  constructor() {
    this.worker = new Worker(new URL("./sqlite.worker.ts", import.meta.url), { type: "module" });
    this.ready = new Promise((resolve, reject) => {
      const onReady = (ev: MessageEvent) => {
        if (ev.data?.type !== "ready") return;
        this.worker.removeEventListener("message", onReady);
        if (ev.data.error) reject(new Error(ev.data.error));
        else resolve({ persistent: !!ev.data.persistent });
      };
      this.worker.addEventListener("message", onReady);
    });
    this.worker.addEventListener("message", (ev: MessageEvent) => {
      const { id, rows, error } = ev.data ?? {};
      if (typeof id !== "number") return;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(rows);
    });
  }

  query(sql: string, bind: unknown[], method: Method): Promise<unknown[]> {
    return this.send({ op: "query", sql, bind, method });
  }

  exec(sql: string): Promise<void> {
    return this.send({ op: "exec", sql }).then(() => undefined);
  }

  private send(body: Record<string, unknown>): Promise<unknown[]> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...body });
    });
  }
}

let bridge: SqliteBridge | null = null;
let database: LocalDb | null = null;
let opening: Promise<LocalDb> | null = null;
let persistentStorage = false;

/** OPFS kullanılabildi mi; değilse veri sekme kapanınca gider ve kullanıcı uyarılır. */
export function isStoragePersistent(): boolean {
  return persistentStorage;
}

export function openLocalDb(): Promise<LocalDb> {
  if (database) return Promise.resolve(database);
  if (opening) return opening;
  opening = (async () => {
    const b = new SqliteBridge();
    const { persistent } = await b.ready;
    persistentStorage = persistent;
    if (persistent) void navigator.storage?.persist?.().catch(() => {});
    const run = async (sql: string, params: unknown[], method: Method) => ({ rows: await b.query(sql, params, method) });
    const db = drizzle(
      run,
      async (batch) => {
        const out = [];
        for (const q of batch) out.push(await run(q.sql, q.params, q.method));
        return out;
      },
      { schema, casing: "snake_case" },
    );
    await runMigrations(b, bundledMigrations as BundledMigrations);
    bridge = b;
    database = db;
    if (import.meta.env.DEV) {
      // Geliştirme: konsoldan ham sorgu. window.__ankaDb.query("select count(*) from animals")
      (window as unknown as { __ankaDb: unknown }).__ankaDb = { query: (sql: string, bind: unknown[] = []) => b.query(sql, bind, "all") };
    }
    return db;
  })();
  return opening;
}

export function getDb(): LocalDb {
  if (!database) throw new Error("Yerel veritabanı henüz açılmadı");
  return database;
}

// Tek bağlantı: işlemler sırayla çalışır, iç içe işlem yok.
let txChain: Promise<unknown> = Promise.resolve();

/** Yerel yazma + outbox gibi birlikte olması gereken işler tek SQLite işleminde. */
export function withLocalTransaction<T>(fn: (db: LocalDb) => Promise<T>): Promise<T> {
  if (!bridge || !database) throw new Error("Yerel veritabanı henüz açılmadı");
  const b = bridge;
  const db = database;
  const run = async (): Promise<T> => {
    await b.exec("BEGIN");
    try {
      const out = await fn(db);
      await b.exec("COMMIT");
      return out;
    } catch (err) {
      await b.exec("ROLLBACK").catch(() => {});
      throw err;
    }
  };
  const next = txChain.then(run, run);
  txChain = next.catch(() => {});
  return next;
}

/** Bundle'a gömülü journal + SQL dosyaları; uygulananlar __drizzle_migrations tablosunda. */
async function runMigrations(b: SqliteBridge, bundle: BundledMigrations) {
  await b.exec("CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)");
  const last = (await b.query("SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1", [], "get")) as unknown[];
  const lastAt = Number(last[0] ?? 0);
  for (const entry of bundle.journal.entries) {
    if (entry.when <= lastAt) continue;
    const sql = bundle.migrations[`m${String(entry.idx).padStart(4, "0")}`];
    if (!sql) throw new Error(`Migration bulunamadı: ${entry.tag}`);
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await b.exec("BEGIN");
    try {
      for (const statement of statements) await b.exec(statement);
      await b.query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [entry.tag, entry.when], "run");
      await b.exec("COMMIT");
    } catch (err) {
      await b.exec("ROLLBACK").catch(() => {});
      throw err;
    }
  }
}

export { schema };
