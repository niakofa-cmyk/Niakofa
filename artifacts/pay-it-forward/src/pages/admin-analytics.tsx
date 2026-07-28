/**
 * AdminAnalyticsDashboard — Phase 9D
 *
 * Mounted at /admin/analytics inside the existing AdminScreen tab system.
 * Fetches GET /api/admin/analytics and renders:
 *  - Overview KPI cards
 *  - Daily request volume (7d bar chart)
 *  - Requests by category
 *  - Trust score distribution
 *  - Voice activation rate + language distribution
 *  - Pledge pool health
 *  - Reports by status / type
 */
import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Users, CheckCircle2, Mic, Globe, ShieldAlert,
  TrendingUp, DollarSign, RefreshCw,
} from "lucide-react";

// ── types ────────────────────────────────────────────────────────────────────
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
  helper_compensation?: { avg_effective_hourly_rate: number; sample_size: number };
  reports_by_status: { status: string; count: number }[];
  reports_by_type: { type: string; count: number }[];
  trust_score_distribution: { bucket: string; count: number }[];
  voice_activation: { total_requests_7d: number; voice_activated_7d: number; rate_pct: number };
  language_distribution: { language: string; count: number }[];
}

// ── constants ────────────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", ar: "Arabic",
  zh: "Mandarin", hi: "Hindi", sw: "Swahili", zu: "Zulu",
  pt: "Portuguese", de: "German", yo: "Yoruba", ha: "Hausa",
};

const PIE_COLORS = [
  "#FF3C00", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#6366f1", "#a855f7", "#ec4899",
];

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// ── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-black text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-black text-foreground">{title}</h3>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminAnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/api/admin/analytics`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setData(await res.json());
      setRefreshedAt(new Date());
    } catch (e: any) {
      setError(e.message ?? "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Only block the full screen on the very first load (no data yet).
  // On subsequent refreshes keep showing stale data with a header spinner —
  // replacing the whole dashboard with a blank spinner causes flash-empty
  // on every manual refresh.
  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-6">
        <ShieldAlert className="w-8 h-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{error ?? "No data"}</p>
        <button
          onClick={load}
          className="text-xs font-semibold text-primary underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  const { overview, requests_by_category, daily_request_volume,
    pledge_pool, reports_by_status, reports_by_type,
    trust_score_distribution, voice_activation, language_distribution } = data;

  const langData = language_distribution.map(l => ({
    name: LANG_NAMES[l.language] ?? l.language.toUpperCase(),
    value: l.count,
  }));

  const trustData = trust_score_distribution.map(t => ({
    name: t.bucket,
    count: t.count,
  }));

  const catData = requests_by_category.map(c => ({
    name: c.category.replace(/_/g, " "),
    count: c.count,
  }));

  return (
    <div className="space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-foreground">Platform Analytics</h2>
          <p className="text-[11px] text-muted-foreground">
            Refreshed {refreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-xl px-3 py-1.5 disabled:opacity-60 transition-opacity"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={Users} label="Total Users" value={overview.total_users.toLocaleString()}
          sub={`+${overview.new_users_week} this week`} />
        <KpiCard icon={CheckCircle2} label="Completed" value={overview.total_completed.toLocaleString()}
          sub={`${overview.recent_completions_24h} in last 24h`} />
        <KpiCard icon={Users} label="Helpers Online" value={overview.total_helpers_online}
          sub={`${overview.total_open} open requests`} />
        <KpiCard icon={Mic} label="Voice Rate (7d)" value={`${voice_activation.rate_pct}%`}
          sub={`${voice_activation.voice_activated_7d} of ${voice_activation.total_requests_7d}`} />
      </div>

      {/* Daily volume */}
      <Section title="Request Volume — Last 7 Days">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={daily_request_volume} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
              cursor={{ fill: "rgba(255,60,0,0.08)" }}
            />
            <Bar dataKey="count" name="Requests" fill="#FF3C00" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Voice language distribution */}
      {langData.length > 0 && (
        <Section title="Language Distribution (Voice, 7d)">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={140}>
              <PieChart>
                <Pie data={langData} dataKey="value" cx="50%" cy="50%" outerRadius={60} paddingAngle={2}>
                  {langData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {langData.slice(0, 6).map((l, i) => (
                <div key={l.name} className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="text-[11px] text-muted-foreground flex-1 truncate">{l.name}</span>
                  <span className="text-[11px] font-bold text-foreground">{l.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      )}

      {/* Requests by category */}
      <Section title="Requests by Category (All Time)">
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={catData} layout="vertical" margin={{ top: 0, right: 8, left: 60, bottom: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={60} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
              cursor={{ fill: "rgba(255,60,0,0.08)" }}
            />
            <Bar dataKey="count" name="Requests" fill="#6366f1" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Trust score distribution */}
      <Section title="Trust Score Distribution">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={trustData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 11 }}
              cursor={{ fill: "rgba(255,60,0,0.08)" }}
            />
            <Bar dataKey="count" name="Users" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Pledge pool */}
      <Section title="Pledge Pool Health">
        <div className="grid grid-cols-3 gap-3">
          {[
            // Pool amounts are stored and processed in USD (platform currency).
            // toLocaleString() uses the admin's browser locale for number formatting
            // (e.g. "1,234" in en-US, "1.234" in de-DE) while the $ prefix
            // correctly reflects that these are USD pool amounts.
            { label: "Pledged",  value: `$${pledge_pool.total_pledged.toLocaleString("en-US")}`, color: "text-foreground" },
            { label: "Paid Out", value: `$${pledge_pool.total_paid.toLocaleString("en-US")}`,    color: "text-green-400" },
            { label: "Pending",  value: `$${pledge_pool.pending.toLocaleString("en-US")}`,       color: "text-amber-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-background rounded-xl p-3 text-center">
              <DollarSign className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
              <p className={`text-base font-black ${color}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Helper compensation — effective hourly rate proof-of-livable-wage */}
      {data.helper_compensation && (
        <Section title="Helper Compensation">
          <div className="flex items-center gap-4">
            <div className="bg-background rounded-xl p-4 flex-1 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Avg Effective Hourly Rate</p>
              <p className="text-2xl font-black text-green-400">
                {data.helper_compensation.avg_effective_hourly_rate > 0
                  ? `$${data.helper_compensation.avg_effective_hourly_rate.toFixed(2)}/hr`
                  : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {data.helper_compensation.sample_size > 0
                  ? `Based on ${data.helper_compensation.sample_size} paid tasks`
                  : "No paid tasks with hour estimates yet"}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground px-1">
            Computed from completed Pay-It-Forward tasks where estimated hours and actual payout are both recorded.
            This is the platform's livable-wage proof metric.
          </p>
        </Section>
      )}

      {/* Reports */}
      <Section title="Reports by Status">
        <div className="flex flex-wrap gap-2">
          {reports_by_status.map(r => (
            <div key={r.status} className="flex items-center gap-1.5 bg-background rounded-xl px-3 py-2">
              <span className="text-sm font-black text-foreground">{r.count}</span>
              <span className="text-[11px] text-muted-foreground capitalize">{r.status.replace(/_/g, " ")}</span>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
