import { DEFAULT_GROUP_NAME, seedBreeds, seedObservationTags, seedStockItems } from "@anka/shared";

import { eq } from "drizzle-orm";
import { randomInt } from "node:crypto";

import type { Db } from "../../db/client";
import { breeds, farms, groups, observationTags, stockItems } from "../../db/schema";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Yeni çiftlik: yaygın ırklar, "Ana sürü" grubu, gözlem etiketleri ve stok kalemleri tohumlanır. */
export async function bootstrapFarm(tx: Tx, farmId: string, userId: string | null) {
  await tx.insert(breeds).values(
    seedBreeds.map((b) => ({ farmId, name: b.name, species: b.species, isSeed: true, createdBy: userId })),
  );
  await tx.insert(groups).values({ farmId, name: DEFAULT_GROUP_NAME, kind: "pen", createdBy: userId });
  await tx.insert(observationTags).values(seedObservationTags.map((t) => ({ farmId, category: t.category, label: t.label, isSeed: true, createdBy: userId })));
  await tx.insert(stockItems).values(seedStockItems.map((i) => ({ farmId, name: i.name, category: i.category, unit: i.unit, trackStock: i.trackStock, createdBy: userId })));
}

/** Karışan harf ve rakamlar yok (0/O, 1/I/L); kod telefonda okunup yazılacak. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Çiftlik kodu: transferde hedefi göstermek için, "CF-" öneki ve altı karakter. */
export async function generateFarmCode(tx: Tx | Db): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = "CF-" + Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const [taken] = await tx.select({ id: farms.id }).from(farms).where(eq(farms.code, code)).limit(1);
    if (!taken) return code;
  }
  throw new Error("Çiftlik kodu üretilemedi");
}
