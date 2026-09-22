---
name: Niakofa onboarding system
description: Registration, password validation, ToS, global cities, Admin Live Banner
---

## Rule
Full onboarding stack is built and verified. All validation is server-side AND client-side.

**Backend (artifacts/api-server/src/routes/users.ts):**
- Password validated BEFORE bcrypt.hash (prevents CPU amplification attack on invalid passwords)
- Minimum 8 chars enforced server-side with clear error messages
- Business/sponsor/organization accounts auto-set approval_status='pending'
- WS broadcast: `new_account_pending` (business/sponsor) + `new_helper_application` (helpers) sent on registration AND on PATCH /users/:id/helper-application
- Welcome email sent non-blocking (mailer may not be configured in dev — swallowed)

**Backend (artifacts/api-server/src/routes/admin-analytics.ts):**
- GET /admin/pending-summary — requireAdmin; returns pending_accounts, pending_helper_apps, pending_hardships, pending_reports, total_action_items, refreshed_at
- hardship columns queried via raw SQL (graceful fallback if column absent)

**Frontend (artifacts/pay-it-forward/src/pages/login.tsx):**
- ToS checkbox required for registration (state resets on mode toggle)
- Password strength meter (4 levels: too short/weak/fair/strong)
- Client-side: password length < 8 → disables submit button
- Mode toggle uses handleModeSwitch() to reset tosAccepted

**Frontend (artifacts/pay-it-forward/src/pages/onboarding.tsx):**
- GLOBAL_CITY_SUGGESTIONS: 175+ cities across Africa, Caribbean, US diaspora, Europe, Asia
- City search uses includes() not startsWith() for mid-string matching

**Frontend (artifacts/pay-it-forward/src/components/AdminLiveBanner.tsx):**
- NEW component: real-time pending counts for admin
- 30s poll + WS-driven instant updates on new_account_pending/new_helper_application
- WS connectivity tracked via 5s interval using wsIsConnected()
- onNavigate prop drives admin tab switching when clicking pending items

**Frontend (artifacts/pay-it-forward/src/pages/admin.tsx):**
- AdminLiveBanner mounted after sticky header (before tab content)
- Uses setActiveTab to navigate when banner item is clicked

**Why:** All validation must be server-side. bcrypt before validation = CPU amplification. Admin real-time awareness requires both WS events AND polling fallback.
