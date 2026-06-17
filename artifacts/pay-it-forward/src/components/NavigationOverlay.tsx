import { motion, AnimatePresence } from "framer-motion";
import { Navigation, ArrowUp, ArrowLeft, ArrowRight, RotateCcw, CheckCircle2, Zap, AlertTriangle } from "lucide-react";
import type { RouteStep } from "@workspace/api-client-react";

interface NavigationOverlayProps {
  step: RouteStep | null;
  eta: string;
  distanceText: string;
  status: string;
  totalSteps: number;
  currentStepIndex: number;
  isOffRoute?: boolean;
  speedMph?: number | null;
  bearing?: number | null;
}

function ManeuverIcon({ type, direction }: { type?: string | null; direction?: string | null }) {
  const d = direction?.toLowerCase() ?? "";
  const t = type?.toLowerCase() ?? "";
  if (t === "arrive") return <CheckCircle2 className="w-6 h-6" />;
  if (t === "depart") return <Zap className="w-6 h-6" />;
  if (d.includes("left")) return <ArrowLeft className="w-6 h-6" />;
  if (d.includes("right")) return <ArrowRight className="w-6 h-6" />;
  if (d.includes("u-turn") || d.includes("uturn")) return <RotateCcw className="w-6 h-6" />;
  return <ArrowUp className="w-6 h-6" />;
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

export function NavigationOverlay({
  step,
  eta,
  distanceText,
  status,
  totalSteps,
  currentStepIndex,
  isOffRoute = false,
  speedMph,
  bearing,
}: NavigationOverlayProps) {
  const isArrived = status === "arrived";

  return (
    <AnimatePresence mode="wait">
      {/* Off-route banner takes priority */}
      {isOffRoute ? (
        <motion.div
          key="off-route"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 180 }}
          className="mx-3 mt-3 pointer-events-auto"
        >
          <div className="bg-orange-500/90 backdrop-blur-lg text-white rounded-2xl shadow-2xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="font-black text-base">Off Route</div>
              <div className="text-sm text-white/80">Recalculating best path…</div>
            </div>
          </div>
        </motion.div>
      ) : isArrived ? (
        <motion.div
          key="arrived"
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 180 }}
          className="mx-3 mt-3 bg-green-500 text-white rounded-2xl shadow-2xl p-4 pointer-events-auto"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <div className="text-lg font-black">You've Arrived!</div>
              <div className="text-sm text-white/80">Complete the request below when done</div>
            </div>
          </div>
        </motion.div>
      ) : step ? (
        <motion.div
          key={`step-${currentStepIndex}`}
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 180 }}
          className="mx-3 mt-3 bg-card/95 backdrop-blur-lg border border-border rounded-2xl shadow-2xl overflow-hidden pointer-events-auto"
        >
          <div className="flex items-center gap-4 p-4">
            <div className="w-14 h-14 bg-primary/20 text-primary rounded-2xl flex items-center justify-center shrink-0">
              <ManeuverIcon type={step.maneuver_type} direction={step.maneuver_direction} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-black leading-tight truncate">{step.instruction}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-lg font-black text-primary">{formatDistance(step.distance_meters)}</span>
                <span className="text-xs text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> {eta}
                </span>
                {speedMph != null && speedMph > 0 && (
                  <span className="flex items-center gap-1 text-xs font-black text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">{speedMph} mph</span>
                )}
              </div>
            </div>
          </div>
          {totalSteps > 0 && (
            <div className="px-4 pb-3">
              <div className="flex gap-0.5">
                {Array.from({ length: Math.min(totalSteps, 10) }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                      i <= currentStepIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 text-right">
                Step {currentStepIndex + 1} of {totalSteps} · {distanceText} total
              </div>
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
