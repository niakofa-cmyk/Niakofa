# Niakofa Feature Roadmap

This file tracks the strategic gap map — features that are **architecturally
designed** but not yet implemented, plus features recently completed. Each
section describes the vision, what already exists, and what work remains.

---

## ✅ COMPLETED: Dispute Resolution

**Status: Implemented** (migration 0043, `routes/disputes.ts`, admin DisputesTab)

### What was built
- `disputes` table: `opened_by`, `against_user`, `reason`, `details`, `status` lifecycle
- `POST /requests/:id/dispute` — requester or helper files a dispute after a request starts
- `GET /requests/:id/dispute` — user can check their own dispute status
- `GET /admin/disputes?status=open|under_review|resolved|dismissed|all`
- `PATCH /admin/disputes/:id/status` — admin moves: open → under_review → resolved | dismissed
- **Admin DisputesTab** with filter pills, expandable detail, resolution textarea, action buttons
- Push notification to the disputing party on resolution

### Unique constraints enforced
- One active dispute per user per request (partial unique index: `status IN ('open', 'under_review')`)
- Disputes can only be filed on non-open requests (must be at least claimed)
- Terminal states (`resolved`, `dismissed`) cannot be re-opened via API

---

## ✅ COMPLETED: Category Taxonomy Expansion

**Status: Implemented** — broader "almost any legal task" marketplace

### What was added
Six new categories now appear in the request-creation UI:
| Category | Label | Notes |
|---|---|---|
| `legal_aid` | ⚖️ Legal Aid | Help navigating paperwork, court dates, legal processes |
| `financial_coaching` | 💰 Financial Help | Budgeting, benefits applications, financial literacy |
| `job_assistance` | 👔 Job Search Help | Resume, interview prep, job search support |
| `language_help` | 🌐 Translation/Interpretation | Language access for community members |
| `mental_health_peer` | 💜 Peer Support | Non-clinical peer emotional support |
| `technology_help` | 📱 Technology Help | Device setup, internet literacy, app help |

These are **not** gated by the sensitivity/waiver system (no medical/legal liability exposure from the platform's perspective). If a future legal review determines `legal_aid` creates liability, add it to `WAIVER_GATED_CATEGORIES` and `SENSITIVE_CATEGORIES`.

---

## 1. Civic Portal — Full Request/Accept/Pay Integration

### Vision
County agencies, nonprofits, and social-service orgs can **browse live
requests on the Niakofa map**, accept individual cases, dispatch their
own staff, and pay helpers (or the pool) directly from their dashboard.
This turns Niakofa into a two-sided civic marketplace: community
members post needs, institutions respond at scale.

### What exists today
- `routes/civic.ts` — resource-directory endpoints:
  - `GET /civic/resources` — browse county service listings
  - `POST /civic/suggestions` — community can suggest a resource
  - `GET /civic/neighborhoods` — neighborhood coverage view
  - `GET /civic/region-crisis` — active crisis map for admins
- `routes/gov-sponsors.ts` — county/government funding flow:
  - `POST /gov-sponsors` — submit application (entity_name, county, state, contact)
  - `PATCH /admin/gov-sponsors/:id/approve` — admin approve/reject
  - `POST /gov-sponsors/:id/fund` — record contribution → backfills pool → WS broadcast
- Admin UI has a **CivicTab** (resource directory + suggestions queue) and **OrgsTab** (gov-sponsor management)
- Rate limiting + moderation on suggestion posts

### What remains (not yet built)
| Capability | Notes |
|---|---|
| Sponsor/org account → request browse | `GET /api/requests?county=true` with org-scoped filter |
| One-click claim by org staff | Variant of the helper `/claim` flow with `claimer_type: "institution"` |
| Case assignment to staff | New `org_assignments` table; org admins route cases internally |
| Invoicing / PO-based payment | Orgs often pay by invoice, not card — needs a `NET30` payment type |
| County analytics dashboard | Separate read-only view for gov accounts; RBAC via `account_type: "sponsor"` |
| County-as-requester | Gov sponsors can currently only PUT MONEY IN; they cannot post service requests |

### Suggested implementation order
1. Wire `GET /requests` with an `?open_to_sponsors=true` filter
2. Add `sponsor_claimed_by` + `sponsor_claimed_at` columns to `requestsTable`
3. Build CivicTab → "Browse Open Requests" view in the admin/org portal
4. `POST /civic/claims/:requestId` — institution claim endpoint
5. Invoicing flow (separate milestone — needs billing team input)

---

## 2. Livable Wage Over Time — Tenure-Based Earnings Floor — ✅ BUILT

### Vision
The guaranteed minimum is a **per-job floor** (`getGuaranteedMinimum`), scaling
by estimated hours. Niakofa rewards helper tenure/trust on top of that: a
helper with a higher trust tier gets a progressively higher earnings floor
than a first-time helper. This keeps experienced, reliable helpers
economically loyal to the platform and aligns with the mutual-aid value of
"the more you give, the more the community invests in you."

### Status: implemented (2026)
This shipped under the **trust-tier** system, not a separate raw `help_count`
tier ladder as originally sketched below — trust tier already blends
`help_count` with rating-quality gates (see `lib/trust-tiers`), so it was the
more complete signal to drive wages off, and there's no second tier system to
keep in sync.

- **Tier lookup**: `getTrustTier(trustScore, helpCount)` in
  `lib/trust-tiers/src/index.ts` — five tiers, lowest → highest:
  `member → verified → trusted → elite → anchor`. `trusted`/`elite`/`anchor`
  are additionally quality-gated (avg recent rating ≥ 4.0); tier is sticky
  (`getEffectiveTier` — a helper's tier can only go up, never down, via the
  stored `highest_tier_reached` column).
- **Tier-adjusted floor**: `TIER_WAGE_MULTIPLIER` (member 1.00 → anchor 1.20)
  applied by `getGuaranteedMinimum(estimatedHours?, helperId?)` in
  `artifacts/api-server/src/lib/community-pool.ts` — floor =
  `max(flatFloor, hours × rate) × tierMultiplier`, with flat floor and hourly
  rate both admin-configurable via `system_settings` (with a per-community
  override), not hardcoded constants.
- **Hub-leadership bonus**: `getHubLeadershipTrustBonus()` gives approved,
  active hub leaders an additional trust-score bump — a hub leader is a
  meaningful accountability signal on top of raw job count.
- **Milestone badges**: `TrustTierBadge` UI component (shared thresholds via
  `lib/trust-tiers`, no client/server duplication).

### Deliberately not built (still open)
| Capability | Notes |
|---|---|
| Admin tier override | Admin cannot yet manually promote a helper outside the trust-score/help-count formula, to recognize exceptional service the algorithm misses |
| Cumulative lifetime-earnings dashboard | Derivable today from `paymentTransactions`, but no dedicated helper-facing view exists yet |

---

## 3. Helper Reliability Scoring

### Vision
Beyond `trust_score` (a helper reputation ladder driven by ratings + help_count),
Niakofa needs a **reliability dimension**: did the helper show up? On time?
Did they cancel at the last minute? This is distinct from quality (trust_score)
and is critical for high-stakes requests (childcare, medical, senior_care).

### What exists today
- `trust_score` (0–100, rating-driven) — quality signal ✅
- `help_count` — completed jobs ✅
- Cancel tracking exists in requests (via `cancelled_at`, `status = 'cancelled'`) — data is there
- No aggregation or exposed score for: cancellation rate, on-time arrival, no-show count

### What remains (not yet built)
| Capability | Notes |
|---|---|
| Cancellation rate | `COUNT(status='cancelled' AND helper_id=X) / COUNT(helper_id=X)` |
| On-time arrival score | `AVG(arrived_at - claimed_at)` vs expected travel time |
| No-show detection | Claimed + never arrived within threshold window → no_show event |
| Reliability composite | Weighted: 60% cancellation rate + 40% on-time arrival |
| Admin visibility | Surface reliability score in helper profile card in admin |
| Requester visibility | Show helper reliability badge in claim notification + request detail |

### Suggested implementation
```ts
// Reliability tier (separate from trust_score tier):
type ReliabilityTier = "new" | "reliable" | "highly_reliable" | "exceptional";

// Compute from existing data — no migration needed for v1:
async function getHelperReliabilityScore(helperId: number): Promise<{ score: number; tier: ReliabilityTier }> {
  const [row] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'cancelled' AND cancellation_reason = 'helper_cancel') AS cancels,
      COUNT(*) FILTER (WHERE status = 'completed') AS completions,
      AVG(EXTRACT(EPOCH FROM (arrived_at - claimed_at)) / 60)
        FILTER (WHERE arrived_at IS NOT NULL AND claimed_at IS NOT NULL) AS avg_arrival_min
    FROM help_requests WHERE helper_id = ${helperId}
  `);
  // ...compute composite score
}
```

---

## 4. Community Pool Runway Metric

### Vision
Admins and community members should be able to see how many guaranteed-minimum
payouts the pool can sustain at current balance, and get an early warning
when the pool approaches depletion.

### What exists today
- Pool balance is tracked in real-time via `communityPoolLedgerTable`
- `GET /admin/pool-settings` returns current pool configuration
- Admin UI (PledgesTab) already shows pool balance, runway days, and pending minimums count
  - Lines 439–451 in admin.tsx: `runwayColor` calculation visible to admins

### What remains (not yet built)
| Capability | Notes |
|---|---|
| Public runway indicator | Show a soft warning to users when pool runway < 7 days |
| Automated low-pool alert | Push to admins when `pool_balance < threshold` (trigger: after every payout) |
| Gov-sponsor backfill prompt | When pool is low, prompt eligible gov sponsors in admin dashboard |
| Pool health in status page | `/status` page already exists — add pool runway as a public metric |

### Notes
- The pool alert push is partially implemented in `routes/pool.ts` (warns when `balance < 25`)
- Adding the runway to the `/status` page requires no schema changes — just compute from ledger

---

## 5. SMS Multi-Modal Onboarding

### Vision
Not every community member has a smartphone with the app installed. A text-message
(SMS) onboarding flow lets Niakofa reach low-tech users: they text a number,
get connected to Nia by SMS, and can post a basic request or find food/shelter
without ever installing an app.

### What exists today
- Twilio is installed (`twilio` package in dependencies)
- `routes/nia-voice.ts` — voice TTS via ElevenLabs/OpenAI
- `routes/nia-proxy.ts` — Nia chat via SSE (app only)

### What remains (not yet built)
| Capability | Notes |
|---|---|
| Twilio webhook endpoint | `POST /sms/inbound` — receives texts, routes to Nia |
| Session state by phone | Map phone number to Nia session (Redis or DB table) |
| Simplified Nia SMS prompt | Shorter system prompt tuned for 160-char responses |
| Request posting via SMS | Nia asks location, category, description; creates DB record |
| Opt-in/opt-out handling | Standard STOP/HELP keywords per TCPA |

---

## Closed / Tracked Gaps (now done)
| Gap | Resolution |
|---|---|
| Pledge auto-default duplicate worker | Removed Step 6 from pledge-worker.ts; scheduler.ts is sole owner |
| Dispute resolution missing | **Implemented** — see section 1 above |
| Category taxonomy (mutual-aid only) | **Expanded** — 6 new categories covering legal, financial, job, language, peer support, tech |
| PR #1 auth/mailer/rate-limit fix | Applied in audit-fix session |
| Nia orb draggable with wake word | **Implemented** — NiaDrawer enhanced with full-viewport drag + wake word indicator |
| analyze-image orphaned endpoint | Confirmed removed — no backend route exists |
