---
name: Niakofa secrets required
description: Complete list of required and optional environment secrets; which features fail without them.
---

## Critical Secrets (App Broken Without These)

| Secret | Used For | What Breaks |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | Client-side map rendering | Map shows blank / error |
| `MAPBOX_TOKEN` | Server-side navigation routing | Navigation returns 503 |
| `ANTHROPIC_API_KEY` | Nia AI conversations | Nia logs FATAL error at startup, all chat returns error |
| `INTERNAL_SECRET` | api-server ↔ nia-service auth | Nia service rejects all calls (503) |

**Both** `VITE_MAPBOX_TOKEN` and `MAPBOX_TOKEN` must be set to the same Mapbox token value.
- VITE_ prefix is Vite's mechanism to expose vars to the browser bundle
- navigation.ts reads: `process.env.MAPBOX_TOKEN ?? process.env.VITE_MAPBOX_TOKEN`
- A previous bug: navigation.ts read `VITE_MAPBOX_TOKEN` server-side (WRONG — VITE_ vars are build-time only)

## Optional Secrets

| Secret | Feature |
|---|---|
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Push notifications to helper phones |
| `STRIPE_SECRET_KEY` + `VITE_STRIPE_PUBLISHABLE_KEY` | Pool donations, pledge payments |
| `CHECKR_API_KEY` + `CHECKR_WEBHOOK_SECRET` | Background checks for helpers |
| `REDIS_URL` | BullMQ workers (SMS reminders, async jobs) |
| `OPENAI_API_KEY` | Nia voice transcription (Whisper) + TTS |
| `NIA_SERVICE_URL` | Production nia-service URL (dev default: localhost:3001) |
| `SESSION_SECRET` | HTTP sessions — **already set in Replit** |

## How to Check Config Status

Admin panel → System tab → Global Ops → Feature Verification shows a banner with:
- `config_status.critical_missing` — list of secrets still needed
- `config_status.notes` — human-readable summary
- Per-feature green/red grid

**Why:** Without MAPBOX + ANTHROPIC + INTERNAL_SECRET, the map, navigation, and Nia AI are completely non-functional even though the rest of the app (requests, auth, admin) works fine.
