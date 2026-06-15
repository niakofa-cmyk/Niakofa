import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, AlertTriangle, Heart, CheckCircle, MapPin, DollarSign, Calendar, Users } from "lucide-react";
import { Button } from "./ui/button";
import { useWebSocket } from "@/lib/useWebSocket";
import type { HelpRequest } from "@workspace/api-client-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface LiveNotification {
  id: string;
  type: "emergency" | "new_request" | "completed" | "pledge" | "nearby" | "helper_accepted" | "pledge_scheduled";
  title: string;
  body: string;
  time: Date;
}

function notifIcon(type: LiveNotification["type"]) {
  switch (type) {
    case "emergency": return { Icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" };
    case "completed": return { Icon: CheckCircle, color: "text-green-400", bg: "bg-green-400/10" };
    case "pledge": return { Icon: DollarSign, color: "text-primary", bg: "bg-primary/10" };
    case "nearby": return { Icon: MapPin, color: "text-yellow-400", bg: "bg-yellow-400/10" };
    case "helper_accepted": return { Icon: Users, color: "text-green-400", bg: "bg-green-400/10" };
    case "pledge_scheduled": return { Icon: Calendar, color: "text-purple-400", bg: "bg-purple-400/10" };
    default: return { Icon: Heart, color: "text-primary", bg: "bg-primary/10" };
  }
}

function timeAgo(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return d.toLocaleDateString();
}

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

export function NotificationsDrawer({ open, onClose }: Props) {
  const [notifications, setNotifications] = useState<LiveNotification[]>(SEED_NOTIFICATIONS);
  const seenIds = useRef(new Set<string>());

  const addNotif = (n: LiveNotification) => {
    if (seenIds.current.has(n.id)) return;
    seenIds.current.add(n.id);
    setNotifications(prev => [n, ...prev].slice(0, 50));
  };

  useWebSocket((event) => {
    if (event.type === "new_request") {
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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 26, stiffness: 220 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between p-5 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-black">Notifications</h2>
                {notifications.length > 0 && (
                  <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded-full font-black">
                    {notifications.length}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="overflow-y-auto pb-safe px-4 pb-6 space-y-3">
              {notifications.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No notifications yet — stay online to receive real-time alerts.
                </div>
              )}
              <AnimatePresence initial={false}>
                {notifications.map((n) => {
                  const { Icon, color, bg } = notifIcon(n.type);
                  return (
                    <motion.div
                      key={n.id}
                      initial={{ x: 60, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -60, opacity: 0 }}
                      transition={{ type: "spring", damping: 22 }}
                      className="flex items-start gap-3 p-3 rounded-2xl bg-background/60 border border-border"
                    >
                      <div className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm">{n.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{n.body}</div>
                        <div className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.time)}</div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
