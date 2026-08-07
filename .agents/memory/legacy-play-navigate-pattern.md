---
name: Legacy Play Navigate Pattern
description: Safe deferred navigation pattern used in legacy-play.tsx to prevent navigate-after-unmount.
---

# Safe Deferred Navigation in Legacy Play

`legacy-play.tsx` uses deferred `navigate()` calls (e.g. `setTimeout(() => navigate(...), 600)`) at every routing decision point. These must be registered with a cleanup ref so they are cancelled if the component unmounts before the delay fires.

## Pattern (already applied)
```tsx
const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

useEffect(() => {
  return () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
}, []);

const safeNavigate = useCallback((path: string, delayMs: number) => {
  const id = setTimeout(() => navigate(path), delayMs);
  timersRef.current.push(id);
}, [navigate]);
```

Replace all `setTimeout(() => navigate(...), N)` with `safeNavigate(path, N)`.

**Why:** Raw setTimeout navigate calls fire after unmount in React Strict Mode and during fast navigation, producing the "Can't perform a React state update on an unmounted component" warning and potential double-navigation.
