import { Router } from "express";
import { GetRouteQueryParams } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();

router.get("/navigation/route", async (req, res) => {
  const parsed = GetRouteQueryParams.safeParse({
    start_lat: parseFloat(req.query.start_lat as string),
    start_lng: parseFloat(req.query.start_lng as string),
    end_lat: parseFloat(req.query.end_lat as string),
    end_lng: parseFloat(req.query.end_lng as string),
  });
  if (!parsed.success) return res.status(400).json({ error: "start_lat, start_lng, end_lat, end_lng required" });

  const { start_lat, start_lng, end_lat, end_lng } = parsed.data;
  const token = process.env.VITE_MAPBOX_TOKEN;
  if (!token) return res.status(500).json({ error: "Mapbox token not configured" });

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${start_lng},${start_lat};${end_lng},${end_lat}?steps=true&geometries=geojson&access_token=${token}`;
    const response = await fetch(url);
    const data = await response.json() as {
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: object;
        legs: Array<{
          steps: Array<{
            maneuver: { instruction: string; type: string; modifier?: string };
            distance: number;
            duration: number;
          }>;
        }>;
      }>;
    };

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: "No route found" });
    }

    const route = data.routes[0];
    const steps = route.legs[0].steps.map(step => ({
      instruction: step.maneuver.instruction,
      distance_meters: step.distance,
      duration_seconds: step.duration,
      maneuver_type: step.maneuver.type ?? null,
      maneuver_direction: step.maneuver.modifier ?? null,
    }));

    const distanceMiles = (route.distance / 1609.34).toFixed(1);
    const durationMin = Math.round(route.duration / 60);
    const etaText = durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

    // Compute initial bearing from start to first waypoint
    const coords = (route.geometry as { coordinates: number[][] }).coordinates;
    let initialBearing = 0;
    if (coords.length >= 2) {
      const [lng1, lat1] = coords[0];
      const [lng2, lat2] = coords[1];
      const dLng = (lng2 - lng1) * Math.PI / 180;
      const lat1R = lat1 * Math.PI / 180;
      const lat2R = lat2 * Math.PI / 180;
      const x = Math.sin(dLng) * Math.cos(lat2R);
      const y = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
      initialBearing = ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360;
    }

    const speedMph = route.distance / 1609.34 / (route.duration / 3600);

    return res.json({
      geometry: route.geometry,
      distance_meters: route.distance,
      duration_seconds: route.duration,
      steps,
      eta_text: etaText,
      distance_text: \`\${distanceMiles} mi\`,
      initial_bearing: Math.round(initialBearing),
      speed_mph: Math.round(speedMph),
      waypoints: coords.length,
    });
  } catch (err) {
    logger.error({ err }, "Mapbox directions API error");
    return res.status(500).json({ error: "Failed to fetch route" });
  }
});

export default router;
