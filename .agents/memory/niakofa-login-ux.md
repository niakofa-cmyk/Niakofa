---
name: Niakofa login UX patterns
description: How wrong-password, account-locked, and forgot-password flows work in the login screen.
---

## Rule
- **Wrong password** → immediately pre-fill email and auto-open forgot-password flow (not a toast with a hint). User gets a recovery path without extra taps.
- **Account locked (429)** → same pattern: pre-fill email + open forgot-password flow.
- **LEGACY_PASSWORD_REQUIRED** → auto-fire forgot-password email, show set-password screen.
- **"Back to sign in"** buttons in forgot-password flow MUST clear: `devResetCode`, `forgotCode`, `forgotStep` — so re-opening always starts fresh.
- `devResetCode` state lives at component level in `LoginScreen` (line ~733), not inside any handler.

## Why
The original hint said "Tap below to reset it" but the "Forgot password?" link was above the Sign In button, not below — confusing UX. Auto-opening the flow is faster and eliminates the misdirection.

## How to apply
Any new auth error that has a reset-password recovery path should follow the same pattern: set `forgotEmail`, `forgotStep: "email"`, clear `devResetCode`, set `forgotPasswordMode: true`.
