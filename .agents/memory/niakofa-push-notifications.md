---
name: Niakofa push notifications
description: Push subscription persistence and geolocation-based delivery architecture
---

## Rule
Push subscriptions must be persisted to the `push_subscriptions` DB table, not an in-memory Map. Use `sendPushToNearbyHelpers(lat, lng, radiusMiles, payload)` for targeted delivery when the request has coordinates.

## Why
The original in-memory Map silently wiped all subscriptions on every server restart/deploy. Geolocation targeting prevents spamming all helpers with requests 50 miles away.

## How to apply
- `artifacts/api-server/src/routes/push.ts` owns all push logic — import `pushSubscriptionsTable`, `usersTable` from `@workspace/db`.
- On subscribe: upsert by endpoint (update if exists, insert if new). On unsubscribe: DELETE from DB.
- `sendPushToNearbyHelpers`: queries `usersTable` for `helper_mode_active = true`, filters by haversine distance, then batch-delivers.
- Emergency/high urgency requests → 15-mile radius, fall back to all helpers if none nearby.
- Medium/low urgency requests → 5-mile radius, no fallback.
- Expired subscriptions (HTTP 410) are auto-deleted from DB on delivery failure.
- VAPID keys must be set as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` env secrets — push silently disabled without them.
