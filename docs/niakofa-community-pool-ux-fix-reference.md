# Niakofa Community Pool UX Fix — Reference

This reference records the uploaded UX-fix package used for the Community Pool
improvements in the current Niakofa checkout.

## Source package

- Original archive: `attached_assets/niakofa-community-pool-ux-fix_1_1788045295977.zip`
- Archive contents: the proposed payment modal, reusable contribution panel,
  community-page patch, README, and review diff.
- The original archive remains unchanged in `attached_assets/` for provenance;
  this file documents what was applied rather than replacing the current page
  wholesale.

## Applied behavior

- The payment confirmation UI is a full-screen accessible dialog at `Z_MODAL`
  (above the fixed bottom navigation), with its own scroll container.
- Background page scroll is locked while payment is open and restored when it
  closes. Escape, close, skip, and focus restoration are supported.
- The confirmation actions remain sticky inside the modal and respect safe-area
  insets on mobile devices.
- The Pool tab presents one validated `$1.00–$10,000.00` contribution launcher
  immediately after the balance hero for signed-in contributions and anonymous
  Stripe donations.
- Existing API routes, Stripe client-secret handling, pool ledger accounting,
  webhook behavior, and sponsor history remain the source of truth.

## Verification notes

The uploaded README and `docs/CHANGES.diff` were read in full before applying
the changes. The supplied full-page replacement was intentionally not copied
because GitHub `main` had newer Community, Circles, and production-hardening
work; only the described pool UX changes were ported to the current page.