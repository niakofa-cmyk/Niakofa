import { motion, AnimatePresence } from "framer-motion";
import {
  X, Bell, BellOff, ShieldAlert, CheckCircle2,
  Heart, MapPin, DollarSign, Calendar, Users, MessageCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LiveNotification {
  id: string;
  type:
    | "emergency"
    | "new_request"
    | "completed"
    | "pledge"
    | "nearby"
    | "helper_accepted"
    | "pledge_scheduled"
    | "chat";
  title: string;
  body: string;
  time: Date;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(d: Date): string {
  const secs = (Date.now() - d.getTime()) / 1000;
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Per-type visual config ─────────────────────────────────────────────────────

type TypeCfg = {
  Icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  ringBg: string;
  cardBorder: string;
};

const TYPE_CFG: Record<LiveNotification["type"], TypeCfg> = {
  emergency:        { Icon: ShieldAlert,    iconColor: "text-destructive",  ringBg: "bg-destructive/15",   cardBorder: "border-destructive/25" },
  new_request:      { Icon: MapPin,         iconColor: "text-primary",      ringBg: "bg-primary/10",       cardBorder: "border-primary/20"     },
  completed:        { Icon: CheckCircle2,   iconColor: "text-green-400",    ringBg: "bg-green-500/10",     cardBorder: "border-green-500/20"   },
  pledge:           { Icon: DollarSign,     iconColor: "text-primary",      ringBg: "bg-primary/10",       cardBorder: "border-primary/20"     },
  nearby:           { Icon: MapPin,         iconColor: "text-primary",      ringBg: "bg-primary/10",       cardBorder: "border-primary/20"     },
  helper_accepted:  { Icon: Users,          iconColor: "text-green-400",    ringBg: "bg-green-500/10",     cardBorder: "border-green-500/20"   },
  pledge_scheduled: { Icon: Calendar,       iconColor: "text-purple-400",   ringBg: "bg-purple-500/10",    cardBorder: "border-purple-500/20"  },
  chat:             { Icon: MessageCircle,  iconColor: "text-primary",      ringBg: "bg-primary/10",       cardBorder: "border-primary/20"     },
};

const fallbackCfg: TypeCfg = {
  Icon: Heart,
  iconColor: "text-primary",
  ringBg: "bg-primary/10",
  cardBorder: "border-primary/20",
};

// ── NotificationItem ───────────────────────────────────────────────────────────

function NotificationItem({ n, index }: { n: LiveNotification; index: number }) {
  const cfg = TYPE_CFG[n.type] ?? fallbackCfg;

  return (
    <motion.div
      key={n.id}
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -40, opacity: 0 }}
      transition={{ type: "spring", damping: 24, stiffness: 260, delay: Math.min(index * 0.03, 0.25) }}
      className={`flex items-start gap-3 p-3.5 rounded-2xl border ${cfg.ringBg} ${cfg.cardBorder}`}
    >
      <div className={`w-9 h-9 rounded-full ${cfg.ringBg} border ${cfg.cardBorder} flex items-center justify-center shrink-0 mt-0.5`}>
        <cfg.Icon className={`w-[18px] h-[18px] ${cfg.iconColor}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-sm font-black leading-tight ${cfg.iconColor}`}>{n.title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{n.body}</div>
        <div className="text-[10px] text-muted-foreground/50 mt-1 tabular-nums">{timeAgo(n.time)}</div>
      </div>
    </motion.div>
  );
}

// ── NotificationsDrawer ────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: LiveNotification[];
}

export function NotificationsDrawer({ open, onClose, notifications }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl shadow-[0_-8px_40px_rgba(0,0,0,0.5)] flex flex-col"
            style={{ maxHeight: "82dvh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-1 shrink-0 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-black text-base uppercase tracking-widest leading-none">Alerts</h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {notifications.length === 0
                      ? "No alerts yet"
                      : `${notifications.length} recent alert${notifications.length !== 1 ? "s" : ""}`}
                  </p>
                </div>
                {notifications.length > 0 && (
                  <span className="text-[10px] bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-black ml-1">
                    {notifications.length > 99 ? "99+" : notifications.length}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                aria-label="Close alerts"
                className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Notification list */}
            <div
              className="overflow-y-auto flex-1 px-4 pt-3 space-y-2.5"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-1">
                    <BellOff className="w-7 h-7 opacity-30" />
                  </div>
                  <p className="text-sm font-semibold">You're all caught up</p>
                  <p className="text-xs text-muted-foreground/60 text-center max-w-[200px] leading-relaxed">
                    New requests, payments, and status changes will appear here
                  </p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map((n, i) => (
                    <NotificationItem key={n.id} n={n} index={i} />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
