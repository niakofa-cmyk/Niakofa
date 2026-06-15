import { motion } from "framer-motion";

interface KindnessImpactRingProps {
  livesImpacted: number;
  helpCount: number;
  goodwillScore: number;
  size?: number;
}

export function KindnessImpactRing({
  livesImpacted,
  helpCount,
  goodwillScore,
  size = 160,
}: KindnessImpactRingProps) {
  const r = (size / 2) * 0.78;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  const maxImpact = Math.max(livesImpacted, 1);
  const pct = Math.min(livesImpacted / Math.max(maxImpact * 1.2, 20), 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          <defs>
            <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(190,100%,55%)" />
              <stop offset="50%" stopColor="hsl(210,100%,60%)" />
              <stop offset="100%" stopColor="hsl(270,80%,65%)" />
            </linearGradient>
            <filter id="ring-glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="hsl(216,34%,17%)"
            strokeWidth={size * 0.075}
          />
          <motion.circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={size * 0.075}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.8, ease: "easeOut", delay: 0.3 }}
            filter="url(#ring-glow)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            className="text-3xl font-black text-primary"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
          >
            {livesImpacted}
          </motion.div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Lives</div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Touched</div>
        </div>
      </div>
      <div className="flex gap-4 text-center">
        <div>
          <div className="text-sm font-black text-green-400">{helpCount}</div>
          <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Helped</div>
        </div>
        <div className="w-px bg-border" />
        <div>
          <div className="text-sm font-black text-purple-400">{goodwillScore}</div>
          <div className="text-[8px] text-muted-foreground uppercase tracking-wider">Goodwill</div>
        </div>
      </div>
    </div>
  );
}
