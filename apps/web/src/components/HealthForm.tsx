import { labels, type HealthType } from "@anka/shared";

import { DateField } from "@/components/DateField";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HealthFormValues } from "@/features/health/repo";

const types = Object.entries(labels.healthType) as [HealthType, string][];

/**
 * Her sağlık türünün hikâyesi farklı: tırnak bakımında doz, kırkımda arınma süresi sorulmaz.
 * Tür başına hangi alanın göründüğü ve ne ad aldığı burada tanımlı.
 */
interface TypeShape {
  /** Ürün/konu alanının etiketi; null ise alan gizlenir. */
  product: string | null;
  productHint?: string;
  dose: boolean;
  /** Sonraki tarih alanının etiketi; null ise gizlenir. */
  next: string | null;
  withdrawal: boolean;
  vet: boolean;
  notesLabel: string;
  /** Seçili türün ne olduğunu bir cümlede anlatır; formun altındaki alanlar ona göre değişiyor. */
  hint: string;
}

const shapes: Record<HealthType, TypeShape> = {
  vaccine: { product: "Aşı adı", productHint: "Enterotoksemi, çiçek...", dose: true, next: "Sonraki doz", withdrawal: true, vet: true, notesLabel: "Not", hint: "Doz ve sonraki doz tarihi girilirse hatırlatıcı kendiliğinden düşer." },
  medication: { product: "İlaç adı", dose: true, next: "Tekrar dozu", withdrawal: true, vet: true, notesLabel: "Not", hint: "Arınma süresi girilirse süt ve et için bekleme tarihi hesaplanır." },
  deworming: { product: "İlaç adı", productHint: "İç veya dış parazit ilacı", dose: true, next: "Sonraki uygulama", withdrawal: true, vet: true, notesLabel: "Not", hint: "İç ve dış parazit ilaçları; sonraki uygulama tarihini de gir." },
  disease: { product: "Hastalık", productHint: "Şap, mastitis, zatürre...", dose: false, next: "Kontrol tarihi", withdrawal: false, vet: true, notesLabel: "Belirtiler ve seyri", hint: "Teşhis veterinerin işi; sen gördüğünü ve seyrini yaz." },
  exam: { product: null, dose: false, next: "Sonraki kontrol", withdrawal: false, vet: true, notesLabel: "Muayene bulgusu", hint: "Veteriner muayenesi; ürün ve doz sorulmaz." },
  hoof: { product: null, dose: false, next: "Sonraki bakım", withdrawal: false, vet: false, notesLabel: "Not", hint: "Tırnak kesimi ve bakımı; doz ya da arınma süresi yok." },
  shearing: { product: null, dose: false, next: null, withdrawal: false, vet: false, notesLabel: "Not", hint: "Kırkım; sadece tarih ve varsa maliyet." },
  other: { product: "Konu", dose: false, next: "Sonraki tarih", withdrawal: false, vet: true, notesLabel: "Açıklama", hint: "Yukarıdakilere girmeyen işler." },
};

const appliedLabels: Partial<Record<HealthType, string>> = {
  disease: "Görülme tarihi",
  exam: "Muayene tarihi",
  hoof: "Bakım tarihi",
  shearing: "Kırkım tarihi",
};

/** Tekli ve toplu sağlık girişinin ortak formu. */
export function HealthForm({ values, onChange }: { values: HealthFormValues; onChange: (patch: Partial<HealthFormValues>) => void }) {
  const shape = shapes[values.type];
  // Tür değişince alakasız alanlar temizlenir; gizlenen alan eski değerini gizlice kaydetmesin.
  function changeType(type: HealthType) {
    const next = shapes[type];
    onChange({
      type,
      ...(next.dose ? {} : { dose: "", doseUnit: "ml" }),
      ...(next.product ? {} : { productName: "" }),
      ...(next.withdrawal ? {} : { withdrawalDays: "" }),
      ...(next.vet ? {} : { vetName: "" }),
      ...(next.next ? {} : { nextDueAt: null }),
    });
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
        <Label className="text-xs tracking-wide text-muted-foreground uppercase">Ne yapıldı?</Label>
        <ToggleGroup type="single" variant="outline" value={values.type} onValueChange={(v) => v && changeType(v as HealthType)} className="flex-wrap justify-start">
          {types.map(([value, label]) => (
            <ToggleGroupItem key={value} value={value} data-testid={`health-type-${value}`}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">{shape.hint}</p>
      </div>

      {shape.product ? (
        <div className="grid gap-1.5">
          <Label htmlFor="health-product">{shape.product}</Label>
          <Input id="health-product" value={values.productName} onChange={(e) => onChange({ productName: e.target.value })} placeholder={shape.productHint} data-testid="health-product" />
        </div>
      ) : null}

      {shape.dose ? (
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
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <DateField id="health-applied" label={appliedLabels[values.type] ?? "Uygulama tarihi"} value={values.appliedAt} onChange={(v) => onChange({ appliedAt: v })} testID="health-applied" required />
        {shape.next ? <DateField id="health-nextdue" label={shape.next} value={values.nextDueAt} onChange={(v) => onChange({ nextDueAt: v })} testID="health-nextdue" /> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {shape.vet ? (
          <div className="grid gap-1.5">
            <Label htmlFor="health-vet">Veteriner</Label>
            <Input id="health-vet" value={values.vetName} onChange={(e) => onChange({ vetName: e.target.value })} data-testid="health-vet" />
          </div>
        ) : null}
        {shape.withdrawal ? (
          <div className="grid gap-1.5">
            <Label htmlFor="health-withdrawal">Arınma, gün</Label>
            <Input id="health-withdrawal" inputMode="numeric" value={values.withdrawalDays} onChange={(e) => onChange({ withdrawalDays: e.target.value })} data-testid="health-withdrawal" />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="health-cost">Maliyet</Label>
          <Input id="health-cost" inputMode="decimal" value={values.cost} onChange={(e) => onChange({ cost: e.target.value })} data-testid="health-cost" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="health-notes">{shape.notesLabel}</Label>
        <Textarea id="health-notes" value={values.notes} onChange={(e) => onChange({ notes: e.target.value })} data-testid="health-notes" rows={2} />
      </div>
    </div>
  );
}
