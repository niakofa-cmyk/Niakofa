---
name: Niakofa seed test accounts
description: Three verified test accounts in the dev DB; credentials and role setup; auth bugs discovered during creation.
---

## Test Accounts in Dev DB

All three accounts were created via the live API and verified end-to-end.

| Role | Email | DB id | Notes |
|---|---|---|---|
| **Admin** | admin@niakofa.app | 1 | `is_admin=true` set via psql; password never stored in memory/docs |
| **Helper** | helper@niakofa.app | 2 | `helper_status='approved'` set via psql; `is_helper=true` |
| **User** | user@niakofa.app | 3 | `approval_status='approved'` (auto, individual account) |

## How Admin Privilege is Granted

```sql
UPDATE users SET is_admin = true WHERE email = 'admin@niakofa.app';
```

Admin access is checked via `requireAdmin()` middleware which reads `is_admin` from DB on every admin request. No redeploy needed — just set the column.

## How Helper is Approved

```sql
UPDATE users SET helper_status = 'approved' WHERE email = 'helper@niakofa.app';
```

Normal flow is: user applies via helper-application form → admin approves via `/api/admin/helper-applications/:id`. For test accounts, we set directly.

## Verified Working Flows

| Flow | Result |
|---|---|
| `GET /api/users/me` | ✅ Returns self (any role) |
| `PATCH /api/users/me/helper-mode` | ✅ Toggles helper mode |
| `POST /api/requests` (no requester_id in body) | ✅ Creates request, requester_id from token |
| `POST /api/requests/:id/claim` (helper) | ✅ Claims, status → claimed |
| `GET /api/admin/worker-health` (admin only) | ✅ Returns 13 workers, 8 running |
| Admin endpoint with user token | ✅ 403 blocked |
| `/users/1` with user token (wrong user) | ✅ 403 blocked |

## DB Migrations Applied This Session

```sql
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS hardship_requested_at TIMESTAMPTZ;
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS hardship_note TEXT;
-- is_crisis was incorrectly added to users then dropped:
ALTER TABLE users DROP COLUMN IF EXISTS is_crisis;
-- is_crisis correctly lives on nia_conversations (already present)
```
