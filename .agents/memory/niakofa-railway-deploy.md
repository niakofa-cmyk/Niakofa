---
name: Niakofa Railway deploy
description: Railway/railpack build config, CORS multi-origin, and SERVE_FRONTEND static-file serving pattern.
---

## Build (railpack.json)
Steps must include `NODE_ENV=production` on the Vite build line:
```
NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/pay-it-forward run build
```
Without it, Vite may not apply production optimisations and Replit-only plugins might activate.

## Static serving in production
`app.ts` serves the SPA when `NODE_ENV=production && SERVE_FRONTEND=true`.
Path: `path.join(import.meta.dirname, "..", "..", "pay-it-forward", "dist", "public")`
resolves correctly because `import.meta.dirname` = `artifacts/api-server/dist/`.

## CORS
`ALLOWED_ORIGIN` env var accepts a comma-separated list of origins:
```
ALLOWED_ORIGIN=https://niakofa.com,https://zesty-ambition-production-f6a1.up.railway.app
```
Same-origin requests (API + frontend on same domain) have no Origin header and are always allowed.

## Required Railway env vars
- `DATABASE_URL` — auto-set by Railway Postgres plugin
- `REDIS_URL` — auto-set by Railway Redis plugin (optional, enables BullMQ workers)
- `NODE_ENV=production`
- `SERVE_FRONTEND=true`
- `APP_URL=https://niakofa.com`
- `ALLOWED_ORIGIN=https://niakofa.com,https://zesty-ambition-production-f6a1.up.railway.app`
- `SESSION_SECRET` — 64-char hex, signs auth tokens
- `ADMIN_SECRET` — protects /admin
- `VITE_MAPBOX_TOKEN` + `MAPBOX_TOKEN` — public Mapbox token (baked into bundle + used server-side)
- `VITE_STRIPE_PUBLISHABLE_KEY` — baked into bundle
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — for Web Push notifications

**Why:** `VITE_*` vars are read by Vite at build time and baked into the JS bundle. They must be set in Railway at BUILD time (not just runtime).

## Verification

For this deployment, the authoritative synchronization check is the SHA returned by
`GET /api/healthz`: compare it with local `HEAD`, `origin/main`, and a fresh
`git ls-remote origin refs/heads/main`. The Railway URL can remain healthy while
serving an older commit, so an HTTP 200 alone is not sufficient.

**Why:** Railway can roll out asynchronously after a GitHub push; checking both
health and the served commit distinguishes a healthy old rollout from the current
source actually being live.

**How to apply:** After pushing or pulling `main`, wait for the deployment,
request `/api/healthz`, and require `status: "ok"`, `db: "connected"`, and an
exact SHA match before declaring the landing verified.
