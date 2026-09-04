# Niakofa — The Global Village

## Project Overview

Map-first, pay-it-forward mutual-aid platform built around "The Global Village" — every neighborhood connected as one community, one city at a time. Residents request help with groceries, rides, errands, etc; neighbors volunteer as helpers and earn goodwill — all on a live Mapbox map. First live community: Tarrant County, TX. See `docs/GLOBAL_VILLAGE_REBRAND.md` for what's rebranded vs. what's still Fort Worth-specific under the hood (civic resource seed data, legal jurisdiction in the waiver, GPS fallback default).

**Current phase:** Phase 27 complete — SankofaBird “Living Feathers & Natural Light” (77 DB migrations applied, 446 frontend tests passing, 182 API tests passing).

## How to Run

Both workflows are managed as Replit artifacts:

| Workflow | Command | Port |
|---|---|---|
| `artifacts/pay-it-forward: web` | `cd artifacts/pay-it-forward && ./node_modules/.bin/vite --config vite.config.ts --host 0.0.0.0` | 5000 |
| `artifacts/api-server: API Server` | `cd artifacts/api-server && node build.mjs && node --enable-source-maps dist/index.mjs` | 8080 |

After any fresh import: run `pnpm install` first (esbuild postinstall needs it).

The web artifact does not define a `dev` script, so the managed workflow invokes its
installed Vite binary directly. The API preview workflow builds and starts the
compiled server directly; Railway continues to use `scripts/start.sh`, which runs
migrations and supervises both production services.

**DO NOT** use the old root-level "Start application" / "Start API server" workflows — they are stale and fail. Use the `artifacts/*` workflows only.

## Required Secrets

Set these in the Replit Secrets tab. See `SECRETS_REQUIRED.md` for full details.

| Secret | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ Critical | Postgres DB — all data. Workers error without it. |
| `VITE_MAPBOX_TOKEN` | ✅ Critical | Map rendering (client) |
| `MAPBOX_TOKEN` | ✅ Critical | Navigation routing (server) — same token as above |
| `ANTHROPIC_API_KEY` | 🟡 Conditional | Nia AI assistant (required when Nia is enabled) |
| `INTERNAL_SECRET` | 🟡 Conditional | api-server ↔ nia-service auth (required when Nia is enabled) |
| `SESSION_SECRET` | ✅ Already set | JWT signing |
| `STRIPE_SECRET_KEY` | ✅ Production critical | Community Pool payments and payouts |
| `STRIPE_WEBHOOK_SECRET` | ✅ Production critical | Verified Stripe webhook delivery |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ Production critical | Stripe client payment collection |
| `VAPID_PUBLIC_KEY` | 🟡 Already set | Push notifications |
| `VAPID_PRIVATE_KEY` | 🟡 Important | Push notifications (private) |
| `REDIS_URL` | ✅ Production critical | Durable BullMQ payout, cashout, notification, and reconciliation workers |
| `LIVEKIT_URL` | ✅ Production critical for Circles | Hosted LiveKit media endpoint (`wss://` in production) |
| `LIVEKIT_API_KEY` | ✅ Production critical for Circles | Server-minted Circle media tokens |
| `LIVEKIT_API_SECRET` | ✅ Production critical for Circles | Server-minted Circle media tokens |

## Architecture

- **Monorepo:** pnpm workspaces — `artifacts/pay-it-forward` (React/Vite), `artifacts/api-server` (Express 5), `artifacts/nia-service` (AI), `lib/` (shared codegen)
- **Contract-first:** `lib/api-spec/openapi.yaml` → orval generates Zod schemas + React Query hooks. Run `pnpm --filter @workspace/api-spec run codegen` after spec changes.
- **Auth:** HMAC-SHA256 stateless tokens (SESSION_SECRET). Admin gate is `is_admin` DB column.
- **WebSocket hub:** `/ws` — live events (requests, helper locations, reports, WS types in `wsClient.ts` must mirror `ws-hub.ts`).
- **Workers:** BullMQ is required in production; the explicit setInterval fallback is development-only.
- **DB migrations:** `pnpm --filter @workspace/api-server run migrate` (77 migrations through Phase 14).

## Main doc

Full project conventions, gotchas, and operating notes:
**→ `REPLIT_GODFATHER.md`** (repo root)

## User Preferences

- Keep existing monorepo structure — do not restructure or migrate the stack.
- All changes must push to `https://github.com/niakofa-cmyk/Niakofa` via `gitPush` callback (OAuth), not raw `git push`.
- Phase 27 is the current baseline. SankofaBird CSS is split across `artifacts/pay-it-forward/src/components/sankofa-bird-css/`; SVG/components are under `artifacts/pay-it-forward/src/components/SankofaBird/`.
- After any fresh import: `pnpm install` → start the artifact workflows. The post-merge script (`scripts/post-merge.sh`) handles the full install/build/migration order when required.
