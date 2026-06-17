import { motion, AnimatePresence } from "framer-motion";
import { X, Bell, AlertTriangle, Heart, CheckCircle, MapPin, DollarSign, Calendar, Users, MessageCircle } from "lucide-react";
import { Button } from "./ui/button";

export interface LiveNotification {
  id: string;
  type: "emergency" | "new_request" | "completed" | "pledge" | "nearby" | "helper_accepted" | "pledge_scheduled" | "chat";
  title: string;
  body: string;
  time: Date;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: LiveNotification[];
}

function notifIcon(type: LiveNotification["type"]) {
  switch (type) {
    case "emergency": return { Icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" };
    case "completed": return { Icon: CheckCircle, color: "text-green-400", bg: "bg-green-400/10" };
    case "pledge": return { Icon: DollarSign, color: "text-primary", bg: "bg-primary/10" };
    case "nearby": return { Icon: MapPin, color: "text-yellow-400", bg: "bg-yellow-400/10" };
    case "helper_accepted": return { Icon: Users, color: "text-green-400", bg: "bg-green-400/10" };
    case "pledge_scheduled": return { Icon: Calendar, color: "text-purple-400", bg: "bg-purple-400/10" };
    case "chat": return { Icon: MessageCircle, color: "text-primary", bg: "bg-primary/10" };
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

export function NotificationsDrawer({ open, onClose, notifications }: Props) {
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
