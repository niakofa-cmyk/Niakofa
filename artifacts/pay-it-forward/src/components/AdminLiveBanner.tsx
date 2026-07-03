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
  CheckCircle2, AlertTriangle, Wifi, WifiOff, Activity,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { wsSubscribe, wsIsConnected } from "@/lib/wsClient";

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
  );
}
