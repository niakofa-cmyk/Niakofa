# Niakofa V17.1 Integration Guide

## Baseline

`acca48bca820c5f8353ca6f039edbe5278183d02`

This package is **additive**. It does not replace the existing Direct, Requests, Hub messaging, request lifecycle, Mapbox routing, Hub governance, or Globe architecture.

## Recommended application method

From the repository root:

```bash
node scripts/apply-v17-1.mjs
```

The script refuses to run if `HEAD` is not the stated baseline unless `--force` is supplied. It creates `.v17.1-pre` backups for modified files.

Then inspect:

```bash
git diff --check
git diff
```

### What the script changes

1. Copies the enhanced `MetaStyleDirectPane.tsx`.
2. Copies the canonical `community-hub-feed.ts` API route.
3. Registers that route in `routes/index.ts` — not `app.ts`, because Niakofa already uses the route aggregator.
4. Copies `HubCommunityFeedPanel.tsx` and mounts it only when `/community?hubId=...` is present.
5. Replaces only the existing Direct-mode JSX in `messages.tsx`.
6. Merges Hub-aware Spiral path helpers into the existing canonical `spirals.ts`.
7. Routes the Globe's Spirals action through `spiralsDiscoveryPath({ hubId })`.

## Important behavior changes

### Messages

The existing backend remains authoritative:

- Direct conversations
- WebSocket delivery
- polling fallback
- read state
- block
- report
- approved-account gating

V17.1 changes the interaction model only:

- desktop inbox | thread
- mobile inbox → full-screen thread
- mobile Back returns to inbox
- dense unread rows
- Enter sends; Shift+Enter inserts a newline
- composer remains visible while the message list scrolls

Requests and Hubs remain modes in the same `/messages` page.

### Hub feed

`GET /api/community/hubs/:hubId/feed`:

- requires authentication
- accepts only approved canonical Globe Hubs
- counts approved active Hub memberships from `hub_memberships`
- counts the full matching gratitude/request sets, not just the visible page size
- returns the newest 30 gratitude posts
- returns the newest 20 open requests
- includes Hub → Community / Messages / Spirals actions
- never grants membership from location

Open requests are included when either the requester is assigned to the Hub or the request itself is explicitly Hub-scoped.

### Spirals

`hubId` is context/filter metadata only.

It does **not**:

- create membership
- require GPS
- reverse-geocode the user
- replace curated city/neighborhood discovery

## Verification sequence

```bash
node --test tests/v17-1-contract.test.mjs

git diff --check
```

Then run the repository's normal CI/typecheck/test suite. Do not treat the package contract test as a substitute for the repository's full CI.

## Deployment

Nothing in this package pushes to GitHub or deploys Railway.

After CI is green:

1. merge/upload the changes yourself;
2. confirm the Railway deployment commit is the intended commit;
3. check `/healthz` and the deployed app;
4. run the phone/device checklist in `docs/DEVICE_QA.md`.
