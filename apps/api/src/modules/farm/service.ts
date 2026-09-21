import { DEFAULT_GROUP_NAME, seedBreeds, seedObservationTags, seedStockItems } from "@anka/shared";

import type { Db } from "../../db/client";
import { breeds, groups, observationTags, stockItems } from "../../db/schema";

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
