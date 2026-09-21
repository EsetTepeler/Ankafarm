import { Baby, Bell, CalendarClock, Check, Plus, Syringe, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { EntityPicker } from "@/components/EntityPicker";
import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnimals } from "@/features/animals/repo";
import { useProtocolTasks } from "@/features/protocols/repo";
import { addReminder, completeReminder, deleteReminder, useDoneReminders, useReminders, type ReminderItem, type ReminderKind } from "@/features/reminders/repo";
import { errorMessage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatDate, isoToDisplay, todayIso } from "@/utils/date";

const kindIcon: Record<ReminderKind, typeof Bell> = { manual: Bell, health: Syringe, pregnancy: Baby, withdrawal: Syringe, protocol: CalendarClock };
const kindLabel: Record<ReminderKind, string> = { manual: "Not", health: "Doz", pregnancy: "Üreme", withdrawal: "Arınma", protocol: "Program" };

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Hatırlatıcılar (madde 3.3): geciken, bugün, bu hafta, sonra. Türev işler kayıtlardan gelir. */
export function RemindersPage() {
  const all = useReminders();
  const protocolTasks = useProtocolTasks(60);
  const done = useDoneReminders();
  const [open, setOpen] = useState(false);

  const today = todayIso();
  const week = addDays(today, 7);
  const groups = useMemo(() => {
    // Programdan gelen işler de aynı listede; kayıt tutmazlar, sağlık kaydı girilince kendiliğinden kayarlar.
    const fromProtocol: ReminderItem[] = (protocolTasks.data ?? []).map((t) => ({
      id: t.key,
      kind: "protocol" as const,
      title: t.title,
      dueAt: t.dueAt,
      note: t.note,
      animalId: t.animalId,
      tagNo: t.tagNo,
      doneAt: null,
      completable: false,
    }));
    const open = [...(all.data ?? []), ...fromProtocol].filter((r) => !r.doneAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      overdue: open.filter((r) => r.dueAt < today),
      today: open.filter((r) => r.dueAt === today),
      week: open.filter((r) => r.dueAt > today && r.dueAt <= week),
      later: open.filter((r) => r.dueAt > week),
    };
  }, [all.data, protocolTasks.data, today, week]);

  return (
    <>
      <PageHeader
        title="Hatırlatıcılar"
        description="Geciken ve yaklaşan işler; aşı dozları, gebelik kontrolleri ve kendi notların"
        actions={
          <Button onClick={() => setOpen(true)} data-testid="reminder-add">
            <Plus /> Hatırlatıcı ekle
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Geciken" value={groups.overdue.length} hint={groups.overdue.length ? "En eski: " + isoToDisplay(groups.overdue[0]!.dueAt) : "Geciken iş yok"} testID="rem-overdue" />
        <StatTile label="Bugün" value={groups.today.length} testID="rem-today" />
        <StatTile label="Bu hafta" value={groups.week.length} testID="rem-week" />
        <StatTile label="Tamamlanan" value={done.data?.length ?? 0} hint="Son kayıtlar" testID="rem-done" />
      </div>

      <div className="mt-6 grid gap-4">
        <Section title="Geciken" items={groups.overdue} tone="danger" testID="section-overdue" />
        <Section title="Bugün" items={groups.today} tone="warn" testID="section-today" />
        <Section title="Bu hafta" items={groups.week} testID="section-week" />
        <Section title="Sonra" items={groups.later} testID="section-later" />

        {done.data?.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tamamlananlar</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {done.data.map(({ r, tagNo }) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm text-muted-foreground" data-testid={`done-row-${r.title}`}>
                  <span className="line-through">
                    {r.title}
                    {tagNo ? ` · ${tagNo}` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-xs">{r.doneAt ? formatDate(r.doneAt) : ""}</span>
                    <Button variant="ghost" size="icon" aria-label="Geri al" onClick={() => void completeReminder(r.id, false)}>
                      <Undo2 />
                    </Button>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <AddDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function Section({ title, items, tone, testID }: { title: string; items: ReminderItem[]; tone?: "danger" | "warn"; testID: string }) {
  if (items.length === 0) return null;
  return (
    <Card data-testid={testID}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          <Badge variant={tone === "danger" ? "destructive" : tone === "warn" ? "default" : "outline"}>{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {items.map((r) => {
          const Icon = kindIcon[r.kind];
          return (
            <div key={r.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2 text-sm", tone === "danger" && "border-danger/40")} data-testid={`rem-row-${r.kind}`}>
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <div className="grid min-w-0 flex-1">
                <span className="truncate font-medium">{r.title}</span>
                {r.note ? <span className="truncate text-xs text-muted-foreground">{r.note}</span> : null}
              </div>
              <Badge variant="outline" className="shrink-0">
                {kindLabel[r.kind]}
              </Badge>
              <span className="shrink-0 text-xs text-muted-foreground">{isoToDisplay(r.dueAt)}</span>
              {r.animalId ? (
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/animals/${r.animalId}`}>Aç</Link>
                </Button>
              ) : null}
              {r.completable ? (
                <>
                  <Button variant="ghost" size="icon" aria-label="Tamamla" onClick={() => void completeReminder(r.id)} data-testid={`rem-complete-${r.title}`}>
                    <Check />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Sil" onClick={() => void deleteReminder(r.id)}>
                    <Trash2 />
                  </Button>
                </>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const animals = useAnimals({ status: "active" });
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(todayIso());
  const [animalId, setAnimalId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (!dueAt) throw new Error("Tarih gerekli");
      await addReminder({ title: title.trim(), dueAt, animalId, note: note.trim() || null });
      toast.success("Hatırlatıcı eklendi");
      setTitle("");
      setNote("");
      setAnimalId(null);
      // Tarih de sıfırlanır; yoksa bir sonraki kayıt sessizce eski tarihi alıp gecikmiş görünüyor.
      setDueAt(todayIso());
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={save} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Hatırlatıcı ekle</DialogTitle>
            <DialogDescription>Aşı dozu ve gebelik kontrolü gibi işler kendiliğinden listelenir; burası kendi notların için.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="reminder-title">Başlık</Label>
            <Input id="reminder-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Koçu sürüden ayır" autoFocus data-testid="reminder-title" />
          </div>
          <DateField id="reminder-date" label="Tarih" value={dueAt} onChange={setDueAt} testID="reminder-date" required />
          <EntityPicker
            label="Hayvan, isteğe bağlı"
            items={(animals.data ?? []).map((a) => ({ id: a.id, label: a.tagNo, description: a.name }))}
            value={animalId}
            onChange={setAnimalId}
            placeholder="Sürü geneli"
            noneLabel="Sürü geneli"
            testID="reminder-animal"
          />
          <div className="grid gap-1.5">
            <Label htmlFor="reminder-note">Not</Label>
            <Input id="reminder-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="reminder-note" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={busy || !title.trim()} data-testid="reminder-save">
              Kaydet
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
