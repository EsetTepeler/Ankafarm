import { labels, protocolInputSchema, protocolItemInputSchema, protocolItemPatchSchema, protocolPatchSchema, sampleProtocolItems, type HealthType, type ProtocolTrigger, type Species } from "@anka/shared";
import { useQuery } from "@tanstack/react-query";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { animals, healthProtocols, healthRecords, protocolItems, type LocalProtocolItem } from "@/db/schema";
import { newId } from "@/lib/ids";
import { localKey } from "@/sync/events";
import { insertLocal, insertManyLocal, softDeleteLocal, updateLocal } from "@/sync/local";
import { todayIso } from "@/utils/date";

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function useProtocols() {
  return useQuery({
    queryKey: localKey("health_protocols"),
    queryFn: async () => {
      const db = getDb();
      const [protocols, items] = await Promise.all([
        db.select().from(healthProtocols).where(isNull(healthProtocols.deletedAt)).orderBy(asc(healthProtocols.name)),
        db.select().from(protocolItems).where(isNull(protocolItems.deletedAt)).orderBy(asc(protocolItems.value)),
      ]);
      return protocols.map((p) => ({ ...p, items: items.filter((i) => i.protocolId === p.id) }));
    },
  });
}

export async function createProtocol(input: { name: string; species: Species; notes?: string | null }) {
  const parsed = protocolInputSchema.omit({ id: true }).parse(input);
  return insertLocal("health_protocols", { name: parsed.name, species: parsed.species, active: parsed.active, notes: parsed.notes ?? null });
}

export async function updateProtocol(id: string, patch: { name?: string; species?: Species; active?: boolean; notes?: string | null }) {
  return updateLocal("health_protocols", id, protocolPatchSchema.parse(patch));
}

export async function deleteProtocol(id: string) {
  const items = await getDb().select({ id: protocolItems.id }).from(protocolItems).where(and(isNull(protocolItems.deletedAt), eq(protocolItems.protocolId, id)));
  for (const item of items) await softDeleteLocal("protocol_items", item.id);
  return softDeleteLocal("health_protocols", id);
}

export async function addProtocolItem(input: { protocolId: string; type: HealthType; productName?: string | null; trigger: ProtocolTrigger; value: number; notes?: string | null }) {
  const parsed = protocolItemInputSchema.parse({ id: newId(), ...input });
  return insertLocal("protocol_items", {
    protocolId: parsed.protocolId,
    type: parsed.type,
    productName: parsed.productName ?? null,
    trigger: parsed.trigger,
    value: parsed.value,
    repeat: parsed.repeat,
    notes: parsed.notes ?? null,
  });
}

export async function updateProtocolItem(id: string, patch: { type?: HealthType; productName?: string | null; trigger?: ProtocolTrigger; value?: number; repeat?: boolean }) {
  return updateLocal("protocol_items", id, protocolItemPatchSchema.parse(patch));
}

export async function deleteProtocolItem(id: string) {
  return softDeleteLocal("protocol_items", id);
}

/** Hazır program: yaygın aşı ve bakım takvimi tek dokunuşla kurulur, sonra düzenlenir. */
export async function createSampleProtocol(species: Species = "sheep"): Promise<string> {
  const protocolId = await insertLocal("health_protocols", { name: `${labels.species[species]} yıllık program`, species, active: true, notes: "Örnek program; kendi takvimine göre düzenle" });
  await insertManyLocal(
    "protocol_items",
    sampleProtocolItems.map((i) => ({ protocolId, type: i.type, productName: i.productName, trigger: i.trigger, value: i.value, repeat: true, notes: i.notes })),
  );
  return protocolId;
}

export interface ProtocolTask {
  key: string;
  /** Aynı madde ve aynı gün için tek satır; sürüye toplu yapılan aşı 80 satıra bölünmesin. */
  animalIds: string[];
  /** Tek hayvanlık işte profil bağlantısı için. */
  animalId: string | null;
  title: string;
  dueAt: string;
  note: string;
}

/** Bir program maddesinin bir hayvan için ne zaman geleceği; son uygulamaya ve tetikleyiciye bakar. */
function nextDue(item: LocalProtocolItem, animal: { birthDate: string | null; acquiredAt: string | null }, lastApplied: string | null, today: string): string | null {
  if (item.trigger === "age_days") {
    if (!animal.birthDate) return null;
    // Yaşa bağlı madde bir kez uygulanır; kayıt varsa iş biter.
    return lastApplied ? null : addDays(animal.birthDate, item.value);
  }
  if (item.trigger === "interval_days") {
    const base = lastApplied ?? animal.acquiredAt ?? animal.birthDate;
    if (!base) return today;
    const due = addDays(base.slice(0, 10), item.value);
    if (!item.repeat && lastApplied) return null;
    return due;
  }
  // fixed_month: her yıl belirtilen ayın başı; bu yılki tarih geçtiyse ve uygulandıysa gelecek yıl.
  const year = Number(today.slice(0, 4));
  const thisYear = `${year}-${String(item.value).padStart(2, "0")}-01`;
  if (lastApplied && lastApplied.slice(0, 10) >= thisYear) return `${year + 1}-${String(item.value).padStart(2, "0")}-01`;
  return thisYear;
}

/**
 * Programdan türeyen işler (madde 3.2): her aktif hayvan için her madde ayrı bir hatırlatıcı olur.
 * Kayıt üretmez; sağlık kaydı girilince iş kendiliğinden ileri kayar.
 */
export function useProtocolTasks(horizonDays = 60) {
  return useQuery({
    queryKey: localKey("protocol_items", "tasks", horizonDays),
    queryFn: async (): Promise<ProtocolTask[]> => {
      const db = getDb();
      const today = todayIso();
      const horizon = addDays(today, horizonDays);
      const [protocols, items, herd, records] = await Promise.all([
        db.select().from(healthProtocols).where(and(isNull(healthProtocols.deletedAt), eq(healthProtocols.active, true))),
        db.select().from(protocolItems).where(isNull(protocolItems.deletedAt)),
        db
          .select({ id: animals.id, tagNo: animals.tagNo, species: animals.species, birthDate: animals.birthDate, acquiredAt: animals.acquiredAt })
          .from(animals)
          .where(and(isNull(animals.deletedAt), eq(animals.status, "active"))),
        // Sadece son uygulamalar: tüm sağlık kayıtlarını çekmek binlerce satırda arayüzü dondurdu.
        db
          .select({ animalId: healthRecords.animalId, type: healthRecords.type, productName: healthRecords.productName, appliedAt: sql<string>`max(${healthRecords.appliedAt})` })
          .from(healthRecords)
          .where(isNull(healthRecords.deletedAt))
          .groupBy(healthRecords.animalId, healthRecords.type, healthRecords.productName),
      ]);

      // Son uygulama indeksi: kayıtlar tarih sırasında olduğu için son yazan kazanır.
      // Tek geçiş şart; hayvan başına tüm kayıtları taramak birkaç bin kayıtta arayüzü dondurdu.
      const byAnimalType = new Map<string, string>();
      const byAnimalTypeProduct = new Map<string, string>();
      for (const r of records) {
        const typeKey = `${r.animalId}|${r.type}`;
        const prev = byAnimalType.get(typeKey);
        if (!prev || r.appliedAt > prev) byAnimalType.set(typeKey, r.appliedAt);
        byAnimalTypeProduct.set(`${typeKey}|${r.productName?.toLocaleLowerCase("tr") ?? ""}`, r.appliedAt);
      }

      /** Aynı tür ve ürün adına sahip son kayıt; ürün boşsa sadece tür eşleşir. */
      const lastApplied = (animalId: string, item: LocalProtocolItem): string | null => {
        const product = item.productName?.toLocaleLowerCase("tr") ?? null;
        const key = product ? `${animalId}|${item.type}|${product}` : `${animalId}|${item.type}`;
        return (product ? byAnimalTypeProduct.get(key) : byAnimalType.get(key)) ?? null;
      };

      // (madde, tarih) ikilisine göre topla: "Çiçek · 23 hayvan · 01.03.2026".
      const grouped = new Map<string, { item: LocalProtocolItem; protocolName: string; dueAt: string; animals: { id: string; tagNo: string }[] }>();
      const herdBySpecies = new Map<string, typeof herd>();
      for (const a of herd) herdBySpecies.set(a.species, [...(herdBySpecies.get(a.species) ?? []), a]);

      for (const protocol of protocols) {
        for (const item of items.filter((i) => i.protocolId === protocol.id)) {
          for (const animal of herdBySpecies.get(protocol.species) ?? []) {
            const due = nextDue(item, animal, lastApplied(animal.id, item), today);
            if (!due || due > horizon) continue;
            const key = `${item.id}:${due}`;
            const entry = grouped.get(key) ?? { item, protocolName: protocol.name, dueAt: due, animals: [] };
            entry.animals.push({ id: animal.id, tagNo: animal.tagNo });
            grouped.set(key, entry);
          }
        }
      }

      return [...grouped.entries()]
        .map(([key, g]) => {
          const name = g.item.productName ?? labels.healthType[g.item.type as HealthType];
          const single = g.animals.length === 1 ? g.animals[0]! : null;
          return {
            key: `protocol:${key}`,
            animalIds: g.animals.map((a) => a.id),
            animalId: single?.id ?? null,
            title: single ? `${single.tagNo} · ${name}` : `${name} · ${g.animals.length} hayvan`,
            dueAt: g.dueAt,
            note: `${g.protocolName} · ${labels.protocolTrigger[g.item.trigger as ProtocolTrigger]}`,
          };
        })
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    },
  });
}
