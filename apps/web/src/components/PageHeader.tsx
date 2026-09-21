import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Sayfa başlığı. İkon verilirse marka renginde bir kutu içinde çıkar; başlığın altında
 * ince bir ayraç var ki içerikle arasındaki sınır belli olsun.
 */
export function PageHeader({ title, description, actions, icon: Icon }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="grid gap-1">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">{title}</h2>
          {description ? <p className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Sayı kartlarının tonu; "acil/geciken" gibi durumları renkle ayırmak için. */
const statTones = {
  default: { ring: "", value: "", icon: "bg-muted text-muted-foreground" },
  success: { ring: "border-success/30 bg-success/5", value: "text-success", icon: "bg-success/10 text-success" },
  warning: { ring: "border-warning/35 bg-warning/8", value: "text-warning", icon: "bg-warning/15 text-warning" },
  danger: { ring: "border-destructive/30 bg-destructive/5", value: "text-destructive", icon: "bg-destructive/10 text-destructive" },
  brand: { ring: "border-primary/25 bg-primary/5", value: "text-primary", icon: "bg-primary/10 text-primary" },
} as const;

export type StatTone = keyof typeof statTones;

export function StatTile({
  label,
  value,
  hint,
  testID,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  testID?: string;
  icon?: LucideIcon;
  tone?: StatTone;
}) {
  const t = statTones[tone];
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-xs transition-colors", t.ring)} data-testid={testID}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {Icon ? (
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            <Icon className="size-3.5" />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums", t.value)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({ title, description, action, icon: Icon }: { title: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 p-10 text-center">
      {Icon ? (
        <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-background text-muted-foreground shadow-xs">
          <Icon className="size-5" />
        </span>
      ) : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground text-pretty">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Bölüm başlığı: kart içindeki alt gruplar için hafif bir ayraç. */
export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold tracking-tight">{children}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
