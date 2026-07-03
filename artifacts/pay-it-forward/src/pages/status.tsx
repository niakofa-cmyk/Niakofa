/**
 * Public status page — no auth required, no sensitive data.
 * Shows whether Niakofa's core services are up so users outside their
 * normal region (or on a slow connection) know the platform's state.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Loader2, RefreshCw, MessageCircle, Map, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Check {
  name: string;
  ok: boolean;
  latency_ms?: number;
}

interface StatusResponse {
  status: "operational" | "degraded";
  checks: Check[];
  commit: string;
  started_at: string;
  timestamp: string;
}

const SERVICE_META: Record<string, { label: string; icon: React.ElementType; description: string }> = {
  database:  { label: "Community Data",    icon: Database,     description: "Requests, helpers, and your profile" },
  nia_ai:    { label: "Nia AI",            icon: MessageCircle, description: "Nia's chat and voice assistance" },
  map:       { label: "Live Map",          icon: Map,          description: "Request map, helper locations, navigation" },
};

function ServiceRow({ check }: { check: Check }) {
  const meta = SERVICE_META[check.name] ?? { label: check.name, icon: Database, description: "" };
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-4 py-4 border-b border-border last:border-0">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${check.ok ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
        <Icon className={`w-5 h-5 ${check.ok ? "text-emerald-400" : "text-red-400"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{meta.label}</p>
        {meta.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {check.ok
          ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          : <AlertCircle  className="w-5 h-5 text-red-400" />
        }
        <span className={`text-xs font-black ${check.ok ? "text-emerald-400" : "text-red-400"}`}>
          {check.ok ? "Online" : "Offline"}
        </span>
      </div>
    </div>
  );
}

export default function StatusPage() {
  const [data,    setData]    = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/status");
      if (!res.ok && res.status !== 503) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastFetch(new Date());
    } catch (e) {
      setError("Could not reach Niakofa servers. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 60s
    const t = setInterval(fetchStatus, 60_000);
    return () => clearInterval(t);
  }, []);

  const isOperational = data?.status === "operational";

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <div className="px-6 pt-14 pb-6 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
            loading ? "bg-muted" : isOperational ? "bg-emerald-500/15" : "bg-red-500/15"
          }`}
        >
          {loading
            ? <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            : isOperational
              ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              : <AlertCircle  className="w-8 h-8 text-red-400" />
          }
        </motion.div>

        <h1 className="text-2xl font-black text-foreground">
          {loading ? "Checking…" : isOperational ? "All Systems Online" : "Some Services Degraded"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {loading
            ? "Fetching live status from Niakofa servers"
            : isOperational
              ? "Niakofa is fully operational globally"
              : "We're aware and working on it — check back shortly"
          }
        </p>

        {/* Overall badge */}
        {data && !loading && (
          <div className={`inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full text-xs font-black ${
            isOperational
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-red-500/15 text-red-400"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isOperational ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
            {isOperational ? "Operational" : "Degraded"}
          </div>
        )}
      </div>

      {/* Service list */}
      <div className="mx-4 bg-card border border-border rounded-2xl px-4 overflow-hidden">
        {error ? (
          <div className="py-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <p className="text-sm text-red-400 font-bold">Connection Failed</p>
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : loading && !data ? (
          <div className="py-8 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        ) : data ? (
          data.checks.map(check => <ServiceRow key={check.name} check={check} />)
        ) : null}
      </div>

      {/* Refresh + meta */}
      <div className="px-4 mt-6 space-y-3">
        <Button
          variant="outline"
          onClick={fetchStatus}
          disabled={loading}
          className="w-full gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? "Refreshing…" : "Refresh Status"}
        </Button>

        {lastFetch && (
          <p className="text-center text-xs text-muted-foreground">
            Last checked: {lastFetch.toLocaleTimeString()} · auto-refreshes every 60s
          </p>
        )}

        {data?.commit && data.commit !== "unknown" && (
          <p className="text-center text-xs text-muted-foreground">
            Version: <span className="font-mono">{data.commit}</span>
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto px-6 py-8 text-center space-y-3">
        <p className="text-xs text-muted-foreground">
          Having trouble? Email{" "}
          <a href="mailto:support@niakofa.app" className="text-primary underline underline-offset-2">
            support@niakofa.app
          </a>
        </p>
        <a
          href="/login"
          className="block text-sm font-black text-primary active:opacity-70"
        >
          Back to Niakofa →
        </a>
      </div>
    </div>
  );
}
