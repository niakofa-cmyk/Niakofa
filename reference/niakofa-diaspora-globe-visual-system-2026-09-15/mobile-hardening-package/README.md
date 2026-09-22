# Niakofa Diaspora Globe + Mobile Hardening Package

## What this package is for

This package is a **targeted follow-up hardening layer** for the current
`main` branch. It does not rebuild Diaspora.

The current architecture is already:

`Diaspora → Globe → Hub → Action`

The package focuses on the remaining implementation gaps found during the
September 16, 2026 review:

1. Preserve the Globe-only `/diaspora` landing page.
2. Preserve canonical geography:
   - non-U.S. Hubs = countries
   - U.S. Hubs = individual states
   - local/city Hubs = drill-down data, not Globe markers
   - Home = user context, not geography
3. Make the Globe and Hub drawer safer on short mobile screens.
4. Bring Globe marker touch targets to 44px.
5. Respect reduced-motion preferences for decorative marker animation.
6. Make the mobile Hub sheet sit above the global fixed bottom navigation.
7. Keep the existing authenticated Hub-to-Hub messaging workflow intact.

## Important: do not create migration 0138

The repository already uses `0138` for durable Hub messaging. The geography
invariant is therefore `0139_diaspora_hub_geography_invariants.sql`.

The SQL included here is a reference copy of the current `main` migration.
Do not add a second copy if `0139` already exists in your branch.

## Apply

From the repository root:

```bash
node scripts/apply-diaspora-globe-mobile-hardening.mjs
```

Then run the normal Niakofa validation suite:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm release-validate
pnpm audit:routes
```

Use the repository's normal migration runner for `0139`; do not execute the SQL
manually against production.

## Current implementation assessment

### Already implemented well

- `/diaspora` is Globe-first rather than a dashboard.
- Country/state Hub geography is represented in the frontend.
- Home Hub treatment has already been removed from the current component.
- Canonical Hub markers are supplied by the village-pulse contract.
- Search can resolve grouped local-community names back to a canonical Hub.
- Hub drawer exposes Community, Message Hub, and Spirals.
- Stories and Pool are progressively disclosed under More.
- Hub-to-Hub messaging is backed by authenticated server APIs.
- Responsive Globe and Hub drawer behavior is already present.
- The visual reference package exists in the repository, including desktop and
  mobile concept boards.

### Remaining gap between the visual concept and production UI

The current production UI implements the **core interaction model** of the
visual concept, but not every decorative visual idea from the concept boards.

In particular, the current Globe component does not yet have a data-backed,
animated network layer showing Hub-to-Hub connection lines, nor a separate
memory visualization layer. Those should **not** be added as fake decoration:
they need real relationship/story data first.

That is intentional. The cleaner product hierarchy is more important than
adding visual noise.

## Mobile package assessment

The existing mobile document defines:

- Home / Diaspora / Circles / Messages / More information architecture
- Globe search
- bottom-sheet Hub details
- full-screen message composition when needed
- Hub-to-Hub messaging
- Stories, Spirals, Pool deep links
- 44px touch target guidance
- reduced-motion guidance
- 320/375/430px quality gates

The repository also has a global responsive BottomNav. However, the exact
five-item mobile information architecture described in the visual document is
not yet a dedicated Diaspora-specific native shell. The current product is
responsive web, with the existing global navigation providing access to
Diaspora, Community, Map, and Spirals.

Therefore: **mobile is substantially implemented, but the visual mobile
concept is not a 100% literal implementation yet.**

## Recommended next phase

Do not put the removed dashboard sections back.

Instead:

`Globe → Hub → contextual drawer → action`

Potential future layers:

- Live presence → Hub activity / Live now
- Real relationships → Community / Connections
- Member-to-Spiral → Hub Spirals
- Family memory → Hub Stories / Family
- Hub-to-Hub messaging → Messages / Message Hub
- Pool → More → Pool

The landing page should remain visually quiet.

## Acceptance tests

### Geography

- Brazil = one canonical Globe marker.
- Ghana = one canonical Globe marker.
- Nigeria = one canonical Globe marker.
- Texas = one U.S. state marker.
- California = one U.S. state marker.
- New York = one U.S. state marker.
- Recife search resolves to Brazil's canonical Hub/local-community context.
- No Home Hub marker or Home Hub label appears.

### Mobile

At 320px, 375px, and 430px:

- no horizontal scrolling
- marker touch target >= 44px
- search clear control is comfortably tappable
- Hub sheet remains above fixed bottom navigation
- Hub actions remain reachable
- message composer is not hidden by navigation
- reduced-motion preference disables decorative marker pulse

### Product hierarchy

- `/diaspora` shows the Globe, not a dashboard.
- No Live Diaspora Presence card.
- No Real Relationships card.
- No Alive From Member to Spiral card.
- No See Where Your Family's Memory Lives card.
- Those capabilities remain reachable contextually from a selected Hub.

## Railway

This package is designed for manual GitHub upload/application.

**No Railway deployment is included.**
