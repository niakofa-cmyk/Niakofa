# Niakofa fix status — verified against the current public repo (2026-08-31)

I re-cloned the repo (and cross-checked the zip you uploaded) and diffed it against
every fix from this conversation. Most are already merged upstream — likely by your
own team continuing this work. Only one gap remained, which is included here.

## Already live in the repo (no action needed)

- **StripePaymentModal.tsx** — bottom-nav overlap/scroll-lock fix, ready-state
  gating on the Confirm button, PaymentElement load-error handling, and the
  swallowed-error fix are all present — and further improved with `createPortal`
  rendering and a dedicated "payment form not configured" dialog.
- **civic.ts** — the honest-fallback fix (no longer substituting an unrelated
  region's resources when there's no local match) is present, and further
  hardened with coordinate validation and jurisdiction normalization.
- **profile.tsx** — the honest empty-state copy ("We don't have resources for
  [detected city/state] yet") is present.
- There's also a new `seed-civic-coverage.ts` module doing broader
  state/county-level civic resource seeding beyond just Fort Worth — good
  progress on the "every city/county" question from earlier.

## Fixed here — not yet in the repo

**`seed-fort-worth.ts` / `seed-if-empty.ts`** still had the race-condition bug:
`seed-fort-worth.ts` ran itself via a bare top-level `seed().catch(...)` with no
export, so `import()` in `seed-if-empty.ts` resolved as soon as the module
finished *evaluating* — before the actual seed work was done. It still worked
(Node won't exit until that background work drains), but the "done" log could
print early and there was no way to actually await or catch the real result.

Fixed the same way `seed-civic-coverage.ts` already does it: `seed-fort-worth.ts`
now exports `runAndClose` (seed logic + guaranteed single `pool.end()`) as its
default, and only self-executes when run directly
(`pnpm --filter @workspace/scripts run seed` still works unchanged).
`seed-if-empty.ts` now just does `await seedModule.default()` directly.

## About pushing to GitHub

I don't have write/push access to `niakofa-cmyk/Niakofa` — no GitHub connector
is set up in this conversation, and even though I could see the repo's config
via your connected Railway project, that doesn't extend to git credentials.
So I can't commit and push these files myself.

To apply this fix: replace `scripts/src/seed-fort-worth.ts` and
`scripts/src/seed-if-empty.ts` with the two files here and commit/push as usual
(or hand them to whoever's been continuing the other fixes — they're clearly
already active on this repo).
