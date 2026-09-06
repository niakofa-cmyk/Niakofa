import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import {
  CircleStartLocationBody,
  accuracyBucket,
  displayCityName,
  normalizeCityKey,
  reverseGeocodeCircleStart,
  validateFreshAccurateLocation,
  verifyCircleStartLocation,
} from "../lib/circleLocationPolicy";
import { db, audioCirclesTable, cityNeighborhoodsTable } from "@workspace/db";
import { pickLocalSpiral } from "../lib/circleLocationContext";

const router = Router();

/**
 * Resolve the shared map GPS signal to the user's local Spiral without
 * granting eligibility in the browser. This is intentionally separate from
 * the per-Spiral check because the list needs one authoritative local match
 * before it can promote a neighborhood.
 */
router.post(
  "/audio-circles/location-context",
  requireAuth,
  generalApiLimiter,
  async (req, res) => {
    const parsed = CircleStartLocationBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        status: "blocked",
        code: "GPS_BODY_INVALID",
        error: "A fresh GPS fix is required (latitude, longitude, accuracy_meters, captured_at).",
      });
    }

    const freshness = validateFreshAccurateLocation(parsed.data);
    if (!freshness.ok) {
      return res.status(422).json({
        ok: false,
        status: "blocked",
        code: freshness.code,
        error: freshness.reason,
        host_signal: { status: "blocked", message: freshness.reason },
      });
    }

    let resolved;
    try {
      resolved = await reverseGeocodeCircleStart(parsed.data);
    } catch {
      return res.status(503).json({
        ok: false,
        status: "blocked",
        code: "GPS_REVERSE_GEOCODE_FAILED",
        error: "Your GPS signal is available, but the neighborhood could not be verified yet.",
        host_signal: { status: "blocked", message: "Location verification is temporarily unavailable. Retrying automatically." },
      });
    }

    const circles = await db
      .select({
        id: audioCirclesTable.id,
        neighborhood_id: audioCirclesTable.neighborhood_id,
        name: audioCirclesTable.name,
        neighborhood_name: cityNeighborhoodsTable.name,
        neighborhood_emoji: cityNeighborhoodsTable.emoji,
      })
      .from(audioCirclesTable)
      .leftJoin(cityNeighborhoodsTable, eq(cityNeighborhoodsTable.id, audioCirclesTable.neighborhood_id))
      .where(eq(audioCirclesTable.city_key, normalizeCityKey(resolved.cityKey)));

    const localCircle = pickLocalSpiral(circles, resolved.neighborhoodHint);

    return res.json({
      ok: true,
      status: localCircle ? "ready" : "location_ready",
      city_key: resolved.cityKey,
      city_display: resolved.cityDisplay,
      county_display: resolved.countyDisplay,
      state_code: resolved.stateCode,
      accuracy_bucket: accuracyBucket(parsed.data.accuracy_meters),
      neighborhood_hint: resolved.neighborhoodHint,
      circle_id: localCircle?.id ?? null,
      neighborhood_name: localCircle?.neighborhood_name ?? null,
      neighborhood_emoji: localCircle?.neighborhood_emoji ?? null,
      host_signal: {
        status: localCircle ? "ready" : "location_ready",
        message: localCircle
          ? `Verified local Spiral: ${localCircle.neighborhood_name ?? `${resolved.cityDisplay} city-wide`}`
          : `GPS verified in ${resolved.cityDisplay}; local Spirals are still loading.`,
      },
    });
  },
);

router.post(
  "/audio-circles/:id/location-check",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const circleId = Number(req.params.id);
    if (!Number.isSafeInteger(circleId) || circleId <= 0) {
      return res.status(400).json({
        allowed: false,
        can_host: false,
        error: "Invalid id",
        code: "CIRCLE_ID_INVALID",
      });
    }

    const parsed = CircleStartLocationBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        allowed: false,
        can_host: false,
        error: "A fresh GPS fix is required (latitude, longitude, accuracy_meters, captured_at).",
        code: "GPS_BODY_INVALID",
      });
    }

    const [circle] = await db
      .select({
        id: audioCirclesTable.id,
        city_key: audioCirclesTable.city_key,
        city_display: audioCirclesTable.city_display,
        neighborhood_id: audioCirclesTable.neighborhood_id,
        name: audioCirclesTable.name,
      })
      .from(audioCirclesTable)
      .where(eq(audioCirclesTable.id, circleId))
      .limit(1);
    if (!circle) {
      return res.status(404).json({
        allowed: false,
        can_host: false,
        error: "Spiral not found",
        code: "CIRCLE_NOT_FOUND",
      });
    }

    let neighborhoodName: string | null = null;
    if (circle.neighborhood_id != null) {
      const [neighborhood] = await db
        .select({ name: cityNeighborhoodsTable.name })
        .from(cityNeighborhoodsTable)
        .where(eq(cityNeighborhoodsTable.id, circle.neighborhood_id))
        .limit(1);
      neighborhoodName = neighborhood?.name ?? null;
    }

    const result = await verifyCircleStartLocation(circle.city_key, parsed.data, {
      userId: req.authenticatedUserId!,
      circleId,
    });

    // Keep the route response anchored to the persisted Spiral metadata. The
    // verifier's successful union branch intentionally does not need to carry
    // a second copy of this display value, which also keeps the result type
    // narrow and prevents a frontend-facing type leak from breaking CI.
    const spiralCityDisplay = circle.city_display ?? displayCityName(circle.city_key);
    if (!result.ok) {
      return res.status(403).json({
        allowed: false,
        can_host: false,
        error: result.reason,
        code: result.code,
        spiral_city_key: result.spiralCityKey ?? circle.city_key,
        spiral_city_display: spiralCityDisplay,
        spiral_neighborhood: neighborhoodName,
        spiral_name: circle.name,
        resolved_city_key: result.resolvedCityKey ?? null,
        resolved_city_display: result.resolvedCityDisplay ?? null,
        resolved_neighborhood_hint: result.neighborhoodHint ?? null,
        host_signal: {
          status: "blocked",
          message:
            result.code === "CIRCLE_START_WRONG_CITY"
              ? `Hosting unlocked in ${spiralCityDisplay} only. GPS shows ${result.resolvedCityDisplay ?? "another city"}. You can still join.`
              : result.reason,
        },
      });
    }

    return res.json({
      allowed: true,
      can_host: true,
      city_key: result.cityKey,
      city_display: result.cityDisplay,
      county_display: result.countyDisplay,
      state_code: result.stateCode,
      accuracy_bucket: result.accuracyBucket,
      spiral_city_key: circle.city_key,
      spiral_city_display: spiralCityDisplay,
      spiral_neighborhood: neighborhoodName,
      spiral_name: circle.name,
      resolved_city_key: result.cityKey,
      resolved_city_display: result.cityDisplay,
      resolved_neighborhood_hint: result.neighborhoodHint,
      host_signal: {
        status: "ready",
        message: neighborhoodName
          ? `Verified: you can host the ${neighborhoodName} Spiral`
          : `Verified: you can host Spirals in ${result.cityDisplay}`,
      },
    });
  },
);

export default router;
