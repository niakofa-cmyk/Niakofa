---
name: Niakofa re-import baseline state
description: What was already fixed vs. still open when this zip was re-imported into a fresh Replit repl; avoid re-doing already-fixed work.
---

On re-import, the zip already contained fixes from prior sessions — verified present, not re-applied:
- Nia AI disabled by default (login screen shows "Nia AI assistant — currently resting").
- Push-notification `notifType` on all `sendPushTo*` calls in requests.ts/recurring.ts/stripe.ts (the audit doc's BUG-15d line numbers are stale vs. current code — the file grew and lines shifted, but the fix is in place).
- Flash-empty/vanishing-data hooks present: hooks/useListFetch.ts, useResilientData.ts, useStableCenter.ts, 14+ keepPreviousData usages, no raw `setX([])` on fetch error.

Still open as of this import:
- No GitHub `origin` remote configured — only a Replit-managed `gitsafe-backup` backup remote. User's target repo is https://github.com/niakofa-cmyk/Niakofa. Pushing requires connecting the GitHub connector (user dismissed the prompt once); retry when asked to push again.
- BUG-15a (duplicate hourly check-in workers in api-server and nia-service) is an intentional-but-undocumented redundancy, not a bug — idempotent via `nia_checkin_sent_at`.
- REDIS_URL was set to something structurally invalid in this env, so BullMQ queues fall back to the legacy in-process scheduler (logged as WARN, not fatal) — expected per niakofa-redis-csv-hardening.md, not a new issue.

**Why:** the audit `.md` files in repo root (ACTION_PLAN_NEXT_SESSION, AUDIT_SUMMARY, COMPREHENSIVE_SECURITY_AUDIT, all dated 2026-06-28) describe a snapshot in time; always verify their claims against current code before doing rework, since fixes may already be merged in a later save point than the doc.
