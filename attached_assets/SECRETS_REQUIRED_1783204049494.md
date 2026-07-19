# Niakofa — Required Secrets & Environment Variables

This file documents every secret Niakofa needs to function end-to-end globally.
Set them in **Replit → Secrets tab** (the lock icon in the left sidebar).
After adding secrets, restart the **artifacts/api-server: API Server** workflow
and the **artifacts/pay-it-forward: web** workflow.

---

## ⚠️ CRITICAL — App Does Not Work Without These

| Secret Name | Where to Get It | Used For |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | https://account.mapbox.com → Tokens → Create token (free tier) | Map rendering, live traffic layer, terrain, global GPS display |
| `MAPBOX_TOKEN` | Same token as above | Server-side navigation routing (Directions API) — all continents |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys | Nia AI — all conversations, crisis detection, multilingual support |
| `INTERNAL_SECRET` | Generate any random 32+ char string, e.g. `openssl rand -hex 32` | Security: api-server ↔ nia-service communication |

> Both `VITE_MAPBOX_TOKEN` and `MAPBOX_TOKEN` should be the same Mapbox token value.
> The VITE_ prefix is required by Vite to expose it to the browser (client-side map rendering).
> The non-prefixed version is used by the API server for server-side navigation routing.

---

## 🟡 IMPORTANT — Features Disabled Without These

| Secret Name | Where to Get It | Used For |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Generate with `npx web-push generate-vapid-keys` | Push notifications to helpers' phones |
| `VAPID_PRIVATE_KEY` | Same command as above | Push notifications (private key pair) |
| `STRIPE_SECRET_KEY` | https://dashboard.stripe.com → Developers → API Keys | Community pool donations, pledge payments |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Same Stripe dashboard | Client-side Stripe payment modal |
| `SESSION_SECRET` | Random 32+ char string | ✅ **Already set** — HTTP session security |
| `REDIS_URL` | Redis provider (Upstash, Railway Redis, etc.) | Powers the Pay-It-Forward pledge worker (repayment reminders, the 2-year default check-in) and the payout-retry worker (re-attempting a helper's payment if it fails the first time). **Without this set, both workers fail to start — silently, with no error to the user.** Reminders simply never go out and failed payouts never retry. This is core to the platform's "pay whenever, no pressure" promise, not a nice-to-have. |

---

## 🔵 OPTIONAL — Enhanced Features

| Secret Name | Where to Get It | Used For |
|---|---|---|
| `CHECKR_API_KEY` | https://dashboard.checkr.com | Background check verification for helpers |
| `CHECKR_WEBHOOK_SECRET` | Checkr dashboard → Webhooks | Background check result webhooks |
| `OPENAI_API_KEY` | https://platform.openai.com | Nia voice transcription (Whisper) and TTS |
| `NIA_SERVICE_URL` | Your deployed nia-service URL | Production only — defaults to localhost:3001 in dev |
| `VITE_ADMIN_SECRET` | Any secure random string | Extra security layer for admin endpoints |
| `TWILIO_ACCOUNT_SID` | https://console.twilio.com | SMS fallback for helpers without smartphone |
| `TWILIO_AUTH_TOKEN` | Same dashboard | SMS authentication |
| `TWILIO_PHONE_NUMBER` | Same dashboard | SMS sender phone number |

---

## Quick Setup (Minimum to Run the Full App)

```bash
# 1. Get a free Mapbox token at https://account.mapbox.com
VITE_MAPBOX_TOKEN=pk.eyJ1...    # paste your token
MAPBOX_TOKEN=pk.eyJ1...         # same token, different name for server

# 2. Get an Anthropic API key at https://console.anthropic.com  
ANTHROPIC_API_KEY=sk-ant-...

# 3. Generate an internal secret
INTERNAL_SECRET=$(openssl rand -hex 32)
# or just pick any long random string, e.g.: niakofa-internal-2026-xyz-abc-123
```

---

## How to Add Secrets in Replit

1. In the left sidebar, click the **🔒 Secrets** icon (or go to Tools → Secrets)
2. Click **+ New Secret**
3. Enter the **Key** (exact name from the table above) and the **Value**
4. Click **Add Secret**
5. After adding all secrets, restart the workflows:
   - **artifacts/api-server: API Server** — restart this
   - **artifacts/pay-it-forward: web** — restart this (for VITE_ vars to take effect)

---

## Verifying Configuration

Once running, log in as admin (`admin@niakofa.app` / `NiakofaAdmin2026!`) and go to:
**Admin panel → System tab → Global Ops section → Feature Verification**

The Feature Verification grid shows which secrets are configured (✅ green) vs.
missing (❌ red). The banner above the grid tells you exactly which critical
secrets are still needed.

---

## Global Reach — What Each Secret Enables

| Region | Needs |
|---|---|
| 🌍 Africa (Lagos, Nairobi, Accra, Kampala, Addis Ababa…) | VITE_MAPBOX_TOKEN + MAPBOX_TOKEN |
| 🌎 US Diaspora (Fort Worth, Atlanta, Houston, NYC, DC, Minneapolis…) | VITE_MAPBOX_TOKEN + MAPBOX_TOKEN |
| 🌎 Caribbean (Kingston, Port-au-Prince) | VITE_MAPBOX_TOKEN + MAPBOX_TOKEN |
| 🏛️ Europe (London, Paris, Brussels) | VITE_MAPBOX_TOKEN + MAPBOX_TOKEN |
| 🌎 South America (São Paulo, Brazil) | VITE_MAPBOX_TOKEN + MAPBOX_TOKEN |
| 🤖 Nia AI (all regions, all languages) | ANTHROPIC_API_KEY + INTERNAL_SECRET |
| 📱 Push notifications (all regions) | VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY |
| 💳 Donations & payments | STRIPE_SECRET_KEY + VITE_STRIPE_PUBLISHABLE_KEY |

Mapbox's Directions API is a **global routing service** — it routes in Africa,
Asia, Europe, and the Americas equally. Once the token is set, navigation works
everywhere in the world.
