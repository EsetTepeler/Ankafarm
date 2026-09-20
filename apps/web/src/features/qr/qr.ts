import { and, eq, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import { animals } from "@/db/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** QR içeriği her zaman profil web adresi (bölüm 9): bu alan adı değişse de eski etiketler kimlik taşır. */
export function animalUrl(id: string): string {
  return `${window.location.origin}/a/${id}`;
}

export type ScanTarget = { kind: "id"; id: string } | { kind: "tag"; tagNo: string };

/**
 * Okunan metni çözer: profil adresi (/a/<uuid> veya /animals/<uuid>), çıplak uuid ya da küpe numarası.
 * Alan adına bakılmaz; staging'de basılmış etiket prod'da da açılır.
 */
export function parseScan(raw: string): ScanTarget | null {
  const text = raw.trim();
  if (!text) return null;
  const m = text.match(/\/(?:a|animals)\/([0-9a-f-]{36})(?:[/?#]|$)/i);
  if (m) return { kind: "id", id: m[1]!.toLowerCase() };
  if (UUID.test(text)) return { kind: "id", id: text.toLowerCase() };
  if (/^https?:\/\//i.test(text)) return null;
  return { kind: "tag", tagNo: text.toUpperCase() };
}

/** Yerel veritabanından hayvanı bulur; çevrimdışı çalışır. */
export async function resolveScan(target: ScanTarget): Promise<{ id: string; tagNo: string } | null> {
  const db = getDb();
  const where = target.kind === "id" ? eq(animals.id, target.id) : and(eq(animals.tagNo, target.tagNo), isNull(animals.deletedAt));
  const [row] = await db.select({ id: animals.id, tagNo: animals.tagNo }).from(animals).where(where).limit(1);
  return row ?? null;
}
