---
name: Niakofa forgot-password dev mode & security
description: How reset codes are delivered when SMTP is not configured, and the production safety gates.
---

## Rule
Forgot-password route (`POST /users/forgot-password`) has two paths:
- **Production** (SMTP_USER set OR NODE_ENV=production): sends code via email only. Never logs or returns code.
- **Dev/test** (SMTP_USER NOT set AND NODE_ENV is explicitly "development" or "test"): logs code to console via `logger.warn`, returns `{ ok, dev_code, dev_notice }` in response. Frontend auto-fills the code field and shows an amber dev-mode notice.

The gate is a **strict allowlist** (`NODE_ENV === "development" || NODE_ENV === "test"`), NOT a "not production" check. This prevents a misconfigured prod instance (without NODE_ENV=production set) from leaking reset codes.

## Why
Without SMTP configured in dev, password reset was completely broken — code stored in DB but never delivered. The strict allowlist was required to satisfy code review: "not production" would fire if NODE_ENV is unset in production.

## How to apply
- To configure email delivery in production: set SMTP_HOST, SMTP_USER, SMTP_PASS in Railway environment variables.
- In Replit dev: forgot-password auto-fills code in UI and shows amber banner — no email needed for testing.
- Never extend the dev_code gate to cover "staging" unless NODE_ENV=staging is explicitly set and verified safe.
