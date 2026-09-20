import { useQuery } from "@tanstack/react-query";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { Link } from "react-router";

import { EmptyState } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { animals } from "@/db/schema";
import { usePedigree, type PedigreeTree } from "@/features/animals/pedigree";
import { cn } from "@/lib/utils";
import { formatAge } from "@/utils/date";

function useOffspring(animalId: string) {
  return useQuery({
    queryKey: ["local", "animals", "offspring", animalId],
    queryFn: () =>
      getDb()
        .select({ id: animals.id, tagNo: animals.tagNo, name: animals.name, sex: animals.sex, birthDate: animals.birthDate, status: animals.status })
        .from(animals)
        .where(and(isNull(animals.deletedAt), or(eq(animals.motherId, animalId), eq(animals.fatherId, animalId))))
        .orderBy(asc(animals.birthDate)),
  });
}

function Node({ tree, label, depth }: { tree: PedigreeTree | undefined; label: string; depth: number }) {
  const node = tree?.node;
  const isMother = label.endsWith("Anne") || label.endsWith("annesi");
  return (
    <div className={cn("grid gap-1", depth > 0 && "ml-5 border-l pl-3")}>
      <div className="flex items-center gap-2 text-sm" data-testid={`pedigree-${label.toLowerCase().replace(/[^a-z]/g, "")}`}>
        <span className={cn("size-2 rounded-full", isMother ? "bg-chart-5" : "bg-chart-2")} />
        <span className="text-xs text-muted-foreground">{label}</span>
        {node ? (
          <Link to={`/animals/${node.id}`} className="font-medium hover:underline">
            {node.name ? `${node.tagNo} · ${node.name}` : node.tagNo}
          </Link>
        ) : (
          <span className="text-muted-foreground">Bilinmiyor</span>
        )}
      </div>
      {node && tree && (tree.mother || tree.father) ? (
        <>
          <Node tree={tree.mother} label={`${label}nin annesi`} depth={depth + 1} />
          <Node tree={tree.father} label={`${label}nin babası`} depth={depth + 1} />
        </>
      ) : null}
    </div>
  );
}

/** Profildeki Soy ağacı sekmesi: üç nesil ata ve yavrular, tamamı yerel veritabanından. */
export function PedigreeSection({ animalId }: { animalId: string }) {
  const pedigree = usePedigree(animalId, 3);
  const offspring = useOffspring(animalId);
  const tree = pedigree.data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atalar</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {tree && (tree.mother || tree.father) ? (
            <>
              <Node tree={tree.mother} label="Anne" depth={0} />
              <Node tree={tree.father} label="Baba" depth={0} />
            </>
          ) : (
            <EmptyState title={pedigree.isLoading ? "Yükleniyor" : "Anne ve baba bilgisi yok"} />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Yavrular{offspring.data?.length ? ` · ${offspring.data.length}` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {offspring.data?.length === 0 ? <EmptyState title="Kayıtlı yavru yok" /> : null}
          {(offspring.data ?? []).map((c) => (
            <Link key={c.id} to={`/animals/${c.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted" data-testid={`offspring-${c.tagNo}`}>
              <span className="font-medium">{c.name ? `${c.tagNo} · ${c.name}` : c.tagNo}</span>
              <span className="text-xs text-muted-foreground">{[c.sex === "female" ? "Dişi" : c.sex === "male" ? "Erkek" : "Kısır", formatAge(c.birthDate), c.status !== "active" ? "arşiv" : null].filter(Boolean).join(" · ")}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
