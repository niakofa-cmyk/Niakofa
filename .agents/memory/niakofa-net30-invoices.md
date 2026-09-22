---
name: Niakofa NET30 invoice reminders
description: Daily scheduler worker that reminds government sponsors 7 days before civic invoice due dates.
---

# Niakofa NET30 Invoice Reminder Worker

## Location
`artifacts/api-server/src/lib/scheduler.ts` — `processNet30InvoiceReminders()` + `startNet30InvoiceReminderWorker()`

## Wiring
`index.ts` calls `startNet30InvoiceReminderWorker()` and registers `"net30-invoices"` with `workerStarted()`.

## Behavior
- Runs daily (ONE_DAY_MS interval) + 2-min startup delay
- Queries `civic_invoices` JOIN `civic_needs` JOIN `government_sponsors` for pending invoices with `due_date` in the next 7 days (not already overdue)
- Sends push to `government_sponsors.submitted_by_user_id`
- In-memory dedup set (`_net30ReminderSent`) prevents double-sends per server restart
- Fire-and-forget per invoice — never throws

## DB joins required
`civicInvoicesTable → civicNeedsTable (civic_need_id) → governmentSponsorsTable (government_sponsor_id)`

**Why:** NET30 municipal invoices need advance warning or they slip silently. No Stripe institutional billing yet — mark-paid is manual via admin UI.
