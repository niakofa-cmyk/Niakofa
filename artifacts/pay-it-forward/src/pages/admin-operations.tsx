/**
 * Admin 2.0 Operations — attention-first live console.
 * Review → Geometry Verify → Explicit Promote (server-enforced).
 * Generated hints remain GPS-ineligible.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  Cpu,
  Loader2,
  Map,
  RefreshCw,
  Shield,
  Sparkles,
  Wallet,
  ExternalLink,
} from "lucide-react";
import { getToken } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/AppContext";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

type JsonRecord = Record<string, unknown>;

type Boundary = {
  id: number;
  city_key: string;
  city_display?: string;
  neighborhood_id: string;
  name: string;
  source_publisher: string;
  source_dataset: string;
  source_version: string | null;
  source_kind?: string;
  authority_level?: string;
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
  pending: JsonRecord | null;
};

type Filter = "all" | "pending" | "ready" | "verified" | "invalid";

type Worker = {
  name: string;
  label: string;
  status: string;
};

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
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

function isGeneratedHint(boundary: Boundary): boolean {
  return boundary.source_kind === "generated_hint" || boundary.authority_level === "generated";
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

function parseBoundary(item: unknown): Boundary | null {
  const value = record(item);
  if (typeof value.id !== "number" || typeof value.city_key !== "string" || typeof value.name !== "string") {
    return null;
  }
  return {
    id: value.id,
    city_key: value.city_key,
    city_display: typeof value.city_display === "string" ? value.city_display : undefined,
    neighborhood_id: stringValue(value.neighborhood_id, ""),
    name: value.name,
    source_publisher: stringValue(value.source_publisher, "unknown"),
    source_dataset: stringValue(value.source_dataset, "unknown"),
    source_version: typeof value.source_version === "string" ? value.source_version : null,
    source_kind: typeof value.source_kind === "string" ? value.source_kind : undefined,
    authority_level: typeof value.authority_level === "string" ? value.authority_level : undefined,
    geometry_valid: booleanValue(value.geometry_valid),
    geometry_verified: booleanValue(value.geometry_verified),
    reviewed: booleanValue(value.reviewed),
    review_note: typeof value.review_note === "string" ? value.review_note : null,
    rejection_reason: typeof value.rejection_reason === "string" ? value.rejection_reason : null,
  };
}

export default function AdminOperationsDashboard() {
  const { currentUser } = useAppContext();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [city, setCity] = useState("all");
  const [filter, setFilter] = useState<Filter>("pending");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);

    try {
      const [stats, pool, workers, globalOps, boundaryPayload, nia, pending] = await Promise.all([
        getJson(`${BASE}/api/admin/stats`),
        getJson(`${BASE}/api/pool/stats`),
        getJson(`${BASE}/api/admin/worker-health`),
        getJson(`${BASE}/api/admin/global-ops`),
        getJson(`${BASE}/api/admin/neighborhood-boundary-imports`),
        getJson(`${BASE}/api/admin/nia-status`),
        getJson(`${BASE}/api/admin/pending-summary`),
      ]);

      const boundaries = arrayValue(boundaryPayload)
        .map(parseBoundary)
        .filter((item): item is Boundary => item !== null);

      const anyCore = stats !== null || pool !== null || workers !== null || boundaryPayload !== null;
      setLoadError(anyCore ? null : "Could not load operations data. Check admin session and API health.");

      setSnapshot({
        stats: stats ? record(stats) : null,
        pool: pool ? record(pool) : null,
        workers: workers ? record(workers) : null,
        globalOps: globalOps ? record(globalOps) : null,
        boundaries,
        nia: nia ? record(nia) : null,
        pending: pending ? record(pending) : null,
      });
      setUpdatedAt(new Date());
    } catch {
      setLoadError("Network error while loading operations.");
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
      if (filter === "pending") return !boundary.reviewed && boundary.geometry_valid && !isGeneratedHint(boundary);
      if (filter === "ready") {
        return boundary.reviewed && boundary.geometry_verified && boundary.geometry_valid && !isGeneratedHint(boundary);
      }
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
    if (
      !window.confirm(
        "Promote this reviewed, geometry-verified authoritative boundary to GPS-active neighborhood data?\n\nThis enables Host Signal green checkpoint for matching Spirals.",
      )
    ) {
      return;
    }

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

  if (currentUser && !currentUser.is_admin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <Shield className="h-8 w-8 text-destructive" />
        <h1 className="text-lg font-black">Admin only</h1>
        <p className="text-sm text-muted-foreground">This operations console requires an administrator session.</p>
        <Link href="/" className="text-sm font-bold text-primary underline">
          Back to app
        </Link>
      </div>
    );
  }

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
  const pending = record(snapshot?.pending);
  const workerRows: Worker[] = arrayValue(workers.workers).flatMap((item) => {
    const value = record(item);
    if (typeof value.name !== "string") return [];
    return [{ name: value.name, label: stringValue(value.label, value.name), status: stringValue(value.status, "unknown") }];
  });
  const poolBalance = numberValue(pool.balance);
  const guaranteedMinimum = numberValue(pool.guaranteed_minimum);
  const poolStatus = stringValue(pool.pool_status, "unknown");
  const poolLow =
    snapshot?.pool !== null &&
    snapshot?.pool !== undefined &&
    (poolStatus === "low" || poolStatus === "critical" || (guaranteedMinimum > 0 && poolBalance < guaranteedMinimum));
  const failedWorkers = workerRows.filter((worker) => worker.status === "error").length;
  const gpsHealth = record(globalOps.gps_health);
  const gpsTotal = numberValue(gpsHealth.total_online_helpers);
  const gpsWithCoverage = numberValue(gpsHealth.helpers_online_with_gps);
  const gpsPct = gpsTotal > 0 ? Math.round((gpsWithCoverage / gpsTotal) * 100) : 0;
  const invalidCount = (snapshot?.boundaries ?? []).filter((boundary) => !boundary.geometry_valid).length;
  const readyCount = (snapshot?.boundaries ?? []).filter(
    (b) => b.reviewed && b.geometry_verified && b.geometry_valid && !isGeneratedHint(b),
  ).length;
  const pendingReports = numberValue(stats.pending_reports, numberValue(pending.pending_reports));
  const pendingAccounts = numberValue(pending.pending_accounts);
  const pendingHelpers = numberValue(pending.pending_helper_apps);
  const pendingHardships = numberValue(pending.pending_hardships);
  const totalPendingActions = numberValue(
    pending.total_action_items,
    pendingAccounts + pendingHelpers + pendingHardships + pendingReports,
  );

  return (
    <div className="min-h-screen bg-background px-4 py-5 pb-10 text-foreground">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-destructive" />
              <h1 className="text-xl font-black">Admin 2.0 Operations</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Attention-first · live production API · review → verify → promote
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-black"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Full Admin
            </Link>
            <button
              type="button"
              onClick={() => void load(true)}
              disabled={refreshing}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-black disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </header>

        {updatedAt ? (
          <div className="text-right text-[10px] text-muted-foreground">Last updated {updatedAt.toLocaleTimeString()}</div>
        ) : null}

        {loadError ? (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {loadError}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Users" value={stringValue(stats.total_users)} sub="live admin stats" />
          <Metric
            label="Helpers online"
            value={stringValue(record(globalOps.summary).total_online_helpers, stringValue(stats.active_helpers))}
            sub={`${gpsPct}% with fresh GPS`}
          />
          <Metric label="Open requests" value={stringValue(record(globalOps.summary).total_open_requests)} sub="live coverage" />
          <Metric label="Action items" value={totalPendingActions} danger={totalPendingActions > 0} sub="accounts · helpers · reports" />
        </div>

        {(poolLow || failedWorkers > 0 || invalidCount > 0 || readyCount > 0 || totalPendingActions > 0) ? (
          <Card title="Attention required" icon={AlertCircle} tone="danger">
            <div className="grid gap-2 md:grid-cols-3">
              {poolLow ? (
                <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs">
                  <b>Community Pool</b>
                  <div className="mt-1 font-black text-destructive">
                    ${poolBalance.toFixed(2)} · status {poolStatus}
                    {guaranteedMinimum > 0 ? ` (floor $${guaranteedMinimum.toFixed(2)})` : ""}
                  </div>
                </div>
              ) : null}
              {failedWorkers > 0 ? (
                <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs">
                  <b>Workers</b>
                  <div className="mt-1 font-black text-destructive">
                    {failedWorkers} worker failure{failedWorkers === 1 ? "" : "s"}
                  </div>
                </div>
              ) : null}
              {invalidCount > 0 ? (
                <div className="rounded-xl border border-destructive/20 bg-background p-3 text-xs">
                  <b>Geography</b>
                  <div className="mt-1 font-black text-destructive">
                    {invalidCount} invalid staged boundary{invalidCount === 1 ? "" : "ies"}
                  </div>
                </div>
              ) : null}
              {readyCount > 0 ? (
                <div className="rounded-xl border border-primary/20 bg-background p-3 text-xs">
                  <b>Ready to promote</b>
                  <div className="mt-1 font-black text-primary">
                    {readyCount} boundary{readyCount === 1 ? "" : "ies"} reviewed + verified
                  </div>
                </div>
              ) : null}
              {pendingAccounts > 0 || pendingHelpers > 0 || pendingHardships > 0 || pendingReports > 0 ? (
                <div className="rounded-xl border border-yellow-500/20 bg-background p-3 text-xs">
                  <b>Queues</b>
                  <div className="mt-1 font-black text-yellow-500">
                    {pendingAccounts} accounts · {pendingHelpers} helpers · {pendingHardships} hardships · {pendingReports} reports
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Community Pool" icon={Wallet} tone={poolLow ? "warning" : "success"}>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Balance" value={`$${poolBalance.toFixed(2)}`} danger={poolLow} />
              <Metric label="Runway" value={pool.runway_days == null ? "∞" : `${stringValue(pool.runway_days)}d`} />
              <Metric label="Queued minimums" value={stringValue(pool.pending_minimums_count)} />
              <Metric label="Status" value={booleanValue(pool.enabled) ? poolStatus.toUpperCase() : "PAUSED"} />
            </div>
          </Card>

          <Card title="System & Workers" icon={Cpu} tone={failedWorkers > 0 ? "danger" : "success"}>
            <div className="flex items-center justify-between text-xs">
              <span>Redis</span>
              <b>{booleanValue(workers.redis_configured) ? "Connected" : "Unavailable"}</b>
            </div>
            <div className="max-h-44 space-y-1 overflow-auto">
              {workerRows.map((worker) => (
                <div key={worker.name} className="flex items-center gap-2 border-b border-border/60 py-1.5 text-[10px]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      worker.status === "running"
                        ? "bg-green-500"
                        : worker.status === "error"
                          ? "bg-destructive"
                          : "bg-yellow-500"
                    }`}
                  />
                  <span className="flex-1">{worker.label}</span>
                  <span className="font-bold capitalize">{worker.status}</span>
                </div>
              ))}
              {workerRows.length === 0 ? (
                <div className="py-3 text-[10px] text-muted-foreground">No worker telemetry returned.</div>
              ) : null}
            </div>
          </Card>

          <Card title="Nia & Connectivity" icon={Sparkles} tone={booleanValue(nia.enabled) ? "success" : "default"}>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Nia" value={booleanValue(nia.enabled) ? "ON" : "OFF"} />
              <Metric label="GPS coverage" value={`${gpsPct}%`} />
            </div>
            <div className="text-[10px] text-muted-foreground">
              Values are read from protected production API endpoints already used by the application.
            </div>
          </Card>
        </div>

        <Card title="Authoritative Neighborhood Boundary Review" icon={Map}>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
            Staged GIS remains separate from GPS-active production data. The console enforces{" "}
            <b>review → geometry verification → promotion</b>. Generated hints remain ineligible for Host Signal.
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Filter by city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
            >
              <option value="all">All cities</option>
              {cities
                .filter((value) => value !== "all")
                .map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
            </select>
            {(["all", "pending", "ready", "verified", "invalid"] as Filter[]).map((value) => (
              <button
                type="button"
                key={value}
                onClick={() => setFilter(value)}
                className={`h-9 rounded-xl border px-3 text-xs font-black capitalize ${
                  filter === value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {value === "ready" ? "ready to promote" : value}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Metric label="Staged" value={snapshot?.boundaries.length ?? 0} />
            <Metric label="Valid" value={(snapshot?.boundaries ?? []).filter((b) => b.geometry_valid).length} />
            <Metric label="Reviewed" value={(snapshot?.boundaries ?? []).filter((b) => b.reviewed).length} />
            <Metric
              label="GPS verified"
              value={(snapshot?.boundaries ?? []).filter((b) => b.geometry_verified).length}
            />
            <Metric label="Ready" value={readyCount} />
          </div>
          <div className="space-y-2">
            {rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No boundaries in this queue.
              </div>
            ) : (
              rows.map((boundary) => {
                const generated = isGeneratedHint(boundary);
                return (
                  <div key={boundary.id} className="space-y-2 rounded-xl border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold">{boundary.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {boundary.city_display ?? boundary.city_key} · {boundary.source_publisher} ·{" "}
                          {boundary.source_dataset}
                          {boundary.source_version ? ` · v${boundary.source_version}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] ${
                            boundary.geometry_valid
                              ? "border-green-500/20 text-green-400"
                              : "border-destructive/30 text-destructive"
                          }`}
                        >
                          {boundary.geometry_valid ? "struct valid" : "Invalid"}
                        </span>
                        {boundary.reviewed ? (
                          <span className="rounded-full border border-primary/20 px-2 py-0.5 text-[9px] text-primary">
                            Reviewed
                          </span>
                        ) : null}
                        {boundary.geometry_verified ? (
                          <span className="rounded-full border border-green-500/20 px-2 py-0.5 text-[9px] text-green-400">
                            Geometry verified
                          </span>
                        ) : null}
                        {generated ? (
                          <span className="rounded-full border border-yellow-500/30 px-2 py-0.5 text-[9px] text-yellow-500">
                            Generated (GPS blocked)
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {boundary.review_note ? (
                      <div className="rounded-lg bg-muted/30 p-2 text-[10px] text-muted-foreground">
                        Note: {boundary.review_note}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {!boundary.reviewed && boundary.geometry_valid && !generated ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void review(boundary.id, true)}
                            disabled={busy === boundary.id}
                            className="h-9 flex-1 rounded-xl bg-primary px-3 text-xs font-black text-primary-foreground disabled:opacity-60"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => void review(boundary.id, false)}
                            disabled={busy === boundary.id}
                            className="h-9 rounded-xl border border-destructive/30 px-3 text-xs font-black text-destructive disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </>
                      ) : null}
                      {boundary.reviewed && !boundary.geometry_verified && boundary.geometry_valid && !generated ? (
                        <button
                          type="button"
                          onClick={() => void verify(boundary.id)}
                          disabled={busy === boundary.id}
                          className="h-9 flex-1 rounded-xl border border-green-500/30 px-3 text-xs font-black text-green-500 disabled:opacity-60"
                        >
                          Verify geometry
                        </button>
                      ) : null}
                      {boundary.reviewed && boundary.geometry_verified && boundary.geometry_valid && !generated ? (
                        <button
                          type="button"
                          onClick={() => void promote(boundary.id)}
                          disabled={busy === boundary.id}
                          className="h-9 flex-1 rounded-xl bg-green-600 px-3 text-xs font-black text-white disabled:opacity-60"
                        >
                          Promote to GPS-active
                        </button>
                      ) : null}
                      {busy === boundary.id ? <Loader2 className="h-5 w-5 animate-spin self-center" /> : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
