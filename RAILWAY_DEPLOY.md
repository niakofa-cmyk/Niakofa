# Niakofa — Railway Deployment Guide

Last updated: July 2026

## Overview

The Niakofa app (frontend + API server + Nia AI service) is deployed as a **single Railway service**.

- **Express API server** serves API routes at `/api/*` and WebSocket at `/ws`
- **Nia AI service** runs on port 3001, proxied via `/api/nia/*` (INTERNAL_SECRET auth)
- **Express** serves the pre-built React/Vite frontend when `SERVE_FRONTEND=true`

---

## Build & Start

### Build (railpack.json)

```json
{
  "steps": {
    "build": {
      "commands": [
        "pnpm install --frozen-lockfile",
        "pnpm run typecheck:libs",
        "pnpm --filter @workspace/api-spec run codegen",
        "pnpm --filter @workspace/api-server run build",
        "NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/pay-it-forward run build",
        "pnpm --filter nia-service run build"
      ]
    }
  }
}
```

Build order matters:
1. **typecheck:libs** — catches type errors before wasting build time on bundling
2. **api-spec codegen** — generates the OpenAPI client used by api-server and frontend
3. **api-server build** — esbuild bundles the Express server to `dist/index.mjs`
4. **frontend build** — Vite builds the React SPA to `dist/public/`
5. **nia-service build** — tsc compiles the Nia AI service to `dist/index.js`

### Start (scripts/start.sh)

```bash
bash scripts/start.sh
```

The start script:
1. Runs database migrations (`pnpm --filter @workspace/db run migrate`)
2. Starts nia-service on port 3001 (supervised — up to 5 restarts in 60s before giving up)
3. Starts the api-server in the foreground (primary process)
4. Forwards SIGTERM/SIGINT to both child processes for clean shutdown

> **Critical**: The `migrate &&` prefix runs database migrations before the server starts.
> If migrations fail, the deploy stops (non-zero exit) — preventing the server from booting
> against a stale schema. Never remove this prefix.

---

## Required Environment Variables

Set all of these in Railway → Service → Variables:

### Mandatory (app will not start without these)
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (Railway auto-sets if you add a Postgres plugin) |
| `SESSION_SECRET` | Minimum 32-char random string for JWT signing |
| `PORT` | Railway sets this automatically — do not override |

### Mandatory for production (app starts but features break)
| Variable | Description |
|---|---|
| `SERVE_FRONTEND` | Set to `true` — makes Express serve the built React SPA |
| `NODE_ENV` | Set to `production` |
| `ALLOWED_ORIGIN` | Comma-separated list of your Railway public URL(s), e.g. `https://niakofa.up.railway.app` |
| `ANTHROPIC_API_KEY` | Powers Nia AI (Claude) — without this, all `/api/nia/*` calls return 503 |
| `OPENAI_API_KEY` | Powers Nia voice TTS (Whisper STT + OpenAI nova fallback) |
| `MAPBOX_TOKEN` | Map tiles, navigation, geocoding |
| `VITE_MAPBOX_TOKEN` | Same token — used by the frontend at build time (`VITE_` prefix required) |
| `INTERNAL_SECRET` | Shared secret for Nia service ↔ API server auth |

### Optional (features degrade gracefully)
| Variable | Description |
|---|---|
| `ELEVENLABS_API_KEY` | Community voice TTS (unlocks regional voice profiles) |
| `ELEVENLABS_VOICE_AAVE_WARM` | ElevenLabs voice ID for AAVE warm profile |
| `ELEVENLABS_VOICE_NIGERIAN_EN` | Nigerian English profile |
| `ELEVENLABS_VOICE_GHANAIAN_EN` | Ghanaian English profile |
| `ELEVENLABS_VOICE_KENYAN_EN` | Kenyan English profile |
| `ELEVENLABS_VOICE_SOUTH_AFRICAN_EN` | South African English profile |
| `ELEVENLABS_VOICE_JAMAICAN_EN` | Jamaican English profile |
| `ELEVENLABS_VOICE_HAITIAN_EN` | Haitian English profile |
| `STRIPE_SECRET_KEY` | Stripe payments |
| `STRIPE_PUBLISHABLE_KEY` | Stripe frontend |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key baked into frontend at build time |
| `CHECKR_API_KEY` | Background check integration |
| `CHECKR_WEBHOOK_SECRET` | Checkr webhook HMAC |
| `REDIS_URL` | BullMQ job queues (workers degrade to simple setInterval without Redis) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email (pledge reminders, receipts) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push notifications |
| `NIA_SERVICE_URL` | Override nia-service URL (defaults to `http://localhost:3001`) |

---

## Database

Railway's Postgres plugin auto-sets `DATABASE_URL`. The migration script:
- Creates `postgis` extension automatically (if available)
- Is idempotent — safe to run on every deploy
- Has recovery checks for migrations that may have been baseline-marked but never executed
- Advisory lock prevents concurrent migration races on parallel startups
- Fresh DB: runs all migrations from 0000
- Existing DB: runs only new files (baseline-marks 0000–0017, applies 0018+)

Migration files live in `lib/db/migrations/` and are numbered sequentially (0000–0104). The runner also has RECOVERY_CHECKs for migrations 0018, 0020–0022, 0092–0104 — these re-apply any migration whose effect (a table, column, or index) is absent even if the file was already recorded as applied (baseline-mark issue).

### Two-database setup (PostGIS vs. plain PostgreSQL)

Railway offers both a plain **PostgreSQL** plugin and a **PostGIS** plugin. Niakofa uses PostGIS `geography(Point, 4326)` columns on `help_requests`, `helpers`, and related tables. **`DATABASE_URL` must point to the PostGIS instance**, not the plain PostgreSQL one:

| Service name | External proxy | Internal hostname |
|---|---|---|
| **PostGIS** ✅ (use this) | `reseau.proxy.rlwy.net:46078` | `postgis.railway.internal` |
| Plain PostgreSQL ❌ | `ballast.proxy.rlwy.net:48530` | `postgres.railway.internal` |

The migration runner auto-creates the `postgis` extension when it's available. If `DATABASE_URL` points to the plain PostgreSQL service, geography inserts will silently produce wrong data or fail.

---

## Health Checks

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/healthz` | None | Lightweight DB connectivity check — **Railway deploy probe** |
| `GET /api/status` | None | Public status page — DB ping, Nia AI state, map key |
| `GET /api/admin/worker-health` | Admin token | BullMQ/cron worker statuses |
| `GET /api/admin/global-ops` | Admin token | GPS health, region buckets, config status |

Railway health check (`railway.toml`: `healthcheckPath`) is set to `GET /api/healthz` — this is a lightweight DB ping that always returns 200 when the server and database are up. `/api/status` is the richer status page used by the frontend; it returns 200 even when optional features (Nia AI, Mapbox) are degraded so it does **not** block deploys.

---

## Nia AI

Nia AI is powered by Anthropic Claude (main chat: `claude-sonnet-5`, lightweight tasks: `claude-haiku-4-5-20251001`).

- Admin kill-switch: `POST /api/admin/nia-toggle { "enabled": false }` disables all chat + voice
- Kill-switch state is stored in `system_settings` table (persists across restarts)
- When disabled, `/api/nia/chat` and `/api/nia/voice/speak` return 503
- Voice TTS uses ElevenLabs community voices (if configured) or falls back to OpenAI nova

### Nia Service Supervision

The nia-service runs on port 3001 inside the same container. If it crashes:
- The supervisor restarts it up to 5 times within a 60-second window
- After 5 crashes, it stops trying and logs the failure (api-server continues running)
- Clean exits (exit code 0 or SIGTERM) do not trigger restart
- SIGTERM/SIGINT to the container cleanly shuts down both processes

---

## Common Issues

### "Interactive prompts require a TTY terminal"
**Cause**: Old deploy used `drizzle-kit push` which requires a TTY.
**Fix**: Migrations now use `pnpm --filter @workspace/db run migrate` (raw SQL, no TTY needed). Already fixed.

### Migrations ran but columns are missing
**Cause**: Old deploys baseline-marked 0018–0021 without executing them.
**Fix**: The RECOVERY_CHECKS block in `run-migrations.mjs` detects missing objects and re-queues the files. Already fixed.

### Frontend shows blank page or 404
**Cause**: `SERVE_FRONTEND` not set to `true`.
**Fix**: Set `SERVE_FRONTEND=true` in Railway variables.

### `/api/status` shows `nia_ai: false` on first deploy
**Cause**: Nia AI is **disabled by default** (`system_settings.nia_enabled = 'false'`). This is intentional fail-closed behavior — the server starts safely without an AI key. The `/api/status` endpoint will show `"nia_ai": false` and `"status": "degraded"` until Nia is explicitly enabled. This does **not** block deploys (`/api/healthz` is the Railway probe, not `/api/status`).
**Fix — after first successful deploy**:
1. Set `ANTHROPIC_API_KEY` in Railway → Service → Variables.
2. Call the admin toggle: `POST https://<your-app>.up.railway.app/api/admin/nia-toggle` with header `x-admin-token: <ADMIN_SECRET>` and body `{ "enabled": true }`.
3. Verify: `GET /api/status` should now show `"nia_ai": true`.

### Nia returns 503 on all chat requests
**Cause**: Either `ANTHROPIC_API_KEY` is missing, or Nia was admin-disabled.
**Fix**: Check Railway variables for `ANTHROPIC_API_KEY`. Check admin panel → System → Nia kill-switch.

### CORS errors in browser console
**Cause**: `ALLOWED_ORIGIN` doesn't include the Railway public URL.
**Fix**: Set `ALLOWED_ORIGIN=https://your-app.up.railway.app` (comma-separated for multiple domains).

### Nia-service crashes repeatedly
**Cause**: Most often `INTERNAL_SECRET` mismatch between api-server and nia-service, or missing `ANTHROPIC_API_KEY`.
**Fix**: Check that `INTERNAL_SECRET` and `ANTHROPIC_API_KEY` are set in Railway variables. The supervisor will stop after 5 crashes — check logs for the root cause.

---

## Architecture

```
Railway service (single container)
├── Build: pnpm install → TS check → codegen → api-server build → vite build → nia-service build
├── Start: migrate DB → start nia-service (supervised) → start api-server (foreground)
└── Express serves:
    ├── /api/*  → API routes (requests, users, Nia proxy, admin, legacy engine, family, diaspora)
    ├── /ws     → WebSocket (real-time updates)
    └── /*      → React SPA (artifacts/pay-it-forward/dist/public)

Nia service (port 3001, same container)
├── /chat          → Claude SSE streaming (proxied via /api/nia/chat)
├── /voice/*       → Whisper STT + OpenAI TTS
├── /memory/*      → Conversation memory
├── /knowledge-refresh → Admin-triggered learning cycle
└── /analyze-image → Vision analysis (proxied via /api/nia/analyze-image)

External services:
├── Anthropic API — Claude models (Nia AI)
├── OpenAI API — Whisper STT + TTS nova fallback
├── ElevenLabs — Community voice TTS
├── Mapbox — Maps + navigation
├── Stripe — Payments
├── Checkr — Background checks
└── Supabase — Edge functions (legacy-engine)
```
