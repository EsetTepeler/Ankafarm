import { labels, type AnimalStatus, type BirthDifficulty, type BirthType, type ExitType, type ExpenseCategory, type GroupKind, type HealthType, type IncomeCategory, type ObservationCategory, type Origin, type Severity, type Sex, type Species, type StockCategory, type StockUnit } from "@anka/shared";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { getDb } from "@/db";
import { animals, breedingRecords, breeds, consumptions, exitRecords, expenses, groupMovements, groups, healthRecords, incomes, lambingRecords, observations, purchases, stockItems, weightRecords } from "@/db/schema";
import { isoToDisplay } from "@/utils/date";

type Cell = string | number | boolean | null | undefined;
type Row = Record<string, Cell>;

/**
 * Excel için CSV: noktalı virgül ayraç ve UTF-8 BOM. Türkçe Excel varsayılanı budur;
 * virgüllü dosyada tüm satır tek hücreye düşer, ondalık ayracı da virgül olduğu için karışır.
 */
export function toCsv(rows: Row[], headers: string[]): string {
  const escape = (v: Cell): string => {
    if (v == null) return "";
    const s = typeof v === "boolean" ? (v ? "evet" : "hayır") : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const keys = rows.length ? Object.keys(rows[0]!) : headers;
  const lines = [headers.join(";"), ...rows.map((r) => keys.map((k) => escape(r[k])).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

const date = (v: string | null) => (v ? isoToDisplay(v.slice(0, 10)) : "");
const decimal = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));

export interface ExportTable {
  /** Dosya adı (uzantısız) ve ekrandaki etiket. */
  key: string;
  label: string;
  load: () => Promise<{ headers: string[]; rows: Row[] }>;
}

/**
 * Dışa aktarılan tablolar. Kimlikler yerine okunur değerler yazılır (küpe no, ırk adı, kalem adı);
 * amaç Excel'de doğrudan çalışabilmek, yedeği geri yüklemek değil (tam yedek sunucuda, madde 4.2).
 */
export function exportTables(): ExportTable[] {
  const db = () => getDb();
  const mother = alias(animals, "mother");
  const father = alias(animals, "father");

  return [
    {
      key: "hayvanlar",
      label: "Hayvanlar",
      load: async () => {
        const rows = await db()
          .select({ a: animals, breedName: breeds.name, groupName: groups.name, motherTag: mother.tagNo, fatherTag: father.tagNo })
          .from(animals)
          .leftJoin(breeds, eq(breeds.id, animals.breedId))
          .leftJoin(groups, eq(groups.id, animals.groupId))
          .leftJoin(mother, eq(mother.id, animals.motherId))
          .leftJoin(father, eq(father.id, animals.fatherId))
          .where(isNull(animals.deletedAt))
          .orderBy(asc(animals.tagNo));
        return {
          headers: ["Küpe no", "İsim", "Tür", "Cinsiyet", "Irk", "Grup", "Doğum tarihi", "Doğum tipi", "Anne", "Baba", "Köken", "Alınma tarihi", "Satıcı", "Alış fiyatı", "Durum", "Son kilo", "Gebe", "Beklenen doğum", "Not"],
          rows: rows.map(({ a, breedName, groupName, motherTag, fatherTag }) => ({
            tagNo: a.tagNo,
            name: a.name,
            species: labels.species[a.species as Species] ?? a.species,
            sex: labels.sex[a.sex as Sex] ?? a.sex,
            breed: breedName,
            group: groupName,
            birthDate: date(a.birthDate),
            birthType: a.birthType ? (labels.birthType[a.birthType as BirthType] ?? a.birthType) : "",
            mother: motherTag,
            father: fatherTag,
            origin: labels.origin[a.origin as Origin] ?? a.origin,
            acquiredAt: date(a.acquiredAt),
            source: a.source,
            purchasePrice: decimal(a.purchasePrice),
            status: labels.animalStatus[a.status as AnimalStatus] ?? a.status,
            currentWeight: decimal(a.currentWeight),
            pregnant: a.isPregnant,
            expectedBirthAt: date(a.expectedBirthAt),
            notes: a.notes,
          })),
        };
      },
    },
    {
      key: "tartimlar",
      label: "Tartımlar",
      load: async () => {
        const rows = await db()
          .select({ tagNo: animals.tagNo, name: animals.name, w: weightRecords })
          .from(weightRecords)
          .innerJoin(animals, eq(animals.id, weightRecords.animalId))
          .where(isNull(weightRecords.deletedAt))
          .orderBy(desc(weightRecords.weighedAt));
        return {
          headers: ["Tarih", "Küpe no", "İsim", "Kilo", "Not"],
          rows: rows.map(({ tagNo, name, w }) => ({ date: date(w.weighedAt), tagNo, name, kg: decimal(w.weightKg), note: w.note })),
        };
      },
    },
    {
      key: "saglik",
      label: "Sağlık kayıtları",
      load: async () => {
        const rows = await db()
          .select({ tagNo: animals.tagNo, h: healthRecords })
          .from(healthRecords)
          .innerJoin(animals, eq(animals.id, healthRecords.animalId))
          .where(isNull(healthRecords.deletedAt))
          .orderBy(desc(healthRecords.appliedAt));
        return {
          headers: ["Tarih", "Küpe no", "Tür", "Ürün", "Doz", "Veteriner", "Sonraki doz", "Arınma bitişi", "Maliyet", "Toplu", "Not"],
          rows: rows.map(({ tagNo, h }) => ({
            date: date(h.appliedAt),
            tagNo,
            type: labels.healthType[h.type as HealthType] ?? h.type,
            product: h.productName,
            dose: [decimal(h.dose), h.doseUnit].filter(Boolean).join(" "),
            vet: h.vetName,
            nextDueAt: date(h.nextDueAt),
            withdrawalUntil: date(h.withdrawalUntil),
            cost: decimal(h.cost),
            batch: h.batchId ? "evet" : "hayır",
            notes: h.notes,
          })),
        };
      },
    },
    {
      key: "ciftlesme",
      label: "Çiftleşmeler",
      load: async () => {
        const rows = await db()
          .select({ b: breedingRecords, femaleTag: mother.tagNo, maleTag: father.tagNo })
          .from(breedingRecords)
          .innerJoin(mother, eq(mother.id, breedingRecords.femaleId))
          .leftJoin(father, eq(father.id, breedingRecords.maleId))
          .where(isNull(breedingRecords.deletedAt))
          .orderBy(desc(breedingRecords.matedAt));
        return {
          headers: ["Tarih", "Dişi", "Erkek", "Yöntem", "Beklenen doğum", "Kontrol tarihi", "Sonuç", "Not"],
          rows: rows.map(({ b, femaleTag, maleTag }) => ({
            date: date(b.matedAt),
            female: femaleTag,
            male: maleTag,
            method: labels.breedingMethod[b.method as keyof typeof labels.breedingMethod] ?? b.method,
            expected: date(b.expectedBirthAt),
            checked: date(b.pregnancyCheckedAt),
            result: labels.pregnancyResult[b.pregnancyResult as keyof typeof labels.pregnancyResult] ?? b.pregnancyResult,
            notes: b.notes,
          })),
        };
      },
    },
    {
      key: "dogumlar",
      label: "Doğumlar",
      load: async () => {
        const rows = await db()
          .select({ l: lambingRecords, motherTag: mother.tagNo, fatherTag: father.tagNo })
          .from(lambingRecords)
          .innerJoin(mother, eq(mother.id, lambingRecords.motherId))
          .leftJoin(father, eq(father.id, lambingRecords.fatherId))
          .where(isNull(lambingRecords.deletedAt))
          .orderBy(desc(lambingRecords.bornAt));
        return {
          headers: ["Tarih", "Anne", "Baba", "Zorluk", "Canlı", "Ölü doğum", "Not"],
          rows: rows.map(({ l, motherTag, fatherTag }) => ({
            date: date(l.bornAt),
            mother: motherTag,
            father: fatherTag,
            difficulty: labels.birthDifficulty[l.difficulty as BirthDifficulty] ?? l.difficulty,
            live: l.liveCount,
            stillborn: l.stillbornCount,
            notes: l.notes,
          })),
        };
      },
    },
    {
      key: "cikislar",
      label: "Sürüden çıkışlar",
      load: async () => {
        const rows = await db()
          .select({ tagNo: animals.tagNo, e: exitRecords })
          .from(exitRecords)
          .innerJoin(animals, eq(animals.id, exitRecords.animalId))
          .where(isNull(exitRecords.deletedAt))
          .orderBy(desc(exitRecords.exitedAt));
        return {
          headers: ["Tarih", "Küpe no", "Neden", "Açıklama", "Fiyat", "Alıcı", "Not"],
          rows: rows.map(({ tagNo, e }) => ({
            date: date(e.exitedAt),
            tagNo,
            type: labels.exitType[e.type as ExitType] ?? e.type,
            reason: e.reason,
            price: decimal(e.price),
            buyer: e.buyer,
            notes: e.notes,
          })),
        };
      },
    },
    {
      key: "gozlemler",
      label: "Gözlemler",
      load: async () => {
        const rows = await db()
          .select({ tagNo: animals.tagNo, o: observations })
          .from(observations)
          .leftJoin(animals, eq(animals.id, observations.animalId))
          .where(isNull(observations.deletedAt))
          .orderBy(desc(observations.observedAt));
        return {
          headers: ["Tarih", "Küpe no", "Kategori", "Şiddet", "Etiketler", "Not"],
          rows: rows.map(({ tagNo, o }) => ({
            date: date(o.observedAt),
            tagNo: tagNo ?? "sürü geneli",
            category: labels.observationCategory[o.category as ObservationCategory] ?? o.category,
            severity: labels.severity[o.severity as Severity] ?? o.severity,
            tags: (o.tags as string[]).join(", "),
            note: o.note,
          })),
        };
      },
    },
    {
      key: "grup-hareketleri",
      label: "Grup hareketleri",
      load: async () => {
        const fromGroup = alias(groups, "from_group");
        const toGroup = alias(groups, "to_group");
        const rows = await db()
          .select({ tagNo: animals.tagNo, m: groupMovements, fromName: fromGroup.name, toName: toGroup.name })
          .from(groupMovements)
          .innerJoin(animals, eq(animals.id, groupMovements.animalId))
          .leftJoin(fromGroup, eq(fromGroup.id, groupMovements.fromGroupId))
          .leftJoin(toGroup, eq(toGroup.id, groupMovements.toGroupId))
          .where(isNull(groupMovements.deletedAt))
          .orderBy(desc(groupMovements.movedAt));
        return {
          headers: ["Tarih", "Küpe no", "Eski grup", "Yeni grup", "Neden"],
          rows: rows.map(({ tagNo, m, fromName, toName }) => ({ date: date(m.movedAt), tagNo, from: fromName, to: toName, reason: m.reason })),
        };
      },
    },
    {
      key: "stok-kalemleri",
      label: "Stok kalemleri",
      load: async () => {
        const rows = await db().select().from(stockItems).where(isNull(stockItems.deletedAt)).orderBy(asc(stockItems.name));
        return {
          headers: ["Kalem", "Kategori", "Birim", "Alt sınır", "Bakiye tutuluyor", "Aktif", "Not"],
          rows: rows.map((i) => ({
            name: i.name,
            category: labels.stockCategory[i.category as StockCategory] ?? i.category,
            unit: labels.stockUnit[i.unit as StockUnit] ?? i.unit,
            minStock: decimal(i.minStock),
            trackStock: i.trackStock,
            active: i.active,
            notes: i.notes,
          })),
        };
      },
    },
    {
      key: "alimlar",
      label: "Alımlar",
      load: async () => {
        const rows = await db()
          .select({ p: purchases, itemName: stockItems.name, unit: stockItems.unit })
          .from(purchases)
          .innerJoin(stockItems, eq(stockItems.id, purchases.itemId))
          .where(isNull(purchases.deletedAt))
          .orderBy(desc(purchases.purchasedAt));
        return {
          headers: ["Tarih", "Kalem", "Miktar", "Birim", "Birim fiyat", "Toplam", "Satıcı", "Not"],
          rows: rows.map(({ p, itemName, unit }) => ({
            date: date(p.purchasedAt),
            item: itemName,
            quantity: decimal(p.quantity),
            unit: labels.stockUnit[unit as StockUnit] ?? unit,
            unitPrice: decimal(p.unitPrice),
            total: decimal(p.total),
            supplier: p.supplier,
            notes: p.notes,
          })),
        };
      },
    },
    {
      key: "tuketim",
      label: "Tüketim",
      load: async () => {
        const rows = await db()
          .select({ c: consumptions, itemName: stockItems.name, unit: stockItems.unit, groupName: groups.name, tagNo: animals.tagNo })
          .from(consumptions)
          .innerJoin(stockItems, eq(stockItems.id, consumptions.itemId))
          .leftJoin(groups, eq(groups.id, consumptions.groupId))
          .leftJoin(animals, eq(animals.id, consumptions.animalId))
          .where(isNull(consumptions.deletedAt))
          .orderBy(desc(consumptions.consumedOn));
        return {
          headers: ["Tarih", "Kalem", "Miktar", "Birim", "Kapsam", "Not"],
          rows: rows.map(({ c, itemName, unit, groupName, tagNo }) => ({
            date: date(c.consumedOn),
            item: itemName,
            quantity: decimal(c.quantity),
            unit: labels.stockUnit[unit as StockUnit] ?? unit,
            scope: tagNo ?? groupName ?? "Tüm sürü",
            notes: c.notes,
          })),
        };
      },
    },
    {
      key: "giderler",
      label: "Giderler",
      load: async () => {
        const rows = await db()
          .select({ e: expenses, tagNo: animals.tagNo })
          .from(expenses)
          .leftJoin(animals, eq(animals.id, expenses.animalId))
          .where(isNull(expenses.deletedAt))
          .orderBy(desc(expenses.spentAt));
        return {
          headers: ["Tarih", "Kategori", "Tutar", "Açıklama", "Hayvan"],
          rows: rows.map(({ e, tagNo }) => ({
            date: date(e.spentAt),
            category: labels.expenseCategory[e.category as ExpenseCategory] ?? e.category,
            amount: decimal(e.amount),
            description: e.description,
            tagNo,
          })),
        };
      },
    },
    {
      key: "gelirler",
      label: "Gelirler",
      load: async () => {
        const rows = await db()
          .select({ i: incomes, tagNo: animals.tagNo })
          .from(incomes)
          .leftJoin(animals, eq(animals.id, incomes.animalId))
          .where(isNull(incomes.deletedAt))
          .orderBy(desc(incomes.receivedAt));
        return {
          headers: ["Tarih", "Kategori", "Tutar", "Açıklama", "Hayvan"],
          rows: rows.map(({ i, tagNo }) => ({
            date: date(i.receivedAt),
            category: labels.incomeCategory[i.category as IncomeCategory] ?? i.category,
            amount: decimal(i.amount),
            description: i.description,
            tagNo,
          })),
        };
      },
    },
    {
      key: "gruplar",
      label: "Gruplar",
      load: async () => {
        const rows = await db().select().from(groups).where(isNull(groups.deletedAt)).orderBy(asc(groups.name));
        return {
          headers: ["Ad", "Tür", "Kapasite", "Aktif"],
          rows: rows.map((g) => ({ name: g.name, kind: labels.groupKind[g.kind as GroupKind] ?? g.kind, capacity: g.capacity, active: g.active })),
        };
      },
    },
  ];
}
