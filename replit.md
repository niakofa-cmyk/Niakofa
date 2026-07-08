# Niakofa — Community Help Platform

A map-first, pay-it-forward community mutual aid platform for Tarrant County, TX. Residents can request help with groceries, rides, errands, and more; neighbors volunteer as helpers and earn goodwill; all on a live Mapbox map.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/pay-it-forward run dev` — run the frontend (port assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind + Mapbox (react-map-gl) + Framer Motion
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Payments: Stripe
- Push notifications: Web Push API + BullMQ workers

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for API contracts
- `lib/db/src/schema/` — Drizzle ORM schema files
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not hand-edit)
- `lib/api-zod/src/generated/` — generated Zod validation schemas (do not hand-edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/pay-it-forward/src/pages/` — React page components
- `artifacts/pay-it-forward/src/components/` — Shared UI components

## Architecture decisions

- Contract-first OpenAPI: spec lives in `lib/api-spec/openapi.yaml`, codegen produces both server Zod schemas and client React Query hooks. Never hand-write types that codegen produces.
- Admin auth uses an `X-Admin-Token` header checked against `ADMIN_SECRET` env var on the backend. Frontend stores the token in sessionStorage with a login screen at `/admin`.
- Civic resources are seeded in the DB (not fetched live) for 19 Tarrant County organizations across 8 categories.
- WebSocket hub (`/ws`) broadcasts live events: new requests, helper location updates, new reports, report reviews. The `/ws` path is listed in `artifact.toml` paths alongside `/api`.
- BullMQ workers handle payouts and pledge reconciliation when `REDIS_URL` is set; falls back to setInterval-based scheduler otherwise.
- Community Pool (`community_pool_ledger`, migration 0024): signed-amount ledger, balance = SUM. On pay-it-forward completion the pool fronts the helper's payment immediately; the requester's Stripe repayment replenishes the pool (helper is NOT paid twice). Every completed task gets a guaranteed minimum (default $5, tunable via `system_settings.pool_guaranteed_minimum`; `pool_enabled` toggles the feature). Debits serialized with `pg_advisory_xact_lock(727502)`; partial unique indexes prevent double-front/double-minimum per request. Routes in `artifacts/api-server/src/routes/pool.ts`, service in `lib/community-pool.ts`. `/requests/:id/complete` is idempotent (status guard); the Stripe webhook uses a state-transition guard on `payment_transactions` for retry safety.
- Pool depletion recovery (migration 0025): `payHelperFromPool` returns a typed outcome (`paid`/`insufficient`/`duplicate`/`error`). Insufficient minimums are queued in `pool_pending_minimums` (unique request_id) and backfilled FIFO by `processPendingMinimums()` — triggered on every pool credit (contributions, pledge repayments) plus a 10-min interval worker. Low-balance admin alert (`pool_low_balance_threshold` setting, default $25): warn log + `pool_low_balance` WS + push to `is_admin` users, deduped 6h. Pool stats expose `pending_minimums_count`/`pending_minimums_total`; Community pool tab shows a "Helpers Waiting on the Pool" banner.
- Task taxonomy: `help_request_category` pg enum has 23 values (migration 0025 added moving_labor, pet_care, childcare, senior_care, yard_work, tutoring, cleaning, meal_prep, paperwork, business_services). Category lists must stay in sync across: openapi.yaml (2 enums), request-new.tsx, recurring.tsx, community.tsx + helper-dashboard.tsx label maps, i18n.ts (en + es).
- Legal/tax flags (documented in REPLIT_GODFATHER.md changelog, July 2 2026 — NOT legal advice): pool fronting may look like extension-of-credit under TX lending law (mitigants: no interest/fees/enforcement); 1099s are delegated to Stripe Connect Express for payouts, but direct pool credits to a helper nearing $600/yr may create platform 1099-NEC obligations. Consult a lawyer before scaling.

## Product

- **Map screen** (`/`): Live Mapbox map showing open help requests and online helpers in real time. SOS button for emergency requests.
- **Request new** (`/request/new`): Create a help request with category, urgency, payment type (immediate/pay-it-forward/goodwill).
- **Active request** (`/request/:id`): Track a live request — claim, en-route, arrived, complete flow.
- **Community** (`/community`): Leaderboard, stats, civic resources for Tarrant County. Pool tab: Community Pool live stats, transparency ledger, and contribute flow.
- **Wallet** (`/wallet`): Benevolence wallet, scheduled payments, pay-it-forward pledges.
- **Profile** (`/profile`): User profile, helper mode toggle, trust score.
- **Admin** (`/admin`): Token-gated trust & safety report review queue.

## User preferences

- **Multi-agent family covenant (July 2, 2026):** This project is worked on by multiple AI agents — Claude/Father (`CLAUDE.md`), Replit agent/Godfather (`artifacts/nia-service/REPLIT_GODFATHER.md`), Coworker AI/Grandfather (`GRANDFATHER_COWORKER.md`). Never delete the Replit dev database, the Railway production database, Redis, or any code/infrastructure another agent depends on. Full rules in CLAUDE.md → "Multi-agent family covenant — databases".

## Nia AI

- **Nia is disabled by default for all users.** The `system_settings` table is seeded with `nia_enabled = 'false'`. An admin must explicitly enable it via `POST /api/admin/nia-toggle { "enabled": true }` or via the admin dashboard.
- **Kill-switch is fail-closed everywhere:** if the DB row is missing, empty, or any value other than `"true"`, Nia is treated as disabled. DB errors also default to disabled — the system can never accidentally enable Nia due to infrastructure failures.
- **Kill-switch is enforced at every layer:** nia-proxy.ts (all /api/nia/* routes), nia-context.ts, nia-voice.ts, nia-checkin-worker.ts, nia-push-queue-worker.ts, and the nia-service itself each check isNiaEnabled() before any AI work.
- **Frontend confirms state before showing anything:** AppContext polls `/api/admin/nia-status` every 60 seconds and subscribes to the WS `nia_status` event for instant toggle propagation. `NiaGlobal` in App.tsx renders `null` while loading and hides the FAB + Drawer when `niaEnabled !== true`.
- **Shared cached isNiaEnabled():** All api-server routes and workers import `isNiaEnabled` from `../lib/db-helpers`. This function has a 10-second TTL cache and is invalidated immediately (via `resetNiaEnabledCache()`) when an admin toggles Nia.

## Gotchas

- **Fresh/empty Postgres is bootstrapped with one command:** `pnpm --filter @workspace/db run migrate` — run-migrations.mjs detects a fresh DB (no users table), enables postgis, and executes all migrations from 0000. Then `pnpm --filter @workspace/scripts run seed-if-empty` seeds the 19 civic resources. Never drop-and-recreate the DB.
- After any OpenAPI spec change, always run `pnpm --filter @workspace/api-spec run codegen` before restarting the server — codegen also runs `typecheck:libs`.
- The Vite dev server has `fs.allow` set to the workspace root (`../..`) so it can serve `lib/api-client-react` source files via the workspace symlink.
- Admin token is set via the `ADMIN_SECRET` env var (do NOT hardcode the value here — set it in Railway dashboard or Replit Secrets).
- Mapbox token and Stripe webhook secret are set as shared env vars (see `.env.railway.example`).

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
