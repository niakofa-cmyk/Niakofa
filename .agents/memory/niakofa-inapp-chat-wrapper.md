---
name: Niakofa InAppChat wrapper pattern
description: InAppChat.tsx exports a wrapper (InAppChat) and an inner component (InAppChatCore) to avoid React rules-of-hooks violation from early return before useState calls.
---

# InAppChat wrapper pattern

**Rule:** `InAppChat` (exported) is a thin wrapper: returns null when `requestId` is falsy, otherwise renders `InAppChatCore`. `InAppChatCore` contains all hook calls and the full UI. Never add conditional returns before hooks inside `InAppChatCore`.

**Why:** An early `if (!requestId) return null` before `useState` calls in the same function body violates React's rules of hooks (conditional hook execution across renders). The wrapper pattern keeps the guard outside the hook-owning component.

**How to apply:** Any new guards or conditional renders for InAppChat go in the `InAppChat` wrapper, not in `InAppChatCore`. File: `artifacts/pay-it-forward/src/components/InAppChat.tsx`.
