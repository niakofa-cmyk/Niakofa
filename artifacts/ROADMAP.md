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

## 2. Livable Wage Over Time — Tenure-Based Earnings Floor

### Vision
The guaranteed minimum today is a **per-job floor** (`getGuaranteedMinimum`),
scaling by estimated hours. Long-term, Niakofa should reward helper tenure:
someone who has helped 50 families gets a progressively higher earnings
floor than someone on their first job. This keeps experienced helpers
economically loyal to the platform and aligns with the mutual-aid value
of "the more you give, the more the community invests in you."

### What exists today
- `getGuaranteedMinimum(estimatedHours?)` in `routes/requests.ts`:
  - Floor = `max(FLAT_FLOOR, hours × HOURLY_RATE)` — per-job, flat
  - Currently: `FLAT_FLOOR = 15`, `HOURLY_RATE = 18`
- `help_count` column on `usersTable` — incremented on every completed job ✅
- `trust_score` and `goodwill_score` columns — existing engagement metrics

### What remains (not yet built)
| Capability | Notes |
|---|---|
| Tenure tier lookup | Map `help_count` to a tier (0–9 = Neighbor, 10–29 = Pillar, 30+ = Anchor) |
| Tier-adjusted floor | `getGuaranteedMinimum` multiplies `FLAT_FLOOR` by tier multiplier |
| Cumulative earnings tracking | Derived from `paymentTransactions` (no new column needed) |
| Milestone badges + notifications | Push notification when helper crosses a tier boundary |
| Admin tier override | Admin can manually promote a helper to recognize exceptional service |

### Suggested implementation
```ts
// Proposed tiers (all values configurable via admin system settings):
const TIERS = [
  { minJobs:  0, label: "Neighbor", floorMultiplier: 1.00 },
  { minJobs: 10, label: "Pillar",   floorMultiplier: 1.15 },
  { minJobs: 30, label: "Anchor",   floorMultiplier: 1.30 },
  { minJobs: 75, label: "Elder",    floorMultiplier: 1.50 },
];

function getHelperTier(helpCount: number) {
  return [...TIERS].reverse().find(t => helpCount >= t.minJobs) ?? TIERS[0];
}

// Extend getGuaranteedMinimum:
export function getGuaranteedMinimum(estimatedHours?: number, helpCount = 0): number {
  const tier = getHelperTier(helpCount);
  const base = Math.max(FLAT_FLOOR, (estimatedHours ?? 1) * HOURLY_RATE);
  return parseFloat((base * tier.floorMultiplier).toFixed(2));
}
```

### Migration needed
```sql
-- No schema change required if using existing help_count column.
-- Optional: add helper_tier as a denormalized computed column for fast reads.
ALTER TABLE users ADD COLUMN IF NOT EXISTS helper_tier TEXT
  GENERATED ALWAYS AS (
    CASE
      WHEN help_count >= 75 THEN 'Elder'
      WHEN help_count >= 30 THEN 'Anchor'
      WHEN help_count >= 10 THEN 'Pillar'
      ELSE 'Neighbor'
    END
  ) STORED;
```

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
