#!/usr/bin/env node
/**
 * Migration bütünlüğü: elle yazılan SQL dosyaları (trigger, view) journal'a eklenmeyi unutunca
 * sunucuda sessizce çalışmıyordu. Burada dosya listesi ile journal karşılaştırılır.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const targets = [
  { name: "api", dir: "apps/api/drizzle" },
  { name: "web", dir: "apps/web/src/db/migrations" },
];

let failed = false;

for (const target of targets) {
  const files = (await readdir(target.dir)).filter((f) => f.endsWith(".sql")).sort();
  const journal = JSON.parse(await readFile(path.join(target.dir, "meta/_journal.json"), "utf8"));
  const tags = journal.entries.map((e) => e.tag);

  const missing = files.map((f) => f.replace(/\.sql$/, "")).filter((tag) => !tags.includes(tag));
  const orphan = tags.filter((tag) => !files.includes(`${tag}.sql`));

  const indexes = journal.entries.map((e) => e.idx);
  const outOfOrder = indexes.some((idx, i) => idx !== i);

  if (missing.length) {
    console.error(`[${target.name}] journal'a eklenmemiş migration: ${missing.join(", ")}`);
    failed = true;
  }
  if (orphan.length) {
    console.error(`[${target.name}] journal'da olup dosyası olmayan: ${orphan.join(", ")}`);
    failed = true;
  }
  if (outOfOrder) {
    console.error(`[${target.name}] journal idx sırası bozuk: ${indexes.join(", ")}`);
    failed = true;
  }
  if (!missing.length && !orphan.length && !outOfOrder) {
    console.log(`[${target.name}] ${files.length} migration, journal tutarlı`);
  }
}

process.exit(failed ? 1 : 0);
