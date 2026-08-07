---
name: Niakofa scheduled reminder dedup
description: last_reminder_sent_at column on scheduled_payments; dedup gate must be in BOTH scheduler.ts and pledge-worker.ts or one path bypasses it.
---

## The column
`scheduled_payments.last_reminder_sent_at TIMESTAMP WITH TIME ZONE` (migration 0042).
Applied to dev DB via: `psql $DATABASE_URL -f lib/db/migrations/0042_reminder_dedup.sql`

## The gate (apply in BOTH places)
```sql
last_reminder_sent_at IS NULL
OR last_reminder_sent_at < NOW() - INTERVAL '24 hours'
```

## Where to apply
1. `scheduler.ts::processScheduledReminders()` — 6-hour cron
2. `pledge-worker.ts` Step 4 — daily BullMQ worker

After a successful push send, update:
```typescript
await db.update(scheduledPaymentsTable)
  .set({ last_reminder_sent_at: new Date() })
  .where(eq(scheduledPaymentsTable.id, scheduled.id))
  .catch(() => {});
```

**Why:** If the gate is only in one of the two reminder paths, the other path bypasses it and users can still receive multiple reminders per day for the same overdue payment.
