# What changed in this download

Your "send help from another hub" button on the Globe (`/globe`) page used to
just write a database row saying someone *intended* to send money — no card
was ever charged, no pool was ever credited. This update makes it move real
money, using the exact same Stripe pattern already proven in your Community
Pool contribution flow.

## Files changed

| File | What changed |
|---|---|
| `lib/db/migrations/0055_hub_pledge_payments.sql` | **New.** Adds a `stripe_payment_intent_id` column + index to `diaspora_hub_pledges`. |
| `lib/db/src/schema/hub-pledges.ts` | Schema updated to match; pledge status now starts as `pending_payment` instead of assuming payment happened. |
| `artifacts/api-server/src/routes/griot.ts` | `POST /griot/hubs/:id/pledges` now creates a real Stripe charge. `GET /griot/hubs/:id/pledges` (the public feed) now only shows pledges that were actually paid. |
| `artifacts/api-server/src/routes/stripe.ts` | The webhook now confirms hub pledges when payment succeeds (crediting the receiving hub's community fund) and cancels them if payment fails. |
| `artifacts/pay-it-forward/src/pages/globe.tsx` | The "Send help" pledge form now opens the same secure payment screen used elsewhere in the app, and only shows "Pledge sent" once the charge is actually confirmed. |
| `CLAUDE.md` | Session note added at the bottom, following your project's existing documentation convention, so future sessions (yours, Replit's, or mine) know what happened and why. |

## What you need to do before this goes live

1. **Run the migration** against your database:
   ```bash
   pnpm --filter db run migrate
   ```
2. **Typecheck and build** — I wasn't able to run `pnpm` in the sandbox this was written in, so please run this before deploying:
   ```bash
   pnpm run typecheck
   pnpm run build
   ```
3. Make sure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `VITE_STRIPE_PUBLISHABLE_KEY` are set in your environment — without them, the feature falls back to the old dev-mode behavior (records + credits instantly, no real card charge), which is fine for local testing but not for production.

## Known limitation (by design, flagged for you)

If someone pledges to a hub that hasn't been "claimed" by one of your
Niakofa communities yet (no `community_id` set), the money currently lands
in your **global** Community Pool rather than a hub-specific fund, because
there's no separate per-hub ledger yet. That's fine for now, but if you want
pledged money to be visibly ring-fenced for that specific hub before it's
claimed, that's a slightly bigger schema change I can build next.
