import { motion } from "framer-motion";
import { Heart, Shield, Star, Zap, Award, Crown } from "lucide-react";
import { getBadgeForUser, type BadgeRole, type TrustTier } from "@workspace/trust-tiers";
import { useIsAnimationSuppressed } from "@/hooks/useAnimationPreference";

type BadgeKey = TrustTier | "admin";

const TIERS: Record<BadgeKey, {
  color: string;
  bg: string;
  border: string;
  glow: string;
  Icon: typeof Heart;
  description: string;
}> = {
  admin: {
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    glow: "shadow-[0_0_25px_rgba(244,63,94,0.3)]",
    Icon: Crown,
    description: "Niakofa team",
  },
  member: {
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border",
    glow: "",
    Icon: Heart,
    description: "Welcome to the community",
  },
  verified: {
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    glow: "shadow-[0_0_20px_rgba(0,212,255,0.2)]",
    Icon: Heart,
    description: "Making a difference nearby",
  },
  trusted: {
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
    Icon: Shield,
    description: "Verified community helper",
  },
  elite: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_25px_rgba(234,179,8,0.3)]",
    Icon: Star,
    description: "Top contributor in the community",
  },
  anchor: {
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    glow: "shadow-[0_0_30px_rgba(168,85,247,0.35)]",
    Icon: Award,
    description: "Community pillar — irreplaceable",
  },
};

interface PayItForwardBadgeProps {
  /** Pass the real user fields — role and tier are derived, never guessed client-side. */
  user: {
    is_admin?: boolean | null;
    is_helper?: boolean | null;
    trust_score?: number | null;
    help_count?: number | null;
  };
  compact?: boolean;
}

/**
 * Single Pay-It-Forward badge component, role-aware via @workspace/trust-tiers'
 * getBadgeForUser. Previously this component had its own role-blind 5-tier
 * ladder (newcomer/helper/trusted/champion/legend) with thresholds that had
 * drifted from — and a "Trusted" label that collided in meaning with —
 * TrustTierBadge.tsx's separate ladder. Now there is one source of truth for
 * "what tier is this user," branched by role (admin / helper / member),
 * shared with TrustTierBadge.tsx and the leaderboard.
 */
export function PayItForwardBadge({ user, compact = false }: PayItForwardBadgeProps) {
  const badge = getBadgeForUser(user);
  const config = TIERS[badge.tier];
  const { Icon } = config;
  const helpCount = user.help_count ?? 0;
  const trustScore = user.trust_score ?? 0;
  const suppressed = useIsAnimationSuppressed();

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${config.color} ${config.bg} ${config.border} ${config.glow}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 200 }}
      className={`flex items-center gap-3 p-4 rounded-2xl border ${config.bg} ${config.border} ${config.glow}`}
    >
      <div className={`w-12 h-12 rounded-full ${config.bg} border ${config.border} flex items-center justify-center shrink-0`}>
        <Icon className={`w-6 h-6 ${config.color}`} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className={`text-base font-black ${config.color}`}>{badge.label}</span>
          {badge.tier === "anchor" && <Zap className={`w-4 h-4 text-yellow-400${suppressed ? "" : " animate-pulse"}`} />}
        </div>
        <div className="text-xs text-muted-foreground">{config.description}</div>
        {badge.role === "helper" && (
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[10px] text-muted-foreground">{helpCount} helped</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{trustScore}% trust</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export type { BadgeRole };
