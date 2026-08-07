---
name: Niakofa helper application system
description: How the helper signup, approval workflow, and status gating work across the full stack
---

## The approval flow
`helper_status` goes `null → "pending" → "approved" | "denied"`.
`is_helper=true` is only set on approval. This is enforced both in DB (backend PATCH route sets both fields) and in AppContext WS listener (updates both fields client-side on the `helper_application_approved` event).

## Key locations
- Backend route: `artifacts/api-server/src/routes/users.ts` — `PATCH /users/:id/helper-application` (apply) + `PATCH /admin/helper-applications/:id/review` (admin decision)
- WS events: `helper_application_approved` / `helper_application_denied` — defined in both `ws-hub.ts` (backend) and `wsClient.ts` (frontend); must stay in sync
- Email: `mailer.ts` → `sendHelperApplicationDecision` — fire-and-forget; no-ops if SMTP not configured
- Admin UI: `admin.tsx` HelpersTab — pending/approved/denied queue with approve/deny buttons
- `AppContext.tsx` listens for WS events and updates `currentUser` + shows toast in real time

## TopBar gating
- `helper_status === "approved"` → shows the helper mode toggle switch
- `helper_status === "pending"` → shows a yellow "Under Review" pill instead
- `null` / `"denied"` → nothing shown (user can apply again via profile)

## helper-profile.tsx new fields
Now renders: `helper_skills`, `helper_languages`, `helper_qualifications`, `helper_bio`, `helper_vehicle`, `helper_social_links` from the User object. Falls back to legacy `specialties` array if `helper_skills` is absent.

## Generated type
`UserHelperStatus` is codegen'd from OpenAPI in `api.schemas.ts`. The `User` interface has `helper_status?: UserHelperStatus`. Use `(user as any).helper_status` only in JSX files where the extended fields aren't in strict scope — or import `UserHelperStatus` directly.

## useCallback token bug
`admin.tsx` HelpersTab `load()` had `[token]` in its deps array but `token` is not a variable in scope — it reads from localStorage via `getAdminToken()` each call. Fix: use `[]` as the dependency array.

**Why:** `getAdminToken()` is a pure function reading localStorage — no reactive deps needed.
