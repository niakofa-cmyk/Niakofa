---
name: Niakofa SOS/safety endpoint durable-write pattern + live admin banner
description: Ordering rule for panic-button endpoints (durable write before notify) plus the real-time admin SOS banner that surfaces them.
---
- Any endpoint whose entire purpose is "alert someone that help is needed" must persist its durable record FIRST, before attempting any broadcast/push/SMS notify call — never the other way around.
- Treat notify calls as best-effort: wrap in try/catch, log failures, but never let a notify failure block or invalidate the response.
- If the durable write itself fails, return an explicit error — never respond success when the record didn't actually persist.
- **Why:** a prior version reported success even when both the durable write and the broadcast failed, so a user in danger could believe help was notified when nothing had actually happened.

**Live admin banner:** `POST /requests/:id/safety-sos` broadcasts a `safety_sos` WS event (`safety_ping`/`safety_sos` in `WsEventType` on both server `ws-hub.ts` and client `wsClient.ts` — previously cast `as any`). `AdminLiveBanner.tsx` renders a sticky red banner (Siren icon, participant name/role, "View" → reports tab, dismiss) above the normal yellow pending-review banner; guards on `typeof p.request_id === "number"` since the admin-facing payload shape differs from the participant-facing one.
