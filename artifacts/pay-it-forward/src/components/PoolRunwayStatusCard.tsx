import { AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import {
  getGetPoolStatsQueryKey,
  useGetPoolStats,
} from "@workspace/api-client-react";
import { getPoolRunwayDisplay } from "@/lib/pool-runway";

function formatPoolDollars(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

const LEVEL_CLASS = {
  critical: "border-red-500/30 bg-red-500/10 text-red-300",
  caution: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  healthy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  neutral: "border-border bg-muted/50 text-muted-foreground",
} as const;

export function PoolRunwayStatusCard() {
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useGetPoolStats({
    query: {
      queryKey: getGetPoolStatsQueryKey(),
      staleTime: 30_000,
      refetchInterval: 60_000,
    },
  });
  const runway = getPoolRunwayDisplay(stats?.runway_days);

  return (
    <section
      aria-labelledby="status-pool-runway-title"
      data-testid="status-pool-runway-card"
      className="rounded-2xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Wallet className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="status-pool-runway-title" className="text-sm font-black text-foreground">
              Community Pool
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Public funding and payout estimate
            </p>
          </div>
        </div>
        {stats && (
          <span
            data-testid="status-pool-enabled"
            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${
              stats.enabled
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            {stats.enabled ? "Active" : "Paused"}
          </span>
        )}
      </div>

      {isLoading && !stats ? (
        <p
          role="status"
          data-testid="status-pool-runway-loading"
          className="mt-4 rounded-xl bg-muted/50 px-3 py-4 text-sm text-muted-foreground"
        >
          Loading pool transparency…
        </p>
      ) : isError && !stats ? (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3">
          <p role="status" className="text-sm text-muted-foreground">
            Community Pool figures are temporarily unavailable.
          </p>
        </div>
      ) : stats ? (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-background/70 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Estimated runway
              </p>
              <p
                data-testid="status-pool-runway"
                className={`mt-1 text-lg font-black tabular-nums ${
                  runway.level === "critical"
                    ? "text-red-300"
                    : runway.level === "caution"
                      ? "text-amber-200"
                      : runway.level === "healthy"
                        ? "text-emerald-300"
                        : "text-muted-foreground"
                }`}
              >
                {runway.label}
              </p>
            </div>
            <div className="rounded-xl bg-background/70 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Current balance
              </p>
              <p
                data-testid="status-pool-balance"
                className="mt-1 text-lg font-black tabular-nums text-foreground"
              >
                {formatPoolDollars(stats.balance)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border/70 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                30-day inflow
              </p>
              <p data-testid="status-pool-inflow" className="mt-1 text-sm font-bold text-emerald-300">
                {formatPoolDollars(stats.inflow_30d)}
              </p>
            </div>
            <div className="rounded-xl border border-border/70 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                30-day outflow
              </p>
              <p data-testid="status-pool-outflow" className="mt-1 text-sm font-bold text-foreground">
                {formatPoolDollars(stats.outflow_30d)}
              </p>
            </div>
          </div>

          {runway.warning && (
            <div
              role="alert"
              data-testid="alert-pool-runway"
              className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${LEVEL_CLASS[runway.level]}`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{runway.warning}</span>
            </div>
          )}

          {stats.runway_days === null && (
            <p
              role="status"
              data-testid="status-pool-runway-no-estimate"
              className={`rounded-xl border p-3 text-xs leading-relaxed ${LEVEL_CLASS.neutral}`}
            >
              No pool outflow was recorded in the last 30 days, so a recent-payout runway estimate is not available.
            </p>
          )}

          {stats.runway_days === undefined && (
            <p role="status" className="text-xs text-muted-foreground">
              A runway estimate is not available in the current pool response.
            </p>
          )}

          {isError && (
            <p role="status" className="text-xs text-muted-foreground">
              Refresh failed; showing the last available figures.
            </p>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Estimate uses the current balance and average pool outflow over the previous 30 days. It is a planning estimate, not a guarantee.
          </p>
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-border/70 pt-2">
        <span className="text-[10px] text-muted-foreground">Refreshes every minute</span>
        <button
          type="button"
          data-testid="button-refresh-pool-runway"
          onClick={() => { void refetch(); }}
          disabled={isLoading}
          aria-label="Refresh Community Pool figures"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-muted-foreground transition active:bg-muted active:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}