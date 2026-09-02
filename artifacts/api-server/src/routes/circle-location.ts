import { Router } from "express";
import { eq } from "drizzle-orm";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { generalApiLimiter } from "../middlewares/rate-limit";
import {
  CircleStartLocationBody,
  verifyCircleStartLocation,
} from "../lib/circleLocationPolicy";
import { db, audioCirclesTable } from "@workspace/db";

const router = Router();

router.post(
  "/audio-circles/:id/location-check",
  requireAuth,
  requireApproved,
  generalApiLimiter,
  async (req, res) => {
    const circleId = Number(req.params.id);
    if (!Number.isSafeInteger(circleId) || circleId <= 0) {
      return res.status(400).json({ allowed: false, error: "Invalid id", code: "CIRCLE_ID_INVALID" });
    }
    const parsed = CircleStartLocationBody.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        allowed: false,
        error: "A fresh GPS fix is required (latitude, longitude, accuracy_meters, captured_at).",
        code: "GPS_BODY_INVALID",
      });
    }

    const [circle] = await db
      .select({ id: audioCirclesTable.id, city_key: audioCirclesTable.city_key })
      .from(audioCirclesTable)
      .where(eq(audioCirclesTable.id, circleId))
      .limit(1);
    if (!circle) return res.status(404).json({ allowed: false, error: "Circle not found" });

    const result = await verifyCircleStartLocation(circle.city_key, parsed.data, {
      userId: req.authenticatedUserId!,
      circleId,
    });
    if (!result.ok) {
      return res.status(403).json({ allowed: false, error: result.reason, code: result.code });
    }
    return res.json({
      allowed: true,
      city_key: result.cityKey,
      city_display: result.cityDisplay,
      county_display: result.countyDisplay,
      state_code: result.stateCode,
      accuracy_bucket: result.accuracyBucket,
    });
  },
);

export default router;