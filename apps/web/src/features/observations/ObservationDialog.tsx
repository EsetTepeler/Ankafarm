import { labels, type ObservationCategory, type Severity } from "@anka/shared";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ZodError } from "zod";

import { DateField } from "@/components/DateField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addObservation, useObservationTags } from "@/features/observations/repo";
import { errorMessage } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { todayIso } from "@/utils/date";

const categories = Object.entries(labels.observationCategory) as [ObservationCategory, string][];
const severities = Object.entries(labels.severity) as [Severity, string][];

/** Gözlem: teşhis değil, sahada görülen. Kategori, şiddet, hazır etiketler, not. */
export function ObservationDialog({ open, onOpenChange, animalId, tagNo }: { open: boolean; onOpenChange: (o: boolean) => void; animalId: string; tagNo: string }) {
  const tags = useObservationTags();
  const [category, setCategory] = useState<ObservationCategory>("feeding");
  const [severity, setSeverity] = useState<Severity>("mild");
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(todayIso());
  const [note, setNote] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [busy, setBusy] = useState(false);

  const tagOptions = useMemo(() => (tags.data ?? []).filter((t) => t.category === category).map((t) => t.label), [tags.data, category]);

  function toggleTag(label: string) {
    setSelected((prev) => (prev.includes(label) ? prev.filter((t) => t !== label) : [...prev, label]));
  }

  async function save() {
    setBusy(true);
    try {
      if (!date) throw new Error("Tarih gerekli");
      const all = customTag.trim() ? [...selected, customTag.trim()] : selected;
      await addObservation({ animalId, observedAt: new Date(`${date}T12:00:00`).toISOString(), category, severity: category === "note" ? "normal" : severity, tags: all, note: note.trim() || null });
      toast.success("Gözlem kaydedildi");
      setSelected([]);
      setNote("");
      setCustomTag("");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ZodError ? (err.issues[0]?.message ?? "Geçersiz değer") : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Gözlem · {tagNo}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Ne gördün?</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={category}
              onValueChange={(v) => {
                if (!v) return;
                setCategory(v as ObservationCategory);
                setSelected([]);
              }}
              className="flex-wrap justify-start"
            >
              {categories.map(([value, label]) => (
                <ToggleGroupItem key={value} value={value} data-testid={`obs-cat-${value}`}>
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          {category !== "note" ? (
            <>
              <div className="grid gap-1.5">
                <Label>Şiddet</Label>
                <ToggleGroup type="single" variant="outline" value={severity} onValueChange={(v) => v && setSeverity(v as Severity)}>
                  {severities.map(([value, label]) => (
                    <ToggleGroupItem key={value} value={value} data-testid={`obs-sev-${value}`}>
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              {tagOptions.length ? (
                <div className="grid gap-1.5">
                  <Label>Belirti</Label>
                  <div className="flex flex-wrap gap-2">
                    {tagOptions.map((label) => (
                      <button key={label} type="button" onClick={() => toggleTag(label)} data-testid={`obs-tag-${label}`}>
                        <Badge variant={selected.includes(label) ? "default" : "outline"} className={cn("cursor-pointer", selected.includes(label) && "ring-2 ring-ring/40")}>
                          {label}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="obs-custom">Başka belirti</Label>
                <Input id="obs-custom" value={customTag} onChange={(e) => setCustomTag(e.target.value)} placeholder="Listede olmayan bir şey" />
              </div>
            </>
          ) : null}
          <DateField id="obs-date" label="Tarih" value={date} onChange={setDate} testID="obs-date" required />
          <div className="grid gap-1.5">
            <Label htmlFor="obs-note">Not</Label>
            <Textarea id="obs-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} data-testid="obs-note" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={() => void save()} disabled={busy} data-testid="obs-save">
            Kaydet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
