import { useQuery } from "@tanstack/react-query";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { animals } from "@/db/schema";

export interface PedigreeNode {
  id: string;
  tagNo: string;
  name: string | null;
  sex: string;
  breedId: string | null;
  birthDate: string | null;
  motherId: string | null;
  fatherId: string | null;
  deletedAt: string | null;
}

export interface PedigreeTree {
  node: PedigreeNode | null;
  mother?: PedigreeTree;
  father?: PedigreeTree;
}

/** Ata haritası: id → satır. Sunucudaki fn_pedigree ile aynı sonuç, çevrimdışı çalışır. */
async function loadAncestors(rootId: string, depth: number): Promise<Map<string, PedigreeNode>> {
  const db = getDb();
  const map = new Map<string, PedigreeNode>();
  let frontier = [rootId];
  for (let g = 0; g <= depth && frontier.length; g++) {
    const rows = await db
      .select({
        id: animals.id,
        tagNo: animals.tagNo,
        name: animals.name,
        sex: animals.sex,
        breedId: animals.breedId,
        birthDate: animals.birthDate,
        motherId: animals.motherId,
        fatherId: animals.fatherId,
        deletedAt: animals.deletedAt,
      })
      .from(animals)
      .where(inArray(animals.id, frontier));
    const next: string[] = [];
    for (const r of rows) {
      map.set(r.id, r);
      for (const p of [r.motherId, r.fatherId]) if (p && !map.has(p)) next.push(p);
    }
    frontier = next;
  }
  return map;
}

function toTree(id: string | null, map: Map<string, PedigreeNode>, depth: number): PedigreeTree | undefined {
  if (!id) return undefined;
  const node = map.get(id) ?? null;
  if (!node || depth === 0) return { node };
  return { node, mother: toTree(node.motherId, map, depth - 1), father: toTree(node.fatherId, map, depth - 1) };
}

export function usePedigree(animalId: string | undefined, depth = 3) {
  return useQuery({
    queryKey: ["local", "animals", "pedigree", animalId ?? "", depth],
    enabled: !!animalId,
    queryFn: async (): Promise<PedigreeTree | null> => {
      const map = await loadAncestors(animalId!, depth);
      return toTree(animalId!, map, depth) ?? null;
    },
  });
}

export interface Relatedness {
  /** Ortak atalar, en yakından uzağa. */
  common: { node: PedigreeNode; femaleGen: number; maleGen: number }[];
  /** Doğrudan ebeveyn-yavru ilişkisi var mı. */
  direct: boolean;
  /** Yaklaşık akrabalık katsayısı (Wright): Σ (1/2)^(n1+n2+1). */
  coefficient: number;
}

function generations(rootId: string, map: Map<string, PedigreeNode>, depth: number): Map<string, number> {
  const out = new Map<string, number>();
  let frontier = [rootId];
  for (let g = 1; g <= depth && frontier.length; g++) {
    const next: string[] = [];
    for (const id of frontier) {
      const n = map.get(id);
      if (!n) continue;
      for (const p of [n.motherId, n.fatherId]) {
        if (!p) continue;
        if (!out.has(p)) out.set(p, g);
        next.push(p);
      }
    }
    frontier = next;
  }
  return out;
}

/** Çiftleşme formundaki anlık akrabalık kontrolü; sunucudaki fn_relatedness ile aynı mantık. */
export async function relatedness(femaleId: string, maleId: string, depth = 4): Promise<Relatedness> {
  const [fMap, mMap] = await Promise.all([loadAncestors(femaleId, depth), loadAncestors(maleId, depth)]);
  const fGen = generations(femaleId, fMap, depth);
  const mGen = generations(maleId, mMap, depth);
  const common: Relatedness["common"] = [];
  let coefficient = 0;
  for (const [id, fg] of fGen) {
    const mg = mGen.get(id);
    if (mg == null) continue;
    const node = fMap.get(id) ?? mMap.get(id);
    if (!node) continue;
    common.push({ node, femaleGen: fg, maleGen: mg });
    coefficient += Math.pow(0.5, fg + mg + 1);
  }
  const direct = fGen.has(maleId) || mGen.has(femaleId);
  if (direct) coefficient += 0.25;
  common.sort((a, b) => a.femaleGen + a.maleGen - (b.femaleGen + b.maleGen));
  return { common, direct, coefficient };
}

export function describeRelatedness(r: Relatedness): { level: "none" | "warn" | "danger"; text: string } {
  if (r.direct) return { level: "danger", text: "Doğrudan ebeveyn ve yavru: çiftleştirilmemeli" };
  if (r.common.length === 0) return { level: "none", text: "Ortak ata yok" };
  const first = r.common[0]!;
  const gens = Math.max(first.femaleGen, first.maleGen);
  const text = `Ortak ata ${first.node.tagNo} (${gens} nesil) · akrabalık ~%${Math.round(r.coefficient * 100)}`;
  return { level: r.coefficient >= 0.125 ? "danger" : "warn", text };
}
