import { Loader2 } from "lucide-react";

import { BRAND_TAGLINE } from "@/components/Logo";

/** Açılış ve hata ekranı: uygulama yüklenirken görünen tek şey bu, o yüzden marka burada duruyor. */
export function Boot({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
      <img src="/logo-mark.png" alt="" className="size-16 rounded-2xl shadow-sm" />
      <div className="grid justify-items-center gap-1 text-center">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-foreground">ANKA</span> <span className="text-primary">FARM</span>
        </span>
        <span className="text-xs text-muted-foreground">{BRAND_TAGLINE}</span>
      </div>
      <div className="flex items-center gap-2">
        {detail ? null : <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
      {detail ? <p className="max-w-md text-center text-xs text-danger">{detail}</p> : null}
    </div>
  );
}
