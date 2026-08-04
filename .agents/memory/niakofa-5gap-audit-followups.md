---
name: Niakofa 5-gap audit follow-up fixes
description: Quality gaps found after verifying the 5-gap audit pass; all closed July 20 2026.
---

## What was fixed (beyond the original 5 gaps)

All 5 original gaps confirmed present in the codebase (tip-wallet, griot DELETE, tx pagination, toggle-admin, iOS font-size). Four additional quality gaps were closed:

### 1. wallet.tsx — tip_sent had no icon
`txIcon()` handled `tip_received` but not `tip_sent`. Added case returning `ArrowUpRight` + orange color so outgoing tips look distinct from incoming ones.

### 2. wallet.tsx — TipModal 402 redirect lost context
TipModal redirects to `/wallet?tip_amount=X&tip_request=Y&tip_helper=Z` on 402 (insufficient_balance) but wallet.tsx read only `requestId`/`amount` (pledge params). Added a mount-time `useEffect` that reads tip params, sets `pendingTip` state, and cleans the URL. A dismissible yellow banner ("Tip pending — add funds first") now shows the pending tip amount and helper name so the user knows exactly what to do.

### 3. globe.tsx — no delete button for griot stories
DELETE `/api/griot/stories/:id` existed but the "My stories & translations" panel had no UI for it. Added:
- `deleteStory()` async function with optimistic list update + map pin refresh
- Trash2 icon button in translations panel header (only for author, via `author_id === currentUser.id`)
- Inline confirm prompt before the destructive call
- Story selector pill bar when author has >1 story

### 4. admin.tsx AdminUser interface missing is_admin
`AdminUser` interface lacked `is_admin?: boolean`, forcing all toggle-admin callsites to cast `(actionUser as AdminUser & { is_admin?: boolean })`. Added the field; removed casts.

**Why:** These were all "the route exists but the UI doesn't expose it" or "the state isn't forwarded" gaps — the hardest kind to catch because they produce no errors.

**How to apply:** When adding a new backend route, always check that the matching UI surface (delete button, error state, redirect handler) is wired before closing the task.
