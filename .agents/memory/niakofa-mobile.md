---
name: Niakofa mobile mandate
description: Mobile-first rules for every Niakofa UI change — apply to all future work
---

## The Mandate
Every feature and UI component must work fully on mobile. This is an explicit user preference stored in replit.md.

## Rules (apply to every edit)

1. **Input font-size ≥ 16px** — iOS Safari auto-zooms any input with font-size < 16px. This breaks the entire layout on iPhone. No exceptions.

2. **Touch targets ≥ 36–44px** — icon-only buttons need `min-height: 36px` or `w-9 h-9` at minimum. Chip buttons need `minHeight: 36`.

3. **`active:` not `hover:`** — on mobile, `hover:` states never trigger. All interactive feedback must use `active:` Tailwind variants or CSS `:active` selectors. Use `@media (hover: hover)` to gate desktop-only hover styles.

4. **Safe-area insets on all fixed bottom bars** — use `paddingBottom: "max(16px, env(safe-area-inset-bottom))"` on any fixed/sticky bottom panel. The Tailwind class `pb-safe` is defined in index.css.

5. **`-webkit-tap-highlight-color: transparent`** — set globally in index.css to remove the blue flash on tap. Done.

6. **Bottom sheets over modals** — use `fixed bottom-0 left-0 right-0` with `rounded-t-3xl` for any overlay content. Never center-screen modals on mobile.

7. **Overflow-x on chip rows** — horizontal scroll chip groups need `overflow-x-auto scrollbar-none` so they don't push layout.

8. **`touchAction: "manipulation"`** — add to interactive elements to prevent 300ms tap delay on some mobile browsers.

## Nia visibility rule
`hideNia` in App.tsx must only be `isOnboarding`. Nia is shown on every screen including the login screen — she is the first face of Niakofa.

**Why:** User explicitly stated: "Bring Nia to the forefront as the initial entity to greet the Community." She belongs to everyone, before and after login.

## Admin page
Always include Reports/Users tab bar on admin screen. `UsersTab` component must be wired and rendered. Session timer must fit on narrow screens (compact version without label text).

## What was already fixed (don't re-fix)
- NiaDrawer input: 16px ✅
- NiaDrawer input bar: safe-area-inset-bottom ✅  
- Quick prompt chips: CSS active state, min-height 36 ✅
- Welcome splash: adaptive timing (700ms mobile, 900ms desktop) ✅
- Global `-webkit-tap-highlight-color: transparent` ✅
- Admin tab bar: Reports/Users tabs with active states ✅
- Login screen: Nia orb replaces Heart icon ✅
- NiaFab: visible pre-login ✅
