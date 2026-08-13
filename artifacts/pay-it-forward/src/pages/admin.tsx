import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Shield, AlertCircle, CheckCircle2, Clock, X, ChevronLeft, ChevronRight,
  Eye, Flag, User as UserIcon, RefreshCw,
  Users, Search, Ban, AlertTriangle, Star, Bot, Power, Timer,
  BarChart2, TrendingUp, Activity, Zap, MessageSquare, Package,
  ChevronDown, ChevronUp, CheckSquare, Square, HandHeart, DollarSign,
  LineChart, FileText, Gavel, Sparkles, RotateCcw, Landmark, Building2,
  SlidersHorizontal, Save, Loader2, Server, LifeBuoy, Cpu, CheckCircle, WifiOff,
  Siren, MapPin, Globe, Fingerprint, Banknote,
  ShieldAlert, Megaphone, Map, Link, Navigation2, ShieldCheck,
  Download, BookOpen, Wallet, Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { getToken } from "@/lib/auth";
import { useAppContext } from "@/lib/AppContext";
import { BackgroundCheckAdmin } from "@/components/BackgroundCheckAdmin";
import { detectUnits } from "@/lib/locale-utils";
import { AdminLiveBanner } from "@/components/AdminLiveBanner";
import { wsSubscribe, type WsEventType } from "@/lib/wsClient";

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
  is_admin?: boolean;
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

interface FlaggedRequest {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  urgency: string | null;
  status: string;
  moderation_status: string;
  moderation_reason: string | null;
  requester_id: number;
  requester_name: string | null;
  requester_email: string | null;
  created_at: string;
}

interface GratitudePost {
  id: number;
  request_id: number | null;
  author_id: number;
  author_name: string;
  content: string;
  moderation_status: string;
  moderation_reason: string | null;
  created_at: string;
}

interface CivicSuggestion {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

interface Neighborhood {
  id: number;
  city_key: string;
  neighborhood_id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  verified: boolean;
  created_at: string;
}

interface RegionCrisisResource {
  id: number;
  region_display: string;
  state_code: string | null;
  resources: { label: string; phone?: string; url?: string }[];
  verified: boolean;
  notes: string | null;
  created_at: string;
}

interface AdminCashout {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  amount: number;
  state: string;
  stripe_transfer_id: string | null;
  notes: string | null;
  created_at: string;
}

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
  avg_effective_hourly_rate: number;
  hourly_rate_sample_size: number;
}

interface NiaCostDailyEntry {
  date: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
  failedCalls: number;
}

interface NiaAuditEntry {
  id: number;
  enabled: boolean;
  admin_user_id: number;
  admin_email: string;
  reason: string | null;
  created_at: string;
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
      fetch(`${BASE}/api/admin/stats`, { headers: (() => { const t = getToken(); const h: Record<string, string> = t ? { Authorization: `Bearer ${t}` } : {}; return h; })() }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([statsData]) => {
      if (statsData) setStats(statsData);
      setLoading(false);
    });
  }, []);

  if (loading && !stats) return (
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

      {/* Leaderboard recalculate */}
      <LeaderboardRecalculateCard />
    </div>
  );
}

// ── Leaderboard Recalculate Control ──────────────────────────────────────────
function LeaderboardRecalculateCard() {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const recalculate = async () => {
    setRunning(true);
    try {
      const res = await fetch(`${BASE}/api/leaderboard/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        setLastRun(new Date().toLocaleTimeString());
        toast({ title: "Leaderboard recalculated ✓" });
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: b.error ?? "Recalculation failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setRunning(false); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-primary" />
        <span className="text-xs font-black uppercase tracking-wider">Leaderboard</span>
        {lastRun && <span className="text-[10px] text-green-400 ml-auto">Last run: {lastRun}</span>}
      </div>
      <p className="text-xs text-muted-foreground">Manually trigger a full trust-score and leaderboard recomputation. Runs automatically on a schedule but can be forced here after bulk moderation actions.</p>
      <button
        onClick={recalculate}
        disabled={running}
        style={{ touchAction: "manipulation" }}
        className="w-full h-10 rounded-xl border border-primary/40 bg-primary/10 text-primary text-sm font-black disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        {running ? <><RefreshCw className="w-4 h-4 animate-spin" /> Recalculating…</> : <><RotateCcw className="w-4 h-4" /> Recalculate Now</>}
      </button>
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
// ── Pool Balance Banner ───────────────────────────────────────────────────────
// Real-time community pool stats shown at the top of the Pledges tab so admins
// don't have to switch to Analytics to see balance and runway.
// Fetches /api/pool/stats (public endpoint) and auto-refreshes every 60s.
interface PoolStats {
  enabled: boolean;
  balance: number;
  runway_days: number | null;
  inflow_30d: number;
  outflow_30d: number;
  guaranteed_minimum: number;
  minimum_hourly_rate: number;
  pending_minimums_count: number;
  pending_minimums_total: number;
}

function PoolBalanceBanner() {
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const tok = getToken();
      const res = await fetch("/api/pool/stats", {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (res.ok) {
        const d = await res.json() as PoolStats;
        setStats(d);
        setLastRefresh(new Date());
        hasLoadedRef.current = true;
      }
    } catch {
      // non-fatal — shows stale data or skeleton
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const runwayLabel = stats?.runway_days == null
    ? "∞"
    : stats.runway_days > 999
    ? "999+ days"
    : `${stats.runway_days} day${stats.runway_days !== 1 ? "s" : ""}`;

  const runwayColor = stats == null ? ""
    : stats.runway_days == null ? "text-green-400"
    : stats.runway_days < 14 ? "text-destructive"
    : stats.runway_days < 60 ? "text-yellow-400"
    : "text-green-400";

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Community Pool</span>
          {stats && (
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
              stats.enabled
                ? "bg-green-500/10 text-green-400 border-green-500/30"
                : "bg-destructive/10 text-destructive border-destructive/30"
            }`}>
              {stats.enabled ? "ACTIVE" : "PAUSED"}
            </span>
          )}
        </div>
        <button
          onClick={() => { void load(); }}
          disabled={loading}
          className="text-muted-foreground active:text-foreground"
          style={{ touchAction: "manipulation" }}
          title="Refresh pool stats"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Main stat grid */}
      <div className="grid grid-cols-3 divide-x divide-border border-t border-border mt-2">
        <div className="px-4 py-3 text-center">
          <div className={`text-xl font-black tabular-nums ${loading ? "animate-pulse text-muted-foreground" : "text-primary"}`}>
            {stats ? `$${stats.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Balance</div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className={`text-xl font-black tabular-nums ${loading ? "animate-pulse text-muted-foreground" : runwayColor}`}>
            {stats ? runwayLabel : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Runway</div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className={`text-xl font-black tabular-nums ${loading ? "animate-pulse text-muted-foreground" : stats?.pending_minimums_count ? "text-yellow-400" : "text-muted-foreground"}`}>
            {stats ? stats.pending_minimums_count : "—"}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Queued payouts</div>
        </div>
      </div>

      {/* Secondary row */}
      {stats && (
        <div className="flex divide-x divide-border border-t border-border">
          <div className="flex-1 px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">30d inflow</span>
            <span className="text-[11px] font-bold text-green-400">+${stats.inflow_30d.toFixed(0)}</span>
          </div>
          <div className="flex-1 px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">30d outflow</span>
            <span className="text-[11px] font-bold text-destructive">-${stats.outflow_30d.toFixed(0)}</span>
          </div>
          <div className="flex-1 px-4 py-2 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Min rate</span>
            <span className="text-[11px] font-bold">${stats.minimum_hourly_rate}/hr</span>
          </div>
        </div>
      )}

      {lastRefresh && (
        <div className="px-4 pb-2 text-[9px] text-muted-foreground/50 text-right">
          Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · auto-refreshes every 60s
        </div>
      )}
    </div>
  );
}

function PledgePoolDashboard() {
  const [data, setData] = useState<PledgePoolData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tok = getToken();
    fetch(`${BASE}/api/admin/analytics`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then((d: unknown) => {
        if (d?.pledge_pool) {
          setData({
            total_pledged: d.pledge_pool.total_pledged,
            total_paid: d.pledge_pool.total_paid,
            pending: d.pledge_pool.pending,
            completion_rate: d.pledge_pool.total_pledged > 0
              ? Math.round((d.pledge_pool.total_paid / d.pledge_pool.total_pledged) * 100)
              : 0,
            daily_volume: d.daily_request_volume || [],
            avg_effective_hourly_rate: d.helper_compensation?.avg_effective_hourly_rate ?? 0,
            hourly_rate_sample_size: d.helper_compensation?.sample_size ?? 0,
          });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading && !data) return (
    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
      <RefreshCw className="w-4 h-4 animate-spin" /><span className="text-xs">Loading pledge data…</span>
    </div>
  );

  if (!data) return (
    <div className="text-center py-8 text-muted-foreground text-xs">Pledge pool data unavailable</div>
  );

  const dailyCounts = data.daily_volume.map((d: unknown) => d.count || 0);

  return (
    <div className="space-y-4">
      {/* Helper Economics — livable-wage proof metric */}
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mb-2">Helper Economics</div>
      <div className="grid grid-cols-2 gap-3">
        <KpiTile
          label="Avg Effective Rate"
          value={data.avg_effective_hourly_rate > 0 ? `$${data.avg_effective_hourly_rate.toFixed(2)}/hr` : "—"}
          sub={data.hourly_rate_sample_size > 0 ? `${data.hourly_rate_sample_size} completed tasks` : "no data yet"}
          icon={TrendingUp}
          color={data.avg_effective_hourly_rate >= 15 ? "text-green-500" : data.avg_effective_hourly_rate > 0 ? "text-yellow-500" : "text-muted-foreground"}
        />
        <KpiTile
          label="Livable Wage Target"
          value="$15.00/hr"
          sub="TX floor · configurable"
          icon={DollarSign}
          color="text-primary"
        />
      </div>

      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mb-2 mt-2">Pledge Pool Health</div>
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
            {data.daily_volume.map((d: unknown, i: number) => (
              <span key={i} className="text-center flex-1">{d.day?.slice(0, 3) ?? ""}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Pledge Write-Off Card ─────────────────────────────────────────────────────
// Lets admins resolve stale unpaid pledges (forgive or write off) so they
// stop dragging down the pool runway number. Endpoint: PATCH /admin/requests/:id/pledge-status
interface PledgeRequest {
  id: number;
  title: string;
  pledge_amount: number | null;
  pledge_status: string;
  status: string;
  created_at: string;
  requester_name?: string;
}

function PledgeWriteOffCard() {
  const [pledges, setPledges] = useState<PledgeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Per-row reason textarea state
  const [reasonMap, setReasonMap] = useState<Record<number, string>>({});
  const [expandedReason, setExpandedReason] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(() => {
    if (!hasLoadedRef.current) setLoading(true);
    const tok = getToken();
    fetch(`${BASE}/api/requests?payment_type=pay_it_forward&limit=200`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((raw: unknown) => {
        // API returns { requests, total } or plain array depending on version
        const data: PledgeRequest[] = Array.isArray(raw) ? raw : (raw as unknown)?.requests ?? [];
        setPledges(data.filter(r =>
          (r.pledge_amount ?? 0) > 0 &&
          // Show active (ongoing), defaulted (past-due), AND those awaiting resolution
          (r.pledge_status === "active" || r.pledge_status === "defaulted" || !r.pledge_status) &&
          (r.status === "pay_it_forward_pending" || r.status === "completed")
        ));
        hasLoadedRef.current = true;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const markStatus = async (requestId: number, pledge_status: "forgiven" | "written_off") => {
    setProcessing(requestId);
    try {
      const tok = getToken();
      const reason = reasonMap[requestId]?.trim() || undefined;
      const res = await fetch(`${BASE}/api/admin/requests/${requestId}/pledge-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ pledge_status, reason }),
      });
      if (!res.ok) throw new Error("Failed");
      setPledges(prev => prev.filter(p => p.id !== requestId));
      setReasonMap(prev => { const n = { ...prev }; delete n[requestId]; return n; });
      setExpandedReason(null);
      toast({
        title: pledge_status === "forgiven" ? "Pledge forgiven 🤝" : "Pledge written off 📝",
        description: reason ? `Reason logged: "${reason.slice(0, 60)}"` : "No reason provided — consider adding one for audit.",
      });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  if (loading && !hasLoadedRef.current) return (
    <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading pledges…
    </div>
  );

  if (pledges.length === 0) return (
    <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 text-center">
      <CheckCircle2 className="w-6 h-6 text-green-500 mx-auto mb-1" />
      <div className="text-xs font-bold text-green-600">No outstanding pledges need attention</div>
      <button onClick={load} className="mt-2 text-[10px] text-primary flex items-center gap-1 mx-auto">
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
    </div>
  );

  const visible = showAll ? pledges : pledges.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Outstanding Pledges ({pledges.length})</span>
        <button onClick={load} className="text-primary text-[10px] flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Refresh</button>
      </div>

      {/* Legend */}
      <div className="text-[10px] text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed">
        <strong>Forgive</strong> = community absorbs the balance (records trust +5 for requester). &nbsp;
        <strong>Write Off</strong> = permanently close with no penalty (e.g. verified hardship, error).
        Both actions cancel all pending installment reminders.
      </div>

      <div className="space-y-2">
        {visible.map(p => {
          const outstanding = Math.max(0, (p.pledge_amount ?? 0) - ((p as unknown).pledge_paid ?? 0));
          const isDefaulted = p.pledge_status === "defaulted";
          const isExpanded = expandedReason === p.id;
          const isPending = processing === p.id;
          return (
            <div key={p.id} className={`bg-card border rounded-xl p-3 space-y-2 ${isDefaulted ? "border-red-500/30" : "border-border"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold truncate">{p.title}</div>
                  {p.requester_name && <div className="text-[10px] text-muted-foreground">{p.requester_name}</div>}
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-yellow-500 font-bold">
                      Pledged ${(p.pledge_amount ?? 0).toFixed(2)}
                    </span>
                    {outstanding < (p.pledge_amount ?? 0) && (
                      <span className="text-[10px] text-green-500 font-bold">
                        · ${outstanding.toFixed(2)} remaining
                      </span>
                    )}
                    {isDefaulted && (
                      <span className="text-[10px] bg-red-500/15 border border-red-500/30 text-red-400 px-1.5 py-0.5 rounded font-bold">
                        Defaulted
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Optional reason field */}
              <button
                onClick={() => setExpandedReason(isExpanded ? null : p.id)}
                className="text-[10px] text-muted-foreground underline underline-offset-2 w-full text-left"
              >
                {isExpanded ? "▲ Hide reason" : "▾ Add reason / note (recommended)"}
              </button>
              {isExpanded && (
                <textarea
                  value={reasonMap[p.id] ?? ""}
                  onChange={e => setReasonMap(prev => ({ ...prev, [p.id]: e.target.value }))}
                  placeholder="e.g. Community hardship waiver approved, verified medical emergency…"
                  rows={2}
                  className="w-full text-xs bg-background border border-border rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  style={{ fontSize: "16px" }}
                  maxLength={500}
                />
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => markStatus(p.id, "forgiven")}
                  disabled={isPending}
                  className="flex-1 h-9 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-600 text-[11px] font-black disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isPending ? <span className="inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : "🤝 Forgive"}
                </button>
                <button
                  onClick={() => markStatus(p.id, "written_off")}
                  disabled={isPending}
                  className="flex-1 h-9 rounded-lg bg-muted border border-border text-muted-foreground text-[11px] font-black disabled:opacity-50 active:scale-95 transition-all"
                >
                  {isPending ? <span className="inline-block w-3 h-3 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" /> : "📝 Write Off"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {pledges.length > 5 && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full text-xs text-primary underline py-1"
        >{showAll ? "Show less" : `Show all ${pledges.length}`}</button>
      )}
    </div>
  );
}

// ── Audit Log Table ───────────────────────────────────────────────────────────
// ── Narrow API shapes for the audit-log synthesis fetch ──────────────────────
// These intentionally only declare the fields actually used — not the full
// AdminUser/Report shapes — so the mapping code below is fully typed without
// needing `as any`.
interface AuditApiReport {
  id: number;
  status: string;
  reviewed_at?: string | null;
  reviewed_by?: number | null;
  reported_user_id?: number | null;
  admin_notes?: string | null;
  type?: string | null;
  created_at: string;
}
interface AuditApiUser {
  id: number;
  is_suspended?: boolean;
  trust_score?: number | null;
  name?: string | null;
  email?: string | null;
  suspended_reason?: string | null;
  suspended_at?: string | null;
  created_at?: string;
}

// Synthesises a unified audit timeline from multiple admin-accessible endpoints:
//   • Resolved user reports   → shows who was warned/banned and by whom
//   • Moderated requests      → flagged request approvals/rejections
// This is the best available audit trail given there is no dedicated audit_log
// table. If a future migration adds one, replace the fetches below with a single
// GET /api/admin/audit-log call.
// Shared CSV cell sanitizer for all admin CSV exports.
// Neutralizes spreadsheet formula injection (Excel/Sheets execute a cell
// starting with =, +, -, or @ as a formula when the CSV is opened) by
// prefixing those cells with a leading apostrophe before quoting — the
// apostrophe forces the cell to be treated as text in every major
// spreadsheet app without altering the visible value.
function csvEscapeField(val: string) {
  const safe = /^[=+\-@]/.test(val) ? `'${val}` : val;
  return `"${safe.replace(/"/g, '""')}"`;
}

function AuditLogTable() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const tok = getToken();
    const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
    Promise.all([
      fetch(`${BASE}/api/reports`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${BASE}/api/admin/accounts?limit=100`, { headers }).then(r => r.ok ? r.json() : []),
    ])
      .then(([reports, users]: [AuditApiReport[], AuditApiUser[]]) => {
        const reportEntries: AuditLogEntry[] = reports
          .filter((r) => r.status !== "pending" && r.reviewed_at)
          .map((r) => ({
            id: r.id,
            user_id: r.reviewed_by ?? 0,
            action: r.status === "resolved_banned" ? "BANNED" :
                    r.status === "resolved_warned" ? "WARNED" :
                    r.status === "resolved_dismissed" ? "DISMISSED" :
                    r.status === "under_review" ? "REVIEWING" : r.status.toUpperCase(),
            target_user_id: r.reported_user_id ?? undefined,
            details: r.admin_notes || `Report type: ${TYPE_LABELS[r.type ?? ""] ?? r.type}`,
            created_at: r.reviewed_at ?? r.created_at,
            admin_name: "Admin",
          }));

        const userEntries: AuditLogEntry[] = users
          .filter((u) => u.is_suspended || (u.trust_score !== null && u.trust_score !== undefined && u.trust_score <= -1))
          .map((u, i) => ({
            id: 10000 + i,
            user_id: 0,
            action: u.trust_score != null && u.trust_score <= -1 ? "BANNED" : "SUSPENDED",
            target_user_id: u.id,
            details: u.suspended_reason || `Account moderation — ${u.name ?? "user"}`,
            created_at: u.suspended_at ?? u.created_at ?? new Date().toISOString(),
            admin_name: "System",
          }));

        // Merge, deduplicate by id, sort newest first
        const seen = new Set<number>();
        const merged = [...reportEntries, ...userEntries]
          .filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        setEntries(merged);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = entries.filter(e =>
    !filter ||
    e.action.toLowerCase().includes(filter.toLowerCase()) ||
    e.details.toLowerCase().includes(filter.toLowerCase())
  );

  const exportCsv = () => {
    setExporting(true);
    try {
      const header = ["id", "action", "target_user_id", "admin_name", "details", "timestamp_iso"];
      const rows = filtered.map(e => [
        String(e.id),
        e.action,
        e.target_user_id != null ? String(e.target_user_id) : "",
        e.admin_name ?? "",
        e.details,
        e.created_at,
      ]);
      const csv = [header, ...rows].map(row => row.map(csvEscapeField).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${filtered.length} audit entries` });
    } catch (err) {
      toast({ title: (err as Error).message ?? "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Audit Log</div>
        <button
          onClick={exportCsv}
          disabled={exporting || loading || filtered.length === 0}
          className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
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
function _BulkHelperApprovals() {
  const [pending, setPending] = useState<PendingHelper[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const tok = getToken();
    if (!hasLoadedRef.current) setLoading(true);
    fetch(`${BASE}/api/admin/helper-applications?status=pending`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: PendingHelper[]) => {
        if (Array.isArray(data)) { setPending(data); hasLoadedRef.current = true; }
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

  if (loading && !hasLoadedRef.current) return (
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

// ── Hard-Delete User Button ───────────────────────────────────────────────────
// Calls DELETE /users/:id — permanent. Requires typing the user's name in full.
function HardDeleteUserButton({ userId, userName, onDeleted }: {
  userId: number; userName: string; onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const doDelete = async () => {
    if (confirm.trim().toLowerCase() !== userName.toLowerCase()) return;
    setDeleting(true);
    try {
      const res = await fetch(`${BASE}/api/users/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        toast({ title: `${userName} permanently deleted` });
        onDeleted();
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: b.error ?? "Delete failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setDeleting(false); }
  };

  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} style={{ touchAction: "manipulation" }}
        className="w-full flex items-center gap-3 p-4 bg-muted/40 border border-border rounded-2xl active:scale-[0.98] transition-all">
        <X className="w-5 h-5 text-muted-foreground" />
        <div className="text-left">
          <div className="font-black text-sm text-muted-foreground">Hard Delete Account</div>
          <div className="text-xs text-muted-foreground/60">Permanent — all data removed</div>
        </div>
      </button>
    );
  }

  return (
    <div className="border border-destructive/40 rounded-2xl p-4 space-y-3 bg-destructive/5">
      <div className="text-xs text-destructive font-bold leading-relaxed">
        ⚠️ Permanently deletes all data for <strong>{userName}</strong> — requests, wallet, transactions, history. Cannot be undone.
      </div>
      <div className="text-xs text-muted-foreground">Type the user's name to confirm:</div>
      <input type="text" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={userName}
        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-destructive"
        style={{ fontSize: "16px" }} autoFocus />
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => { setExpanded(false); setConfirm(""); }}
          className="h-10 rounded-xl border border-border text-sm text-muted-foreground font-bold">Cancel</button>
        <button onClick={doDelete}
          disabled={confirm.trim().toLowerCase() !== userName.toLowerCase() || deleting}
          className="h-10 rounded-xl bg-destructive text-white text-sm font-black disabled:opacity-40 active:scale-95 transition-all">
          {deleting ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Delete Forever"}
        </button>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────
// ── Pending Account Approvals ─────────────────────────────────────────────────
// ALL new registrations (individual, org, business, sponsor, Google OAuth) now
// start as approval_status='pending' and land here for admin review before the
// account can be used. The card re-fetches whenever refreshTick changes (driven
// by the 30s admin auto-refresh) and when a WS new_account_pending event fires.
function PendingAccountsCard({ refreshTick = 0 }: { refreshTick?: number }) {
  const [pending, setPending] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const hasLoadedRef = useRef(false);

  const load = useCallback(() => {
    const tok = getToken();
    if (!hasLoadedRef.current) setLoading(true);
    fetch(`${BASE}/api/admin/accounts?approval_status=pending&limit=200`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => {
        // The endpoint returns a raw array (not { users, total }) unlike GET /users
        if (Array.isArray(data)) { setPending(data as AdminUser[]); hasLoadedRef.current = true; }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Re-fetch on admin panel's global 30s tick and on initial mount
  useEffect(() => { load(); }, [load, refreshTick]);

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
      toast({ title: status === "approved" ? "✅ Account approved — user can now log in" : "Account denied" });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const ACCOUNT_TYPE_LABEL: Record<string, { label: string; color: string }> = {
    individual:   { label: "Individual", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    organization: { label: "Organization", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    business:     { label: "Business", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    sponsor:      { label: "Sponsor", color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  };

  // Always render the card even when empty so the admin can see "all clear"
  return (
    <div className={`border rounded-2xl p-4 space-y-3 transition-colors ${
      pending.length > 0
        ? "bg-yellow-500/10 border-yellow-500/30"
        : "bg-card border-border"
    }`}>
      <div className="flex items-center justify-between">
        <div className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
          pending.length > 0 ? "text-yellow-500" : "text-muted-foreground"
        }`}>
          <Clock className="w-3.5 h-3.5" />
          New User Applications
          {pending.length > 0 && (
            <span className="ml-1 bg-yellow-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {loading && pending.length === 0 && (
        <div className="text-xs text-muted-foreground py-2 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading applications…
        </div>
      )}

      {!loading && pending.length === 0 && (
        <div className="text-xs text-muted-foreground py-1 flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
          No pending applications — all accounts reviewed.
        </div>
      )}

      {pending.map(u => {
        const ext = u as AdminUser & { organization_name?: string; account_type?: string; created_at?: string };
        const typeInfo = ACCOUNT_TYPE_LABEL[ext.account_type ?? "individual"] ?? ACCOUNT_TYPE_LABEL.individual;
        const joinedAt = ext.created_at ? new Date(ext.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
        return (
          <div key={u.id} className="bg-background border border-border rounded-xl p-3 space-y-2.5">
            {/* User info row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-bold truncate">{u.name}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                    {typeInfo.label}
                  </span>
                  {u.is_helper && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-primary/15 text-primary border-primary/30">
                      Helper
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">{u.email}</div>
                {ext.organization_name && (
                  <div className="text-[10px] text-primary mt-0.5 font-semibold">{ext.organization_name}</div>
                )}
                {joinedAt && (
                  <div className="text-[10px] text-muted-foreground mt-1">Applied {joinedAt}</div>
                )}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => decide(u.id, "denied")}
                disabled={processing === u.id}
                className="flex-1 h-9 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50 active:opacity-70"
              >
                Deny
              </button>
              <button
                onClick={() => decide(u.id, "approved")}
                disabled={processing === u.id}
                className="flex-1 h-9 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-black disabled:opacity-50 active:opacity-70 transition-colors"
              >
                {processing === u.id ? "Processing…" : "Approve ✓"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Pending Business Approvals ────────────────────────────────────────────────
interface PendingBusiness {
  id: number;
  legal_name: string;
  display_name: string;
  address: string | null;
  phone: string | null;
  approval_status: string;
  created_by_user_id: number;
  created_at: string;
  owner_name?: string;
  owner_email?: string;
}

function PendingBusinessesCard() {
  const [pending, setPending] = useState<PendingBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);

  const load = useCallback(() => {
    const tok = getToken();
    fetch(`${BASE}/api/admin/businesses`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: PendingBusiness[]) => {
        if (Array.isArray(data)) setPending(data.filter(b => b.approval_status === "pending"));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (businessId: number, status: "approved" | "rejected") => {
    setProcessing(businessId);
    try {
      const tok = getToken();
      const res = await fetch(`${BASE}/api/admin/businesses/${businessId}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ approval_status: status }),
      });
      if (!res.ok) throw new Error("Failed");
      setPending(prev => prev.filter(b => b.id !== businessId));
      toast({ title: status === "approved" ? "Business approved ✅" : "Business rejected" });
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  if (loading || pending.length === 0) return null;

  return (
    <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 space-y-3">
      <div className="text-xs font-black uppercase tracking-wider text-blue-600 flex items-center gap-1.5">
        <Package className="w-3.5 h-3.5" /> Pending Business Applications ({pending.length})
      </div>
      {pending.map(b => (
        <div key={b.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{b.display_name}</div>
            <div className="text-xs text-muted-foreground truncate">{b.legal_name}</div>
            {b.address && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{b.address}</div>}
            {b.owner_name && <div className="text-[10px] text-primary mt-0.5">Owner: {b.owner_name}</div>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => decide(b.id, "rejected")}
              disabled={processing === b.id}
              className="h-9 px-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50"
            >Reject</button>
            <button
              onClick={() => decide(b.id, "approved")}
              disabled={processing === b.id}
              className="h-9 px-3 rounded-lg bg-green-500 text-white text-xs font-black disabled:opacity-50"
            >Approve</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab({ refreshTick = 0 }: { refreshTick?: number }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const hasLoadedRef = useRef(false);
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const [showHelperOnly, setShowHelperOnly] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Debounced server-side search — searching client-side over only the first
  // 200 fetched rows meant an admin could never find users past that cutoff,
  // and the displayed count could silently plateau below the true total.
  // The server now accepts ?q= for full-table name/email search and returns
  // the true total count so "Showing X of Y" is always accurate.
  useEffect(() => {
    const tok = getToken();
    // Only show the full-screen spinner on the very first load — subsequent
    // refreshes (refreshTick, search) keep existing data visible while
    // the new page loads. This eliminates flash-empty on every poll tick.
    if (!hasLoadedRef.current) setLoading(true);
    // AbortController cancels any in-flight request when the search term changes
    // before the 300ms debounce fires, preventing stale-results races where a
    // slower earlier response arrives after a faster later one.
    const controller = new AbortController();
    const handle = setTimeout(() => {
      const qParam = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : "";
      fetch(`${BASE}/api/users?limit=200${qParam}`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        signal: controller.signal,
      })
        .then(r => {
          if (!r.ok) throw new Error(`Server error: ${r.status}`);
          return r.json() as Promise<{ users?: AdminUser[]; total?: number }>;
        })
        .then((data) => {
          setUsers(Array.isArray(data.users) ? data.users : []);
          setTotal(typeof data.total === "number" ? data.total : null);
          hasLoadedRef.current = true;
          setLoading(false);
        })
        .catch(err => {
          if (err instanceof DOMException && err.name === "AbortError") return; // cancelled — ignore
          // Don't wipe existing data on a transient network error — keep the
          // previous rows visible so admins don't see a blank list on a blip.
          if (!hasLoadedRef.current) setUsers([]);
          setLoading(false);
        });
    }, search.trim() ? 300 : 0); // 300ms debounce for search; instant on first load
    return () => { clearTimeout(handle); controller.abort(); };
  }, [search, refreshTick]);

  // Helper filter is client-side only (applied over the already-fetched page).
  // Server-side filtering by helper status could be added later if needed.
  const filtered = users.filter(u => !showHelperOnly || u.is_helper);

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
      <PendingAccountsCard refreshTick={refreshTick} />
      <PendingBusinessesCard />
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
        <div className="text-xs text-muted-foreground">
          {search.trim()
            ? `${filtered.length} match${filtered.length !== 1 ? "es" : ""}${typeof total === "number" ? ` of ${total} total` : ""}`
            : showHelperOnly
              ? `${filtered.length} helper${filtered.length !== 1 ? "s" : ""}${typeof total === "number" ? ` (${total} total users)` : ""}`
              : typeof total === "number"
                ? `${total} user${total !== 1 ? "s" : ""} registered`
                : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}
        </div>
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
                {(user as AdminUser & { approval_status?: string }).approval_status === "pending" && (
                  <span className="text-[10px] bg-yellow-500/10 text-yellow-600 border border-yellow-500/30 px-2 py-0.5 rounded-full font-bold">Pending</span>
                )}
                {(user as AdminUser & { approval_status?: string }).approval_status === "denied" && (
                  <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full font-bold">Denied</span>
                )}
                {(user as AdminUser & { account_type?: string }).account_type && (user as AdminUser & { account_type?: string }).account_type !== "individual" && (
                  <span className="text-[10px] text-muted-foreground capitalize px-2 py-0.5 rounded-full border border-border">{(user as AdminUser & { account_type?: string }).account_type}</span>
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
                  onClick={async () => {
                    const tok = getToken();
                    try {
                      const res = await fetch(`${BASE}/api/users/${actionUser.id}/toggle-admin`, {
                        method: "PATCH",
                        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
                      });
                      if (!res.ok) { toast({ title: "Failed to update admin status", variant: "destructive" }); return; }
                      const { is_admin } = await res.json() as { is_admin: boolean };
                      toast({ title: is_admin ? `✅ ${actionUser.name} is now an admin` : `🔒 Admin removed from ${actionUser.name}` });
                      setUsers(prev => prev.map(u => u.id === actionUser.id ? { ...u, is_admin } : u));
                      setActionUser(null);
                    } catch {
                      toast({ title: "Network error", variant: "destructive" });
                    }
                  }}
                  style={{ touchAction: "manipulation" }}
                  className="w-full flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl active:scale-[0.98] transition-all"
                >
                  <ShieldCheck className="w-5 h-5 text-blue-400" />
                  <div className="text-left">
                    <div className="font-black text-sm text-blue-400">
                      {actionUser.is_admin ? "Remove Admin" : "Grant Admin"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {actionUser.is_admin
                        ? "Revoke admin access for this user"
                        : "Give this user full admin access"}
                    </div>
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
                <HardDeleteUserButton userId={actionUser.id} userName={actionUser.name} onDeleted={() => {
                  setActionUser(null);
                  setUsers(prev => prev.filter(u => u.id !== actionUser.id));
                }} />
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

// ── Legacy Nia Toggle — sub-component used inside NiaTab ─────────────────────
// Controls the independent `legacy_nia_enabled` setting that gates Nia AI
// inside the Legacy RPG game mode. This is separate from the global Nia toggle:
// Legacy game AI defaults to ENABLED; the global chat toggle does not affect it.
function LegacyNiaToggle({ hdrs }: { hdrs: () => Record<string, string> }) {
  const [enabled,   setEnabled]   = useState<boolean | null>(null);
  const [saving,    setSaving]    = useState(false);
  const BASE = "";

  useEffect(() => {
    fetch(`${BASE}/api/admin/legacy-nia-status`, { headers: hdrs() })
      .then(r => r.json())
      .then((d: { legacy_nia_enabled?: boolean }) => setEnabled(d.legacy_nia_enabled ?? true))
      .catch(() => setEnabled(true)); // default enabled if fetch fails
  }, [hdrs]);

  const toggle = async () => {
    if (enabled === null) return;
    setSaving(true);
    try {
      const r = await fetch(`${BASE}/api/admin/legacy-nia-toggle`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", ...hdrs() },
        body:    JSON.stringify({ enabled: !enabled }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as { legacy_nia_enabled?: boolean };
      setEnabled(d.legacy_nia_enabled ?? !enabled);
      toast({ title: d.legacy_nia_enabled ? "✅ Legacy Nia enabled" : "🔴 Legacy Nia disabled" });
    } catch (err) {
      toast({ title: (err as Error).message ?? "Toggle failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <span className="font-black text-sm">Legacy RPG — Nia AI</span>
        <span className="ml-auto text-[11px] text-muted-foreground">Independent of global toggle</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Nia AI powers narrative generation, quest hints, dialogue, and world regeneration inside
        Legacy game mode. This toggle is independent of the global Nia chat toggle above — Legacy
        game AI defaults to <strong>enabled</strong>.
      </p>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${enabled ? "text-green-500" : "text-muted-foreground"}`}>
          {enabled === null ? "Loading…" : enabled ? "Legacy Nia: Active" : "Legacy Nia: Disabled"}
        </span>
        <button
          role="switch"
          aria-checked={enabled ?? false}
          disabled={enabled === null || saving}
          onClick={toggle}
          style={{ touchAction: "manipulation" }}
          className={`relative w-14 h-7 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${enabled ? "bg-amber-500" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-7" : "translate-x-0"}`} />
        </button>
      </div>
    </div>
  );
}

// ── Nia Tab ───────────────────────────────────────────────────────────────────
function NiaTab() {
  const [niaEnabled, setNiaEnabled] = useState<boolean | null>(null);
  const [lastToggledAt, setLastToggledAt] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [confirmPending, setConfirmPending] = useState<boolean | null>(null);
  const [broadcastConfirm, setBroadcastConfirm] = useState<string | null>(null);
  const [memoryStats, setMemoryStats] = useState<{ users: number; entries: number } | null>(null);
  const [costData, setCostData] = useState<NiaCostData | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costAlert, setCostAlert] = useState<{ alert: boolean; threshold: number; todayCost: number; message: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [wsReceived, setWsReceived] = useState<{ enabled: boolean; at: string } | null>(null);
  const [toggleReason, setToggleReason] = useState("");
  const [auditLog, setAuditLog] = useState<NiaAuditEntry[] | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditExporting, setAuditExporting] = useState(false);

  const hdrs = useCallback(() => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {} as Record<string, string>;
  }, []);

  const loadStatus = useCallback(async (quiet = false) => {
    try {
      const r = await fetch(`${BASE}/api/admin/nia-status`, { headers: hdrs() });
      if (r.ok) {
        const d = await r.json() as { enabled: boolean; last_toggled_at: string | null };
        setNiaEnabled(d.enabled);
        if (d.last_toggled_at) setLastToggledAt(d.last_toggled_at);
      } else if (!quiet) toast({ title: `Nia status unavailable (${r.status})`, variant: "destructive" });
    } catch { if (!quiet) toast({ title: "Could not reach server", variant: "destructive" }); }
  }, [hdrs]);

  // ── Initial load: status + memory + cost alert + cost data ───────────────
  useEffect(() => {
    loadStatus();
    fetch(`${BASE}/api/admin/nia-memory-stats`, { headers: hdrs() })
      .then(r => r.ok ? r.json() : null).then(d => { if (d) setMemoryStats(d); }).catch(() => null);
    fetch(`${BASE}/api/admin/nia-cost-alert`, { headers: hdrs() })
      .then(r => r.ok ? r.json() : null).then(d => { if (d) setCostAlert(d); }).catch(() => null);
    setCostLoading(true);
    fetch(`${BASE}/api/admin/nia-costs?days=7`, { headers: hdrs() })
      .then(r => r.ok ? r.json() : null)
      .then((d: NiaCostData | null) => { if (d) setCostData(d); setCostLoading(false); })
      .catch(() => setCostLoading(false));
  }, [loadStatus, hdrs]);

  // ── 30-second status auto-refresh ────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => loadStatus(true), 30_000);
    return () => clearInterval(id);
  }, [loadStatus]);

  // ── WS instant kill-switch — admin tab sees its own broadcast immediately ─
  useEffect(() => {
    const unsub = wsSubscribe((event) => {
      if (
        event.type === ("nia_status" as WsEventType) &&
        typeof (event.payload as Record<string, unknown>)?.enabled === "boolean"
      ) {
        const p = event.payload as { enabled: boolean; toggled_at?: string; source?: string };
        setNiaEnabled(p.enabled);
        if (p.toggled_at) setLastToggledAt(p.toggled_at);
        if (p.source === "admin_toggle") {
          setWsReceived({ enabled: p.enabled, at: new Date().toLocaleTimeString() });
          setTimeout(() => setWsReceived(null), 8_000);
        }
      }
    });
    return unsub;
  }, []);

  const loadAuditLog = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const r = await fetch(`${BASE}/api/admin/nia-audit-log?limit=25`, { headers: hdrs() });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json() as { entries: NiaAuditEntry[] };
      setAuditLog(data.entries ?? []);
    } catch {
      setAuditError("Could not load audit history");
    } finally {
      setAuditLoading(false);
    }
  }, [hdrs]);

  useEffect(() => { loadAuditLog(); }, [loadAuditLog]);

  const exportAuditCsv = async () => {
    setAuditExporting(true);
    try {
      const r = await fetch(`${BASE}/api/admin/nia-audit-log?limit=200`, { headers: hdrs() });
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const data = await r.json() as { entries: NiaAuditEntry[] };
      const entries = data.entries ?? [];
      const header = ["id", "action", "admin_email", "admin_user_id", "reason", "timestamp_iso"];
      const rows = entries.map(e => [
        String(e.id),
        e.enabled ? "enabled" : "disabled",
        e.admin_email,
        String(e.admin_user_id),
        e.reason ?? "",
        e.created_at,
      ]);
      const csv = [header, ...rows].map(row => row.map(csvEscapeField).join(",")).join("\r\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nia-kill-switch-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${entries.length} audit entries` });
    } catch (err) {
      toast({ title: (err as Error).message ?? "Export failed", variant: "destructive" });
    } finally {
      setAuditExporting(false);
    }
  };

  const submitToggle = async (enabled: boolean) => {
    setConfirmPending(null);
    setToggling(true);
    setBroadcastConfirm(null);
    try {
      const res = await fetch(`${BASE}/api/admin/nia-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs() },
        body: JSON.stringify({ enabled, reason: toggleReason.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Toggle failed");
      }
      const data = await res.json() as { enabled: boolean; toggled_at: string };
      setNiaEnabled(data.enabled);
      if (data.toggled_at) setLastToggledAt(data.toggled_at);
      setBroadcastConfirm(
        data.enabled
          ? "✅ Nia enabled — WS broadcast sent to all users instantly"
          : "🔴 Nia disabled — WS broadcast sent to all users instantly"
      );
      setTimeout(() => setBroadcastConfirm(null), 7_000);
      toast({ title: data.enabled ? "✅ Nia enabled" : "🔴 Nia disabled" });
      setToggleReason("");
      loadAuditLog();
    } catch (err) {
      toast({ title: (err as Error).message ?? "Toggle failed", variant: "destructive" });
    } finally {
      setToggling(false);
    }
  };

  const runNiaTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const r = await fetch(`${BASE}/api/nia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs() },
        body: JSON.stringify({
          message: "ping — admin test",
          sessionId: `admin-test-${Date.now()}`,
        }),
      });
      if (r.status === 503) {
        setTestResult({ ok: false, message: "503 — Nia is disabled (kill-switch is working ✅)" });
      } else if (r.ok) {
        // SSE stream — just check first byte
        const text = await r.text();
        const hasContent = text.trim().length > 0;
        setTestResult({ ok: true, message: hasContent ? "✅ Nia responded — chat is live" : "⚠️ Response was empty" });
      } else {
        const body = await r.json().catch(() => ({})) as { error?: string };
        setTestResult({ ok: false, message: `Error ${r.status}: ${body.error ?? "unknown"}` });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error reaching /api/nia/chat" });
    } finally {
      setTestLoading(false);
    }
  };

  // Format "last toggled" timestamp for display
  const fmtToggled = (iso: string | null): string => {
    if (!iso) return "Never";
    try {
      const d = new Date(iso);
      const diffMs = Date.now() - d.getTime();
      const diffMins = Math.floor(diffMs / 60_000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return d.toLocaleDateString();
    } catch { return iso; }
  };

  return (
    <div className="space-y-4">

      {/* ── WS instant broadcast confirmation ── */}
      <AnimatePresence>
        {broadcastConfirm && (
          <motion.div
            key="broadcast-confirm"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold ${
              niaEnabled
                ? "bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400"
                : "bg-destructive/10 border border-destructive/30 text-destructive"
            }`}
          >
            <Zap className="w-4 h-4 shrink-0" />
            <span className="flex-1">{broadcastConfirm}</span>
          </motion.div>
        )}
        {wsReceived && (
          <motion.div
            key="ws-received"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl px-3 py-2 bg-primary/10 border border-primary/20 text-[11px] text-primary font-bold"
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            WS confirmed {wsReceived.enabled ? "ENABLED" : "DISABLED"} at {wsReceived.at}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Daily cost alert banner ── */}
      {costAlert?.alert && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-3"
        >
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-destructive">AI Cost Alert</div>
            <div className="text-xs text-muted-foreground mt-0.5">{costAlert.message}</div>
          </div>
        </motion.div>
      )}
      {costAlert && !costAlert.alert && (
        <div className="flex items-center gap-2 text-[11px] text-green-500 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Today's AI cost <strong>${costAlert.todayCost.toFixed(3)}</strong> within <strong>${costAlert.threshold.toFixed(2)}</strong>/day threshold</span>
        </div>
      )}

      {/* ── Main status card ── */}
      <motion.div
        layout
        className={`rounded-2xl border p-5 transition-colors ${
          niaEnabled === false ? "bg-destructive/5 border-destructive/30" : "bg-card border-border"
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              niaEnabled === false ? "bg-destructive/10" : "bg-primary/10"
            }`}>
              <Bot className={`w-5 h-5 ${niaEnabled === false ? "text-destructive" : "text-primary"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm">Nia AI Status</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {niaEnabled === null ? (
                  <span className="text-xs text-muted-foreground">Checking…</span>
                ) : (
                  <>
                    <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${
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
              {lastToggledAt && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Last changed: {fmtToggled(lastToggledAt)}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Manual refresh button */}
            <button
              onClick={() => loadStatus()}
              disabled={toggling}
              style={{ touchAction: "manipulation" }}
              className="w-8 h-8 rounded-xl border border-border flex items-center justify-center active:bg-muted disabled:opacity-40"
              title="Refresh status"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={niaEnabled ?? false}
              disabled={niaEnabled === null || toggling}
              onClick={() => setConfirmPending(!niaEnabled)}
              style={{ touchAction: "manipulation" }}
              className={`relative w-14 h-7 rounded-full transition-colors disabled:opacity-40 ${
                niaEnabled ? "bg-green-500" : "bg-muted"
              }`}
            >
              {toggling ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                </span>
              ) : (
                <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  niaEnabled ? "translate-x-7" : "translate-x-0"
                }`} />
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── What this toggle controls ── */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Toggle affects</div>
        {[
          { icon: MessageSquare, label: "Chat", desc: "POST /api/nia/chat → 503 when off", affected: true },
          { icon: Activity, label: "Voice TTS", desc: "POST /api/nia/voice/speak → 503 when off", affected: true },
          { icon: Sparkles, label: "Context injection", desc: "GET /api/nia/context still available", affected: false },
          { icon: Zap, label: "Crisis suggestions", desc: "Crisis resources still served", affected: false },
          { icon: LifeBuoy, label: "24h check-in AI", desc: "Check-in worker uses direct API", affected: false },
        ].map(({ icon: Icon, label, desc, affected }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon className={`w-3.5 h-3.5 shrink-0 ${affected ? "text-foreground" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <span className={`text-[11px] font-bold ${affected ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              <span className="text-[10px] text-muted-foreground ml-2">{desc}</span>
            </div>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
              affected
                ? (niaEnabled === false ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-600 dark:text-green-400")
                : "bg-muted text-muted-foreground"
            }`}>
              {affected ? (niaEnabled === false ? "OFF" : "ON") : "unaffected"}
            </span>
          </div>
        ))}
      </div>

      {/* ── Test Nia button ── */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Live Test</div>
          <button
            onClick={runNiaTest}
            disabled={testLoading}
            style={{ touchAction: "manipulation" }}
            className="flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 active:bg-primary/20 disabled:opacity-50"
          >
            {testLoading ? <><RefreshCw className="w-3 h-3 animate-spin" /> Testing…</> : <><Zap className="w-3 h-3" /> Send Test Ping</>}
          </button>
        </div>
        <div className="text-[10px] text-muted-foreground">Sends "ping — admin test" to /api/nia/chat to verify kill-switch is working as expected.</div>
        <AnimatePresence>
          {testResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className={`overflow-hidden rounded-xl px-3 py-2 text-[11px] font-bold ${
                testResult.ok
                  ? "bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400"
                  : "bg-muted border border-border text-foreground"
              }`}
            >
              {testResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── System info grid ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Persistence</div>
          <div className="text-sm font-bold text-green-500">DB-backed</div>
          <div className="text-[10px] text-muted-foreground">Survives redeploys</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Kill-switch</div>
          <div className="text-sm font-bold">3 layers</div>
          <div className="text-[10px] text-muted-foreground">Proxy + Voice + WS push</div>
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
              <div className="mb-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                  Reason (optional, logged for compliance)
                </label>
                <textarea
                  value={toggleReason}
                  onChange={e => setToggleReason(e.target.value.slice(0, 500))}
                  placeholder="e.g. cost spike, safety incident, scheduled maintenance…"
                  rows={2}
                  style={{ fontSize: "16px" }}
                  className="w-full mt-1 rounded-xl border border-border bg-background p-2.5 text-sm resize-none"
                />
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

      {/* Legacy Nia AI — independent toggle for Legacy RPG game mode */}
      <LegacyNiaToggle hdrs={hdrs} />

      {/* Kill-switch audit history — legal/compliance paper trail */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
            <span className="font-black text-sm">Kill-Switch Audit Log</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportAuditCsv}
              disabled={auditExporting || auditLoading}
              style={{ touchAction: "manipulation" }}
              className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground active:text-foreground disabled:opacity-50"
            >
              {auditExporting
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
              CSV
            </button>
            <button
              onClick={() => loadAuditLog()}
              disabled={auditLoading}
              style={{ touchAction: "manipulation" }}
              className="text-[11px] font-bold text-muted-foreground active:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${auditLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        {auditLoading && !auditLog ? (
          <div className="text-[11px] text-muted-foreground text-center py-3">Loading history…</div>
        ) : auditError ? (
          <div className="text-[11px] text-destructive text-center py-3">{auditError}</div>
        ) : !auditLog || auditLog.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-3">No toggle history yet</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {auditLog.map(entry => (
              <div key={entry.id} className="flex items-start gap-2.5 border-b border-border/60 pb-2 last:border-0 last:pb-0">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${entry.enabled ? "bg-green-500" : "bg-destructive"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{entry.enabled ? "Enabled" : "Disabled"} by {entry.admin_email}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                  {entry.reason && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 break-words">“{entry.reason}”</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────
// ── Flagged Help Requests — content moderation ────────────────────────────────
function FlaggedRequestsSection() {
  const [items, setItems] = useState<FlaggedRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/requests/flagged`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setItems(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as {error?:string}; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, action: "approve" | "reject") => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE}/api/admin/requests/${id}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        toast({ title: action === "approve" ? "Request approved — now visible" : "Request rejected and cancelled" });
        setItems(prev => prev.filter(r => r.id !== id));
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: body.error ?? "Action failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  if (loading && !hasLoadedRef.current) return <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (loadError && items.length === 0) return <div className="flex items-center gap-2 text-sm text-destructive py-6 justify-center"><AlertCircle className="w-4 h-4 shrink-0" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>;

  if (items.length === 0) return (
    <div className="text-center py-14">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 text-green-400/40" />
      <div className="font-bold text-sm text-muted-foreground">No flagged requests</div>
      <div className="text-xs text-muted-foreground/60 mt-1">All help requests passed automated moderation</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
        <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{items.length} request{items.length !== 1 ? "s" : ""} flagged by automated moderation</span>
        <button onClick={load} className="ml-auto w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><RefreshCw className="w-3 h-3" /></button>
      </div>
      {items.map(item => (
        <div key={item.id} className="bg-card border border-yellow-500/20 rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{item.title}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.requester_name} · {item.requester_email}</div>
              {item.category && <div className="text-[10px] text-muted-foreground mt-0.5">Category: {item.category}</div>}
              {item.moderation_reason && (
                <div className="mt-1.5 flex items-start gap-1.5 bg-yellow-500/10 rounded-xl px-2.5 py-1.5">
                  <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 shrink-0" />
                  <span className="text-[11px] text-yellow-600 dark:text-yellow-400 leading-relaxed">{item.moderation_reason}</span>
                </div>
              )}
              {item.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-3 leading-relaxed">{item.description}</p>}
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(item.created_at)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => decide(item.id, "reject")}
              disabled={processing === item.id}
              className="h-9 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50 active:scale-95 transition-all"
            >{processing === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "✕ Reject"}</button>
            <button
              onClick={() => decide(item.id, "approve")}
              disabled={processing === item.id}
              className="h-9 rounded-xl bg-green-500 text-white text-xs font-black disabled:opacity-50 active:scale-95 transition-all"
            >{processing === item.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "✓ Approve"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Post Moderation — gratitude posts pending review ──────────────────────────
function PostModerationSection() {
  const [posts, setPosts] = useState<GratitudePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/moderation-queue`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setPosts(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as {error?:string}; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, decision: "approve" | "reject") => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE}/api/admin/moderation-queue/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) {
        toast({ title: decision === "approve" ? "Post approved — now live" : "Post rejected and removed" });
        setPosts(prev => prev.filter(p => p.id !== id));
      } else {
        toast({ title: "Action failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  if (loading && !hasLoadedRef.current) return <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (loadError && posts.length === 0) return <div className="flex items-center gap-2 text-sm text-destructive py-6 justify-center"><AlertCircle className="w-4 h-4 shrink-0" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>;

  if (posts.length === 0) return (
    <div className="text-center py-14">
      <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400/40" />
      <div className="font-bold text-sm text-muted-foreground">No posts pending review</div>
      <div className="text-xs text-muted-foreground/60 mt-1">Community feed is fully moderated</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-3">
        <Megaphone className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-bold text-primary">{posts.length} gratitude post{posts.length !== 1 ? "s" : ""} awaiting review</span>
        <button onClick={load} className="ml-auto w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><RefreshCw className="w-3 h-3" /></button>
      </div>
      {posts.map(post => (
        <div key={post.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{post.author_name}</div>
              {post.moderation_reason && (
                <div className="mt-1 text-[10px] text-yellow-500 bg-yellow-500/10 rounded-lg px-2 py-1">Flag: {post.moderation_reason}</div>
              )}
              <p className="text-sm text-foreground mt-2 leading-relaxed">{post.content}</p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(post.created_at)}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => decide(post.id, "reject")}
              disabled={processing === post.id}
              className="h-9 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50 active:scale-95 transition-all"
            >{processing === post.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Remove Post"}</button>
            <button
              onClick={() => decide(post.id, "approve")}
              disabled={processing === post.id}
              className="h-9 rounded-xl bg-green-500 text-white text-xs font-black disabled:opacity-50 active:scale-95 transition-all"
            >{processing === post.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Publish ✓"}</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Griot Globe Tab — reported story moderation queue ──────────────────────────
interface GriotStoryReport {
  id: number;
  reporter_id: number;
  reported_griot_story_id: number;
  type: string;
  description: string;
  status: "pending" | "under_review" | "resolved_dismissed" | "resolved_warned" | "resolved_banned";
  admin_notes: string | null;
  created_at: string;
  reporter_name: string | null;
  reporter_email: string | null;
  story_title: string | null;
  story_text_content: string | null;
  story_status: string;
  story_visibility: string;
  story_diaspora_tag: string | null;
  story_author_id: number;
  story_author_name: string | null;
  story_created_at: string;
}

// Groups all resolved_banned and resolved_dismissed reports by story for the audit view.
interface BannedStoryAuditGroup {
  storyId: number;
  storyTitle: string | null;
  storyAuthorName: string | null;
  storyAuthorId: number;
  storyDiasporaTag: string | null;
  storyStatus: string;
  bannedAt: string; // earliest resolved_banned timestamp
  reports: GriotStoryReport[]; // all reports for this story (banned + dismissed)
}

function buildBannedAuditGroups(reports: GriotStoryReport[]): BannedStoryAuditGroup[] {
  // Only stories that have at least one resolved_banned report
  const bannedStoryIds = new Set<number>(
    reports
      .filter((r: GriotStoryReport) => r.status === "resolved_banned")
      .map((r: GriotStoryReport) => r.reported_griot_story_id)
  );
  // Group all reports for banned stories by story id
  const byStory: Record<number, GriotStoryReport[]> = {};
  for (const r of reports) {
    if (!bannedStoryIds.has(r.reported_griot_story_id)) continue;
    const key = r.reported_griot_story_id;
    if (!byStory[key]) byStory[key] = [];
    byStory[key].push(r);
  }
  return Object.entries(byStory).map(([key, reps]) => {
    const storyId = Number(key);
    const sorted = (reps as GriotStoryReport[]).slice().sort(
      (a: GriotStoryReport, b: GriotStoryReport) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const first = sorted[0] as GriotStoryReport;
    // bannedAt = earliest resolved_banned timestamp (deterministic regardless of API order)
    const bannedAt = sorted
      .filter((r: GriotStoryReport) => r.status === "resolved_banned")
      .reduce((earliest: string, r: GriotStoryReport) =>
        !earliest || new Date(r.created_at).getTime() < new Date(earliest).getTime()
          ? r.created_at
          : earliest,
        ""
      );
    const bannedReport = sorted.find((r: GriotStoryReport) => r.status === "resolved_banned") ?? first;
    return {
      storyId,
      storyTitle: first.story_title,
      storyAuthorName: first.story_author_name,
      storyAuthorId: first.story_author_id,
      storyDiasporaTag: first.story_diaspora_tag,
      storyStatus: bannedReport.story_status,
      bannedAt,
      reports: sorted,
    };
  }).sort((a: BannedStoryAuditGroup, b: BannedStoryAuditGroup) =>
    new Date(b.bannedAt).getTime() - new Date(a.bannedAt).getTime()
  );
}

/** Compact audit history for a single story — all reports shown oldest-first with action + reason. */
function BannedStoryAuditCard({ group }: { group: BannedStoryAuditGroup }) {
  const [expanded, setExpanded] = useState(false);
  const ACTION_COLOR: Record<string, string> = {
    resolved_banned: "bg-destructive/15 text-destructive border-destructive/30",
    resolved_dismissed: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
    resolved_warned: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    pending: "bg-muted text-muted-foreground border-border",
    under_review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <div className="bg-card border border-destructive/20 rounded-2xl overflow-hidden">
      {/* Story header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ touchAction: "manipulation" }}
        className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
          <Ban className="w-4 h-4 text-destructive" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{group.storyTitle || "Untitled story"}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            By {group.storyAuthorName ?? `User #${group.storyAuthorId}`}
            {group.storyDiasporaTag && <span className="ml-1 text-[10px]">· {group.storyDiasporaTag}</span>}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            {group.reports.length} report{group.reports.length !== 1 ? "s" : ""} · banned {fmtDate(group.bannedAt)}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">Banned</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Audit timeline — collapses by default */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
            Full Report History
          </div>
          {group.reports.map((r, i) => (
            <div key={r.id} className="flex gap-3">
              {/* Timeline connector */}
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border ${ACTION_COLOR[r.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                  {i + 1}
                </div>
                {i < group.reports.length - 1 && <div className="w-px flex-1 bg-border min-h-[12px]" />}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ACTION_COLOR[r.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                    {r.status.replace("resolved_", "").toUpperCase()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{fmtDate(r.created_at)}</span>
                </div>
                <div className="text-[11px] font-semibold mt-0.5">{r.type.replace(/_/g, " ")}</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">{r.description}</div>
                {r.admin_notes && (
                  <div className="text-[10px] text-primary/70 mt-0.5 italic">Admin note: {r.admin_notes}</div>
                )}
                <div className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Reported by {r.reporter_name ?? r.reporter_email ?? `User #${r.reporter_id}`}
                </div>
              </div>
            </div>
          ))}
          {/* Show text content of the story at the bottom if available */}
          {group.reports[0]?.story_text_content && (
            <div className="mt-2 p-2.5 bg-muted/30 rounded-xl">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Story Content</div>
              <p className="text-[11px] text-foreground/80 leading-relaxed line-clamp-5">
                &ldquo;{group.reports[0].story_text_content}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GriotReportsSection() {
  const [reports, setReports] = useState<GriotStoryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<"queue" | "audit">("queue");
  const [statusFilter, setStatusFilter] = useState<"pending" | "all">("pending");
  const [processing, setProcessing] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      // For audit view we always fetch all; for queue we respect the filter
      const allUrl = `${BASE}/api/reports/griot-stories`;
      const queueUrl = statusFilter === "all"
        ? allUrl
        : `${BASE}/api/reports/griot-stories?status=pending`;
      const url = view === "audit" ? allUrl : queueUrl;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setReports(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as { error?: string }; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, [statusFilter, view]);

  useEffect(() => { load(); }, [load]);

  const decide = async (report: GriotStoryReport, status: "resolved_dismissed" | "resolved_banned") => {
    setProcessing(report.id);
    try {
      const res = await fetch(`${BASE}/api/reports/${report.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast({ title: status === "resolved_banned" ? "Story removed from public view" : "Report dismissed — story stays up" });
        setReports(prev => statusFilter === "pending" && view === "queue"
          ? prev.filter(r => r.id !== report.id)
          : prev.map(r => r.id === report.id ? { ...r, status } : r));
      } else {
        toast({ title: "Action failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const auditGroups = view === "audit" ? buildBannedAuditGroups(reports) : [];
  const queueReports = view === "queue" ? reports : [];

  if (loading && !hasLoadedRef.current) return <div className="flex justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (loadError && reports.length === 0) return <div className="flex items-center gap-2 text-sm text-destructive py-6 justify-center"><AlertCircle className="w-4 h-4 shrink-0" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>;

  return (
    <div className="space-y-3">
      {/* View toggle */}
      <div className="flex gap-2 items-center">
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          {(["queue", "audit"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ touchAction: "manipulation" }}
              className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {v === "queue" ? "📋 Review Queue" : "🔍 Banned Story Audit"}
            </button>
          ))}
        </div>
        <button onClick={load} className="ml-auto w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted" title="Refresh">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Queue view */}
      {view === "queue" && (
        <>
          <div className="flex gap-2">
            {(["pending", "all"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ touchAction: "manipulation" }}
                className={`text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"}`}>
                {s === "pending" ? "Pending" : "All"}
              </button>
            ))}
          </div>

          {queueReports.length === 0 ? (
            <div className="text-center py-14">
              <BookOpen className="w-10 h-10 mx-auto mb-3 text-green-400/40" />
              <div className="font-bold text-sm text-muted-foreground">
                {statusFilter === "pending" ? "No stories awaiting review" : "No reported stories yet"}
              </div>
              <div className="text-xs text-muted-foreground/60 mt-1">Griot Globe reports appear here for moderation</div>
            </div>
          ) : (
            queueReports.map(r => (
              <div key={r.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                      {r.story_title || "Untitled story"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      By {r.story_author_name ?? `User #${r.story_author_id}`} · story status: <span className="font-mono">{r.story_status}</span>
                    </div>
                    {r.story_diaspora_tag && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">Tagged: {r.story_diaspora_tag}</div>
                    )}
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                    r.status === "pending" ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" :
                    r.status === "resolved_banned" ? "bg-destructive/10 text-destructive" :
                    r.status === "resolved_dismissed" ? "bg-green-500/10 text-green-600 dark:text-green-400" :
                    "bg-muted text-muted-foreground"
                  }`}>{r.status.replace("resolved_", "")}</span>
                </div>

                {r.story_text_content && (
                  <p className="text-xs text-foreground/80 leading-relaxed line-clamp-4 bg-muted/30 rounded-xl p-2.5">
                    &ldquo;{r.story_text_content}&rdquo;
                  </p>
                )}

                <div className="flex items-start gap-1.5 bg-destructive/10 rounded-xl px-2.5 py-1.5">
                  <Flag className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold text-destructive">{r.type.replace(/_/g, " ")}</span> — {r.description}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Reported by {r.reporter_name ?? r.reporter_email ?? `User #${r.reporter_id}`} · {fmtDate(r.created_at)}
                    </div>
                  </div>
                </div>

                {r.status === "pending" || r.status === "under_review" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => decide(r, "resolved_dismissed")}
                      disabled={processing === r.id}
                      className="h-9 rounded-xl border border-border bg-muted/40 text-xs font-black disabled:opacity-50 active:scale-95 transition-all"
                    >{processing === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Dismiss — story stays up"}</button>
                    <button
                      onClick={() => decide(r, "resolved_banned")}
                      disabled={processing === r.id}
                      className="h-9 rounded-xl bg-destructive text-destructive-foreground text-xs font-black disabled:opacity-50 active:scale-95 transition-all"
                    >{processing === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Remove story"}</button>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    {r.status === "resolved_banned" ? "Story pulled from public view." : "Report resolved — no action taken."}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}

      {/* Audit view — full history grouped by banned story */}
      {view === "audit" && (
        <>
          <div className="bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary" />
            <span>
              Shows every story that has been banned, with the <strong>full chain of reports</strong> that led to the decision — including any prior dismissed reports. Expand a card to see the complete timeline.
            </span>
          </div>
          {auditGroups.length === 0 ? (
            <div className="text-center py-14">
              <Ban className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <div className="font-bold text-sm text-muted-foreground">No banned stories yet</div>
              <div className="text-xs text-muted-foreground/60 mt-1">Banned stories with their full report history will appear here</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-[11px] text-muted-foreground px-1">{auditGroups.length} banned stor{auditGroups.length !== 1 ? "ies" : "y"}</div>
              {auditGroups.map(g => (
                <BannedStoryAuditCard key={g.storyId} group={g} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UserReportsSection({ authed, refreshTick = 0 }: { authed: boolean; refreshTick?: number }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  const hasLoadedRef = useRef(false);
  const fetchReports = useCallback(async (status?: string) => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const url = status && status !== "all" ? `${BASE}/api/reports?status=${status}` : `${BASE}/api/reports`;
      const tok = getToken();
      const res = await fetch(url, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!res.ok) throw new Error("Failed");
      setReports(await res.json() as Report[]);
      hasLoadedRef.current = true;
    } catch { toast({ title: "Could not load reports", variant: "destructive" }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) fetchReports(statusFilter); }, [statusFilter, authed, fetchReports, refreshTick]);

  const handleReviewed = (updated: Report) => setReports(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
  const pendingCount = reports.filter(r => r.status === "pending").length;
  const filtered = statusFilter === "all" ? reports : reports.filter(r => r.status === statusFilter);

  return (
    <>
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{pendingCount} report{pendingCount !== 1 ? "s" : ""} awaiting review</span>
          <button onClick={() => setStatusFilter("pending")} style={{ touchAction: "manipulation" }}
            className="ml-auto text-[10px] font-black bg-yellow-500 text-black px-2.5 py-1 rounded-full">View</button>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
        {STATUS_FILTERS.map(s => {
          const meta = STATUS_LABELS[s];
          const isActive = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(s)} style={{ touchAction: "manipulation" }}
              className={`shrink-0 text-[11px] font-bold px-3 py-2 rounded-full border transition-all ${isActive ? s === "all" ? "bg-primary text-primary-foreground border-primary" : (meta?.color ?? "bg-primary text-primary-foreground border-primary") : "bg-card border-border text-muted-foreground"}`}>
              {s === "all" ? "All" : meta?.label ?? s}
            </button>
          );
        })}
      </div>
      {loading && <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span></div>}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16"><CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400/40" /><div className="font-bold text-sm text-muted-foreground">{statusFilter === "all" ? "No reports yet" : "Queue is clear"}</div></div>
      )}
      {!loading && filtered.map(report => {
        const statusMeta = STATUS_LABELS[report.status] ?? { label: report.status, color: "bg-muted text-muted-foreground border-border" };
        return (
          <motion.button key={report.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            onClick={() => setSelectedReport(report)} style={{ touchAction: "manipulation" }}
            className="w-full text-left bg-card border border-border rounded-2xl p-4 active:border-primary/40 transition-all">
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
      {selectedReport && <ReportDetailSheet report={selectedReport} onClose={() => setSelectedReport(null)} onReviewed={handleReviewed} />}
    </>
  );
}

// ── Reports Tab — 3-section moderation hub ────────────────────────────────────
function ReportsTab({ authed, refreshTick = 0 }: { authed: boolean; refreshTick?: number }) {
  const [section, setSection] = useState<"user-reports" | "flagged" | "posts">("user-reports");

  const SECTIONS = [
    { key: "user-reports", label: "User Reports", icon: Flag },
    { key: "flagged",      label: "Flagged Requests", icon: ShieldAlert },
    { key: "posts",        label: "Post Moderation", icon: Megaphone },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Section sub-nav */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
        {SECTIONS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setSection(key)} style={{ touchAction: "manipulation" }}
            className={`shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2 rounded-full border transition-all ${section === key ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>
      {section === "user-reports" && <UserReportsSection authed={authed} refreshTick={refreshTick} />}
      {section === "flagged"      && <FlaggedRequestsSection />}
      {section === "posts"        && <PostModerationSection />}
    </div>
  );
}


// ── Disputes Tab ─────────────────────────────────────────────────────────────
interface AdminDispute {
  id: number;
  request_id: number;
  opened_by: number;
  against_user: number | null;
  reason: string;
  details: string | null;
  status: string;
  resolution: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  created_at: string;
  opener_name: string | null;
  opener_email: string | null;
  against_user_name: string | null;
}

const DISPUTE_STATUS_COLORS: Record<string, string> = {
  open:         "bg-destructive/10 text-destructive border-destructive/30",
  under_review: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
  resolved:     "bg-primary/10 text-primary border-primary/30",
  dismissed:    "bg-muted text-muted-foreground border-border",
};

function DisputesTab() {
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"open" | "under_review" | "resolved" | "dismissed" | "all">("open");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const fetchDisputes = (status = statusFilter) => {
    if (!hasLoadedRef.current) setLoading(true);
    const tok = getToken();
    fetch(`${BASE}/api/admin/disputes?status=${status}&limit=100`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : { disputes: [] })
      .then((data: { disputes?: AdminDispute[] }) => {
        setDisputes(Array.isArray(data.disputes) ? data.disputes : []);
        hasLoadedRef.current = true;
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchDisputes(); }, [statusFilter]); // eslint-disable-line

  const updateStatus = async (disputeId: number, newStatus: "under_review" | "resolved" | "dismissed") => {
    setSubmitting(disputeId);
    const tok = getToken();
    try {
      const res = await fetch(`${BASE}/api/admin/disputes/${disputeId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ status: newStatus, resolution: resolution.trim() || undefined }),
      });
      if (res.ok) {
        setResolution("");
        setExpanded(null);
        fetchDisputes();
        toast({ title: `Dispute ${newStatus.replace("_", " ")}`, description: `Dispute #${disputeId} updated.` });
      } else {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Error", description: (err as { error?: string }).error ?? "Failed to update dispute", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-wider">Dispute Resolution</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review and resolve disputes filed by requesters and helpers
          </p>
        </div>
        <button onClick={() => fetchDisputes()} style={{ touchAction: "manipulation" }}
          className="p-2 rounded-xl border border-border bg-card active:bg-muted">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 flex-wrap">
        {(["open", "under_review", "resolved", "dismissed", "all"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} style={{ touchAction: "manipulation" }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-colors ${
              statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground bg-background active:bg-muted"
            }`}>
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading disputes…
        </div>
      )}

      {!loading && disputes.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Gavel className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {statusFilter !== "all" ? statusFilter.replace("_", " ") : ""} disputes</p>
        </div>
      )}

      {disputes.map(d => (
        <div key={d.id} className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Header row */}
          <button
            className="w-full flex items-start gap-3 p-4 text-left active:bg-muted/50"
            onClick={() => { setExpanded(expanded === d.id ? null : d.id); setResolution(""); }}
            style={{ touchAction: "manipulation" }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-black text-muted-foreground">#{d.id}</span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${DISPUTE_STATUS_COLORS[d.status] ?? ""}`}>
                  {d.status.replace("_", " ")}
                </span>
                <span className="text-xs text-muted-foreground">Request #{d.request_id}</span>
              </div>
              <p className="text-sm font-bold text-foreground truncate">{d.reason}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                By {d.opener_name ?? "Unknown"} ({d.opener_email ?? "—"})
                {d.against_user_name && <> · vs {d.against_user_name}</>}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
              {new Date(d.created_at).toLocaleDateString()}
            </span>
          </button>

          {/* Expanded detail */}
          <AnimatePresence>
            {expanded === d.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-t border-border"
              >
                <div className="p-4 space-y-3">
                  {d.details && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Details</p>
                      <p className="text-sm text-foreground bg-muted/40 rounded-xl p-3 whitespace-pre-wrap">{d.details}</p>
                    </div>
                  )}
                  {d.resolution && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Admin resolution</p>
                      <p className="text-sm text-foreground bg-primary/5 border border-primary/20 rounded-xl p-3">{d.resolution}</p>
                    </div>
                  )}

                  {/* Resolution input — only if not already terminal */}
                  {d.status !== "resolved" && d.status !== "dismissed" && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Resolution note (optional)</p>
                      <textarea
                        value={resolution}
                        onChange={e => setResolution(e.target.value)}
                        placeholder="Describe what action was taken or why this is dismissed…"
                        rows={3}
                        style={{ fontSize: 16 }}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground resize-none focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}

                  {/* Action buttons */}
                  {d.status !== "resolved" && d.status !== "dismissed" && (
                    <div className="flex gap-2 flex-wrap">
                      {d.status === "open" && (
                        <button
                          onClick={() => updateStatus(d.id, "under_review")}
                          disabled={submitting === d.id}
                          style={{ touchAction: "manipulation" }}
                          className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-yellow-500/15 border border-yellow-500/30 text-yellow-500 active:bg-yellow-500/25 disabled:opacity-50"
                        >
                          {submitting === d.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Mark Under Review"}
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(d.id, "resolved")}
                        disabled={submitting === d.id}
                        style={{ touchAction: "manipulation" }}
                        className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-primary/15 border border-primary/30 text-primary active:bg-primary/25 disabled:opacity-50"
                      >
                        {submitting === d.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Resolve"}
                      </button>
                      <button
                        onClick={() => updateStatus(d.id, "dismissed")}
                        disabled={submitting === d.id}
                        style={{ touchAction: "manipulation" }}
                        className="py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-muted border border-border text-muted-foreground active:bg-border disabled:opacity-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {(d.status === "resolved" || d.status === "dismissed") && d.resolved_at && (
                    <p className="text-xs text-muted-foreground">
                      {d.status === "resolved" ? "Resolved" : "Dismissed"} on {new Date(d.resolved_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
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
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const tok = getToken();
    if (!hasLoadedRef.current) setLoading(true);
    fetch(`${BASE}/api/users?limit=500`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {},
    })
      .then(r => r.ok ? r.json() : { users: [] })
      .then((data: { users?: PendingHelper[] }) => {
        const users = Array.isArray(data.users) ? data.users : [];
        setPending(users.filter(u => u.helper_status === "pending"));
        hasLoadedRef.current = true;
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

  if (loading && !hasLoadedRef.current) return (
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

// ── Operations Tab — Cashouts, Hardship Requests, Business Approvals ─────────
// Consolidates three admin backend capabilities (GET /admin/cashouts,
// GET/DELETE /admin/hardship-requests, GET/PATCH /admin/businesses) that
// previously had zero admin UI — they existed only as backend routes,
// invisible to admins. Each sub-panel polls independently so this tab stays
// live without a full-page refresh.
interface AdminCashoutRow {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  amount: string;
  state: string;
  stripe_transfer_id: string | null;
  stripe_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface AdminHardshipRequest {
  id: number;
  title: string;
  pledge_amount: string | null;
  pledge_paid: string | null;
  pledge_status: string | null;
  hardship_note: string | null;
  hardship_requested_at: string;
  requester_id: number;
  requester_name: string | null;
  requester_email: string | null;
}

interface AdminBusiness {
  id: number;
  legal_name: string;
  display_name: string;
  address: string | null;
  phone: string | null;
  approval_status: string;
  created_at: string;
}

const CASHOUT_STATE_COLOR: Record<string, string> = {
  completed: "text-primary border-primary/30 bg-primary/10",
  pending: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
  processing: "text-yellow-500 border-yellow-500/30 bg-yellow-500/10",
  failed: "text-destructive border-destructive/30 bg-destructive/10",
};

function CashoutsPanel() {
  const [rows, setRows] = useState<AdminCashoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedRef = useRef(false);

  const fetchRows = () => {
    if (!hasLoadedRef.current) setLoading(true);
    const tok = getToken();
    fetch(`${BASE}/api/admin/cashouts`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: AdminCashoutRow[]) => { setRows(Array.isArray(data) ? data : []); hasLoadedRef.current = true; setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchRows(); const t = setInterval(fetchRows, 60000); return () => clearInterval(t); }, []);

  const stuck = rows.filter(r => (r.state === "pending" || r.state === "processing") &&
    Date.now() - new Date(r.created_at).getTime() > 24 * 60 * 60 * 1000);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-wider">Cashouts</h3>
        <button onClick={fetchRows} style={{ touchAction: "manipulation" }} className="p-2 rounded-xl border border-border bg-card active:bg-muted">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {stuck.length > 0 && (
        <div className="px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/30 text-xs font-bold text-destructive">
          {stuck.length} cashout{stuck.length === 1 ? "" : "s"} pending &gt;24h — check Stripe transfer status
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No cashouts yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="p-3 rounded-xl border border-border bg-card space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{r.user_name ?? `User #${r.user_id}`}</span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${CASHOUT_STATE_COLOR[r.state] ?? "text-muted-foreground border-border bg-muted"}`}>
                  {r.state}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{r.user_email}</p>
              <div className="flex items-center justify-between text-xs">
                <span className="font-black">${parseFloat(r.amount).toFixed(2)}</span>
                <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              {r.stripe_transfer_id && <p className="text-[10px] text-muted-foreground font-mono truncate">transfer: {r.stripe_transfer_id}</p>}
              {r.notes && <p className="text-[10px] text-muted-foreground">{r.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HardshipPanel() {
  const [rows, setRows] = useState<AdminHardshipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchRows = () => {
    if (!hasLoadedRef.current) setLoading(true);
    const tok = getToken();
    fetch(`${BASE}/api/admin/hardship-requests`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: AdminHardshipRequest[]) => { setRows(Array.isArray(data) ? data : []); hasLoadedRef.current = true; setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchRows(); const t = setInterval(fetchRows, 60000); return () => clearInterval(t); }, []);

  // Dismiss only clears the flag from this queue — the pledge stays active and
  // the requester can still get repayment reminders later. Forgive/write-off
  // actually close the pledge on their ledger. Surfacing all three here (not
  // just Dismiss) avoids admins thinking "dismiss" resolves the hardship.
  const resolve = async (id: number, action: "forgiven" | "written_off" | "dismiss") => {
    setBusy(id);
    const tok = getToken();
    try {
      let res: Response;
      if (action === "dismiss") {
        res = await fetch(`${BASE}/api/admin/requests/${id}/hardship`, {
          method: "DELETE",
          headers: tok ? { Authorization: `Bearer ${tok}` } : {},
        });
      } else {
        res = await fetch(`${BASE}/api/admin/requests/${id}/pledge-status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
          body: JSON.stringify({ pledge_status: action }),
        });
      }
      if (res.ok) {
        setRows(prev => prev.filter(r => r.id !== id));
        const label = action === "forgiven" ? "Pledge forgiven" : action === "written_off" ? "Pledge written off" : "Dismissed — pledge stays active, reminders will resume";
        toast({ title: label });
      } else {
        toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
      }
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-wider">Hardship Requests</h3>
        <button onClick={fetchRows} style={{ touchAction: "manipulation" }} className="p-2 rounded-xl border border-border bg-card active:bg-muted">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No pending hardship requests.</p>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{r.requester_name ?? `User #${r.requester_id}`}</span>
                <span className="text-xs font-black">${r.pledge_amount ?? "0"}</span>
              </div>
              <p className="text-xs text-muted-foreground">{r.title}</p>
              {r.hardship_note && <p className="text-xs italic text-muted-foreground">"{r.hardship_note}"</p>}
              <p className="text-[10px] text-muted-foreground">Requested {new Date(r.hardship_requested_at).toLocaleDateString()}</p>
              <div className="flex gap-1.5">
                <button onClick={() => resolve(r.id, "forgiven")} disabled={busy === r.id} style={{ touchAction: "manipulation" }}
                  className="flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-primary/10 border border-primary/30 text-primary active:bg-primary/20 disabled:opacity-50">
                  {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Forgive"}
                </button>
                <button onClick={() => resolve(r.id, "written_off")} disabled={busy === r.id} style={{ touchAction: "manipulation" }}
                  className="flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-muted border border-border text-muted-foreground active:bg-border disabled:opacity-50">
                  Write Off
                </button>
                <button onClick={() => resolve(r.id, "dismiss")} disabled={busy === r.id} style={{ touchAction: "manipulation" }}
                  className="flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider bg-muted border border-border text-muted-foreground active:bg-border disabled:opacity-50">
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BusinessApprovalsPanel() {
  const [rows, setRows] = useState<AdminBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const hasLoadedRef = useRef(false);

  const fetchRows = () => {
    if (!hasLoadedRef.current) setLoading(true);
    const tok = getToken();
    fetch(`${BASE}/api/admin/businesses`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} })
      .then(r => r.ok ? r.json() : [])
      .then((data: AdminBusiness[]) => { setRows(Array.isArray(data) ? data : []); hasLoadedRef.current = true; setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchRows(); const t = setInterval(fetchRows, 60000); return () => clearInterval(t); }, []);

  const setApproval = async (id: number, approval_status: "approved" | "rejected") => {
    setBusy(id);
    const tok = getToken();
    try {
      const res = await fetch(`${BASE}/api/admin/businesses/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ approval_status }),
      });
      if (res.ok) {
        fetchRows();
        toast({ title: `Business ${approval_status}` });
      } else {
        toast({ title: "Error", description: "Failed to update business.", variant: "destructive" });
      }
    } finally { setBusy(null); }
  };

  const pending = rows.filter(r => r.approval_status === "pending" || r.approval_status === "pending_review");
  const other = rows.filter(r => !pending.includes(r));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-wider">Business Accounts</h3>
        <button onClick={fetchRows} style={{ touchAction: "manipulation" }} className="p-2 rounded-xl border border-border bg-card active:bg-muted">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No business accounts yet.</p>
      ) : (
        <div className="space-y-2">
          {[...pending, ...other].map(r => (
            <div key={r.id} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">{r.display_name}</span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  r.approval_status === "approved" ? "text-primary border-primary/30 bg-primary/10" :
                  r.approval_status === "rejected" ? "text-destructive border-destructive/30 bg-destructive/10" :
                  "text-yellow-500 border-yellow-500/30 bg-yellow-500/10"
                }`}>{r.approval_status}</span>
              </div>
              <p className="text-xs text-muted-foreground">{r.legal_name}</p>
              {r.address && <p className="text-[10px] text-muted-foreground">{r.address}</p>}
              {(r.approval_status === "pending" || r.approval_status === "pending_review") && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setApproval(r.id, "approved")} disabled={busy === r.id} style={{ touchAction: "manipulation" }}
                    className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-primary/15 border border-primary/30 text-primary active:bg-primary/25 disabled:opacity-50">
                    {busy === r.id ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Approve"}
                  </button>
                  <button onClick={() => setApproval(r.id, "rejected")} disabled={busy === r.id} style={{ touchAction: "manipulation" }}
                    className="py-2 px-4 rounded-xl text-xs font-black uppercase tracking-wider bg-muted border border-border text-muted-foreground active:bg-border disabled:opacity-50">
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OperationsTab() {
  const [sub, setSub] = useState<"cashouts" | "hardship" | "businesses">("cashouts");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["cashouts", "hardship", "businesses"] as const).map(s => (
          <button key={s} onClick={() => setSub(s)} style={{ touchAction: "manipulation" }}
            className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider border transition-colors ${
              sub === s ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground bg-background active:bg-muted"
            }`}>
            {s}
          </button>
        ))}
      </div>
      {sub === "cashouts" && <CashoutsPanel />}
      {sub === "hardship" && <HardshipPanel />}
      {sub === "businesses" && <BusinessApprovalsPanel />}
    </div>
  );
}

// ── Orgs Tab — businesses + government sponsor review queue ──────────────────
function OrgsTab({ authed }: { authed: boolean }) {
  const [businesses, setBusinesses] = useState<{
    id: number; legal_name: string; display_name: string;
    approval_status: string; created_at: string;
  }[]>([]);
  const [govSponsors, setGovSponsors] = useState<{
    id: number; entity_name: string; county: string; state: string;
    contact_name: string; contact_email: string; description: string | null;
    approval_status: string; created_at: string;
    submitter_name?: string | null; submitter_email?: string | null;
  }[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [fundingId, setFundingId] = useState<number | null>(null);
  const [fundAmount, setFundAmount] = useState("");

  const authHeaders = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const [bRes, gRes] = await Promise.all([
        fetch(`${BASE}/api/admin/businesses`, { headers: authHeaders() }),
        fetch(`${BASE}/api/admin/gov-sponsors`, { headers: authHeaders() }),
      ]);
      if (bRes.ok) setBusinesses(await bRes.json());
      if (gRes.ok) setGovSponsors(await gRes.json());
      if (bRes.ok || gRes.ok) hasLoadedRef.current = true;
    } catch { /* non-critical */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) load(); }, [authed, load]);

  const decideBusiness = async (id: number, status: "approved" | "rejected") => {
    const key = `b-${id}`;
    setProcessing(key);
    try {
      const res = await fetch(`${BASE}/api/admin/businesses/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ approval_status: status }),
      });
      if (!res.ok) throw new Error("Failed");
      setBusinesses(prev => prev.map(b => b.id === id ? { ...b, approval_status: status } : b));
      toast({ title: `Business ${status}` });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const decideGovSponsor = async (id: number, status: "approved" | "rejected") => {
    const key = `g-${id}`;
    setProcessing(key);
    try {
      const res = await fetch(`${BASE}/api/admin/gov-sponsors/${id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ approval_status: status }),
      });
      if (!res.ok) throw new Error("Failed");
      setGovSponsors(prev => prev.map(g => g.id === id ? { ...g, approval_status: status } : g));
      toast({ title: `Gov sponsor ${status}` });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const fundPool = async (id: number, entityName: string) => {
    const dollars = parseFloat(fundAmount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      toast({ title: "Enter a valid dollar amount", variant: "destructive" });
      return;
    }
    const key = `fund-${id}`;
    setProcessing(key);
    try {
      const res = await fetch(`${BASE}/api/gov-sponsors/${id}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ amount: dollars }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Funding failed");
      }
      const result = await res.json() as { new_pool_balance: number; backfilled_helpers: number };
      toast({
        title: `Pool funded! $${dollars.toFixed(2)} from ${entityName}`,
        description: `New balance: $${result.new_pool_balance.toFixed(2)}${result.backfilled_helpers > 0 ? ` · ${result.backfilled_helpers} helper(s) backfilled` : ""}`,
      });
      setFundingId(null);
      setFundAmount("");
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Funding failed", variant: "destructive" });
    } finally {
      setProcessing(null);
    }
  };

  const statusBadge = (s: string) => {
    if (s === "approved") return <span className="text-[10px] font-black text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">Approved</span>;
    if (s === "rejected") return <span className="text-[10px] font-black text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20">Rejected</span>;
    return <span className="text-[10px] font-black text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">Pending</span>;
  };

  const ActionButtons = ({ id, kind, status }: { id: number; kind: "b" | "g"; status: string }) => {
    if (status !== "pending") return null;
    const key = `${kind}-${id}`;
    const decide = kind === "b" ? decideBusiness : decideGovSponsor;
    return (
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => decide(id, "rejected")}
          disabled={processing === key}
          style={{ touchAction: "manipulation" }}
          className="h-9 rounded-xl border border-destructive/40 bg-destructive/10 text-destructive text-xs font-black disabled:opacity-50"
        >{processing === key ? <RefreshCw className="w-3 h-3 animate-spin mx-auto" /> : "Reject"}</button>
        <button
          onClick={() => decide(id, "approved")}
          disabled={processing === key}
          style={{ touchAction: "manipulation" }}
          className="h-9 rounded-xl bg-green-500 text-white text-xs font-black disabled:opacity-50"
        >{processing === key ? <RefreshCw className="w-3 h-3 animate-spin mx-auto" /> : "Approve ✓"}</button>
      </div>
    );
  };

  if (loading && !hasLoadedRef.current) return <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  const pendingBusinesses = businesses.filter(b => b.approval_status === "pending");
  const pendingGov = govSponsors.filter(g => g.approval_status === "pending");

  return (
    <div className="space-y-6 pb-8">
      {/* Business Applications */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5" />
            Business Applications
            {pendingBusinesses.length > 0 && (
              <span className="bg-yellow-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">{pendingBusinesses.length}</span>
            )}
          </div>
        </div>
        {businesses.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">No applications yet.</div>
        ) : (
          <div className="space-y-2">
            {businesses.map(b => (
              <div key={b.id} className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{b.display_name}</p>
                    <p className="text-[11px] text-muted-foreground">{b.legal_name}</p>
                    <p className="text-[10px] text-muted-foreground/70">{fmtDate(b.created_at)}</p>
                  </div>
                  {statusBadge(b.approval_status)}
                </div>
                <ActionButtons id={b.id} kind="b" status={b.approval_status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Government Sponsor Applications */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Landmark className="w-3.5 h-3.5" />
            Gov Sponsor Applications
            {pendingGov.length > 0 && (
              <span className="bg-yellow-500 text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">{pendingGov.length}</span>
            )}
          </div>
        </div>
        {govSponsors.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">No applications yet.</div>
        ) : (
          <div className="space-y-2">
            {govSponsors.map(g => (
              <div key={g.id} className="rounded-xl border border-border bg-card p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{g.entity_name}</p>
                    <p className="text-[11px] text-muted-foreground">{g.county}, {g.state}</p>
                    <p className="text-[11px] text-muted-foreground">{g.contact_name} · {g.contact_email}</p>
                    {g.submitter_name && (
                      <p className="text-[10px] text-muted-foreground/70">Submitted by {g.submitter_name} · {fmtDate(g.created_at)}</p>
                    )}
                    {g.description && <p className="text-[11px] text-muted-foreground/80 mt-1 leading-relaxed">{g.description}</p>}
                  </div>
                  {statusBadge(g.approval_status)}
                </div>
                <ActionButtons id={g.id} kind="g" status={g.approval_status} />
                {g.approval_status === "approved" && (
                  <div className="mt-2">
                    {fundingId === g.id ? (
                      <div className="flex gap-2 items-center">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                          <input
                            type="number"
                            min="1"
                            step="0.01"
                            placeholder="0.00"
                            value={fundAmount}
                            onChange={e => setFundAmount(e.target.value)}
                            className="w-full h-9 rounded-xl bg-muted/40 border border-primary/30 text-sm pl-6 pr-3 outline-none focus:ring-1 focus:ring-primary"
                            style={{ fontSize: "16px" }}
                          />
                        </div>
                        <button
                          onClick={() => fundPool(g.id, g.entity_name)}
                          disabled={processing === `fund-${g.id}`}
                          style={{ touchAction: "manipulation" }}
                          className="h-9 px-3 rounded-xl bg-primary text-black text-xs font-black disabled:opacity-50 shrink-0"
                        >{processing === `fund-${g.id}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Fund Pool"}</button>
                        <button
                          onClick={() => { setFundingId(null); setFundAmount(""); }}
                          className="h-9 px-2 rounded-xl border border-border text-xs text-muted-foreground"
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setFundingId(g.id)}
                        style={{ touchAction: "manipulation" }}
                        className="w-full h-9 rounded-xl border border-primary/40 bg-primary/10 text-primary text-xs font-black"
                      >+ Fund Community Pool</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Admin Civic Requests Tab ──────────────────────────────────────────────────
// Renders all civic-portal help requests across all government sponsors.
// Backend: GET /admin/civic/portal/requests — exists, returns joined rows
// with sponsor_entity_name, sponsor_county, sponsor_state.
// This component was referenced in JSX but never defined, causing a crash
// when the "Civic" tab was selected. Styled to match OrgsTab.
interface CivicPortalRequest {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  urgency: string | null;
  status: string;
  neighborhood: string | null;
  estimated_hours: number | null;
  created_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  government_sponsor_id: number | null;
  sponsor_entity_name: string | null;
  sponsor_county: string | null;
  sponsor_state: string | null;
}

const CIVIC_STATUS_FILTERS = ["all", "open", "claimed", "completed", "cancelled"] as const;
type CivicStatusFilter = typeof CIVIC_STATUS_FILTERS[number];

const CIVIC_STATUS_COLORS: Record<string, string> = {
  open:      "bg-green-500/15 text-green-400 border-green-500/30",
  claimed:   "bg-blue-500/15 text-blue-400 border-blue-500/30",
  completed: "bg-primary/15 text-primary border-primary/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const URGENCY_COLORS: Record<string, string> = {
  emergency: "text-destructive",
  high:      "text-orange-400",
  medium:    "text-yellow-400",
  low:       "text-muted-foreground",
};

function AdminCivicRequestsTab() {
  const [subTab, setSubTab] = useState<"requests" | "resources">("requests");
  const [requests, setRequests] = useState<CivicPortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CivicStatusFilter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const authH = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const url = statusFilter !== "all"
        ? `${BASE}/api/admin/civic/portal/requests?status=${statusFilter}&limit=200`
        : `${BASE}/api/admin/civic/portal/requests?limit=200`;
      const res = await fetch(url, { headers: authH() });
      if (res.ok) {
        const data = await res.json() as CivicPortalRequest[];
        setRequests(Array.isArray(data) ? data : []);
        hasLoadedRef.current = true;
      }
      // A failed fetch leaves the previously-loaded list on screen instead of
      // wiping it to [] — a transient network/server hiccup shouldn't read as
      // "the civic requests disappeared" to the admin.
    } catch {
      // keep whatever was already rendered
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const counts = CIVIC_STATUS_FILTERS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = s === "all" ? requests.length : requests.filter(r => r.status === s).length;
    return acc;
  }, {});

  const displayed = statusFilter === "all" ? requests : requests.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-4 pb-8">
      {/* Sub-tabs: portal requests vs the resource directory shown on the
          community map. Kept as a local toggle within the "Civic" top-level
          tab rather than a new group-nav entry — resources are a small,
          occasional-edit surface that doesn't warrant its own slot in the
          always-visible group pills. */}
      <div className="flex gap-2">
        {(["requests", "resources"] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            style={{ touchAction: "manipulation" }}
            className={`flex-1 h-9 rounded-xl border text-xs font-black capitalize transition-all ${
              subTab === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
            }`}
          >
            {t === "requests" ? "Portal Requests" : "Resource Directory"}
          </button>
        ))}
      </div>

      {subTab === "resources" ? (
        <CivicResourcesSection />
      ) : (
      <>
      {/* Header + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Civic Portal Requests</span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {requests.length}
          </span>
        </div>
        <button
          onClick={() => { void load(); }}
          disabled={loading}
          className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Community help requests posted by approved government sponsors across all counties. Each request flows through the normal claim/complete pipeline.
      </p>

      {/* Status filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {CIVIC_STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{ touchAction: "manipulation" }}
            className={`shrink-0 text-[11px] font-black px-3 py-1.5 rounded-full border capitalize transition-all ${
              statusFilter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border text-muted-foreground"
            }`}
          >
            {s === "all" ? "All" : s}
            {counts[s] > 0 && (
              <span className={`ml-1.5 ${statusFilter === s ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>
                {counts[s]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" /><span className="text-sm">Loading…</span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <Globe className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <div className="text-sm font-bold text-muted-foreground">No civic requests{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}</div>
          <div className="text-xs text-muted-foreground/60 mt-1">Approved government sponsors post needs here</div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(r => {
            const isOpen = expanded === r.id;
            return (
              <div
                key={r.id}
                className="rounded-xl border border-border bg-card overflow-hidden"
              >
                {/* Summary row */}
                <button
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  style={{ touchAction: "manipulation" }}
                  className="w-full text-left p-3 flex items-start justify-between gap-2 active:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border capitalize ${CIVIC_STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                        {r.status}
                      </span>
                      {r.urgency && (
                        <span className={`text-[10px] font-bold capitalize ${URGENCY_COLORS[r.urgency] ?? "text-muted-foreground"}`}>
                          ⚡ {r.urgency}
                        </span>
                      )}
                      {r.category && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {r.category.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-sm truncate">{r.title}</div>
                    {r.sponsor_entity_name && (
                      <div className="text-[11px] text-primary mt-0.5">
                        🏛️ {r.sponsor_entity_name}
                        {r.sponsor_county && ` · ${r.sponsor_county} County`}
                        {r.sponsor_state && `, ${r.sponsor_state}`}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {r.estimated_hours && (
                      <div className="text-[10px] font-black text-muted-foreground">{r.estimated_hours}h</div>
                    )}
                    <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(r.created_at)}</div>
                    {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-auto mt-1" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto mt-1" />}
                  </div>
                </button>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border px-3 pb-3 pt-2 space-y-2 bg-muted/20">
                    {r.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {r.neighborhood && (
                        <div>
                          <span className="text-muted-foreground/60 uppercase tracking-wider">Neighborhood</span>
                          <div className="font-bold mt-0.5">{r.neighborhood}</div>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground/60 uppercase tracking-wider">Request ID</span>
                        <div className="font-bold mt-0.5">#{r.id}</div>
                      </div>
                      {r.claimed_at && (
                        <div>
                          <span className="text-muted-foreground/60 uppercase tracking-wider">Claimed</span>
                          <div className="font-bold mt-0.5 text-blue-400">{fmtDate(r.claimed_at)}</div>
                        </div>
                      )}
                      {r.completed_at && (
                        <div>
                          <span className="text-muted-foreground/60 uppercase tracking-wider">Completed</span>
                          <div className="font-bold mt-0.5 text-green-400">{fmtDate(r.completed_at)}</div>
                        </div>
                      )}
                      {r.cancelled_at && (
                        <div>
                          <span className="text-muted-foreground/60 uppercase tracking-wider">Cancelled</span>
                          <div className="font-bold mt-0.5 text-destructive">{fmtDate(r.cancelled_at)}</div>
                        </div>
                      )}
                      {r.estimated_hours && (
                        <div>
                          <span className="text-muted-foreground/60 uppercase tracking-wider">Est. Hours</span>
                          <div className="font-bold mt-0.5">{r.estimated_hours}h</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ── Civic Resource Directory (admin CRUD) ──────────────────────────────────────
// Backend: GET/POST /admin/civic/resources, PATCH/DELETE /admin/civic/resources/:id.
// This is the org list (food pantries, shelters, legal aid, …) shown as pins in
// the community map's resource layer — previously seed-data only, no admin edit path.
interface AdminCivicResource {
  id: number;
  state: string;
  county: string;
  city: string | null;
  org_name: string;
  description: string | null;
  url: string;
  phone: string | null;
  category: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  open_hours: string | null;
  updated_at: string;
}

type ResourceFormState = {
  state: string; county: string; city: string; org_name: string; description: string;
  url: string; phone: string; category: string; address: string; latitude: string; longitude: string;
};

const EMPTY_RESOURCE_FORM: ResourceFormState = {
  state: "", county: "", city: "", org_name: "", description: "",
  url: "", phone: "", category: "", address: "", latitude: "", longitude: "",
};

function resourceToForm(r: AdminCivicResource): ResourceFormState {
  return {
    state: r.state, county: r.county, city: r.city ?? "", org_name: r.org_name,
    description: r.description ?? "", url: r.url, phone: r.phone ?? "",
    category: r.category ?? "", address: r.address ?? "",
    latitude: r.latitude != null ? String(r.latitude) : "",
    longitude: r.longitude != null ? String(r.longitude) : "",
  };
}

function CivicResourcesSection() {
  const [items, setItems] = useState<AdminCivicResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<ResourceFormState>(EMPTY_RESOURCE_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const authH = (): Record<string, string> => {
    const t = getToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const url = query.trim()
        ? `${BASE}/api/admin/civic/resources?q=${encodeURIComponent(query.trim())}&limit=200`
        : `${BASE}/api/admin/civic/resources?limit=200`;
      const res = await fetch(url, { headers: authH() });
      if (res.ok) {
        const data = await res.json() as { resources: AdminCivicResource[] };
        setItems(data.resources ?? []);
        hasLoadedRef.current = true;
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setLoadError(b.error ?? `Error ${res.status}`);
      }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  const startCreate = () => { setForm(EMPTY_RESOURCE_FORM); setEditingId("new"); };
  const startEdit = (r: AdminCivicResource) => { setForm(resourceToForm(r)); setEditingId(r.id); };
  const cancelEdit = () => { setEditingId(null); setForm(EMPTY_RESOURCE_FORM); };

  const buildPayload = () => ({
    state: form.state.trim(), county: form.county.trim(), city: form.city.trim() || null,
    org_name: form.org_name.trim(), description: form.description.trim() || null,
    url: form.url.trim(), phone: form.phone.trim() || null, category: form.category.trim() || null,
    address: form.address.trim() || null,
    latitude: form.latitude.trim() === "" ? null : Number(form.latitude),
    longitude: form.longitude.trim() === "" ? null : Number(form.longitude),
  });

  const save = async () => {
    if (!form.state.trim() || !form.county.trim() || !form.org_name.trim() || !form.url.trim()) {
      toast({ title: "State, county, org name, and URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const isNew = editingId === "new";
      const res = await fetch(
        isNew ? `${BASE}/api/admin/civic/resources` : `${BASE}/api/admin/civic/resources/${editingId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json", ...authH() },
          body: JSON.stringify(buildPayload()),
        },
      );
      if (res.ok) {
        const row = await res.json() as AdminCivicResource;
        setItems(prev => isNew ? [row, ...prev] : prev.map(i => i.id === row.id ? row : i));
        toast({ title: isNew ? "Resource added" : "Resource updated" });
        cancelEdit();
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: b.error ?? "Save failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE}/api/admin/civic/resources/${id}`, { method: "DELETE", headers: authH() });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        toast({ title: "Resource removed" });
      } else {
        toast({ title: "Delete failed", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setDeletingId(null); }
  };

  const field = (key: keyof ResourceFormState, label: string, opts?: { placeholder?: string; type?: string }) => (
    <div>
      <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{label}</label>
      <input
        type={opts?.type ?? "text"}
        value={form[key]}
        onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
        placeholder={opts?.placeholder}
        style={{ fontSize: "16px" }}
        className="w-full mt-1 h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Civic Resources</span>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{items.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { void load(); }} disabled={loading} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={startCreate} className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-black flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Food pantries, shelters, legal aid, and other community-support orgs. Rows with a latitude + longitude appear as pins on the community map; rows without one are still findable via the region-based directory but invisible on the map until geocoded.
      </p>

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search by org name, city, or state…"
        style={{ fontSize: "16px" }}
        className="w-full h-9 px-3 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {editingId !== null && (
        <div className="border border-primary/30 bg-primary/5 rounded-xl p-3 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-primary">{editingId === "new" ? "New Resource" : "Edit Resource"}</div>
          <div className="grid grid-cols-2 gap-2">
            {field("org_name", "Org Name *")}
            {field("category", "Category", { placeholder: "e.g. food_pantry" })}
            {field("state", "State *", { placeholder: "TX" })}
            {field("county", "County *")}
            {field("city", "City")}
            {field("phone", "Phone")}
          </div>
          {field("url", "Website URL *", { placeholder: "https://…" })}
          {field("address", "Street Address")}
          <div className="grid grid-cols-2 gap-2">
            {field("latitude", "Latitude", { type: "number" })}
            {field("longitude", "Longitude", { type: "number" })}
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              style={{ fontSize: "16px" }}
              className="w-full mt-1 p-3 rounded-lg bg-background border border-border text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={cancelEdit} className="h-10 rounded-xl border border-border text-sm text-muted-foreground font-bold">Cancel</button>
            <button onClick={() => void save()} disabled={saving} className="h-10 rounded-xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-50 active:scale-95">
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "Save"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center"><AlertCircle className="w-4 h-4" />{loadError}<button onClick={() => void load()} className="ml-2 underline text-xs">Retry</button></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No resources{query ? " match your search" : " yet"}.</p>
      ) : (
        <div className="space-y-2">
          {items.map(r => (
            <div key={r.id} className="border border-border rounded-xl p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">{r.org_name}</span>
                    {r.category && <span className="text-[10px] text-muted-foreground capitalize">{r.category.replace(/_/g, " ")}</span>}
                    {r.latitude != null ? (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">On map</span>
                    ) : (
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">No pin</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {[r.city, r.county ? `${r.county} County` : null, r.state].filter(Boolean).join(", ")}
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>}
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    {r.phone && <span>📞 {r.phone}</span>}
                    <span className="flex items-center gap-1 truncate"><Link className="w-3 h-3 shrink-0" />{r.url}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button onClick={() => startEdit(r)} className="h-8 rounded-lg border border-border text-[11px] font-black text-muted-foreground active:scale-95">Edit</button>
                <button onClick={() => void remove(r.id)} disabled={deletingId === r.id}
                  className="h-8 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-[11px] font-black disabled:opacity-50 active:scale-95">
                  {deletingId === r.id ? "Removing…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Crisis Mode Control ───────────────────────────────────────────────────────
function CrisisModeSection() {
  const [crisisStatus, setCrisisStatus] = useState<{
    active: boolean; level?: string; message?: string; activatedAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [level, setLevel] = useState<"info" | "warning" | "critical">("warning");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/crisis/status`);
      if (res.ok) setCrisisStatus(await res.json());
    } catch { /* non-critical */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activate = async () => {
    setActing(true);
    try {
      const res = await fetch(`${BASE}/api/crisis/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ level, message: message.trim() || undefined }),
      });
      if (res.ok) {
        setCrisisStatus(await res.json());
        toast({ title: `⚠️ Crisis mode activated (${level})` });
        setShowActivate(false);
        setMessage("");
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: b.error ?? "Failed to activate", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setActing(false); }
  };

  const deactivate = async () => {
    setActing(true);
    try {
      const res = await fetch(`${BASE}/api/crisis/deactivate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        setCrisisStatus(await res.json());
        toast({ title: "Crisis mode deactivated" });
      } else {
        toast({ title: "Failed to deactivate", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setActing(false); }
  };

  const levelColor = (l?: string) => ({
    info: "text-blue-400 bg-blue-400/10 border-blue-400/30",
    warning: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    critical: "text-destructive bg-destructive/10 border-destructive/30",
  }[l ?? "warning"] ?? "text-muted-foreground bg-muted border-border");

  if (loading && crisisStatus === null) return <div className="flex justify-center py-6"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Siren className="w-4 h-4 text-destructive" />
          <span className="text-sm font-black uppercase tracking-wider">Crisis Mode</span>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border ${crisisStatus?.active ? levelColor(crisisStatus.level) : "text-green-400 bg-green-400/10 border-green-400/30"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${crisisStatus?.active ? "bg-current animate-pulse" : "bg-green-400"}`} />
          {crisisStatus?.active ? `ACTIVE — ${(crisisStatus.level ?? "warning").toUpperCase()}` : "INACTIVE"}
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Activating crisis mode broadcasts an emergency banner to all users, surfaces crisis resource links, and triggers priority dispatch for nearby helpers. Use only for real community emergencies.
      </p>

      {crisisStatus?.active && (
        <div className={`rounded-xl border p-3 space-y-1 ${levelColor(crisisStatus.level)}`}>
          {crisisStatus.message && <p className="text-sm font-semibold leading-relaxed">{crisisStatus.message}</p>}
          {crisisStatus.activatedAt && <p className="text-[10px] opacity-70">Activated: {new Date(crisisStatus.activatedAt).toLocaleString()}</p>}
        </div>
      )}

      {crisisStatus?.active ? (
        <button onClick={deactivate} disabled={acting}
          className="w-full h-11 rounded-xl bg-green-500 text-white text-sm font-black disabled:opacity-50 active:scale-95 transition-all flex items-center justify-center gap-2">
          {acting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Deactivate Crisis Mode
        </button>
      ) : (
        <>
          {!showActivate ? (
            <button onClick={() => setShowActivate(true)}
              className="w-full h-11 rounded-xl border border-destructive/50 bg-destructive/10 text-destructive text-sm font-black active:scale-95 transition-all flex items-center justify-center gap-2">
              <Siren className="w-4 h-4" /> Activate Crisis Mode
            </button>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Severity Level</div>
              <div className="grid grid-cols-3 gap-2">
                {(["info", "warning", "critical"] as const).map(l => (
                  <button key={l} onClick={() => setLevel(l)}
                    className={`h-9 rounded-xl border text-xs font-black capitalize transition-all ${level === l ? levelColor(l) : "border-border text-muted-foreground"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Optional custom message shown to users…"
                rows={2}
                className="w-full text-sm bg-background border border-border rounded-xl p-3 resize-none focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                maxLength={400}
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowActivate(false)}
                  className="h-10 rounded-xl border border-border text-sm text-muted-foreground font-bold">Cancel</button>
                <button onClick={activate} disabled={acting}
                  className="h-10 rounded-xl bg-destructive text-white text-sm font-black disabled:opacity-50 active:scale-95">
                  {acting ? <RefreshCw className="w-4 h-4 animate-spin mx-auto" /> : "⚠️ Activate"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Civic Suggestions Review ──────────────────────────────────────────────────
function CivicSuggestionsSection() {
  const [items, setItems] = useState<CivicSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/civic-suggestions?status=pending`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setItems(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as {error?:string}; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id: number, status: "approved" | "dismissed") => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE}/api/admin/civic-suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast({ title: status === "approved" ? "Resource approved — added to directory" : "Suggestion dismissed" });
        setItems(prev => prev.filter(i => i.id !== id));
      } else { toast({ title: "Action failed", variant: "destructive" }); }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Civic Resource Suggestions</span>
          {items.length > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{items.length}</span>}
        </div>
        <button onClick={load} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground">Community-submitted links to local food banks, shelters, clinics, and services. Approve to add to the civic directory; dismiss if not relevant.</p>
      {loading ? (
        <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center"><AlertCircle className="w-4 h-4" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No pending suggestions.</p>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{item.name}</div>
                  {item.category && <div className="text-[10px] text-muted-foreground">{item.category}</div>}
                  {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                  <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                    {item.phone && <span className="flex items-center gap-1">📞 {item.phone}</span>}
                    {item.website && <span className="flex items-center gap-1"><Link className="w-3 h-3" />{item.website}</span>}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(item.created_at)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => decide(item.id, "dismissed")} disabled={processing === item.id}
                  className="h-8 rounded-lg border border-border text-[11px] font-black text-muted-foreground disabled:opacity-50 active:scale-95">Dismiss</button>
                <button onClick={() => decide(item.id, "approved")} disabled={processing === item.id}
                  className="h-8 rounded-lg bg-green-500 text-white text-[11px] font-black disabled:opacity-50 active:scale-95">Approve ✓</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Settings Tab — Community Pool wage floors and feature toggles ─────────────
function SettingsTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<{
    pool_enabled: boolean;
    pool_minimum_hourly_rate: number;
    pool_guaranteed_minimum: number;
  } | null>(null);

  const [form, setForm] = useState({
    pool_enabled: true,
    pool_minimum_hourly_rate: "15",
    pool_guaranteed_minimum: "20",
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/pool-settings", {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json() as typeof settings;
        setSettings(data);
        if (data) {
          setForm({
            pool_enabled: data.pool_enabled,
            pool_minimum_hourly_rate: String(data.pool_minimum_hourly_rate),
            pool_guaranteed_minimum: String(data.pool_guaranteed_minimum),
          });
        }
      } catch {
        toast({ title: "Failed to load pool settings", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    const hourlyRate = parseFloat(form.pool_minimum_hourly_rate);
    const flatMin = parseFloat(form.pool_guaranteed_minimum);
    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      toast({ title: "Invalid hourly rate", description: "Must be a positive number.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(flatMin) || flatMin < 0) {
      toast({ title: "Invalid flat minimum", description: "Must be 0 or greater.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pool-settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          pool_enabled: form.pool_enabled,
          pool_minimum_hourly_rate: hourlyRate,
          pool_guaranteed_minimum: flatMin,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Failed to save");
      }
      setSettings({ pool_enabled: form.pool_enabled, pool_minimum_hourly_rate: hourlyRate, pool_guaranteed_minimum: flatMin });
      toast({ title: "Pool settings saved", description: "Changes take effect immediately for all new payouts." });
    } catch (err) {
      toast({ title: "Save failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const changed =
    form.pool_enabled !== (settings?.pool_enabled ?? true) ||
    parseFloat(form.pool_minimum_hourly_rate) !== (settings?.pool_minimum_hourly_rate ?? 15) ||
    parseFloat(form.pool_guaranteed_minimum) !== (settings?.pool_guaranteed_minimum ?? 20);

  return (
    <div className="space-y-6 pb-8">

      {/* ── Nia AI Quick Controls ──────────────────────────────────── */}
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">AI & Automation</div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Nia AI Assistant</span>
          </div>
          <button
            onClick={() => onNavigate?.("nia")}
            style={{ touchAction: "manipulation" }}
            className="flex items-center gap-1 text-xs font-bold text-primary active:opacity-70"
          >
            Manage <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Toggle Nia on/off for all users instantly, review usage costs, and manage community memory from the Nia AI tab.
        </p>
      </div>

      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1">Community Pool Settings</div>

      {/* Pool on/off toggle */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">Community Pool</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              When disabled, the pool will not front payments or pay guaranteed minimums.
            </div>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, pool_enabled: !f.pool_enabled }))}
            className={`relative w-11 h-6 rounded-full transition-colors ${form.pool_enabled ? "bg-primary" : "bg-muted"}`}
            style={{ touchAction: "manipulation" }}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.pool_enabled ? "translate-x-5" : "translate-x-0"}`}
            />
          </button>
        </div>
        <div className={`text-xs font-bold text-center py-1.5 rounded-xl ${form.pool_enabled ? "bg-green-500/10 text-green-400" : "bg-destructive/10 text-destructive"}`}>
          {form.pool_enabled ? "Pool is ACTIVE — helpers will be paid" : "Pool is PAUSED — no payouts will be issued"}
        </div>
      </div>

      {/* Wage floor settings */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Helper Wage Floors</div>

        <div className="space-y-1.5">
          <label className="text-sm font-bold">Minimum Hourly Rate</label>
          <p className="text-xs text-muted-foreground">
            Used to compute the guaranteed minimum when a request has an estimated duration
            (guaranteed = max(flat minimum, hours × hourly rate)).
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-muted-foreground font-bold">$</span>
            <input
              type="number"
              min="1"
              max="999"
              step="0.25"
              value={form.pool_minimum_hourly_rate}
              onChange={(e) => setForm((f) => ({ ...f, pool_minimum_hourly_rate: e.target.value }))}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-muted-foreground text-sm">/ hr</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-bold">Flat Guaranteed Minimum</label>
          <p className="text-xs text-muted-foreground">
            Fallback floor when no hours estimate exists. Also used as the minimum when
            the hourly calculation is lower than this value.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-muted-foreground font-bold">$</span>
            <input
              type="number"
              min="0"
              max="9999"
              step="1"
              value={form.pool_guaranteed_minimum}
              onChange={(e) => setForm((f) => ({ ...f, pool_guaranteed_minimum: e.target.value }))}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-muted-foreground text-sm">flat</span>
          </div>
        </div>
      </div>

      {/* Current live values (from last save) */}
      {settings && (
        <div className="bg-muted/40 border border-border rounded-2xl p-4 space-y-2">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2">Current Live Values</div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Pool status</span>
            <span className={`font-bold ${settings.pool_enabled ? "text-green-400" : "text-destructive"}`}>
              {settings.pool_enabled ? "Active" : "Paused"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Hourly rate</span>
            <span className="font-bold">${settings.pool_minimum_hourly_rate.toFixed(2)}/hr</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Flat minimum</span>
            <span className="font-bold">${settings.pool_guaranteed_minimum.toFixed(2)}</span>
          </div>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !changed}
        className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider bg-primary text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:opacity-80 transition-opacity"
        style={{ touchAction: "manipulation" }}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {saving ? "Saving…" : changed ? "Save Changes" : "No Changes"}
      </button>

      {/* ToS version info (informational — no editable setting) */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-2">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">ToS Version Gate</div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Current enforced version: <span className="font-bold text-foreground">2026-07</span>. Users who accepted an older version are blocked from
          posting waiver-gated requests until they re-accept. To update the version, change{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[10px]">CURRENT_TOS_VERSION</code> in both{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[10px]">WaiverModal.tsx</code> and{" "}
          <code className="bg-muted px-1 py-0.5 rounded text-[10px]">requests.ts</code>.
        </p>
      </div>

      {/* ── Crisis Mode ─────────────────────────────────────────────────────── */}
      <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 pt-2">Emergency Controls</div>
      <CrisisModeSection />

      {/* ── Civic Suggestions ───────────────────────────────────────────────── */}
      <CivicSuggestionsSection />
    </div>
  );
}

// ── Neighborhoods Management ──────────────────────────────────────────────────
function NeighborhoodsSection() {
  const [items, setItems] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/city-neighborhoods`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setItems(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as {error?:string}; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleVerify = async (item: Neighborhood) => {
    setProcessing(item.id);
    try {
      const res = await fetch(`${BASE}/api/admin/city-neighborhoods/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ verified: !item.verified }),
      });
      if (res.ok) {
        toast({ title: item.verified ? "Neighborhood unverified" : "Neighborhood verified ✓" });
        setItems(prev => prev.map(n => n.id === item.id ? { ...n, verified: !n.verified } : n));
      } else { toast({ title: "Failed", variant: "destructive" }); }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const deleteItem = async (id: number) => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE}/api/admin/city-neighborhoods/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        toast({ title: "Neighborhood removed" });
        setItems(prev => prev.filter(n => n.id !== id));
      } else { toast({ title: "Delete failed", variant: "destructive" }); }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const unverified = items.filter(n => !n.verified);
  const verified = items.filter(n => n.verified);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Neighborhoods</span>
          {unverified.length > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{unverified.length} pending</span>}
        </div>
        <button onClick={load} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground">Geo-fenced neighborhood zones that appear in request matching and community feeds. Verify to make them available to users.</p>
      {loading ? (
        <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center"><AlertCircle className="w-4 h-4" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No neighborhoods configured.</p>
      ) : (
        <div className="space-y-2">
          {[...unverified, ...verified].map(n => (
            <div key={n.id} className={`flex items-center gap-3 py-2.5 px-3 rounded-xl border ${n.verified ? "border-green-500/20 bg-green-500/5" : "border-yellow-500/20 bg-yellow-500/5"}`}>
              <span className="text-lg shrink-0">{n.emoji ?? "📍"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{n.name}</div>
                <div className="text-[10px] text-muted-foreground">{n.city_key}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => toggleVerify(n)} disabled={processing === n.id}
                  className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all disabled:opacity-50 ${n.verified ? "border-green-500/30 text-green-400 bg-green-500/10" : "border-border text-muted-foreground hover:border-green-500/30 hover:text-green-400"}`}>
                  {processing === n.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : n.verified ? "✓ Verified" : "Verify"}
                </button>
                <button onClick={() => deleteItem(n.id)} disabled={processing === n.id}
                  className="w-7 h-7 rounded-lg border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 disabled:opacity-50 transition-colors">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Region Crisis Resources ───────────────────────────────────────────────────
function RegionCrisisSection() {
  const [items, setItems] = useState<RegionCrisisResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/region-crisis-resources`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setItems(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as {error?:string}; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleVerify = async (item: RegionCrisisResource) => {
    setProcessing(item.id);
    try {
      const res = await fetch(`${BASE}/api/admin/region-crisis-resources/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ verified: !item.verified }),
      });
      if (res.ok) {
        toast({ title: item.verified ? "Region unverified" : "Region crisis resources verified ✓" });
        setItems(prev => prev.map(r => r.id === item.id ? { ...r, verified: !r.verified } : r));
      } else { toast({ title: "Failed", variant: "destructive" }); }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const deleteItem = async (id: number) => {
    setProcessing(id);
    try {
      const res = await fetch(`${BASE}/api/admin/region-crisis-resources/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        toast({ title: "Region removed" });
        setItems(prev => prev.filter(r => r.id !== id));
      } else { toast({ title: "Delete failed", variant: "destructive" }); }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setProcessing(null); }
  };

  const unverified = items.filter(r => !r.verified);

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-destructive" />
          <span className="text-sm font-black uppercase tracking-wider">Region Crisis Resources</span>
          {unverified.length > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{unverified.length} unverified</span>}
        </div>
        <button onClick={load} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground">Emergency service hotlines and resources per region. Verify entries to surface them during crisis mode activation.</p>
      {loading ? (
        <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center"><AlertCircle className="w-4 h-4" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">No region crisis resources configured.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`rounded-xl border p-3 space-y-2 ${item.verified ? "border-green-500/20" : "border-yellow-500/20"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{item.region_display}</div>
                  {item.state_code && <div className="text-[10px] text-muted-foreground">{item.state_code}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">{item.resources.length} resource{item.resources.length !== 1 ? "s" : ""}: {item.resources.map(r => r.label).join(", ")}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggleVerify(item)} disabled={processing === item.id}
                    className={`text-[10px] font-black px-2 py-1 rounded-lg border transition-all disabled:opacity-50 ${item.verified ? "border-green-500/30 text-green-400" : "border-border text-muted-foreground"}`}>
                    {item.verified ? "✓" : "Verify"}
                  </button>
                  <button onClick={() => deleteItem(item.id)} disabled={processing === item.id}
                    className="w-7 h-7 rounded-lg border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 disabled:opacity-50">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cashout Queue — admin overview of all payout attempts ─────────────────────
function CashoutSection() {
  const [cashouts, setCashouts] = useState<AdminCashout[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const [loadError, setLoadError] = useState<string | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/cashouts`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) { setCashouts(await res.json()); hasLoadedRef.current = true; }
      else { const b = await res.json().catch(() => ({})) as {error?:string}; setLoadError(b.error ?? `Error ${res.status}`); }
    } catch { setLoadError("Could not reach server"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const STATE_COLORS: Record<string, string> = {
    pending:                  "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    failed:                   "text-destructive bg-destructive/10 border-destructive/20",
    completed:                "text-green-400 bg-green-400/10 border-green-400/20",
    reversed:                 "text-orange-400 bg-orange-400/10 border-orange-400/20",
    permanently_failed:       "text-destructive bg-destructive/10 border-destructive/30",
    reconciliation_required:  "text-purple-400 bg-purple-400/10 border-purple-400/20",
  };

  const STATES = ["all", "pending", "failed", "reconciliation_required", "permanently_failed", "completed", "reversed"];
  const filtered = filter === "all" ? cashouts : cashouts.filter(c => c.state === filter);
  const actionRequired = cashouts.filter(c => ["pending", "failed", "reconciliation_required", "permanently_failed"].includes(c.state)).length;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Banknote className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Cashout Queue</span>
          {actionRequired > 0 && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">{actionRequired} action needed</span>}
        </div>
        <button onClick={load} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-xs text-muted-foreground">All helper cashout attempts. Stuck rows ("pending" older than 10min, "reconciliation_required") may need manual Stripe verification.</p>
      {/* State filter pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
        {STATES.map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`shrink-0 text-[10px] font-black px-2.5 py-1 rounded-full border transition-all capitalize ${filter === s ? (STATE_COLORS[s] ?? "bg-primary text-primary-foreground border-primary") : "border-border text-muted-foreground"}`}>
            {s === "all" ? "All" : s.replace(/_/g, " ")}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : loadError ? (
        <div className="flex items-center gap-2 text-sm text-destructive py-4 justify-center"><AlertCircle className="w-4 h-4" />{loadError}<button onClick={load} className="ml-2 underline text-xs">Retry</button></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">{filter === "all" ? "No cashout records yet." : `No ${filter.replace(/_/g, " ")} cashouts.`}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-border">
              <div className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${STATE_COLORS[c.state] ?? "border-border text-muted-foreground"}`}>
                {c.state.replace(/_/g, " ")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{c.user_name ?? `User #${c.user_id}`}</div>
                <div className="text-[10px] text-muted-foreground">{c.user_email}</div>
                {c.notes && <div className="text-[10px] text-yellow-400 mt-0.5">{c.notes}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="font-black text-sm">${c.amount.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">{fmtDate(c.created_at)}</div>
                {c.stripe_transfer_id && (
                  <div className="text-[9px] text-primary truncate max-w-[80px]">{c.stripe_transfer_id}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── System Tab — worker health + hardship queue ───────────────────────────────
interface WorkerEntry {
  name: string;
  label: string;
  status: "running" | "stopped" | "no_redis" | "error";
  redisRequired: boolean;
  startedAt?: string;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  successCount: number;
  failureCount: number;
  errorMessage?: string;
}

interface HardshipRequest {
  id: number;
  title: string;
  pledge_amount: number | null;
  pledge_paid: number | null;
  pledge_status: string;
  hardship_note: string | null;
  hardship_requested_at: string | null;
  requester_id: number;
  requester_name: string;
  requester_email: string;
}

// ── Global Ops ───────────────────────────────────────────────────────────────

interface GlobalOpsData {
  gps_health: {
    helpers_online_with_gps: number;
    helpers_online_no_gps: number;
    total_online_helpers: number;
  };
  regions: Array<{
    region: string;
    helpers_online: number;
    open_requests: number;
    recent_completions: number;
  }>;
  language_distribution: Array<{ lang: string; count: number }>;
  feature_checks: {
    database: "ok" | "error";
    mapbox_token: boolean;
    nia_ai: boolean;
    nia_api_key?: boolean;         // legacy alias
    internal_secret: boolean;
    redis: boolean;
    push_vapid: boolean;
    stripe: boolean;
    background_checks: boolean;
    workers_ok: boolean;
  };
  // Actionable config status — which secrets are missing
  config_status?: {
    critical_missing: string[];
    optional_missing: string[];
    fully_configured: boolean;
    nia_service_url: string;
    notes: string;
  };
  summary: {
    total_open_requests: number;
    total_online_helpers: number;
    regions_active: number;
    last_updated: string;
  };
}

const REGION_ICONS: Record<string, string> = {
  "Africa": "🌍",
  "North America": "🌎",
  "Europe": "🏛️",
  "Caribbean": "🌴",
  "South America": "🌎",
  "Middle East": "🕌",
  "Asia": "🌏",
  "Oceania": "🏝️",
  "Other": "🌐",
};

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", pt: "Portuguese",
  sw: "Swahili", so: "Somali",  am: "Amharic", yo: "Yoruba",
  ha: "Hausa",   ig: "Igbo",    tw: "Twi",     wo: "Wolof",
  ht: "Haitian Creole", ar: "Arabic", zu: "Zulu",
};

/**
 * GlobalOpsSection — Real-time global coverage snapshot for the admin.
 *
 * Shows GPS signal health, region-by-region helper / request counts, top
 * languages in use, and automated feature-flag checks. Auto-refreshes every
 * 60 seconds so the admin always has a current picture without a manual poll.
 */
function GlobalOpsSection() {
  const [data, setData] = useState<GlobalOpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const hasLoadedRef = useRef(false);
  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true); setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/global-ops`, {
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        setData(await res.json());
        setLastRefresh(new Date());
        hasLoadedRef.current = true;
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setError(b.error ?? `Server returned ${res.status}`);
      }
    } catch { setError("Network error"); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000); // auto-refresh every 60 s
    return () => clearInterval(id);
  }, [load]);

  const checks = data?.feature_checks;

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <span className="text-sm font-black uppercase tracking-wider">Global Ops</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Live · 60s refresh</span>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-muted-foreground hidden sm:block">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {data && (
        <>
          {/* ── Summary numbers ─────────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-primary">{data.summary.total_online_helpers}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Online<br/>Helpers</div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-yellow-400">{data.summary.total_open_requests}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Open<br/>Requests</div>
            </div>
            <div className="bg-muted/40 rounded-xl p-3 text-center">
              <div className="text-xl font-black text-green-400">{data.summary.regions_active}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Regions<br/>Active</div>
            </div>
          </div>

          {/* ── GPS Signal Health ────────────────────────────────────── */}
          <div>
            <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">GPS Signal Health</div>
            <div className="flex items-center gap-3">
              {/* Visual bar */}
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                {data.gps_health.total_online_helpers > 0 ? (
                  <div
                    className="h-full bg-green-400 rounded-full transition-all"
                    style={{
                      width: `${Math.round((data.gps_health.helpers_online_with_gps / data.gps_health.total_online_helpers) * 100)}%`,
                    }}
                  />
                ) : (
                  <div className="h-full bg-muted-foreground/20 rounded-full w-full" />
                )}
              </div>
              <div className="text-xs font-black shrink-0">
                {data.gps_health.total_online_helpers > 0
                  ? `${Math.round((data.gps_health.helpers_online_with_gps / data.gps_health.total_online_helpers) * 100)}%`
                  : "—"}
              </div>
            </div>
            <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
              <span><span className="text-green-400 font-bold">{data.gps_health.helpers_online_with_gps}</span> with GPS</span>
              <span><span className="text-yellow-400 font-bold">{data.gps_health.helpers_online_no_gps}</span> IP-only</span>
            </div>
          </div>

          {/* ── Regional Coverage ────────────────────────────────────── */}
          {data.regions.length > 0 ? (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Coverage by Region</div>
              <div className="divide-y divide-border">
                {data.regions.map(r => (
                  <div key={r.region} className="flex items-center gap-3 py-2">
                    <span className="text-base w-6 text-center shrink-0">{REGION_ICONS[r.region] ?? "🌐"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold">{r.region}</div>
                    </div>
                    <div className="flex gap-3 text-[11px] shrink-0">
                      <span className="text-primary font-bold" title="Online helpers">{r.helpers_online} 🧑</span>
                      <span className="text-yellow-400 font-bold" title="Open requests">{r.open_requests} 📋</span>
                      <span className="text-green-400 font-bold" title="Completed last 7 days">{r.recent_completions} ✓</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-4 mt-1.5 text-[9px] text-muted-foreground">
                <span>🧑 helpers online</span>
                <span>📋 open requests</span>
                <span>✓ completed 7d</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-xl">
              No active regions — no helpers online or open requests at the moment.
            </div>
          )}

          {/* ── Language Distribution ────────────────────────────────── */}
          {data.language_distribution.length > 0 && (
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Languages in Use (7 days)</div>
              <div className="flex flex-wrap gap-1.5">
                {data.language_distribution.map(({ lang, count }) => (
                  <span
                    key={lang}
                    className="text-[10px] font-semibold px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20"
                  >
                    {LANG_NAMES[lang] ?? lang} · {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Feature Verification ─────────────────────────────────── */}
          {checks && (
            <div className="space-y-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Feature Verification</div>

              {/* Config health banner — shown when critical secrets are missing */}
              {data.config_status && (
                <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${
                  data.config_status.fully_configured
                    ? "bg-green-400/10 border-green-400/20 text-green-400"
                    : data.config_status.critical_missing.length > 0
                    ? "bg-destructive/10 border-destructive/20 text-destructive"
                    : "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"
                }`}>
                  {data.config_status.fully_configured
                    ? <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    : <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-semibold leading-snug">{data.config_status.notes}</p>
                    {data.config_status.critical_missing.length > 0 && (
                      <p className="text-[10px] mt-1 opacity-80">
                        Missing: {data.config_status.critical_missing.join(" · ")}
                      </p>
                    )}
                    {!data.config_status.fully_configured && (
                      <p className="text-[10px] mt-1 opacity-70">
                        Add secrets in Replit → Secrets tab, then restart the API Server workflow.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ["Database",          checks.database === "ok"],
                  ["Map / Navigation",  checks.mapbox_token],
                  ["Nia AI (Anthropic)", checks.nia_ai ?? checks.nia_api_key ?? false],
                  ["Internal Secret",   checks.internal_secret],
                  ["Redis / BullMQ",    checks.redis],
                  ["Push / VAPID",      checks.push_vapid],
                  ["Stripe Payments",   checks.stripe],
                  ["Background Checks", checks.background_checks],
                  ["Workers OK",        checks.workers_ok],
                ] as [string, boolean][]).map(([label, ok]) => (
                  <div
                    key={label}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-[11px] font-semibold ${
                      ok
                        ? "text-green-400 bg-green-400/10 border-green-400/20"
                        : "text-destructive bg-destructive/10 border-destructive/20"
                    }`}
                  >
                    {ok
                      ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                    {label}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Smart Dispatch Suggest Panel ──────────────────────────────────────────────
// Calls POST /helpers/auto-assign/:requestId to get an AI-ranked suggestion
// of the best available helper. This is advisory only — it never writes to DB.
function DispatchSuggestSection() {
  const [requestIdInput, setRequestIdInput] = useState("");
  const [radiusInput, setRadiusInput] = useState("10");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    helper_id: number | null;
    helper_name: string;
    match_score: number;
    eta_minutes: number;
    distance_miles: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSuggest = async () => {
    const rid = parseInt(requestIdInput.trim());
    if (isNaN(rid) || rid <= 0) { setError("Enter a valid request ID"); return; }
    const rawRadius = parseFloat(radiusInput);
    const radius = Math.min(50, Math.max(1, isNaN(rawRadius) ? 10 : rawRadius));
    setLoading(true); setResult(null); setError(null);
    try {
      const res = await fetch(`${BASE}/api/helpers/auto-assign/${rid}?radius_miles=${radius}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setError(b.error ?? `Server returned ${res.status}`);
      }
    } catch { setError("Network error"); } finally { setLoading(false); }
  };

  const _trafficColors: Record<string, string> = {
    low:      "text-green-400",
    moderate: "text-yellow-400",
    heavy:    "text-orange-400",
    severe:   "text-destructive",
    unknown:  "text-muted-foreground",
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Navigation2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-black uppercase tracking-wider">Smart Dispatch Suggest</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 ml-auto">Advisory Only</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Finds the highest-scoring available helper for any open request. Ranks by skills match, distance, availability, and urgency. This is read-only — it never assigns automatically.
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          value={requestIdInput}
          onChange={e => setRequestIdInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") runSuggest(); }}
          placeholder="Request ID…"
          className="flex-1 bg-background border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ fontSize: "16px" }}
        />
        <div className="flex items-center gap-1 bg-background border border-border rounded-xl px-2">
          <span className="text-[10px] text-muted-foreground font-semibold whitespace-nowrap">radius</span>
          <input
            type="number"
            min="1"
            max="50"
            value={radiusInput}
            onChange={e => setRadiusInput(e.target.value)}
            className="w-12 bg-transparent text-sm text-center focus:outline-none"
            style={{ fontSize: "16px" }}
          />
          <span className="text-[10px] text-muted-foreground">mi</span>
        </div>
        <button
          onClick={runSuggest}
          disabled={loading}
          style={{ touchAction: "manipulation" }}
          className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black disabled:opacity-50 active:scale-95 transition-all flex items-center gap-1.5"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" />Suggest</>}
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <div className="border border-primary/30 rounded-xl p-4 space-y-2 bg-primary/5">
          <div className="text-[10px] font-black uppercase tracking-wider text-primary mb-1">Top Suggestion</div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-black text-sm">{result.helper_name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Helper ID #{result.helper_id} · {
                  detectUnits() === "metric"
                    ? `${(result.distance_miles * 1.60934).toFixed(1)} km`
                    : `${result.distance_miles.toFixed(1)} mi`
                } · ~{result.eta_minutes} min ETA
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-lg font-black ${result.match_score >= 80 ? "text-green-400" : result.match_score >= 50 ? "text-yellow-400" : "text-muted-foreground"}`}>
                {result.match_score.toFixed(0)}
              </div>
              <div className="text-[9px] text-muted-foreground">Match Score</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SystemTab() {
  const [health, setHealth] = useState<{
    status: string;
    redis_configured: boolean;
    process_started_at: string;
    workers: WorkerEntry[];
  } | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [hardship, setHardship] = useState<HardshipRequest[]>([]);
  const [hardshipLoading, setHardshipLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  const [_healthError, setHealthError] = useState<string | null>(null);
  const [_hardshipError, _setHardshipError] = useState<string | null>(null);

  const loadHealth = async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/worker-health`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) {
        setHealth(await res.json());
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setHealthError(b.error ?? `Server returned ${res.status}`);
      }
    } catch { setHealthError("Could not reach server"); } finally { setHealthLoading(false); }
  };

  const loadHardship = async () => {
    setHardshipLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/hardship-requests`, { headers: { Authorization: `Bearer ${getToken() ?? ""}` } });
      if (res.ok) setHardship(await res.json());
    } catch { /* non-fatal */ } finally { setHardshipLoading(false); }
  };

  useEffect(() => {
    loadHealth();
    loadHardship();
    // Auto-refresh worker health every 30 s so the admin always sees live
    // worker status without having to click Refresh manually.
    const id = setInterval(loadHealth, 30_000);
    return () => clearInterval(id);
  }, []);

  const resolveHardship = async (requestId: number, action: "forgiven" | "written_off" | "dismiss") => {
    setResolvingId(requestId);
    try {
      let res: Response;
      if (action === "dismiss") {
        // Clears hardship_requested_at — removes from queue, pledge status unchanged
        res = await fetch(`${BASE}/api/admin/requests/${requestId}/hardship`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${getToken() ?? ""}` },
        });
      } else {
        res = await fetch(`${BASE}/api/admin/requests/${requestId}/pledge-status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
          body: JSON.stringify({ pledge_status: action }),
        });
      }
      if (res.ok) {
        const label = action === "forgiven" ? "Pledge forgiven" : action === "written_off" ? "Pledge written off" : "Hardship dismissed — pledge kept active";
        toast({ title: label });
        loadHardship();
      } else {
        toast({ title: "Failed to update — please try again", variant: "destructive" });
      }
    } catch { toast({ title: "Network error", variant: "destructive" }); }
    finally { setResolvingId(null); }
  };

  const statusColor = (s: WorkerEntry["status"]) => ({
    running:  "text-green-400 bg-green-400/10 border-green-400/20",
    stopped:  "text-muted-foreground bg-muted border-border",
    no_redis: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    error:    "text-destructive bg-destructive/10 border-destructive/20",
  }[s]);

  const statusIcon = (s: WorkerEntry["status"]) => ({
    running:  <CheckCircle className="w-3.5 h-3.5 text-green-400" />,
    stopped:  <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
    no_redis: <WifiOff className="w-3.5 h-3.5 text-yellow-400" />,
    error:    <AlertCircle className="w-3.5 h-3.5 text-destructive" />,
  }[s]);

  return (
    <div className="space-y-5">

      {/* Worker Health */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <span className="text-sm font-black uppercase tracking-wider">Worker Health</span>
          </div>
          <div className="flex items-center gap-3">
            {health && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-full border ${
                health.status === "ok"
                  ? "text-green-400 bg-green-400/10 border-green-400/20"
                  : "text-destructive bg-destructive/10 border-destructive/20"
              }`}>
                {health.status === "ok" ? "All Systems OK" : "Degraded"}
              </span>
            )}
            <button onClick={loadHealth} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {health && (
          <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 border ${
            health.redis_configured
              ? "text-green-400 bg-green-400/10 border-green-400/20"
              : "text-yellow-400 bg-yellow-400/10 border-yellow-400/20"
          }`}>
            <Server className="w-3.5 h-3.5 shrink-0" />
            <span><span className="font-black">Redis:</span> {health.redis_configured ? "Connected — BullMQ workers active" : "Not configured — BullMQ workers disabled, using legacy scheduler"}</span>
          </div>
        )}

        {healthLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : health ? (
          <div className="space-y-2">
            {health.workers.map((w) => {
              const totalRuns = (w.successCount ?? 0) + (w.failureCount ?? 0);
              const successRate = totalRuns > 0 ? Math.round((w.successCount ?? 0) / totalRuns * 100) : null;
              const lastRunAgo = w.lastRunAt
                ? (() => {
                    const ms = Date.now() - new Date(w.lastRunAt).getTime();
                    if (ms < 60_000) return "just now";
                    if (ms < 3_600_000) return `${Math.round(ms/60000)}m ago`;
                    if (ms < 86_400_000) return `${Math.round(ms/3_600_000)}h ago`;
                    return `${Math.round(ms/86_400_000)}d ago`;
                  })()
                : null;
              return (
                <div key={w.name} className="rounded-xl border border-border px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[10px] font-black shrink-0 ${statusColor(w.status)}`}>
                      {statusIcon(w.status)}
                      <span className="capitalize">{w.status === "no_redis" ? "No Redis" : w.status}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold leading-tight">{w.label}</div>
                    </div>
                    {w.redisRequired && (
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-border rounded px-1.5 py-0.5 shrink-0">Redis</span>
                    )}
                  </div>
                  {w.errorMessage && (
                    <div className="text-[10px] text-destructive bg-destructive/10 rounded px-2 py-1 truncate">{w.errorMessage}</div>
                  )}
                  {/* Run stats row */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    {lastRunAgo && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Last run: <span className="text-foreground font-semibold">{lastRunAgo}</span></span>
                      </span>
                    )}
                    {totalRuns > 0 && (
                      <>
                        <span className="text-green-400 font-semibold">{w.successCount ?? 0} ✓</span>
                        {(w.failureCount ?? 0) > 0 && (
                          <span className="text-destructive font-semibold">{w.failureCount} ✗</span>
                        )}
                        {successRate !== null && (
                          <span className={`font-semibold ${successRate === 100 ? "text-green-400" : successRate >= 80 ? "text-yellow-400" : "text-destructive"}`}>
                            {successRate}% success
                          </span>
                        )}
                      </>
                    )}
                    {!lastRunAgo && w.startedAt && (
                      <span className="flex items-center gap-1">
                        <Timer className="w-3 h-3 shrink-0" />
                        <span>Started: {new Date(w.startedAt).toLocaleTimeString()}</span>
                      </span>
                    )}
                    {!lastRunAgo && !w.startedAt && w.status === "running" && (
                      <span className="text-muted-foreground/60 italic">No runs recorded yet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Could not load worker health.</p>
        )}
      </div>

      {/* ── Global Ops (coverage, GPS, languages, feature checks) ──── */}
      <GlobalOpsSection />

      {/* ── Smart Dispatch Suggest ───────────────────────────────────── */}
      <DispatchSuggestSection />

      {/* ── Cashout Queue ────────────────────────────────────────────── */}
      <CashoutSection />

      {/* ── Neighborhoods ────────────────────────────────────────────── */}
      <NeighborhoodsSection />

      {/* ── Region Crisis Resources ───────────────────────────────────── */}
      <RegionCrisisSection />

      {/* Hardship Request Queue */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-primary" />
            <span className="text-sm font-black uppercase tracking-wider">Hardship Requests</span>
            {hardship.length > 0 && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">{hardship.length}</span>
            )}
          </div>
          <button onClick={loadHardship} className="w-7 h-7 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Requesters who submitted a "I can't pay right now" hardship request. Review their situation and choose to forgive or write off the pledge. Forgiven = waived with care; written off = uncollectable after extended non-payment.
        </p>

        {hardshipLoading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : hardship.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No pending hardship requests.</p>
        ) : (
          <div className="space-y-3">
            {hardship.map((h) => {
              const outstanding = (h.pledge_amount ?? 0) - (h.pledge_paid ?? 0);
              return (
                <div key={h.id} className="border border-yellow-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{h.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {h.requester_name} · {h.requester_email}
                      </div>
                      <div className="text-xs mt-1">
                        <span className="text-yellow-400 font-bold">${outstanding.toFixed(2)} outstanding</span>
                        {h.pledge_paid && h.pledge_paid > 0 && (
                          <span className="text-green-400 ml-2">· ${h.pledge_paid.toFixed(2)} paid</span>
                        )}
                        <span className={`ml-2 font-bold ${h.pledge_status === "defaulted" ? "text-destructive" : "text-muted-foreground"}`}>
                          · {h.pledge_status}
                        </span>
                      </div>
                      {h.hardship_requested_at && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          Filed: {new Date(h.hardship_requested_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  {h.hardship_note && (
                    <div className="bg-muted rounded-xl p-3 text-xs text-muted-foreground italic leading-relaxed">
                      "{h.hardship_note}"
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolveHardship(h.id, "forgiven")}
                      disabled={resolvingId === h.id}
                      className="flex-1 py-2 text-xs font-black rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 hover:border-green-500/60 transition-all disabled:opacity-50 active:scale-95"
                    >
                      {resolvingId === h.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : "Forgive"}
                    </button>
                    <button
                      onClick={() => resolveHardship(h.id, "written_off")}
                      disabled={resolvingId === h.id}
                      className="flex-1 py-2 text-xs font-black rounded-xl bg-muted border border-border text-muted-foreground hover:border-border/80 transition-all disabled:opacity-50 active:scale-95"
                    >
                      Write Off
                    </button>
                    <button
                      onClick={() => resolveHardship(h.id, "dismiss")}
                      disabled={resolvingId === h.id}
                      className="flex-1 py-2 text-xs font-black rounded-xl bg-muted border border-border text-muted-foreground hover:border-border/80 transition-all disabled:opacity-50 active:scale-95"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Communities Tab ───────────────────────────────────────────────────────────
interface AdminCommunity {
  id: number;
  name: string;
  target_reserve_amount: number;
  /** Per-county livable-wage override ($/hr). Null = inherits the global platform rate. */
  hourly_rate?: number | null;
  /** Server-computed pool health, clamped [0.5, 1.0] — matches wage multiplier floor */
  pool_health_ratio?: number;
  created_at: string;
  member_count?: number;
  pool_balance?: number;
}

function CommunitiesTab() {
  const [communities, setCommunities] = useState<AdminCommunity[]>([]);
  const [unassigned, setUnassigned] = useState<{ pool_balance: number; member_count: number } | null>(null);
  const [defaultCommunityId, setDefaultCommunityId] = useState<number | null>(null);
  const [settingDefault, setSettingDefault] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | "new" | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState({ name: "", target_reserve_amount: "5000", hourly_rate: "" });
  const [reassignUserId, setReassignUserId] = useState("");
  const [reassignCommunityId, setReassignCommunityId] = useState("");
  const [reassignMsg, setReassignMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [reassigning, setReassigning] = useState(false);
  const [reassignPending, setReassignPending] = useState(false);
  // Name/email lookup so an admin can see WHO they're about to move before
  // confirming, instead of blindly trusting a typed-in numeric ID.
  const [reassignLookup, setReassignLookup] = useState<{ id: number; name: string; email: string } | "not_found" | null>(null);
  const [reassignLookupLoading, setReassignLookupLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const load = async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/admin/communities`, {
        headers: { "Authorization": `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const j = await res.json();
        setCommunities(j.communities ?? []);
        hasLoadedRef.current = true;
        setUnassigned(j.unassigned ?? null);
        if (j.default_community_id != null) setDefaultCommunityId(j.default_community_id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Debounced lookup: resolve the typed user ID to a name/email so the admin
  // can confirm identity before reassigning. Cancelled/ignored if the ID
  // field changes again before the request resolves.
  useEffect(() => {
    const uid = parseInt(reassignUserId, 10);
    if (!reassignUserId || isNaN(uid) || uid <= 0) {
      setReassignLookup(null);
      setReassignLookupLoading(false);
      return;
    }
    let cancelled = false;
    setReassignLookupLoading(true);
    setReassignLookup(null);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${BASE}/api/users?q=${uid}&limit=5`, {
          headers: { "Authorization": `Bearer ${getToken()}` },
        });
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json();
          const match = (j.users ?? []).find((u: { id: number }) => u.id === uid);
          setReassignLookup(match ? { id: match.id, name: match.name, email: match.email } : "not_found");
        } else {
          setReassignLookup("not_found");
        }
      } catch {
        if (!cancelled) setReassignLookup("not_found");
      } finally {
        if (!cancelled) setReassignLookupLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [reassignUserId]);

  const openNew = () => {
    setForm({ name: "", target_reserve_amount: "5000", hourly_rate: "" });
    setEditing("new");
  };

  const openEdit = (c: AdminCommunity) => {
    setForm({
      name: c.name,
      target_reserve_amount: String(c.target_reserve_amount),
      hourly_rate: c.hourly_rate != null ? String(c.hourly_rate) : "",
    });
    setEditing(c.id);
  };

  const saveNew = async () => {
    setSaving("new");
    try {
      const trimmedRate = form.hourly_rate.trim();
      const res = await fetch(`${BASE}/api/admin/communities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: form.name.trim(),
          target_reserve_amount: parseFloat(form.target_reserve_amount) || 5000,
          ...(trimmedRate ? { hourly_rate: parseFloat(trimmedRate) } : {}),
        }),
      });
      if (res.ok) {
        toast({ title: "Community created" });
        setEditing(null);
        load();
      } else {
        const j = await res.json().catch(() => ({}));
        toast({ title: "Error", description: j.error ?? "Failed", variant: "destructive" });
      }
    } finally {
      setSaving(null);
    }
  };

  const saveEdit = async (id: number) => {
    setSaving(id);
    try {
      const trimmedRate = form.hourly_rate.trim();
      const res = await fetch(`${BASE}/api/admin/communities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({
          name: form.name.trim(),
          target_reserve_amount: parseFloat(form.target_reserve_amount) || 5000,
          // Empty field clears the county override (falls back to the global
          // rate); a filled field sets/updates it.
          hourly_rate: trimmedRate ? parseFloat(trimmedRate) : null,
        }),
      });
      if (res.ok) {
        toast({ title: "Community updated" });
        setEditing(null);
        load();
      } else {
        const j = await res.json().catch(() => ({}));
        toast({ title: "Error", description: j.error ?? "Failed", variant: "destructive" });
      }
    } finally {
      setSaving(null);
    }
  };

  const requestReassignConfirm = () => {
    const uid = parseInt(reassignUserId);
    const cid = parseInt(reassignCommunityId);
    if (!uid || isNaN(uid) || uid <= 0) {
      setReassignMsg({ ok: false, text: "Enter a valid numeric user ID" });
      return;
    }
    if (!cid || isNaN(cid)) {
      setReassignMsg({ ok: false, text: "Select a community" });
      return;
    }
    // Require a resolved name/email match for THIS exact ID before allowing
    // the confirm step — this is the whole point of the lookup: an admin
    // should never be able to reassign a user they can't identify by
    // name/email, just a raw ID. Checking object identity alone isn't enough:
    // the lookup result is set asynchronously (after debounce + fetch), so if
    // the admin edits the ID field again the effect that clears/refreshes
    // reassignLookup hasn't necessarily run yet by the time this click
    // handler fires. Comparing reassignLookup.id === uid closes that window.
    if (reassignLookupLoading) {
      setReassignMsg({ ok: false, text: "Still looking up that user — wait a moment and try again" });
      return;
    }
    if (reassignLookup === "not_found" || reassignLookup === null || reassignLookup.id !== uid) {
      setReassignMsg({ ok: false, text: `No confirmed user found for ID #${uid} — double-check the ID before continuing` });
      return;
    }
    const community = communities.find(c => c.id === cid);
    if (!community) {
      setReassignMsg({ ok: false, text: "Unknown community — refresh and try again" });
      return;
    }
    setReassignMsg(null);
    setReassignPending(true);
  };

  const cancelReassign = () => {
    setReassignPending(false);
    setReassignMsg(null);
  };

  const doReassign = async () => {
    const uid = parseInt(reassignUserId);
    const cid = parseInt(reassignCommunityId);
    // Defensive re-check: requestReassignConfirm already enforces this before
    // entering the confirmation step, but re-verifying here means a stale
    // lookup can never slip through even if the pending state is somehow
    // reached with a mismatched ID (e.g. future code paths).
    if (!reassignLookup || typeof reassignLookup !== "object" || reassignLookup.id !== uid) {
      setReassignMsg({ ok: false, text: "User identity could not be re-confirmed — please try again" });
      setReassignPending(false);
      return;
    }
    setReassigning(true);
    setReassignMsg(null);
    try {
      const res = await fetch(`${BASE}/api/admin/users/${uid}/community`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getToken()}` },
        body: JSON.stringify({ community_id: cid }),
      });
      const j = await res.json().catch(() => ({}));
      const communityName = communities.find(c => c.id === cid)?.name ?? `#${cid}`;
      const identity = reassignLookup && typeof reassignLookup === "object" ? reassignLookup.name : `User #${uid}`;
      if (res.ok) {
        setReassignMsg({ ok: true, text: `${identity} reassigned to ${communityName}` });
        setReassignUserId("");
        setReassignCommunityId("");
        setReassignLookup(null);
        setReassignPending(false);
        load();
      } else {
        setReassignMsg({ ok: false, text: j.error ?? "Reassignment failed" });
        setReassignPending(false);
      }
    } finally {
      setReassigning(false);
    }
  };

  const setDefaultCommunity = async (id: number) => {
    setSettingDefault(id);
    try {
      const res = await fetch(`${BASE}/api/admin/communities/${id}/set-default`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${getToken()}` },
      });
      if (res.ok) {
        setDefaultCommunityId(id);
        toast({ title: "Default community updated", description: communities.find(c => c.id === id)?.name });
      } else {
        const j = await res.json().catch(() => ({}));
        toast({ title: "Error", description: j.error ?? "Failed", variant: "destructive" });
      }
    } finally {
      setSettingDefault(null);
    }
  };

  if (loading && !hasLoadedRef.current) return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading communities…
    </div>
  );

  const healthColor = (ratio: number) =>
    ratio >= 0.9 ? "text-green-400" : ratio >= 0.7 ? "text-yellow-400" : "text-orange-400";
  const healthLabel = (ratio: number) =>
    ratio >= 0.9 ? "Fully Funded" : ratio >= 0.7 ? "Healthy" : "Building";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-base flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> Communities
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Manage county pools, set targets, and reassign members.</p>
        </div>
        <button
          onClick={openNew}
          style={{ touchAction: "manipulation" }}
          className="text-[11px] font-black px-3 py-2 rounded-xl bg-primary text-primary-foreground active:opacity-80"
        >
          + New
        </button>
      </div>

      {/* Create / Edit form */}
      <AnimatePresence>
        {editing !== null && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-primary/30 rounded-2xl p-4 space-y-3"
          >
            <div className="text-[11px] font-black uppercase tracking-widest text-primary">
              {editing === "new" ? "New Community" : `Editing Community #${editing}`}
            </div>
            <div className="space-y-2">
              <input
                placeholder="Name (e.g. Tarrant County)"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                style={{ fontSize: "16px" }}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
              />
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Target Reserve ($)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="5000"
                  value={form.target_reserve_amount}
                  onChange={e => setForm(f => ({ ...f, target_reserve_amount: e.target.value }))}
                  style={{ fontSize: "16px" }}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Livable Wage Floor ($/hr)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Leave blank to use the global rate"
                  value={form.hourly_rate}
                  onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))}
                  style={{ fontSize: "16px" }}
                  className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
                />
                <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                  This is the guaranteed minimum helpers in this county earn for timed tasks, scaled
                  by hours worked. Based on a single-adult cost-of-living estimate for this county —
                  leave blank to use the platform-wide default instead.
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(null)}
                style={{ touchAction: "manipulation" }}
                className="flex-1 py-2.5 text-xs font-black rounded-xl bg-muted border border-border text-muted-foreground active:opacity-70"
              >
                Cancel
              </button>
              <button
                onClick={() => editing === "new" ? saveNew() : saveEdit(editing as number)}
                disabled={!form.name.trim() || saving !== null}
                style={{ touchAction: "manipulation" }}
                className="flex-1 py-2.5 text-xs font-black rounded-xl bg-primary text-primary-foreground disabled:opacity-50 active:opacity-80"
              >
                {saving !== null ? "Saving…" : "Save"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Community cards */}
      {communities.length === 0 && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No communities yet. Click <span className="font-black text-foreground">+ New</span> to create one.
        </div>
      )}

      <div className="space-y-3">
        {communities.map(c => {
          const balance = c.pool_balance ?? 0;
          const target = c.target_reserve_amount || 1;
          // Use the server-computed ratio (clamped [0.5,1.0] matching wage-multiplier floor).
          // Fall back to raw ratio only if the API field is absent.
          const ratio = c.pool_health_ratio ?? Math.min(Math.max(0.5, balance / target), 1);
          const pct = Math.round(ratio * 100);
          const isDefault = c.id === defaultCommunityId;
          return (
            <div key={c.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm">{c.name}</span>
                    {isDefault && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">Default</span>
                    )}
                    {c.hourly_rate != null && c.hourly_rate > 0 ? (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
                        ${c.hourly_rate.toFixed(2)}/hr floor
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        Global rate
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    ID #{c.id} · {(c.member_count ?? 0).toLocaleString()} members · Created {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {!isDefault && (
                    <button
                      onClick={() => setDefaultCommunity(c.id)}
                      disabled={settingDefault !== null}
                      style={{ touchAction: "manipulation" }}
                      className="px-2.5 py-1.5 text-[10px] font-black rounded-xl border border-primary/40 bg-primary/10 text-primary active:opacity-70 disabled:opacity-50"
                    >
                      {settingDefault === c.id ? "…" : "Set Default"}
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(c)}
                    style={{ touchAction: "manipulation" }}
                    className="px-3 py-1.5 text-[10px] font-black rounded-xl border border-border bg-muted active:opacity-70"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Pool balance bar — uses server ratio (0.5 floor = same as wage multiplier) */}
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className={`font-black ${healthColor(ratio)}`}>${balance.toFixed(2)} · {healthLabel(ratio)}</span>
                  <span className="text-muted-foreground">target ${target.toLocaleString()}</span>
                </div>
                <div className="h-2 bg-black/20 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      ratio >= 0.9 ? "bg-gradient-to-r from-green-400 to-emerald-500"
                      : ratio >= 0.7 ? "bg-gradient-to-r from-yellow-400 to-amber-500"
                      : "bg-gradient-to-r from-orange-400 to-orange-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className={`text-right text-[10px] font-black mt-0.5 ${healthColor(ratio)}`}>{pct}%</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Unassigned / legacy global bucket */}
      {unassigned && unassigned.member_count > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest">⚠ Unassigned Members</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-black text-foreground">{unassigned.member_count.toLocaleString()}</span> user{unassigned.member_count !== 1 ? "s" : ""} are still in the legacy global pool (community_id = NULL) and will not benefit from county-specific funding.
          </div>
          <div className="text-[11px] text-muted-foreground">
            Legacy pool balance: <span className="font-black text-foreground">${Number(unassigned.pool_balance).toFixed(2)}</span>
          </div>
          <div className="text-[10px] text-amber-400/70 mt-1">Reassign users below or set a Default community so new signups are auto-assigned.</div>
        </div>
      )}

      {/* User reassignment */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h3 className="font-black text-sm flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Reassign User to Community
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Move a user to a different community pool. Find the user ID in the Users tab.
        </p>

        {!reassignPending ? (
          <>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="User ID"
                value={reassignUserId}
                onChange={e => { setReassignUserId(e.target.value); setReassignMsg(null); }}
                style={{ fontSize: "16px" }}
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
              />
              <select
                value={reassignCommunityId}
                onChange={e => { setReassignCommunityId(e.target.value); setReassignMsg(null); }}
                style={{ fontSize: "16px" }}
                className="flex-1 px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:border-primary"
              >
                <option value="">— Select community —</option>
                {communities.map(c => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} (#{c.id}){c.id === defaultCommunityId ? " ★" : ""}
                  </option>
                ))}
              </select>
            </div>
            {/* Live identity lookup — an admin should always see WHO they're
                about to move, not just trust a typed-in numeric ID. */}
            {reassignUserId && (
              <div className="text-[11px] px-3 py-2 rounded-xl border bg-muted/40 border-border">
                {reassignLookupLoading ? (
                  <span className="text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Looking up user #{reassignUserId}…</span>
                ) : reassignLookup === "not_found" ? (
                  <span className="text-destructive font-bold">⚠ No user found with ID #{reassignUserId}</span>
                ) : reassignLookup && typeof reassignLookup === "object" ? (
                  <span className="text-foreground">
                    <span className="font-black text-primary">{reassignLookup.name}</span> · {reassignLookup.email}
                  </span>
                ) : null}
              </div>
            )}
            {reassignMsg && (
              <div className={`text-[11px] font-bold px-3 py-2 rounded-xl border ${
                reassignMsg.ok ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-destructive/10 text-destructive border-destructive/30"
              }`}>
                {reassignMsg.text}
              </div>
            )}
            <button
              onClick={requestReassignConfirm}
              disabled={!reassignUserId || !reassignCommunityId}
              style={{ touchAction: "manipulation" }}
              className="w-full py-2.5 text-xs font-black rounded-xl bg-primary text-primary-foreground disabled:opacity-50 active:opacity-80"
            >
              Review &amp; Confirm
            </button>
          </>
        ) : (
          /* Confirmation step — shows exactly what will happen before committing */
          <div className="space-y-3">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-1">
              <div className="text-[11px] font-black text-amber-400 uppercase tracking-widest">Confirm Reassignment</div>
              <div className="text-sm font-bold">
                Move{" "}
                <span className="text-primary">
                  {reassignLookup && typeof reassignLookup === "object"
                    ? `${reassignLookup.name} (${reassignLookup.email})`
                    : `User #${reassignUserId}`}
                </span>
                {" "}→{" "}
                <span className="text-primary">{communities.find(c => c.id === parseInt(reassignCommunityId))?.name ?? `Community #${reassignCommunityId}`}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                This changes which community pool the user belongs to and which wage multiplier applies to them. Double-check the user ID before confirming.
              </div>
            </div>
            {reassignMsg && (
              <div className={`text-[11px] font-bold px-3 py-2 rounded-xl border ${
                reassignMsg.ok ? "bg-green-500/10 text-green-400 border-green-500/30" : "bg-destructive/10 text-destructive border-destructive/30"
              }`}>
                {reassignMsg.text}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={cancelReassign}
                disabled={reassigning}
                style={{ touchAction: "manipulation" }}
                className="flex-1 py-2.5 text-xs font-black rounded-xl bg-muted border border-border text-muted-foreground active:opacity-70 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={doReassign}
                disabled={reassigning}
                style={{ touchAction: "manipulation" }}
                className="flex-1 py-2.5 text-xs font-black rounded-xl bg-destructive text-destructive-foreground disabled:opacity-50 active:opacity-80"
              >
                {reassigning ? "Reassigning…" : "Yes, Reassign"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Refresh */}
      <button
        onClick={load}
        style={{ touchAction: "manipulation" }}
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground active:opacity-60 mx-auto"
      >
        <RefreshCw className="w-3 h-3" /> Refresh
      </button>
    </div>
  );
}

// ── Main Admin Screen ─────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [authed, setAuthed] = useState(false);

  // Primary auth: if the logged-in user has is_admin=true (verified by the
  // server on every API call via requireAdmin()), auto-authenticate them into
  // the admin session without requiring a separate secret.
  const { currentUser } = useAppContext();
  useEffect(() => {
    if (currentUser?.is_admin) setAuthed(true);
  }, [currentUser?.is_admin]);

  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"reports" | "helpers" | "users" | "pledges" | "audit" | "nia" | "analytics" | "orgs" | "civic" | "disputes" | "settings" | "system" | "communities" | "griot" | "operations">("reports");

  // Nav-redesign hooks — must be declared here (unconditionally, before the
  // `if (!authed) return` gate below) rather than down near TAB_GROUPS/TABS.
  // Declaring them after that early return caused "Rendered more hooks than
  // during the previous render": the not-authed render calls fewer hooks,
  // then logging in suddenly calls extra ones, which React forbids.
  const lastTabInGroupRef = useRef<Record<number, typeof activeTab>>({
    1: "reports", 2: "pledges", 3: "nia", 4: "civic",
  });
  const [swipeDirection, setSwipeDirection] = useState<1 | -1>(1);
  const swipeTouchStart = useRef<{ x: number; y: number } | null>(null);

  // Global auto-refresh tick every 30s — tabs that care subscribe to this
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setRefreshTick(t => t + 1);
      setLastRefreshedAt(new Date());
    }, 30_000);
    return () => clearInterval(id);
  }, []);

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

  // ── Auth gate ─────────────────────────────────────────────────────────────
  // Admin access is granted exclusively via the is_admin flag on the user's
  // DB account — no client-side secret or separate password. This keeps
  // authorization authoritative on the server (requireAdmin() middleware) and
  // ensures all admin API calls carry a valid JWT.
  if (!authed) {
    const isLoggedInNonAdmin = !!currentUser && !currentUser.is_admin;
    return (
      <div
        className="fixed inset-0 bg-background flex flex-col items-center justify-center p-6 gap-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 22 }}
          className="w-20 h-20 bg-primary/10 border border-primary/20 rounded-3xl flex items-center justify-center"
        >
          <Shield className="w-10 h-10 text-primary" />
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center"
        >
          <h1 className="text-2xl font-black tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-1">Niakofa — restricted access</p>
        </motion.div>

        {/* State-specific content */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="w-full max-w-sm space-y-3"
        >
          {isLoggedInNonAdmin ? (
            /* Logged in but no admin rights */
            <>
              <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-5 text-center space-y-2">
                <AlertTriangle className="w-7 h-7 text-destructive mx-auto" />
                <p className="text-sm font-black text-destructive">No admin access</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <strong>{currentUser.email}</strong> does not have admin privileges.
                  Contact the app administrator to grant access.
                </p>
              </div>
              <button
                onClick={() => setLocation("/")}
                style={{ touchAction: "manipulation" }}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-base active:opacity-80 transition-opacity"
              >
                Back to app
              </button>
            </>
          ) : (
            /* Not signed in — must sign in with admin account */
            <>
              <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-foreground">Sign in required</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Sign in with your admin account. Access is verified by your account's admin status — no separate secret needed.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 text-[11px] text-muted-foreground">
                  <Fingerprint className="w-3.5 h-3.5 shrink-0 text-primary" />
                  <span>All admin actions are logged and server-verified</span>
                </div>
              </div>
              <button
                onClick={() => setLocation("/login")}
                style={{ touchAction: "manipulation" }}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-black text-base active:opacity-80 transition-opacity flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Sign In to Admin Account
              </button>
              <button
                onClick={() => setLocation("/")}
                style={{ touchAction: "manipulation" }}
                className="w-full py-3 text-sm text-muted-foreground active:text-foreground transition-colors"
              >
                Back to app
              </button>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // Groups: 1 = Trust & Safety, 2 = Finance, 3 = Intelligence, 4 = Configure
  const TAB_GROUPS: Record<string, number> = {
    reports: 1, disputes: 1, users: 1, helpers: 1, griot: 1,
    pledges: 2, orgs: 2, communities: 2, operations: 2,
    nia: 3, analytics: 3, audit: 3,
    civic: 4, settings: 4, system: 4,
  };

  const TABS = [
    { key: "reports",   label: "Reports",   icon: Flag },
    { key: "disputes",  label: "Disputes",  icon: Gavel },
    { key: "users",     label: "Users",     icon: Users },
    { key: "helpers",   label: "Helpers",   icon: UserIcon },
    { key: "griot",     label: "Griot Globe", icon: BookOpen },
    { key: "pledges",      label: "Pledges",      icon: HandHeart },
    { key: "orgs",         label: "Orgs",         icon: Landmark },
    { key: "communities",  label: "Communities",  icon: Globe },
    { key: "operations",   label: "Operations",   icon: Wallet },
    { key: "nia",       label: "Nia AI",    icon: Bot },
    { key: "analytics", label: "Stats",     icon: BarChart2 },
    { key: "audit",     label: "Audit",     icon: FileText },
    { key: "civic",     label: "Civic",     icon: Building2 },
    { key: "settings",  label: "Settings",  icon: SlidersHorizontal },
    { key: "system",    label: "System",    icon: Server },
  ] as const;

  // Redesigned nav: previously one flat, horizontally-scrolling strip of all
  // 15 tabs — the whole reason "Settings" or "System" needed several swipes
  // of blind horizontal scrolling to even find on a phone. Now there are two
  // levels: 4 always-visible group pills (no scrolling to see all of them),
  // then a short (3-5 item) strip of just that group's own tabs. Swiping
  // left/right on the content area moves between tabs within the current
  // group — crossing a group boundary is a deliberate tap on a group pill,
  // not an accidental swipe, so you can't swipe-past into an unrelated
  // section without meaning to.
  const GROUP_INFO: Record<number, { label: string; icon: typeof Shield }> = {
    1: { label: "Trust & Safety", icon: Shield },
    2: { label: "Finance",        icon: HandHeart },
    3: { label: "Intelligence",   icon: BarChart2 },
    4: { label: "Configure",      icon: SlidersHorizontal },
  };

  const activeGroup = TAB_GROUPS[activeTab];
  const tabsInActiveGroup = TABS.filter(t => TAB_GROUPS[t.key] === activeGroup);
  const positionInGroup = tabsInActiveGroup.findIndex(t => t.key === activeTab);

  const goToGroup = (group: number) => {
    if (group === activeGroup) return;
    setSwipeDirection(group > activeGroup ? 1 : -1);
    setActiveTab(lastTabInGroupRef.current[group]);
  };
  const setActiveTabTracked = (tab: typeof activeTab, direction: 1 | -1 = 1) => {
    lastTabInGroupRef.current[TAB_GROUPS[tab]] = tab;
    setSwipeDirection(direction);
    setActiveTab(tab);
  };
  // Swipe within the current group only — clamped at both ends rather than
  // wrapping into the next/previous group, so a swipe can never surprise you
  // into an unrelated section the way an accidental scroll could.
  const swipeWithinGroup = (direction: 1 | -1) => {
    const nextIndex = positionInGroup + direction;
    if (nextIndex < 0 || nextIndex >= tabsInActiveGroup.length) return;
    setActiveTabTracked(tabsInActiveGroup[nextIndex].key as typeof activeTab, direction);
  };
  const handleContentTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipeTouchStart.current = { x: t.clientX, y: t.clientY };
  };
  const handleContentTouchEnd = (e: React.TouchEvent) => {
    const start = swipeTouchStart.current;
    swipeTouchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // Require a clearly horizontal gesture (not a vertical scroll) and a
    // real swipe distance — avoids hijacking normal up/down scrolling on
    // tabs with long lists or tables.
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipeWithinGroup(dx < 0 ? 1 : -1);
    }
  };

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
          {/* Live refresh indicator */}
          <div className="flex items-center gap-1 text-[9px] font-black text-green-400/80 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="hidden sm:inline">
              {lastRefreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
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

      {/* Admin Live Banner — real-time pending-review counts */}
      <AdminLiveBanner onNavigate={(tab) => setActiveTab(tab as typeof activeTab)} />

      {/* Tab content — swipe left/right moves between tabs within the
          current group (see handleContentTouchStart/End above). A key on
          activeTab forces a fresh mount per tab so the slide-in animation
          below always plays, even swiping between two tabs with similar
          content. */}
      <div
        className="flex-1 max-w-3xl mx-auto w-full px-4 pt-4 space-y-3"
        onTouchStart={handleContentTouchStart}
        onTouchEnd={handleContentTouchEnd}
      >
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: swipeDirection * 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="space-y-3"
        >
        {activeTab === "orgs"      && <OrgsTab authed={authed} />}
        {activeTab === "civic"     && <AdminCivicRequestsTab />}
        {activeTab === "pledges"   && (
          <div className="space-y-4">
            <PoolBalanceBanner />
            <PledgePoolDashboard />
            <div className="text-xs font-black uppercase tracking-wider text-muted-foreground px-1 mt-4">Resolve Outstanding Pledges</div>
            <PledgeWriteOffCard />
          </div>
        )}
        {activeTab === "audit"     && <AuditLogTable />}
        {activeTab === "analytics" && <AnalyticsTab />}
        {activeTab === "nia"       && <NiaTab />}
        {activeTab === "helpers"   && (
          <div className="space-y-6">
            <BackgroundCheckAdmin />
            <div className="border-t border-border pt-4">
              <HelperApplicationsTab />
            </div>
          </div>
        )}
        {activeTab === "users"     && <UsersTab refreshTick={refreshTick} />}
        {activeTab === "reports"   && <ReportsTab authed={authed} refreshTick={refreshTick} />}
        {activeTab === "griot"     && <GriotReportsSection />}
        {activeTab === "disputes"    && <DisputesTab />}
        {activeTab === "communities" && <CommunitiesTab />}
        {activeTab === "operations"  && <OperationsTab />}
        {activeTab === "settings"   && <SettingsTab onNavigate={(tab) => setActiveTab(tab as typeof activeTab)} />}
        {activeTab === "system"     && <SystemTab />}
        </motion.div>
      </div>

      {/* ── Bottom nav — two levels instead of one flat 15-item strip ──────
          Level 1: 4 group pills, always fully visible, no scrolling —
          Trust & Safety | Finance | Intelligence | Configure. Tapping a
          group jumps to whichever tab you last viewed in it.
          Level 2: a short (3-5 item) strip of just that group's own tabs,
          swipeable via left/right gestures on the content area above
          (handleContentTouchStart/End) as well as tappable directly.
          Previously this was a single horizontally-scrolling row of all 15
          tabs — finding "Settings" or "System" meant scrolling blind past
          everything else. Now at most 5 items are ever on screen at once,
          and swiping/tapping between them can't accidentally cross into an
          unrelated group. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-20 bg-card/95 backdrop-blur-xl border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Group pills */}
        <div role="tablist" aria-label="Admin areas" className="flex items-stretch px-1.5 pt-1.5">
          {([1, 2, 3, 4] as const).map(group => {
            const { label, icon: Icon } = GROUP_INFO[group];
            const isActive = activeGroup === group;
            return (
              <button
                key={group}
                role="tab"
                aria-selected={isActive}
                onClick={() => goToGroup(group)}
                style={{ touchAction: "manipulation" }}
                className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground active:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="adminGroupPill"
                    className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/15"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon className={`w-[18px] h-[18px] relative z-10 transition-transform duration-150 ${isActive ? "scale-110" : ""}`} />
                <span className="text-[9px] font-black uppercase tracking-wide relative z-10">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Sub-tabs for the active group only — 3-5 items, never 15 */}
        <div role="tablist" aria-label={`${GROUP_INFO[activeGroup].label} sections`} className="flex items-center justify-center gap-1 px-2 py-1.5 border-t border-border/50">
          {tabsInActiveGroup.map((tab, idx) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTabTracked(tab.key as typeof activeTab, idx >= positionInGroup ? 1 : -1)}
                style={{ touchAction: "manipulation" }}
                className={`relative flex items-center gap-1 py-1.5 px-2.5 rounded-full text-[10px] font-bold transition-colors ${
                  isActive ? "bg-primary/15 text-primary" : "text-muted-foreground active:bg-muted"
                }`}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Swipe-hint dots — show position within the current group so a
            swipe feels like moving along a track, not a mystery gesture. */}
        {tabsInActiveGroup.length > 1 && (
          <div className="flex items-center justify-center gap-1 pb-1.5">
            {tabsInActiveGroup.map((tab, idx) => (
              <span
                key={tab.key}
                className={`h-1 rounded-full transition-all ${idx === positionInGroup ? "w-3 bg-primary" : "w-1 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

