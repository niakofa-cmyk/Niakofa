---
name: Niakofa vision enhancements
description: 6-chunk upgrade from the vision/mission doc — Nia AI, dispatch, anomaly, SMS, UI language
---

## Nia 24h Follow-up Check-in Worker
> **STALE as of niakofa-checkin-dedup-fix.md**: the file/function described
> below (`workers/checkin-worker.ts`, `getCompletedRequestsForCheckin()`) was
> a duplicate scheduler racing against api-server's `nia-checkin-worker.ts`
> and has been deleted. See `niakofa-checkin-dedup-fix.md` for the real,
> current single-scheduler architecture. Left here for history, not as a
> guide to current code.
- New file: `artifacts/nia-service/src/workers/checkin-worker.ts`
- New DB function: `getCompletedRequestsForCheckin()` in `artifacts/nia-service/src/lib/db.ts`
- Queries `help_requests` completed 23–25h ago where no `[check-in:<id>]` row exists in `nia_conversations`
- Uses `claude-haiku-4-5-20251001` for efficiency (background task, short message)
- Starts with 5-min startup delay to avoid racing DB migrations
- Wired in `artifacts/nia-service/src/index.ts` inside the `app.listen` callback

**Why:** "She'll follow up 24 hours later like a neighbor who actually remembered." — literal vision doc requirement.

## AI-Powered Dispatch Scoring
- Enhanced `computeMatchScore` in `artifacts/api-server/src/lib/matching.ts` to accept a `DispatchSignals` object with:
  - `trustScore` — up to +15 bonus (75+=pillar, 55+=reliable, 40+=building)
  - `activeWorkload` — -4 penalty per active request above 1
  - `reliabilityRatio` — up to +10 bonus (approximated as trustScore/100 for now)
- `helpers.ts` auto-assign route fetches active workload per helper in a single query before scoring
- All new params are optional — backward compatible

## Advanced Anomaly Detection
- `anomaly-worker.ts` now detects two new patterns:
  1. **Rating velocity spike**: 3+ one-star ratings in 24h window → `rating_velocity_spike` admin alert
  2. **No-show stall**: helper in `claimed` status for >30 min with no `en_route` update → `no_show_stall` alert
- Both use the `lastAlertedAt` map with offset keys to avoid collision with existing low-trust entries
- Both wrapped in try/catch — safe in dev where tables may not exist

## SMS Multi-Modal Notifications
- `artifacts/api-server/src/lib/sms.ts` enhanced with `sendAdminSmsAlert()` and `sendSosPanicContacts()`
- Emergency requests now:
  1. SMS admin (ADMIN_SMS_NUMBER env var) with request title + neighborhood
  2. SMS requester's panic_contacts array with a "check on them" message
- Twilio env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`

## NiaDrawer Language (Ubuntu/Sankofa)
- Added "Ubuntu — I am because we are." to WELCOME_PHRASES
- New quick prompts: "Become a helper", "Payment question", "Need translation"
- Renamed "Want to help" → "Become a helper" with helper onboarding intent
