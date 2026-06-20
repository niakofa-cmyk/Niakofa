---
name: Niakofa lifecycle auth
description: How request lifecycle endpoints are secured — derived IDs, ownership checks, self-claim prevention.
---

All POST /requests/:id/{claim,en-route,arrived,complete,tip} now require `requireAuth`.

**Pattern (en-route, arrived, complete):**
1. Pre-fetch request from DB: `SELECT helper_id FROM requests WHERE id = :id`
2. Check `request.helper_id !== callerId` → 403
3. Then perform the update using `callerId` (not body value)

**Pattern (claim):**
1. Pre-fetch request from DB: `SELECT requester_id FROM requests WHERE id = :id`
2. Check `requester_id === helperId` → 403 "Cannot claim your own request"
3. `helper_id` = `req.authenticatedUserId` (not body)

**Pattern (tip):**
1. Fetch full request
2. Check `request.requester_id !== callerId` → 403 "Only the requester can tip"
3. `tip_amount` still comes from body (not sensitive)

**Why:** Body-supplied IDs (helper_id, requester_id) are untrusted — any user could forge them. Token-derived IDs are HMAC-verified and unforgeable.

**How to apply:** Any new lifecycle-style mutation endpoint should follow the pre-fetch + token-compare pattern before touching the DB.
