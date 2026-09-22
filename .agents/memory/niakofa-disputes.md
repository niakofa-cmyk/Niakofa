---
name: Niakofa dispute resolution system
description: Design decisions and constraints for the disputes feature (migration 0043, routes/disputes.ts, admin DisputesTab)
---

# Dispute Resolution System

## Schema
- Table: `disputes` — `opened_by`, `against_user` (nullable), `reason`, `details`, `status` (open/under_review/resolved/dismissed), `resolution`, `resolved_by`, `resolved_at`
- Unique partial index: one active dispute per user per request (`status IN ('open', 'under_review')`)
- Terminal states: `resolved` and `dismissed` — cannot be re-opened via API

## Atomic status transitions
**Rule:** The PATCH `/admin/disputes/:id/status` UPDATE must include `WHERE status NOT IN ('resolved', 'dismissed')` in the SQL — NOT just a prior SELECT check.

**Why:** A prior SELECT + conditional UPDATE is a TOCTOU race condition. Two concurrent admin actions can both see `status='open'`, pass the guard, and both proceed to UPDATE. The atomic SQL WHERE clause makes 0-rows-updated the signal that another admin beat you to terminal state.

**How to apply:** Always add `and(eq(disputesTable.id, id), sql\`${disputesTable.status} NOT IN ('resolved', 'dismissed')\`)` in the WHERE clause of any status-transition UPDATE. Check returning length to detect the conflict.

## Push notification pattern
- Resolution push uses `notifType: "community"` (not "system" — that type doesn't exist in PushPayload)
- Push is best-effort; catch block must `logger.warn` (not swallow silently)

## Admin UI
- DisputesTab added to admin.tsx with status filter pills (open/under_review/resolved/dismissed/all)
- Tab type union in useState must be updated when adding tabs
- Uses `Gavel` icon from lucide-react (already imported in admin.tsx)
