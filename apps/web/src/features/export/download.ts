import { strToU8, zipSync } from "fflate";

import { exportTables, toCsv } from "@/features/export/csv";
import { todayIso } from "@/utils/date";

/** Tarayıcıya dosya indirtir. */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Bağlantıyı hemen bırakmak indirmeyi bozabiliyor; bir tur bekleyip serbest bırak.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadTableCsv(key: string): Promise<number> {
  const table = exportTables().find((t) => t.key === key);
  if (!table) throw new Error("Tablo bulunamadı");
  const { headers, rows } = await table.load();
  save(new Blob([toCsv(rows, headers)], { type: "text/csv;charset=utf-8" }), `${key}-${todayIso()}.csv`);
  return rows.length;
}

/** Bütün tablolar tek ZIP içinde; Excel'de her dosya ayrı sayfa olarak açılır. */
export async function downloadAllCsv(): Promise<{ files: number; rows: number }> {
  const tables = exportTables();
  const files: Record<string, Uint8Array> = {};
  let rowCount = 0;
  for (const table of tables) {
    const { headers, rows } = await table.load();
    rowCount += rows.length;
    files[`${table.key}.csv`] = strToU8(toCsv(rows, headers));
  }
  // level 0: sıkıştırma yok; dosyalar küçük, kurulum basit kalsın.
  const zip = zipSync(files, { level: 0 });
  save(new Blob([zip as unknown as BlobPart], { type: "application/zip" }), `anka-farm-${todayIso()}.zip`);
  return { files: tables.length, rows: rowCount };
}
