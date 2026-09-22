import { ClipboardCheck, LayoutDashboard, Menu, ScanLine, Users, type LucideIcon } from "lucide-react";
import { Link, useLocation } from "react-router";

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Telefonda alt menü. Kenar çubuğu mobilde kapalı bir çekmece; ahırda tek elle kullanırken
 * her geçişte çekmeceyi açmak gerekiyordu. Günlük dört iş burada, gerisi "Menü" ile açılıyor.
 */
const items: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Bugün", icon: LayoutDashboard, end: true },
  { to: "/animals", label: "Hayvanlar", icon: Users },
  { to: "/animals/round", label: "Tur", icon: ClipboardCheck },
  { to: "/scan", label: "QR", icon: ScanLine },
];

export function BottomNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();

  const isActive = (to: string, end?: boolean) =>
    end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/");
  // "/animals" ile "/animals/round" aynı anda eşleşiyor; en uzun eşleşen tek sekme yanar.
  const active = items.filter((i) => isActive(i.to, i.end)).sort((a, b) => b.to.length - a.to.length)[0];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      aria-label="Alt menü"
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          data-testid={`tab-${item.to.replace(/\W+/g, "") || "today"}`}
          className={cn(
            "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] transition-colors",
            active?.to === item.to ? "text-primary" : "text-muted-foreground",
          )}
        >
          <item.icon className="size-5" />
          {item.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        data-testid="tab-menu"
        className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground transition-colors"
      >
        <Menu className="size-5" />
        Menü
      </button>
    </nav>
  );
}
