import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { openDatabaseAsync, type SQLiteBindParams, type SQLiteDatabase } from "expo-sqlite";

import bundledMigrations from "./migrations/migrations";
import * as schema from "./schema";

/**
 * Cihazdaki yerel veritabanı. Ekranlar buradan okur, formlar buraya yazar (bölüm 3.3).
 *
 * Tamamen asenkron: expo-sqlite web'de senkron çağrıları bir worker'a kısa bir bekleme
 * döngüsüyle iletir ve worker meşgulse "Sync operation timeout" fırlatır. Bu yüzden
 * Drizzle'ın expo sürücüsü (senkron) yerine sqlite-proxy sürücüsü kullanılır ve her
 * sorgu expo-sqlite'ın Async API'sinden geçer. Native'de de aynı yol, tek kod.
 */
export type LocalDb = SqliteRemoteDatabase<typeof schema>;

interface BundledMigrations {
  journal: { entries: { idx: number; when: number; tag: string }[] };
  migrations: Record<string, string>;
}

let connection: SQLiteDatabase | null = null;
let database: LocalDb | null = null;
let opening: Promise<LocalDb> | null = null;

export function openLocalDb(): Promise<LocalDb> {
  if (database) return Promise.resolve(database);
  if (opening) return opening;
  opening = (async () => {
    const conn = await openDatabaseAsync("anka.db");
    await conn.execAsync("PRAGMA foreign_keys = OFF; PRAGMA journal_mode = WAL;");
    const run = async (sql: string, params: unknown[], method: "run" | "all" | "values" | "get") => {
      const bind = params as SQLiteBindParams;
      if (method === "run") {
        await conn.runAsync(sql, bind);
        return { rows: [] as unknown[] };
      }
      const stmt = await conn.prepareAsync(sql);
      try {
        const result = await stmt.executeForRawResultAsync(bind);
        const rows = await result.getAllAsync();
        return method === "get" ? { rows: rows[0] ?? [] } : { rows };
      } finally {
        await stmt.finalizeAsync();
      }
    };
    // Dikkat: sürücü `casing` ayarını yalnızca üçüncü argümandan okur; ikinci argüman batch callback olmalı.
    // Ayarlar ikinci argümana verilirse sütun adları camelCase kalır ve snake_case migration ile uyuşmaz.
    const db = drizzle(
      run,
      async (batch) => {
        const out = [];
        for (const q of batch) out.push(await run(q.sql, q.params, q.method));
        return out;
      },
      { schema, casing: "snake_case" },
    );
    await runMigrations(conn, bundledMigrations as BundledMigrations);
    connection = conn;
    database = db;
    return db;
  })();
  return opening;
}

export function getDb(): LocalDb {
  if (!database) throw new Error("Yerel veritabanı henüz açılmadı");
  return database;
}

/** Yerel yazma + outbox gibi birlikte olması gereken işler tek SQLite işleminde. */
export async function withLocalTransaction<T>(fn: (db: LocalDb) => Promise<T>): Promise<T> {
  if (!connection || !database) throw new Error("Yerel veritabanı henüz açılmadı");
  const db = database;
  let out: T | undefined;
  await connection.withTransactionAsync(async () => {
    out = await fn(db);
  });
  return out as T;
}

/**
 * Drizzle'ın expo migrator'ının asenkron eşi: bundle'a gömülü journal + SQL dosyaları.
 * Uygulanan migration'lar __drizzle_migrations tablosunda tutulur (aynı tablo adı, uyumlu).
 */
async function runMigrations(conn: SQLiteDatabase, bundle: BundledMigrations) {
  await conn.execAsync(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
  );
  const last = await conn.getFirstAsync<{ created_at: number }>(
    "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
  );
  const lastAt = Number(last?.created_at ?? 0);
  for (const entry of bundle.journal.entries) {
    if (entry.when <= lastAt) continue;
    const sql = bundle.migrations[`m${String(entry.idx).padStart(4, "0")}`];
    if (!sql) throw new Error(`Migration bulunamadı: ${entry.tag}`);
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await conn.withTransactionAsync(async () => {
      for (const statement of statements) await conn.execAsync(statement);
      await conn.runAsync("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", [entry.tag, entry.when]);
    });
  }
}

export { schema };
