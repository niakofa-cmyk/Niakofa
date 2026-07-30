/**
 * DesktopSidebar — left-rail navigation shown only on wide (lg+) viewports.
 *
 * The mobile IA (BottomNav + Diaspora's contextual sub-nav) stays exactly as
 * it is; this component is purely additive. On narrow screens it renders
 * nothing (`hidden lg:flex`) and BottomNav continues to own navigation. On
 * wide screens both can technically coexist, but BottomNav's own container
 * query hides it above the `lg` breakpoint in practice — this sidebar is the
 * intended desktop replacement for that space.
 *
 * Route mapping notes (kept honest rather than inventing pages that don't
 * exist):
 *   - "Dashboard" is the new /dashboard page — real data, no fabricated stats.
 *   - "Map" is the app's home route ("/").
 *   - "Resources" deep-links into Community's Resources tab via ?tab=.
 *   - "Civic Engagement" points at /civic-needs, the same canonical entry
 *     point already used from Community, the Map, and the Globe page.
 *   - "AI Assistant (Nia)" doesn't navigate anywhere — Nia is a global
 *     drawer, not a page, so this opens it via the same window.openNia()
 *     hook the TopBar's Nia orb already uses.
 *   - "Notifications" opens the same <NotificationsDrawer> BottomNav uses,
 *     backed by the same shared SEED_NOTIFICATIONS list.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Map, Users, ClipboardList, Landmark, Globe2, History,
  Sparkles, Bell, Settings, Wallet, Radio, ChevronDown, LogOut, LayoutDashboard,
} from "lucide-react";
import { useAppContext } from "@/lib/AppContext";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { SEED_NOTIFICATIONS } from "./BottomNav";

interface NavItem {
  key: string;
  label: string;
  icon: typeof Map;
  href?: string;
  onClick?: () => void;
  isActive?: (location: string) => boolean;
}

export function DesktopSidebar() {
  const [location] = useLocation();
  const { currentUser, logout } = useAppContext() as any;
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const items: NavItem[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard",
      isActive: (l) => l.startsWith("/dashboard") },
    { key: "map", label: "Map", icon: Map, href: "/", isActive: (l) => l === "/" },
    { key: "community", label: "Community", icon: Users, href: "/community",
      isActive: (l) => l.startsWith("/community") },
    { key: "resources", label: "Resources", icon: ClipboardList, href: "/community?tab=resources",
      isActive: (l) => l.startsWith("/community") && l.includes("tab=resources") },
    { key: "civic", label: "Civic Engagement", icon: Landmark, href: "/civic-needs",
      isActive: (l) => l.startsWith("/civic-needs") || l.startsWith("/civic-portal") },
    { key: "diaspora", label: "Diaspora", icon: Globe2, href: "/diaspora",
      isActive: (l) => l.startsWith("/diaspora") || l.startsWith("/family") },
    { key: "legacy", label: "Legacy", icon: History, href: "/diaspora/timeline",
      isActive: (l) => l.startsWith("/diaspora/timeline") },
    { key: "circles", label: "Circles", icon: Radio, href: "/audio-circles",
      isActive: (l) => l.startsWith("/audio-circle") },
    { key: "wallet", label: "Wallet", icon: Wallet, href: "/wallet",
      isActive: (l) => l.startsWith("/wallet") },
    { key: "nia", label: "AI Assistant (Nia)", icon: Sparkles,
      onClick: () => (window as any).openNia?.() },
    { key: "notifications", label: "Notifications", icon: Bell,
      onClick: () => setNotifOpen(true) },
    { key: "settings", label: "Settings", icon: Settings, href: "/settings",
      isActive: (l) => l.startsWith("/settings") },
  ];

  return (
    <>
      <aside
        className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-60 border-r border-border bg-card/60 backdrop-blur z-30"
        aria-label="Primary navigation"
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌳</span>
            <span className="font-black tracking-wide text-primary">NIAKOFA</span>
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 font-bold">
            Help Today, Pay It Forward Tomorrow.
          </div>
        </div>

        {/* Account */}
        <button
          onClick={() => setAccountOpen((v) => !v)}
          className="flex items-center gap-3 px-5 py-4 border-b border-border hover:bg-muted/40 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 text-xs font-black">
            {currentUser?.avatar_url
              ? <img src={currentUser.avatar_url} className="w-full h-full object-cover" alt="" />
              : (currentUser?.name?.[0]?.toUpperCase() ?? "?")}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate">{currentUser?.name ?? "Account"}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              @{currentUser?.username ?? "you"}
            </div>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
        </button>
        {accountOpen && (
          <div className="px-5 py-2 border-b border-border space-y-1">
            <Link href="/profile">
              <div className="text-xs font-bold py-1.5 cursor-pointer hover:text-primary">View Profile</div>
            </Link>
            {typeof logout === "function" && (
              <button
                onClick={() => logout()}
                className="text-xs font-bold py-1.5 text-destructive flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> Log Out
              </button>
            )}
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
          {items.map((item) => {
            const active = item.isActive ? item.isActive(location) : false;
            const content = (
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
                  active ? "bg-primary/15 text-primary" : "text-foreground/80 hover:bg-muted/50"
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </div>
            );
            if (item.href) {
              return (
                <Link key={item.key} href={item.href}>
                  {content}
                </Link>
              );
            }
            return (
              <button key={item.key} onClick={item.onClick} className="w-full text-left">
                {content}
              </button>
            );
          })}
        </nav>
      </aside>

      <NotificationsDrawer
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={SEED_NOTIFICATIONS}
      />
    </>
  );
}
