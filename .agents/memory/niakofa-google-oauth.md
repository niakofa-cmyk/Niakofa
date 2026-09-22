---
name: Niakofa Google OAuth
description: Google Sign-In implementation details — route, race handling, suspension ordering, env vars, frontend gating
---

## Route
`POST /api/auth/google` in `artifacts/api-server/src/routes/google-auth.ts`

## ID Token Flow
- Frontend: `@react-oauth/google` `GoogleLogin` component → `onSuccess(r)` → `r.credential` (JWT ID token)
- Backend: `google-auth-library` `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`
- `GOOGLE_CLIENT_ID` (server) = `VITE_GOOGLE_CLIENT_ID` (frontend) — same value, must both be set

## Account Find/Link/Create Order
1. SELECT by `google_id` (fast repeat-login path — no mutation)
2. SELECT by `lower(email)` — if found: check suspension BEFORE mutation, then link `google_id`
3. INSERT new row — catch `23505` unique violation (concurrent race), re-fetch winner

**Why:** Suspension must be checked before any mutation (linking) fires. Race-safe INSERT prevents concurrent first-time sign-ins from both crashing with 500 on unique constraint.

## Env Vars Required
- `GOOGLE_CLIENT_ID`: on API server — used by `google-auth-library` to verify tokens
- `VITE_GOOGLE_CLIENT_ID`: on frontend build — gates whether Google button renders at all
- Both must be the **same value** (OAuth 2.0 Client ID from Google Cloud Console)

## Frontend Gating
- `const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ""`
- `{GOOGLE_CLIENT_ID && <GoogleOAuthProvider><GoogleLogin .../></GoogleOAuthProvider>}`
- When unset → button hidden completely; email+password is the only path

## Error Codes Returned
- `GOOGLE_NOT_CONFIGURED` → 503: GOOGLE_CLIENT_ID not set on server
- `GOOGLE_ACCOUNT_USE_OAUTH` → 403 (from `/users/login`): Google-only account trying email+password
- `EMAIL_NOT_VERIFIED` → 401: Google account with unverified email
- `INVALID_GOOGLE_TOKEN` → 401: bad/expired ID token
- `ACCOUNT_SUSPENDED` → 403

## Schema (migration 0041)
- `users.google_id TEXT` — Google "sub" (stable identifier); `UNIQUE WHERE NOT NULL`
- `users.oauth_provider TEXT` — 'google' when linked; NULL = email+password only
- Both columns nullable — email+password and Google coexist on a linked account

## How to Set Up Google OAuth (user instructions)
1. Go to https://console.cloud.google.com → Create/select project
2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
3. Application type: Web application
4. Authorized JS origins: your Replit dev URL + production domain
5. Authorized redirect URIs: same origins (GSI doesn't need a redirect URI for the ID token flow)
6. Copy Client ID → set as `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (frontend)
