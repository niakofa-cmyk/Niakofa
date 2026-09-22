---
name: Niakofa daily kindness engine
description: Daily Kindness Engine worker — sends morning push notifications to active helpers showing nearby open requests and projected earnings.
---

# Niakofa Daily Kindness Engine

## Location
`artifacts/api-server/src/workers/daily-kindness-worker.ts` — `startDailyKindnessWorker()`

## Wiring
`index.ts` imports `startDailyKindnessWorker` and calls it alongside other workers.

## Behavior
- Runs every 4 hours (catches morning windows across all timezones)
- Startup delay: 5 min after server boot so push subscriptions are loaded
- Nia kill-switch gated: checks `system_settings.nia_enabled === "true"` — fail-closed
- Fetches active helpers with known lat/lng (max 200)
- Fetches all open requests (max 500)
- Haversine distance filter: 10-mile radius per helper
- Only sends to helpers with ≥1 nearby request
- Projected earnings = sum of `pledge_amount` for immediate-pay nearby requests
- Push body: "Good morning, {name}! ☀️ {N} neighbors need help near you — up to $X available"
- In-memory dedup: `lastSent` Map<userId, YYYY-MM-DD> — one push per helper per day per server restart
- Max 200 pushes per run to protect web-push quota
- Fire-and-forget per helper — never throws

**Why:** Helpers need a morning nudge to stay engaged; without proactive outreach many open requests go unnoticed. 4-hour interval naturally aligns with morning across North America, West Africa, and Europe.
