import { useLocation, Link } from "wouter";
import { Map, Users, Plus, Wallet, User, Bell, LayoutDashboard } from "lucide-react";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { NotificationsDrawer, type LiveNotification } from "./NotificationsDrawer";
import { useWebSocket } from "@/lib/useWebSocket";
import { useAppContext } from "@/lib/AppContext";
import type { HelpRequest } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

type Tab = { path: string; icon: React.ElementType; labelKey: string; center?: boolean };

// Base tabs always shown
const BASE_TABS: Tab[] = [
  { path: "/",            icon: Map,              labelKey: "nav.map"       },
  { path: "/community",   icon: Users,            labelKey: "nav.community" },
  { path: "/request/new", icon: Plus,             labelKey: "request.new",  center: true },
  { path: "/wallet",      icon: Wallet,           labelKey: "nav.wallet"    },
  { path: "/profile",     icon: User,             labelKey: "nav.profile"   },
];

// When helper mode is active, swap Map tab for Helper Dashboard
const HELPER_TABS: Tab[] = [
  { path: "/helper-dashboard", icon: LayoutDashboard, labelKey: "nav.helper_dashboard" },
  { path: "/community",        icon: Users,           labelKey: "nav.community" },
  { path: "/request/new",      icon: Plus,            labelKey: "request.new",  center: true },
  { path: "/wallet",           icon: Wallet,          labelKey: "nav.wallet"    },
  { path: "/profile",          icon: User,            labelKey: "nav.profile"   },
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
  const { helperModeActive } = useAppContext();
  const tabs = helperModeActive ? HELPER_TABS : BASE_TABS;
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
    }
  });

  const openNotifications = () => {
    setNotifOpen(true);
    setUnreadCount(0);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border pb-safe shadow-[0_-4px_30px_rgba(0,0,0,0.4)]">
        <div className="flex items-end justify-around px-2 pt-2 pb-2">

          {tabs.map((tab) => {
            const isActive = tab.path === "/"
              ? location === "/"
              : location.startsWith(tab.path);

            if (tab.center) {
              return (
                <Link key={tab.path} href={tab.path}>
                  <div className="flex flex-col items-center -mt-5">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-all ${
                      isActive
                        ? "bg-primary shadow-[0_0_20px_rgba(0,212,255,0.5)]"
                        : "bg-primary/80 hover:bg-primary"
                    }`}>
                      <tab.icon className="w-7 h-7 text-primary-foreground" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider mt-1 text-muted-foreground">{t(tab.labelKey)}</span>
                  </div>
                </Link>
              );
            }

            return (
              <Link key={tab.path} href={tab.path}>
                <div className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all min-w-[52px]">
                  <tab.icon className={`w-5 h-5 transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {t(tab.labelKey)}
                  </span>
                  {isActive && <div className="w-1 h-1 rounded-full bg-primary" />}
                </div>
              </Link>
            );
          })}

          {/* Alerts bell — unread count badge, clears on open */}
          <button
            onClick={openNotifications}
            className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl transition-all min-w-[52px] relative active:scale-95"
          >
            <div className="relative">
              <Bell className={`w-5 h-5 transition-colors ${unreadCount > 0 ? "text-primary" : "text-muted-foreground"}`} />
              <AnimatePresence>
                {unreadCount > 0 && (
                  <motion.span
                    key="badge"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center bg-destructive rounded-full shadow-[0_0_8px_rgba(255,50,50,0.6)] border border-background"
                  >
                    <span className="text-[9px] font-black text-white leading-none">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${unreadCount > 0 ? "text-primary" : "text-muted-foreground"}`}>
              {t("common.alerts", "Alerts")}
            </span>
          </button>

        </div>
      </nav>

      <NotificationsDrawer open={notifOpen} onClose={() => setNotifOpen(false)} notifications={notifications} />
    </>
  );
}
