import { z } from "zod";

export const speciesSchema = z.enum(["sheep", "goat"]);
export type Species = z.infer<typeof speciesSchema>;

export const userRoleSchema = z.enum(["owner", "worker", "vet"]);
export type UserRole = z.infer<typeof userRoleSchema>;

/**
 * İçgörü eşikleri (madde 5.11). Python servisi bu değerleri `farms.settings.insights` altından
 * okur; kodda sabit eşik yok. Burada tanımlı olmayan anahtarlar yok sayılır.
 */
export const insightThresholdFields = [
  { key: "weight_drop_pct", label: "Kilo kaybı uyarısı", unit: "%", default: 5, min: 1, max: 30, hint: "Bu orandan fazla kayıpta uyarı çıkar" },
  { key: "weight_drop_critical_pct", label: "Kilo kaybı acil eşiği", unit: "%", default: 10, min: 2, max: 50, hint: "Bu orandan fazlası acil sayılır" },
  { key: "no_weighing_days", label: "Tartımsız gün", unit: "gün", default: 60, min: 7, max: 365, hint: "Bu kadar gündür tartılmayan hayvan hatırlatılır" },
  { key: "feed_stopped_days", label: "Yemeyi kesme", unit: "gün", default: 2, min: 1, max: 10, hint: "Üst üste kaç gün yemezse acil uyarı" },
  { key: "feed_reduced_days", label: "İştah azalması", unit: "gün", default: 4, min: 2, max: 15, hint: "Üst üste kaç gün az yerse uyarı" },
  { key: "pregnancy_check_days", label: "Gebelik kontrolü", unit: "gün", default: 45, min: 20, max: 120, hint: "Çiftleşmeden sonra kaç günde kontrol beklenir" },
  { key: "long_lambing_interval_days", label: "Doğum aralığı", unit: "gün", default: 400, min: 200, max: 900, hint: "Bu kadar gündür doğurmayan koyun hatırlatılır" },
  { key: "stock_runout_days", label: "Stok bitiş uyarısı", unit: "gün", default: 14, min: 3, max: 60, hint: "Kaç gün kala yem uyarısı çıksın" },
  { key: "farm_cost_jump_pct", label: "Gider sıçraması", unit: "%", default: 25, min: 5, max: 200, hint: "Aylık gider bu orandan fazla değişirse bildir" },
  { key: "min_peers", label: "En az akran sayısı", unit: "hayvan", default: 8, min: 3, max: 50, hint: "Akran karşılaştırması için gereken en az hayvan" },
] as const;

export type InsightThresholdKey = (typeof insightThresholdFields)[number]["key"];

export const insightThresholdSchema = z.record(z.string(), z.number()).refine(
  (value) => Object.keys(value).every((k) => insightThresholdFields.some((f) => f.key === k)),
  { message: "Bilinmeyen eşik anahtarı" },
);

/** Çiftlik ayarları, farms.settings jsonb alanı. */
export const farmSettingsSchema = z.object({
  gestationDays: z.object({ sheep: z.number().int(), goat: z.number().int() }).default({ sheep: 150, goat: 150 }),
  currency: z.string().default("TRY"),
  timezone: z.string().default("Europe/Istanbul"),
  /** İçgörü eşikleri; boş bırakılırsa servis varsayılanları kullanılır. */
  insights: insightThresholdSchema.optional(),
});
export type FarmSettings = z.infer<typeof farmSettingsSchema>;
