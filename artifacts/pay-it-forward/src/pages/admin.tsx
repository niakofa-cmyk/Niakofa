import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  Shield, AlertCircle, CheckCircle2, Clock, X, ChevronLeft,
  Eye, Flag, User as UserIcon, RefreshCw, Filter,
  Users, Search, Ban, AlertTriangle, Star, BarChart3,
  TrendingUp, Heart, Activity, Inbox, CheckCheck, ThumbsDown, Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, CartesianGrid, Legend,
} from "recharts";
import { getToken as getAdminToken, setToken as setAdminToken, clearToken as clearAdminToken, authHeaders as sharedAuthHeaders } from "@/lib/auth";

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

interface AnalyticsData {
  overview: {
    total_open: number;
    total_completed: number;
    total_helpers_online: number;
    recent_completions_24h: number;
    total_users: number;
    new_users_week: number;
  };
  requests_by_category: { category: string; count: number }[];
  daily_request_volume: { day: string; count: number }[];
  pledge_pool: { total_pledged: number; total_paid: number; pending: number };
  reports_by_status: { status: string; count: number }[];
  reports_by_type: { type: string; count: number }[];
  trust_score_distribution: { bucket: string; count: number }[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:             { label: "Pending",      color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  under_review:        { label: "Under Review", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  resolved_dismissed:  { label: "Dismissed",    color: "bg-muted text-muted-foreground border-border" },
  resolved_warned:     { label: "Warned",       color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  resolved_banned:     { label: "Banned",       color: "bg-destructive/15 text-destructive border-destructive/30" },
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

const CHART_COLORS = ["#06b6d4", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#3b82f6", "#84cc16"];

const STATUS_FILTERS = ["all", "pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];

// CRIT-008: admin auth now shares the same token storage (lib/auth.ts,
// backed by localStorage) and Bearer-token scheme as the main app, instead
// of maintaining a separate sessionStorage-keyed session. The admin user id
// is still tracked separately since it's an admin-panel-only concern.
const SESSION_USER_KEY = "admin_user_id";

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getAdminUserId(): number | null {
  const v = sessionStorage.getItem(SESSION_USER_KEY);
  return v ? parseInt(v) : null;
}

function authHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...sharedAuthHeaders() };
}

// ── Login Screen ──────────────────────────────────────────────────────────────

function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const handleLogin = async () => {
    if (!email || !password) { setError("Email and password required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${base}/api/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json() as { user?: { id: number; is_admin?: boolean }; token?: string; error?: string };
      if (!res.ok) { setError(data.error ?? "Login failed"); return; }
      if (!data.user?.is_admin) { setError("Access denied — admin account required"); return; }
      if (!data.token) { setError("Login error — no token returned"); return; }
      setAdminToken(data.token);
      sessionStorage.setItem(SESSION_USER_KEY, String(data.user.id));
      onLogin();
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-8 gap-6">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center justify-center">
        <Shield className="w-8 h-8 text-destructive" />
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-black">Admin Access</h1>
        <p className="text-sm text-muted-foreground mt-1">Sign in with your admin account</p>
      </div>
      <div className="w-full max-w-xs space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleLogin()}
          className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <Button
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-11 font-black"
        >
          {loading ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Signing in…</span> : "Enter Admin"}
        </Button>
      </div>
    </div>
  );
}

// ── Report Detail Sheet ───────────────────────────────────────────────────────

function ReportDetailSheet({ report, onClose, onReviewed }: {
  report: Report;
  onClose: () => void;
  onReviewed: (updated: Report) => void;
}) {
  const [status, setStatus] = useState<string>(report.status === "pending" ? "under_review" : report.status);
  const [notes, setNotes] = useState(report.admin_notes ?? "");
  const [saving, setSaving] = useState(false);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const handleReview = async () => {
    const actionableStatuses = ["under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
    if (!actionableStatuses.includes(status)) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/api/reports/${report.id}/review`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status, admin_notes: notes || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Failed");
      }
      const updated = await res.json() as Report;
      onReviewed(updated);
      toast({ title: "Report updated", description: `Status set to: ${STATUS_LABELS[status]?.label ?? status}` });
      onClose();
    } catch (e: unknown) {
      toast({ title: (e as Error).message ?? "Failed to update report", variant: "destructive" });
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
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[96dvh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-destructive" />
            <h3 className="font-black text-lg">Report #{report.id}</h3>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
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
                {report.reporter_email && <div className="text-[10px] text-muted-foreground">{report.reporter_email}</div>}
              </div>
            )}
            {report.reported_user_name && (
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Reported User</div>
                <div className="text-sm font-bold">{report.reported_user_name}</div>
              </div>
            )}
            {report.reported_request_id && (
              <div className="bg-background rounded-xl p-3 border border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Request ID</div>
                <div className="text-sm font-bold">#{report.reported_request_id}</div>
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
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                    status === s
                      ? STATUS_LABELS[s].color + " ring-2 ring-offset-1 ring-offset-card ring-current"
                      : "bg-background border-border text-muted-foreground hover:border-primary/40"
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
            <Button className="w-full h-11 font-black" onClick={handleReview} disabled={saving}>
              {saving ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Saving…</span> : "Submit Review"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Reports Tab ───────────────────────────────────────────────────────────────

function ReportsTab() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const fetchReports = useCallback(async (status?: string) => {
    setLoading(true);
    try {
      const url = status && status !== "all"
        ? `${base}/api/reports?status=${status}`
        : `${base}/api/reports`;
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as Report[];
      setReports(data);
    } catch {
      toast({ title: "Could not load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { fetchReports(statusFilter); }, [statusFilter]);

  const openDetail = async (report: Report) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${base}/api/reports/${report.id}`, { headers: authHeaders() });
      setSelectedReport(res.ok ? await res.json() as Report : report);
    } catch {
      setSelectedReport(report);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleReviewed = (updated: Report) => {
    setReports(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
  };

  const pendingCount = reports.filter(r => r.status === "pending").length;
  const filteredReports = statusFilter === "all" ? reports : reports.filter(r => r.status === statusFilter);

  return (
    <div className="space-y-3">
      {/* Header stats */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{reports.length} total</span>
        {pendingCount > 0 && (
          <span className="text-[10px] font-black bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded-full">
            {pendingCount} pending
          </span>
        )}
        <button
          onClick={() => fetchReports(statusFilter)}
          disabled={loading}
          className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
        {STATUS_FILTERS.map(s => {
          const meta = STATUS_LABELS[s];
          const isActive = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                isActive
                  ? s === "all" ? "bg-primary text-primary-foreground border-primary" : (meta?.color ?? "bg-primary text-primary-foreground border-primary")
                  : "bg-background border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s === "all" ? "All" : meta?.label ?? s}
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading reports…</span>
        </div>
      )}

      {!loading && filteredReports.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400/40" />
          <div className="font-bold text-sm text-muted-foreground">
            {statusFilter === "all" ? "No reports yet" : `No ${STATUS_LABELS[statusFilter]?.label?.toLowerCase() ?? statusFilter} reports`}
          </div>
          <div className="text-xs text-muted-foreground/60 mt-1">The queue is clear</div>
        </div>
      )}

      {!loading && filteredReports.map(report => {
        const statusMeta = STATUS_LABELS[report.status] ?? { label: report.status, color: "bg-muted text-muted-foreground border-border" };
        return (
          <motion.button
            key={report.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => openDetail(report)}
            disabled={detailLoading}
            className="w-full text-left bg-card border border-border rounded-2xl p-4 hover:border-primary/40 transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusMeta.color}`}>
                    {statusMeta.label}
                  </span>
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    {TYPE_LABELS[report.type] ?? report.type}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{report.description}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {report.reported_user_id && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <UserIcon className="w-3 h-3" /> User #{report.reported_user_id}
                    </span>
                  )}
                  {report.reported_request_id && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Flag className="w-3 h-3" /> Request #{report.reported_request_id}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {fmtDate(report.created_at)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {report.status === "pending" && <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />}
                <Eye className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
            {report.admin_notes && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Admin Notes</div>
                <p className="text-xs text-muted-foreground line-clamp-2">{report.admin_notes}</p>
              </div>
            )}
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
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  useEffect(() => {
    fetch(`${base}/api/users`, { headers: authHeaders() })
      .then(r => r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = async (userId: number, action: "warn" | "ban") => {
    try {
      const res = await fetch(`${base}/api/users/${userId}/moderation`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Action failed");
      }
      toast({ title: action === "ban" ? "User banned" : "Warning issued" });
      setActionUser(null);
      setUsers(prev => prev.map(u => {
        if (u.id !== userId) return u;
        return { ...u, trust_score: action === "ban" ? -1 : Math.max(0, (u.trust_score ?? 5) - 10) };
      }));
    } catch (e: unknown) {
      toast({ title: (e as Error).message ?? "Action failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary transition-all"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading users…</span>
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
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-black text-primary">
              {user.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-black text-sm truncate">{user.name}</div>
              <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
              <div className="flex items-center gap-2 mt-1">
                {user.is_helper && (
                  <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-bold">Helper</span>
                )}
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Star className="w-3 h-3" />{(user.trust_score ?? 0).toFixed(1)}
                </span>
                <span className="text-[10px] text-muted-foreground">{user.help_count} helps</span>
              </div>
            </div>
            <button
              onClick={() => setActionUser(user)}
              className="p-2 rounded-xl border border-border active:bg-muted transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </motion.div>
      ))}

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
              <div className="text-center mb-5">
                <div className="w-12 h-12 rounded-full bg-muted mx-auto flex items-center justify-center font-black text-lg mb-2">
                  {actionUser.name[0]}
                </div>
                <div className="font-black">{actionUser.name}</div>
                <div className="text-xs text-muted-foreground">{actionUser.email}</div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleAction(actionUser.id, "warn")}
                  className="w-full flex items-center gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl active:scale-[0.98] transition-all"
                >
                  <AlertTriangle className="w-5 h-5 text-orange-400" />
                  <div className="text-left">
                    <div className="font-black text-sm text-orange-400">Issue Warning</div>
                    <div className="text-xs text-muted-foreground">User receives a community guidelines warning</div>
                  </div>
                </button>
                <button
                  onClick={() => handleAction(actionUser.id, "ban")}
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
                  className="w-full p-3 text-sm text-muted-foreground active:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color = "text-primary" }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`p-2 rounded-xl bg-muted ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-primary mt-1">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2 text-xs shadow-lg">
      {label && <div className="font-bold mb-1 text-foreground">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="text-muted-foreground">{p.name ?? "Count"}: <span className="font-bold text-foreground">{p.value}</span></div>
      ))}
    </div>
  );
};

function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  // useRef so the cache is per-component-instance and resets on logout/remount.
  // A module-level variable would survive logout and serve stale admin data
  // to the next session without a full page reload.
  const analyticsCacheRef = useRef<{ data: AnalyticsData; fetchedAt: number } | null>(null);

  // Cache analytics briefly — without this, every tab switch to Analytics
  // remounts this component and refires all 11 parallel server-side
  // queries, even if the person just looked at this tab seconds ago.
  const ANALYTICS_STALE_MS = 30_000;
  const fetchAnalytics = useCallback(async (force = false) => {
    const cached = analyticsCacheRef.current;
    if (!force && cached && Date.now() - cached.fetchedAt < ANALYTICS_STALE_MS) {
      setData(cached.data);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/admin/analytics`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load analytics");
      const json = await res.json() as AnalyticsData;
      analyticsCacheRef.current = { data: json, fetchedAt: Date.now() };
      setData(json);
    } catch {
      toast({ title: "Could not load analytics", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [base]);

  // BUG-031: Analytics were fetched once on mount and never again unless the
  // admin manually hit the refresh button. Add a polling interval so the
  // dashboard stays current without user action. Uses the same stale-cache
  // guard inside fetchAnalytics, so network calls only happen when needed.
  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(() => fetchAnalytics(), 60_000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading analytics…</span>
      </div>
    );
  }

  if (!data) return null;

  const { overview, requests_by_category, daily_request_volume, pledge_pool, reports_by_type, trust_score_distribution } = data;

  const categoryData = requests_by_category.map(d => ({
    name: d.category.charAt(0).toUpperCase() + d.category.slice(1),
    count: d.count,
  }));

  const reportTypeData = reports_by_type.map(d => ({
    name: TYPE_LABELS[d.type] ?? d.type,
    value: d.count,
  }));

  const trustData = [...trust_score_distribution].sort((a, b) => a.bucket.localeCompare(b.bucket));

  const pledgePct = pledge_pool.total_pledged > 0
    ? Math.round((pledge_pool.total_paid / pledge_pool.total_pledged) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">Platform Health</div>
        <button onClick={() => fetchAnalytics(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Overview stat cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Open Requests" value={overview.total_open} icon={Activity} color="text-yellow-500" />
        <StatCard label="Completed" value={overview.total_completed} icon={CheckCircle2} color="text-green-500" />
        <StatCard label="Online Helpers" value={overview.total_helpers_online} icon={Users} color="text-primary" />
        <StatCard label="Completions (24h)" value={overview.recent_completions_24h} icon={TrendingUp} color="text-purple-400" />
        <StatCard label="Total Users" value={overview.total_users} sub={`+${overview.new_users_week} this week`} icon={UserIcon} color="text-blue-400" />
        <StatCard
          label="Pledge Pool"
          value={`$${(pledge_pool.total_paid / 100).toFixed(0)}`}
          sub={`${pledgePct}% paid · $${(pledge_pool.pending / 100).toFixed(0)} pending`}
          icon={Heart}
          color="text-pink-400"
        />
      </div>

      {/* Daily request volume */}
      {daily_request_volume.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Request Volume — Last 7 Days</div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={daily_request_volume} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="count" name="Requests" stroke="#06b6d4" strokeWidth={2} fill="url(#volGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Requests by category */}
      {categoryData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Requests by Category</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={categoryData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Requests" radius={[6, 6, 0, 0]}>
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trust score distribution */}
      {trustData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Trust Score Distribution</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={trustData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Users" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Report type breakdown */}
      {reportTypeData.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Reports by Type</div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={140}>
              <PieChart>
                <Pie
                  data={reportTypeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={60}
                  paddingAngle={3}
                >
                  {reportTypeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {reportTypeData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="text-[10px] text-muted-foreground truncate">{d.name}</span>
                  </div>
                  <span className="text-[10px] font-black text-foreground">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pledge pool health bar */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-3">Pledge Pool Health</div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Paid</span>
            <span className="font-bold">${(pledge_pool.total_paid / 100).toFixed(2)} / ${(pledge_pool.total_pledged / 100).toFixed(2)}</span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-green-500 rounded-full transition-all"
              style={{ width: `${pledgePct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{pledgePct}% fulfilled</span>
            <span>${(pledge_pool.pending / 100).toFixed(2)} outstanding</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Civic Suggestions Tab ─────────────────────────────────────────────────────

interface CivicSuggestion {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

const SUGGESTION_STATUS: Record<string, { label: string; color: string }> = {
  pending:   { label: "Pending",   color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  approved:  { label: "Approved",  color: "bg-green-500/15 text-green-400 border-green-500/30" },
  dismissed: { label: "Dismissed", color: "bg-muted text-muted-foreground border-border" },
};

interface CityNeighborhoodRow {
  id: number;
  city_key: string;
  city_display: string;
  neighborhood_id: string;
  name: string;
  emoji: string;
  description: string;
  source: string;
  verified: boolean;
}

function NeighborhoodsTab() {
  const [rows, setRows] = useState<CityNeighborhoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVerified, setShowVerified] = useState(false);
  const [editing, setEditing] = useState<Record<number, { name: string; emoji: string; description: string }>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/admin/city-neighborhoods?verified=${showVerified}`, { headers: authHeaders() });
      const data = await res.json() as CityNeighborhoodRow[];
      if (Array.isArray(data)) {
        setRows(data);
        setEditing(Object.fromEntries(data.map(r => [r.id, { name: r.name, emoji: r.emoji, description: r.description }])));
      }
    } catch {
      toast({ title: "Failed to load neighborhoods", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [base, showVerified]);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const handleApprove = async (id: number) => {
    const edits = editing[id];
    setActionLoading(id);
    try {
      const res = await fetch(`${base}/api/admin/city-neighborhoods/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ...edits, verified: true }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "✅ Neighborhood approved" });
      await fetchRows();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: number) => {
    setActionLoading(id);
    try {
      const res = await fetch(`${base}/api/admin/city-neighborhoods/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Removed — will regenerate on next request" });
      await fetchRows();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const grouped = rows.reduce<Record<string, CityNeighborhoodRow[]>>((acc, r) => {
    (acc[r.city_display] ??= []).push(r);
    return acc;
  }, {});

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading neighborhoods…</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          {showVerified ? "Verified" : "Pending review"} · {rows.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVerified(v => !v)}
            className="text-[10px] font-black uppercase tracking-wider text-primary px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors"
          >
            Show {showVerified ? "pending" : "verified"}
          </button>
          <button onClick={fetchRows} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-10">
          {showVerified ? "No verified neighborhoods yet." : "Nothing pending — all generated content has been reviewed."}
        </div>
      )}

      {Object.entries(grouped).map(([city, cityRows]) => (
        <div key={city} className="space-y-2">
          <div className="text-sm font-black flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-primary" /> {city}
            <span className="text-[10px] font-bold text-muted-foreground normal-case">
              ({cityRows[0]?.source === "curated" ? "curated" : "AI-generated"})
            </span>
          </div>
          {cityRows.map(row => {
            const edit = editing[row.id] ?? { name: row.name, emoji: row.emoji, description: row.description };
            return (
              <div key={row.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={edit.emoji}
                    onChange={e => setEditing(prev => ({ ...prev, [row.id]: { ...edit, emoji: e.target.value } }))}
                    className="w-10 h-10 text-center text-lg bg-muted rounded-xl border border-border"
                    maxLength={4}
                  />
                  <input
                    value={edit.name}
                    onChange={e => setEditing(prev => ({ ...prev, [row.id]: { ...edit, name: e.target.value } }))}
                    className="flex-1 bg-muted rounded-xl border border-border px-3 py-2 text-sm font-bold"
                  />
                </div>
                <textarea
                  value={edit.description}
                  onChange={e => setEditing(prev => ({ ...prev, [row.id]: { ...edit, description: e.target.value } }))}
                  className="w-full bg-muted rounded-xl border border-border px-3 py-2 text-xs resize-none"
                  rows={2}
                />
                <div className="flex items-center gap-2">
                  {!row.verified && (
                    <button
                      onClick={() => handleApprove(row.id)}
                      disabled={actionLoading === row.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-primary text-primary-foreground rounded-xl py-2 text-xs font-black disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {row.verified && row.source !== "curated" && (
                    <button
                      onClick={() => handleApprove(row.id)}
                      disabled={actionLoading === row.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-muted rounded-xl py-2 text-xs font-black disabled:opacity-50"
                    >
                      Save edits
                    </button>
                  )}
                  {row.source !== "curated" && (
                    <button
                      onClick={() => handleDelete(row.id)}
                      disabled={actionLoading === row.id}
                      className="px-3 flex items-center justify-center gap-1 bg-destructive/10 text-destructive rounded-xl py-2 text-xs font-black disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CivicTab() {
  const [suggestions, setSuggestions] = useState<CivicSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CivicSuggestion | null>(null);
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/civic/suggestions`, { headers: authHeaders() });
      const data = await res.json() as CivicSuggestion[];
      if (Array.isArray(data)) setSuggestions(data);
    } catch {
      toast({ title: "Failed to load suggestions", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { fetchSuggestions(); }, [fetchSuggestions]);

  const handleReview = async (id: number, status: "approved" | "dismissed") => {
    setActionLoading(true);
    try {
      const res = await fetch(`${base}/api/civic/suggestions/${id}/review`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status, admin_notes: notes.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: status === "approved" ? "✅ Suggestion approved" : "Suggestion dismissed" });
      setSelected(null);
      setNotes("");
      await fetchSuggestions();
    } catch {
      toast({ title: "Action failed", variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const pending = suggestions.filter(s => s.status === "pending");
  const reviewed = suggestions.filter(s => s.status !== "pending");

  if (loading) return (
    <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin" />
      <span className="text-sm">Loading suggestions…</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-black uppercase tracking-wider text-muted-foreground">
          Community Suggestions · {pending.length} pending
        </div>
        <button onClick={fetchSuggestions} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>

      {suggestions.length === 0 && (
        <div className="text-center py-16 px-4">
          <Inbox className="w-10 h-10 text-primary/30 mx-auto mb-3" />
          <div className="font-bold text-sm text-muted-foreground">No suggestions yet</div>
          <div className="text-xs text-muted-foreground/60 mt-1">Community-submitted civic resource suggestions will appear here</div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-yellow-500">Awaiting Review</div>
          {pending.map(s => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="bg-card border border-yellow-500/20 rounded-2xl p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm">{s.name}</div>
                  {s.category && <div className="text-[10px] text-primary font-bold uppercase tracking-wider mt-0.5">{s.category}</div>}
                  {s.description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.description}</p>}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2">
                    {s.phone && <span className="text-[10px] text-muted-foreground">📞 {s.phone}</span>}
                    {s.website && <span className="text-[10px] text-muted-foreground">🌐 {s.website}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground/60 mt-1">{fmtDate(s.created_at)}</div>
                </div>
                <button
                  onClick={() => { setSelected(s); setNotes(""); }}
                  className="shrink-0 p-2 rounded-xl border border-border hover:border-primary/40 transition-colors"
                  aria-label="Review this suggestion"
                >
                  <Eye className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {reviewed.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Reviewed</div>
          {reviewed.map(s => {
            const sc = SUGGESTION_STATUS[s.status] ?? SUGGESTION_STATUS["dismissed"];
            return (
              <div key={s.id} className="bg-card/60 border border-border rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{s.name}</div>
                  {s.admin_notes && <div className="text-[10px] text-muted-foreground truncate">{s.admin_notes}</div>}
                </div>
                <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${sc.color}`}>
                  {sc.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Review bottom sheet */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl p-5 space-y-4"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto" />
              <div>
                <div className="font-black text-base">{selected.name}</div>
                {selected.category && <div className="text-xs text-primary font-bold uppercase tracking-wider">{selected.category}</div>}
                {selected.description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{selected.description}</p>}
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Admin Notes (optional)</div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Internal note about this suggestion…"
                  rows={2}
                  className="w-full bg-muted border border-border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleReview(selected.id, "approved")}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 p-3 bg-green-500/15 border border-green-500/30 rounded-2xl text-green-400 font-black text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <CheckCheck className="w-4 h-4" /> Approve
                </button>
                <button
                  onClick={() => handleReview(selected.id, "dismissed")}
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-2 p-3 bg-muted border border-border rounded-2xl text-muted-foreground font-black text-sm active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <ThumbsDown className="w-4 h-4" /> Dismiss
                </button>
              </div>
              <button onClick={() => setSelected(null)} className="w-full text-xs text-muted-foreground py-2">
                Cancel
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers Tab ───────────────────────────────────────────────────────────────

interface HelperApplicant {
  id: number;
  name: string;
  email: string;
  avatar_url?: string | null;
  is_helper: boolean;
  helper_status: "pending" | "approved" | "denied" | null;
  helper_skills?: string[] | null;
  helper_languages?: string[] | null;
  helper_qualifications?: string[] | null;
  helper_bio?: string | null;
  helper_vehicle?: string | null;
  helper_social_links?: string | null;
  trust_score?: number | null;
  help_count?: number | null;
  neighborhood?: string | null;
  created_at?: string | null;
}

type HelperFilter = "pending" | "approved" | "denied";

function HelpersTab() {
  const [filter, setFilter] = useState<HelperFilter>("pending");
  const [applicants, setApplicants] = useState<HelperApplicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async (status: HelperFilter) => {
    setLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const adminToken = getAdminToken();
      const res = await fetch(`${base}/api/admin/helper-applications?status=${status}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json() as { data: HelperApplicant[] } | HelperApplicant[];
      // Backend now returns { data, total, limit, offset, has_more } —
      // unwrap it, staying tolerant of the old bare-array shape too.
      setApplicants(Array.isArray(json) ? json : json.data);
    } catch {
      toast({ title: "Failed to load helper applications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const handleReview = async (id: number, decision: "approved" | "denied") => {
    setActionLoading(id);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const adminToken = getAdminToken();
      const res = await fetch(`${base}/api/admin/helper-applications/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: decision === "approved" ? "✅ Helper approved!" : "❌ Application denied" });
      setApplicants(prev => prev.filter(a => a.id !== id));
      setExpanded(null);
    } catch {
      toast({ title: "Action failed — try again", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const filterColors: Record<HelperFilter, string> = {
    pending:  "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
    approved: "bg-green-500/20 border-green-500/40 text-green-300",
    denied:   "bg-destructive/20 border-destructive/40 text-destructive",
  };

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["pending", "approved", "denied"] as HelperFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-xs font-black rounded-xl border capitalize transition-all ${
              filter === f ? filterColors[f] : "bg-muted border-border text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applicants.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-muted-foreground text-sm font-bold">No {filter} applications</p>
          <p className="text-xs text-muted-foreground mt-1">All caught up!</p>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {applicants.map(a => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, overflow: "hidden" }}
              transition={{ duration: 0.2 }}
              className="bg-card border border-border rounded-2xl overflow-hidden"
            >
              {/* Card header */}
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="w-full flex items-center gap-3 p-4 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 font-black text-primary text-sm">
                  {a.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm truncate">{a.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{a.email}</div>
                  {a.neighborhood && (
                    <div className="text-[10px] text-muted-foreground">📍 {a.neighborhood}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border capitalize ${filterColors[a.helper_status ?? "pending" as HelperFilter]}`}>
                    {a.helper_status}
                  </span>
                  {expanded === a.id ? <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground rotate-90" /> : <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground -rotate-90" />}
                </div>
              </button>

              {/* Expanded details */}
              {expanded === a.id && (
                <div className="px-4 pb-4 space-y-3 border-t border-border/50 pt-3">
                  {/* Skills */}
                  {(a.helper_skills?.length ?? 0) > 0 && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Skills</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(a.helper_skills ?? []).map(s => (
                          <span key={s} className="text-[11px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                            {s.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Languages */}
                  {(a.helper_languages?.length ?? 0) > 0 && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Languages</div>
                      <div className="flex flex-wrap gap-1.5">
                        {(a.helper_languages ?? []).map(l => (
                          <span key={l} className="text-[11px] bg-muted border border-border text-foreground px-2 py-0.5 rounded-full font-bold">
                            🌐 {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Qualifications */}
                  {(a.helper_qualifications?.length ?? 0) > 0 && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">Qualifications</div>
                      <div className="space-y-1">
                        {(a.helper_qualifications ?? []).map(q => (
                          <div key={q} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                            {q}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Vehicle */}
                  {a.helper_vehicle && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Transportation</div>
                      <span className="text-xs text-foreground capitalize">{a.helper_vehicle.replace(/_/g, " ")}</span>
                    </div>
                  )}

                  {/* Bio */}
                  {a.helper_bio && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Bio</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{a.helper_bio}</p>
                    </div>
                  )}

                  {/* Social */}
                  {a.helper_social_links && (
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Social</div>
                      <p className="text-xs text-muted-foreground">{a.helper_social_links}</p>
                    </div>
                  )}

                  {/* Approve / Deny buttons */}
                  {filter === "pending" && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 font-black text-xs"
                        disabled={actionLoading === a.id}
                        onClick={() => handleReview(a.id, "denied")}
                      >
                        {actionLoading === a.id ? <span className="flex items-center gap-1"><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />…</span> : <><ThumbsDown className="w-3 h-3 mr-1" />Deny</>}
                      </Button>
                      <Button
                        size="sm"
                        className="font-black text-xs"
                        disabled={actionLoading === a.id}
                        onClick={() => handleReview(a.id, "approved")}
                      >
                        {actionLoading === a.id ? <span className="flex items-center gap-1"><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />…</span> : <><CheckCheck className="w-3 h-3 mr-1" />Approve</>}
                      </Button>
                    </div>
                  )}

                  {/* Re-evaluate options for already-decided */}
                  {filter !== "pending" && (
                    <div className="pt-1">
                      {filter === "approved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 font-black text-xs"
                          disabled={actionLoading === a.id}
                          onClick={() => handleReview(a.id, "denied")}
                        >
                          <ThumbsDown className="w-3 h-3 mr-1" />Revoke Approval
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="w-full font-black text-xs"
                          disabled={actionLoading === a.id}
                          onClick={() => handleReview(a.id, "approved")}
                        >
                          <CheckCheck className="w-3 h-3 mr-1" />Approve Now
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Main Admin Screen ─────────────────────────────────────────────────────────

type TabId = "reports" | "users" | "analytics" | "civic" | "helpers" | "neighborhoods";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "reports",       label: "Reports",   icon: Flag },
  { id: "users",         label: "Users",     icon: Users },
  { id: "helpers",       label: "Helpers",   icon: CheckCheck },
  { id: "analytics",     label: "Analytics", icon: BarChart3 },
  { id: "civic",         label: "Civic",     icon: Inbox },
  { id: "neighborhoods", label: "Hoods",     icon: Globe },
];

export default function AdminScreen() {
  const [authed, setAuthed] = useState(!!getAdminToken());
  const [activeTab, setActiveTab] = useState<TabId>("reports");
  const [, setLocation] = useLocation();

  const handleLogout = () => {
    clearAdminToken();
    sessionStorage.removeItem(SESSION_USER_KEY);
    setAuthed(false);
  };

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/profile")} className="p-1.5 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" /> Admin
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-[10px] font-black text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg hover:bg-destructive/10"
          >
            Sign out
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3 bg-muted rounded-xl p-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition-all ${
                activeTab === tab.id
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "reports"   && <ReportsTab />}
            {activeTab === "users"     && <UsersTab />}
            {activeTab === "helpers"   && <HelpersTab />}
            {activeTab === "analytics" && <AnalyticsTab />}
            {activeTab === "civic"     && <CivicTab />}
            {activeTab === "neighborhoods" && <NeighborhoodsTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
