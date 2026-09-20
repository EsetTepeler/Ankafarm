/// <reference lib="webworker" />
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";

/**
 * SQLite worker: veritabanı OPFS'te kalıcı dosya olarak durur (COOP/COEP başlıkları şart).
 * OPFS yoksa (eski tarayıcı, gizli pencere) bellek içi veritabanına düşer ve ana iş parçacığına bildirir.
 * Mesaj: { id, op: "query", sql, bind, method } → { id, rows } | { id, error }
 *        { id, op: "exec", sql } → çoklu ifade (migration)
 */
interface QueryMsg {
  id: number;
  op: "query" | "exec";
  sql: string;
  bind?: unknown[];
  method?: "run" | "all" | "values" | "get";
}

let db: Database | null = null;
let persistent = false;

async function init(sqlite3: Sqlite3Static) {
  // OPFS VFS yalnızca crossOriginIsolated bir worker'da kurulur; kurulduysa oo1.OpfsDb tanımlıdır.
  if (sqlite3.oo1.OpfsDb) {
    db = new sqlite3.oo1.OpfsDb("/anka.sqlite3");
    persistent = true;
  } else {
    db = new sqlite3.oo1.DB(":memory:", "c");
    persistent = false;
  }
  db.exec("PRAGMA foreign_keys = OFF; PRAGMA journal_mode = WAL;");
}

const ready = sqlite3InitModule()
  .then(init)
  .then(() => self.postMessage({ type: "ready", persistent }))
  .catch((err: unknown) => self.postMessage({ type: "ready", error: String(err) }));

self.onmessage = async (ev: MessageEvent<QueryMsg>) => {
  const msg = ev.data;
  await ready;
  if (!db) {
    self.postMessage({ id: msg.id, error: "Veritabanı açılamadı" });
    return;
  }
  try {
    if (msg.op === "exec") {
      db.exec(msg.sql);
      self.postMessage({ id: msg.id, rows: [] });
      return;
    }
    const bind = (msg.bind ?? []).map((v) => (v === undefined ? null : v)) as never;
    if (msg.method === "run") {
      db.exec({ sql: msg.sql, bind });
      self.postMessage({ id: msg.id, rows: [] });
      return;
    }
    const rows = db.exec({ sql: msg.sql, bind, rowMode: "array", returnValue: "resultRows" }) as unknown[][];
    self.postMessage({ id: msg.id, rows: msg.method === "get" ? (rows[0] ?? []) : rows });
  } catch (err) {
    self.postMessage({ id: msg.id, error: err instanceof Error ? err.message : String(err) });
  }
};
