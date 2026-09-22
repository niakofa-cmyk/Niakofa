---
name: Niakofa business accounts
description: Business-account feature — schema, routes, security guards, known bugs fixed.
---

# Business Account Feature

## Schema
- `businessesTable` (lib/db/src/schema/businesses.ts): approval_status text (pending/approved/rejected), created_by_user_id
- `businessMembersTable`: role (owner/staff), status (active/pending/removed), spending_cap_cents (nullable), unique(business_id, user_id)
- `requestsTable.business_id`: FK to businesses, nullable
- `requestsTable.status` uses plain `text` (not pgEnum) — "pending_owner_approval" is valid as a string

## Migrations
- 0027: businesses + business_members + business_id on help_requests
- 0028 (no-transaction): ALTER TABLE business_members ADD spending_cap_cents; ALTER TYPE help_request_status ADD VALUE pending_owner_approval — NOTE: even though requests.status is text (not enum), this migration is safe to run; the enum ALTER is no-op on a text column
- 0028b: partial index on help_requests WHERE status='pending_owner_approval'
- 0031: seeds businesses_enabled='true' in system_settings

## Feature Flag
- `businesses_enabled` in system_settings gates `POST /businesses` and `POST /requests` (business path)
- Seeded by migration 0031 — fresh DBs have it on by default
- Admin can toggle via system_settings table directly

## Route Security Guards
- `requireBusinessOwner()` — verifies active membership with role='owner'
- `requireBusinessMember()` — verifies active membership, any role
- Admin bypass on `GET /businesses/:id` — checks `usersTable.is_admin` and skips membership guard
- All non-admin routes have `generalApiLimiter`; admin routes have `adminLimiter`

## Known Bugs Fixed
1. `POST /businesses/:id/members` now checks business.approval_status === 'approved' before inviting. Returns 403 otherwise.
2. Member re-invite: changed from `onConflictDoNothing` to `onConflictDoUpdate` to reactivate removed members.
3. `business-apply.tsx` remove() was passing `m.id` (membership row id) but backend expects `m.user_id`. Fixed.

**Why:** The DELETE backend route at `:memberId` is parsed as `targetUserId` and matched against `businessMembersTable.user_id`. Passing the wrong id silently no-ops or hits the wrong row.

## Frontend
- `business-apply.tsx`: BusinessMembersTab, PendingApprovalQueue, BusinessRequestsDashboard, CapEditor
- `request-new.tsx`: "posting as" switcher auto-defaults payment_type to 'immediate' when business selected (prevents goodwill default)
- `admin.tsx`: business applications review queue under OrgsTab

## Lifecycle: staff-posted requests
1. Staff posts request with business_id
2. requests.ts checks: businesses_enabled → business approved → active membership → spending cap
3. Sets status = 'pending_owner_approval' (staff) or 'open' (owner)
4. Owner sees queue via GET /businesses/:id/pending-requests
5. PATCH /businesses/:id/requests/:requestId/approve { action: 'approve'|'reject' }
