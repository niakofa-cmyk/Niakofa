---
name: Niakofa checkin-worker to diaspora-hub crisis bridge
description: How Nia's 24h check-in workers now see diaspora_hubs.is_crisis, closing a gap where Nia had no awareness of hub-level crisis state.
---
Both check-in workers (nia-service/general-checkin-worker.ts and api-server/nia-checkin-worker.ts) previously only knew about per-request completion timing — zero visibility into diaspora_hubs.is_crisis (the Griot Globe hub crisis flag from migration 0054/0056).

Fix: both now LEFT JOIN diaspora_hubs dh ON dh.community_id = u.community_id AND dh.is_crisis = TRUE (users have no direct hub_id; the link is via users.community_id -> diaspora_hubs.community_id).

- nia-service worker: builds a crisis-aware message variant directly and sets is_crisis=TRUE on the saved nia_conversations row when hub_in_crisis, so crisis-followup-worker's existing is_crisis-based selection picks the user up for gentler recurring follow-up instead of two workers double-messaging.
- api-server worker: passes hubInCrisis in the /checkin payload to nia-service; checkin.ts route uses it to add crisis framing to the Claude prompt and persists is_crisis accordingly.

**Why:** community review finding was "Nia and the diaspora-hub crisis system still don't talk to each other" — Nia's check-in worker knew about county-level crisis_state but not diaspora_hubs.is_crisis.
**How to apply:** any new Nia proactive-messaging worker that queries by requester/user should consider this same LEFT JOIN pattern if hub-crisis context is relevant to tone.
