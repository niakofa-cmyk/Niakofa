---
name: Niakofa Nia AI admin toggle
description: Full kill-switch architecture for Nia AI — how it's enforced, broadcast, and consumed
---

## Rule
The Nia AI kill-switch is DB-backed (system_settings table), transactional, and WS-broadcast. Never assume it's just a UI flag.

**Backend enforcement (three layers):**
1. `POST /api/nia/chat` (nia-proxy.ts) → `isNiaEnabled()` check → 503 when off
2. `POST /api/nia/voice/speak` (nia-voice.ts) → same check → 503 when off
3. WS broadcast on every toggle (`broadcast({ type: "nia_status", payload: { enabled, source: "admin_toggle", toggled_at } })`)

**Toggle endpoint (admin-analytics.ts):**
- `POST /admin/nia-toggle` — requireAuth + requireAdmin + adminLimiter
- Both DB writes (`nia_enabled` + `nia_last_toggled_at`) wrapped in a single DB transaction
- Broadcast fires ONLY after successful transaction commit (no partial-write broadcasts)
- Returns `{ ok, enabled, toggled_at }` — never broadcast on DB failure
- `GET /admin/nia-status` returns `{ enabled, last_toggled_at }` — public, no auth

**Frontend instant update (no 60s wait):**
- `NiaGlobal.tsx` starts with `useState<boolean | null>(null)` (not true) — prevents FAB flicker
- `NiaFab` receives `enabled={niaEnabled === true}` — hidden during loading (null) and when disabled
- Both NiaGlobal.tsx and App.tsx subscribe to WS `nia_status` events, set `niaEnabled` immediately
- Both still poll every 60s as a fallback when WS is disconnected
- Check `payload.enabled` is boolean before updating state

**Admin NiaTab UI (admin.tsx):**
- 30s auto-refresh via `setInterval` on `loadStatus(quiet=true)`
- WS subscription shows "WS confirmed ENABLED/DISABLED at HH:MM" indicator for 8s after toggle
- Broadcast confirm banner shown after successful toggle
- Per-feature breakdown: Chat (OFF), Voice TTS (OFF), Context/Crisis/Check-in (unaffected)
- "Send Test Ping" button → POST /api/nia/chat; 503 confirms kill-switch working
- Manual refresh button on status card; `last_toggled_at` shown as "X min ago"

**What is NOT gated by the toggle:**
- `GET /api/nia/voice/profiles` — public metadata, always available
- `/api/nia/context` — context endpoint  
- Crisis resources / check-in AI worker (uses direct API, not proxied)
- Login screen hero NiaOrb (intentionally always alive to greet visitors)

**Why:**
The original had no WS broadcast (60s lag), no voice endpoint gating, two non-atomic DB writes, and an optimistic initial state (FAB flicker when Nia is disabled).

## Audit log (compliance trail)
`nia_toggle_audit` table (append-only) records every kill-switch flip: admin_user_id, admin_email, enabled, optional reason (max 500 chars), created_at. Legal/compliance needs a verifiable "who/when/why" trail for AI enable/disable decisions (see replit.md → "Legal/tax flags"). `POST /api/admin/nia-toggle` accepts optional `reason` in body; the audit insert is best-effort in its own try/catch so a logging failure never blocks the actual kill-switch flip. `GET /api/admin/nia-audit-log?limit=` (admin-only, adminLimiter) returns recent entries newest-first; widget lives in admin.tsx NiaTab below the confirm sheet.
