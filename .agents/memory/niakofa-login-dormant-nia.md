---
name: Niakofa login dormant Nia placement
description: Where and how the dormant NiaOrb ghost moon is rendered on the login page
---

## Rule
The dormant NiaOrb (ghost moon) lives in `artifacts/pay-it-forward/src/pages/login.tsx` directly, NOT in NiaGlobal. NiaGlobal returns null for unauthenticated routes.

## Placement (current as of July 7 2026)
The ghost moon is placed **inside the hero flex row**, side-by-side with the active animated orb:

```jsx
<div className="flex items-center justify-center gap-4 mb-4">
  {/* Ghost moon — constrained to 96×96 layout box, glow bleeds via overflow:visible */}
  <motion.div style={{ width: 96, height: 96, position: "relative", overflow: "visible" }}>
    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}>
      <NiaOrb size={72} dormant />
    </div>
  </motion.div>

  {/* Active hero orb */}
  <div className="relative flex-shrink-0">
    ...96px animated orb div...
  </div>
</div>
```

**Why:** NiaOrb renders in a total bounding box of `size + 2*pad` (152px for size=72) due to glow ring space. Clamping it to a 96×96 layout box with `overflow:visible` makes the two orbs appear side-by-side at matched visual size without layout interference from the halo.

**Why NOT a floating top element:** An earlier attempt placed a small NiaOrb (size=44) in a separate motion.div above the `flex-1` block. The user prefers it adjacent to the center hero logo, at larger size.
