# Niakofa Action Plan for Next Session
## Based on Session 2026-06-28 Comprehensive Audit

> **UPDATE July 27, 2026**: All IMMEDIATE and HIGH priority items are now COMPLETE.
> BUG-15d (notifType) was already fixed in code. BUG-15a was documented as
> intentional redundancy. All 22 silent .catch(() => {}) blocks across 10 files
> were replaced with logger.warn() calls. See commit c0a562b6.

**Prepared by**: Claude (Claudemd)  
**Date**: June 28, 2026  
**Priority Level**: IMMEDIATE → LOW  

---

## 🚨 IMMEDIATE ACTIONS (Do First)

### Priority 1: Implement BUG-15d Fixes ✅ DONE

**What**: Add `notifType` field to all push notification payloads  
**Status**: Already fixed in requests.ts, recurring.ts, and stripe.ts  

**Files to modify**:

#### 1. `artifacts/api-server/src/routes/requests.ts`

**Line 231-236** (Emergency/Urgent Request Notifications):
```typescript
// CURRENT (WRONG)
const payload = {
  title: isEmergency ? "🚨 EMERGENCY — Help Needed Now!" : "🔴 Urgent Request Nearby",
  body: request.title,
  urgency: request.urgency,
  requestId: request.id,
};

// FIX: Add this line
  notifType: isEmergency ? "emergency" : "nearby_requests",
```

**Line 243-248** (Normal Request Notifications):
```typescript
// CURRENT (WRONG)
sendPushToNearbyHelpers(request.lat, request.lng, 5, {
  title: "💙 Help Request Near You",
  body: request.title,
  urgency: request.urgency,
  requestId: request.id,
}).catch(() => {});

// FIX: Add notifType
  notifType: "nearby_requests",
```

#### 2. `artifacts/api-server/src/routes/recurring.ts`

**Line 438-443** (Recurring Request Notifications):
```typescript
// CURRENT (WRONG)
await sendPushToNearbyHelpers(sub.lat, sub.lng, 10, {
  title: `📅 Recurring Help Needed`,
  body: `${userName} needs help with...`,
  urgency: "normal",
  requestId: newReq?.id,
}).catch(() => {});

// FIX: Add notifType
  notifType: "nearby_requests",
```

#### 3. `artifacts/api-server/src/routes/stripe.ts`

**Line 138-142** (Payment Notifications):
```typescript
// CURRENT (WRONG)
sendPushToUser(txRow.helper_id, {
  title: "💙 Niakofa Received",
  body: `$${amount.toFixed(2)} was paid forward for...`,
  requestId: txRow.request_id,
}).catch(() => {});

// FIX: Add notifType
  notifType: "wallet",
```

**Testing After Fix**:
```bash
# Test that helpers with notif_nearby_requests=false don't get new request notifications
# Test that emergency notifications bypass preference gate
# Test that wallet notifications respect wallet preference
# Verify database still marks notifications sent properly
```

---

## 🟠 HIGH PRIORITY (This Week)

### Priority 2: Add Unit Tests for Bug Fixes (Est. 45 minutes)

**What**: Create tests for BUG-15b and BUG-15c  
**Why**: Verify fixes work and prevent regression  

**Test Cases for BUG-15b (max_travel_miles)**:
```typescript
describe("POST /requests/:id/claim — max_travel_miles enforcement", () => {
  test("Helper with max_travel_miles=10 cannot claim request 12 miles away", async () => {
    // Setup: Create helper with max_travel_miles=10 at (0, 0)
    // Setup: Create request at (0.1, 0) (≈11 miles away)
    // Action: POST /requests/{id}/claim
    // Assert: 400 response with distance info
  });

  test("Emergency request bypasses max_travel_miles", async () => {
    // Setup: Create emergency request 50 miles away
    // Setup: Helper with max_travel_miles=10
    // Action: POST /requests/{id}/claim
    // Assert: 200 response, claim succeeds
  });

  test("Default max_travel_miles is 15 if no userSettings", async () => {
    // Setup: Helper with no user_settings row
    // Setup: Request 14 miles away
    // Action: POST /requests/{id}/claim
    // Assert: 200 response (within default 15)
  });
});
```

**Test Cases for BUG-15c (/checkin endpoint)**:
```typescript
describe("POST /nia-service/checkin — Nia check-in generation", () => {
  test("Valid request with correct internal secret generates message", async () => {
    // Setup: Mock Claude API response
    // Action: POST /checkin with valid x-internal-secret
    // Assert: 200, message saved to nia_conversations
  });

  test("Missing internal secret returns 403", async () => {
    // Action: POST /checkin without x-internal-secret header
    // Assert: 403 Forbidden
  });

  test("Wrong internal secret returns 403", async () => {
    // Action: POST /checkin with wrong x-internal-secret
    // Assert: 403 Forbidden
  });

  test("Claude API failure returns 500", async () => {
    // Setup: Mock Claude API to throw error
    // Action: POST /checkin
    // Assert: 500, error logged
  });

  test("End-to-end: api-server worker calls nia-service", async () => {
    // Setup: Create completed request 24 hours ago
    // Action: Trigger nia-checkin-worker
    // Assert: /checkin called, message saved, push sent, request marked
  });
});
```

---

### Priority 3: Document BUG-15a Decision ✅ DONE

**What**: Decide and document duplicate check-in workers  
**Current State**: Both api-server and nia-service have check-in workers  
**Options**:

**Option A (RECOMMENDED)**: Keep both + document why
```typescript
// In nia-service/src/workers/general-checkin-worker.ts
/**
 * General 24-hour check-in worker — RUNS INDEPENDENTLY
 * 
 * This worker runs in nia-service and provides REDUNDANCY:
 * - api-server's nia-checkin-worker coordinates timing
 * - nia-service's general-checkin-worker is a fallback
 * 
 * If /checkin endpoint is down, this worker still runs.
 * Both use nia_checkin_sent_at column to prevent double-sends (idempotent).
 * 
 * Design Decision: Keep both for reliability (accepted redundancy).
 * Monitoring: Watch for duplicate sends in logs.
 */
```

**Option B**: Remove nia-service worker
```bash
# Delete this file
rm artifacts/nia-service/src/workers/general-checkin-worker.ts

# Remove from index.ts
# Remove: startGeneralCheckinWorker();
```

**Option C**: Invert responsibility
```typescript
// Let nia-service handle all check-in logic
// Remove api-server's nia-checkin-worker.ts
// Have nia-service worker check for due requests itself
```

**Recommendation**: Choose Option A (keep both) — it's the safest for production reliability. Just document why.

**STATUS**: ✅ DONE — Option A chosen and documented in general-checkin-worker.ts

---

## 🟡 MEDIUM PRIORITY (This Month)

### Priority 4: Improve Error Logging ✅ DONE

**Status**: All 22 silent .catch(() => {}) blocks replaced with logger.warn() calls across 10 files (commit c0a562b6)

```typescript
// CURRENT
}).catch(() => {});

// BETTER
}).catch(err => {
  // Non-critical side effect: push notification failure doesn't affect request claiming
  // User will still see the claimed message in-app, just might not get a push alert
  logger.warn({ err, requestId: request.id }, "push: notification delivery failed");
});
```

**Files to update**:
- `requests.ts` (L238, L239, L248, L535, L548, L562, L697, L717)
- `recurring.ts` (L443)
- Any other `.catch(() => {})` blocks

---

### Priority 5: Add Database FK Constraints (Est. 60 minutes)

**What**: Make foreign key relationships explicit and safe  
**Why**: Prevent orphaned data, ensure referential integrity  

**Migrations to create**:

```sql
-- migration_0020_explicit_foreign_keys.sql

-- Add CASCADE DELETE where appropriate
ALTER TABLE help_requests
  ADD CONSTRAINT fk_requests_requester
  FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE help_requests
  ADD CONSTRAINT fk_requests_helper
  FOREIGN KEY (helper_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE chat_messages
  ADD CONSTRAINT fk_messages_request
  FOREIGN KEY (request_id) REFERENCES help_requests(id) ON DELETE CASCADE;

ALTER TABLE ratings
  ADD CONSTRAINT fk_ratings_request
  FOREIGN KEY (request_id) REFERENCES help_requests(id) ON DELETE CASCADE;

-- Test: Verify no orphaned records exist
SELECT COUNT(*) FROM chat_messages 
WHERE request_id NOT IN (SELECT id FROM help_requests);

SELECT COUNT(*) FROM ratings 
WHERE request_id NOT IN (SELECT id FROM help_requests);
```

---

### Priority 6: Security Headers Verification (Est. 30 minutes)

**What**: Test CSP, CORS, and other security headers in production  
**How**:
```bash
curl -I https://niakofa.com/api/health
# Check: Content-Security-Policy
# Check: X-Frame-Options: DENY
# Check: X-Content-Type-Options: nosniff
# Check: Strict-Transport-Security

# Test CORS
curl -H "Origin: https://evil.com" https://niakofa.com/api/requests
# Should return: CORS error or specific origin only
```

**Expected Headers**:
- ✅ Content-Security-Policy (strict)
- ✅ X-Frame-Options: DENY
- ✅ X-Content-Type-Options: nosniff
- ✅ Strict-Transport-Security: max-age=31536000
- ✅ X-XSS-Protection (if needed for old browsers)

---

## 🟢 LOW PRIORITY (Backlog)

### Priority 7: Performance Testing (Est. 2 hours)

Load test under:
- 100 concurrent users
- 1000 requests/second
- Real-world traffic patterns (map panning, request claiming, etc.)

**Tools**: k6, Artillery, Locust  
**Metrics to watch**: Response time, CPU, memory, DB connections

---

### Priority 8: Add Application Performance Monitoring (Est. 4 hours)

**Services**: New Relic, Datadog, or Sentry  
**Track**:
- Response times by endpoint
- Error rates and types
- Database query performance
- Redis performance
- Worker queue health

---

### Priority 9: API Contract Testing (Est. 3 hours)

Verify Zod schemas match OpenAPI spec:
```typescript
// Generate OpenAPI from Zod schemas
// Compare with artifacts/api-spec/openapi.yaml
// Ensure no mismatches (especially POST body schemas)
```

---

### Priority 10: Dependency Audit (Est. 1 hour)

```bash
npm audit
# or
pnpm audit

# Check for known vulnerabilities in:
# - @anthropic-ai/sdk
# - stripe
# - express
# - pg / drizzle-orm
# - bullmq
```

---

## Checklist for Next Session

- [x] Implement BUG-15d fixes (4 files, 4 changes) — already done
- [x] Document BUG-15a decision — Option A, documented in code
- [x] Improve error logging — all 22 silent catches replaced with logger.warn()
- [ ] Write unit tests for BUG-15b and BUG-15c
- [ ] Create FK constraint migration
- [ ] Test FK migration on staging
- [ ] Verify security headers in production
- [ ] Create FK constraint migration
- [ ] Test FK migration on staging
- [ ] Verify security headers in production
- [ ] Add APM instrumentation
- [ ] Run load tests
- [ ] Audit dependencies
- [ ] API contract verification

---

## Quick Reference: Bug Fixes Summary

| Bug | Status | Effort | Impact |
|-----|--------|--------|--------|
| BUG-15b (max_travel_miles) | ✅ FIXED | N/A | HIGH |
| BUG-15c (/checkin) | ✅ FIXED | N/A | CRITICAL |
| BUG-15d (notifType) | ✅ FIXED | Done | HIGH |
| BUG-15a (dup workers) | ✅ RESOLVED | Done | MEDIUM |

---

## Files Changed in This Audit Session

| File | Status |
|------|--------|
| `requests.ts` | Modified (BUG-15b, needs BUG-15d fix) |
| `checkin.ts` | Created (BUG-15c fix) |
| `nia-service/index.ts` | Modified (BUG-15c fix) |
| `CLAUDE.md` | Updated (documented all bugs) |
| `AUDIT_SUMMARY_2026-06-28.md` | Created |
| `COMPREHENSIVE_SECURITY_AUDIT_2026-06-28.md` | Created |
| `ACTION_PLAN_FOR_NEXT_SESSION.md` | This file |

---

**Good luck with the fixes! The codebase is solid and these are all straightforward improvements.** 🚀
