---
name: Niakofa helper/community mode end-to-end audit
description: Findings and fixes from a full audit pass of Helper mode and Community/Requester mode; also documents two recurring false-positive test signals to stop chasing.
---

## Real fixes made
- Removed dead/unreachable code in the no-WebGL fallback: a `!helperModeActive` check nested inside a `helperModeActive ? (...)` branch could never fire (map.tsx).
- Address-search geocoding (request-new.tsx) now guards against out-of-order responses with a query-token ref, not just the 400ms debounce — two back-to-back debounce windows could otherwise let an older fetch resolve after a newer one and show stale suggestions.
- helper-dashboard.tsx now surfaces `no_show_count` (already returned by GET /users, already typed in api-zod) as an amber notice when >0 — previously collected server-side but never shown to the helper.

## Already-correct, don't "fix" again
- Helper-mode toggle IS gated on `helper_status === "approved"` (profile.tsx) — the toggle itself only renders for approved helpers; TopBar's toggle only appears once already active (for turning off). An audit pass may flag this as "ungated" by only reading TopBar — check profile.tsx too.
- REQUEST_ACCEPTED already auto-navigates the requester to `/request/:id/track` with a toast (map.tsx WS handler) — already covers the "requester doesn't know who accepted" gap.
- Wallet reinstatement flow for defaulted pledges already exists on wallet.tsx (self-service repay + "Reinstate" button) — a missing banner elsewhere pointing to it is a nice-to-have, not a bug.

## False-positive test signals — don't keep re-chasing
- **WebGL init failure in headless test browsers** ("Failed to initialize WebGL" from mapbox-gl) is a testing-sandbox limitation (no GPU), not an app bug — the app's own no-WebGL fallback is what's expected to render, and did.
- **CSP `style-src https://m.stripe.network` console warning** on pages that load Stripe.js comes from Stripe's own internal iframe setting its own CSP — unrelated to our helmet config (which already has `styleSrc: 'unsafe-inline'`), not fixable/actionable from our side, and doesn't break functionality.
