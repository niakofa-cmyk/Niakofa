import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  exchangeListingsTable,
  exchangeSparkModerationHistoryTable,
  exchangeSparksTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/authz";
import { adminLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";

const router = Router();

const decisionBody = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
  if (value.decision === "reject" && !value.reason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "A reason is required when rejecting a Spark.",
    });
  }
});

function positiveId(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

router.get("/admin/exchange/sparks/held", requireAuth, requireAdmin(), adminLimiter, async (_req, res) => {
  const held = await db.select({
    id: exchangeSparksTable.id,
    listing_id: exchangeSparksTable.listing_id,
    caption: exchangeSparksTable.caption,
    status: exchangeSparksTable.status,
    moderation_reason: exchangeSparksTable.moderation_reason,
    created_at: exchangeSparksTable.created_at,
    author_user_id: exchangeSparksTable.author_user_id,
    author_name: usersTable.name,
    listing_title: exchangeListingsTable.title,
  }).from(exchangeSparksTable)
    .innerJoin(usersTable, eq(usersTable.id, exchangeSparksTable.author_user_id))
    .innerJoin(exchangeListingsTable, eq(exchangeListingsTable.id, exchangeSparksTable.listing_id))
    .where(eq(exchangeSparksTable.status, "pending"))
    .orderBy(desc(exchangeSparksTable.created_at), desc(exchangeSparksTable.id))
    .limit(100);

  return res.json({
    sparks: held.map((spark) => ({
      ...spark,
      created_at: spark.created_at.toISOString(),
      moderation_reason: spark.moderation_reason ?? moderatePostText(spark.caption ?? "").reason,
    })),
  });
});

router.post("/admin/exchange/sparks/:id/resolve", requireAuth, requireAdmin(), adminLimiter, async (req, res) => {
  const sparkId = positiveId(req.params.id);
  if (!sparkId) return res.status(400).json({ error: "Invalid Spark id." });
  const parsed = decisionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid moderation decision.", details: parsed.error.issues });
  }

  const moderatorId = req.authenticatedUserId!;
  const decision = parsed.data.decision;
  const reason = parsed.data.reason ?? null;
  const nextStatus = decision === "approve" ? "published" : "rejected";

  const result = await db.transaction(async (tx) => {
    const [spark] = await tx.select({
      id: exchangeSparksTable.id,
      status: exchangeSparksTable.status,
    }).from(exchangeSparksTable)
      .where(eq(exchangeSparksTable.id, sparkId))
      .for("update")
      .limit(1);
    if (!spark) return { kind: "not-found" as const };
    if (spark.status !== "pending") return { kind: "already-resolved" as const };

    const now = new Date();
    const [updated] = await tx.update(exchangeSparksTable).set({
      status: nextStatus,
      moderation_reason: decision === "reject" ? reason : null,
      moderation_reviewed_by: moderatorId,
      moderation_reviewed_at: now,
      updated_at: now,
    }).where(and(
      eq(exchangeSparksTable.id, sparkId),
      eq(exchangeSparksTable.status, "pending"),
    )).returning({ id: exchangeSparksTable.id, status: exchangeSparksTable.status });
    if (!updated) return { kind: "already-resolved" as const };

    await tx.insert(exchangeSparkModerationHistoryTable).values({
      spark_id: sparkId,
      moderator_id: moderatorId,
      action: decision,
      previous_status: spark.status,
      next_status: updated.status,
      reason,
    });
    return { kind: "resolved" as const, spark: updated };
  });

  if (result.kind === "not-found") return res.status(404).json({ error: "Exchange Spark not found." });
  if (result.kind === "already-resolved") {
    return res.status(409).json({ error: "This Spark is no longer awaiting moderation." });
  }
  return res.json({ ok: true, spark_id: sparkId, decision, status: result.spark.status });
});

export default router;