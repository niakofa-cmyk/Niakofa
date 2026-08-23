/**
 * Shared primary-navigation item list.
 *
 * Single source of truth for both the desktop left sidebar
 * (components/DesktopSidebar.tsx) and the mobile nav drawer
 * (components/MobileNavDrawer.tsx), so the two surfaces can never drift out
 * of sync with each other.
 */
import {
  Map, Users, ClipboardList, Landmark, Globe2, History,
  Sparkles, Bell, Settings, Wallet, Radio, LayoutDashboard,
} from "lucide-react";

export interface AppNavItem {
  key: string;
  label: string;
  icon: typeof Map;
  href?: string;
  onClick?: () => void;
  isActive?: (location: string) => boolean;
}

export function getAppNavItems(opts: { openNotifications: () => void }): AppNavItem[] {
  return [
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
      // Active for all /diaspora routes EXCEPT /diaspora/timeline (Legacy owns that)
      isActive: (l) =>
        (l.startsWith("/diaspora") && !l.startsWith("/diaspora/timeline")) ||
        l.startsWith("/family") },
    { key: "circles", label: "Circles", icon: Radio, href: "/audio-circles",
      isActive: (l) => l.startsWith("/audio-circle") },
    { key: "wallet", label: "Wallet", icon: Wallet, href: "/wallet",
      isActive: (l) => l.startsWith("/wallet") },
    { key: "nia", label: "AI Assistant (Nia)", icon: Sparkles,
      onClick: () => window.openNia?.() },
    { key: "notifications", label: "Notifications", icon: Bell,
      onClick: opts.openNotifications },
    { key: "settings", label: "Settings", icon: Settings, href: "/settings",
      isActive: (l) => l.startsWith("/settings") },
  ];
}
