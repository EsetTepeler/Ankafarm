import { cn } from "@/lib/utils";

/**
 * Marka işareti. Kelime markası tipografiyle kurulur (görsel değil): her boyutta keskin kalır,
 * tema değişince renkler uyum sağlar. "ANKA" koyu, "FARM" açık yeşil — logodaki ayrım.
 */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/logo-mark.png" alt="" className={cn("size-9 shrink-0 rounded-lg object-cover", className)} />;
}

export function Wordmark({ className, tone = "auto" }: { className?: string; tone?: "auto" | "light" }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      <span className={tone === "light" ? "text-sidebar-foreground" : "text-foreground"}>ANKA</span>{" "}
      <span className={tone === "light" ? "text-[var(--brand-amber)]" : "text-primary"}>FARM</span>
    </span>
  );
}

export function Logo({ className, subtitle, tone = "auto" }: { className?: string; subtitle?: string; tone?: "auto" | "light" }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="grid leading-tight">
        <Wordmark tone={tone} className="text-base" />
        {subtitle ? <span className={cn("text-[11px] tracking-wide", tone === "light" ? "text-sidebar-foreground/70" : "text-muted-foreground")}>{subtitle}</span> : null}
      </span>
    </span>
  );
}

/** Logodaki alt başlık; giriş ekranı ve baskılarda kullanılır. */
export const BRAND_TAGLINE = "Daha sağlıklı sürüler, daha güçlü yarınlar";
