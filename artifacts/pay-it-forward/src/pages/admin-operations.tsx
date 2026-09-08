import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Cpu, Database, Flag, Globe2, Loader2, Map, RefreshCw, Shield, Sparkles, Wallet } from "lucide-react";
import { getToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type Snapshot = {
  stats: {
    total_users?: number;
    active_helpers?: number;
    pending_reports?: number;
    total_requests?: number;
  } | null;
  pool: {
    balance: number;
    guaranteed_minimum: number;
    runway_days: number | null;
    pending_minimums_count: number;
    enabled: boolean;
  } | null;
  workers: {
    status: string;
    redis_configured: boolean;
    workers: Array<{ name: string; label: string; status: string; failureCount?: number }>;
  } | null;
  globalOps: {
    summary: { total_open_requests: number; total_online_helpers: number; regions_active: number };
    gps_health: { helpers_online_with_gps: number; helpers_online_no_gps: number; total_online_helpers: number };
    feature_checks: Record<string, boolean | string>;
  } | null;
  boundaries: Array<{
    id: number;
    city_key: string;
    neighborhood_id: string;
    name: string;
    source_publisher: string;
    source_dataset: string;
    source_version: string;
    geometry_valid: boolean;
    geometry_verified: boolean;
    reviewed: boolean;
    review_note: string | null;
    rejection_reason: string | null;
  }>;
  nia: { enabled: boolean } | null;
};

function Card({ title, icon: Icon, children, tone = "default" }: { title: string; icon: React.ElementType; children: React.ReactNode; tone?: "default" | "warning" | "danger" | "success" }) {
  const border = tone === "danger" ? "border-destructive/30 bg-destructive/5" : tone === "warning" ? "border-yellow-500/30 bg-yellow-500/5" : tone === "success" ? "border-green-500/20 bg-green-500/5" : "border-border bg-card";
  return <section className={`rounded-2xl border p-4 space-y-3 ${border}`}><div className="flex items-center gap-2"><Icon className="w-4 h-4 text-primary" /><h2 className="text-xs font-black uppercase tracking-wider">{title}</h2></div>{children}</section>;
}

function Metric({ label, value, sub, danger = false }: { label: string; value: string | number; sub?: string; danger?: boolean }) {
  return <div className="rounded-xl border border-border bg-background p-3"><div className={`text-xl font-black tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>{value}</div><div className="text-[10px] font-bold text-muted-foreground">{label}</div>{sub && <div className="text-[9px] text-muted-foreground/70 mt-0.5">{sub}</div>}</div>;
}

export default function AdminOperationsDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [boundaryBusy, setBoundaryBusy] = useState<number | null>(null);
  const [city, setCity] = useState("all");
  const [boundaryFilter, setBoundaryFilter] = useState<"all" | "pending" | "verified" | "invalid">("pending");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    try {
      const h = authHeaders();
      const [stats, pool, workers, globalOps, boundaries, nia] = await Promise.all([
        fetch(`${BASE}/api/admin/stats`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/pool/stats`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/admin/worker-health`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/admin/global-ops`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BASE}/api/admin/neighborhood-boundary-imports`, { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${BASE}/api/admin/nia-status`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setSnapshot({ stats, pool, workers, globalOps, boundaries: Array.isArray(boundaries) ? boundaries : [], nia });
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  const cities = useMemo(() => ["all", ...Array.from(new Set((snapshot?.boundaries ?? []).map(b => b.city_key))).sort()], [snapshot?.boundaries]);
  const filteredBoundaries = useMemo(() => (snapshot?.boundaries ?? []).filter(b => {
    if (city !== "all" && b.city_key !== city) return false;
    if (boundaryFilter === "pending") return !b.reviewed && b.geometry_valid;
    if (boundaryFilter === "verified") return b.reviewed && b.geometry_verified;
    if (boundaryFilter === "invalid") return !b.geometry_valid;
    return true;
  }), [snapshot?.boundaries, city, boundaryFilter]);

  const boundaryReview = async (id: number, reviewed: boolean, geometryVerified = false) => {
    setBoundaryBusy(id);
    try {
      const res = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ reviewed, geometry_verified: geometryVerified, review_note: reviewed ? "Reviewed in Admin 2.0 operations console." : "Rejected in Admin 2.0 operations console." }),
      });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Review failed (${res.status})`);
      toast({ title: reviewed ? "Boundary reviewed" : "Boundary rejected" });
      await load(true);
    } catch (err) {
      toast({ title: "Boundary action failed", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBoundaryBusy(null);
    }
  };

  const promote = async (id: number) => {
    if (!window.confirm("Promote this reviewed, geometry-verified authoritative boundary to GPS-active neighborhood data?")) return;
    setBoundaryBusy(id);
    try {
      const res = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${id}/promote`, { method: "POST", headers: authHeaders() });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `Promotion failed (${res.status})`);
      toast({ title: "Boundary promoted", description: "The GPS Host Signal can now use the promoted neighborhood geometry." });
      await load(true);
    } catch (err) {
      toast({ title: "Promotion blocked", description: err instanceof Error ? err.message : "Try again.", variant: "destructive" });
    } finally {
      setBoundaryBusy(null);
    }
  };

  if (loading && !snapshot) return <div className="min-h-screen flex items-center justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Loading Admin operations…</div>;

  const poolLow = snapshot?.pool ? snapshot.pool.balance < snapshot.pool.guaranteed_minimum : false;
  const failedWorkers = snapshot?.workers?.workers.filter(w => w.status === "error").length ?? 0;
  const gpsTotal = snapshot?.globalOps?.gps_health.total_online_helpers ?? 0;
  const gpsPct = gpsTotal ? Math.round(((snapshot?.globalOps?.gps_health.helpers_online_with_gps ?? 0) / gpsTotal) * 100) : 0;

  return <div className="min-h-screen bg-background text-foreground px-4 py-5 pb-10">
    <div className="max-w-6xl mx-auto space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><Shield className="w-5 h-5 text-destructive" /><h1 className="text-xl font-black tracking-tight">Admin 2.0 Operations</h1></div><p className="text-xs text-muted-foreground mt-1">Attention-first production control surface · live API-backed snapshot</p></div>
        <button onClick={() => void load(true)} disabled={refreshing} className="h-9 px-3 rounded-xl border border-border bg-card text-xs font-black flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Users" value={snapshot?.stats?.total_users ?? "—"} sub="live admin stats" />
        <Metric label="Helpers online" value={snapshot?.globalOps?.summary.total_online_helpers ?? snapshot?.stats?.active_helpers ?? "—"} sub={`${gpsPct}% online helpers with GPS`} />
        <Metric label="Open requests" value={snapshot?.globalOps?.summary.total_open_requests ?? snapshot?.stats?.total_requests ?? "—"} sub="live coverage" />
        <Metric label="Pending reports" value={snapshot?.stats?.pending_reports ?? "—"} danger={(snapshot?.stats?.pending_reports ?? 0) > 0} sub="needs moderation" />
      </div>

      {(poolLow || failedWorkers > 0 || (snapshot?.boundaries ?? []).some(b => !b.geometry_valid)) && <Card title="Attention required" icon={AlertCircle} tone="danger">
        <div className="grid gap-2 md:grid-cols-3">
          {poolLow && <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs"><b>Community Pool</b><div className="text-destructive font-black mt-1">${snapshot?.pool?.balance.toFixed(2)} below ${snapshot?.pool?.guaranteed_minimum.toFixed(2)} floor</div></div>}
          {failedWorkers > 0 && <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs"><b>Workers</b><div className="text-destructive font-black mt-1">{failedWorkers} worker failure{failedWorkers === 1 ? "" : "s"}</div></div>}
          {(snapshot?.boundaries ?? []).some(b => !b.geometry_valid) && <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs"><b>Geography</b><div className="text-destructive font-black mt-1">Invalid staged geometry requires review</div></div>}
        </div>
      </Card>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Community Pool" icon={Wallet} tone={poolLow ? "warning" : "success"}>
          <div className="grid grid-cols-2 gap-2"><Metric label="Balance" value={snapshot?.pool ? `$${snapshot.pool.balance.toFixed(2)}` : "—"} /><Metric label="Runway" value={snapshot?.pool?.runway_days == null ? "∞" : `${snapshot.pool.runway_days}d`} /><Metric label="Queued minimums" value={snapshot?.pool?.pending_minimums_count ?? "—"} /><Metric label="Status" value={snapshot?.pool?.enabled ? "ACTIVE" : "PAUSED"} /></div>
        </Card>
        <Card title="System & Workers" icon={Cpu} tone={failedWorkers ? "danger" : "success"}>
          <div className="flex items-center justify-between text-xs"><span>Redis</span><b>{snapshot?.workers?.redis_configured ? "Connected" : "Unavailable"}</b></div>
          <div className="space-y-1 max-h-44 overflow-auto">{snapshot?.workers?.workers.map(w => <div key={w.name} className="flex items-center gap-2 text-[10px] border-b border-border/60 py-1.5"><span className={`w-1.5 h-1.5 rounded-full ${w.status === "running" ? "bg-green-500" : w.status === "error" ? "bg-destructive" : "bg-yellow-500"}`} /><span className="flex-1">{w.label}</span><span className="font-bold capitalize">{w.status}</span></div>)}</div>
        </Card>
        <Card title="Nia & App Connectivity" icon={Sparkles} tone={snapshot?.nia?.enabled ? "success" : "default"}>
          <div className="grid grid-cols-2 gap-2"><Metric label="Nia" value={snapshot?.nia?.enabled ? "ON" : "OFF"} /><Metric label="GPS coverage" value={`${gpsPct}%`} sub={`${snapshot?.globalOps?.gps_health.helpers_online_with_gps ?? 0} with GPS`} /></div>
          <div className="text-[10px] text-muted-foreground">Admin data is sourced from the same production API used by the app. No client-side mock counts are introduced here.</div>
        </Card>
      </div>

      <Card title="Authoritative Neighborhood Boundary Review" icon={Map}>
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">Staged GIS is deliberately separate from GPS-active neighborhood data. Review and geometry verification are explicit gates; promotion is never automatic. Generated neighborhood hints cannot be promoted.</div>
        <div className="flex gap-2 flex-wrap"><select value={city} onChange={e => setCity(e.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-xs"><option value="all">All cities</option>{cities.filter(c => c !== "all").map(c => <option key={c} value={c}>{c}</option>)}</select>{(["all", "pending", "verified", "invalid"] as const).map(f => <button key={f} onClick={() => setBoundaryFilter(f)} className={`h-9 px-3 rounded-xl border text-xs font-black capitalize ${boundaryFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background text-muted-foreground"}`}>{f}</button>)}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2"><Metric label="Staged" value={snapshot?.boundaries.length ?? 0} /><Metric label="Valid" value={(snapshot?.boundaries ?? []).filter(b => b.geometry_valid).length} /><Metric label="Reviewed" value={(snapshot?.boundaries ?? []).filter(b => b.reviewed).length} /><Metric label="GPS verified" value={(snapshot?.boundaries ?? []).filter(b => b.geometry_verified).length} /></div>
        <div className="space-y-2">{filteredBoundaries.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No boundaries in this queue.</div> : filteredBoundaries.map(b => <div key={b.id} className="rounded-xl border border-border bg-background p-3 space-y-2"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-bold text-sm truncate">{b.name}</div><div className="text-[10px] text-muted-foreground">{b.city_key} · {b.source_publisher} · {b.source_dataset} · v{b.source_version}</div></div><div className="flex flex-wrap gap-1 justify-end"><span className={`text-[9px] px-2 py-0.5 rounded-full border ${b.geometry_valid ? "border-green-500/20 text-green-400" : "border-destructive/30 text-destructive"}`}>{b.geometry_valid ? "PostGIS valid" : "Invalid"}</span>{b.geometry_verified && <span className="text-[9px] px-2 py-0.5 rounded-full border border-green-500/20 text-green-400">Geometry verified</span>}{b.reviewed && <span className="text-[9px] px-2 py-0.5 rounded-full border border-primary/20 text-primary">Reviewed</span>}</div></div>
          {b.review_note && <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-lg p-2">Note: {b.review_note}</div>}
          {b.rejection_reason && <div className="text-[10px] text-destructive bg-destructive/5 rounded-lg p-2">Rejected: {b.rejection_reason}</div>}
          <div className="flex gap-2">{!b.reviewed && b.geometry_valid && <><button onClick={() => void boundaryReview(b.id, false, false)} disabled={boundaryBusy === b.id} className="flex-1 h-9 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-xs font-black">Reject</button><button onClick={() => void boundaryReview(b.id, true, true)} disabled={boundaryBusy === b.id} className="flex-1 h-9 rounded-xl bg-primary text-primary-foreground text-xs font-black">Review + Verify Geometry</button></>}{b.reviewed && b.geometry_verified && b.geometry_valid && <button onClick={() => void promote(b.id)} disabled={boundaryBusy === b.id} className="w-full h-9 rounded-xl bg-green-500 text-white text-xs font-black">{boundaryBusy === b.id ? "Working…" : "Promote to GPS-active"}</button>}</div>
        </div>)}</div>
      </Card>

      <Card title="Production connectivity" icon={Database}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{Object.entries(snapshot?.globalOps?.feature_checks ?? {}).map(([key, value]) => <div key={key} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-[10px] font-bold"><CheckCircle2 className={`w-3.5 h-3.5 ${value === true || value === "ok" ? "text-green-500" : "text-destructive"}`} />{key.replace(/_/g, " ")}</div>)}</div>
        <div className="text-[10px] text-muted-foreground">Last snapshot: {updatedAt?.toLocaleString() ?? "—"} · auto-refresh 30s</div>
      </Card>

      <div className="text-[10px] text-muted-foreground flex items-center gap-2"><Clock3 className="w-3 h-3" />This console is intentionally read-heavy. Financial and geography mutations remain explicit admin actions with server-side authorization and validation.</div>
    </div>
  </div>;
}
