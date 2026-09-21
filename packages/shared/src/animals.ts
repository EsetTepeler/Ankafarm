import { z } from "zod";

import { isoDateSchema as isoDate, isoDateTimeSchema as isoDateTime, moneySchema as money, uuidSchema as uuid } from "./common";
import { speciesSchema } from "./farm";
import { stockLabels } from "./stock";

export const sexSchema = z.enum(["female", "male", "castrated"]);
export type Sex = z.infer<typeof sexSchema>;

export const originSchema = z.enum(["born_here", "purchased"]);
export type Origin = z.infer<typeof originSchema>;

export const animalStatusSchema = z.enum(["active", "sold", "dead", "slaughtered", "lost"]);
export type AnimalStatus = z.infer<typeof animalStatusSchema>;

export const birthTypeSchema = z.enum(["single", "twin", "triplet", "quad"]);
export type BirthType = z.infer<typeof birthTypeSchema>;

export const groupKindSchema = z.enum(["pen", "pasture", "quarantine", "nursery"]);
export type GroupKind = z.infer<typeof groupKindSchema>;

export const breedingMethodSchema = z.enum(["natural", "ai"]);
export type BreedingMethod = z.infer<typeof breedingMethodSchema>;
export const pregnancyResultSchema = z.enum(["pending", "positive", "negative"]);
export type PregnancyResult = z.infer<typeof pregnancyResultSchema>;
export const birthDifficultySchema = z.enum(["easy", "assisted", "hard", "cesarean"]);
export type BirthDifficulty = z.infer<typeof birthDifficultySchema>;

export const exitTypeSchema = z.enum(["sold", "died", "slaughtered", "lost"]);
export type ExitType = z.infer<typeof exitTypeSchema>;

export const observationCategorySchema = z.enum(["feeding", "movement", "behavior", "respiratory", "digestive", "appearance", "udder", "reproductive", "note", "other"]);
export type ObservationCategory = z.infer<typeof observationCategorySchema>;
export const severitySchema = z.enum(["normal", "mild", "moderate", "severe"]);
export type Severity = z.infer<typeof severitySchema>;

export const healthTypeSchema = z.enum(["vaccine", "medication", "deworming", "disease", "exam", "hoof", "shearing", "other"]);
export type HealthType = z.infer<typeof healthTypeSchema>;

/** Türkçe etiketler; arayüz ve Python metin şablonları aynı kaynağı kullanır. */
export const labels = {
  ...stockLabels,
  species: { sheep: "Koyun", goat: "Keçi" },
  sex: { female: "Dişi", male: "Erkek", castrated: "Kısırlaştırılmış" },
  origin: { born_here: "Burada doğdu", purchased: "Dışarıdan alındı" },
  animalStatus: { active: "Aktif", sold: "Satıldı", dead: "Öldü", slaughtered: "Kesildi", lost: "Kayıp" },
  birthType: { single: "Tekiz", twin: "İkiz", triplet: "Üçüz", quad: "Dördüz" },
  groupKind: { pen: "Bölme", pasture: "Mera", quarantine: "Karantina", nursery: "Kuzuhane" },
  exitType: { sold: "Satıldı", died: "Öldü", slaughtered: "Kesildi", lost: "Kayboldu" },
  observationCategory: {
    feeding: "Yem",
    movement: "Hareket",
    behavior: "Davranış",
    respiratory: "Solunum",
    digestive: "Sindirim",
    appearance: "Görünüm",
    udder: "Meme",
    reproductive: "Üreme",
    note: "Not",
    other: "Diğer",
  },
  severity: { normal: "Normal", mild: "Hafif", moderate: "Orta", severe: "Ciddi" },
  breedingMethod: { natural: "Doğal", ai: "Suni tohumlama" },
  pregnancyResult: { pending: "Kontrol bekliyor", positive: "Gebe", negative: "Gebe değil" },
  birthDifficulty: { easy: "Kolay", assisted: "Yardımlı", hard: "Zor", cesarean: "Sezaryen" },
  healthType: {
    vaccine: "Aşı",
    medication: "İlaç",
    deworming: "Parazit ilacı",
    disease: "Hastalık",
    exam: "Muayene",
    hoof: "Tırnak bakımı",
    shearing: "Kırkım",
    other: "Diğer",
  },
} as const;

/** Küpe numarası: boşluklar kırpılır, büyük harf; biçim çiftliğe göre değişebildiği için serbest. */
export const tagNoSchema = z
  .string()
  .trim()
  .min(1, "Küpe numarası gerekli")
  .max(40)
  .transform((s) => s.toUpperCase());

export const breedInputSchema = z.object({
  id: uuid,
  name: z.string().trim().min(2).max(80),
  species: speciesSchema,
});
export const breedPatchSchema = breedInputSchema.omit({ id: true }).partial().extend({ active: z.boolean().optional() });

export const groupInputSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "Grup adı gerekli").max(80),
  kind: groupKindSchema.default("pen"),
  capacity: z.number().int().positive().max(100_000).nullable().optional(),
  active: z.boolean().default(true),
});
export const groupPatchSchema = groupInputSchema.omit({ id: true }).partial();

const animalBase = z.object({
  id: uuid,
  tagNo: tagNoSchema,
  rfid: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().max(80).nullable().optional(),
  species: speciesSchema,
  breedId: uuid.nullable().optional(),
  breedNote: z.string().trim().max(200).nullable().optional(),
  sex: sexSchema,
  origin: originSchema,
  acquiredAt: isoDate.nullable().optional(),
  source: z.string().trim().max(120).nullable().optional(),
  purchasePrice: money.nullable().optional(),
  birthDate: isoDate.nullable().optional(),
  birthDateEstimated: z.boolean().default(false),
  birthType: birthTypeSchema.nullable().optional(),
  /** Doğum kaydına bağ (lambing_records.id); doğum formundan açılan yavrularda dolu. */
  birthId: uuid.nullable().optional(),
  motherId: uuid.nullable().optional(),
  fatherId: uuid.nullable().optional(),
  status: animalStatusSchema.default("active"),
  groupId: uuid.nullable().optional(),
  photoPath: z.string().max(300).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Yeni hayvan: kökene göre zorunlu alanlar farklı. */
export const animalInputSchema = animalBase.superRefine((a, ctx) => {
  if (a.origin === "born_here" && !a.motherId) {
    ctx.addIssue({ code: "custom", path: ["motherId"], message: "Burada doğan hayvan için anne seçilmeli" });
  }
  if (a.origin === "purchased" && !a.breedId) {
    ctx.addIssue({ code: "custom", path: ["breedId"], message: "Dışarıdan alınan hayvan için ırk seçilmeli" });
  }
  if (a.motherId && a.motherId === a.id) {
    ctx.addIssue({ code: "custom", path: ["motherId"], message: "Hayvan kendi annesi olamaz" });
  }
});
export type AnimalInput = z.infer<typeof animalInputSchema>;

export const animalPatchSchema = animalBase.omit({ id: true }).partial();
export type AnimalPatch = z.infer<typeof animalPatchSchema>;

export const groupMovementInputSchema = z.object({
  id: uuid,
  animalId: uuid,
  fromGroupId: uuid.nullable().optional(),
  toGroupId: uuid,
  movedAt: isoDateTime,
  reason: z.string().trim().max(200).nullable().optional(),
});
export const groupMovementPatchSchema = groupMovementInputSchema.omit({ id: true, animalId: true }).partial();

export const weightInputSchema = z.object({
  id: uuid,
  animalId: uuid,
  weighedAt: isoDateTime,
  weightKg: z.number().positive("Kilo sıfırdan büyük olmalı").max(500, "Kilo 500 kg'ı geçemez"),
  note: z.string().trim().max(300).nullable().optional(),
});
export type WeightInput = z.infer<typeof weightInputSchema>;
export const weightPatchSchema = weightInputSchema.omit({ id: true, animalId: true }).partial();

export const healthInputSchema = z.object({
  id: uuid,
  animalId: uuid,
  type: healthTypeSchema,
  productName: z.string().trim().max(120).nullable().optional(),
  dose: z.number().positive().max(100_000).nullable().optional(),
  doseUnit: z.string().trim().max(20).nullable().optional(),
  appliedAt: isoDateTime,
  vetName: z.string().trim().max(120).nullable().optional(),
  nextDueAt: isoDate.nullable().optional(),
  withdrawalDays: z.number().int().min(0).max(365).nullable().optional(),
  cost: money.nullable().optional(),
  batchId: uuid.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type HealthInput = z.infer<typeof healthInputSchema>;
export const healthPatchSchema = healthInputSchema.omit({ id: true, animalId: true, batchId: true }).partial();

/** Arınma bitişi: uygulama tarihi + gün. Sunucuda trigger aynı hesabı yapar. */
export function withdrawalUntil(appliedAt: string, withdrawalDays: number | null | undefined): string | null {
  if (withdrawalDays == null) return null;
  const d = new Date(appliedAt);
  d.setUTCDate(d.getUTCDate() + withdrawalDays);
  return d.toISOString().slice(0, 10);
}

/** Varsayılan gebelik süresi, gün. farms.settings ile çiftliğe göre değişebilir. */
export const DEFAULT_GESTATION_DAYS: Record<"sheep" | "goat", number> = { sheep: 150, goat: 150 };

/** Çiftleşme tarihi + gebelik süresi, ISO tarih. */
export function expectedBirthDate(matedAt: string, gestationDays: number): string {
  const d = new Date(`${matedAt}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + gestationDays);
  return d.toISOString().slice(0, 10);
}

export const breedingInputSchema = z.object({
  id: uuid,
  femaleId: uuid,
  maleId: uuid.nullable().optional(),
  method: breedingMethodSchema.default("natural"),
  matedAt: isoDate,
  expectedBirthAt: isoDate,
  pregnancyCheckedAt: isoDate.nullable().optional(),
  pregnancyResult: pregnancyResultSchema.default("pending"),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type BreedingInput = z.infer<typeof breedingInputSchema>;
export const breedingPatchSchema = breedingInputSchema.omit({ id: true, femaleId: true }).partial();

export const lambingInputSchema = z.object({
  id: uuid,
  motherId: uuid,
  fatherId: uuid.nullable().optional(),
  breedingId: uuid.nullable().optional(),
  bornAt: isoDate,
  difficulty: birthDifficultySchema.default("easy"),
  liveCount: z.number().int().min(0).max(6),
  stillbornCount: z.number().int().min(0).max(6),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type LambingInput = z.infer<typeof lambingInputSchema>;
export const lambingPatchSchema = lambingInputSchema.omit({ id: true, motherId: true }).partial();

/** Canlı yavru sayısından doğum tipi. */
export function birthTypeFromCount(n: number): BirthType | null {
  if (n <= 0) return null;
  if (n === 1) return "single";
  if (n === 2) return "twin";
  if (n === 3) return "triplet";
  return "quad";
}

export const exitInputSchema = z.object({
  id: uuid,
  animalId: uuid,
  type: exitTypeSchema,
  exitedAt: isoDate,
  reason: z.string().trim().max(300).nullable().optional(),
  price: money.nullable().optional(),
  buyer: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type ExitInput = z.infer<typeof exitInputSchema>;
export const exitPatchSchema = exitInputSchema.omit({ id: true, animalId: true }).partial();

/** Çıkış türü → hayvan durumu. */
export function statusFromExit(type: ExitType): AnimalStatus {
  return type === "died" ? "dead" : type;
}

export const observationInputSchema = z.object({
  id: uuid,
  animalId: uuid.nullable().optional(),
  groupId: uuid.nullable().optional(),
  observedAt: isoDateTime,
  category: observationCategorySchema,
  severity: severitySchema.default("normal"),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  note: z.string().trim().max(1000).nullable().optional(),
  photoPath: z.string().max(300).nullable().optional(),
});
export type ObservationInput = z.infer<typeof observationInputSchema>;
export const observationPatchSchema = observationInputSchema.omit({ id: true, animalId: true, groupId: true }).partial();

export const observationTagInputSchema = z.object({
  id: uuid,
  category: observationCategorySchema,
  label: z.string().trim().min(1).max(60),
});
export const observationTagPatchSchema = observationTagInputSchema.omit({ id: true }).partial().extend({ active: z.boolean().optional() });

/** Çiftlik oluşturulunca tohumlanan gözlem etiketleri. */
export const seedObservationTags: ReadonlyArray<{ category: ObservationCategory; label: string }> = [
  { category: "movement", label: "Topallama" },
  { category: "movement", label: "Yatıp kalkamama" },
  { category: "respiratory", label: "Öksürük" },
  { category: "respiratory", label: "Burun akıntısı" },
  { category: "respiratory", label: "Hızlı nefes" },
  { category: "digestive", label: "İshal" },
  { category: "digestive", label: "Şişkinlik" },
  { category: "digestive", label: "İştahsızlık" },
  { category: "appearance", label: "Tüy dökülmesi" },
  { category: "appearance", label: "Göz akıntısı" },
  { category: "appearance", label: "Yara" },
  { category: "behavior", label: "Durgunluk" },
  { category: "behavior", label: "Sürüden ayrılma" },
  { category: "behavior", label: "Huzursuzluk" },
  { category: "udder", label: "Meme şişliği" },
  { category: "feeding", label: "Az yedi" },
  { category: "feeding", label: "Yemedi" },
];

/** Çiftlik oluşturulunca tohumlanan ırklar. */
export const seedBreeds: ReadonlyArray<{ species: z.infer<typeof speciesSchema>; name: string }> = [
  ...["Kıvırcık", "Merinos", "Akkaraman", "Morkaraman", "Sakız", "İvesi", "Dağlıç", "Karayaka", "İle de France", "Romanov", "Suffolk", "Texel", "Dorper", "Melez"].map(
    (name) => ({ species: "sheep" as const, name }),
  ),
  ...["Kıl", "Saanen", "Alpin", "Damascus", "Ankara", "Boer", "Melez"].map((name) => ({ species: "goat" as const, name })),
];

export const DEFAULT_GROUP_NAME = "Ana sürü";

/** Günlük tur kaydının etiketi: hayvansız, sürü düzeyinde bir gözlem satırı taşır. */
export const DAILY_ROUND_TAG = "Günlük tur";
