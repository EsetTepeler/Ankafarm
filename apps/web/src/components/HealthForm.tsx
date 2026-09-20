import { labels, type HealthType } from "@anka/shared";

import { DateField } from "@/components/DateField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HealthFormValues } from "@/features/health/repo";

const types = Object.entries(labels.healthType) as [HealthType, string][];

/** Tekli ve toplu sağlık girişinin ortak formu. */
export function HealthForm({ values, onChange }: { values: HealthFormValues; onChange: (patch: Partial<HealthFormValues>) => void }) {
  const productLabel = values.type === "vaccine" ? "Aşı adı" : values.type === "medication" || values.type === "deworming" ? "İlaç adı" : "Açıklama";
  return (
    <div className="grid gap-4">
      <ToggleGroup type="single" variant="outline" value={values.type} onValueChange={(v) => v && onChange({ type: v as HealthType })} className="flex-wrap justify-start">
        {types.map(([value, label]) => (
          <ToggleGroupItem key={value} value={value} data-testid={`health-type-${value}`}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="grid gap-1.5">
        <Label htmlFor="health-product">{productLabel}</Label>
        <Input id="health-product" value={values.productName} onChange={(e) => onChange({ productName: e.target.value })} data-testid="health-product" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 grid gap-1.5">
          <Label htmlFor="health-dose">Doz</Label>
          <Input id="health-dose" inputMode="decimal" value={values.dose} onChange={(e) => onChange({ dose: e.target.value })} data-testid="health-dose" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="health-unit">Birim</Label>
          <Input id="health-unit" value={values.doseUnit} onChange={(e) => onChange({ doseUnit: e.target.value })} data-testid="health-unit" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField id="health-applied" label="Uygulama tarihi" value={values.appliedAt} onChange={(v) => onChange({ appliedAt: v })} testID="health-applied" required />
        <DateField id="health-nextdue" label="Sonraki doz veya kontrol" value={values.nextDueAt} onChange={(v) => onChange({ nextDueAt: v })} testID="health-nextdue" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="health-vet">Veteriner</Label>
          <Input id="health-vet" value={values.vetName} onChange={(e) => onChange({ vetName: e.target.value })} data-testid="health-vet" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="health-withdrawal">Arınma süresi, gün</Label>
          <Input id="health-withdrawal" inputMode="numeric" value={values.withdrawalDays} onChange={(e) => onChange({ withdrawalDays: e.target.value })} data-testid="health-withdrawal" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="health-cost">Maliyet, TL</Label>
          <Input id="health-cost" inputMode="decimal" value={values.cost} onChange={(e) => onChange({ cost: e.target.value })} data-testid="health-cost" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="health-notes">Not</Label>
        <Textarea id="health-notes" value={values.notes} onChange={(e) => onChange({ notes: e.target.value })} data-testid="health-notes" rows={2} />
      </div>
    </div>
  );
}
