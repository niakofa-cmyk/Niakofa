/**
 * useTimeOfDay — real-time solar position hook.
 *
 * Returns `isNight: boolean` derived from the sun's actual elevation angle at
 * the user's GPS coordinates. Night begins when the sun drops below −6°
 * (civil twilight threshold — sky is fully dark).
 *
 * Pure math, no external API. Algorithm follows NOAA's solar position
 * equations (Jean Meeus "Astronomical Algorithms", 2nd ed.).
 *
 * Re-evaluates every 60 seconds. Falls back to daytime (false) when GPS
 * coordinates are not yet available.
 *
 * Usage:
 *   const isNight = useTimeOfDay(myLocation?.lat ?? null, myLocation?.lng ?? null);
 */

import { useEffect, useState } from "react";

// Civil twilight: sun centre is 6° below horizon. Sky is fully dark after this.
const CIVIL_TWILIGHT_DEG = -6;

/**
 * Compute the solar elevation angle (degrees above horizon) for a given
 * geographic position and UTC timestamp.
 *
 * Returns a number in [−90, 90]. Positive = sun is up. Negative = sun is below
 * the horizon.
 */
function solarElevationDeg(latDeg: number, lngDeg: number, utcMs: number): number {
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;

  // Julian date
  const jd = utcMs / 86_400_000 + 2_440_587.5;

  // Julian century
  const jc = (jd - 2_451_545.0) / 36_525;

  // Geometric mean longitude of the sun (degrees, modulo 360)
  const l0 = (280.46646 + jc * (36_000.76983 + jc * 0.0003032)) % 360;

  // Geometric mean anomaly of the sun (degrees)
  const m = 357.52911 + jc * (35_999.05029 - 0.0001537 * jc);

  // Equation of centre
  const eoc =
    Math.sin(m * DEG) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * m * DEG) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * m * DEG) * 0.000289;

  // Sun's true longitude (degrees)
  const sunLon = l0 + eoc;

  // Apparent longitude (correcting for nutation + aberration)
  const omega = 125.04 - 1934.136 * jc;
  const lambda = sunLon - 0.00569 - 0.00478 * Math.sin(omega * DEG);

  // Obliquity of the ecliptic (degrees), corrected
  const epsilon0 = 23 + 26 / 60 + 21.448 / 3600 - jc * (46.815 / 3600 + jc * (0.00059 / 3600 - jc * 0.001813 / 3600));
  const epsilon = epsilon0 + 0.00256 * Math.cos(omega * DEG);

  // Sun's right ascension and declination
  const sinDec = Math.sin(epsilon * DEG) * Math.sin(lambda * DEG);
  const decl = Math.asin(sinDec) * RAD; // solar declination, degrees

  // Equation of time (minutes)
  const y = Math.tan((epsilon / 2) * DEG) ** 2;
  const eot =
    4 *
    RAD *
    (y * Math.sin(2 * l0 * DEG) -
      2 * 0.016708634 * Math.sin(m * DEG) +
      4 * 0.016708634 * y * Math.sin(m * DEG) * Math.cos(2 * l0 * DEG) -
      0.5 * y * y * Math.sin(4 * l0 * DEG) -
      1.25 * 0.016708634 * 0.016708634 * Math.sin(2 * m * DEG));

  // True solar time (minutes)
  const utcMinutes = (utcMs % 86_400_000) / 60_000;
  const trueSolarTime = utcMinutes + eot + 4 * lngDeg;

  // Hour angle (degrees)
  const ha = (trueSolarTime / 4) - 180;

  // Solar elevation angle
  const latRad = latDeg * DEG;
  const declRad = decl * DEG;
  const haRad = ha * DEG;

  const sinElevation =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);

  // Clamp to [-1, 1] to guard against floating-point overshoot before asin
  const clamped = Math.max(-1, Math.min(1, sinElevation));
  return Math.asin(clamped) * RAD;
}

export function useTimeOfDay(lat: number | null, lng: number | null): boolean {
  const [isNight, setIsNight] = useState(false);

  useEffect(() => {
    if (lat === null || lng === null) {
      setIsNight(false);
      return;
    }

    function evaluate() {
      const elev = solarElevationDeg(lat!, lng!, Date.now());
      setIsNight(elev < CIVIL_TWILIGHT_DEG);
    }

    evaluate();
    const id = setInterval(evaluate, 60_000);
    return () => clearInterval(id);
  }, [lat, lng]);

  return isNight;
}

/**
 * Sky-tier thresholds — defines the four visual states:
 *  "day"      sun > 10°   — full daytime plumage, no filter
 *  "golden"   0° – 10°    — golden hour: warm amber hue wash
 *  "twilight" -6° – 0°    — civil twilight: desaturated dimming
 *  "night"    < -6°        — fully dark: blue-teal shadow palette
 */
const GOLDEN_UPPER_DEG = 10;
const TWILIGHT_UPPER_DEG = 0;
// CIVIL_TWILIGHT_DEG (-6) is the night threshold, already declared above.

export type SkyTier = "day" | "golden" | "twilight" | "night";

/**
 * useSolarTier — returns a four-way sky state driven by the sun's actual
 * elevation angle at the user's GPS position.
 *
 * More granular than useTimeOfDay (boolean). Provides the "golden hour" warm
 * transition and civil twilight dimming that make the bird feel photorealistic.
 *
 * Falls back to "day" when GPS coordinates are unavailable.
 * Re-evaluates every 60 seconds (elevation changes ~0.25°/min near horizon).
 */
export function useSolarTier(lat: number | null, lng: number | null): SkyTier {
  const [tier, setTier] = useState<SkyTier>("day");

  useEffect(() => {
    if (lat === null || lng === null) {
      setTier("day");
      return;
    }

    function evaluate() {
      const elev = solarElevationDeg(lat!, lng!, Date.now());
      if      (elev > GOLDEN_UPPER_DEG)    setTier("day");
      else if (elev > TWILIGHT_UPPER_DEG)  setTier("golden");
      else if (elev > CIVIL_TWILIGHT_DEG)  setTier("twilight");
      else                                  setTier("night");
    }

    evaluate();
    const id = setInterval(evaluate, 60_000);
    return () => clearInterval(id);
  }, [lat, lng]);

  return tier;
}
