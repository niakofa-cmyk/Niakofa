import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bell, BellOff, BookOpen, CalendarDays, Check, CheckCircle2, CircleDollarSign,
  Heart, MapPin, MessageCircle, Radio, RefreshCw, ShieldAlert, Share2, ShoppingBag,
  Users, X,
} from "lucide-react";
import { useCommunityNotifications, type LiveNotification } from "@/components/community/useCommunityNotifications";
export type { LiveNotification } from "@/components/community/useCommunityNotifications";

interface Props {
  open: boolean;
  onClose: () => void;
}

const notificationIcons: Record<LiveNotification["type"], typeof Bell> = {
  emergency: ShieldAlert, new_request: MapPin, completed: CheckCircle2, pledge: CircleDollarSign,
  nearby: MapPin, helper_accepted: Users, pledge_scheduled: CalendarDays, chat: MessageCircle,
  call: MessageCircle, hub_message: Users, story: Radio, story_reaction: Heart, story_share: Share2,
  story_mention: Users, community: Users, exchange: ShoppingBag, system: Bell, circle_went_live: Radio,
};

function timeAgo(date: Date) {
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationRow({ item, onOpen, onRead, index = 0 }: {
  item: LiveNotification; onOpen: (item: LiveNotification) => void; onRead: (id: string) => void; index?: number;
}) {
  const reduceMotion = useReducedMotion();
  const Icon = notificationIcons[item.type] ?? Bell;
  const unread = !item.read_at;
  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -5 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.15) }}
      className={`nk-notification-row ${unread ? "is-unread" : ""}`}
      data-testid={`notification-${item.id}`}
    >
      <span className={`nk-notification-glyph nk-notification-kind-${item.type}`}>
        <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
      </span>
      <button type="button" className="nk-notification-copy" onClick={() => onOpen(item)}
        aria-label={`${item.title}. ${item.body}${item.actionUrl ? ". Open notification" : ""}`}>
        <span className="nk-notification-title">{item.title}</span>
        <span className="nk-notification-body">{item.body}</span>
        <span className="nk-notification-time">{timeAgo(item.time)}</span>
      </button>
      {unread && <button type="button" className="nk-notification-read" aria-label={`Mark ${item.title} as read`}
        onClick={() => onRead(item.id)}><Check size={16} aria-hidden="true" /></button>}
    </motion.article>
  );
}

export function NotificationsDrawer({ open, onClose }: Props) {
  const reduceMotion = useReducedMotion();
  const [, setLocation] = useLocation();
  const { notifications, unreadCount, isLoading, isError, error, refetch, markRead, markAllRead,
    isMarkingAllRead, markReadError, markAllReadError } = useCommunityNotifications();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const restoreTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      restoreTarget?.focus();
    };
  }, [open]);

  const openNotification = (item: LiveNotification) => {
    if (!item.read_at) void markRead(item.id);
    if (item.actionUrl) {
      onClose();
      setLocation(item.actionUrl);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="nk-drawer-layer">
          <motion.button type="button" className="nk-drawer-scrim" aria-label="Close notifications"
            initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }} onClick={onClose} />
          <motion.section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="nk-drawer-title"
            className="nk-notification-drawer" initial={reduceMotion ? false : { opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 22 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", damping: 27, stiffness: 260 }}>
            <div className="nk-drawer-grip" aria-hidden="true" />
            <header className="nk-notification-drawer-head">
              <div className="nk-notification-heading">
                <span className="nk-notification-heading-icon"><Bell size={17} /></span>
                <div><p className="nk-eyebrow">Your neighborhood, in the loop</p>
                  <h2 id="nk-drawer-title">Notifications</h2></div>
                {unreadCount > 0 && <span className="nk-unread-pill">{unreadCount > 99 ? "99+" : unreadCount} new</span>}
              </div>
              <div className="nk-drawer-tools">
                {unreadCount > 0 && <button type="button" className="nk-text-action" disabled={isMarkingAllRead}
                  onClick={() => void markAllRead()}>Mark all read</button>}
                <button ref={closeRef} type="button" className="nk-close-button" aria-label="Close notifications"
                  onClick={onClose}><X size={19} /></button>
              </div>
            </header>
            {(markReadError || markAllReadError) && <p className="nk-inline-error" role="alert">That change did not save. Your list was restored; please try again.</p>}
            <div className="nk-notification-scroll">
              {isLoading && <div className="nk-notification-skeleton" aria-label="Loading notifications">
                {[0, 1, 2].map((n) => <div className="nk-skeleton-row" key={n}><i /><span><b /><b /></span></div>)}
              </div>}
              {isError && <div className="nk-notification-state" role="alert"><BellOff size={25} />
                <h3>Notifications are taking a moment</h3><p>{error instanceof Error ? error.message : "We couldn't reach your notifications."}</p>
                <button type="button" className="nk-retry-button" onClick={() => void refetch()}><RefreshCw size={15} /> Try again</button>
              </div>}
              {!isLoading && !isError && notifications.length === 0 && <div className="nk-notification-state">
                <span className="nk-caught-up-mark"><BellOff size={25} /></span>
                <h3>It's quiet for now</h3><p>Replies, shared Moments and neighborhood updates will find their way here.</p>
              </div>}
              {!isLoading && !isError && <AnimatePresence initial={false}>
                {notifications.map((item, index) => <NotificationRow key={item.id} item={item} index={index}
                  onOpen={openNotification} onRead={(id) => void markRead(id)} />)}
              </AnimatePresence>}
            </div>
            <button type="button" className="nk-view-all" onClick={() => { onClose(); setLocation("/notifications"); }}>
              Open notification history <span aria-hidden="true">→</span>
            </button>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}