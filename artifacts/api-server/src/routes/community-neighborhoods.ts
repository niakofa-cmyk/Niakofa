/**
 * Global "Neighborhood Circles" content, per city.
 *
 * Fort Worth's content is hand-written and seeded into city_neighborhoods
 * with source="curated" — never overwritten by this route. Every other
 * city is generated on first request via nia-service's Claude-backed
 * /generate-neighborhoods endpoint and cached here as source="generated",
 * verified=false until an admin reviews/corrects it through the
 * /admin/city-neighborhoods endpoints below.
 */
import { Router } from "express";
import { z } from "zod";
import { db, cityNeighborhoodsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { requestNia } from "../lib/nia-client";
import {
  getNeighborhoodGeometryStatus,
  validateNeighborhoodGeometry,
} from "../lib/neighborhoodGeofence";

const router = Router();

const NeighborhoodAdminPatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  emoji: z.string().trim().min(1).max(10).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  verified: z.boolean().optional(),
  center_lat: z.number().finite().gte(-90).lte(90).nullable().optional(),
  center_lng: z.number().finite().gte(-180).lte(180).nullable().optional(),
  radius_meters: z.number().finite().positive().max(100_000).nullable().optional(),
  polygon_geojson: z.record(z.string(), z.unknown()).nullable().optional(),
  geometry_source: z.string().trim().min(1).max(200).nullable().optional(),
  geometry_version: z.string().trim().min(1).max(100).nullable().optional(),
  geometry_verified: z.boolean().optional(),
  geometry_effective_at: z.string().datetime({ offset: true }).nullable().optional(),
}).strict();

export function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// BUG-4-H01: Hard cap on city string length — oversized payloads forwarded to
// nia-service's /generate-neighborhoods could cause OOM/DoS and excessive
// Claude token usage. 100 chars is more than enough for any real city name.
const MAX_CITY_LEN = 100;

// BUG-4-M03: Strip any HTML/script tags from LLM-generated neighborhood
// names/descriptions before storing. If admin views are rendered raw, a
// malicious or hallucinated name like "<script>..." would be a stored XSS vector.
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

/**
 * Cache-or-generate a city's neighborhoods, exactly what
 * GET /community/neighborhoods below does — pulled out so other features
 * (Audio Circles) can guarantee a city's neighborhoods exist before they
 * build on top of them, instead of silently rendering empty because
 * nothing ever populated city_neighborhoods for that city yet.
 *
 * Always returns whatever rows now exist for cityKey (possibly []). Never
 * throws — a generation failure just means "no neighborhoods yet", the
 * same as before this function existed; callers should treat [] as
 * "try again later", not as confirmation the city has none.
 */
export async function ensureNeighborhoodsForCity(cityRaw: string, cityKey: string) {
  const existing = await db
    .select()
    .from(cityNeighborhoodsTable)
    .where(eq(cityNeighborhoodsTable.city_key, cityKey));

  if (existing.length > 0) return existing;

  // Cache miss — generate via nia-service, store as unverified, return.
  try {
    const genRes = await requestNia("/generate-neighborhoods", {
      method: "POST",
      body: JSON.stringify({ city: cityRaw }),
    }, 30_000);

    if (!genRes.ok) {
      logger.warn({ status: genRes.status, city: cityRaw }, "community/neighborhoods: generation request failed");
      return [];
    }

    const data = await genRes.json() as { neighborhoods?: Array<{ id: string; name: string; emoji: string; description: string }> };
    const generated = data.neighborhoods ?? [];
    if (generated.length === 0) return [];

    const inserted = await db
      .insert(cityNeighborhoodsTable)
      .values(generated.map(n => ({
        city_key: cityKey,
        city_display: cityRaw,
        neighborhood_id: n.id,
        name: stripTags(n.name).slice(0, 120),
        emoji: stripTags(n.emoji).slice(0, 10),
        description: stripTags(n.description).slice(0, 500),
        source: "generated" as const,
        verified: false,
      })))
      .onConflictDoNothing()
      .returning();

    logger.info({ city: cityRaw, count: inserted.length }, "community/neighborhoods: generated and cached");
    return inserted;
  } catch (err) {
    logger.error({ err, city: cityRaw }, "community/neighborhoods: generation failed");
    return [];
  }
}

router.get("/community/neighborhoods", requireAuth, async (req, res) => {
  const cityRaw = (req.query.city as string | undefined)?.trim();
  if (!cityRaw) {
    return res.json({ neighborhoods: [], city: null });
  }
  if (cityRaw.length > MAX_CITY_LEN) {
    return res.status(400).json({ error: "city name too long" });
  }
  const cityKey = normalizeCityKey(cityRaw);
  if (!cityKey) {
    return res.json({ neighborhoods: [], city: null });
  }

  const neighborhoods = await ensureNeighborhoodsForCity(cityRaw, cityKey);
  return res.json({
    neighborhoods: neighborhoods.map((neighborhood) => ({
      ...neighborhood,
      geometry_status: getNeighborhoodGeometryStatus(neighborhood),
    })),
    city: cityRaw,
  });
});

// ── Admin review ────────────────────────────────────────────────────────────

router.get("/admin/city-neighborhoods", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const verifiedParam = req.query.verified as string | undefined;
  const rows = verifiedParam !== undefined
    ? await db.select().from(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.verified, verifiedParam === "true"))
    : await db.select().from(cityNeighborhoodsTable);
  return res.json(rows.map((row) => ({
    ...row,
    geometry_status: getNeighborhoodGeometryStatus(row),
  })));
});

router.patch("/admin/city-neighborhoods/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const parsed = NeighborhoodAdminPatchBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid neighborhood update",
      details: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    });
  }

  const [current] = await db
    .select()
    .from(cityNeighborhoodsTable)
    .where(eq(cityNeighborhoodsTable.id, id))
    .limit(1);
  if (!current) return res.status(404).json({ error: "Not found" });

  const patch = parsed.data;
  const candidate = {
    ...current,
    ...patch,
    geometry_effective_at:
      patch.geometry_effective_at === undefined
        ? current.geometry_effective_at
        : patch.geometry_effective_at
          ? new Date(patch.geometry_effective_at)
          : null,
  };
  const hasGeometryPatch =
    patch.center_lat !== undefined ||
    patch.center_lng !== undefined ||
    patch.radius_meters !== undefined ||
    patch.polygon_geojson !== undefined;
  const geometryError = validateNeighborhoodGeometry(candidate);
  if (hasGeometryPatch && geometryError && candidate.geometry_verified) {
    return res.status(400).json({ error: geometryError });
  }
  if (hasGeometryPatch && geometryError && (
    candidate.polygon_geojson != null ||
    candidate.center_lat != null ||
    candidate.center_lng != null ||
    candidate.radius_meters != null
  )) {
    return res.status(400).json({ error: geometryError });
  }
  if (candidate.geometry_verified) {
    if (!candidate.geometry_source || !candidate.geometry_version || !candidate.geometry_effective_at) {
      return res.status(400).json({
        error: "Verified geometry requires source, version, and effective date.",
      });
    }
    if (geometryError) return res.status(400).json({ error: geometryError });
  }

  const [updated] = await db.update(cityNeighborhoodsTable)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.verified !== undefined ? { verified: patch.verified } : {}),
      ...(patch.center_lat !== undefined ? { center_lat: patch.center_lat } : {}),
      ...(patch.center_lng !== undefined ? { center_lng: patch.center_lng } : {}),
      ...(patch.radius_meters !== undefined ? { radius_meters: patch.radius_meters } : {}),
      ...(patch.polygon_geojson !== undefined ? { polygon_geojson: patch.polygon_geojson } : {}),
      ...(patch.geometry_source !== undefined ? { geometry_source: patch.geometry_source } : {}),
      ...(patch.geometry_version !== undefined ? { geometry_version: patch.geometry_version } : {}),
      ...(patch.geometry_verified !== undefined ? { geometry_verified: patch.geometry_verified } : {}),
      ...(patch.geometry_effective_at !== undefined
        ? { geometry_effective_at: candidate.geometry_effective_at }
        : {}),
      updated_at: new Date(),
    })
    .where(eq(cityNeighborhoodsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json({
    ...updated,
    geometry_status: getNeighborhoodGeometryStatus(updated),
  });
});

router.delete("/admin/city-neighborhoods/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.id, id));
  return res.json({ ok: true });
});

export default router;
