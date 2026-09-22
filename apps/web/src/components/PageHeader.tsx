import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sayfa başlığı. Dekoratif ikon yok: hiyerarşiyi punto, harf aralığı ve altındaki
 * saç teli çizgi kuruyor. İstenirse başlığın üstüne monospace bir bölüm adı konur.
 */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b pb-5">
      <div className="grid gap-2">
        {eyebrow ? <span className="label-micro text-muted-foreground">{eyebrow}</span> : null}
        <h2 className="display text-[1.75rem] leading-none">{title}</h2>
        {description ? <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Sayı kartının tonu; renk yalnızca durum taşır, süs değil. */
const statTones = {
  default: "",
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  brand: "text-primary",
} as const;

export type StatTone = keyof typeof statTones;

/**
 * Sayı kartı: üstte monospace etiket, altında büyük tabular sayı, en altta tek satır açıklama.
 * Kutu yerine ızgara hücresi gibi durur; kenarlığı çevresindeki gruptan gelir.
 */
export function StatTile({ label, value, hint, testID, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; testID?: string; tone?: StatTone }) {
  return (
    <div className="grid gap-2 border bg-card p-4" data-testid={testID}>
      <p className="label-micro text-muted-foreground">{label}</p>
      <p className={cn("text-3xl leading-none font-medium tracking-tight tabular-nums", statTones[tone])}>{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Sayı kartlarını bitişik bir ızgaraya dizer: aradaki çizgiler tek piksel kalır. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-px bg-border lg:grid-cols-4 [&>*]:border-0", className)}>{children}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 border border-dashed px-6 py-12 text-center">
      <p className="label-micro text-muted-foreground">Boş</p>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground text-pretty">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Bölüm başlığı: kart içindeki alt gruplar için monospace etiket ve ince ayraç. */
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2 border-b pb-2">
      <h3 className="label-micro text-muted-foreground">{children}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
