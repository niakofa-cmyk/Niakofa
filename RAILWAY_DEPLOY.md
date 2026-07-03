# Niakofa — Railway Deployment Guide

Last updated: July 2026

## Overview

The Niakofa app (frontend + API server) and Nia AI are deployed as a single Railway service.  
Express serves the pre-built React/Vite frontend when `SERVE_FRONTEND=true`.

---

## Build & Start (railpack.json)

```json
{
  "steps": {
    "build": {
      "commands": [
        "pnpm install --frozen-lockfile",
        "pnpm run typecheck:libs",
        "pnpm --filter @workspace/api-spec run codegen",
        "pnpm --filter @workspace/api-server run build",
        "NODE_ENV=production BASE_PATH=/ pnpm --filter @workspace/pay-it-forward run build"
      ]
    }
  },
  "deploy": {
    "startCommand": "pnpm --filter @workspace/db run migrate && node --enable-source-maps artifacts/api-server/dist/index.mjs"
  }
}
```

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
| `CHECKR_API_KEY` | Background check integration |
| `CHECKR_WEBHOOK_SECRET` | Checkr webhook HMAC |
| `REDIS_URL` | BullMQ job queues (workers degrade to simple setInterval without Redis) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Email (pledge reminders, receipts) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push notifications |

---

## Database

Railway's Postgres plugin auto-sets `DATABASE_URL`. The migration script:
- Creates `postgis` extension automatically
- Is idempotent — safe to run on every deploy
- Has recovery checks for migrations that may have been baseline-marked but never executed
- Advisory lock prevents concurrent migration races on parallel startups
- Fresh DB: runs all migrations from 0000
- Existing DB: runs only new files (baseline-marks 0000–0017, applies 0018+)

---

## Test Accounts (seed data)

After fresh DB provisioning, seed the test accounts:

```bash
# Run in Railway shell or via psql
# These are created automatically on first boot if the seed script runs.
# If not, register manually or apply seed SQL.
```

| Role | Email | Password |
|---|---|---|
| **Admin** | `admin@niakofa.app` | `NiakofaAdmin2026!` |
| **Helper** (approved) | `helper@niakofa.app` | `NiakofaHelper2026!` |
| **User** (standard) | `user@niakofa.app` | `NiakofaUser2026!` |

> ⚠️ Change all passwords before production use.  
> Set `is_admin = true` on the admin user row after first registration.

---

## Health Checks

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/status` | None | Public status page — DB ping, Nia AI state, map key |
| `GET /api/admin/worker-health` | Admin token | BullMQ/cron worker statuses |
| `GET /api/admin/global-ops` | Admin token | GPS health, region buckets, config status |

Set Railway's health check to `GET /api/status` (accepts 200 or 503).

---

## Nia AI

Nia AI is powered by Anthropic Claude (main chat: `claude-sonnet-5`, lightweight tasks: `claude-haiku-4-5-20251001`).

- Admin kill-switch: `POST /api/admin/nia-toggle { "enabled": false }` disables all chat + voice
- Kill-switch state is stored in `system_settings` table (persists across restarts)
- When disabled, `/api/nia/chat` and `/api/nia/voice/speak` return 503
- Voice TTS uses ElevenLabs community voices (if configured) or falls back to OpenAI nova

---

## Common Issues

### "Interactive prompts require a TTY terminal"
**Cause**: Old deploy used `drizzle-kit push` which requires a TTY.  
**Fix**: Migrations now use `pnpm --filter @workspace/db run migrate` (raw SQL, no TTY needed). ✅ Already fixed.

### Migrations ran but columns are missing
**Cause**: Old deploys baseline-marked 0018–0021 without executing them.  
**Fix**: The RECOVERY_CHECKS block in `run-migrations.mjs` detects missing objects and re-queues the files. ✅ Already fixed.

### Frontend shows blank page or 404
**Cause**: `SERVE_FRONTEND` not set to `true`.  
**Fix**: Set `SERVE_FRONTEND=true` in Railway variables.

### Nia returns 503 on all chat requests
**Cause**: Either `ANTHROPIC_API_KEY` is missing, or Nia was admin-disabled.  
**Fix**: Check Railway variables for `ANTHROPIC_API_KEY`. Check admin panel → System → Nia kill-switch.

### CORS errors in browser console
**Cause**: `ALLOWED_ORIGIN` doesn't include the Railway public URL.  
**Fix**: Set `ALLOWED_ORIGIN=https://your-app.up.railway.app` (comma-separated for multiple domains).

---

## Architecture

```
Railway service
├── Build: pnpm install → TS check → codegen → api-server build → vite build
├── Start: migrate DB → start Express server (port $PORT)
└── Express serves:
    ├── /api/*  → API routes (requests, users, Nia proxy, admin)
    ├── /ws     → WebSocket (real-time updates)
    └── /*      → React SPA (artifacts/pay-it-forward/dist/public)

External services:
├── Nia service (nia-service/) — proxied via /api/nia/* (INTERNAL_SECRET auth)
├── Anthropic API — Claude models
├── OpenAI API — Whisper STT + TTS nova fallback
├── ElevenLabs — Community voice TTS
├── Mapbox — Maps + navigation
├── Stripe — Payments
└── Checkr — Background checks
```
