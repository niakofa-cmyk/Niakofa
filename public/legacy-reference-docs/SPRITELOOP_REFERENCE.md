# SpriteLoop 0.14.0 — Art Pipeline Reference
## Role in Niakofa

**SpriteLoop is a macOS sprite-animation editor (production tool), not a game runtime.**
It is NOT installed into `artifacts/pay-it-forward/src`. It is NOT a game dependency.

---

## What SpriteLoop Does

SpriteLoop is a dedicated 2D sprite-animation authoring tool for composing frame sequences,
previewing loops, and exporting animation data.

Typical workflow in the Niakofa art pipeline:

```
KWAME SOURCE ART (hand-drawn PNGs)
       │
       ▼
SpriteLoop
       ├── Import individual frames (idle_down_1.png … idle_down_4.png)
       ├── Set frame duration / timing
       ├── Preview animation loop
       ├── Check direction correctness (left vs right flip)
       ├── Adjust frame order
       └── Export as frame sequence or spritesheet
               │
               ▼
       NIAKOFA PNG FRAMES
               │
               ▼
       kwame-manifest.ts
               │
               ▼
       legacy-asset-loader.ts
               │
               ▼
       LegacyActorSprite (PixiJS runtime)
```

---

## Animation Sets Needed for Kwame

| Set      | Directions | Frames each | Status |
|----------|-----------|-------------|--------|
| idle     | down/up/left/right/up_left/up_right | 4 | ✅ Done (136 PNGs) |
| walk     | same 6 | 6 | ✅ Done |
| run      | same 6 | 6 | ✅ Done |
| talk     | down only | 4 | ✅ Done |
| hurt     | down only | 3 | ✅ Done |
| **lightAttack** | right/left | 4 | ❌ Art gap |
| **heavyAttack** | right/left | 5 | ❌ Art gap |
| **aerialAttack**| right/left | 4 | ❌ Art gap |
| **dash**        | right/left | 3 | ❌ Art gap |
| **jump**        | down | 4 | ❌ Art gap |
| **guard**       | right/left | 2 | ❌ Art gap |

---

## Export Convention for New Animation Sets

Frame file naming must match `kwame-manifest.ts` registry:

```
public/kwame/<animation>_<direction>/kwame_<animation>_<direction>_<N>.png
```

Example — light attack right:
```
public/kwame/light_attack_right/kwame_light_attack_right_1.png
public/kwame/light_attack_right/kwame_light_attack_right_2.png
...
```

Once exported, register in `kwame-manifest.ts` under the matching animation-state key.

---

## NPC Animation Sets (Future)

When NPC sprite sheets are delivered, each NPC needs:
```
idle_down / walk_down / walk_up / walk_left / walk_right / talk / emote
```

Register these in a new `npc-manifest.ts` file and swap the colored
`PIXI.Graphics` placeholders in `LegacyGameCanvas.tsx` for `LegacyActorSprite` instances.

---

## Integration Boundary

| SpriteLoop | Niakofa runtime |
|---|---|
| Authoring tool (macOS DMG) | PixiJS WebGL canvas |
| Creates frame sequences | Loads frame sequences |
| Exported PNGs → public/ | kwame-manifest.ts → legacy-asset-loader.ts |
| NOT a code dependency | Completely decoupled |

SpriteLoop version archived: **0.14.0 universal** (macOS DMG).
Do not add it as an `npm` package or `pnpm` dependency.
