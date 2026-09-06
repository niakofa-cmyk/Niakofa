import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import {
  CircleStartLocationBody,
  displayCityName,
  verifyCircleStartLocation,
} from "../lib/circleLocationPolicy";
import { db, audioCirclesTable, cityNeighborhoodsTable } from "@workspace/db";

const router = Router();

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

    const spiralCityDisplay = result.spiralCityDisplay ?? circle.city_display ?? displayCityName(circle.city_key);
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