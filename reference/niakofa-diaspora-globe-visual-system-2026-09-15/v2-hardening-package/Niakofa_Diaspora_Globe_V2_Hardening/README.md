# Niakofa Diaspora Globe V2 — Globe-first + Visual Interaction Hardening

Target repository:
`niakofa-cmyk/Niakofa`

Target branch:
`main`

## Purpose

This package is a targeted follow-up to the current Globe-first Diaspora implementation.

It does **not** add another dashboard. It reinforces the intended product hierarchy:

```text
Diaspora → Globe → Hub → Action
```

Canonical Globe geography remains:

- non-U.S. countries = Diaspora Hubs
- U.S. states = Diaspora Hubs
- city/local Hubs remain nested under their canonical parent
- Home is user context, not Globe geography

## What this package improves

The current repository already removed the four large landing-page cards and already has:

- Globe-only `/diaspora`
- canonical country/U.S.-state Hub filtering
- local Hub grouping
- Hub search
- Hub drawer
- Community / Message Hub / Spirals actions
- Stories / Pool behind progressive disclosure
- durable Hub-to-Hub messaging
- mobile hardening for touch targets, short screens, reduced motion, and drawer/nav overlap

This V2 package adds the remaining high-value interaction polish:

1. **Search result → Globe fly-to**
   - selecting a search result centers the globe on the selected Hub.
2. **Marker selection → Globe focus**
   - selecting a marker also flies the globe to that Hub.
3. **Selected-marker visual state**
   - the selected Hub remains visually distinct from idle markers.
4. **Country/state visual identity**
   - Hub markers can show a compact country/state flag glyph.
5. **Real Mapbox navigation controls**
   - zoom + / − and compass are exposed instead of relying only on the underlying map.
6. **Keyboard dismissal**
   - Escape closes the Hub drawer or Hub messaging dialog.
7. **Interactive local-community rows**
   - local Hubs become actionable instead of being rendered only as text.
8. **Mobile messaging sheet hardening**
   - the message surface gets more usable vertical space on phones.
9. **No fabricated relationship lines**
   - this package deliberately does not invent animated Hub-to-Hub connections without a real relationship dataset.
10. **No duplicate geography migration**
   - repository migration `0139_diaspora_hub_geography_invariants.sql` already exists; do not add another 0139.

## Files

- `scripts/apply-diaspora-globe-v2.mjs`
  - deterministic patcher for the current `DiasporaGlobeFirst.tsx`
- `docs/diaspora-visual-gap-matrix.md`
  - concept-by-concept implementation status
- `sql/diaspora-globe-geography-audit.sql`
  - read-only audit for canonical country/state Globe geography
- `README.md`
  - this guide

## Apply

From the Niakofa repository root:

```bash
node scripts/apply-diaspora-globe-v2.mjs
```

Then run the project's normal checks, especially:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Also run the Diaspora/release validation scripts used by the repository.

## Important

Do not deploy this package automatically.

After applying it locally, inspect the diff, run the checks, commit/push to GitHub, and let the normal Railway deployment process pick up the new commit.

The Railway production environment was healthy when this package was prepared; this package does not stage or deploy Railway changes.
