/**
 * useBatterySaver — dynamic battery-saver mode for SankofaBird LOD system.
 *
 * Combines three signals to decide whether the bird should drop to LOD3
 * (minimal silhouette, no GPU-intensive animations):
 *
 *  1. Battery API  — if the device reports ≤ 15 % charge, enable saver.
 *  2. Device memory — < 4 GB RAM (static; same as the existing IS_LOW_END_DEVICE
 *     constant in map.tsx so both pages converge on the same threshold).
 *  3. Override prop — caller can force-enable saver regardless (e.g. user
 *     toggled "save battery" in settings).
 *
 * The hook never forces saver OFF — if any signal says "yes", saver is on.
 *
 * Battery API availability:
 *  • Supported in Chrome/Android. Not in Safari/Firefox.
 *  • Falls back gracefully: if the API is absent the hook just uses the
 *    other two signals.
 *
 * Usage:
 *   const batterySaver = useBatterySaver({ forceOn: false });
 */

import { useEffect, useState } from "react";

// --------------------------------------------------------------------------
// Battery Manager typings (not in lib.dom.d.ts by default in older TS configs)
// --------------------------------------------------------------------------
interface BatteryManager extends EventTarget {
  readonly charging: boolean;
  readonly level: number; // 0–1
  onchargingchange: ((this: BatteryManager, ev: Event) => void) | null;
  onlevelchange: ((this: BatteryManager, ev: Event) => void) | null;
}

// Low-battery threshold: enable saver when ≤ 15 % and not plugged in.
const LOW_BATTERY_THRESHOLD = 0.15;

// Static low-end device check (same heuristic as map.tsx IS_LOW_END_DEVICE)
const IS_LOW_END =
  typeof navigator !== "undefined" &&
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory != null &&
  (navigator as Navigator & { deviceMemory?: number }).deviceMemory! < 4;

interface UseBatterySaverOptions {
  /** Force saver on regardless of battery / memory state. */
  forceOn?: boolean;
}

/**
 * Returns `true` when LOD3 / battery-saver mode should be active.
 */
export function useBatterySaver({ forceOn = false }: UseBatterySaverOptions = {}): boolean {
  // Start with the static low-end check so there's no flash of full-quality
  // before the Battery API resolves on weak devices.
  const [batteryLow, setBatteryLow] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;

    // Battery Status API (Chrome/Android only)
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };

    if (typeof nav.getBattery !== "function") return;

    let battery: BatteryManager | null = null;

    function checkLevel() {
      if (!battery) return;
      // Low = ≤ 15 % AND not charging
      setBatteryLow(!battery.charging && battery.level <= LOW_BATTERY_THRESHOLD);
    }

    nav.getBattery().then(bm => {
      battery = bm;
      checkLevel();
      bm.onlevelchange = checkLevel;
      bm.onchargingchange = checkLevel;
    }).catch(() => {
      // API present but failed — ignore; fall back to static check
    });

    return () => {
      if (battery) {
        battery.onlevelchange = null;
        battery.onchargingchange = null;
      }
    };
  }, []);

  return forceOn || IS_LOW_END || batteryLow;
}
