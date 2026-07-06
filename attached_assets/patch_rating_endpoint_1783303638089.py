#!/usr/bin/env python3
"""
patch_rating_endpoint.py

Implements the dead POST /requests/:id/rate endpoint and adds a trust-score
participation bump on completion.

Background: RatingModal.tsx (frontend) has called POST /api/requests/:id/rate
since it was built, but no such route ever existed in api-server — every real
submission has been hitting a 404. The `ratings` table schema is real and a
test exercises it directly, but nothing in the route layer ever wrote to it.

This patch adds two things to artifacts/api-server/src/routes/requests.ts:

  1. POST /requests/:id/rate
     - requireAuth only (no requireApproved — a banned/suspended user should
       still be able to leave a rating about a past job; it's their opinion,
       not an action that moves money).
     - Only allowed once the request status is "completed" (matches the
       actual status string used by the /complete handler — NOT "complete").
     - The rater's role (requester vs helper) and the ratee are derived
       server-side from request.requester_id / request.helper_id — never
       trusted from the client, matching this file's established pattern
       for every other identity-sensitive field.
     - One rating per (request_id, rater_id), enforced by the existing
       unique constraint on ratingsTable; a duplicate submission returns
       409 with the exact error string the frontend already special-cases
       ("You have already rated this request"), not a generic failure.
     - stars validated 1-5 via zod; review capped at 500 chars, matching
       the frontend's maxLength.

  2. Trust-score participation bump, added next to the existing help_count
     increment in the /complete handler.
     - Fires on every completion, regardless of how any later rating on
       that job turns out — "low-quality jobs still count toward unlocking
       the starting trust score" per the product decision.
     - Capped at 80 (below the 85 threshold trust-tiers.ts requires to
       leave the "member" tier) so participation volume alone can never
       buy tier advancement — only genuinely good ratings can cross that
       line once tier-advancement logic is built to require them.

Usage:
    cd ~/niakofa   # repo root
    python3 patch_rating_endpoint.py

Safe to re-run: each edit checks whether it's already applied and skips it
rather than erroring or double-patching.
"""

import sys
from pathlib import Path

REPO_ROOT = Path.cwd()
TARGET = REPO_ROOT / "artifacts" / "api-server" / "src" / "routes" / "requests.ts"


def apply_patch(text: str, old: str, new: str, label: str) -> tuple[str, bool]:
    if new in text:
        print(f"  [skip] {label} — already applied")
        return text, False
    if old not in text:
        print(f"  [FAIL] {label} — expected old text not found. "
              f"File may have changed since this patch was written; "
              f"apply manually or update the script.")
        return text, False
    count = text.count(old)
    if count != 1:
        print(f"  [FAIL] {label} — old text matched {count} times, expected exactly 1. Skipping to avoid corrupting the file.")
        return text, False
    text = text.replace(old, new)
    print(f"  [ok]   {label}")
    return text, True


def main() -> int:
    if not TARGET.exists():
        print(f"ERROR: {TARGET} not found. Run this script from the repo root (cd ~/niakofa).")
        return 1

    text = TARGET.read_text(encoding="utf-8")
    any_applied = False

    # ── 1. Import zod + ratingsTable ─────────────────────────────────────────
    old_imports = '''import { Router } from "express";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireOwnership, requireAdmin } from "../middlewares/authz";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable, requestHelpersTable, helperAvailabilityTable, userSettingsTable, businessesTable, businessMembersTable, systemSettingsTable, communityPoolLedgerTable } from "@workspace/db";'''
    new_imports = '''import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireApproved } from "../middlewares/auth";
import { requireOwnership, requireAdmin } from "../middlewares/authz";
import { db, requestsTable, usersTable, transactionsTable, stripeAccountsTable, paymentTransactionsTable, requestHelpersTable, helperAvailabilityTable, userSettingsTable, businessesTable, businessMembersTable, systemSettingsTable, communityPoolLedgerTable, ratingsTable } from "@workspace/db";'''
    text, ok = apply_patch(text, old_imports, new_imports, "import zod + ratingsTable")
    any_applied |= ok

    # ── 2. Trust-score participation bump alongside help_count increment ────
    old_help_count = '''  // Increment help_count
  await db.update(usersTable)
    .set({ help_count: sql`${usersTable.help_count} + 1` })
    .where(eq(usersTable.id, helperId));'''
    new_help_count = '''  // Increment help_count
  await db.update(usersTable)
    .set({ help_count: sql`${usersTable.help_count} + 1` })
    .where(eq(usersTable.id, helperId));

  // Trust-score participation bump: +1 per completed job, capped at 80, so
  // sheer participation moves a helper up from the low starting default —
  // regardless of how any later rating on THIS job turns out. Low-quality
  // jobs still count here (that's the point), but this is deliberately
  // separate from tenure-tier ADVANCEMENT (member -> verified -> trusted ->
  // elite -> anchor in trust-tiers.ts), which requires trust_score >= 85 —
  // above this cap — so volume alone can never buy tier advancement, only
  // genuinely good ratings can cross that line.
  await db.update(usersTable)
    .set({ trust_score: sql`LEAST(80, COALESCE(${usersTable.trust_score}, 0) + 1)` })
    .where(eq(usersTable.id, helperId));'''
    text, ok = apply_patch(text, old_help_count, new_help_count, "trust-score participation bump")
    any_applied |= ok

    # ── 3. The rating endpoint itself, inserted right before the retired /tip route ──
    old_anchor = '''

// ── POST /requests/:id/tip — RETIRED (410 Gone) ───────────────────────────────'''
    new_anchor = '''

// ── POST /requests/:id/rate ────────────────────────────────────────────────
// The frontend's RatingModal.tsx has called this endpoint since it was built;
// no route ever existed here, so every real submission was a 404. This closes
// that gap.
//
// - requireAuth only, deliberately no requireApproved: leaving a rating about
//   a past job is an opinion, not a money-moving action, so a suspended or
//   unapproved account should still be able to submit one.
// - Only allowed once the request is "completed" (matches the exact status
//   string the /complete handler above uses).
// - role/ratee are derived server-side from request.requester_id /
//   request.helper_id — never trusted from the client. The frontend's `role`
//   prop is display-copy only ("Rate your helper" vs "Rate the requester")
//   and is never sent in the request body at all.
// - One rating per (request_id, rater_id) is enforced by ratingsTable's
//   existing unique constraint; a duplicate returns the exact error string
//   ("You have already rated this request") the frontend already
//   special-cases to show its "already submitted" state instead of an error.
const RateRequestBody = z.object({
  stars: z.number().int().min(1).max(5),
  review: z.string().max(500).trim().optional(),
});

router.post("/requests/:id/rate", requireAuth, async (req, res) => {
  const pParsed = ClaimRequestParams.safeParse({ id: parseInt(String(req.params.id)) });
  if (!pParsed.success) return res.status(400).json({ error: "Invalid request id" });

  const bParsed = RateRequestBody.safeParse(req.body);
  if (!bParsed.success) {
    return res.status(400).json({ error: "Invalid rating", details: bParsed.error.issues });
  }

  const raterId = req.authenticatedUserId!;
  const requestId = pParsed.data.id;

  const [request] = await db.select().from(requestsTable)
    .where(eq(requestsTable.id, requestId)).limit(1);
  if (!request) return res.status(404).json({ error: "Request not found" });

  if (request.status !== "completed") {
    return res.status(400).json({ error: "You can only rate a request after it's completed" });
  }

  let role: "requester" | "helper";
  let rateeId: number;
  if (request.requester_id === raterId) {
    role = "requester";
    if (!request.helper_id) {
      return res.status(400).json({ error: "This request has no helper to rate yet" });
    }
    rateeId = request.helper_id;
  } else if (request.helper_id === raterId) {
    role = "helper";
    rateeId = request.requester_id;
  } else {
    return res.status(403).json({ error: "You weren't part of this request" });
  }

  try {
    await db.insert(ratingsTable).values({
      request_id: requestId,
      rater_id: raterId,
      ratee_id: rateeId,
      stars: bParsed.data.stars,
      review: bParsed.data.review ?? null,
      role,
    });
  } catch (err: unknown) {
    // Unique constraint violation — this rater already rated this request.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "23505") {
      return res.status(409).json({ error: "You have already rated this request" });
    }
    logger.error({ err, request_id: requestId, rater_id: raterId }, "rating: insert failed");
    return res.status(500).json({ error: "Failed to submit rating" });
  }

  logger.info({ request_id: requestId, rater_id: raterId, ratee_id: rateeId, role, stars: bParsed.data.stars }, "rating: submitted");
  return res.json({ success: true });
});


// ── POST /requests/:id/tip — RETIRED (410 Gone) ───────────────────────────────'''
    text, ok = apply_patch(text, old_anchor, new_anchor, "POST /requests/:id/rate endpoint")
    any_applied |= ok

    TARGET.write_text(text, encoding="utf-8")

    print()
    if any_applied:
        print(f"Done. Wrote changes to {TARGET.relative_to(REPO_ROOT)}")
        print()
        print("Next steps:")
        print("  cd ~/niakofa && pwd")
        print("  git diff artifacts/api-server/src/routes/requests.ts")
        print("  git add -A artifacts/api-server/src/routes/requests.ts")
        print('  git commit -m "fix: implement dead /requests/:id/rate endpoint + trust-score participation bump"')
        print("  git push origin main")
    else:
        print("No changes made (everything already applied or nothing matched — see [FAIL]/[skip] lines above).")

    return 0


if __name__ == "__main__":
    sys.exit(main())
