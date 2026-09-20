import { labels, type GroupKind } from "@anka/shared";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { EmptyState, PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createGroup, deleteGroup, updateGroup, useGroupCounts, useGroups } from "@/features/groups/repo";
import { errorMessage, useAuthStore } from "@/lib/auth";
import { cn } from "@/lib/utils";

const kinds = Object.entries(labels.groupKind) as [GroupKind, string][];

interface Editing {
  id: string | null;
  name: string;
  kind: GroupKind;
  capacity: string;
}

const empty: Editing = { id: null, name: "", kind: "pen", capacity: "" };

export function GroupsPage() {
  const groups = useGroups();
  const counts = useGroupCounts();
  const role = useAuthStore((s) => s.user?.role);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const cap = editing.capacity.trim() ? Number(editing.capacity) : null;
      if (editing.id) {
        await updateGroup(editing.id, { name: editing.name.trim(), kind: editing.kind, capacity: cap });
        toast.success("Grup güncellendi");
      } else {
        await createGroup({ name: editing.name.trim(), kind: editing.kind, capacity: cap });
        toast.success(`${editing.name.trim()} eklendi`);
      }
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteGroup(id);
      toast.success("Grup silindi");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="Gruplar ve bölmeler"
        description="Hayvanların bulunduğu bölme, mera ve karantina alanları"
        actions={
          <Button onClick={() => setEditing(empty)} data-testid="group-add">
            <Plus /> Grup ekle
          </Button>
        }
      />

      {groups.data?.length === 0 ? (
        <EmptyState title="Henüz grup yok" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad</TableHead>
                <TableHead>Tür</TableHead>
                <TableHead className="text-right">Hayvan</TableHead>
                <TableHead className="text-right">Kapasite</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groups.data ?? []).map((g) => {
                const n = counts.data?.get(g.id) ?? 0;
                const over = g.capacity != null && n > g.capacity;
                return (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">
                      <Link to={`/animals?group=${g.id}`} className="hover:underline">
                        {g.name}
                      </Link>
                    </TableCell>
                    <TableCell>{labels.groupKind[g.kind as GroupKind] ?? g.kind}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", over && "font-semibold text-danger")} data-testid={`group-count-${g.name}`}>
                      {n}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.capacity ?? "–"}</TableCell>
                    <TableCell className="text-right">
                      {g.syncSeq === 0 ? <Badge variant="outline">senkron bekliyor</Badge> : null}
                      {role === "owner" ? (
                        <>
                          <Button variant="ghost" size="icon" aria-label="Düzenle" onClick={() => setEditing({ id: g.id, name: g.name, kind: g.kind as GroupKind, capacity: g.capacity?.toString() ?? "" })} data-testid={`group-edit-${g.name}`}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon" aria-label="Sil" onClick={() => void remove(g.id)}>
                            <Trash2 />
                          </Button>
                        </>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <form onSubmit={save} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Grubu düzenle" : "Yeni grup"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="group-name">Ad</Label>
              <Input id="group-name" value={editing?.name ?? ""} onChange={(e) => setEditing((s) => s && { ...s, name: e.target.value })} autoFocus data-testid="group-name" />
            </div>
            <ToggleGroup type="single" variant="outline" value={editing?.kind ?? "pen"} onValueChange={(v) => v && setEditing((s) => s && { ...s, kind: v as GroupKind })}>
              {kinds.map(([value, label]) => (
                <ToggleGroupItem key={value} value={value}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <div className="grid gap-2">
              <Label htmlFor="group-capacity">Kapasite, isteğe bağlı</Label>
              <Input id="group-capacity" inputMode="numeric" value={editing?.capacity ?? ""} onChange={(e) => setEditing((s) => s && { ...s, capacity: e.target.value })} placeholder="Bölmeye sığan hayvan sayısı" data-testid="group-capacity" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={busy || !editing?.name.trim()} data-testid="group-save">
                Kaydet
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
