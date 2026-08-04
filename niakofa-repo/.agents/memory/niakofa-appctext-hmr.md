---
name: Niakofa AppContext HMR
description: AppContext exports component+hook from same file — causes Vite fast-refresh warning; how to add hooks without breaking HMR.
---

## The warning
`AppContext.tsx` exports both `AppProvider` (component) and `useAppContext` (hook) from the same file.
Vite's React plugin requires files to export EITHER components OR hooks, not both.
Result: every edit to AppContext triggers a "Could not Fast Refresh" warning and a full module invalidation instead of a hot patch.

**This is a benign warning** — the app still works after the HMR-triggered full reload.

## Hook ordering rule
React counts hooks by order per render. HMR compares the old render's hook count to the new one. If counts differ mid-session, React throws "Hooks changed order" and the ErrorBoundary catches it.

**Rule:** When adding new hooks (useState, useEffect, useRef, custom) to AppContext, always add them LAST in the function body — never insert between existing hooks. The canonical order is:
1. All useState
2. All useRef
3. All custom hooks (useUpdateX, useWebSocket, etc.)
4. All useEffect — new ones go at the END of this group

## How to apply
Before adding any hook to AppContext:
- Check the current hook list and count
- Append the new hook at the end of its type group
- Never insert mid-list

**Why:** A mid-list insert changes the index of every subsequent hook, which React treats as a broken Rules-of-Hooks violation during HMR. A fresh page load resets the count and works fine.
