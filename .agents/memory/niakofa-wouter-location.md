---
name: Niakofa Wouter location vs window.location
description: useLocation() and Switch/Route matching can fail for auth-bypass routes when WouterRouter has a non-empty base; use window.location.pathname instead.
---

## Rule
For routes that must bypass the auth gate (e.g. `/status`), do NOT use Wouter's `useRoute()`, `useLocation()`, or `<Switch>/<Route>` at the App-level Router. All three can fail silently when the WouterRouter base strips the path differently from what you expect. Use `window.location.pathname` directly.

## Pattern
```tsx
function AppContent() {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  if (pathname === "/status" || pathname.endsWith("/status")) {
    return <StatusPage />;
  }
  return (
    <>
      <AppShell />
      <NiaGlobal />
    </>
  );
}
```

**Why:** `WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}` strips the base from paths before hooks see them. When `BASE_URL` differs across environments (Replit dev proxy vs Railway vs local), `useLocation()` returns a path that may not match a literal string comparison. `window.location.pathname` is always the raw browser URL and never lies.

**How to apply:** Any new public route (e.g. `/privacy`, `/terms`, `/health-check`) that must render before the auth check should use the same `window.location.pathname` guard in `AppContent` in `App.tsx`, NOT a Wouter Route or useRoute hook at the outer level.
