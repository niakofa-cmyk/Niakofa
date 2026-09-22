---
name: Niakofa Nia fail-closed default
description: Rules for Nia AI kill-switch: default OFF, fail-closed behavior, all routes gated.
---

## The rule
Nia AI is disabled by default. A fresh install shows no Nia FAB until admin explicitly enables it.

## Why
Previously `isNiaEnabled()` used `row?.value !== "false"` — if the DB row was absent (or a DB error occurred), Nia appeared for all users. This is backwards for a feature that costs money (AI API calls) and requires the admin to have verified configuration.

## How to apply
- All three `isNiaEnabled()` implementations (nia-proxy.ts, nia-voice.ts, admin-analytics.ts) must use `row?.value === "true"`.
- All catch blocks in `isNiaEnabled()` must return `false` (fail-closed, not `true`).
- `/nia/voice/transcribe` must check `isNiaEnabled()` — it was missing and bypassed the kill-switch.
- `/admin/nia-status` fallback on DB error must return `{ enabled: false }`.
- Migration seed: `nia_enabled = 'false'` (not 'true').
- Frontend `NiaGlobal` in App.tsx: `useState<boolean | null>(null)` — null means loading, FAB hidden until confirmed. `niaEnabled !== true || hideNiaFab` is the guard. Previously used `useState(true)` which showed FAB before first poll.
- DB default: run `UPDATE system_settings SET value='false' WHERE key='nia_enabled'` on live DB after any accidental enable-then-crash test cycle.
