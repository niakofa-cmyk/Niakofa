# Niakofa pool history hardening reference

This reference captures the uploaded `niakofa-pool-history-hardening` package
and its companion audit. The original archive remains in `attached_assets/`.
The source files were reviewed in full before the compatible changes were
merged into the current `main` application.

## Accepted changes

- Add nullable Community Pool linkage and JSON metadata to personal
  `transactions` rows.
- Backfill named historical sponsor contributions.
- Record a contributor's **gross** amount as a `pool_contribution` History
  headline. Keep Stripe fee, Climate contribution, net amount, currency,
  settlement status, and availability in metadata.
- Expose reserve health from both the public and member-scoped pool stats:
  `required_reserve`, `spendable`, `coverage_helper_hours`,
  `pool_health_pct`, `pool_status`, and `reserve_policy`.
- Show the reserve health strip on the Community Pool page and the
  fee/Climate/net/status breakdown in Profile → History.
- Keep funding thresholds unchanged: $1–$10,000 per contribution and $5/$10/
  $25/$50 quick amounts.

## Reserve formula

```text
Required Reserve = Helpers Covered × Guaranteed Hours × Hourly Rate × Safety Multiplier
```

The default policy is 10 helpers, 4 guaranteed hours, and a 1.25 safety
multiplier. The hourly rate comes from the community override when present,
then the global pool minimum rate, then the documented $15/hour fallback.

## Production decisions

- Pool ledger and financial events remain the accounting source of truth.
- History is a linked projection and must not replace gross with net.
- Stripe settlement correction handling updates the linked History projection
  rather than creating a duplicate contributor activity row.
- Government-sponsored direct credits do not attribute a personal History row
  to the administrator who recorded the sponsor's funding; the public pool
  ledger retains the sponsor linkage and audit notes.

## Explicit non-secret handling

The supplied notes mentioned GitHub and Stripe secret names. No secret values,
tokens, or credentials are included in this reference or committed to Git.