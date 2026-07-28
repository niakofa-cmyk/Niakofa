/**
 * BackgroundCheckAdmin — Admin component for managing helper background checks.
 *
 * Shows helpers who have not started, failed, or are pending a background check.
 * Checkr is integrated (see POST /background-checks/webhook, HMAC-signature
 * verified) and updates status automatically. This panel is the audit view +
 * manual override safety valve for edge cases the webhook doesn't cover
 * (e.g. a helper who needs a status corrected, or Checkr is briefly down).
 */

import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { getToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const BASE = (typeof import.meta !== "undefined" ? import.meta.env?.BASE_URL ?? "/" : "/").replace(/\/$/, "");

type BgCheckStatus = "not_started" | "pending" | "passed" | "failed";

interface HelperWithBgCheck {
  id: number;
  name: string;
  email: string;
  background_check_status: BgCheckStatus | null;
  background_check_completed_at: string | null;
  help_count: number;
  is_helper: boolean;
}

const STATUS_CONFIG: Record<BgCheckStatus, { label: string; color: string; icon: typeof Shield }> = {
  not_started: { label: "Not Started",  color: "text-muted-foreground",  icon: Clock },
  pending:     { label: "In Progress",  color: "text-yellow-400",         icon: Clock },
  passed:      { label: "Cleared",      color: "text-green-400",          icon: CheckCircle2 },
  failed:      { label: "Not Cleared",  color: "text-destructive",        icon: XCircle },
};

export function BackgroundCheckAdmin() {
  const [helpers, setHelpers] = useState<HelperWithBgCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [overriding, setOverriding] = useState<number | null>(null);
  const [filter, setFilter] = useState<BgCheckStatus | "all">("all");

  const load = useCallback(() => {
    setLoading(true);
    const tok = getToken();
    fetch(`${BASE}/api/users?limit=500`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : { users: [] })
      .then((data: { users?: HelperWithBgCheck[] }) => {
        const users = Array.isArray(data.users) ? data.users : [];
        // Show only helpers (or those who applied to be helpers)
        setHelpers(users.filter(u => u.is_helper || (u.help_count ?? 0) > 0));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const override = async (userId: number, status: BgCheckStatus) => {
    setOverriding(userId);
    const tok = getToken();
    try {
      const res = await fetch(`${BASE}/api/admin/users/${userId}/background-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      setHelpers(prev => prev.map(h =>
        h.id === userId
          ? { ...h, background_check_status: status, background_check_completed_at: status !== "pending" && status !== "not_started" ? new Date().toISOString() : null }
          : h
      ));
      toast({ title: `Background check set to "${STATUS_CONFIG[status].label}" ✓` });
    } catch {
      toast({ title: "Override failed", variant: "destructive" });
    } finally {
      setOverriding(null);
    }
  };

  const filtered = helpers.filter(h => {
    const status = (h.background_check_status ?? "not_started") as BgCheckStatus;
    return filter === "all" || status === filter;
  });

  const counts = {
    all: helpers.length,
    not_started: helpers.filter(h => !h.background_check_status || h.background_check_status === "not_started").length,
    pending: helpers.filter(h => h.background_check_status === "pending").length,
    passed: helpers.filter(h => h.background_check_status === "passed").length,
    failed: helpers.filter(h => h.background_check_status === "failed").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          <span className="text-xs font-black uppercase tracking-wider text-primary">Background Checks</span>
        </div>
        <button
          onClick={load}
          className="w-8 h-8 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground active:scale-95"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {(["all", "not_started", "pending", "failed", "passed"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-colors ${
              filter === s
                ? "bg-primary/20 border-primary/60 text-primary"
                : "bg-card border-border text-muted-foreground"
            }`}
          >
            {s === "all" ? "All" : STATUS_CONFIG[s].label} ({counts[s]})
          </button>
        ))}
      </div>

      {counts.not_started > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300 leading-relaxed">
            <strong>{counts.not_started}</strong> helper{counts.not_started !== 1 ? "s have" : " has"} not started a background check.
            {" "}Set them to "Passed" to manually clear, or "Pending" to indicate a check is in process.
            {" "}Once a helper completes Checkr's flow, status updates automatically via webhook.
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-xs">Loading helpers…</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-xs">No helpers match this filter</div>
      )}

      <div className="space-y-2">
        {filtered.map(helper => {
          const status = (helper.background_check_status ?? "not_started") as BgCheckStatus;
          const cfg = STATUS_CONFIG[status];
          const IconComp = cfg.icon;

          return (
            <div key={helper.id} className="bg-card border border-border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-black text-primary text-sm shrink-0">
                  {helper.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{helper.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{helper.email}</div>
                </div>
                <div className={`flex items-center gap-1 shrink-0 ${cfg.color}`}>
                  <IconComp className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-bold">{cfg.label}</span>
                </div>
              </div>

              {/* Override buttons */}
              <div className="flex gap-1.5 flex-wrap">
                {(["not_started", "pending", "passed", "failed"] as BgCheckStatus[])
                  .filter(s => s !== status)
                  .map(s => {
                    const sCfg = STATUS_CONFIG[s];
                    return (
                      <button
                        key={s}
                        onClick={() => override(helper.id, s)}
                        disabled={overriding === helper.id}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 ${
                          s === "passed" ? "bg-green-500/10 border-green-500/30 text-green-400" :
                          s === "failed" ? "bg-destructive/10 border-destructive/30 text-destructive" :
                          "bg-card border-border text-muted-foreground"
                        }`}
                      >
                        {overriding === helper.id ? "…" : `Set ${sCfg.label}`}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
