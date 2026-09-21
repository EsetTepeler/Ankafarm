import { labels } from "@anka/shared";
import { BarChart3, LayoutDashboard, LogOut, Moon, Package, Settings, Sun, Syringe, Users, ScanLine, Wallet, ClipboardCheck, HeartHandshake, Bell, Lightbulb, type LucideIcon } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { LogoMark, Wordmark } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuthStore } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { useSyncTriggers } from "@/sync/useSyncTriggers";

import { SyncStatus } from "./SyncStatus";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; ownerOnly?: boolean };

/** Menü üç öbekte: günlük akış, sürüyle ilgili işler, çiftlik yönetimi. Uzun tek liste yerine bu daha çabuk taranıyor. */
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Günlük",
    items: [
      { to: "/", label: "Bugün", icon: LayoutDashboard, end: true },
      { to: "/reminders", label: "Hatırlatıcılar", icon: Bell },
      { to: "/animals/round", label: "Günlük tur", icon: ClipboardCheck },
      { to: "/insights", label: "İçgörüler", icon: Lightbulb },
    ],
  },
  {
    label: "Sürü",
    items: [
      { to: "/animals", label: "Hayvanlar", icon: Users },
      { to: "/animals/bulk", label: "Toplu işlem", icon: Syringe },
      { to: "/breeding", label: "Damızlık", icon: HeartHandshake },
      { to: "/scan", label: "QR tara", icon: ScanLine },
    ],
  },
  {
    label: "Çiftlik",
    items: [
      { to: "/stock", label: "Stok", icon: Package },
      { to: "/finance", label: "Finans", icon: Wallet, ownerOnly: true },
      { to: "/reports", label: "Raporlar", icon: BarChart3 },
    ],
  },
];

const nav: NavItem[] = navGroups.flatMap((group) => group.items);

/** "Ahmet Yılmaz" -> "AY"; kullanıcı rozetinde gösterilir. */
function initials(fullName: string | undefined) {
  return (fullName ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("tr");
}

export function AppShell() {
  useSyncTriggers();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { theme, toggle } = useTheme();

  // "/animals" ile "/animals/round" aynı anda eşleşiyordu; en uzun eşleşen tek satır etkin sayılır.
  const matches = (to: string, end?: boolean) => (end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/"));
  const active = [...nav].filter((n) => matches(n.to, n.end)).sort((a, b) => b.to.length - a.to.length)[0];
  const isActive = (to: string, end?: boolean) => (to === active?.to ? true : active ? false : matches(to, end));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b px-3 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <LogoMark className="size-7 rounded-xs" />
            <span className="grid leading-tight group-data-[collapsible=icon]:hidden">
              <Wordmark tone="light" className="text-[13px] tracking-[0.08em]" />
              <span className="label-micro text-[10px] text-sidebar-foreground/40">Çiftlik paneli</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {navGroups.map((group) => {
            const items = group.items.filter((item) => !item.ownerOnly || user?.role === "owner");
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={isActive(item.to, item.end)} tooltip={item.label}>
                          <Link to={item.to} data-testid={`nav-${item.to.replace(/\W+/g, "") || "today"}`}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
          <SidebarGroup className="mt-auto">
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/settings")} tooltip="Ayarlar">
                    <Link to="/settings" data-testid="nav-settings">
                      <Settings />
                      <span>Ayarlar</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2.5 border-t px-1 py-2 group-data-[collapsible=icon]:hidden">
            <span className="label-micro flex size-7 shrink-0 items-center justify-center border text-[10px] text-sidebar-foreground/70">{initials(user?.fullName)}</span>
            <div className="grid flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{user?.fullName}</span>
              <span className="label-micro truncate text-[10px] text-sidebar-foreground/40">{user ? labels.userRole[user.role] : ""}</span>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Çıkış yap"
              data-testid="logout"
              onClick={() => {
                void signOut().then(() => navigate("/login"));
              }}
            >
              <LogOut />
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-sm">
          <SidebarTrigger />
          <h1 className="label-micro truncate text-muted-foreground">{active?.label ?? (isActive("/settings") ? "Ayarlar" : "")}</h1>
          <div className="ml-auto flex items-center gap-1.5">
            <SyncStatus />
            <Button variant="ghost" size="icon-sm" aria-label={theme === "dark" ? "Açık temaya geç" : "Koyu temaya geç"} onClick={toggle}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
