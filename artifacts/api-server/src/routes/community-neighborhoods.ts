import { Router } from "express";
import { z } from "zod";
import { db, cityNeighborhoodsTable, neighborhoodBoundaryImportsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { requestNia } from "../lib/nia-client";
import { getNeighborhoodGeometryStatus, validateNeighborhoodGeometry } from "../lib/neighborhoodGeofence";

const router = Router();

const sourceKinds = [
  "municipal_gis", "county_gis", "state_gis", "regional_gis",
  "osm_reviewed", "niakofa_curated", "generated_hint",
] as const;
const authorityLevels = ["authoritative", "curated", "generated"] as const;
type NeighborhoodSourceKind = typeof sourceKinds[number];
type NeighborhoodAuthority = typeof authorityLevels[number];

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
  source_publisher: z.string().trim().min(1).max(200).nullable().optional(),
  source_url: z.string().url().max(1000).nullable().optional(),
  source_license: z.string().trim().min(1).max(200).nullable().optional(),
  source_retrieved_at: z.string().datetime({ offset: true }).nullable().optional(),
  source_version: z.string().trim().min(1).max(100).nullable().optional(),
  source_kind: z.enum(sourceKinds).optional(),
  authority_level: z.enum(authorityLevels).optional(),
}).strict();

const BoundaryReviewBody = z.object({
  reviewed: z.boolean(),
  review_note: z.string().trim().max(1000).nullable().optional(),
  geometry_verified: z.boolean().default(false),
}).strict();

export function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const MAX_CITY_LEN = 100;

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

export async function ensureNeighborhoodsForCity(cityRaw: string, cityKey: string) {
  const existing = await db.select().from(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.city_key, cityKey));
  if (existing.length > 0) return existing;

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

    const inserted = await db.insert(cityNeighborhoodsTable)
      .values(generated.map(n => ({
        city_key: cityKey,
        city_display: cityRaw,
        neighborhood_id: n.id,
        name: stripTags(n.name).slice(0, 120),
        emoji: stripTags(n.emoji).slice(0, 10),
        description: stripTags(n.description).slice(0, 500),
        source: "generated" as const,
        verified: false,
        source_kind: "generated_hint" as NeighborhoodSourceKind,
        authority_level: "generated" as NeighborhoodAuthority,
      })))
      .onConflictDoNothing()
      .returning();

    logger.info({ city: cityRaw, count: inserted.length }, "community/neighborhoods: generated discovery list and cached");
    return inserted;
  } catch (err) {
    logger.error({ err, city: cityRaw }, "community/neighborhoods: generation failed");
    return [];
  }
}

router.get("/community/neighborhoods", requireAuth, async (req, res) => {
  const cityRaw = (req.query.city as string | undefined)?.trim();
  if (!cityRaw) return res.json({ neighborhoods: [], city: null });
  if (cityRaw.length > MAX_CITY_LEN) return res.status(400).json({ error: "city name too long" });
  const cityKey = normalizeCityKey(cityRaw);
  if (!cityKey) return res.json({ neighborhoods: [], city: null });
  const neighborhoods = await ensureNeighborhoodsForCity(cityRaw, cityKey);
  return res.json({ neighborhoods: neighborhoods.map((n) => ({ ...n, geometry_status: getNeighborhoodGeometryStatus(n) })), city: cityRaw });
});

router.get("/admin/city-neighborhoods", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const verifiedParam = req.query.verified as string | undefined;
  const rows = verifiedParam !== undefined
    ? await db.select().from(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.verified, verifiedParam === "true"))
    : await db.select().from(cityNeighborhoodsTable);
  return res.json(rows.map((row) => ({ ...row, geometry_status: getNeighborhoodGeometryStatus(row) })));
});

router.get("/admin/neighborhood-boundary-imports", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const cityKey = typeof req.query.city_key === "string" ? req.query.city_key : undefined;
  const rows = cityKey
    ? await db.select().from(neighborhoodBoundaryImportsTable).where(eq(neighborhoodBoundaryImportsTable.city_key, cityKey))
    : await db.select().from(neighborhoodBoundaryImportsTable);
  return res.json(rows);
});

router.patch("/admin/neighborhood-boundary-imports/:id/review", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = Number.parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid id" });
  const parsed = BoundaryReviewBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid boundary review", details: parsed.error.issues });

  const [current] = await db.select().from(neighborhoodBoundaryImportsTable).where(eq(neighborhoodBoundaryImportsTable.id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "Boundary import not found" });
  if (parsed.data.geometry_verified && (!parsed.data.reviewed || !current.geometry_valid)) {
    return res.status(400).json({ error: "A boundary must be geometry-valid and reviewed before verification." });
  }
  if (parsed.data.geometry_verified && (current.source_kind === "generated_hint" || current.authority_level === "generated")) {
    return res.status(400).json({ error: "Generated neighborhood hints cannot become GPS-verified boundaries." });
  }

  const [updated] = await db.update(neighborhoodBoundaryImportsTable).set({
    reviewed: parsed.data.reviewed,
    review_note: parsed.data.review_note ?? current.review_note,
    geometry_verified: parsed.data.geometry_verified,
    rejection_reason: parsed.data.reviewed ? null : current.rejection_reason,
    updated_at: new Date(),
  }).where(eq(neighborhoodBoundaryImportsTable.id, id)).returning();
  return res.json(updated);
});

router.post("/admin/neighborhood-boundary-imports/:id/promote", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = Number.parseInt(req.params.id as string, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Invalid id" });
  const [candidate] = await db.select().from(neighborhoodBoundaryImportsTable).where(eq(neighborhoodBoundaryImportsTable.id, id)).limit(1);
  if (!candidate) return res.status(404).json({ error: "Boundary import not found" });
  if (!candidate.reviewed || !candidate.geometry_valid || !candidate.geometry_verified) {
    return res.status(409).json({ error: "Boundary must be reviewed, geometry-valid, and explicitly verified before promotion." });
  }
  if (candidate.source_kind === "generated_hint" || candidate.authority_level === "generated") {
    return res.status(400).json({ error: "Generated neighborhood hints cannot be promoted to GPS-verified boundaries." });
  }

  const [promoted] = await db.insert(cityNeighborhoodsTable).values({
    city_key: candidate.city_key,
    city_display: candidate.city_display,
    neighborhood_id: candidate.neighborhood_id,
    name: candidate.name,
    emoji: "📍",
    description: `${candidate.name} — verified from ${candidate.source_publisher}.`,
    source: "authoritative_import",
    verified: true,
    center_lat: candidate.center_lat,
    center_lng: candidate.center_lng,
    radius_meters: candidate.radius_meters,
    polygon_geojson: candidate.polygon_geojson,
    geometry_source: candidate.source_dataset,
    geometry_version: candidate.source_version,
    geometry_verified: true,
    geometry_effective_at: candidate.source_retrieved_at,
    source_publisher: candidate.source_publisher,
    source_url: candidate.source_url,
    source_license: candidate.source_license,
    source_retrieved_at: candidate.source_retrieved_at,
    source_version: candidate.source_version,
    source_kind: candidate.source_kind,
    authority_level: candidate.authority_level,
    updated_at: new Date(),
  }).onConflictDoUpdate({
    target: [cityNeighborhoodsTable.city_key, cityNeighborhoodsTable.neighborhood_id],
    set: {
      name: candidate.name,
      polygon_geojson: candidate.polygon_geojson,
      center_lat: candidate.center_lat,
      center_lng: candidate.center_lng,
      geometry_source: candidate.source_dataset,
      geometry_version: candidate.source_version,
      geometry_verified: true,
      geometry_effective_at: candidate.source_retrieved_at,
      source_publisher: candidate.source_publisher,
      source_url: candidate.source_url,
      source_license: candidate.source_license,
      source_retrieved_at: candidate.source_retrieved_at,
      source_version: candidate.source_version,
      source_kind: candidate.source_kind,
      authority_level: candidate.authority_level,
      verified: true,
      updated_at: new Date(),
    },
  }).returning();

  return res.json({ promoted: true, neighborhood: promoted });
});

router.patch("/admin/city-neighborhoods/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = NeighborhoodAdminPatchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid neighborhood update", details: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });

  const [current] = await db.select().from(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.id, id)).limit(1);
  if (!current) return res.status(404).json({ error: "Not found" });
  const patch = parsed.data;
  const candidate = {
    ...current,
    ...patch,
    geometry_effective_at: patch.geometry_effective_at === undefined ? current.geometry_effective_at : patch.geometry_effective_at ? new Date(patch.geometry_effective_at) : null,
    source_retrieved_at: patch.source_retrieved_at === undefined ? current.source_retrieved_at : patch.source_retrieved_at ? new Date(patch.source_retrieved_at) : null,
  };
  const hasGeometryPatch = patch.center_lat !== undefined || patch.center_lng !== undefined || patch.radius_meters !== undefined || patch.polygon_geojson !== undefined;
  const geometryError = validateNeighborhoodGeometry(candidate);
  if (hasGeometryPatch && geometryError) return res.status(400).json({ error: geometryError });
  if (candidate.geometry_verified) {
    if (!candidate.geometry_source || !candidate.geometry_version || !candidate.geometry_effective_at) return res.status(400).json({ error: "Verified geometry requires source, version, and effective date." });
    if (!candidate.source_publisher || !candidate.source_url || !candidate.source_retrieved_at) return res.status(400).json({ error: "Verified geometry requires source publisher, URL, and retrieval timestamp." });
    if (candidate.source_kind === "generated_hint" || candidate.authority_level === "generated") return res.status(400).json({ error: "Generated neighborhood hints cannot become GPS-verified host boundaries." });
    if (geometryError) return res.status(400).json({ error: geometryError });
  }

  const [updated] = await db.update(cityNeighborhoodsTable).set({
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
    ...(patch.geometry_effective_at !== undefined ? { geometry_effective_at: candidate.geometry_effective_at } : {}),
    ...(patch.source_publisher !== undefined ? { source_publisher: patch.source_publisher } : {}),
    ...(patch.source_url !== undefined ? { source_url: patch.source_url } : {}),
    ...(patch.source_license !== undefined ? { source_license: patch.source_license } : {}),
    ...(patch.source_retrieved_at !== undefined ? { source_retrieved_at: candidate.source_retrieved_at } : {}),
    ...(patch.source_version !== undefined ? { source_version: patch.source_version } : {}),
    ...(patch.source_kind !== undefined ? { source_kind: patch.source_kind } : {}),
    ...(patch.authority_level !== undefined ? { authority_level: patch.authority_level } : {}),
    updated_at: new Date(),
  }).where(eq(cityNeighborhoodsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json({ ...updated, geometry_status: getNeighborhoodGeometryStatus(updated) });
});

router.delete("/admin/city-neighborhoods/:id", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.id, id));
  return res.json({ ok: true });
});

export default router;
