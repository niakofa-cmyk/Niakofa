# Niakofa Feature Roadmap

This file tracks intentional gaps — features that are **architecturally
designed** but not yet implemented. Each section describes the vision,
what already exists, and what work remains.

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
- Admin UI has a **CivicTab** showing the resource directory + suggestions queue
- Rate limiting + moderation on suggestion posts

### What remains (not yet built)
| Capability | Notes |
|---|---|
| Sponsor/org account → request browse | `GET /api/requests?county=true` with org-scoped filter |
| One-click claim by org staff | Variant of the helper `/claim` flow with `claimer_type: "institution"` |
| Institution-to-pool funding | POST `/gov-sponsors/:id/fund` exists; needs front-end in CivicTab |
| Case assignment to staff | New `org_assignments` table; org admins route cases internally |
| Invoicing / PO-based payment | Orgs often pay by invoice, not card — needs a `NET30` payment type |
| County analytics dashboard | Separate read-only view for gov accounts; RBAC via `account_type: "sponsor"` |

### Suggested implementation order
1. Wire `GET /requests` with an `?open_to_sponsors=true` filter (requests that explicitly opted in)
2. Add `sponsor_claimed_by` + `sponsor_claimed_at` columns to `requestsTable`
3. Build CivicTab → "Browse Open Requests" view in the admin/org portal
4. POST `/civic/claims/:requestId` — institution claim endpoint
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
| Tenure tier lookup | Map `help_count` to a tier (e.g. 0–9 = Neighbor, 10–29 = Pillar, 30+ = Anchor) |
| Tier-adjusted floor | `getGuaranteedMinimum` multiplies `FLAT_FLOOR` by tier multiplier |
| Cumulative earnings tracking | New `helper_lifetime_earnings` column (or derived from `paymentTransactions`) |
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
      WHEN help_count >= 75 THEN 'elder'
      WHEN help_count >= 30 THEN 'anchor'
      WHEN help_count >= 10 THEN 'pillar'
      ELSE 'neighbor'
    END
  ) STORED;
```

---

## 3. Multi-modal SMS Onboarding

### What exists
- Push notification infrastructure (web-push + `sendPushToUser`)
- Email via nodemailer (SMTP-based, Railway env vars)

### What remains
- Twilio SMS integration for users without smartphones or push disabled
- SMS OTP for passwordless login (secondary auth path)
- Critical alerts (pledge default, crisis) delivered via SMS as fallback

### Suggested approach
- Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` to Railway env
- New `lib/sms.ts` → `sendSms(to: string, body: string): Promise<void>`
- Gate behind `user.sms_enabled` flag (opt-in, TCPA-compliant)
- Use same `sendAlertEmail` call-sites but add parallel `sendSms` when `sms_enabled`

---

*Last updated: 2026-07-04*
