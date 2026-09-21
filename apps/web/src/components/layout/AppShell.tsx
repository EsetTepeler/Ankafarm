import { BarChart3, LayoutDashboard, LogOut, Moon, Package, Settings, Sun, Syringe, Users, ScanLine, Wallet } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

const nav = [
  { to: "/", label: "Bugün", icon: LayoutDashboard, end: true },
  { to: "/animals", label: "Hayvanlar", icon: Users },
  { to: "/animals/bulk", label: "Toplu sağlık", icon: Syringe },
  { to: "/scan", label: "QR tara", icon: ScanLine },
  { to: "/stock", label: "Stok", icon: Package },
  { to: "/finance", label: "Finans", icon: Wallet, ownerOnly: true },
  { to: "/reports", label: "Raporlar", icon: BarChart3, disabled: true },
];

const roleLabels = { owner: "Sahip", worker: "Bakıcı", vet: "Veteriner" } as const;

export function AppShell() {
  useSyncTriggers();
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const { theme, toggle } = useTheme();

  const isActive = (to: string, end?: boolean) => (end ? location.pathname === to : location.pathname === to || location.pathname.startsWith(to + "/"));
  const active = [...nav].reverse().find((n) => isActive(n.to, n.end));

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-semibold">A</div>
            <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold">Anka Farm</span>
              <span className="text-xs text-muted-foreground">Çiftlik paneli</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Menü</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav
                  .filter((item) => !item.ownerOnly || user?.role === "owner")
                  .map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={isActive(item.to, item.end)} tooltip={item.label} disabled={item.disabled}>
                      {item.disabled ? (
                        <span className="opacity-50" title="Faz 2 ile gelecek">
                          <item.icon />
                          <span>{item.label}</span>
                        </span>
                      ) : (
                        <Link to={item.to} data-testid={`nav-${item.to.replace(/\W+/g, "") || "today"}`}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Yönetim</SidebarGroupLabel>
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
          <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:hidden">
            <div className="grid flex-1 leading-tight">
              <span className="truncate text-sm font-medium">{user?.fullName}</span>
              <span className="truncate text-xs text-muted-foreground">{user ? roleLabels[user.role] : ""}</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
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
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <h1 className="text-sm font-medium text-muted-foreground">{active?.label ?? (isActive("/settings") ? "Ayarlar" : "")}</h1>
          <div className="ml-auto flex items-center gap-2">
            <SyncStatus />
            <Button variant="ghost" size="icon" aria-label="Tema" onClick={toggle}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
