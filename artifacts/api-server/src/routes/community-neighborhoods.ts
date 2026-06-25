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
import { db, cityNeighborhoodsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { logger } from "../lib/logger";

const router = Router();

const NIA_SERVICE_URL = process.env["NIA_SERVICE_URL"] ?? "https://niakofa-production.up.railway.app";
const INTERNAL_SECRET = process.env["INTERNAL_SECRET"] ?? process.env["SESSION_SECRET"];

function normalizeCityKey(city: string): string {
  return city.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

// BUG-4-H01: Hard cap on city string length — oversized payloads forwarded to
// nia-service's /generate-neighborhoods could cause OOM/DoS and excessive
// Claude token usage. 100 chars is more than enough for any real city name.
const MAX_CITY_LEN = 100;

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

  const existing = await db
    .select()
    .from(cityNeighborhoodsTable)
    .where(eq(cityNeighborhoodsTable.city_key, cityKey));

  if (existing.length > 0) {
    return res.json({ neighborhoods: existing, city: cityRaw });
  }

  // Cache miss — generate via nia-service, store as unverified, return.
  if (!INTERNAL_SECRET) {
    logger.warn("community/neighborhoods: SESSION_SECRET not set — cannot call nia-service generator");
    return res.json({ neighborhoods: [], city: cityRaw });
  }

  try {
    const genRes = await fetch(`${NIA_SERVICE_URL}/generate-neighborhoods`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
      body: JSON.stringify({ city: cityRaw }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!genRes.ok) {
      logger.warn({ status: genRes.status, city: cityRaw }, "community/neighborhoods: generation request failed");
      return res.json({ neighborhoods: [], city: cityRaw });
    }

    const data = await genRes.json() as { neighborhoods?: Array<{ id: string; name: string; emoji: string; description: string }> };
    const generated = data.neighborhoods ?? [];
    if (generated.length === 0) {
      return res.json({ neighborhoods: [], city: cityRaw });
    }

    // BUG-4-M03: Strip any HTML/script tags from LLM-generated neighborhood
    // names/descriptions before storing. If admin views are rendered raw, a
    // malicious or hallucinated name like "<script>..." would be a stored XSS vector.
    function stripTags(s: string): string {
      return s.replace(/<[^>]*>/g, "").trim();
    }

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
    return res.json({ neighborhoods: inserted, city: cityRaw });
  } catch (err) {
    logger.error({ err, city: cityRaw }, "community/neighborhoods: generation failed");
    return res.json({ neighborhoods: [], city: cityRaw });
  }
});

// ── Admin review ────────────────────────────────────────────────────────────

router.get("/admin/city-neighborhoods", requireAuth, requireAdmin(), async (req, res) => {
  const verifiedParam = req.query.verified as string | undefined;
  const rows = verifiedParam !== undefined
    ? await db.select().from(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.verified, verifiedParam === "true"))
    : await db.select().from(cityNeighborhoodsTable);
  return res.json(rows);
});

router.patch("/admin/city-neighborhoods/:id", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { name, emoji, description, verified } = req.body as {
    name?: string; emoji?: string; description?: string; verified?: boolean;
  };

  const [updated] = await db.update(cityNeighborhoodsTable)
    .set({
      ...(name !== undefined ? { name } : {}),
      ...(emoji !== undefined ? { emoji } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(verified !== undefined ? { verified } : {}),
      updated_at: new Date(),
    })
    .where(eq(cityNeighborhoodsTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

router.delete("/admin/city-neighborhoods/:id", requireAuth, requireAdmin(), async (req, res) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  await db.delete(cityNeighborhoodsTable).where(eq(cityNeighborhoodsTable.id, id));
  return res.json({ ok: true });
});

export default router;
