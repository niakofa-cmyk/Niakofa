import { useEffect, useRef, useState } from "react";

/**
 * useTweenedPosition
 *
 * Smooth GPS "glide" between position fixes. GPS chipsets emit new coordinates
 * every 1–3 seconds; without tweening, a marker snaps from point to point
 * (visible as a teleporting dot). This hook linearly interpolates between the
 * last confirmed position and the new one over `durationMs`, producing silky
 * per-frame movement even at low GPS update rates.
 *
 * The interpolation uses requestAnimationFrame for the smoothest possible
 * rendering — avoids setTimeout/setInterval jitter and aligns with the
 * browser's own paint cycle. The tween is cancelled automatically when a new
 * GPS fix arrives mid-flight (replaces the old target with the new one),
 * and on component unmount.
 *
 * Usage:
 *   const tweenedPos = useTweenedPosition(myLocation, 800);
 *   // pass tweenedPos.lat / tweenedPos.lng to the Marker component
 */

export interface GeoPosition {
  lat: number;
  lng: number;
}

const DEFAULT_TWEEN_MS = 800;

export function useTweenedPosition(
  target: GeoPosition | null,
  durationMs: number = DEFAULT_TWEEN_MS
): GeoPosition | null {
  const [tweened, setTweened] = useState<GeoPosition | null>(target);
  const fromRef = useRef<GeoPosition | null>(target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const targetRef = useRef<GeoPosition | null>(target);

  useEffect(() => {
    if (!target) {
      setTweened(null);
      fromRef.current = null;
      return;
    }

    const from = fromRef.current;
    targetRef.current = target;

    // First fix — no tween, just snap
    if (!from) {
      fromRef.current = target;
      setTweened(target);
      return;
    }

    // Same position — no work needed
    if (from.lat === target.lat && from.lng === target.lng) return;

    // Bad-fix guard: if GPS jumps more than ~2 km in either axis, snap directly
    // instead of animating across the globe. ~0.018° ≈ 2 km at the equator;
    // use 0.02° for a comfortable margin. This prevents the bird from flying
    // across the world when the chipset emits a spurious fix far from reality.
    const MAX_TWEEN_DEG = 0.02;
    if (
      Math.abs(target.lat - from.lat) > MAX_TWEEN_DEG ||
      Math.abs(target.lng - from.lng) > MAX_TWEEN_DEG
    ) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      fromRef.current = target;
      setTweened(target);
      return;
    }

    // Cancel any in-flight tween
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const startFrom = { ...from };
    startTimeRef.current = null;

    function tick(now: number) {
      if (startTimeRef.current === null) startTimeRef.current = now;
      const elapsed = now - startTimeRef.current;
      const t = Math.min(1, elapsed / durationMs);

      // Ease-out cubic — starts fast, decelerates smoothly like a real object
      const ease = 1 - Math.pow(1 - t, 3);

      const current = targetRef.current!;
      const lat = startFrom.lat + (current.lat - startFrom.lat) * ease;
      const lng = startFrom.lng + (current.lng - startFrom.lng) * ease;
      setTweened({ lat, lng });

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = current;
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target?.lat, target?.lng, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return tweened;
}
