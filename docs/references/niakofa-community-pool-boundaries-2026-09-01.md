# Niakofa Community Pool boundary reference

This record preserves the decisions from the uploaded Community Pool and Legacy
RPG review materials supplied on 2026-09-01. The original text, patch, and ZIP
archives remain in `attached_assets/` as reference material; none is treated as
executable configuration.

## Money-boundary decisions

Niakofa keeps its existing `communities`, `community_pool_ledger`, financial
event, and diaspora-hub tables. The uploaded `community_funds` architecture is
not layered on top of them because it would create a second source of truth.

- `/pool/my-stats`, `/pool/my-ledger`, and the dashboard “My Community Pool”
  display only the authenticated member’s assigned community.
- `/pool/stats` and `/pool/ledger` remain explicitly platform-wide transparency
  endpoints; they are not valid sources for a member’s personal pool balance.
- Authenticated contributions require an assigned community and carry that
  community through Stripe metadata and settlement.
- Anonymous donations are explicitly labeled and recorded for the
  platform-wide “Niakofa General Fund”.
- Government sponsor funding and pledge subsidies resolve county/state to a
  configured community and fail closed when no match exists.
- Pool payouts require a community or explicit diaspora-hub scope. Hub reserves
  remain ring-fenced, and community-scoped payouts cannot spend another
  community’s balance.
- Repayments and queued guaranteed minimums preserve the original community/hub
  scope. Historical nullable ledger rows are retained for audit compatibility,
  but new money movement does not silently use the legacy global bucket.

## Legacy RPG boundary

The Legacy RPG runtime and tables remain in the main application until the
standalone deployment, authenticated bridge, and production verification gates
in `docs/LEGACY_EXTRACTION.md` pass. The current phase is controlled-copy
verification, not deletion or cutover.

## Regression targets

Future changes should retain coverage for:

1. Dashboard fetches `/pool/my-stats`, never `/pool/stats`.
2. Community A balances cannot appear in Community B member views.
3. Missing community scope rejects new contributions and payouts.
4. Anonymous donations identify the General Fund destination.
5. County sponsor money cannot fund a missing or different community.