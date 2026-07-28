/**
 * SankofaBird/Flight/Banking.ts
 *
 * Banking system — computes roll angle from heading-change rate.
 * The bank angle is a visual metaphor for turn intensity, not literal physics.
 */

import { useEffect, useRef, useState } from "react";
import {
  shortestHeadingDelta,
  computeBankAngle,
} from "@/lib/sankofa-bird-math";

export interface BankingState {
  /** Raw bank angle from heading change rate (degrees, ±25). */
  bankDeg: number;
  /** Bank angle clamped to ±20° at low zoom to prevent visual jitter. */
  effectiveBankDeg: number;
}

/**
 * useBanking — detects heading changes and converts them to a roll angle.
 *
 * @param heading - Current world-frame heading in degrees, or null.
 * @param hasHeading - True when heading is a valid number.
 * @param zoomTier - Current LOD zoom tier from useAltitude.
 */
export function useBanking(
  heading: number | null,
  hasHeading: boolean,
  zoomTier: "low" | "mid" | "high" | "street",
): BankingState {
  const lastHeadingRef = useRef<number | null>(null);
  const [bankDeg, setBankDeg] = useState(0);

  useEffect(() => {
    if (!hasHeading) return;
    const prev = lastHeadingRef.current;
    lastHeadingRef.current = heading as number;
    if (prev === null) return;
    const delta = shortestHeadingDelta(prev, heading as number);
    const bank = computeBankAngle(delta);
    setBankDeg(bank);
    const t = setTimeout(() => { setBankDeg(0); }, 700);
    return () => clearTimeout(t);
  }, [heading, hasHeading]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveBankDeg = zoomTier === "low"
    ? Math.max(-20, Math.min(20, bankDeg))
    : bankDeg;

  return { bankDeg, effectiveBankDeg };
}
