---
name: Niakofa Nia kill-switch audit log
description: Compliance paper-trail table for Nia AI enable/disable events
---

`nia_toggle_audit` table (append-only) records every Nia kill-switch flip: admin_user_id, admin_email, enabled, optional reason (max 500 chars), created_at.

**Why:** legal/compliance needs a verifiable "who/when/why" trail for AI enable/disable decisions (see replit.md → "Legal/tax flags").

**How to apply:** POST `/api/admin/nia-toggle` accepts optional `reason` in body; the audit insert is best-effort and wrapped in its own try/catch so a logging failure never blocks the actual kill-switch flip. GET `/api/admin/nia-audit-log?limit=` (admin-only, adminLimiter) returns recent entries newest-first. Frontend widget lives in admin.tsx NiaTab below the confirm sheet.
