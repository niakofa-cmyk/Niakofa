---
name: Niakofa helper mode + activeRequestId persistence
description: Helper mode was reset to false on every page refresh. Both helperModeActive and activeRequestId now survive navigation.
---

# Helper mode + activeRequestId persistence

**Why:** `useState(false)` ignores `currentUser.helper_mode_active` from the stored user. Any refresh reset the green helper indicator, making helper mode unusable.

**Fix in AppContext.tsx:**
1. `helperModeActive` initialised from `localStorage.getItem("niakofa_user")` via lazy initializer.
2. `setHelperModeActive` writes the updated user back to `localStorage.setItem("niakofa_user", ...)` inside `setCurrentUser`.
3. Startup token validation (`r.ok` branch) calls `setHelperModeActiveState(fresh.helper_mode_active)` after receiving server truth.
4. `activeRequestId` stored in localStorage key `niakofa_active_request`; a wrapper function `setActiveRequestId` (NOT the raw state setter) handles reads/writes. Logout clears both keys.

**How to apply:** Always use `setActiveRequestId(id)` not `setActiveRequestIdState(id)` when updating active request elsewhere. The raw state setter skips localStorage.
