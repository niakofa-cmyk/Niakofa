---
name: Niakofa Nia AI admin toggle
description: Full kill-switch architecture for Nia AI — how it's enforced, broadcast, and consumed
---

## Rule
The Nia AI kill-switch is DB-backed (system_settings table), transactional, and WS-broadcast. Never assume it's just a UI flag.

**Backend enforcement (three layers):**
1. `POST /api/nia/chat` (nia-proxy.ts) → `isNiaEnabled()` check → 503 when off
2. `POST /api/nia/voice/speak` (nia-voice.ts) → same check → 503 when off
3. WS broadcast on every toggle (ws-hub.ts `broadcast({ type: "nia_status", payload: { enabled, source: "admin_toggle", toggled_at } })`)

**Toggle endpoint (admin-analytics.ts):**
- `POST /admin/nia-toggle` — requireAuth + requireAdmin + adminLimiter
- Both DB writes (`nia_enabled` + `nia_last_toggled_at`) wrapped in a single DB transaction
- Broadcast fires ONLY after successful transaction commit
- Returns `{ ok, enabled, toggled_at }` — never broadcast on DB failure
- `GET /admin/nia-status` returns `{ enabled, last_toggled_at }` — public, no auth

**Frontend instant update (no 60s wait):**
- `NiaGlobal.tsx` subscribes to WS `nia_status` events, sets `niaEnabled` immediately
- `App.tsx` (map screen NiaGlobal) same WS subscription
- Both still poll every 60s as a fallback when WS is disconnected
- Check `payload.enabled` is boolean (distinguishes admin toggle from per-user error events)
- Check `payload.source === "admin_toggle"` to show WS-confirmed indicator in admin UI

**Admin NiaTab UI (admin.tsx):**
- 30s auto-refresh via `setInterval` on `loadStatus(quiet=true)`
- WS subscription shows "WS confirmed ENABLED/DISABLED at HH:MM" indicator for 8s after toggle
- Broadcast confirm banner shows "✅ Nia enabled — WS broadcast sent to all users instantly"
- Per-feature breakdown: Chat (OFF), Voice TTS (OFF), Context/Crisis/Check-in (unaffected)
- "Send Test Ping" button → POST /api/nia/chat; 503 confirms kill-switch is working
- Manual refresh button on status card
- `last_toggled_at` shown as "X min ago"
- Toggle shows spinner while saving

**What unaffected by toggle:**
- `GET /api/nia/voice/profiles` — public metadata, always available
- `/api/nia/context` — context endpoint
- Crisis resources / check-in AI worker (uses direct API, not proxied)

**Why:**
The original implementation had no WS broadcast (60s lag), no voice endpoint gating (TTS still worked when disabled), and two DB writes in Promise.all (no transaction — partial writes could broadcast inconsistent state).
