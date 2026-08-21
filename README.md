# Niakofa — Community Help Platform

A map-first, pay-it-forward community mutual aid platform for Tarrant County, TX. Residents can request help with groceries, rides, errands, and more; neighbors volunteer as helpers and earn goodwill — all on a live Mapbox map. Includes Nia AI (Claude-powered cultural assistant), Family Vault (legacy preservation), and Legacy Engine (RPG-style ancestor storytelling game).

> **Mission:** Help Today. Pay It Forward Tomorrow. Building community one act of kindness at a time in Fort Worth, TX.

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the API server (port 8080)
pnpm --filter @workspace/api-server run dev

# Run the frontend (port 5000 in the managed Replit preview)
cd artifacts/pay-it-forward && pnpm exec vite --config vite.config.ts --host 0.0.0.0 --port 5000
```

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | 64-char hex string for HMAC token signing |
| `ADMIN_SECRET` | Password protecting the `/admin` route |
| `VITE_MAPBOX_TOKEN` | Mapbox public token (baked into frontend build) |
| `MAPBOX_TOKEN` | Mapbox token for server-side geocoding |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (`pk_live_` / `pk_test_`) |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web Push VAPID private key |
| `REDIS_URL` | Redis for BullMQ background workers *(required in production; development may use the explicit fallback)* |
| `INTERNAL_SECRET` | Shared secret for api-server ↔ nia-service internal calls (`x-internal-secret` header) |
| `NIA_SERVICE_URL` | URL of the Nia AI service (default: `http://localhost:3001`) |
| `ALLOWED_ORIGIN` | Comma-separated CORS allowed origins for production (e.g. `https://app.niakofa.com`) |
| `SERVE_FRONTEND` | Set to `true` to have Express serve the React SPA (Railway production mode) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Nia AI (Claude models) |
| `OPENAI_API_KEY` | OpenAI API key for Nia voice TTS (Whisper STT + nova fallback) |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for community voice TTS |
| `CHECKR_API_KEY` | Checkr background check API key |
| `CHECKR_PACKAGE` | Checkr screening package slug (e.g. `tasker_standard`) |
| `CHECKR_WEBHOOK_SECRET` | Checkr webhook HMAC signing secret |
| `SMTP_HOST` | SMTP server hostname for transactional email |
| `SMTP_PORT` | SMTP server port (default 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID for SMS multi-modal fallback |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Twilio sending phone number |
| `STRIPE_IDENTITY_WEBHOOK_SECRET` | Stripe Identity webhook signing secret (separate from main webhook) |
| `ADMIN_BOOTSTRAP_SECRET` | One-time secret to bootstrap the first admin account |
| `NIA_DAILY_COST_THRESHOLD` | Anthropic daily spend alert threshold in USD (default: 10) |

See `.env.railway.example` for the full reference.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22+, TypeScript 5.9 |
| Frontend | React 19, Vite, Tailwind CSS 4, Framer Motion |
| Routing | Wouter |
| Data Fetching | TanStack Query (React Query) |
| Maps | Mapbox GL / react-map-gl |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod, drizzle-zod |
| API Codegen | Orval (OpenAPI → React Query hooks + Zod) |
| Background Jobs | BullMQ (Redis) with setInterval fallback |
| Payments | Stripe |
| Push Notifications | Web Push API (VAPID) |
| i18n | i18next (English + Spanish) |
| Monorepo | pnpm workspaces |

---

## Where Things Live

```
lib/
  api-spec/openapi.yaml              ← single source of truth for API contracts
  db/src/schema/                     ← Drizzle ORM schema files
  db/migrations/                     ← SQL migration files (applied on deploy)
  api-client-react/src/generated/   ← generated React Query hooks (do not hand-edit)
  api-zod/src/generated/            ← generated Zod validation schemas (do not hand-edit)

artifacts/
  api-server/src/routes/            ← Express route handlers
  api-server/src/middlewares/       ← Auth, authz, rate limiting
  api-server/src/workers/           ← BullMQ background workers
  api-server/src/__tests__/         ← Supertest unit + integration tests
  nia-service/src/                   ← Nia AI service (Claude, runs on port 3001)
  pay-it-forward/src/pages/         ← React page components
  pay-it-forward/src/components/    ← Shared UI components
  pay-it-forward/src/lib/           ← Auth helpers, hooks, context

supabase/
  functions/legacy-engine/          ← Supabase edge function for Family Vault RPG
  migrations/                        ← Supabase-specific migrations (mirrored from lib/db)
```

---

## Key Commands

```bash
# Full typecheck across all packages
pnpm run typecheck

# Build everything (typecheck + compile)
pnpm run build

# Regenerate API hooks and Zod schemas from OpenAPI spec
# Run this after ANY change to lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen

# Push DB schema changes to development database
pnpm --filter @workspace/db run push

# Apply DB migrations (non-interactive, safe for CI/Railway)
pnpm --filter @workspace/db run migrate

# Run backend tests
pnpm --filter @workspace/api-server run test
```

---

## Product Screens

| Route | Description |
|---|---|
| `/` | Live Mapbox map — open requests + online helpers in real time |
| `/request/new` | Create a help request (category, urgency, payment type) |
| `/request/:id` | Track a live request — claim → en-route → arrived → complete |
| `/community` | Leaderboard, stats, civic resources for Tarrant County |
| `/wallet` | Benevolence wallet, scheduled payments, pay-it-forward pledges |
| `/profile` | User profile, helper mode toggle, trust score |
| `/family-vault` | Family Vault — preserve family memories, photos, stories |
| `/legacy-home` | Legacy Engine — RPG-style ancestor storytelling game |
| `/admin` | Token-gated trust & safety report review queue |

---

## Architecture Decisions

- **Contract-first OpenAPI:** The spec in `lib/api-spec/openapi.yaml` is the single source of truth. Orval generates both server Zod schemas and client React Query hooks. Never hand-write types that codegen produces.
- **Stateless auth:** HMAC-SHA256 tokens signed with `SESSION_SECRET`. No database sessions.
- **Admin auth:** `X-Admin-Token` header checked against `ADMIN_SECRET`. Frontend stores token in sessionStorage.
- **Single Railway service:** Both api-server and nia-service run in the same container. `scripts/start.sh` runs migrations, starts nia-service (supervised, port 3001), then starts api-server in the foreground. Nia-service is proxied via `/api/nia/*` — callers never talk to port 3001 directly.
- **Civic resources:** Seeded in the DB — 19 Tarrant County organizations across 8 categories.
- **WebSocket hub** (`/ws`): Broadcasts live events — new requests, helper location updates, new reports, report reviews.
- **BullMQ workers:** Handle payouts, pledges, and notification delivery. Production refuses to start without `REDIS_URL`; development retains the explicit interval fallback.
- **Legacy account passwords:** Users with `password_hash = null` get `password_reset_required: true` on login. The frontend shows an inline "Set Password" prompt that calls `PATCH /api/users/:id` with `new_password`.

---

## Testing

```bash
pnpm --filter @workspace/api-server run test
```

Tests live in `artifacts/api-server/src/__tests__/`. The DB is mocked — no real Postgres connection needed.

- `lifecycle.test.ts` — request lifecycle authorization (claim, en-route, arrived, complete, tip) + happy-path flows
- `users.test.ts` — user registration, login, and duplicate-email rejection

---

## Gotchas

- After any OpenAPI spec change, always run `pnpm --filter @workspace/api-spec run codegen` before restarting the server.
- The Vite dev server has `fs.allow` set to the workspace root (`../..`) so it can serve `lib/api-client-react` source files.
- `ADMIN_SECRET` must be set via environment secrets — never hardcode it.
- Mapbox and Stripe keys are split: `VITE_*` prefix bakes them into the frontend bundle at build time; unprefixed versions are for server-side use only.
- Mobile: the map view uses `100dvh` and `pb-safe` padding for iOS notch/home-bar compatibility.
- Railway deploy: `scripts/start.sh` runs migrations before starting servers. If migrations fail, the deploy stops (non-zero exit). Never remove the migration step from the start command.
