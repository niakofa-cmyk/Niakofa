# Niakofa — Community Help Platform

## Project Overview

Map-first, pay-it-forward community mutual aid platform for Tarrant County, TX. Residents request help with groceries, rides, errands, etc; neighbors volunteer as helpers and earn goodwill — all on a live Mapbox map.

**Current phase:** Phase 16 complete (SankofaBird Phases 1–16, navigation E2E tests, full lib build, 77 migrations applied, 182 tests passing).

## How to Run

Both workflows are managed as Replit artifacts:

| Workflow | Command | Port |
|---|---|---|
| `artifacts/pay-it-forward: web` | `pnpm --filter @workspace/pay-it-forward run dev` | 18848 |
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` | 8080 |

After any fresh import: run `pnpm install` first (esbuild postinstall needs it).

**DO NOT** use the old root-level "Start application" / "Start API server" workflows — they are stale and fail. Use the `artifacts/*` workflows only.

## Required Secrets

Set these in the Replit Secrets tab. See `SECRETS_REQUIRED.md` for full details.

| Secret | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ Critical | Postgres DB — all data. Workers error without it. |
| `VITE_MAPBOX_TOKEN` | ✅ Critical | Map rendering (client) |
| `MAPBOX_TOKEN` | ✅ Critical | Navigation routing (server) — same token as above |
| `ANTHROPIC_API_KEY` | ✅ Critical | Nia AI assistant |
| `INTERNAL_SECRET` | ✅ Critical | api-server ↔ nia-service auth |
| `SESSION_SECRET` | ✅ Already set | JWT signing |
| `STRIPE_SECRET_KEY` | 🟡 Important | Community pool payments |
| `VITE_STRIPE_PUBLISHABLE_KEY` | 🟡 Already set | Stripe client |
| `VAPID_PUBLIC_KEY` | 🟡 Already set | Push notifications |
| `VAPID_PRIVATE_KEY` | 🟡 Important | Push notifications (private) |
| `REDIS_URL` | 🔵 Optional | BullMQ pledge/payout workers |

## Architecture

- **Monorepo:** pnpm workspaces — `artifacts/pay-it-forward` (React/Vite), `artifacts/api-server` (Express 5), `artifacts/nia-service` (AI), `lib/` (shared codegen)
- **Contract-first:** `lib/api-spec/openapi.yaml` → orval generates Zod schemas + React Query hooks. Run `pnpm --filter @workspace/api-spec run codegen` after spec changes.
- **Auth:** HMAC-SHA256 stateless tokens (SESSION_SECRET). Admin gate is `is_admin` DB column.
- **WebSocket hub:** `/ws` — live events (requests, helper locations, reports, WS types in `wsClient.ts` must mirror `ws-hub.ts`).
- **Workers:** BullMQ when REDIS_URL set; setInterval fallback otherwise.
- **DB migrations:** `pnpm --filter @workspace/api-server run migrate` (77 migrations through Phase 14).

## Main doc

Full project conventions, gotchas, and operating notes:
**→ `REPLIT_GODFATHER.md`** (repo root)

## User Preferences

- Keep existing monorepo structure — do not restructure or migrate the stack.
- All changes must push to `https://github.com/niakofa-cmyk/Niakofa` via `gitPush` callback (OAuth), not raw `git push`.
- Phase 16 is the current baseline. The SankofaBird is in `artifacts/pay-it-forward/src/components/SankofaBird.tsx` / `SankofaBirdSvg.tsx`.
- After any fresh import: `pnpm install` → `pnpm --filter @workspace/api-zod run build` → `pnpm --filter @workspace/api-client-react run build` → start workflows. The post-merge script (`scripts/post-merge.sh`) handles this in the correct order (install-first).
