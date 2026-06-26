import { motion } from "framer-motion";
import { Compass, Navigation2 } from "lucide-react";
import type { OrientationMode } from "@/hooks/useMapOrientation";

interface OrientationToggleProps {
  mode: OrientationMode;
  onToggle: () => void;
}

/**
 * OrientationToggle
 *
 * Pill button — bottom-left, above TurnArrowHUD — to switch between
 * heading-up (map rotates with movement) and north-up (classic static).
 *
 * Matches existing Niakofa HUD pill pattern exactly:
 * bg-card/90 backdrop-blur-md border border-border rounded-full
 * px-3 py-1.5 shadow-lg, Lucide icons at w-3 h-3, font-black text-[10px].
 * Active heading-up state glows electric cyan (text-primary / border-primary).
 */
export function OrientationToggle({ mode, onToggle }: OrientationToggleProps) {
  const isHeadingUp = mode === "heading-up";

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={onToggle}
      title={isHeadingUp ? "Switch to North-Up" : "Switch to Heading-Up"}
      className={`
        absolute bottom-[278px] left-4 z-30
        flex items-center gap-1.5
        backdrop-blur-md border rounded-full
        px-3 py-1.5 shadow-lg
        transition-colors duration-200
        ${isHeadingUp
          ? "bg-primary/15 border-primary/40 hover:bg-primary/25"
          : "bg-card/90 border-border hover:border-primary/30"
        }
      `}
    >
      {isHeadingUp ? (
        <Navigation2 className="w-3 h-3 text-primary" />
      ) : (
        <Compass className="w-3 h-3 text-muted-foreground" />
      )}
      <span className={`text-[10px] font-black uppercase tracking-widest ${
        isHeadingUp ? "text-primary" : "text-muted-foreground"
      }`}>
        {isHeadingUp ? "Heading Up" : "North Up"}
      </span>
    </motion.button>
  );
}
