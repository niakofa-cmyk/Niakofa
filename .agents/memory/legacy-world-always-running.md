---
name: Legacy World-Always-Running Fix
description: Architecture fix so LegacyChapterWorld always runs as game backdrop; scene content is a bottom overlay. Resolves the "two games" split.
---

## Rule
`LegacyChapterWorld` renders unconditionally inside `<div className="flex-1 min-h-0 relative">`.
Scene content (day-cycle strip + text + choices) appears as `<div className="absolute bottom-0 ... max-h-[68%]">` when `!worldViewOpen`.

**Why:** The original code used `{worldViewOpen ? <World> : <SceneContent>}` — a ternary that hid the world while reading scenes. This was the root cause of "the game doesn't play like an RPG." See `ROOT_CAUSE_TWO_GAMES.md`.

**How to apply:** Any future gameplay element that needs to "pause" the world should be an overlay, not a route change. The world only hides for explicit full-screen modals (journal, map — already `fixed inset-0 z-50`).

## Pattern (legacy-chapter.tsx)
```tsx
// World always running
<div className="flex-1 min-h-0 relative">
  <LegacyChapterWorld ... />
  
  {/* Scene content as bottom-sheet overlay */}
  {!worldViewOpen && (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]"
      style={{ maxHeight: "68%", background: "linear-gradient(180deg, rgba(8,8,6,0) 0%, rgba(10,9,7,0.96) 8%, #0a0907 100%)" }}>
      {/* drag handle, day-cycle strip, scene content, choices */}
    </div>
  )}
</div>

{/* Bottom action bar — always visible */}
<div className="flex items-center ... bg-stone-950/80 shrink-0">
  {!worldViewOpen && <button onClick={() => setWorldViewOpen(true)}>Back to World</button>}
  {/* Journal, Map, scene dots */}
</div>
```

## Related
- `LegacyLivingWorld` (the House-of-Mensah demo world) is NOT the chapter world. `LegacyChapterWorld` is per-family, data-driven. Both are correct — do not consolidate.
- `legacy-demo.tsx` has the correct overlay pattern for journal/satchel/worldmap (z-30/z-50 fixed).
