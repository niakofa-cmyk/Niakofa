import { motion } from "framer-motion";
import { Heart, Shield, Star, Zap, Award } from "lucide-react";

type BadgeTier = "newcomer" | "helper" | "trusted" | "champion" | "legend";

function getBadgeTier(helpCount: number, trustScore: number): BadgeTier {
  if (helpCount >= 50 && trustScore >= 98) return "legend";
  if (helpCount >= 25 && trustScore >= 95) return "champion";
  if (helpCount >= 10 && trustScore >= 90) return "trusted";
  if (helpCount >= 3) return "helper";
  return "newcomer";
}

const TIERS: Record<BadgeTier, {
  label: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  Icon: typeof Heart;
  description: string;
}> = {
  newcomer: {
    label: "Newcomer",
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-border",
    glow: "",
    Icon: Heart,
    description: "Welcome to the community",
  },
  helper: {
    label: "Helper",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    glow: "shadow-[0_0_20px_rgba(0,212,255,0.2)]",
    Icon: Heart,
    description: "Making a difference nearby",
  },
  trusted: {
    label: "Trusted",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    glow: "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
    Icon: Shield,
    description: "Verified community helper",
  },
  champion: {
    label: "Champion",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    glow: "shadow-[0_0_25px_rgba(234,179,8,0.3)]",
    Icon: Star,
    description: "Top contributor in the community",
  },
  legend: {
    label: "Legend",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    glow: "shadow-[0_0_30px_rgba(168,85,247,0.35)]",
    Icon: Award,
    description: "Community pillar — irreplaceable",
  },
};

interface PayItForwardBadgeProps {
  helpCount: number;
  trustScore: number;
  compact?: boolean;
}

export function PayItForwardBadge({ helpCount, trustScore, compact = false }: PayItForwardBadgeProps) {
  const tier = getBadgeTier(helpCount, trustScore);
  const config = TIERS[tier];
  const { Icon } = config;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${config.color} ${config.bg} ${config.border} ${config.glow}`}>
        <Icon className="w-3 h-3" />
        {config.label}
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
          <span className={`text-base font-black ${config.color}`}>{config.label}</span>
          {tier === "legend" && <Zap className="w-4 h-4 text-yellow-400 animate-pulse" />}
        </div>
        <div className="text-xs text-muted-foreground">{config.description}</div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] text-muted-foreground">{helpCount} helped</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{trustScore}% trust</span>
        </div>
      </div>
    </motion.div>
  );
}
