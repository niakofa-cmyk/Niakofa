# Community Service and Pay It Forward: Vision & Implementation Review

**Status:** Product reference and targeted implementation audit  
**Review date:** 2026-10-18  
**Scope:** Niakofa community help, Pay It Forward, Community Pool, county sponsorship, and helper compensation

## Vision

Build a community-service platform where everyday people can help neighbors. A requester can pay now, make a flexible Pay It Forward contribution later, or request volunteer help. When a requester cannot pay immediately, they should be able to contribute what they can when they can, over a period ranging from days to years. Helpers should benefit financially from their service, with a long-term goal of fair, livable compensation.

The supplied context also included prior agent narration about reading design instructions and building an “enhanced v5.” Those workflow notes are historical context, not accepted product requirements.

## Short assessment

**The idea is viable as a community-funded service and mutual-aid platform, provided repayment and compensation are described honestly and the pilot has committed funding.** It is not yet viable to promise that a helper can earn a livable wage every day merely by being available. Current compensation depends on completed tasks, estimated hours, pool settings, helper tier, and available reserves. A depleted pool can delay or prevent a payment.

The best implementation path is to continue in Niakofa’s existing React/TypeScript, Node.js, and PostgreSQL architecture. Python is not needed for the core product. Add a separate service only if a concrete later requirement—such as a specialized forecasting or data-science workload—justifies it.

This is a targeted code review, not a legal review, production certification, or full security audit.

## Implementation status

| Vision area | Status | What the app currently does |
|---|---|---|
| Requesters choose how to fund a request | **Implemented, with payment-readiness caveat** | Request creation offers Pay Now, Pay It Forward, and volunteer Goodwill. Pay Now uses a Stripe PaymentIntent flow; Pay It Forward can carry an optional pledge amount. Development Stripe configuration was not ready for a verified test checkout during the review, so the payment path is not certified here. |
| Flexible partial repayment | **Partially implemented** | A requester can make a positive partial repayment, capped at the remaining pledge. Repayment is debited from the requester’s Goodwill Fund wallet, which is funded through Stripe; the repayment endpoint does not directly charge a new card or bank account. |
| Repayment over days, weeks, months, or years | **Partially implemented** | The app supports one-time scheduling and two- or four-installment plans across 2 days, 2 weeks, 2 months, or 2 years. These create scheduled-payment records and reminders; they do not automatically withdraw money. Installments are fulfilled manually from the wallet. |
| No-pressure repayment | **Inconsistent with current lifecycle** | The request form uses no-pressure language and offers hardship requests, but the system can mark a pledge defaulted after two years and apply a trust-score penalty. That is materially different from a purely voluntary contribution and needs a product-policy decision before launch. |
| County or government connection | **Partially implemented** | Government-sponsor applications, civic-needs surfaces, county impact views, and community-scoped pools exist. These are not yet one end-to-end county portal whose sponsor funding, requester repayments, and helper payouts reconcile together in a single public ledger. |
| Helper compensation | **Partially implemented** | On eligible completed work, the Community Pool can debit a scoped reserve and credit the helper’s internal Goodwill Fund wallet. The minimum calculation uses estimated hours and a configurable hourly rate, then applies tier and pool-health factors. Insufficient funds can block or delay payment. |
| Livable wage or daily income | **Not established** | The code provides a conditional pool calculation, not a funded employment guarantee, daily availability pay, or a verified livable wage. The prior admin “effective rate” calculation reflected requester repayments divided by estimated hours, not actual helper earnings; the screen has been relabeled to make that distinction explicit. |

### Corrections made during this review

- The repayment amount control now caps the displayed and submitted amount to the outstanding pledge, supports cents, and has a focused unit test. The server remains the final authority and continues to cap repayment.
- Request-creation copy now says estimated hours inform the pool calculation and that amount/timing depend on available funds and the local rate; it no longer describes the result as a guaranteed livable wage.
- The admin metric is labeled as pledge repayment per estimated hour, with an explicit note that it is not helper earnings. The $15/hour figure is labeled as a planning input, not a measured or guaranteed payout.

These corrections clarify existing behavior; they do not create a new funding source, guarantee wages, or change the legal status of pledges.

## Decisions required before expanding the product

1. **Repayment policy:** Is Pay It Forward a voluntary contribution, or an enforceable debt? If voluntary, decide whether the two-year default state and trust-score penalty should be removed, and whether a requester can cancel or receive forgiveness without a penalty.
2. **Who funds compensation:** Identify the entity responsible for pool reserves and any minimum payout. Decide whether the hourly amount is a target, a conditional estimate, or a legally/operationally guaranteed wage.
3. **Sponsor eligibility and accounting:** Decide whether county sponsorship is limited to government or can include nonprofits, businesses, and individuals. Each source may need distinct restrictions, reports, and refund rules.
4. **Worker and payment model:** Obtain qualified legal and tax guidance on worker classification, payroll and benefits, payment custody, consumer disclosures, charitable solicitation, and tax treatment before describing compensation as wages or pledges as debt.
5. **Shortfall handling:** Decide whether new compensated tasks stop when reserves cannot cover promised amounts, or whether the product clearly offers only a conditional payment.

## Recommended implementation path

### Part 1 — Set the policy and accounting contract

Write down the status of a pledge, whether it can be forgiven, what reminders mean, whether any automatic charge exists, and what the requester can do during hardship. Keep automatic card/bank debits off unless separately approved and clearly disclosed. Align the current default/trust-score behavior with the chosen policy.

Define the pool’s funding sources and the exact transaction trail from sponsor/contributor to reserve, helper credit, repayment, refund, and withdrawal. Keep county- or Hub-restricted funds ring-fenced.

### Part 2 — Make the current pilot transparent

Use the existing TypeScript stack to finish the repayment experience: clear wallet-funding instructions, accurate scheduled-payment reminders, partial payments, hardship/forgiveness actions, and a visible balance/history. Make it unmistakable that a schedule is a reminder plan, not an automatic withdrawal.

Show helpers the amount credited, its source, whether it is pending or available, and how to access it. Do not call a conditional pool credit “daily income” or a “livable wage” until the funding and operational model supports that claim.

### Part 3 — Connect county sponsorship and impact reporting

Build the county experience around a public, read-only impact view plus authenticated sponsor administration. Reconcile sponsor commitments, donations, pool reserves, payouts, repayments, and refunds in a county-scoped ledger. Show funding availability and shortfalls without exposing requester or helper private information.

### Part 4 — Establish and measure compensation before making a wage promise

Measure actual helper compensation—not requester repayments—against verified time worked and actual cash-out timing. Publish a transparent policy for reserve requirements, payout limits, and what happens when a reserve is short. If the product promises a minimum, reserve the full amount before a task is accepted or stop offering covered tasks when reserves are insufficient.

Pilot in a small number of communities before making “paid every day” or “livable wage” claims. Track completed work, reserve runway, actual helper payouts, payout delays, voluntary repayment patterns, hardship requests, disputes, and participant retention.

## Release checks

- The repayment policy is explicit and matches the default, trust-score, reminder, and hardship behavior.
- A partial repayment cannot exceed the balance, and the UI amount matches the amount recorded by the server.
- A scheduled plan clearly states that it creates reminders and does not automatically charge a card or bank account.
- Pool balances, sponsor restrictions, helper credits, repayments, refunds, and withdrawals reconcile by community.
- Compensation claims use actual payout data and disclose reserve limits; requester repayments are not used as a proxy for helper wages.
- Stripe test-mode checkout and webhook processing pass in development before the Pay Now path is treated as ready.
- Mobile browser/device acceptance covers the complete requester, helper, wallet, and sponsor journeys.

## Code areas reviewed

- `artifacts/pay-it-forward/src/pages/request-new.tsx`
- `artifacts/pay-it-forward/src/components/RepaymentSchedulerModal.tsx`
- `artifacts/pay-it-forward/src/pages/wallet.tsx`
- `artifacts/pay-it-forward/src/pages/civic-needs.tsx`
- `artifacts/pay-it-forward/src/pages/civic-portal.tsx`
- `artifacts/pay-it-forward/src/pages/county-impact.tsx`
- `artifacts/pay-it-forward/src/pages/admin.tsx`
- `artifacts/api-server/src/routes/requests.ts`
- `artifacts/api-server/src/routes/users.ts`
- `artifacts/api-server/src/lib/community-pool.ts`
