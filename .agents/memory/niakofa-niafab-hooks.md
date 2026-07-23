---
name: Niakofa NiaFab safe-area hook ordering
description: Why safeAreaBottom useRef is declared last in NiaFab, and why closures reading it at call time are safe.
---

## Rule
In `NiaFab` (NiaDrawer.tsx), `safeAreaBottom` is a `useRef(0)` declared **after** all other hooks (after `onPC` useCallback). The `clampToViewport`, `onPM`, and `onPU` callbacks reference `safeAreaBottom.current` in their bodies.

This ordering is intentional and safe:
- JavaScript closures capture the **binding** (the variable slot), not the value at creation time.
- `const safeAreaBottom = useRef(0)` is hoisted but TDZ'd within the component function scope.
- The callback bodies only **execute** when the FAB is actually being dragged — long after the component function has fully run and `safeAreaBottom` is initialized.
- No TDZ violation occurs because no code reads `safeAreaBottom` at component initialization time.

**Why:** Adding new `useRef` or `useEffect` hooks at any position other than LAST would shift the hook array indices of all subsequent hooks, breaking React's hook identity system across HMR hot-reloads. Declaring LAST preserves existing hook order.

**How to apply:**
- Any new hook added to `NiaFab` must go at the end (after `safeAreaBottom`'s useRef and useEffect).
- `safeAreaBottom.current` is populated once on mount via a CSS env() probe element — accurate for the session, no polling needed.
- Cursor feedback (`grabbing`/`grab`) is applied **imperatively** via `divRef.current.style.cursor` in pointer handlers, not via state, to avoid re-renders during drag.
