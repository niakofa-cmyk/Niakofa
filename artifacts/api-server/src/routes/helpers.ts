import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetOnlineHelpersQueryParams } from "@workspace/api-zod";

const router = Router();

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get("/helpers/online", async (req, res) => {
  const params = GetOnlineHelpersQueryParams.safeParse({
    lat: req.query.lat ? parseFloat(req.query.lat as string) : undefined,
    lng: req.query.lng ? parseFloat(req.query.lng as string) : undefined,
    radius_miles: req.query.radius_miles ? parseFloat(req.query.radius_miles as string) : undefined,
  });

  const helpers = await db.select().from(usersTable).where(eq(usersTable.helper_mode_active, true));
  const result = helpers
    .filter(h => h.lat !== null && h.lng !== null)
    .map(h => ({
      id: h.id,
      name: h.name,
      avatar_url: h.avatar_url,
      lat: h.lat!,
      lng: h.lng!,
      heading: h.heading,
      trust_score: h.trust_score,
      help_count: h.help_count,
      is_online: true,
      active_request_id: null,
      distance_miles: params.success && params.data.lat && params.data.lng
        ? distanceMiles(params.data.lat, params.data.lng, h.lat!, h.lng!)
        : null,
    }))
    .filter(h => {
      if (!params.success || !params.data.lat || !params.data.lng || h.distance_miles === null) return true;
      const radius = params.data.radius_miles ?? 10;
      return h.distance_miles <= radius;
    })
    .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999));

  return res.json(result);
});

export default router;
