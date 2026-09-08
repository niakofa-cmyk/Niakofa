import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { AlertCircle, Cpu, Loader2, Map, RefreshCw, Shield, Sparkles, Wallet } from "lucide-react";
import { getToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type JsonRecord = Record<string, unknown>;
type Boundary = {
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
};
type Snapshot = {
  stats: JsonRecord | null;
  pool: JsonRecord | null;
  workers: JsonRecord | null;
  globalOps: JsonRecord | null;
  boundaries: Boundary[];
  nia: JsonRecord | null;
};
type Filter = "all" | "pending" | "verified" | "invalid";

type Worker = {
  name: string;
  label: string;
  status: string;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function stringValue(value: unknown, fallback = "—"): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function apiHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function Card({
  title,
  icon: Icon,
  children,
  tone = "default",
}: {
  title: string;
  icon: ElementType;
  children: ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/30 bg-destructive/5"
      : tone === "warning"
        ? "border-yellow-500/30 bg-yellow-500/5"
        : tone === "success"
          ? "border-green-500/20 bg-green-500/5"
          : "border-border bg-card";

  return (
    <section className={`space-y-3 rounded-2xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-black uppercase tracking-wider">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Metric({
  label,
  value,
  sub,
  danger = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className={`text-xl font-black tabular-nums ${danger ? "text-destructive" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
      {sub ? <div className="mt-0.5 text-[9px] text-muted-foreground/70">{sub}</div> : null}
    </div>
  );
}

export default function AdminOperationsDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [city, setCity] = useState("all");
  const [filter, setFilter] = useState<Filter>("pending");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      const [stats, pool, workers, globalOps, boundaryPayload, nia] = await Promise.all([
        getJson(`${BASE}/api/admin/stats`),
        getJson(`${BASE}/api/pool/stats`),
        getJson(`${BASE}/api/admin/worker-health`),
        getJson(`${BASE}/api/admin/global-ops`),
        getJson(`${BASE}/api/admin/neighborhood-boundary-imports`),
        getJson(`${BASE}/api/admin/nia-status`),
      ]);

      const boundaryData = arrayValue(boundaryPayload);
      const boundaries = boundaryData.filter((item): item is Boundary => {
        const value = record(item);
        return typeof value.id === "number" && typeof value.city_key === "string" && typeof value.name === "string";
      });

      setSnapshot({
        stats: stats ? record(stats) : null,
        pool: pool ? record(pool) : null,
        workers: workers ? record(workers) : null,
        globalOps: globalOps ? record(globalOps) : null,
        boundaries,
        nia: nia ? record(nia) : null,
      });
      setUpdatedAt(new Date());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  const cities = useMemo(() => {
    const values = snapshot?.boundaries.map((boundary) => boundary.city_key) ?? [];
    return ["all", ...Array.from(new Set(values)).sort()];
  }, [snapshot?.boundaries]);

  const rows = useMemo(() => {
    return (snapshot?.boundaries ?? []).filter((boundary) => {
      if (city !== "all" && boundary.city_key !== city) return false;
      if (filter === "pending") return !boundary.reviewed && boundary.geometry_valid;
      if (filter === "verified") return boundary.reviewed && boundary.geometry_verified && boundary.geometry_valid;
      if (filter === "invalid") return !boundary.geometry_valid;
      return true;
    });
  }, [city, filter, snapshot?.boundaries]);

  const mutateBoundary = async (
    id: number,
    body: JsonRecord,
    successTitle: string,
    failureTitle: string,
    description?: string,
  ) => {
    setBusy(id);
    try {
      const response = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify(body),
      });
      const payload = record(await response.json().catch(() => null));
      if (!response.ok) throw new Error(stringValue(payload.error, `Request failed (${response.status})`));
      toast({ title: successTitle, description });
      await load(true);
    } catch (error) {
      toast({
        title: failureTitle,
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const review = (id: number, approved: boolean) =>
    mutateBoundary(
      id,
      {
        reviewed: approved,
        geometry_verified: false,
        review_note: approved
          ? "Reviewed in Admin 2.0 operations console."
          : "Rejected in Admin 2.0 operations console.",
      },
      approved ? "Boundary reviewed" : "Boundary rejected",
      "Boundary review failed",
    );

  const verify = (id: number) =>
    mutateBoundary(
      id,
      {
        reviewed: true,
        geometry_verified: true,
        review_note: "Geometry explicitly verified in Admin 2.0 operations console.",
      },
      "Geometry verified",
      "Geometry verification failed",
      "Promotion remains a separate explicit step.",
    );

  const promote = async (id: number) => {
    if (!window.confirm("Promote this reviewed, geometry-verified authoritative boundary to GPS-active neighborhood data?")) return;

    setBusy(id);
    try {
      const response = await fetch(`${BASE}/api/admin/neighborhood-boundary-imports/${id}/promote`, {
        method: "POST",
        headers: apiHeaders(),
      });
      const payload = record(await response.json().catch(() => null));
      if (!response.ok) throw new Error(stringValue(payload.error, `Promotion failed (${response.status})`));
      toast({
        title: "Boundary promoted",
        description: "GPS Host Signal eligibility can now use the promoted geometry.",
      });
      await load(true);
    } catch (error) {
      toast({
        title: "Promotion blocked",
        description: error instanceof Error ? error.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading && !snapshot) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading Admin operations…
      </div>
    );
  }

  const stats = record(snapshot?.stats);
  const pool = record(snapshot?.pool);
  const workers = record(snapshot?.workers);
  const globalOps = record(snapshot?.globalOps);
  const nia = record(snapshot?.nia);
  const workerRows: Worker[] = arrayValue(workers.workers).flatMap((item) => {
    const value = record(item);
    if (typeof value.name !== "string") return [];
    return [{ name: value.name, label: stringValue(value.label, value.name), status: stringValue(value.status, "unknown") }];
  });
  const poolBalance = numberValue(pool.balance);
  const guaranteedMinimum = numberValue(pool.guaranteed_minimum);
  const poolLow = snapshot?.pool !== null && snapshot?.pool !== undefined && poolBalance < guaranteedMinimum;
  const failedWorkers = workerRows.filter((worker) => worker.status === "error").length;
  const gpsHealth = record(globalOps.gps_health);
  const gpsTotal = numberValue(gpsHealth.total_online_helpers);
  const gpsWithCoverage = numberValue(gpsHealth.helpers_online_with_gps);
  const gpsPct = gpsTotal > 0 ? Math.round((gpsWithCoverage / gpsTotal) * 100) : 0;
  const invalidCount = (snapshot?.boundaries ?? []).filter((boundary) => !boundary.geometry_valid).length;
  const pendingReports = numberValue(stats.pending_reports);

  return (
    <div className="min-h-screen bg-background px-4 py-5 pb-10 text-foreground">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              <h1 className="text-xl font-black">Admin 2.0 Operations</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Attention-first · live production API · explicit mutation gates</p>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={refreshing}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-black disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        {updatedAt ? <div className="text-right text-[10px] text-muted-foreground">Last updated {updatedAt.toLocaleTimeString()}</div> : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Users" value={stringValue(stats.total_users)} sub="live admin stats" />
          <Metric label="Helpers online" value={stringValue(record(globalOps.summary).total_online_helpers, stringValue(stats.active_helpers))} sub={`${gpsPct}% with fresh GPS`} />
          <Metric label="Open requests" value={stringValue(record(globalOps.summary).total_open_requests)} sub="live coverage" />
          <Metric label="Pending reports" value={pendingReports} danger={pendingReports > 0} sub="moderation queue" />
        </div>

        {(poolLow || failedWorkers > 0 || invalidCount > 0) ? (
          <Card title="Attention required" icon={AlertCircle} tone="danger">
            <div className="grid gap-2 md:grid-cols-3">
              {poolLow ? <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs"><b>Community Pool</b><div className="mt-1 font-black text-destructive">${poolBalance.toFixed(2)} below ${guaranteedMinimum.toFixed(2)} floor</div></div> : null}
              {failedWorkers > 0 ? <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs"><b>Workers</b><div className="mt-1 font-black text-destructive">{failedWorkers} worker failure{failedWorkers === 1 ? "" : "s"}</div></div> : null}
              {invalidCount > 0 ? <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs"><b>Geography</b><div className="mt-1 font-black text-destructive">{invalidCount} invalid staged boundary{invalidCount === 1 ? "" : "ies"}</div></div> : null}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Community Pool" icon={Wallet} tone={poolLow ? "warning" : "success"}>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Balance" value={`$${poolBalance.toFixed(2)}`} />
              <Metric label="Runway" value={pool.runway_days == null ? "∞" : `${stringValue(pool.runway_days)}d`} />
              <Metric label="Queued minimums" value={stringValue(pool.pending_minimums_count)} />
              <Metric label="Status" value={booleanValue(pool.enabled) ? "ACTIVE" : "PAUSED"} />
            </div>
          </Card>

          <Card title="System & Workers" icon={Cpu} tone={failedWorkers > 0 ? "danger" : "success"}>
            <div className="flex items-center justify-between text-xs"><span>Redis</span><b>{booleanValue(workers.redis_configured) ? "Connected" : "Unavailable"}</b></div>
            <div className="max-h-44 space-y-1 overflow-auto">
              {workerRows.map((worker) => (
                <div key={worker.name} className="flex items-center gap-2 border-b border-border/60 py-1.5 text-[10px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${worker.status === "running" ? "bg-green-500" : worker.status === "error" ? "bg-destructive" : "bg-yellow-500"}`} />
                  <span className="flex-1">{worker.label}</span>
                  <span className="font-bold capitalize">{worker.status}</span>
                </div>
              ))}
              {workerRows.length === 0 ? <div className="py-3 text-[10px] text-muted-foreground">No worker telemetry returned.</div> : null}
            </div>
          </Card>

          <Card title="Nia & Connectivity" icon={Sparkles} tone={booleanValue(nia.enabled) ? "success" : "default"}>
            <div className="grid grid-cols-2 gap-2"><Metric label="Nia" value={booleanValue(nia.enabled) ? "ON" : "OFF"} /><Metric label="GPS coverage" value={`${gpsPct}%`} /></div>
            <div className="text-[10px] text-muted-foreground">Values are read from protected production API endpoints already used by the application.</div>
          </Card>
        </div>

        <Card title="Authoritative Neighborhood Boundary Review" icon={Map}>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">Staged GIS remains separate from GPS-active production data. The console enforces <b>review → geometry verification → promotion</b>. Generated hints remain ineligible.</div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Filter by city" value={city} onChange={(event) => setCity(event.target.value)} className="h-9 rounded-xl border border-border bg-background px-3 text-xs"><option value="all">All cities</option>{cities.filter((value) => value !== "all").map((value) => <option key={value} value={value}>{value}</option>)}</select>
            {(["all", "pending", "verified", "invalid"] as Filter[]).map((value) => <button type="button" key={value} onClick={() => setFilter(value)} className={`h-9 rounded-xl border px-3 text-xs font-black capitalize ${filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}>{value}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Staged" value={snapshot?.boundaries.length ?? 0} />
            <Metric label="Valid" value={(snapshot?.boundaries ?? []).filter((boundary) => boundary.geometry_valid).length} />
            <Metric label="Reviewed" value={(snapshot?.boundaries ?? []).filter((boundary) => boundary.reviewed).length} />
            <Metric label="GPS verified" value={(snapshot?.boundaries ?? []).filter((boundary) => boundary.geometry_verified).length} />
          </div>
          <div className="space-y-2">
            {rows.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No boundaries in this queue.</div> : rows.map((boundary) => (
              <div key={boundary.id} className="space-y-2 rounded-xl border border-border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="truncate text-sm font-bold">{boundary.name}</div><div className="text-[10px] text-muted-foreground">{boundary.city_key} · {boundary.source_publisher} · {boundary.source_dataset} · v{boundary.source_version}</div></div>
                  <div className="flex flex-wrap justify-end gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] ${boundary.geometry_valid ? "border-green-500/20 text-green-400" : "border-destructive/30 text-destructive"}`}>{boundary.geometry_valid ? "PostGIS valid" : "Invalid"}</span>
                    {boundary.reviewed ? <span className="rounded-full border border-primary/20 px-2 py-0.5 text-[9px] text-primary">Reviewed</span> : null}
                    {boundary.geometry_verified ? <span className="rounded-full border border-green-500/20 px-2 py-0.5 text-[9px] text-green-400">Geometry verified</span> : null}
                  </div>
                </div>
                {boundary.review_note ? <div className="rounded-lg bg-muted/30 p-2 text-[10px] text-muted-foreground">Note: {boundary.review_note}</div> : null}
                <div className="flex flex-wrap gap-2">
                  {!boundary.reviewed && boundary.geometry_valid ? <><button type="button" onClick={() => void review(boundary.id, true)} disabled={busy === boundary.id} className="h-9 flex-1 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-60">Review</button><button type="button" onClick={() => void review(boundary.id, false)} disabled={busy === boundary.id} className="h-9 rounded-xl border border-destructive/30 px-3 text-xs font-black text-destructive disabled:opacity-60">Reject</button></> : null}
                  {boundary.reviewed && !boundary.geometry_verified && boundary.geometry_valid ? <button type="button" onClick={() => void verify(boundary.id)} disabled={busy === boundary.id} className="h-9 flex-1 rounded-xl border border-green-500/30 px-3 text-xs font-black text-green-500 disabled:opacity-60">Verify geometry</button> : null}
                  {boundary.reviewed && boundary.geometry_verified && boundary.geometry_valid ? <button type="button" onClick={() => void promote(boundary.id)} disabled={busy === boundary.id} className="h-9 flex-1 rounded-xl bg-green-600 px-3 text-xs font-black text-white disabled:opacity-60">Promote to GPS-active</button> : null}
                  {busy === boundary.id ? <Loader2 className="h-5 w-5 animate-spin self-center" /> : null}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
