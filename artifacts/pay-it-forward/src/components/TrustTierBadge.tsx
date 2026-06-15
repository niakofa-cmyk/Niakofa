export type TrustTier = "member" | "verified" | "trusted" | "elite" | "anchor";

interface TierConfig {
  label: string;
  icon: string;
  color: string;
  bg: string;
  border: string;
  description: string;
  minHelps: number;
  minTrust: number;
}

export const TIER_CONFIG: Record<TrustTier, TierConfig> = {
  member: {
    label: "Member",
    icon: "👤",
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-border",
    description: "Community member",
    minHelps: 0,
    minTrust: 0,
  },
  verified: {
    label: "Verified Helper",
    icon: "✓",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    description: "Phone + email verified, active helper",
    minHelps: 5,
    minTrust: 85,
  },
  trusted: {
    label: "Trusted Helper",
    icon: "★",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    description: "15+ helps · 90%+ trust · background-check eligible",
    minHelps: 15,
    minTrust: 90,
  },
  elite: {
    label: "Elite Helper",
    icon: "⭐",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    description: "30+ helps · 95%+ trust · emergency-responder eligible",
    minHelps: 30,
    minTrust: 95,
  },
  anchor: {
    label: "Community Anchor",
    icon: "💙",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    description: "50+ helps · pillar of the community · civic partner",
    minHelps: 50,
    minTrust: 97,
  },
};

// Compute trust tier from trust_score (0-100) and help_count
export function getTrustTier(trustScore: number, helpCount: number): TrustTier {
  if (helpCount >= 50 && trustScore >= 97) return "anchor";
  if (helpCount >= 30 && trustScore >= 95) return "elite";
  if (helpCount >= 15 && trustScore >= 90) return "trusted";
  if (helpCount >= 5 || trustScore >= 85) return "verified";
  return "member";
}

// Progress toward next tier (0-1)
export function tierProgress(trustScore: number, helpCount: number): { pct: number; nextLabel: string } {
  const tier = getTrustTier(trustScore, helpCount);
  const tiers: TrustTier[] = ["member", "verified", "trusted", "elite", "anchor"];
  const idx = tiers.indexOf(tier);
  if (idx === tiers.length - 1) return { pct: 1, nextLabel: "Max tier" };
  const next = tiers[idx + 1];
  const nc = TIER_CONFIG[next];
  const helpPct = helpCount >= nc.minHelps ? 1 : helpCount / nc.minHelps;
  const trustPct = trustScore >= nc.minTrust ? 1 : trustScore / nc.minTrust;
  return {
    pct: (helpPct + trustPct) / 2,
    nextLabel: nc.label,
  };
}

interface TrustTierBadgeProps {
  trustScore: number;
  helpCount: number;
  size?: "xs" | "sm" | "md" | "lg";
  showProgress?: boolean;
}

export function TrustTierBadge({
  trustScore,
  helpCount,
  size = "sm",
  showProgress = false,
}: TrustTierBadgeProps) {
  const tier = getTrustTier(trustScore, helpCount);
  const config = TIER_CONFIG[tier];
  const { pct, nextLabel } = tierProgress(trustScore, helpCount);

  if (size === "xs") {
    return (
      <span className={`inline-flex items-center gap-0.5 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${config.color} ${config.bg} ${config.border}`}>
        {config.icon}
      </span>
    );
  }

  if (size === "sm") {
    return (
      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.color} ${config.bg} ${config.border}`}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </span>
    );
  }

  if (size === "md") {
    return (
      <div>
        <div className={`flex items-center gap-2 p-3 rounded-xl border ${config.bg} ${config.border}`}>
          <span className="text-2xl">{config.icon}</span>
          <div>
            <div className={`font-black text-sm ${config.color}`}>{config.label}</div>
            <div className="text-[10px] text-muted-foreground">{config.description}</div>
          </div>
        </div>
        {showProgress && pct < 1 && (
          <div className="mt-2 px-1">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
              <span>Progress to {nextLabel}</span>
              <span>{Math.round(pct * 100)}%</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${config.color.replace("text-", "bg-")}`}
                style={{ width: `${pct * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // lg
  return (
    <div>
      <div className={`flex items-center gap-3 p-4 rounded-2xl border ${config.bg} ${config.border}`}>
        <span className="text-3xl">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`font-black text-base ${config.color}`}>{config.label}</div>
          <div className="text-xs text-muted-foreground leading-snug">{config.description}</div>
          <div className="text-[10px] text-muted-foreground mt-1">
            {helpCount} helps · {trustScore.toFixed(0)}% trust score
          </div>
        </div>
      </div>
      {showProgress && pct < 1 && (
        <div className="mt-2 px-1">
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>Progress to {nextLabel}</span>
            <span>{Math.round(pct * 100)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${config.color.replace("text-", "bg-")}`}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
