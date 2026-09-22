/**
 * useAnimationPreference
 *
 * Manages the user's in-app animation override preference.
 *
 * By default, Niakofa respects the OS "Reduce Motion" accessibility setting
 * (`prefers-reduced-motion: reduce`), which suppresses all bird CSS animations
 * (Phase 1 through Phase 3, plus orbit/helping/Phase-2 blocks — all 5 blocks
 * are gated on `:not([data-bird-anim="enabled"])`). This hook lets users opt
 * back in regardless of their OS setting — useful on iOS where "Reduce Motion"
 * is commonly enabled for system UI but the user still wants to see the bird's
 * flight animations.
 *
 * Storage: localStorage key `niakofa_bird_anim`
 *   "enabled" → override OS preference, show all animations
 *   missing / anything else → honour OS preference
 *
 * DOM effect: sets `data-bird-anim="enabled"` on <html> when override is on.
 * ALL reduced-motion CSS blocks use `html:not([data-bird-anim="enabled"]) {…}`
 * so this single attribute gates every suppression block at once.
 *
 * Module-level initialisation: applyPref(readPref()) runs synchronously at
 * import time so the <html> attribute is already set before the first React
 * render — prevents a one-frame flash on iOS where Reduce Motion is on AND the
 * user has stored the "enabled" override (useEffect would fire too late).
 *
 * Safe to call from multiple components — all reads/writes go to the same
 * localStorage key and DOM attribute; the last writer wins but they always
 * agree (idempotent).
 */

import { useState, useEffect, useCallback } from "react";

const LS_KEY = "niakofa_bird_anim";
const HTML_ATTR = "data-bird-anim";

function readPref(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "enabled";
  } catch {
    return false;
  }
}

function applyPref(enabled: boolean): void {
  try {
    if (enabled) {
      document.documentElement.setAttribute(HTML_ATTR, "enabled");
      localStorage.setItem(LS_KEY, "enabled");
    } else {
      document.documentElement.removeAttribute(HTML_ATTR);
      localStorage.removeItem(LS_KEY);
    }
  } catch {
    // localStorage blocked (private browsing etc.) — DOM attr still applied
  }
}

// ── Synchronous first-paint initialisation ────────────────────────────────────
// Runs at module load time (before any render) so the data-bird-anim attribute
// is already present on <html> when React paints the first frame.  Without this,
// a user on iOS with Reduce Motion ON + stored "enabled" override would see a
// one-frame flash where animations are suppressed before useEffect fires.
if (typeof document !== "undefined") {
  applyPref(readPref());
}

// ── Raw OS reduce-motion preference ──────────────────────────────────────────
/**
 * Tracks the OS-level "Reduce Motion" preference in real time.
 * Returns `true` when `prefers-reduced-motion: reduce` is active.
 *
 * Use this for display-only state (e.g. contextual label text) when you need
 * the raw OS signal separately from the user's in-app override.
 * For "should I actually suppress animations?", prefer `useIsAnimationSuppressed`.
 */
export function useOsReducedMotion(): boolean {
  const [osReduced, setOsReduced] = useState<boolean>(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setOsReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return osReduced;
}

// ── Shared reactive hook: is animation currently suppressed? ─────────────────
/**
 * Returns true when the OS prefers reduced motion AND the user has not opted in
 * via the accessibility toggle (i.e. animations should be suppressed right now).
 *
 * Reactive — updates when either the OS setting or the user override changes.
 * Use this in non-bird components (KindnessImpactRing, TurnArrowHUD, etc.) so
 * they respect the same toggle that gates the bird's CSS animations.
 */
export function useIsAnimationSuppressed(): boolean {
  const getState = () => {
    if (typeof window === "undefined") return false;
    const osWantsReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const userOverride = document.documentElement.getAttribute(HTML_ATTR) === "enabled";
    return osWantsReduced && !userOverride;
  };

  const [suppressed, setSuppressed] = useState<boolean>(getState);

  useEffect(() => {
    const check = () => setSuppressed(getState());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", check);
    // Watch for changes to html[data-bird-anim] (toggle writes/clears it)
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [HTML_ATTR],
    });
    return () => {
      mq.removeEventListener("change", check);
      observer.disconnect();
    };
  }, []);

  return suppressed;
}

export function useAnimationPreference() {
  const [animEnabled, setAnimEnabled] = useState<boolean>(() => readPref());

  // Keep state in sync with the DOM attribute (written synchronously at module
  // init and by toggleAnim/setAnimEnabled_ below — this effect is a safety net
  // for cases where multiple hook instances exist simultaneously).
  useEffect(() => {
    applyPref(animEnabled);
  }, [animEnabled]);

  const toggleAnim = useCallback(() => {
    setAnimEnabled(prev => {
      const next = !prev;
      applyPref(next);
      return next;
    });
  }, []);

  const setAnimEnabled_ = useCallback((enabled: boolean) => {
    applyPref(enabled);
    setAnimEnabled(enabled);
  }, []);

  return { animEnabled, toggleAnim, setAnimEnabled: setAnimEnabled_ };
}
