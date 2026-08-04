---
name: Niakofa list-view claim gating & search polish
description: RequestCard Accept must always be gated behind helperModeActive at the component level, and handleClaim must guard logged-out taps centrally.
---

- `RequestCard`'s Accept button is now disabled whenever `!helperModeActive` (with the same "Switch to Helper Mode in the top bar to claim requests" hint text used elsewhere), not just visually implied by which parent conditionally renders it. `BottomSheet` only ever mounts when `helperModeActive` is already true, so this was a no-op change there — but `RequestListView` has no such mount guard (it's reachable by anyone in any mode), so the gate has to live in the shared card, not the parent.
- **Why:** a claim surface that is "safe" only because of *how it happens to be reached today* silently stops being safe the moment a new caller (like an accessible list view) reaches the same shared component a different way. Any future shared card/action component needs its own gate, not an inherited one.
- `handleClaim` in `map.tsx` now redirects to `/login` itself when `currentUser` is null, instead of every call site needing its own guard — put auth guards on the shared handler, not on each caller.
- Any overlay/search-box pattern in this app should support click-outside + Escape to dismiss, and if it can set a "searched away from my location" state, it should offer a one-tap way back to real location from inside the open overlay (not just an external Recenter button).
