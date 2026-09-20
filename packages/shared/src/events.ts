import { labels, type BirthDifficulty, type BirthType, type BreedingMethod, type ExitType, type GroupKind, type HealthType, type ObservationCategory, type Origin, type PregnancyResult, type Severity } from "./animals";

/**
 * Zaman çizelgesi olayı. Tablolar ayrı kalır; uygulama hepsini bu tek tiple sunar (bölüm 1, "Her şey bir olay").
 * Sunucu satırları (Date) ve cihaz satırları (ISO metin) aynı eşleyicilerden geçer.
 */
export type AnimalEventType = "created" | "weight" | "group_move" | "health" | "breeding" | "lambing" | "exit" | "observation";

export interface AnimalEvent {
  /** `${sourceTable}:${sourceId}` */
  id: string;
  animalId: string;
  type: AnimalEventType;
  /** ISO 8601 */
  occurredAt: string;
  title: string;
  summary: string | null;
  /** Grafik ve ayrıntı için ham sayılar. */
  payload: Record<string, unknown>;
  sourceTable: string;
  sourceId: string;
  createdBy: string | null;
  /** Soft delete edilmiş kayıt; varsayılan görünümde gizlenir. */
  deleted: boolean;
}

type DateLike = string | Date;
const iso = (d: DateLike): string => (d instanceof Date ? d.toISOString() : d);
const dateOnlyToIso = (d: string): string => (d.length === 10 ? `${d}T12:00:00.000Z` : d);

/** Eşleyicilerin beklediği en küçük satır biçimleri; DB tiplerinden bağımsız. */
export interface AnimalRowLike {
  id: string;
  tagNo: string;
  origin: Origin | string;
  birthDate: string | null;
  birthType: BirthType | string | null;
  acquiredAt: string | null;
  source: string | null;
  purchasePrice: number | null;
  motherTagNo?: string | null;
  createdAt: DateLike;
  createdBy: string | null;
}

export interface WeightRowLike {
  id: string;
  animalId: string;
  weighedAt: DateLike;
  weightKg: number;
  note: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export interface GroupMovementRowLike {
  id: string;
  animalId: string;
  fromGroupId: string | null;
  toGroupId: string;
  movedAt: DateLike;
  reason: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export interface HealthRowLike {
  id: string;
  animalId: string;
  type: HealthType | string;
  productName: string | null;
  dose: number | null;
  doseUnit: string | null;
  appliedAt: DateLike;
  vetName: string | null;
  nextDueAt: string | null;
  withdrawalUntil: string | null;
  cost: number | null;
  batchId: string | null;
  notes: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export interface BreedingRowLike {
  id: string;
  femaleId: string;
  maleId: string | null;
  method: BreedingMethod | string;
  matedAt: string;
  expectedBirthAt: string;
  pregnancyCheckedAt: string | null;
  pregnancyResult: PregnancyResult | string;
  notes: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export interface LambingRowLike {
  id: string;
  motherId: string;
  fatherId: string | null;
  bornAt: string;
  difficulty: BirthDifficulty | string;
  liveCount: number;
  stillbornCount: number;
  notes: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export interface ExitRowLike {
  id: string;
  animalId: string;
  type: ExitType | string;
  exitedAt: string;
  reason: string | null;
  price: number | null;
  buyer: string | null;
  notes: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export interface ObservationRowLike {
  id: string;
  animalId: string | null;
  observedAt: DateLike;
  category: ObservationCategory | string;
  severity: Severity | string;
  tags: string[] | string | null;
  note: string | null;
  createdBy: string | null;
  deletedAt: DateLike | null;
}

export function parseTags(tags: string[] | string | null | undefined): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    const v = JSON.parse(tags);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export interface AnimalRef {
  id: string;
  tagNo: string;
  name?: string | null;
}

export interface GroupRef {
  id: string;
  name: string;
  kind?: GroupKind | string;
}

export function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace(".", ",")} kg`;
}

/** Hayvanın kendisinden türeyen ilk olay: doğdu veya dışarıdan alındı. */
export function createdEvent(a: AnimalRowLike): AnimalEvent {
  const born = a.origin === "born_here";
  const when = born && a.birthDate ? dateOnlyToIso(a.birthDate) : !born && a.acquiredAt ? dateOnlyToIso(a.acquiredAt) : iso(a.createdAt);
  const birthType = a.birthType ? labels.birthType[a.birthType as BirthType] : null;
  const summary = born
    ? [a.motherTagNo ? `Anne ${a.motherTagNo}` : null, birthType].filter(Boolean).join(" · ") || null
    : [a.source, a.purchasePrice != null ? `${a.purchasePrice} TL` : null].filter(Boolean).join(" · ") || null;
  return {
    id: `animals:${a.id}`,
    animalId: a.id,
    type: "created",
    occurredAt: when,
    title: born ? "Doğdu" : "Dışarıdan alındı",
    summary,
    payload: { origin: a.origin, birthDate: a.birthDate, acquiredAt: a.acquiredAt, purchasePrice: a.purchasePrice },
    sourceTable: "animals",
    sourceId: a.id,
    createdBy: a.createdBy,
    deleted: false,
  };
}

export function weightEvent(w: WeightRowLike, previous?: WeightRowLike | null): AnimalEvent {
  const diff = previous ? w.weightKg - previous.weightKg : null;
  const diffText = diff == null ? null : `${diff > 0 ? "+" : ""}${diff.toFixed(1).replace(".", ",")} kg`;
  return {
    id: `weight_records:${w.id}`,
    animalId: w.animalId,
    type: "weight",
    occurredAt: iso(w.weighedAt),
    title: `Tartım · ${formatKg(w.weightKg)}`,
    summary: [diffText ? `önceki tartıma göre ${diffText}` : null, w.note].filter(Boolean).join(" · ") || null,
    payload: { weightKg: w.weightKg, diffKg: diff },
    sourceTable: "weight_records",
    sourceId: w.id,
    createdBy: w.createdBy,
    deleted: w.deletedAt != null,
  };
}

export function groupMoveEvent(m: GroupMovementRowLike, groups: Map<string, GroupRef>): AnimalEvent {
  const from = m.fromGroupId ? (groups.get(m.fromGroupId)?.name ?? "?") : null;
  const to = groups.get(m.toGroupId)?.name ?? "?";
  return {
    id: `group_movements:${m.id}`,
    animalId: m.animalId,
    type: "group_move",
    occurredAt: iso(m.movedAt),
    title: from ? `Grup değişti · ${from} → ${to}` : `Gruba alındı · ${to}`,
    summary: m.reason,
    payload: { fromGroupId: m.fromGroupId, toGroupId: m.toGroupId },
    sourceTable: "group_movements",
    sourceId: m.id,
    createdBy: m.createdBy,
    deleted: m.deletedAt != null,
  };
}

function shortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

export function healthEvent(h: HealthRowLike): AnimalEvent {
  const typeLabel = labels.healthType[h.type as HealthType] ?? h.type;
  const dose = h.dose != null ? `${h.dose}${h.doseUnit ? ` ${h.doseUnit}` : ""}` : null;
  return {
    id: `health_records:${h.id}`,
    animalId: h.animalId,
    type: "health",
    occurredAt: iso(h.appliedAt),
    title: [typeLabel, h.productName].filter(Boolean).join(" · "),
    summary:
      [
        dose,
        h.vetName ? `Vet. ${h.vetName}` : null,
        h.nextDueAt ? `sonraki ${shortDate(h.nextDueAt)}` : null,
        h.withdrawalUntil ? `arınma bitişi ${shortDate(h.withdrawalUntil)}` : null,
        h.cost != null ? `${h.cost} TL` : null,
        h.batchId ? "toplu" : null,
        h.notes,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    payload: { type: h.type, dose: h.dose, cost: h.cost, nextDueAt: h.nextDueAt, withdrawalUntil: h.withdrawalUntil, batchId: h.batchId },
    sourceTable: "health_records",
    sourceId: h.id,
    createdBy: h.createdBy,
    deleted: h.deletedAt != null,
  };
}

const refLabel = (id: string | null, refs: Map<string, AnimalRef>) => (id ? (refs.get(id)?.tagNo ?? "?") : null);

/** Dişi için "Çiftleşme · koç X", erkek için "Çiftleşme · koyun Y". */
export function breedingEvent(b: BreedingRowLike, forAnimalId: string, refs: Map<string, AnimalRef>): AnimalEvent {
  const isFemale = b.femaleId === forAnimalId;
  const partner = isFemale ? refLabel(b.maleId, refs) : refLabel(b.femaleId, refs);
  const result = labels.pregnancyResult[b.pregnancyResult as PregnancyResult] ?? b.pregnancyResult;
  return {
    id: `breeding_records:${b.id}:${forAnimalId}`,
    animalId: forAnimalId,
    type: "breeding",
    occurredAt: dateOnlyToIso(b.matedAt),
    title: partner ? `Çiftleşme · ${isFemale ? "koç" : "koyun"} ${partner}` : "Çiftleşme",
    summary:
      [
        labels.breedingMethod[b.method as BreedingMethod] ?? b.method,
        isFemale ? `beklenen doğum ${shortDate(b.expectedBirthAt)}` : null,
        isFemale ? result : null,
        b.notes,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    payload: { femaleId: b.femaleId, maleId: b.maleId, expectedBirthAt: b.expectedBirthAt, pregnancyResult: b.pregnancyResult },
    sourceTable: "breeding_records",
    sourceId: b.id,
    createdBy: b.createdBy,
    deleted: b.deletedAt != null,
  };
}

export function lambingEvent(l: LambingRowLike, forAnimalId: string, refs: Map<string, AnimalRef>): AnimalEvent {
  const isMother = l.motherId === forAnimalId;
  const partner = isMother ? refLabel(l.fatherId, refs) : refLabel(l.motherId, refs);
  return {
    id: `lambing_records:${l.id}:${forAnimalId}`,
    animalId: forAnimalId,
    type: "lambing",
    occurredAt: dateOnlyToIso(l.bornAt),
    title: `Doğum · ${l.liveCount} canlı${l.stillbornCount ? `, ${l.stillbornCount} ölü` : ""}`,
    summary:
      [
        labels.birthDifficulty[l.difficulty as BirthDifficulty] ?? l.difficulty,
        partner ? `${isMother ? "koç" : "anne"} ${partner}` : null,
        l.notes,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    payload: { liveCount: l.liveCount, stillbornCount: l.stillbornCount, difficulty: l.difficulty },
    sourceTable: "lambing_records",
    sourceId: l.id,
    createdBy: l.createdBy,
    deleted: l.deletedAt != null,
  };
}

export function exitEvent(e: ExitRowLike): AnimalEvent {
  return {
    id: `exit_records:${e.id}`,
    animalId: e.animalId,
    type: "exit",
    occurredAt: dateOnlyToIso(e.exitedAt),
    title: labels.exitType[e.type as ExitType] ?? e.type,
    summary: [e.reason, e.buyer, e.price != null ? `${e.price} TL` : null, e.notes].filter(Boolean).join(" · ") || null,
    payload: { type: e.type, price: e.price },
    sourceTable: "exit_records",
    sourceId: e.id,
    createdBy: e.createdBy,
    deleted: e.deletedAt != null,
  };
}

export function observationEvent(o: ObservationRowLike, forAnimalId: string): AnimalEvent {
  const tags = parseTags(o.tags);
  const sev = labels.severity[o.severity as Severity] ?? o.severity;
  const cat = labels.observationCategory[o.category as ObservationCategory] ?? o.category;
  return {
    id: `observations:${o.id}`,
    animalId: forAnimalId,
    type: "observation",
    occurredAt: iso(o.observedAt),
    title: o.category === "note" ? "Not" : `Gözlem · ${cat}${o.severity !== "normal" ? ` · ${sev}` : ""}`,
    summary: [tags.join(", "), o.note].filter(Boolean).join(" · ") || null,
    payload: { category: o.category, severity: o.severity, tags },
    sourceTable: "observations",
    sourceId: o.id,
    createdBy: o.createdBy,
    deleted: o.deletedAt != null,
  };
}

export interface TimelineInput {
  animal: AnimalRowLike;
  weights: WeightRowLike[];
  movements: GroupMovementRowLike[];
  health?: HealthRowLike[];
  breedings?: BreedingRowLike[];
  lambings?: LambingRowLike[];
  exits?: ExitRowLike[];
  observations?: ObservationRowLike[];
  /** Çiftleşme ve doğum olaylarında eş ve yavru küpeleri için. */
  animalRefs?: AnimalRef[];
  groups: GroupRef[];
  includeDeleted?: boolean;
}

/** Bütün olaylar, en yeni önce. Kilo olayları bir önceki tartımla farkı taşır. */
export function buildTimeline(input: TimelineInput): AnimalEvent[] {
  const groups = new Map(input.groups.map((g) => [g.id, g]));
  const weights = [...input.weights].filter((w) => input.includeDeleted || w.deletedAt == null).sort((a, b) => iso(a.weighedAt).localeCompare(iso(b.weighedAt)));
  const events: AnimalEvent[] = [createdEvent(input.animal)];
  weights.forEach((w, i) => events.push(weightEvent(w, i > 0 ? weights[i - 1] : null)));
  for (const m of input.movements) {
    if (!input.includeDeleted && m.deletedAt != null) continue;
    events.push(groupMoveEvent(m, groups));
  }
  for (const h of input.health ?? []) {
    if (!input.includeDeleted && h.deletedAt != null) continue;
    events.push(healthEvent(h));
  }
  const refs = new Map((input.animalRefs ?? []).map((r) => [r.id, r]));
  for (const b of input.breedings ?? []) {
    if (!input.includeDeleted && b.deletedAt != null) continue;
    events.push(breedingEvent(b, input.animal.id, refs));
  }
  for (const l of input.lambings ?? []) {
    if (!input.includeDeleted && l.deletedAt != null) continue;
    events.push(lambingEvent(l, input.animal.id, refs));
  }
  for (const e of input.exits ?? []) {
    if (!input.includeDeleted && e.deletedAt != null) continue;
    events.push(exitEvent(e));
  }
  for (const o of input.observations ?? []) {
    if (!input.includeDeleted && o.deletedAt != null) continue;
    events.push(observationEvent(o, input.animal.id));
  }
  return events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
