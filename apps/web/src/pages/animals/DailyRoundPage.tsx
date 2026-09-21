import { labels, type GroupKind, type ObservationCategory, type Severity } from "@anka/shared";
import { Check, CircleAlert, ClipboardCheck, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { DateField } from "@/components/DateField";
import { EntityPicker } from "@/components/EntityPicker";
import { EmptyState, PageHeader, StatTile } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAnimals } from "@/features/animals/repo";
import { useGroups } from "@/features/groups/repo";
import { saveDailyRound, useObservationTags, useTodayRound, type ObservationDraft } from "@/features/observations/repo";
import { errorMessage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { formatDateTime, todayIso } from "@/utils/date";

/** Turda en sık görülenler; kalanı hayvan profilinden girilir. */
const roundCategories: ObservationCategory[] = ["feeding", "movement", "respiratory", "digestive", "behavior", "udder"];
const severities: Severity[] = ["mild", "moderate", "severe"];

interface Mark {
  category: ObservationCategory;
  severity: Severity;
  tags: string[];
  note: string;
}

const emptyMark: Mark = { category: "feeding", severity: "mild", tags: [], note: "" };

/**
 * Günlük tur (bölüm 5, madde 2.6): varsayılan "hepsi normal", sadece dikkat çekeni işaretle.
 * Kaydet hem işaretli hayvanların gözlemlerini hem de sürü düzeyinde tur kaydını yazar.
 */
export function DailyRoundPage() {
  const navigate = useNavigate();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [busy, setBusy] = useState(false);
  const animals = useAnimals({ status: "active", groupId: groupId ?? undefined });
  const groups = useGroups();
  const tags = useObservationTags();
  const round = useTodayRound();

  const rows = animals.data ?? [];
  const markedIds = Object.keys(marks);
  const groupItems = useMemo(
    () => (groups.data ?? []).map((g) => ({ id: g.id, label: g.name, description: labels.groupKind[g.kind as GroupKind] ?? g.kind })),
    [groups.data],
  );

  function toggle(animalId: string) {
    setMarks((prev) => {
      const next = { ...prev };
      if (next[animalId]) delete next[animalId];
      else next[animalId] = { ...emptyMark };
      return next;
    });
  }

  function patch(animalId: string, change: Partial<Mark>) {
    setMarks((prev) => ({ ...prev, [animalId]: { ...prev[animalId]!, ...change } }));
  }

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const observedAt = new Date(`${date}T12:00:00`).toISOString();
      const drafts: ObservationDraft[] = markedIds.map((animalId) => {
        const m = marks[animalId]!;
        return { animalId, observedAt, category: m.category, severity: m.severity, tags: m.tags, note: m.note.trim() || null };
      });
      const n = await saveDailyRound({ observedAt, groupId, checked: rows.length, drafts });
      toast.success(n === 0 ? `Tur kaydedildi: ${rows.length} hayvan, hepsi normal` : `Tur kaydedildi: ${n} hayvan işaretlendi`);
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        icon={ClipboardCheck}
        title="Günlük tur"
        description="Sürüyü gözden geçir; varsayılan hepsi normal, sadece dikkat çekeni işaretle"
        actions={
          <Button onClick={() => void save()} disabled={busy || rows.length === 0} data-testid="round-save">
            <ClipboardCheck /> Turu kaydet
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Kontrol edilen" value={rows.length} hint={groupId ? "Seçili grup" : "Tüm aktif sürü"} testID="round-total" icon={Users} />
        <StatTile label="İşaretli" value={markedIds.length} hint={markedIds.length ? "Kaydedince gözlem olur" : "Hepsi normal"} testID="round-marked" icon={CircleAlert} tone={markedIds.length ? "warning" : "success"} />
        <StatTile
          label="Bugünkü tur"
          value={round.data ? "Yapıldı" : "Yapılmadı"}
          hint={round.data ? formatDateTime(round.data.observedAt) : "Kaydedince işaretlenir"}
          testID="round-status"
          icon={ClipboardCheck}
          tone={round.data ? "success" : "default"}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <div className="w-56">
          <EntityPicker label="Grup" items={groupItems} value={groupId} onChange={setGroupId} placeholder="Tüm sürü" noneLabel="Tüm sürü" testID="round-group" />
        </div>
        <DateField id="round-date" label="Tarih" value={date} onChange={setDate} testID="round-date" required />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="Aktif hayvan yok" />
      ) : (
        <div className="mt-4 grid gap-2">
          {rows.map((a) => {
            const mark = marks[a.id];
            const catTags = (tags.data ?? []).filter((t) => t.category === (mark?.category ?? "feeding")).map((t) => t.label);
            return (
              <Card key={a.id} className={cn("overflow-hidden py-0 transition-colors", mark && "border-warning/50 bg-warning/5")}>
                <CardContent className="p-0">
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/60"
                    data-testid={`round-row-${a.tagNo}`}
                  >
                    <span className="font-medium">
                      {a.tagNo}
                      {a.name ? <span className="text-muted-foreground"> · {a.name}</span> : null}
                    </span>
                    {mark ? (
                      <Badge variant="outline" className="gap-1 border-warning/45 bg-warning/15 font-medium text-warning">
                        <CircleAlert className="size-3.5" />
                        {labels.observationCategory[mark.category]} · {labels.severity[mark.severity]}
                      </Badge>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <Check className="size-3.5" /> Normal
                      </span>
                    )}
                  </button>

                  {mark ? (
                    <div className="grid gap-3 border-t bg-background px-4 py-3" data-testid={`round-panel-${a.tagNo}`}>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={mark.category}
                        onValueChange={(v) => v && patch(a.id, { category: v as ObservationCategory, tags: [] })}
                        className="flex-wrap justify-start"
                      >
                        {roundCategories.map((c) => (
                          <ToggleGroupItem key={c} value={c} data-testid={`round-cat-${a.tagNo}-${c}`}>
                            {labels.observationCategory[c]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      <ToggleGroup type="single" variant="outline" size="sm" value={mark.severity} onValueChange={(v) => v && patch(a.id, { severity: v as Severity })} className="justify-start">
                        {severities.map((sev) => (
                          <ToggleGroupItem key={sev} value={sev} data-testid={`round-sev-${a.tagNo}-${sev}`}>
                            {labels.severity[sev]}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                      {catTags.length ? (
                        <div className="flex flex-wrap gap-2">
                          {catTags.map((label) => {
                            const on = mark.tags.includes(label);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => patch(a.id, { tags: on ? mark.tags.filter((t) => t !== label) : [...mark.tags, label] })}
                                data-testid={`round-tag-${a.tagNo}-${label}`}
                              >
                                <Badge variant={on ? "default" : "outline"} className="cursor-pointer">
                                  {label}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                      <div className="grid gap-1.5">
                        <Label htmlFor={`round-note-${a.id}`} className="text-xs">
                          Not
                        </Label>
                        <Input id={`round-note-${a.id}`} value={mark.note} onChange={(e) => patch(a.id, { note: e.target.value })} data-testid={`round-note-${a.tagNo}`} />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
