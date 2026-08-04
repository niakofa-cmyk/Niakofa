import { motion } from "framer-motion";
import { Compass, Navigation2, Lock } from "lucide-react";
import type { OrientationMode } from "@/hooks/useMapOrientation";
import { requestOrientationPermission } from "@/hooks/useDeviceHeading";

interface OrientationToggleProps {
  mode: OrientationMode;
  onToggle: () => void;
  /** Renders as a single circular icon button (no text label). */
  iconOnly?: boolean;
}

/**
 * OrientationToggle — three-mode compass button (doc: "Tap once: Bird rotates.
 * Tap twice: Map rotates with bird. Tap three times: Bird locks to North.")
 *
 * Mode cycle:  north-up → heading-up → locked-north → north-up
 *
 * north-up     (Compass icon)    — map is static/north-up; bird icon rotates to
 *                                  show actual GPS heading direction. Classic GPS dot.
 * heading-up   (Navigation2)     — map AND bird rotate together so the bird always
 *                                  points toward the top of the screen (heading-up map).
 * locked-north (Lock icon)       — both map and bird face north; no rotation at all.
 *                                  Useful on a car dash mount or when rotation is distracting.
 *
 * iOS permission: this onClick IS a real user gesture, so it's the correct place
 * to call DeviceOrientationEvent.requestPermission(). Fired on every tap into
 * heading-up mode — a cheap no-op once already granted.
 */
export function OrientationToggle({ mode, onToggle, iconOnly = false }: OrientationToggleProps) {
  const handleClick = () => {
    // Fire iOS permission request synchronously inside the gesture call stack
    // when switching INTO heading-up (the mode that needs the magnetometer).
    if (mode === "north-up") {
      // About to switch to heading-up — request sensor permission now.
      void requestOrientationPermission();
    }
    onToggle();
  };

  // Visual identity for each mode
  const config = {
    "north-up": {
      icon: <Compass className="w-5 h-5" />,
      label: "North Up",
      active: false,
      ariaLabel: "Switch to Heading-Up (map rotates with movement)",
      title: "Tap to switch to Heading-Up",
    },
    "heading-up": {
      icon: <Navigation2 className="w-5 h-5" />,
      label: "Heading Up",
      active: true,
      ariaLabel: "Switch to Locked-North (compass locked)",
      title: "Tap to lock compass to North",
    },
    "locked-north": {
      icon: <Lock className="w-4 h-4" />,
      label: "Locked N",
      active: false,
      ariaLabel: "Switch to North-Up (bird rotates, map static)",
      title: "Tap to switch to North-Up",
    },
  } as const;

  const { icon, label, active, ariaLabel, title } = config[mode];

  if (iconOnly) {
    return (
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        onClick={handleClick}
        style={{ touchAction: "manipulation" }}
        aria-label={ariaLabel}
        title={title}
        className={`w-11 h-11 flex items-center justify-center rounded-full shadow-lg border backdrop-blur-md transition-colors active:scale-95 shrink-0 ${
          active
            ? "bg-primary/15 border-primary/40 text-primary"
            : mode === "locked-north"
              ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
              : "bg-card/90 border-border text-muted-foreground"
        }`}
      >
        {icon}
      </motion.button>
    );
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onClick={handleClick}
      title={title}
      className={`
        flex items-center gap-1.5
        backdrop-blur-md border rounded-full
        px-3 py-1.5 shadow-lg
        transition-colors duration-200
        ${active
          ? "bg-primary/15 border-primary/40 hover:bg-primary/25"
          : mode === "locked-north"
            ? "bg-amber-500/10 border-amber-500/30 hover:border-amber-500/50"
            : "bg-card/90 border-border hover:border-primary/30"
        }
      `}
    >
      <span className={active ? "text-primary" : mode === "locked-north" ? "text-amber-400" : "text-muted-foreground"}>
        {icon}
      </span>
      <span className={`text-[10px] font-black uppercase tracking-widest ${
        active ? "text-primary" : mode === "locked-north" ? "text-amber-400" : "text-muted-foreground"
      }`}>
        {label}
      </span>
    </motion.button>
  );
}
