import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  CornerUpLeft,
  CornerUpRight,
  RefreshCw,
  Navigation,
} from "lucide-react";

interface Step {
  instruction?: string;
  maneuver?: string;
  distance_meters?: number;
  street_name?: string;
}

interface TurnArrowHUDProps {
  step: Step | null;
  distanceToTurn: number;
}

function resolveManeuver(maneuver?: string, instruction?: string): {
  Icon: React.ElementType;
  label: string;
  color: string;
} {
  const m = (maneuver ?? instruction ?? "").toLowerCase();

  if (m.includes("uturn") || m.includes("u-turn"))
    return { Icon: RefreshCw, label: "U-Turn", color: "text-destructive" };
  if (m.includes("sharp-left") || m.includes("sharp left"))
    return { Icon: ArrowLeft, label: "Sharp Left", color: "text-yellow-400" };
  if (m.includes("sharp-right") || m.includes("sharp right"))
    return { Icon: ArrowRight, label: "Sharp Right", color: "text-yellow-400" };
  if (m.includes("slight-left") || m.includes("bear left") || m.includes("keep left"))
    return { Icon: CornerUpLeft, label: "Bear Left", color: "text-primary" };
  if (m.includes("slight-right") || m.includes("bear right") || m.includes("keep right"))
    return { Icon: CornerUpRight, label: "Bear Right", color: "text-primary" };
  if (m.includes("turn-left") || m.includes("turn left"))
    return { Icon: ArrowUpLeft, label: "Turn Left", color: "text-primary" };
  if (m.includes("turn-right") || m.includes("turn right"))
    return { Icon: ArrowUpRight, label: "Turn Right", color: "text-primary" };
  if (m.includes("arrive") || m.includes("destination"))
    return { Icon: Navigation, label: "Arriving", color: "text-green-400" };

  return { Icon: ArrowUp, label: "Continue", color: "text-primary" };
}

function formatDistance(meters: number): string {
  if (meters < 50) return "Now";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

/**
 * TurnArrowHUD
 *
 * Floating bottom-left lane-guidance card.
 * Matches Niakofa HUD pill aesthetic: bg-card/90 backdrop-blur-md,
 * border border-border, electric-cyan text-primary, font-black uppercase,
 * framer-motion entrance animation.
 */
export function TurnArrowHUD({ step, distanceToTurn }: TurnArrowHUDProps) {
  const hasStep = !!step;
  const { Icon, label, color } = resolveManeuver(step?.maneuver, step?.instruction);
  const dist = step?.distance_meters ?? distanceToTurn;
  const streetName = step?.street_name;

  return (
    <AnimatePresence>
      {hasStep && (
        <motion.div
          key="turn-hud"
          initial={{ opacity: 0, x: -24, scale: 0.92 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -16, scale: 0.94 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-[220px] left-4 z-30 pointer-events-none"
        >
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-3 bg-card/90 backdrop-blur-md border border-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.55)] px-4 py-3 min-w-[140px] max-w-[200px]"
          >
            <div className={`shrink-0 ${color}`}>
              <Icon className="w-8 h-8 stroke-[2.5]" />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[11px] font-black font-mono text-primary uppercase tracking-widest leading-none">
                {formatDistance(dist)}
              </span>
              <span className="text-xs font-black text-foreground uppercase tracking-wide leading-tight">
                {label}
              </span>
              {streetName && (
                <span className="text-[10px] text-muted-foreground truncate leading-tight">
                  {streetName}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
