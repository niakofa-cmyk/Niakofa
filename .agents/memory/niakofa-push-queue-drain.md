---
name: Niakofa push queue atomic drain
description: nia-push-queue-worker must claim rows atomically (UPDATE...RETURNING FOR UPDATE SKIP LOCKED) not SELECT then UPDATE
---

# Push Queue Must Drain Atomically

## The rule
`artifacts/api-server/src/workers/nia-push-queue-worker.ts` must use a single `UPDATE ... RETURNING` with `FOR UPDATE SKIP LOCKED` to claim rows, not a two-step SELECT then UPDATE.

## Why
The old pattern (SELECT rows WHERE sent_at IS NULL, then UPDATE SET sent_at = NOW() WHERE id IN (...) AND sent_at IS NULL) has a TOCTOU race: two concurrent worker instances can SELECT the same rows before either marks them sent, then both mark them and both deliver — causing duplicate push notifications.

## How to apply
```sql
UPDATE push_notification_queue
SET sent_at = NOW()
WHERE id IN (
  SELECT id FROM push_notification_queue
  WHERE sent_at IS NULL
  ORDER BY created_at ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
)
RETURNING id, user_id, title, body, data
```
The rows returned are already marked — no separate UPDATE step needed. Any concurrent worker instance skips locked rows and gets a disjoint batch.
