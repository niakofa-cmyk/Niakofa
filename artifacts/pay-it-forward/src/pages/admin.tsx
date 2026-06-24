import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Shield, AlertCircle, CheckCircle2, Clock, X, ChevronLeft,
  Eye, Flag, User as UserIcon, RefreshCw, Filter, ExternalLink,
  Users, Search, Ban, AlertTriangle, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30" },
  under_review: { label: "Under Review", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  resolved_dismissed: { label: "Dismissed", color: "bg-muted text-muted-foreground border-border" },
  resolved_warned: { label: "Warned", color: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  resolved_banned: { label: "Banned", color: "bg-destructive/15 text-destructive border-destructive/30" },
};

const TYPE_LABELS: Record<string, string> = {
  suspicious_request: "Suspicious Request",
  suspicious_helper: "Suspicious Helper",
  fraud: "Fraud",
  harassment: "Harassment",
  fake_profile: "Fake Profile",
  dangerous_behavior: "Dangerous Behavior",
  spam: "Spam",
  other: "Other",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ReportDetailSheet({ report, onClose, onReviewed }: {
  report: Report;
  onClose: () => void;
  onReviewed: (updated: Report) => void;
}) {
  const [status, setStatus] = useState<string>(report.status === "pending" ? "under_review" : report.status);
  const [notes, setNotes] = useState(report.admin_notes ?? "");
  const [saving, setSaving] = useState(false);

  const handleReview = async () => {
    const actionableStatuses = ["under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];
    if (!actionableStatuses.includes(status)) return;
    setSaving(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/reports/${report.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, admin_notes: notes || null, reviewed_by: 1 }),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json() as Report;
      onReviewed(updated);
      toast({ title: "Report updated", description: `Status set to: ${STATUS_LABELS[status]?.label ?? status}` });
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
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border rounded-t-3xl max-h-[92dvh] overflow-y-auto"
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
          {/* Meta */}
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

          {/* Description */}
          <div className="bg-background rounded-xl p-4 border border-border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Description</div>
            <p className="text-sm leading-relaxed">{report.description}</p>
          </div>

          {/* Action */}
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
              {saving ? (
                <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Saving…</span>
              ) : "Submit Review"}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

const STATUS_FILTERS = ["all", "pending", "under_review", "resolved_dismissed", "resolved_warned", "resolved_banned"];


interface AdminUser {
  id: number;
  name: string;
  email: string;
  is_helper: boolean;
  trust_score: number | null;
  help_count: number;
  created_at: string;
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionUser, setActionUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    fetch(`${base}/api/users?limit=100`)
      .then(r => r.json())
      .then((data) => { if (Array.isArray(data)) setUsers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const handleAction = async (userId: number, action: "warn" | "ban") => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    try {
      await fetch(`${base}/api/users/${userId}/moderation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
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
      {/* Search */}
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
                  <Star className="w-3 h-3" />{(user.trust_score ?? 0).toFixed(0)}%
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

export default function AdminScreen() {
  // Persist admin session across navigation within the same browser tab.
  // sessionStorage clears when the tab closes — no long-lived admin cookies.
  const [authed, setAuthed] = useState(() => sessionStorage.getItem("nia_admin_authed") === "1");
  const [adminInput, setAdminInput] = useState("");
  const [, setLocation] = useLocation();

  const handleAuth = async (secret: string) => {
    if (!secret.trim()) return;
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/api/admin/verify-secret`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": secret,
        },
        body: JSON.stringify({ secret }),
      });
      if (res.ok) {
        sessionStorage.setItem("nia_admin_authed", "1");
        setAuthed(true);
      } else {
        alert("Incorrect admin secret");
      }
    } catch {
      alert("Could not verify — check your connection");
    }
  };
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

  const fetchReports = async (status?: string) => {
    setLoading(true);
    try {
      const url = status && status !== "all"
        ? `${base}/api/reports?status=${status}`
        : `${base}/api/reports`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json() as Report[];
      setReports(data);
    } catch {
      toast({ title: "Could not load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (authed) fetchReports(statusFilter); }, [statusFilter, authed]);

  if (!authed) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-8 gap-6">
        <Shield className="w-12 h-12 text-primary" />
        <div className="text-center">
          <h1 className="text-2xl font-black">Admin Access</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter the admin secret to continue</p>
        </div>
        <div className="w-full max-w-xs space-y-3">
          <input
            type="password"
            placeholder="Admin secret"
            value={adminInput}
            onChange={e => setAdminInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAuth(adminInput); }}
            className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          <button
            onClick={() => handleAuth(adminInput)}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm"
          >
            Enter Admin
          </button>
        </div>
      </div>
    );
  }

  const openDetail = async (report: Report) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`${base}/api/reports/${report.id}`);
      if (res.ok) {
        const detail = await res.json() as Report;
        setSelectedReport(detail);
      } else {
        setSelectedReport(report);
      }
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
    <div className="min-h-screen bg-background text-foreground flex flex-col pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur-xl border-b border-border p-4 pt-safe">
        <div className="flex items-center gap-3">
          <button onClick={() => setLocation("/profile")} className="p-1.5 rounded-xl hover:bg-muted transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-5 h-5 text-destructive" /> Admin Review
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted-foreground">{reports.length} total</span>
              {pendingCount > 0 && (
                <span className="text-[10px] font-black bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-2 py-0.5 rounded-full">
                  {pendingCount} pending
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => fetchReports(statusFilter)}
            disabled={loading}
            className="p-2 rounded-xl hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3 overflow-x-auto scrollbar-none pb-1">
          {STATUS_FILTERS.map(s => {
            const meta = STATUS_LABELS[s];
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-all ${
                  isActive
                    ? s === "all"
                      ? "bg-primary text-primary-foreground border-primary"
                      : meta?.color ?? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s === "all" ? "All" : meta?.label ?? s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-4 space-y-3">
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
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                    {report.description}
                  </p>
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
                  {report.status === "pending" && (
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  )}
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
      </div>

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
