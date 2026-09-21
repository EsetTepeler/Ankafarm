import { sql } from "drizzle-orm";

import type { Db } from "./client";

/**
 * İçgörü servisinin DB rolü.
 *
 * `docker/db-init` yalnızca boş bir veri dizininde çalışır; mevcut kurulumlarda rol hiç
 * oluşmaz ve servis bağlanamaz. Bu yüzden rol her açılışta buradan da güvenceye alınır:
 * her tabloda okuma, yalnızca `insights` tablosunda yazma (bölüm 4.6).
 */
export async function ensureInsightsRole(db: Db, password: string | undefined, log: (msg: string) => void): Promise<void> {
  if (!password) return;
  // DO bloğu bind parametresi kabul etmiyor; parola DDL'e gömülecek. Tırnak ve ters bölü
  // içeren parolayı hiç denemiyoruz, enjeksiyon yüzeyi açmasın.
  if (!/^[A-Za-z0-9_.\-!@#%^*+=:~]{8,128}$/.test(password)) {
    log("içgörü rolü kurulamadı: parola beklenen karakter kümesinde değil");
    return;
  }
  try {
    const [existing] = (await db.execute(sql`select 1 as found from pg_roles where rolname = 'insights'`)).rows as { found: number }[];
    if (existing) {
      await db.execute(sql.raw(`alter role insights with login password '${password}'`));
    } else {
      await db.execute(sql.raw(`create role insights login password '${password}'`));
    }
    await db.execute(sql`grant usage on schema public to insights`);
    await db.execute(sql`grant select on all tables in schema public to insights`);
    await db.execute(sql`alter default privileges in schema public grant select on tables to insights`);
    await db.execute(sql`grant insert, update on table insights to insights`);
    await db.execute(sql`grant usage, select on all sequences in schema public to insights`);
    log("içgörü rolü hazır");
  } catch (err) {
    // Rol yoksa servis çalışmaz ama uygulama çalışmaya devam etmeli; kurulumda yetki eksikse
    // sahibe log üzerinden haber verilir.
    log(`içgörü rolü kurulamadı: ${err instanceof Error ? err.message : String(err)}`);
  }
}
