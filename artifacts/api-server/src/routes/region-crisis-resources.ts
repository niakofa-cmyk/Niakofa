import { Router } from "express";
import { db, regionCrisisResourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { logger } from "../lib/logger";

const router = Router();

// Safe national (US) fallback shown whenever a region has no VERIFIED local
// resources yet. Never an LLM guess — these are correct nationwide.
const NATIONAL_FALLBACK = [
  { label: "Emergency (Police/Fire/Medical)", phone: "911" },
  { label: "United Way 211 (local resources)", phone: "211" },
  { label: "SAMHSA National Helpline", phone: "1-800-662-4357" },
  { label: "988 Suicide & Crisis Lifeline", phone: "988" },
];

function normalizeRegionKey(region: string): string {
  return region.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

type Resource = { label: string; phone?: string; url?: string };

function parseResources(raw: string): Resource[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}


const NIA_SERVICE_URL = process.env["NIA_SERVICE_URL"] ?? "https://niakofa-production.up.railway.app";
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? process.env.SESSION_SECRET;

// Admin: ask Nia to suggest crisis resources for a pending region
router.post("/admin/region-crisis-resources/:id/suggest", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [region] = await db.select().from(regionCrisisResourcesTable).where(eq(regionCrisisResourcesTable.id, id));
  if (!region) return res.status(404).json({ error: "Region not found" });

  if (!INTERNAL_SECRET) return res.status(503).json({ error: "Internal secret not configured" });

  try {
    const niaRes = await fetch(`${NIA_SERVICE_URL}/suggest-crisis-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
      body: JSON.stringify({ region: region.region_display }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!niaRes.ok) {
      logger.warn({ status: niaRes.status, region: region.region_display }, "crisis suggest: nia-service error");
      return res.status(502).json({ error: "Nia suggestion failed" });
    }

    const data = await niaRes.json() as { resources: Array<{ label: string; phone?: string; url?: string }>; note: string };
    logger.info({ region: region.region_display, count: data.resources.length }, "crisis suggest: got suggestions from Nia");
    return res.json({ resources: data.resources, note: data.note });
  } catch (err) {
    logger.error({ err, region: region.region_display }, "crisis suggest: fetch failed");
    return res.status(502).json({ error: "Nia suggestion failed" });
  }
});

router.get("/crisis/resources", requireAuth, async (req, res) => {
  const regionRaw = (req.query.region as string | undefined)?.trim();
  if (!regionRaw) {
    return res.json({ region: null, verified: false, resources: NATIONAL_FALLBACK });
  }
  const regionKey = normalizeRegionKey(regionRaw);
  if (!regionKey) {
    return res.json({ region: null, verified: false, resources: NATIONAL_FALLBACK });
  }

  try {
    const [existing] = await db
      .select()
      .from(regionCrisisResourcesTable)
      .where(eq(regionCrisisResourcesTable.region_key, regionKey));

    if (existing && existing.verified) {
      return res.json({
        region: existing.region_display,
        verified: true,
        resources: parseResources(existing.resources),
      });
    }

    if (!existing) {
      const stateMatch = regionRaw.match(/,\s*([A-Za-z]{2})\s*$/);
      const stateCode = stateMatch ? stateMatch[1].toUpperCase() : null;
      await db
        .insert(regionCrisisResourcesTable)
        .values({
          region_key: regionKey,
          region_display: regionRaw,
          state_code: stateCode,
          country_code: "US",
          resources: "[]",
          verified: false,
        })
        .onConflictDoNothing();
      logger.info({ region: regionRaw }, "crisis/resources: new region queued for admin verification");
    }

    return res.json({ region: regionRaw, verified: false, resources: NATIONAL_FALLBACK });
  } catch (err) {
    logger.error({ err, region: regionRaw }, "crisis/resources: lookup failed");
    return res.json({ region: regionRaw, verified: false, resources: NATIONAL_FALLBACK });
  }
});

router.get("/admin/region-crisis-resources", requireAuth, requireAdmin(), async (req, res) => {
  // BUG-4-H08: Add pagination — without LIMIT this endpoint was an unbounded
  // full-table scan. Default page size 50, max 200 to protect against DoS.
  const verifiedParam = req.query.verified as string | undefined;
  const limitRaw = parseInt(req.query.limit as string ?? "50", 10);
  const offsetRaw = parseInt(req.query.offset as string ?? "0", 10);
  const limit = isNaN(limitRaw) || limitRaw < 1 ? 50 : Math.min(limitRaw, 200);
  const offset = isNaN(offsetRaw) || offsetRaw < 0 ? 0 : offsetRaw;

  const rows = verifiedParam !== undefined
    ? await db.select().from(regionCrisisResourcesTable)
        .where(eq(regionCrisisResourcesTable.verified, verifiedParam === "true"))
        .limit(limit).offset(offset)
    : await db.select().from(regionCrisisResourcesTable).limit(limit).offset(offset);
  return res.json(rows.map((r: (typeof rows)[number]) => ({ ...r, resources: parseResources(r.resources) })));
});

router.patch("/admin/region-crisis-resources/:id", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const r = req as typeof req & { authenticatedUserId: number };
  const { region_display, state_code, resources, verified, notes } = req.body as {
    region_display?: string; state_code?: string;
    resources?: Resource[]; verified?: boolean; notes?: string;
  };

  if (resources !== undefined) {
    if (!Array.isArray(resources)) return res.status(400).json({ error: "resources must be an array" });
    for (const item of resources) {
      if (!item || typeof item.label !== "string" || !item.label.trim()) {
        return res.status(400).json({ error: "each resource needs a non-empty label" });
      }
      if (!item.phone && !item.url) {
        return res.status(400).json({ error: `resource "${item.label}" needs a phone or url` });
      }
    }
  }

  const [updated] = await db.update(regionCrisisResourcesTable)
    .set({
      ...(region_display !== undefined ? { region_display } : {}),
      ...(state_code !== undefined ? { state_code } : {}),
      ...(resources !== undefined ? { resources: JSON.stringify(resources) } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(verified !== undefined ? {
        verified,
        verified_by: verified ? r.authenticatedUserId : null,
        verified_at: verified ? new Date() : null,
      } : {}),
      updated_at: new Date(),
    })
    .where(eq(regionCrisisResourcesTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json({ ...updated, resources: parseResources(updated.resources) });
});

router.delete("/admin/region-crisis-resources/:id", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(regionCrisisResourcesTable).where(eq(regionCrisisResourcesTable.id, id));
  return res.json({ ok: true });
});

export default router;
