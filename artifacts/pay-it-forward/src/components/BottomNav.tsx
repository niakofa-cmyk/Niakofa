import { useLocation, Link } from "wouter";
import { Map, Users, DollarSign, Radio, Navigation2, Wallet, Bell, X, SlidersHorizontal, Globe2, HeartHandshake } from "lucide-react";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationsDrawer, type LiveNotification } from "./NotificationsDrawer";
import { useWebSocket } from "@/lib/useWebSocket";
import { useAppContext } from "@/lib/AppContext";
import type { HelpRequest } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { Z_NAV } from "@/lib/zLayers";

type Tab = { path: string; icon: React.ElementType; labelKey: string; center?: boolean };

// The tab bar fully swaps based on helperModeActive — this is a real "Helper
// Mode home screen", not just a toggle that changes what you can do while
// leaving the nav chrome the same. Profile stays reachable via the TopBar
// avatar in both modes (see TopBar.tsx), so dropping it here isn't a
// regression — it frees two slots for features that previously had zero
// bottom-nav discoverability (Wallet, Circles).
//
// Helper Mode OFF — consumer-facing nav: Home/Community, Map (browse &
// request — the map screen carries its own "Request Help" FAB), Circles,
// Wallet. No navigation UI, no earnings, no background-check chrome.
const BASE_TABS: Tab[] = [
  { path: "/community",     icon: Users,      labelKey: "nav.community" },
  { path: "/",              icon: Map,        labelKey: "nav.map"       },
  { path: "/diaspora",      icon: Globe2,     labelKey: "nav.diaspora"  },
  { path: "/audio-circles", icon: Radio,      labelKey: "nav.circles"   },
  { path: "/wallet",        icon: Wallet,     labelKey: "nav.wallet"    },
];

// Helper Mode ON — helper-facing nav: Active Job (center, most important
// action — jumps straight to the in-progress job, or to Nearby Requests if
// there isn't one yet), Nearby Requests (map, already filters to claimable
// requests when helperModeActive is true), Earnings (helper-dashboard is the
// full earnings + payout home), Circles.
const HELPER_TABS: Tab[] = [
  { path: "/helper-dashboard", icon: DollarSign,   labelKey: "nav.earnings" },
  { path: "/",                 icon: Map,           labelKey: "nav.nearby"  },
  { path: "__active_job__",    icon: Navigation2,   labelKey: "nav.active_job", center: true },
  { path: "/audio-circles",    icon: Radio,         labelKey: "nav.circles" },
];

const SEED_NOTIFICATIONS: LiveNotification[] = [
  {
    id: "seed-1",
    type: "emergency",
    title: "🚨 Emergency nearby",
    body: "Sarah Chen needs immediate help — power out, needs phone charge",
    time: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: "seed-2",
    type: "completed",
    title: "✅ Request completed",
    body: "You helped DeShawn Moore with grocery pickup",
    time: new Date(Date.now() - 60 * 60 * 1000),
  },
  {
    id: "seed-3",
    type: "pledge",
    title: "💙 Niakofa received",
    body: "Maria G. contributed $5 toward your help last week",
    time: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: "seed-4",
    type: "nearby",
    title: "📍 New request 0.3 mi away",
    body: "Airport drop-off at 6am — transportation needed",
    time: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
];

export function BottomNav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const { helperModeActive, activeRequestId, mapNavOpen, setMapNavOpen,
    setMapSettingsOpen } = useAppContext();
  const suppressed = useIsAnimationSuppressed();
  const tabs = helperModeActive ? HELPER_TABS : BASE_TABS;

  const isMapRoute = location === "/";

  // "Active Job" is a placeholder path — resolved here so a helper who
  // hasn't been dispatched yet lands on Nearby Requests (map) instead of a
  // dead link, while a helper mid-job jumps straight to that job's tracking
  // screen.
  const activeJobHref = activeRequestId ? `/request/${activeRequestId}` : "/";
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<LiveNotification[]>(SEED_NOTIFICATIONS);
  const [unreadCount, setUnreadCount] = useState(0);
  const seenIds = useRef(new Set<string>());

  const addNotif = (n: LiveNotification) => {
    if (seenIds.current.has(n.id)) return;
    seenIds.current.add(n.id);
    setNotifications(prev => [n, ...prev].slice(0, 50));
    setUnreadCount(prev => Math.min(prev + 1, 99));
  };

  useWebSocket((event) => {
    if (event.type === "chat_message") {
      const msg = event.payload as { request_id: number; content: string; sender_id: number };
      addNotif({
        id: `chat-${Date.now()}`,
        type: "chat",
        title: "💬 New message",
        body: msg.content.length > 60 ? msg.content.slice(0, 60) + "…" : msg.content,
        time: new Date(),
      });
    } else if (event.type === "new_request") {
      const req = event.payload as HelpRequest;
      const isEmergency = req.urgency === "emergency";
      addNotif({
        id: `req-${req.id}`,
        type: (isEmergency ? "emergency" : "nearby") as LiveNotification["type"],
        title: isEmergency ? "🚨 Emergency nearby" : "📍 New request nearby",
        body: req.title,
        time: new Date(),
      });
    } else if (event.type === "request_updated") {
      const req = event.payload as HelpRequest;
      if (req.status === "claimed" && req.helper_name) {
        addNotif({
          id: `claimed-${req.id}`,
          type: "helper_accepted",
          title: "✋ Helper accepted your request",
          body: `${req.helper_name} is on the way for: ${req.title}`,
          time: new Date(),
        });
      } else if (req.status === "completed") {
        addNotif({
          id: `complete-${req.id}`,
          type: "completed",
          title: "✅ Request completed",
          body: req.title,
          time: new Date(),
        });
      }
    } else if (event.type === "pledge_paid") {
      const p = event.payload as { amount: number; request_title: string };
      addNotif({
        id: `pledge-paid-${Date.now()}`,
        type: "pledge",
        title: "💙 Niakofa sent",
        body: `$${p.amount.toFixed(2)} paid forward for: ${p.request_title}`,
        time: new Date(),
      });
    } else if (event.type === "pledge_scheduled") {
      const p = event.payload as { amount: number; scheduled_date: string };
      const d = new Date(p.scheduled_date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      addNotif({
        id: `pledge-sched-${Date.now()}`,
        type: "pledge_scheduled",
        title: "📅 Payment scheduled",
        body: `$${p.amount.toFixed(2)} saved for ${d} — we'll remind you`,
        time: new Date(),
      });
    } else if (event.type === "circle_went_live") {
      const p = event.payload as { session_id: number; circle_name: string; title: string; host_name: string; video_enabled?: boolean };
      addNotif({
        id: `circle-live-${p.session_id}`,
        type: "circle_went_live",
        title: `🔴 ${p.circle_name} is live`,
        body: `"${p.title}" — hosted by ${p.host_name}${p.video_enabled ? " 🎥" : ""}`,
        time: new Date(),
        actionUrl: `/audio-circle/${p.session_id}`,
      });
    }
  });

  const openNotifications = () => {
    setNotifOpen(true);
    setUnreadCount(0);
  };

  // ── Map route: floating corner icon + pop-up nav panel ────────────────────
  // On the map the full bottom bar is hidden entirely. Instead, a small
  // floating button sits in the bottom-LEFT corner (so it doesn't overlap
  // the map zoom/compass controls on the right) and toggles a compact
  // vertical nav panel above it. This keeps 100% of the map surface free
  // from chrome when the nav is closed, while still being reachable with
  // a single tap.
  if (isMapRoute) {
    return (
      <>
        {/* Floating corner nav — LEFT side to avoid Mapbox controls on the right */}
        <div
          className="fixed bottom-28 left-4 flex flex-col items-start"
          style={{ zIndex: Z_NAV }}
        >
          <AnimatePresence>
            {mapNavOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.88, y: 16, originX: 0, originY: 1 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 16 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className="mb-3"
              >
                {/* ── Single glassmorphic panel ──────────────────────────────
                    All nav items live in one cohesive card that matches the
                    Niakofa dark-teal brand rather than individual loose pills.
                    Width is fixed so items don't reflow as the panel opens. */}
                <div
                  className="w-[188px] rounded-[20px] overflow-hidden"
                  style={{
                    background: "rgba(4,11,20,0.93)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(0,212,255,0.18)",
                    boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,212,255,0.07), inset 0 1px 0 rgba(0,212,255,0.06)",
                  }}
                >
                  {/* Brand header */}
                  <div className="px-3 pt-2.5 pb-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full bg-teal-400${suppressed ? "" : " animate-pulse"}`}
                        style={{ boxShadow: "0 0 6px rgba(0,212,255,0.9)" }}
                      />
                      <span className="text-[9px] font-black uppercase tracking-[0.22em] text-teal-400/75">Niakofa</span>
                    </div>
                  </div>

                  {/* Map Settings */}
                  <button
                    onClick={() => { setMapSettingsOpen(true); setMapNavOpen(false); }}
                    aria-label="Map settings — filters and layers"
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 active:bg-teal-500/10 transition-colors"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", touchAction: "manipulation" }}
                  >
                    <span className="w-6 h-6 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-bold text-white/85">Map Settings</span>
                  </button>

                  {/* Niakofa Mission Settings — deep-links straight into the
                      "Help Today, Pay It Forward Tomorrow" section of the
                      main Settings page, distinct from the map-display
                      settings above. */}
                  <Link href="/settings?section=mission" onClick={() => setMapNavOpen(false)}>
                    <div
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 active:bg-teal-500/10 transition-colors cursor-pointer"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", touchAction: "manipulation" }}
                    >
                      <span className="w-6 h-6 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0">
                        <HeartHandshake className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                      </span>
                      <span className="text-xs font-bold text-white/85">Niakofa Settings</span>
                    </div>
                  </Link>

                  {/* Notification bell */}
                  <button
                    onClick={() => { openNotifications(); setMapNavOpen(false); }}
                    aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 active:bg-teal-500/10 transition-colors relative"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", touchAction: "manipulation" }}
                  >
                    <span className="w-6 h-6 rounded-lg bg-teal-500/15 flex items-center justify-center shrink-0 relative">
                      <Bell className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center bg-destructive rounded-full text-[7px] font-black text-white">
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-bold text-white/85">Alerts</span>
                    {unreadCount > 0 && (
                      <span className="ml-auto text-[9px] font-black text-destructive/90">{unreadCount} new</span>
                    )}
                  </button>

                  {/* Nav tabs — reversed so the first tab is closest to the button */}
                  {[...tabs].reverse().map((tab, i, arr) => {
                    const href = tab.path === "__active_job__" ? activeJobHref : tab.path;
                    const isActive = tab.path === "__active_job__"
                      ? !!activeRequestId && location.startsWith(`/request/${activeRequestId}`)
                      : tab.path === "/"
                        ? location === "/"
                        : location.startsWith(tab.path);
                    const isLast = i === arr.length - 1;

                    return (
                      <Link
                        key={tab.path}
                        href={href}
                        onClick={() => setMapNavOpen(false)}
                        aria-label={`${t(tab.labelKey)}${isActive ? " (current page)" : ""}`}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <div
                          className="flex items-center gap-2.5 px-3 py-2.5 active:bg-teal-500/10 transition-colors"
                          style={{ borderBottom: isLast ? "none" : "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                            style={{ background: isActive ? "rgba(0,212,255,0.18)" : "rgba(255,255,255,0.05)" }}
                          >
                            <tab.icon
                              className="w-3.5 h-3.5 transition-colors"
                              style={{ color: isActive ? "rgb(0,212,255)" : "rgba(255,255,255,0.5)" }}
                              aria-hidden="true"
                            />
                          </span>
                          <span
                            className="text-xs font-bold transition-colors"
                            style={{ color: isActive ? "rgb(0,212,255)" : "rgba(255,255,255,0.82)" }}
                          >
                            {t(tab.labelKey)}
                          </span>
                          {/* Live-job pulse indicator */}
                          {tab.path === "__active_job__" && !!activeRequestId && !isActive && (
                            <span className={`ml-auto w-2 h-2 rounded-full bg-green-400 shrink-0${suppressed ? "" : " animate-pulse"}`} />
                          )}
                          {/* Active dot */}
                          {isActive && (
                            <span
                              className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ background: "rgb(0,212,255)", boxShadow: "0 0 6px rgba(0,212,255,0.7)" }}
                            />
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Sankofa Bird toggle button ───────────────────────────────────
              The bird IS the nav affordance — tapping it opens/closes the
              panel above. Uses the new photorealistic teal bird PNG with
              mix-blend-mode: screen so the dark image background disappears
              against the button's dark surface, leaving only the bird. */}
          <button
            onClick={() => setMapNavOpen(!mapNavOpen)}
            aria-label={mapNavOpen ? "Close navigation" : "Open navigation"}
            style={{
              touchAction: "manipulation",
              width: 56, height: 56,
              borderRadius: 18,
              background: mapNavOpen ? "rgba(0,212,255,0.15)" : "rgba(4,11,20,0.92)",
              boxShadow: mapNavOpen
                ? "0 0 0 2px rgba(0,212,255,0.85), 0 0 28px rgba(0,212,255,0.45)"
                : "0 0 0 1px rgba(0,212,255,0.22), 0 0 14px rgba(0,212,255,0.10), 0 4px 20px rgba(0,0,0,0.55)",
              display: "flex", alignItems: "center", justifyContent: "center",
              position: "relative", overflow: "hidden",
              transition: "all 0.18s ease",
            }}
          >
            {/* Subtle top-edge shimmer when open */}
            {mapNavOpen && (
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg,transparent,rgba(0,212,255,0.5),transparent)" }}
              />
            )}
            {mapNavOpen
              ? <X className="w-5 h-5" style={{ color: "rgb(0,212,255)" }} aria-hidden="true" />
              : (
                <>
                  {/* Ambient top-glow layer behind the bird */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(0,212,255,0.1) 0%, transparent 70%)" }}
                  />
                  <img
                    src="/sankofa-bird-new.png"
                    alt=""
                    aria-hidden="true"
                    className="relative w-14 h-14 object-contain"
                    style={{
                      mixBlendMode: "screen",
                      filter: "drop-shadow(0 0 8px rgba(0,212,255,0.55)) brightness(1.08) saturate(1.15)",
                    }}
                  />
                </>
              )
            }
            {/* Unread badge */}
            {!mapNavOpen && unreadCount > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-black text-white"
                style={{
                  background: "rgb(239,68,68)",
                  border: "1.5px solid rgba(4,11,20,0.9)",
                  boxShadow: "0 0 8px rgba(255,50,50,0.6)",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} notifications={notifications} />
      </>
    );
  }

  // ── Non-map routes: classic full bottom nav bar ───────────────────────────
  return (
    <>
      <nav
        aria-label="Main navigation"
        style={{ zIndex: Z_NAV }}
        className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border pb-safe shadow-[0_-4px_30px_rgba(0,0,0,0.4)]"
      >
        {/* ── Nav tabs ─────────────────────────────────────────────────────── */}
        <div className="flex items-end justify-around px-2 pt-2 pb-2">
          {tabs.map((tab) => {
            const href = tab.path === "__active_job__" ? activeJobHref : tab.path;
            const isActive = tab.path === "__active_job__"
              ? !!activeRequestId && location.startsWith(`/request/${activeRequestId}`)
              : tab.path === "/"
                ? location === "/"
                : location.startsWith(tab.path);

            if (tab.center) {
              return (
                <Link
                  key={tab.path}
                  href={href}
                  aria-label={t(tab.labelKey, "Active job")}
                >
                  <div className="flex flex-col items-center -mt-5">
                    <div
                      className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all relative ${
                        isActive
                          ? "bg-primary shadow-[0_0_20px_rgba(0,212,255,0.5)]"
                          : "bg-primary/80 hover:bg-primary"
                      }`}
                      aria-hidden="true"
                    >
                      <tab.icon className="w-7 h-7 text-primary-foreground" />
                      {/* Pulse when there's a live job to jump back to */}
                      {tab.path === "__active_job__" && !!activeRequestId && !isActive && (
                        <span className={`absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border border-background${suppressed ? "" : " animate-pulse"}`} />
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider mt-1 text-muted-foreground">
                      {t(tab.labelKey)}
                    </span>
                  </div>
                </Link>
              );
            }

            return (
              <Link
                key={tab.path}
                href={href}
                aria-label={`${t(tab.labelKey)}${isActive ? " (current page)" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <div className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all min-w-[52px] relative">
                  <tab.icon
                    aria-hidden="true"
                    className={`w-5 h-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {t(tab.labelKey)}
                  </span>
                  {isActive && <div aria-hidden="true" className="w-1 h-1 rounded-full bg-primary" />}
                </div>
              </Link>
            );
          })}
        </div>

        {/* Notification bell — floats above the nav bar */}
        <button
          onClick={openNotifications}
          aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          className="absolute -top-4 right-3 w-9 h-9 rounded-full bg-card border border-border flex items-center justify-center shadow-lg active:scale-95 transition-transform"
        >
          <Bell className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          {unreadCount > 0 && (
            <AnimatePresence>
              <motion.span
                key="notif-badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center bg-destructive rounded-full shadow-[0_0_8px_rgba(255,50,50,0.6)] border border-background"
              >
                <span className="text-[9px] font-black text-white leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              </motion.span>
            </AnimatePresence>
          )}
        </button>
      </nav>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} notifications={notifications} />
    </>
  );
}
