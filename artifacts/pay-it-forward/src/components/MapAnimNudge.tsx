/**
 * MapAnimNudge
 *
 * One-time dismissible banner shown on the map screen when ALL of:
 *   1. OS "Reduce Motion" is active (prefers-reduced-motion: reduce)
 *   2. The user has NOT set the in-app animation override
 *   3. The user has NOT previously dismissed this nudge
 *
 * Shown at most once per install (dismissal flag in localStorage).
 * "Enable" → sets the animation override to ON and auto-dismisses.
 * "✕"      → dismisses without changing the preference.
 *
 * Renders as an absolute-positioned pill at the top of the map screen,
 * below the TopBar safe-area, with a z-index that sits above the map
 * canvas but below the TopBar itself.
 */

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useAnimationPreference, useOsReducedMotion } from "@/hooks/useAnimationPreference";
import { Z_CARD } from "@/lib/zLayers";

const DISMISS_KEY = "niakofa_anim_nudge_dismissed";

function hasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // localStorage blocked in private mode — nudge may reappear but won't break
  }
}

export function MapAnimNudge() {
  const { animEnabled, setAnimEnabled } = useAnimationPreference();
  // Visible only when: OS reduce-motion is on AND override is off AND not yet dismissed
  const osReducedMotion = useOsReducedMotion();
  const [dismissed, setDismissed] = useState<boolean>(() => hasDismissed());

  const shouldShow = osReducedMotion && !animEnabled && !dismissed;

  if (!shouldShow) return null;

  const handleEnable = () => {
    setAnimEnabled(true);
    setDismissed(true);
    saveDismissed();
  };

  const handleDismiss = () => {
    setDismissed(true);
    saveDismissed();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-2xl
                 bg-card/95 backdrop-blur-sm border border-border shadow-lg
                 text-xs font-medium text-foreground"
      style={{
        // Sits below the TopBar (safe-area + ~56px bar) and above the map canvas.
        // Z_CARD (30) keeps the nudge above map tiles and below Z_CONTROLS (40)
        // and Z_NAV (50) so it never fights with the settings button or bottom nav.
        top: "calc(env(safe-area-inset-top, 0px) + 68px)",
        zIndex: Z_CARD,
        maxWidth: "calc(100vw - 2.5rem)",
        whiteSpace: "nowrap",
      }}
    >
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="truncate">Bird animations paused by OS settings</span>
      <button
        onClick={handleEnable}
        className="shrink-0 px-2 py-0.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-wide active:opacity-80"
        style={{ fontSize: "10px", touchAction: "manipulation" }}
        aria-label="Enable bird animations"
      >
        Enable
      </button>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted-foreground active:text-foreground"
        aria-label="Dismiss this notification"
        style={{ touchAction: "manipulation" }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
