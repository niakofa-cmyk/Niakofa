import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Shield, AlertCircle, CheckCircle2, Clock, X, ChevronLeft,
  Eye, Flag, User as UserIcon, RefreshCw, ExternalLink,
  Users, Search, Ban, AlertTriangle, Star, Bot, Power, Timer,
  BarChart2, TrendingUp, Activity, Zap, MessageSquare, Package,
  ChevronDown, ChevronUp, CheckSquare, Square, HandHeart, DollarSign,
  LineChart, FileText, Gavel, Sparkles, RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── Helpers ───────────────────────────────────────────────────────────────────
interface Report {
  id: number;
  reporter_id: number;
  reported_user_id: number | null;
  reported_request_id: number | null;
  type: string;
  description: string;
  status: string;
  admin_notes: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  reporter_name?: string | null;
  reporter_email?: string | null;
  reported_user_name?: string | null;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  is_helper: boolean;
  trust_score: number | null;
  help_count: number;
  created_at: string;
  is_suspended?: boolean;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:              { label: "Pending",       color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  under_review:         { label: "Reviewing",     color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  resolved_dismissed:   { label: "Dismissed",     color: "bg-muted text-muted-foreground border-border" },
  resolved_warned:      { label: "Warned",        color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  resolved_banned:      { label: "Banned",        color: "bg-destructive/15 text-destructive border-destructive/30" },
};

const TYPE_LABELS: Record<string, string> = {
  suspicious_request: "Suspicious Request",
  suspicious_helper:  "Suspicious Helper",
  fraud:              "Fraud",
  harassment:         "Harassment",
  fake_profile:       "Fake Profile",
  dangerous_behavior: "Dangerous Behavior",
  spam:               "Spam",
  other:              "Other",
};

const STATUS_FILTERS = ["all", "pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
const SESSION_DURATION_MS  = 15 * 60 * 1000;
const BUMP_OFFER_BEFORE_MS =  5 * 60 * 1000;

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── New interfaces for admin enhancements ─────────────────────────────────────
interface AuditLogEntry {
  id: number;
  user_id: number;
  action: string;
  target_user_id?: number;
  details: string;
  created_at: string;
  admin_name?: string;
}

interface PledgePoolData {
  total_pledged: number;
  total_paid: number;
  pending: number;
  completion_rate: number;
  daily_volume: Array<{ day: string; count: number }>;
}

interface NiaCostDailyEntry {
  date: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  failedCalls: number;
}

interface NiaCostData {
  daily: NiaCostDailyEntry[];
  summary: {
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    totalFailed: number;
    averageCostPerCall: number;
  };
  period: { days: number; startDate: string | null; endDate: string | null };
}

// ── KPI tile ──────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, color = "text-foreground", icon: Icon }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      </div>
      <div className={`text-2xl font-black tabular-nums ${color}`}>{value}</div>
      {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────
function AnalyticsTab() {
  const [stats, setStats] = useState<{
    total_requests: number;
    completed_requests: number;
    total_users: number;
    active_helpers: number;
    total_reports: number;
    pending_reports: number;
    nia_conversations: number;
    avg_trust_score: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${BASE}/api/admin/stats`, { headers: (() => { const t = getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; })() }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([statsData]) => {
      if (statsData) setStats(statsData);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Loading analytics…</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Platform Overview */}
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mb-2">Platform Overview</div>
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Total Requests" value={stats?.total_requests ?? "—"} sub="all time" icon={Package} />
        <KpiTile label="Completed" value={stats?.completed_requests ?? "—"} sub="fulfilled" icon={CheckCircle2} color="text-green-500" />
        <KpiTile label="Users" value={stats?.total_users ?? "—"} sub="registered" icon={Users} />
        <KpiTile label="Active Helpers" value={stats?.active_helpers ?? "—"} sub="on platform" icon={Star} color="text-primary" />
      </div>

      {/* Safety */}
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mt-2 mb-2">Safety & Moderation</div>
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Total Reports" value={stats?.total_reports ?? "—"} icon={Flag} />
        <KpiTile label="Pending" value={stats?.pending_reports ?? "—"} sub="need review" icon={AlertCircle}
          color={(stats?.pending_reports ?? 0) > 0 ? "text-yellow-500" : "text-green-500"} />
      </div>

      {/* Nia */}
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mt-2 mb-2">Nia AI</div>
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Conversations" value={stats?.nia_conversations ?? "—"} icon={MessageSquare} color="text-primary" />
        <KpiTile label="Avg Trust Score" value={stats?.avg_trust_score ? `${Math.round(stats.avg_trust_score)}%` : "—"} icon={TrendingUp} />
      </div>

      {/* No stats fallback */}
      {!stats && !loading && (
        <div className="bg-muted/40 border border-border rounded-2xl p-6 text-center">
          <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <div className="text-sm font-bold text-muted-foreground">Analytics unavailable</div>
          <div className="text-xs text-muted-foreground/60 mt-1">/api/admin/stats endpoint not responding</div>
        </div>
      )}
    </div>
  );
}

// ── 7-Day Sparkline Component ─────────────────────────────────────────────────
function Sparkline({ data, color = "#3b82f6", height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * 100;
    const y = 100 - ((v - min) / range) * 100;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline fill="none" stroke={color} strokeWidth="3" points={points} />
    </svg>
  );
}

// ── Pledge Pool Dashboard ───────────────────────────────────────────────────
function PledgePoolDashboard() {
  const [data, setData] = useState<PledgePoolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tok = getToken();
    fetch(`${BASE}/api/admin/analytics`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.pledge_pool) {
          setData({
            total_pledged: d.pledge_pool.total_pledged,
            total_paid: d.pledge_pool.total_paid,
            pending: d.pledge_pool.pending,
            completion_rate: d.pledge_pool.total_pledged > 0
              ? Math.round((d.pledge_pool.total_paid / d.pledge_pool.total_pledged) * 100)
              : 0,
            daily_volume: d.daily_request_volume || [],
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
      <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-xs">Loading pledge data…</span>
    </div>
  );

  if (!data) return (
    <div className="text-center py-8 text-muted-foreground text-xs">Pledge pool data unavailable</div>
  );

  const dailyCounts = data.daily_volume.map((d: any) => d.count || 0);

  return (
    <div className="space-y-4">
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mb-2">Pledge Pool Health</div>
      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="Total Pledged" value={`$${data.total_pledged.toLocaleString()}`} sub="community commitments" icon={HandHeart} color="text-primary" />
        <KpiTile label="Total Paid" value={`$${data.total_paid.toLocaleString()}`} sub="honored contributions" icon={DollarSign} color="text-green-500" />
        <KpiTile label="Pending" value={`$${data.pending.toLocaleString()}`} sub="outstanding balance" icon={Clock} color="text-yellow-500" />
        <KpiTile label="Completion Rate" value={`${data.completion_rate}%`} sub="pay-it-forward ratio" icon={TrendingUp} color={data.completion_rate >= 80 ? "text-green-500" : "text-yellow-500"} />
      </div>

      {/* 7-day sparkline */}
      {dailyCounts.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">7-Day Request Volume</span>
            <LineChart className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <Sparkline data={dailyCounts} color="#3b82f6" height={60} />
          <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
            {data.daily_volume.map((d: any, i: number) => (
              <span key={i} className="text-center flex-1">{d.day?.slice(0, 3) ?? ""}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit Log Table ───────────────────────────────────────────────────────────
function AuditLogTable() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const tok = getToken();
    // For now, fetch from a mock endpoint or use moderation actions from users
    fetch(`${BASE}/api/admin/accounts?limit=50`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((users: any[]) => {
        // Generate audit entries from user moderation state
        const auditEntries: AuditLogEntry[] = users
          .filter((u: any) => u.is_suspended || u.trust_score <= -1)
          .map((u: any, i: number) => ({
            id: i + 1,
            user_id: u.id,
            action: u.trust_score <= -1 ? "BANNED" : "SUSPENDED",
            target_user_id: u.id,
            details: u.suspended_reason || "Account moderation action",
            created_at: u.suspended_at || u.created_at,
            admin_name: "System",
          }));
        setEntries(auditEntries);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = entries.filter(e =>
    !filter ||
    e.action.toLowerCase().includes(filter.toLowerCase()) ||
    e.details.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-3">
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mb-2">Audit Log</div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Filter audit entries…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-xs">Loading audit log…</span>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-xs">No audit entries found</div>
      )}

      <div className="space-y-2">
        {filtered.map(entry => (
          <div key={entry.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              entry.action === "BANNED" ? "bg-destructive/10 text-destructive" : "bg-yellow-500/10 text-yellow-500"
            }`}>
              {entry.action === "BANNED" ? <Ban className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{entry.action}</span>
                <span className="text-[10px] text-muted-foreground">User #{entry.target_user_id}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{entry.details}</div>
            </div>
            <div className="text-[10px] text-muted-foreground shrink-0">{fmtDate(entry.created_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bulk Helper Approvals ─────────────────────────────────────────────────────
function BulkHelperApprovals() {
  const [pending, setPending] = useState<PendingHelper[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const tok = getToken();
    fetch(`${BASE}/api/admin/helper-applications?status=pending`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: PendingHelper[]) => {
        if (Array.isArray(data)) setPending(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === pending.length) setSelected(new Set());
    else setSelected(new Set(pending.map(p => p.id)));
  };

  const bulkApprove = async () => {
    if (selected.size === 0) return;
    setProcessing(true);
    const tok = getToken();
    const promises = Array.from(selected).map(id =>
      fetch(`${BASE}/api/users/${id}/helper-application`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ status: "approved" }),
      })
    );
    await Promise.all(promises);
    setPending(prev => prev.filter(p => !selected.has(p.id)));
    setSelected(new Set());
    setProcessing(false);
    toast({ title: `Approved ${selected.size} helper${selected.size > 1 ? "s" : ""} ✅` });
  };

  const bulkReject = async () => {
    if (selected.size === 0) return;
    setProcessing(true);
    const tok = getToken();
    const promises = Array.from(selected).map(id =>
      fetch(`${BASE}/api/users/${id}/helper-application`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ status: "rejected" }),
      })
    );
    await Promise.all(promises);
    setPending(prev => prev.filter(p => !selected.has(p.id)));
    setSelected(new Set());
    setProcessing(false);
    toast({ title: `Rejected ${selected.size} helper${selected.size > 1 ? "s" : ""}` });
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
      <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-xs">Loading applications…</span>
    </div>
  );

  if (pending.length === 0) return (
    <div className="text-center py-8">
      <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-400/40" />
      <div className="text-xs text-muted-foreground">No pending helper applications</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Bulk Helper Approvals ({pending.length})</div>
        <button
          onClick={selectAll}
          className="text-[10px] font-black px-2.5 py-1.5 rounded-full border border-border bg-card active:bg-muted"
        >
          {selected.size === pending.length ? "Deselect All" : "Select All"}
        </button>
      </div>

      <div className="space-y-2">
        {pending.map(u => (
          <div key={u.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3"
          onClick={() => toggleSelect(u.id)}
          >
            <div className="shrink-0">
              {selected.has(u.id) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-black text-xs text-primary shrink-0">
              {u.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold truncate">{u.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>
              {u.helper_skills && u.helper_skills.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {u.helper_skills.slice(0, 2).map(s => (
                    <span key={s} className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{s}</span>
                  ))}
                  {u.helper_skills.length > 2 && <span className="text-[9px] text-muted-foreground">+{u.helper_skills.length - 2}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex gap-2 pt-2">
          <button
            onClick={bulkReject}
            disabled={processing}
            className="flex-1 h-10 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50"
          >
            {processing ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : `Reject ${selected.size}`}
          </button>
          <button
            onClick={bulkApprove}
            disabled={processing}
            className="flex-1 h-10 rounded-xl bg-green-500 text-white text-xs font-black disabled:opacity-50"
          >
            {processing ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : `Approve ${selected.size}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Report Detail Sheet ───────────────────────────────────────────────────────
function ReportDetailSheet({ report, onClose, onReviewed }: {
  report: Report; onClose: () => void; onReviewed: (updated: Report) => void;
}) {
  const [status, setStatus] = useState<string>(report.status === "pending" ? "under_review" : report.status);
  const [notes, setNotes] = useState(report.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleReview = async () => {
    const valid = ["under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
    if (!valid.includes(status)) return;
    setSaving(true);
    try {
      const token = getToken();
      const res = await fetch(`${BASE}/api/reports/${report.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ status, admin_notes: notes || null }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json() as Report;
      onReviewed(updated);
      toast({ title: "Report updated", description: `→ ${STATUS_LABELS[status]?.label ?? status}` });
      onClose();
    } catch {
      toast({ title: "Failed to update report", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[92dvh] overflow-y-auto"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 bg-border rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-destructive" />
            <h3 className="font-black text-lg">Report #{report.id}</h3>
          </div>
          <button onClick={onClose} style={{ touchAction: "manipulation" }}
            className="w-9 h-9 rounded-full border border-border flex items-center justify-center active:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-background rounded-xl p-3 border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Type</div>
              <div className="text-sm font-bold">{TYPE_LABELS[report.type] ?? report.type}</div>
            </div>
            <div className="bg-background rounded-xl p-3 border border-border">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Filed</div>
              <div className="text-sm font-bold">{fmtDate(report.created_at)}</div>
            </div>
            {report.reporter_name && (
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Reporter</div>
                <div className="text-sm font-bold">{report.reporter_name}</div>
                {report.reporter_email && <div className="text-[10px] text-muted-foreground truncate">{report.reporter_email}</div>}
              </div>
            )}
            {report.reported_user_name && (
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Reported</div>
                <div className="text-sm font-bold">{report.reported_user_name}</div>
              </div>
            )}
          </div>

          <div className="bg-background rounded-xl p-4 border border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Description</div>
            <p className="text-sm leading-relaxed">{report.description}</p>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Admin Action</div>
            <div className="grid grid-cols-2 gap-2">
              {(["under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{ touchAction: "manipulation" }}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    status === s
                      ? STATUS_LABELS[s].color + " ring-2 ring-offset-1 ring-offset-card ring-current"
                      : "bg-background border-border text-muted-foreground"
                  }`}
                >
                  {STATUS_LABELS[s].label}
                </button>
              ))}
            </div>

            <textarea
              placeholder="Admin notes (optional)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full text-sm bg-background border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            />

            <Button className="w-full h-12 font-black text-base" onClick={handleReview} disabled={saving}
              style={{ touchAction: "manipulation" }}>
              {saving ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Saving…</span> : "Submit Review"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
// ── Pending Account Approvals ─────────────────────────────────────────────────
// BUG-CRIT-01: individual accounts now auto-approve at registration (see
// CLAUDE.md Incident #19), but organization accounts still require real
// admin review. This is the UI for that — previously GET /admin/accounts
// could list pending accounts but no UI surfaced them and no endpoint could
// act on them at all.
function PendingAccountsCard() {
  const [pending, setPending] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  const load = useCallback(() => {
    const tok = getToken();
    fetch(`${BASE}/api/admin/accounts?approval_status=pending`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: AdminUser[]) => { if (Array.isArray(data)) setPending(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (userId: number, status: "approved" | "denied") => {
    setProcessing(userId);
    try {
      const tok = getToken();
      const res = await fetch(`${BASE}/api/admin/accounts/${userId}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      setPending(prev => prev.filter(u => u.id !== userId));
      toast({ title: status === "approved" ? "Account approved ✅" : "Account denied" });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  if (loading || pending.length === 0) return null;

  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 space-y-3">
      <div className="text-xs font-black uppercase tracking-wider text-yellow-600 flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" /> Pending Account Approvals ({pending.length})
      </div>
      {pending.map(u => (
        <div key={u.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{u.name}</div>
            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
            {(u as AdminUser & { organization_name?: string }).organization_name && (
              <div className="text-[10px] text-primary mt-0.5">{(u as AdminUser & { organization_name?: string }).organization_name}</div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => decide(u.id, "denied")}
              disabled={processing === u.id}
              className="h-9 px-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50"
            >Deny</button>
            <button
              onClick={() => decide(u.id, "approved")}
              disabled={processing === u.id}
              className="h-9 px-3 rounded-lg bg-green-500 text-white text-xs font-black disabled:opacity-50"
            >Approve</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const [showHelperOnly, setShowHelperOnly] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  useEffect(() => {
    const tok = getToken();
    fetch(`${BASE}/api/users?limit=200`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchHelper = !showHelperOnly || u.is_helper;
    return matchSearch && matchHelper;
  });

  const handleAction = async (userId: number, action: "warn" | "ban") => {
    try {
      const tok = getToken();
      await fetch(`${BASE}/api/users/${userId}/moderation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ action }),
      });
      toast({ title: action === "ban" ? "User banned" : "Warning issued" });
      setActionUser(null);
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <PendingAccountsCard />
      {/* Search + filter row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search users…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          onClick={() => setShowHelperOnly(!showHelperOnly)}
          style={{ touchAction: "manipulation" }}
          className={`px-4 py-3 rounded-xl border text-xs font-black transition-all ${
            showHelperOnly ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
          }`}
        >
          Helpers
        </button>
      </div>

      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-muted-foreground">{filtered.length} user{filtered.length !== 1 ? "s" : ""}</div>
        <button
          onClick={() => { setBulkMode(!bulkMode); setSelectedUsers(new Set()); }}
          className={`text-[10px] font-black px-2.5 py-1.5 rounded-full border transition-all ${
            bulkMode ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
          }`}
        >
          {bulkMode ? "Done" : "Bulk Select"}
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span>
        </div>
      )}

      {filtered.map(user => (
        <motion.div
          key={user.id}
          layout
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            {bulkMode && (
              <button
                onClick={() => {
                  setSelectedUsers(prev => {
                    const next = new Set(prev);
                    if (next.has(user.id)) next.delete(user.id);
                    else next.add(user.id);
                    return next;
                  });
                }}
                className="shrink-0"
              >
                {selectedUsers.has(user.id) ? <CheckSquare className="w-5 h-5 text-primary" /> : <Square className="w-5 h-5 text-muted-foreground" />}
              </button>
            )}
            <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-black text-primary text-base">
              {user.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm truncate">{user.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {user.is_helper && (
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold">Helper</span>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Star className="w-3 h-3" />{(user.trust_score ?? 0).toFixed(0)}%
                </span>
                <span className="text-[10px] text-muted-foreground">{user.help_count} helps</span>
                {user.is_suspended && (
                  <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-bold">Suspended</span>
                )}
              </div>
            </div>
            <button
              onClick={() => setActionUser(user)}
              style={{ touchAction: "manipulation" }}
              className="w-10 h-10 rounded-xl border border-border flex items-center justify-center active:bg-muted transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      ))}

      {/* Action sheet */}
      <AnimatePresence>
        {actionUser && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setActionUser(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-5"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drag handle */}
              <div className="flex justify-center mb-4">
                <div className="w-9 h-1 bg-border rounded-full" />
              </div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center font-black text-lg">
                  {actionUser.name[0]?.toUpperCase()}
                </div>
                <div>
                  <div className="font-black">{actionUser.name}</div>
                  <div className="text-xs text-muted-foreground">{actionUser.email}</div>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleAction(actionUser.id, "warn")}
                  style={{ touchAction: "manipulation" }}
                  className="w-full flex items-center gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl active:scale-[0.98] transition-all"
                >
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  <div className="text-left">
                    <div className="font-black text-sm text-orange-400">Issue Warning</div>
                    <div className="text-xs text-muted-foreground">User gets a community guidelines warning</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAction(actionUser.id, "ban")}
                  style={{ touchAction: "manipulation" }}
                  className="w-full flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl active:scale-[0.98] transition-all"
                >
                  <Ban className="w-5 h-5 text-destructive" />
                  <div className="text-left">
                    <div className="font-black text-sm text-destructive">Ban User</div>
                    <div className="text-xs text-muted-foreground">Remove from platform permanently</div>
                  </div>
                </button>
                <button
                  onClick={() => setActionUser(null)}
                  style={{ touchAction: "manipulation" }}
                  className="w-full p-4 text-sm text-muted-foreground active:text-foreground rounded-2xl border border-border"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bulk action bar */}
      {bulkMode && selectedUsers.size > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-20 left-4 right-4 z-40 bg-card border border-border rounded-2xl p-4 shadow-lg"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold">{selectedUsers.size} selected</span>
            <button onClick={() => setSelectedUsers(new Set())} className="text-xs text-muted-foreground">Clear</button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const tok = getToken();
                await Promise.all(Array.from(selectedUsers).map(id =>
                  fetch(`${BASE}/api/users/${id}/moderation`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
                    body: JSON.stringify({ action: "suspend" }),
                  })
                ));
                toast({ title: `Suspended ${selectedUsers.size} users` });
                setSelectedUsers(new Set());
                setBulkMode(false);
              }}
              className="flex-1 h-10 rounded-xl border border-yellow-500/40 bg-yellow-500/10 text-yellow-600 text-xs font-black"
            >
              Suspend
            </button>
            <button
              onClick={async () => {
                const tok = getToken();
                await Promise.all(Array.from(selectedUsers).map(id =>
                  fetch(`${BASE}/api/users/${id}/moderation`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
                    body: JSON.stringify({ action: "ban" }),
                  })
                ));
                toast({ title: `Banned ${selectedUsers.size} users` });
                setSelectedUsers(new Set());
                setBulkMode(false);
              }}
              className="flex-1 h-10 rounded-xl bg-destructive text-white text-xs font-black"
            >
              Ban
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Nia Tab ───────────────────────────────────────────────────────────────────
function NiaTab() {
  const [niaEnabled, setNiaEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [confirmPending, setConfirmPending] = useState<boolean | null>(null);
  const [memoryStats, setMemoryStats] = useState<{ users: number; entries: number } | null>(null);
  const [costData, setCostData] = useState<NiaCostData | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  useEffect(() => {
    const niaTok = getToken();
    const niaHdrs = niaTok ? { Authorization: `Bearer ${niaTok}` } : {};
    fetch(`${BASE}/api/admin/nia-status`, { headers: niaHdrs })
      .then(r => r.json())
      .then((d: { enabled: boolean }) => setNiaEnabled(d.enabled))
      .catch(() => toast({ title: "Could not fetch Nia status", variant: "destructive" }));
    fetch(`${BASE}/api/admin/nia-memory-stats`, { headers: niaHdrs })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setMemoryStats(d); })
      .catch(() => {});
    setCostLoading(true);
    fetch(`${BASE}/api/admin/nia-costs?days=7`, { headers: niaHdrs })
      .then(r => r.ok ? r.json() : null)
      .then((d: NiaCostData | null) => { if (d) setCostData(d); setCostLoading(false); })
      .catch(() => { setCostLoading(false); });
  }, []);

  const submitToggle = async (enabled: boolean) => {
    setConfirmPending(null);
    setToggling(true);
    try {
      const token = getToken();
      const res = await fetch(`${BASE}/api/admin/nia-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Toggle failed");
      }
      const data = await res.json() as { enabled: boolean };
      setNiaEnabled(data.enabled);
      toast({ title: data.enabled ? "Nia enabled" : "Nia disabled" });
    } catch (err) {
      toast({ title: (err as Error).message ?? "Toggle failed", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status card */}
      <motion.div
        layout
        className={`rounded-2xl border p-5 transition-colors ${
          niaEnabled === false ? "bg-destructive/5 border-destructive/30" : "bg-card border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              niaEnabled === false ? "bg-destructive/10" : "bg-primary/10"
            }`}>
              <Bot className={`w-5 h-5 ${niaEnabled === false ? "text-destructive" : "text-primary"}`} />
            </div>
            <div>
              <div className="font-black text-sm">Nia AI Status</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {niaEnabled === null ? (
                  <span className="text-xs text-muted-foreground">Checking…</span>
                ) : (
                  <>
                    <span className={`w-2 h-2 rounded-full inline-block ${
                      niaEnabled ? "bg-green-500 animate-pulse" : "bg-muted-foreground"
                    }`} />
                    <span className={`text-xs font-bold ${
                      niaEnabled ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                    }`}>
                      {niaEnabled ? "Active — all users" : "Disabled — 503"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={niaEnabled ?? false}
            disabled={niaEnabled === null || toggling}
            onClick={() => setConfirmPending(!niaEnabled)}
            style={{ touchAction: "manipulation" }}
            className={`relative w-14 h-7 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
              niaEnabled ? "bg-green-500" : "bg-muted"
            }`}
          >
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              niaEnabled ? "translate-x-7" : "translate-x-0"
            }`} />
          </button>
        </div>
      </motion.div>

      {/* System info grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Persistence</div>
          <div className="text-sm font-bold text-green-500">DB-backed</div>
          <div className="text-[10px] text-muted-foreground">Survives redeploys</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Kill-switch</div>
          <div className="text-sm font-bold">2 layers</div>
          <div className="text-[10px] text-muted-foreground">Proxy + nia-service</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Memory Users</div>
          <div className="text-sm font-bold">{memoryStats?.users ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">cross-session</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Memory Entries</div>
          <div className="text-sm font-bold">{memoryStats?.entries ?? "—"}</div>
          <div className="text-[10px] text-muted-foreground">total facts</div>
        </div>
      </div>

      {/* Nia AI Cost Dashboard */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">AI Cost Dashboard (7d)</span>
          </div>
          {costLoading && <RefreshCw className="w-3 h-3 text-muted-foreground animate-spin" />}
        </div>

        {costData ? (
          <>
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-background rounded-xl p-2.5 text-center">
                <div className="text-base font-black text-foreground">${costData.summary.totalCostUsd.toFixed(3)}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">Total Cost</div>
              </div>
              <div className="bg-background rounded-xl p-2.5 text-center">
                <div className="text-base font-black text-primary">{costData.summary.totalCalls.toLocaleString()}</div>
                <div className="text-[9px] text-muted-foreground mt-0.5">API Calls</div>
              </div>
              <div className="bg-background rounded-xl p-2.5 text-center">
                <div className={`text-base font-black ${costData.summary.totalFailed > 0 ? "text-destructive" : "text-green-400"}`}>
                  {costData.summary.totalFailed}
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">Failed</div>
              </div>
            </div>
            {/* Avg cost per call */}
            <div className="text-[10px] text-muted-foreground px-0.5">
              Avg <span className="font-bold text-foreground">${costData.summary.averageCostPerCall.toFixed(5)}</span> / call ·{" "}
              <span className="font-bold text-foreground">{(costData.summary.totalInputTokens + costData.summary.totalOutputTokens).toLocaleString()}</span> total tokens
            </div>
            {/* Daily breakdown */}
            {costData.daily.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Daily Breakdown</div>
                {costData.daily.slice(0, 5).map(d => (
                  <div key={d.date} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-16 shrink-0 font-mono">{d.date.slice(5)}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width: costData.summary.totalCostUsd > 0
                            ? `${Math.max(4, (d.estimatedCostUsd / Math.max(...costData.daily.map(x => x.estimatedCostUsd), 0.0001)) * 100)}%`
                            : "4%",
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-bold text-foreground w-14 text-right shrink-0">
                      ${d.estimatedCostUsd.toFixed(4)}
                    </span>
                    {d.failedCalls > 0 && (
                      <span className="text-[9px] text-destructive shrink-0">{d.failedCalls}✗</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : !costLoading ? (
          <div className="text-[11px] text-muted-foreground text-center py-3">
            Cost data unavailable — nia-service may be offline
          </div>
        ) : null}
      </div>

      {/* Confirm sheet */}
      <AnimatePresence>
        {confirmPending !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setConfirmPending(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-6"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-center mb-4"><div className="w-9 h-1 bg-border rounded-full" /></div>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  confirmPending ? "bg-green-500/10" : "bg-destructive/10"
                }`}>
                  <Power className={`w-6 h-6 ${confirmPending ? "text-green-500" : "text-destructive"}`} />
                </div>
                <div>
                  <div className="font-black text-base">{confirmPending ? "Enable Nia AI?" : "Disable Nia AI?"}</div>
                  <div className="text-xs text-muted-foreground">
                    {confirmPending ? "Nia becomes available immediately." : "Users see unavailability message."}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setConfirmPending(null)}
                  style={{ touchAction: "manipulation" }}
                  className="flex-1 h-12 rounded-2xl border border-border text-sm font-black active:bg-muted"
                >Cancel</button>
                <button
                  onClick={() => submitToggle(confirmPending)}
                  disabled={toggling}
                  style={{ touchAction: "manipulation" }}
                  className={`flex-1 h-12 rounded-2xl text-sm font-black text-white disabled:opacity-50 ${
                    confirmPending ? "bg-green-500 active:bg-green-600" : "bg-destructive active:bg-destructive/80"
                  }`}
                >
                  {toggling ? <span className="flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Saving…</span>
                    : confirmPending ? "Enable Nia" : "Disable Nia"}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────
function ReportsTab({ authed }: { authed: boolean }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const fetchReports = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const url = status && status !== "all" ? `${BASE}/api/reports?status=${status}` : `${BASE}/api/reports`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      setReports(await res.json() as Report[]);
    } catch { toast({ title: "Could not load reports", variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) fetchReports(statusFilter); }, [statusFilter, authed, fetchReports]);

  const handleReviewed = (updated: Report) => setReports(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
  const pendingCount = reports.filter(r => r.status === "pending").length;
  const filtered = statusFilter === "all" ? reports : reports.filter(r => r.status === statusFilter);

  return (
    <>
      {/* Pending badge summary */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{pendingCount} report{pendingCount !== 1 ? "s" : ""} awaiting review</span>
          <button onClick={() => setStatusFilter("pending")} style={{ touchAction: "manipulation" }}
            className="ml-auto text-[10px] font-black bg-yellow-500 text-black px-2.5 py-1 rounded-full">View</button>
        </div>
      )}

      {/* Status filter chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
        {STATUS_FILTERS.map(s => {
          const meta = STATUS_LABELS[s];
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{ touchAction: "manipulation" }}
              className={`shrink-0 text-[11px] font-bold px-3 py-2 rounded-full border transition-all ${
                isActive
                  ? s === "all" ? "bg-primary text-primary-foreground border-primary" : (meta?.color ?? "bg-primary text-primary-foreground border-primary")
                  : "bg-card border-border text-muted-foreground"
              }`}
            >
              {s === "all" ? "All" : meta?.label ?? s}
            </button>
          );
        })}
      </div>

      {loading && <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span></div>}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400/40" />
          <div className="font-bold text-sm text-muted-foreground">{statusFilter === "all" ? "No reports yet" : "Queue is clear"}</div>
        </div>
      )}

      {!loading && filtered.map(report => {
        const statusMeta = STATUS_LABELS[report.status] ?? { label: report.status, color: "bg-muted text-muted-foreground border-border" };
        return (
          <motion.button
            key={report.id} layout
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedReport(report)}
            style={{ touchAction: "manipulation" }}
            className="w-full text-left bg-card border border-border rounded-2xl p-4 active:border-primary/40 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusMeta.color}`}>{statusMeta.label}</span>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{TYPE_LABELS[report.type] ?? report.type}</span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{report.description}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap text-[10px] text-muted-foreground">
                  {report.reported_user_id && <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />User #{report.reported_user_id}</span>}
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(report.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {report.status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />}
                <Eye className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </motion.button>
        );
      })}

      {selectedReport && (
        <ReportDetailSheet
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onReviewed={handleReviewed}
        />
      )}
    </>
  );
}


// ── Helper Applications Tab ───────────────────────────────────────────────────
interface PendingHelper {
  id: number;
  name: string;
  email: string;
  helper_status: string | null;
  helper_skills: string[] | null;
  helper_bio: string | null;
  helper_languages: string[] | null;
  helper_vehicle: string | null;
  created_at: string;
}

function HelperApplicationsTab() {
  const [pending, setPending] = useState<PendingHelper[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    const tok = getToken();
    fetch(`${BASE}/api/users?limit=200&helper_status=pending`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.json())
      .then((users: PendingHelper[]) => {
        if (Array.isArray(users)) setPending(users.filter(u => u.helper_status === "pending"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const decide = async (userId: number, decision: "approved" | "denied") => {
    setProcessing(userId);
    try {
      const tok = getToken();
      const res = await fetch(`${BASE}/api/users/${userId}/helper-application`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ status: decision }),
      });
      if (!res.ok) throw new Error("Failed");
      setPending(prev => prev.filter(u => u.id !== userId));
      toast({ title: decision === "approved" ? "Helper approved ✅" : "Application denied" });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setProcessing(null);
      setExpanded(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Loading applications…</span>
    </div>
  );

  if (pending.length === 0) return (
    <div className="text-center py-20">
      <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400/40" />
      <div className="font-black text-base text-muted-foreground">No pending applications</div>
      <div className="text-xs text-muted-foreground/60 mt-1">All applications reviewed</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
        <UserIcon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-bold text-primary">{pending.length} application{pending.length !== 1 ? "s" : ""} awaiting review</span>
      </div>
      {pending.map(u => (
        <div key={u.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === u.id ? null : u.id)}
            style={{ touchAction: "manipulation" }}
            className="w-full flex items-center gap-3 p-4 active:bg-muted/40 transition-colors text-left"
          >
            <div className="w-11 h-11 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-black text-primary">
              {u.name[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm truncate">{u.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{u.email}</div>
              {u.helper_skills && u.helper_skills.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {u.helper_skills.slice(0, 3).map(s => (
                    <span key={s} className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold">{s}</span>
                  ))}
                  {u.helper_skills.length > 3 && <span className="text-[10px] text-muted-foreground">+{u.helper_skills.length - 3} more</span>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-muted-foreground">{fmtDate(u.created_at)}</span>
              {expanded === u.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </button>
          <AnimatePresence>
            {expanded === u.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="p-4 space-y-3">
                  {u.helper_bio && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Bio</div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{u.helper_bio}</p>
                    </div>
                  )}
                  {u.helper_languages && u.helper_languages.length > 0 && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Languages</div>
                      <div className="flex gap-1 flex-wrap">
                        {u.helper_languages.map(l => (
                          <span key={l} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {u.helper_vehicle && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Transport</div>
                      <div className="text-sm">{u.helper_vehicle}</div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => decide(u.id, "denied")}
                      disabled={processing === u.id}
                      style={{ touchAction: "manipulation" }}
                      className="h-11 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-sm font-black disabled:opacity-50 active:opacity-70 transition-opacity"
                    >{processing === u.id ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Deny"}</button>
                    <button
                      onClick={() => decide(u.id, "approved")}
                      disabled={processing === u.id}
                      style={{ touchAction: "manipulation" }}
                      className="h-11 rounded-xl bg-green-500 text-white text-sm font-black disabled:opacity-50 active:opacity-70 transition-opacity"
                    >{processing === u.id ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Approve ✓"}</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ── Main Admin Screen ─────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [authed, setAuthed] = useState(false);
  const [adminInput, setAdminInput] = useState("");

  // Primary auth: if the logged-in user has is_admin=true (verified by the
  // server on every API call via requireAdmin()), auto-authenticate them into
  // the admin session without requiring a separate secret.
  const { currentUser } = useAppContext();
  useEffect(() => {
    if (currentUser?.is_admin) setAuthed(true);
  }, [currentUser?.is_admin]);

  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"reports" | "helpers" | "users" | "pledges" | "audit" | "nia" | "analytics">("reports");

  // ── Session timer ─────────────────────────────────────────────────────────
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(SESSION_DURATION_MS / 1000);
  const [showBumpPrompt, setShowBumpPrompt] = useState(false);
  const expiryRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const logout = useCallback(() => {
    clearTimer();
    setAuthed(false);
    setAdminInput("");
    setShowBumpPrompt(false);
    toast({ title: "Admin session ended", description: "Session expired." });
  }, [clearTimer]);

  const startTimer = useCallback((durationMs = SESSION_DURATION_MS) => {
    clearTimer();
    expiryRef.current = Date.now() + durationMs;
    setShowBumpPrompt(false);
    timerRef.current = setInterval(() => {
      const remaining = (expiryRef.current ?? 0) - Date.now();
      if (remaining <= 0) { clearTimer(); logout(); return; }
      setSessionSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= BUMP_OFFER_BEFORE_MS) setShowBumpPrompt(true);
    }, 1000);
  }, [clearTimer, logout]);

  useEffect(() => {
    if (authed) startTimer();
    return clearTimer;
  }, [authed]); // eslint-disable-line

  const bumpSession = useCallback(() => {
    setShowBumpPrompt(false);
    startTimer();
    toast({ title: "Session extended +15 min" });
  }, [startTimer]);

  const fmtCountdown = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!authed) {
    const isLoggedInNonAdmin = !!currentUser && !currentUser.is_admin;
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6 gap-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 22 }}
          className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-3xl flex items-center justify-center"
        >
          <Shield className="w-8 h-8 text-primary" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center"
        >
          <h1 className="text-2xl font-black">Admin Access</h1>
          <p className="text-sm text-muted-foreground mt-1">Niakofa Admin — secure session</p>
        </motion.div>

        {isLoggedInNonAdmin ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="w-full max-w-sm space-y-3"
          >
            <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-center">
              <AlertTriangle className="w-6 h-6 text-destructive mx-auto mb-2" />
              <p className="text-sm font-bold text-destructive">No admin access</p>
              <p className="text-xs text-muted-foreground mt-1">
                Your account ({currentUser.email}) does not have admin privileges. Contact the app administrator.
              </p>
            </div>
            <button
              onClick={() => setLocation("/")}
              style={{ touchAction: "manipulation" }}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-base active:opacity-80 transition-opacity"
            >Back to app</button>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="w-full max-w-sm space-y-3"
          >
            {!currentUser && (
              <p className="text-center text-sm text-muted-foreground">
                Sign in as an admin user to access this page.
              </p>
            )}
            <input
              type="password"
              placeholder="Admin secret (if configured)"
              value={adminInput}
              onChange={e => setAdminInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  const secret = import.meta.env.VITE_ADMIN_SECRET ?? "";
                  if (secret && adminInput === secret) setAuthed(true);
                  else toast({ title: "Incorrect secret", variant: "destructive" });
                }
              }}
              className="w-full px-5 py-4 rounded-2xl border border-border bg-card text-foreground text-base focus:outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              autoComplete="current-password"
            />
            <button
              onClick={() => {
                const secret = import.meta.env.VITE_ADMIN_SECRET ?? "";
                if (secret && adminInput === secret) setAuthed(true);
                else toast({ title: "Incorrect secret", variant: "destructive" });
              }}
              style={{ touchAction: "manipulation" }}
              className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-base active:opacity-80 transition-opacity"
            >
              Enter Admin
            </button>
            <button
              onClick={() => setLocation("/")}
              style={{ touchAction: "manipulation" }}
              className="w-full py-3 text-sm text-muted-foreground"
            >Back to app</button>
          </motion.div>
        )}
      </div>
    );
  }

  const TABS = [
    { key: "reports",   label: "Reports",   icon: Flag },
    { key: "helpers",   label: "Helpers",   icon: UserIcon },
    { key: "users",     label: "Users",     icon: Users },
    { key: "pledges",   label: "Pledges",   icon: HandHeart },
    { key: "audit",     label: "Audit",     icon: FileText },
    { key: "nia",       label: "Nia AI",    icon: Bot },
    { key: "analytics", label: "Stats",     icon: BarChart2 },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 72px)" }}>

      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setLocation("/profile")}
            style={{ touchAction: "manipulation" }}
            className="w-9 h-9 rounded-xl border border-border flex items-center justify-center active:bg-muted"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-lg font-black uppercase tracking-widest flex items-center gap-2">
            <Shield className="w-5 h-5 text-destructive" /> Admin
          </h1>
          {/* Session timer */}
          <span className={`flex items-center gap-1 text-[11px] font-black px-2.5 py-1.5 rounded-full border ${
            sessionSecondsLeft <= 60 ? "text-destructive border-destructive/30 bg-destructive/10" :
            sessionSecondsLeft <= BUMP_OFFER_BEFORE_MS / 1000 ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/10" :
            "text-muted-foreground border-border bg-background"
          }`}>
            <Timer className="w-3 h-3" />
            {fmtCountdown(sessionSecondsLeft)}
          </span>
          <button onClick={bumpSession} style={{ touchAction: "manipulation" }}
            className="text-[10px] font-black px-2.5 py-1.5 rounded-full border border-border bg-background active:bg-muted"
          >+15</button>
        </div>

        {/* Bump prompt */}
        <AnimatePresence>
          {showBumpPrompt && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mb-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-between gap-3">
                <span className="text-[11px] text-yellow-600 dark:text-yellow-400 font-bold">
                  Session expires in {fmtCountdown(sessionSecondsLeft)}
                </span>
                <button onClick={bumpSession} style={{ touchAction: "manipulation" }}
                  className="text-[11px] font-black bg-yellow-500 text-black px-3 py-1.5 rounded-full">Extend</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tab content */}
      <div className="flex-1 max-w-3xl mx-auto w-full px-4 pt-4 space-y-3">
        {activeTab === "pledges"   && <PledgePoolDashboard />}
        {activeTab === "audit"     && <AuditLogTable />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "nia"       && <NiaTab />}
        {activeTab === "helpers"   && <HelperApplicationsTab />}
        {activeTab === "users"     && <UsersTab />}
        {activeTab === "reports"   && <ReportsTab authed={authed} />}
      </div>

      {/* ── Bottom tab bar (mobile-native) ───────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-xl border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex max-w-3xl mx-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as typeof activeTab)}
              style={{ touchAction: "manipulation" }}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                activeTab === key ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

