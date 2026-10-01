import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  BookOpen,
  Camera,
  Clapperboard,
  BriefcaseBusiness,
  Globe2,
  House,
  Image as ImageIcon,
  Menu,
  MessageCircle,
  Search,
  ShoppingBag,
  Users,
  UsersRound,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { NotificationsDrawer } from "@/components/NotificationsDrawer";
import { useCommunityNotifications } from "@/components/community/useCommunityNotifications";
import "./community-social-v4.css";

export type CommunityNavKey =
  | "home"
  | "moments"
  | "people"
  | "hubs"
  | "spirals"
  | "stories"
  | "exchange"
  | "notifications"
  | "profile"
  | "more"
  | "requests"
  | "services"
  | "circles"
  | "media";

interface CommunitySocialShellProps {
  active: CommunityNavKey;
  onNavigate: (key: CommunityNavKey) => void;
  onRoute: (path: string) => void;
  /** Retained for API compatibility; Spark creation belongs to the feed and Moments surfaces. */
  onCreate: () => void;
  onSearch: (value: string) => void;
  searchValue?: string;
  children: ReactNode;
}

const primaryNav = [
  { key: "home" as const, label: "Home", icon: House },
  { key: "moments" as const, label: "Moments", icon: Clapperboard },
  { key: "profile" as const, label: "Profile", icon: UserRound },
];

const menuItems = [
  { href: "/community/people", label: "People", description: "Neighbors you can reach", icon: Users },
  { href: "/community/exchange", label: "Exchange", description: "Give, ask, and trade nearby", icon: ShoppingBag },
  { href: "/notifications", label: "Notifications", description: "What needs your attention", icon: Bell },
  { href: "/community/hubs", label: "Hubs", description: "Your local and diaspora communities", icon: Globe2 },
  { href: "/community/requests", label: "Requests", description: "Give or receive help", icon: BriefcaseBusiness },
  { href: "/community/services", label: "Services", description: "Skills and offers", icon: Wrench },
  { href: "/community/spirals", label: "Spirals", description: "Live community conversations", icon: UsersRound },
  { href: "/community/media", label: "Media", description: "Photos and shared moments", icon: ImageIcon },
  { href: "/diaspora", label: "Diaspora", description: "Global cultural communities", icon: Globe2 },
  { href: "/diaspora/family", label: "Family", description: "Family spaces and memories", icon: UsersRound },
  { href: "/diaspora/timeline", label: "Legacy", description: "Preserve stories across generations", icon: BookOpen },
];

function NavIcon({ item }: { item: (typeof primaryNav)[number] }) {
  const Icon = item.icon;
  return <Icon className="h-[22px] w-[22px]" strokeWidth={2.1} aria-hidden="true" />;
}

export function CommunitySocialShell({
  active,
  onNavigate,
  onRoute,
  onCreate,
  onSearch,
  searchValue = "",
  children,
}: CommunitySocialShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount } = useCommunityNotifications();
  const menuRef = useRef<HTMLElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => menuCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !menuRef.current) return;
      const focusable = Array.from(menuRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
      restoreTarget?.focus();
    };
  }, [menuOpen]);

  const navigate = (key: CommunityNavKey) => {
    if (key === "notifications") { onRoute("/notifications"); return; }
    if (key === "profile") {
      onRoute("/profile");
      return;
    }
    setMenuOpen(false);
    onNavigate(key);
  };

  return (
    <div className="nk-community-v4 min-h-[100dvh]">
      <header className="nk-community-v4-header-wrap sticky top-0 z-40">
        <div className="nk-community-v4-header mx-auto">
          <button
            type="button"
            onClick={() => navigate("home")}
            aria-label="Go to Community home"
            className="nk-community-v4-wordmark text-left"
          >
            niakofa
          </button>

          <div className="nk-community-v4-search">
            <label className="relative mx-auto block max-w-[360px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchValue}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search Niakofa"
                aria-label="Search Niakofa Community"
                className="h-10 w-full rounded-full bg-muted pl-10 pr-4 text-sm outline-none ring-0 focus:bg-background focus:ring-2 focus:ring-primary/20"
              />
            </label>
          </div>

          <div className="nk-community-v4-actions">
            <button
              type="button"
              onClick={() => setSearchOpen((value) => !value)}
              aria-label={searchOpen ? "Close Community search" : "Search Community"}
              aria-expanded={searchOpen}
              className="nk-community-v4-icon-button md:hidden"
            >
              <Search className="h-5 w-5" />
            </button>
            <button type="button" aria-label={unreadCount > 0 ? `Quick notifications, ${unreadCount} unread` : "Quick notifications"} aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen(true)} className="nk-community-v4-icon-button nk-quick-bell">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="nk-bell-count" aria-label={`${unreadCount} unread notifications`}>
                {unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open Community menu"
              aria-expanded={menuOpen}
              className="nk-community-v4-icon-button"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-border/70 px-3 py-2 md:hidden">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchValue}
                onChange={(event) => onSearch(event.target.value)}
                placeholder="Search Niakofa"
                aria-label="Search Niakofa Community"
                autoFocus
                className="h-10 w-full rounded-full bg-muted pl-10 pr-4 text-sm outline-none focus:bg-background"
              />
            </label>
          </div>
        )}
      </header>

      <main className="nk-community-main mx-auto w-full max-w-[900px] min-w-0 px-0 sm:px-4 sm:py-5">
        <div className="w-full min-w-0">{children}</div>
      </main>

      <nav aria-label="Community primary navigation" className="nk-community-dock">
        {primaryNav.slice(0, 2).map((item) => {
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.key)}
              aria-label={item.label}
              aria-current={selected ? "page" : undefined}
              data-active={selected}
              className="nk-community-v4-social-item"
            >
              <NavIcon item={item} />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button type="button" onClick={onCreate} aria-label="Create a Spark" className="nk-community-dock-camera">
          <Camera className="h-6 w-6" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Open Messages" onClick={() => onRoute("/messages")} className="nk-community-v4-social-item">
          <MessageCircle className="h-[22px] w-[22px]" strokeWidth={2.1} aria-hidden="true" />
          <span>Inbox</span>
        </button>
        {primaryNav.slice(2).map((item) => {
          const selected = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.key)}
              aria-label={item.label}
              aria-current={selected ? "page" : undefined}
              data-active={selected}
              className="nk-community-v4-social-item"
            >
              <NavIcon item={item} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Community menu">
          <button
            type="button"
            aria-label="Close Community menu"
            className="absolute inset-0 bg-black/45"
            onClick={() => setMenuOpen(false)}
          />
          <aside ref={menuRef} className="nk-community-sheet relative h-full w-[min(88vw,360px)] overflow-y-auto p-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Niakofa</p>
                <h2 className="text-xl font-black">Community</h2>
              </div>
              <button type="button" ref={menuCloseRef} onClick={() => setMenuOpen(false)} aria-label="Close menu" className="nk-community-v4-icon-button">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-4 px-2 pb-2 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">
              Niakofa features
            </p>
            <div className="grid gap-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onRoute(item.href);
                    }}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-muted"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{item.label}</span>
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-xs font-bold">The dock stays simple. The village stays whole.</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Home, Moments, Inbox, and Profile stay on the dock. Create a Spark opens the camera. People, Exchange, Requests, Services, Spirals, Media, Diaspora, and Family stay here.
              </p>
            </div>
          </aside>
        </div>
      )}

      <NotificationsDrawer open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}
