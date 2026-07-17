/**
 * AdminLiveBanner — persistent real-time status bar for admins.
 *
 * Shows pending-review counts (accounts, helper apps, hardships) that
 * need admin attention. Polls /api/admin/pending-summary every 30 seconds
 * and also updates immediately when the WS pushes a new_account_pending or
 * new_helper_application event. Only rendered when currentUser.is_admin=true.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Users, UserCheck, LifeBuoy, RefreshCw, ChevronRight,
  CheckCircle2, AlertTriangle, Wifi, WifiOff, Activity, Siren, X,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { wsSubscribe, wsIsConnected } from "@/lib/wsClient";

// A live SOS trigger during an in-person help session. Rendered as its own
// unmissable, sticky alert row above the normal pending-review banner —
// this is the one thing on the admin dashboard that must be actioned within
// seconds, not the next time someone glances at a badge count.
interface SosAlert {
  request_id: number;
  request_title?: string;
  triggered_by_name?: string;
  role?: string;
  triggered_at: string;
}

interface PendingSummary {
  pending_accounts: number;
  pending_helper_apps: number;
  pending_hardships: number;
  pending_reports: number;
  total_action_items: number;
  refreshed_at: string;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export function AdminLiveBanner({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { currentUser } = useAppContext();
  const [summary, setSummary] = useState<PendingSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [flash, setFlash] = useState<string | null>(null); // new-event label
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dismissSos = useCallback((requestId: number) => {
    setSosAlerts(prev => prev.filter(a => a.request_id !== requestId));
  }, []);

  const fetchSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(false);
    try {
      const token = getToken();
      const res = await fetch("/api/admin/pending-summary", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout ? AbortSignal.timeout(8_000) : undefined,
      });
      if (!res.ok) throw new Error("fetch failed");
      const data: PendingSummary = await res.json();
      setSummary(data);
      setLastRefreshed(new Date());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + 30-second polling
  useEffect(() => {
    if (!currentUser?.is_admin) return;
    fetchSummary();
    intervalRef.current = setInterval(() => fetchSummary(true), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentUser?.is_admin, fetchSummary]);

  // WS: update badge and flash when a new application arrives in real time
  useEffect(() => {
    if (!currentUser?.is_admin) return;

    const handleWs = (event: { type: string; payload: unknown }) => {
      if (event.type === "connected" || event.type === "pong") {
        setWsConnected(true);
        return;
      }
      if (event.type === "new_account_pending") {
        const p = event.payload as { name?: string; account_type?: string };
        setFlash(`New ${p.account_type ?? "account"} application from ${p.name ?? "someone"}`);
        setTimeout(() => setFlash(null), 6000);
        fetchSummary(true);
      }
      if (event.type === "new_helper_application") {
        const p = event.payload as { name?: string };
        setFlash(`New helper application from ${p.name ?? "someone"}`);
        setTimeout(() => setFlash(null), 6000);
        fetchSummary(true);
      }
      if (event.type === "admin_summary_update") {
        fetchSummary(true);
      }
      if (event.type === "safety_sos") {
        const p = event.payload as {
          request_id?: number; request_title?: string;
          triggered_by_name?: string; role?: string; triggered_at?: string;
          message?: string;
        };
        // The admin broadcast carries request_title/triggered_by_name; the
        // participant-facing copy of this event only carries `message` —
        // ignore that shape here so we don't render a malformed alert card.
        if (typeof p.request_id === "number") {
          setSosAlerts(prev => [
            { request_id: p.request_id!, request_title: p.request_title, triggered_by_name: p.triggered_by_name, role: p.role, triggered_at: p.triggered_at ?? new Date().toISOString() },
            ...prev.filter(a => a.request_id !== p.request_id),
          ]);
        }
      }
    };

    const unsub = wsSubscribe(handleWs as Parameters<typeof wsSubscribe>[0]);
    // Reflect initial WS state
    setWsConnected(wsIsConnected());
    // Poll connectivity every 5s — wsClient has no disconnect event we can
    // subscribe to, so we check readyState on a short interval.
    const connPoll = setInterval(() => setWsConnected(wsIsConnected()), 5_000);
    return () => { unsub(); clearInterval(connPoll); };
  }, [currentUser?.is_admin, fetchSummary]);

  if (!currentUser?.is_admin) return null;

  const hasItems = (summary?.total_action_items ?? 0) > 0;
  const items: { label: string; count: number; tab: string; icon: typeof Users; color: string }[] = [
    {
      label: "Account Reviews",
      count: summary?.pending_accounts ?? 0,
      tab: "orgs",
      icon: Users,
      color: "text-yellow-400",
    },
    {
      label: "Helper Apps",
      count: summary?.pending_helper_apps ?? 0,
      tab: "helpers",
      icon: UserCheck,
      color: "text-cyan-400",
    },
    {
      label: "Hardships",
      count: summary?.pending_hardships ?? 0,
      tab: "system",
      icon: LifeBuoy,
      color: "text-orange-400",
    },
  ].filter(i => i.count > 0);

  return (
    <div>
      {/* Live SOS alerts — sticky, unmissable, above everything else. An SOS
          during an in-person help session must be actioned within seconds,
          not discovered the next time an admin happens to look at a tab. */}
      <AnimatePresence>
        {sosAlerts.map(alert => (
          <motion.div
            key={alert.request_id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full bg-red-600 text-white"
          >
            <div className="px-4 py-2.5 flex items-center gap-3">
              <Siren className="w-5 h-5 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm">
                  SOS — {alert.triggered_by_name ?? "A participant"}
                  {alert.role ? ` (${alert.role})` : ""} on request #{alert.request_id}
                  {alert.request_title ? ` "${alert.request_title}"` : ""}
                </div>
                <div className="text-[11px] text-red-100">
                  Triggered {new Date(alert.triggered_at).toLocaleTimeString()} — contact the participant or emergency services now.
                </div>
              </div>
              <button
                onClick={() => onNavigate?.("reports")}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 active:bg-white/30 transition-colors text-xs font-bold"
              >
                View
              </button>
              <button
                onClick={() => dismissSos(alert.request_id)}
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-white/15 transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <div className={`w-full border-b transition-colors duration-500 ${
        hasItems
          ? "border-yellow-500/30 bg-yellow-500/5"
          : "border-border bg-card/50"
      }`}>
      <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
        {/* Status dot */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className={`w-2 h-2 rounded-full ${
            error ? "bg-red-500" :
            wsConnected ? (hasItems ? "bg-yellow-400 animate-pulse" : "bg-green-500") :
            "bg-muted-foreground"
          }`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {error ? "Offline" : wsConnected ? "Live" : "Connecting"}
          </span>
        </div>

        {/* Action items */}
        {items.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {items.map(item => (
              <button
                key={item.tab}
                onClick={() => onNavigate?.(item.tab)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-card border border-border hover:border-primary/50 active:bg-muted transition-all text-xs font-bold"
              >
                <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                <span className={`tabular-nums ${item.color}`}>{item.count}</span>
                <span className="text-muted-foreground">{item.label}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            <span>No pending reviews</span>
          </div>
        )}

        {/* Flash notification (new application via WS) */}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/30 text-xs font-bold text-primary"
            >
              <Bell className="w-3.5 h-3.5 animate-bounce" />
              {flash}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual refresh + timestamp */}
        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {lastRefreshed && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => fetchSummary()}
            disabled={loading}
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground active:text-foreground transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* System connectivity row */}
      <div className="px-4 pb-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {wsConnected ? <Wifi className="w-3 h-3 text-green-500" /> : <WifiOff className="w-3 h-3 text-red-400" />}
          WS {wsConnected ? "connected" : "offline"}
        </span>
        <span className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          Poll every 30s
        </span>
        {summary && (
          <span className="flex items-center gap-1">
            <AlertTriangle className={`w-3 h-3 ${hasItems ? "text-yellow-400" : "text-muted-foreground"}`} />
            {summary.total_action_items} action{summary.total_action_items !== 1 ? "s" : ""} pending
          </span>
        )}
      </div>
      </div>
    </div>
  );
}
