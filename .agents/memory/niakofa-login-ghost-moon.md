---
name: Niakofa login ghost moon
description: LoginGhostMoon component placement, animation, tooltip direction, and i18n init fix
---

## Ghost moon placement
- Mounted `absolute z-30 -top-4 -right-4` inside `<div className="relative mb-4">` (the hero orb container, line ~1086 in login.tsx)
- No `overflow-hidden` on that container or any ancestor — ghost moon overflows safely
- `style={{ overflow: "visible" }}` added to the motion.div wrapper as extra safety for tooltip

## Animation
- `delay: 0.35` (not 1.1 — too long for screenshot verification and noticeably slow for users)
- `type: "spring", stiffness: 220, damping: 18`

## Tooltip direction
- Since the ghost moon is at the TOP-RIGHT of the hero, use `right-full top-1 mr-2 w-44` — tooltip opens to the **LEFT** of the ghost moon
- Animate via `x` offset (not `y`), since it slides horizontally into view
- `pointer-events-none` on the tooltip div; dismiss by tapping the button again

## i18n initialization
- `i18n.ts` uses a side-effect init pattern (calls `i18n.use(initReactI18next).init(...)` at module level)
- Must add `import "./i18n"` to `main.tsx` BEFORE `<App />` renders, or `NO_I18NEXT_INSTANCE` warning fires on every `useTranslation` call
- This was missing — adding it cleared the console warning entirely

**Why:** i18next's `initReactI18next` plugin registers itself on the global i18n singleton. If the singleton is not initialized before React renders, every `useTranslation` call logs a warning and falls back to the key name.

## Production sourcemap
- `artifacts/api-server/build.mjs` had `sourcemap: "linked"` unconditionally — exposes source code in production bundles
- Fixed to `process.env.NODE_ENV !== "production" ? "linked" : false`
