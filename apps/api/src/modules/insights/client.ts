import type { FastifyBaseLogger } from "fastify";

/**
 * İçgörü servisini tetikler (bölüm 3.5). Ateşle ve unut: hesap uygulamayı bekletmemeli,
 * servis kapalıysa kayıt yine de düşer, gece işi yakalar.
 * Arka arkaya gelen istekleri Python tarafı 30 sn biriktirir (debounce).
 */
export function createInsightsClient(baseUrl: string | undefined, log: FastifyBaseLogger) {
  const enabled = !!baseUrl;

  const fire = (path: string) => {
    if (!enabled) return;
    const url = `${baseUrl}${path}`;
    void fetch(url, { method: "POST", signal: AbortSignal.timeout(10_000) })
      .then(async (res) => {
        if (!res.ok) log.warn({ url, status: res.status }, "içgörü servisi hata döndü");
      })
      .catch((err) => {
        log.debug({ url, err: String(err) }, "içgörü servisine ulaşılamadı");
      });
  };

  return {
    enabled,
    /** Tek hayvanın kayıtları değişti. */
    animalChanged(farmId: string, animalId: string) {
      fire(`/compute/animal/${farmId}/${animalId}`);
    },
    /** Stok, gider veya sürü düzeyinde bir şey değişti. */
    farmChanged(farmId: string) {
      fire(`/compute/farm/${farmId}`);
    },
  };
}

export type InsightsClient = ReturnType<typeof createInsightsClient>;

/** Hangi tablolar hangi hesabı tetikler. */
const ANIMAL_TABLES = new Set(["animals", "weight_records", "health_records", "observations", "breeding_records", "lambing_records", "exit_records", "group_movements"]);
const FARM_TABLES = new Set(["purchases", "consumptions", "expenses", "incomes", "stock_items", "animals", "exit_records", "lambing_records"]);

/** Push edilen mutasyonlardan hangi hesabın gerektiğini çıkarır. */
export function planRecompute(mutations: { table: string; payload: Record<string, unknown>; rowId: string }[]): { animalIds: string[]; farm: boolean } {
  const animalIds = new Set<string>();
  let farm = false;
  for (const m of mutations) {
    if (FARM_TABLES.has(m.table)) farm = true;
    if (!ANIMAL_TABLES.has(m.table)) continue;
    const id = m.table === "animals" ? m.rowId : (m.payload.animalId ?? m.payload.femaleId ?? m.payload.motherId);
    if (typeof id === "string") animalIds.add(id);
  }
  // Çiftlik hesabı zaten bütün hayvanları kapsıyor; ikisi birden gerekirse tek çağrı yeter.
  return { animalIds: farm ? [] : [...animalIds], farm };
}
