---
name: Niakofa real-data audit patterns
description: Lessons from auditing frontend pages for fabricated/placeholder data instead of real API-sourced values.
---

- Earnings/financial projections shown to helpers must never use an arbitrary
  hardcoded dollar constant as a fallback. When a helper has no history, fall
  back to a real server-sourced number (e.g. the county/platform guaranteed-
  minimum wage from `system_settings` / `/api/communities/:id`), and label the
  UI clearly as an estimate vs. a personalized average.
  **Why:** helper-dashboard.tsx originally fell back to a bare `$12.50` with
  no basis in any real config when a helper had zero completed tasks.
  **How to apply:** any "projection"/"potential earnings" UI needs a `hasHistory`
  branch — real average when data exists, real-but-generic floor when it doesn't,
  never a magic number invented in the component.

- A component-scoped `[Original story/text]` bracket placeholder can silently
  survive in production code even when the real field (`text_content` on
  `griot_stories`) already exists in the type and API response — it just wasn't
  threaded through the prop chain from the list-fetching parent down to the
  detail sub-panel.
  **Why:** globe.tsx's TranslationReviewPanel rendered a fake bracketed string
  instead of the real recorded story text because the parent component fetched
  `myStories` (which has `text_content`) but the sub-panel only received the
  `StoryTranslation` object (which does not).
  **How to apply:** when auditing for "fake data", grep for bracket-placeholder
  patterns (`[...]`, "Placeholder:", "real app would show") — these are a
  stronger signal of a genuine wiring gap than static config arrays (categories,
  states, skill lists), which are legitimate and not bugs.

- On a fresh/empty dev DB, `community_pool_ledger` legitimately starts at $0.
  Guaranteed-minimum payouts correctly queue via `pool_pending_minimums` and
  backfill later — this is by design (see niakofa-pool-pending.md), not a bug
  to "fix" by seeding a fake balance. Don't inject synthetic ledger entries to
  make demos look funded; use the real Stripe donation/pool-fund path instead.

- `scripts/src/seed-if-empty.ts` (civic resources/farms) and
  `scripts/src/seed-test-accounts.ts` (3 standing accounts) are the two
  scripts to run on any fresh DB import, in addition to migrations — both are
  idempotent/safe to re-run. See niakofa-fresh-import-bootstrap.md.

- Seeded helper/user test accounts MUST have a real lat/lng + community_id
  (Fort Worth: 32.75, -97.33, community_id 1) set in `seed-test-accounts.ts`.
  **Why:** without it, `POST /requests/:id/claim`'s server-side max-travel-
  distance guard rejects every claim attempt with "beyond your max travel
  distance" (helper had a stray/null location thousands of miles from any
  seeded request) — this looked like a "Failed to complete" UI bug but was
  actually "claim silently never succeeded, so complete correctly 404'd."
  **How to apply:** when e2e-testing claim/complete via a Playwright tester,
  also mock browser geolocation (`context.setGeolocation` +
  `grantPermissions(["geolocation"])`) to Fort Worth BEFORE enabling helper
  mode — the app's live GPS-watch broadcast loop (every ~15s while helper
  mode is on) overwrites the seeded DB location with the browser's real/IP
  location otherwise, re-breaking the same claim check mid-test.

- Community-pool "pending guaranteed minimum" payout totals are surfaced via
  `GET /api/pool/stats` (`pending_minimums_count`/`_total`) on the admin
  Community/Overview tab and in a banner on `community.tsx` — NOT on the
  admin System tab (which only shows worker-health/cashout-queue). Don't
  mistake "not on System tab" for "payout tracking is broken."
