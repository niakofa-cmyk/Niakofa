import { AlertTriangle, Shield } from "lucide-react";
import { motion } from "framer-motion";

export interface PoolHealthStats {
  balance: number;
  required_reserve: number;
  spendable: number;
  coverage_helper_hours: number;
  pool_health_pct: number;
  pool_status: "healthy" | "low" | "critical";
  minimum_hourly_rate: number;
  reserve_policy: {
    helpers_covered: number;
    guaranteed_hours: number;
    safety_multiplier: number;
  };
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function PoolHealthStrip({ stats }: { stats: PoolHealthStats }) {
  const statusConfig = {
    healthy: {
      border: "border-green-500/30 bg-green-500/5",
      bar: "bg-green-500",
      text: "text-green-400",
      label: "Healthy",
    },
    low: {
      border: "border-yellow-500/30 bg-yellow-500/10",
      bar: "bg-yellow-500",
      text: "text-yellow-400",
      label: "Running low",
    },
    critical: {
      border: "border-red-500/30 bg-red-500/10",
      bar: "bg-red-500",
      text: "text-red-400",
      label: "Critical",
    },
  }[stats.pool_status];
  const health = Math.max(0, Math.min(stats.pool_health_pct, 100));
  const safetyPercent = Math.round((stats.reserve_policy.safety_multiplier - 1) * 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      aria-labelledby="pool-health-title"
      className={`border rounded-2xl p-4 space-y-3 ${statusConfig.border}`}
    >
      <div className="flex items-center justify-between">
        <h3 id="pool-health-title" className="font-black text-sm flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" aria-hidden="true" />
          Community Pool Health
        </h3>
        <span className={`text-[10px] font-black uppercase tracking-wider ${statusConfig.text}`}>
          {statusConfig.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-background/60 rounded-xl px-3 py-2.5">
          <div className="text-lg font-black text-foreground">${formatCurrency(stats.balance)}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Available</div>
        </div>
        <div className="bg-background/60 rounded-xl px-3 py-2.5">
          <div className="text-lg font-black text-muted-foreground">${formatCurrency(stats.required_reserve)}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reserved</div>
        </div>
        <div className="bg-background/60 rounded-xl px-3 py-2.5">
          <div className={`text-lg font-black ${statusConfig.text}`}>${formatCurrency(stats.spendable)}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Spendable</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Pool health</span>
          <span className={`font-bold ${statusConfig.text}`}>{stats.pool_health_pct}%</span>
        </div>
        <div
          className="h-1.5 bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={health}
          aria-label="Community Pool reserve coverage"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${health}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`h-full rounded-full ${statusConfig.bar}`}
          />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Helper guarantee ${stats.minimum_hourly_rate.toFixed(0)}/hr · reserve covers{" "}
        {stats.reserve_policy.helpers_covered} helpers up to {stats.reserve_policy.guaranteed_hours}h each,
        including a {safetyPercent}% safety margin. Current balance covers roughly{" "}
        {formatCurrency(stats.coverage_helper_hours)} helper-hours at that rate.
      </p>

      {stats.pool_status !== "healthy" && (
        <div className="border-t border-border/40 pt-2.5 flex items-start gap-2">
          <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${statusConfig.text}`} aria-hidden="true" />
          <div className="text-[10px] text-muted-foreground leading-relaxed">
            {stats.pool_status === "critical"
              ? `Only $${formatCurrency(stats.spendable)} is available for new guaranteed helper payments — reserve is not fully covered.`
              : `Spendable funds are running low. New contributions help keep the ${stats.reserve_policy.helpers_covered}-helper reserve intact.`}
          </div>
        </div>
      )}
    </motion.section>
  );
}