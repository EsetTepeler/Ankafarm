import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { count, eq, sql } from "drizzle-orm";

import { animals, attachments, auditLog } from "../../db/schema";
import { ownerProcedure, router } from "../../trpc/init";

const startedAt = Date.now();

interface BackupInfo {
  at: string;
  ageHours: number;
  bytes: number;
  name: string;
}

/** En yeni dosyayı bulur; alt klasörler dahil (daily, weekly, monthly). */
async function newestFile(dir: string, suffix: string): Promise<BackupInfo | null> {
  let best: BackupInfo | null = null;
  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > 2) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.name.endsWith(suffix)) continue;
      const info = await stat(full).catch(() => null);
      if (!info) continue;
      if (!best || info.mtimeMs > new Date(best.at).getTime()) {
        best = { at: new Date(info.mtimeMs).toISOString(), ageHours: (Date.now() - info.mtimeMs) / 3600_000, bytes: info.size, name: entry.name };
      }
    }
  };
  await walk(dir, 0);
  return best;
}

async function dirSize(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (current: string, depth: number): Promise<void> => {
    if (depth > 3) return;
    const entries = await readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      const info = await stat(full).catch(() => null);
      if (!info) continue;
      files += 1;
      bytes += info.size;
    }
  };
  await walk(dir, 0);
  return { files, bytes };
}

/**
 * Sistem durumu (madde 4.5): yedek gerçekten alınıyor mu, dosyalar duruyor mu, veritabanı ne kadar büyük?
 * Sahip bunu Ayarlar ekranından görür; sunucuya bakmadan "yedek iki gündür alınmamış" fark edilir.
 */
export const systemRouter = router({
  status: ownerProcedure.query(async ({ ctx }) => {
    const backupsDir = process.env.BACKUPS_DIR ?? "/backups";
    const uploadsDir = ctx.env.UPLOADS_DIR;

    const [dbBackup, uploadBackup, uploads, [animalCount], [attachmentCount], [auditCount], dbSize] = await Promise.all([
      newestFile(backupsDir, ".sql.gz"),
      newestFile(path.join(backupsDir, "uploads"), ".tar.gz"),
      dirSize(path.join(uploadsDir, ctx.user.farmId)),
      ctx.db.select({ n: count() }).from(animals).where(eq(animals.farmId, ctx.user.farmId)),
      ctx.db.select({ n: count() }).from(attachments).where(eq(attachments.farmId, ctx.user.farmId)),
      ctx.db.select({ n: count() }).from(auditLog).where(eq(auditLog.farmId, ctx.user.farmId)),
      ctx.db.execute(sql`select pg_database_size(current_database()) as bytes`),
    ]);

    return {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      serverTime: new Date().toISOString(),
      database: { bytes: Number((dbSize as unknown as { rows: { bytes: string }[] }).rows[0]?.bytes ?? 0), animals: animalCount?.n ?? 0, auditRows: auditCount?.n ?? 0 },
      uploads: { files: uploads.files, bytes: uploads.bytes, records: attachmentCount?.n ?? 0 },
      backups: { database: dbBackup, uploads: uploadBackup },
    };
  }),
});
