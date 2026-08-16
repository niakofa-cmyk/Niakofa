# Free Demo — Animation State Reference
_Reference only. The Red Mage visual style is NOT a Niakofa visual asset._
_Use: animation architecture, frame sequencing, action timing, combat state machines._

---

## Archive Contents

**Source:** `Free_Demo.zip`  
**Files:** 28 (12 GIFs + 12+ PNG sprite strips)  
**Uncompressed:** ~7.1 MB

### GIF Previews (384×384)

| File | State |
|------|-------|
| `Red_Mage_Pixel_art_Movement_idle3.gif` | IDLE |
| `Red_Mage_Pixel_art_Movement_run.gif` | RUN |
| `Red_Mage_Pixel_art_Movement_crouch_walk.gif` | CROUCH WALK |
| `Red_Mage_Pixel_art_Movement_death.gif` | DEATH |
| `Red_Mage_Pixel_art_1h.gif` | 1-HANDED ATTACK |
| `Red_Mage_Pixel_art_1h2.gif` | 1-HANDED ATTACK (variant) |
| `Red_Mage_Pixel_art_2h.gif` | 2-HANDED ATTACK |
| `Red_Mage_Pixel_art_2h_large.gif` | 2-HANDED LARGE ATTACK |
| `Red_Mage_Pixel_art__noeffect_1hh_cast.gif` | CAST (no effect overlay) |
| `Red_Mage_Pixel_art__noeffect_2h_atk.gif` | 2H ATTACK (no effect overlay) |
| `Red_Mage_Pixel_art__noeffect_2h_ground.gif` | GROUND ATTACK (no effect overlay) |
| `Red_Mage_Pixel_art__noeffect_2h_large.gif` | LARGE AREA ATTACK (no effect overlay) |

### Sprite Strips (horizontal, 128px frame height)

| File | Approx frames | Notes |
|------|--------------|-------|
| `Combat-1h atk 2.png` | ~66 | 8448×128 |
| `Combat-1h atk 3.png` | ~69 | 8832×128 |
| `Combat-2h area attack.png` | ~129 | 16512×128 |
| `Combat-2h explosion atk.png` | — | with SFX overlay |
| `Combat-2h ground atk 2.png` | — | |
| `Movement-crouch shield.png` | — | |
| `Movement-death 2.png` | ~117 | 14976×128 |
| `Movement-turn right.png` | — | |
| `Movement-walk back.png` | — | |

---

## Animation State Architecture to Adopt

The Red Mage demonstrates a production-ready combat action controller. Niakofa uses the same architecture via `legacy-animation-fsm.ts` + `legacy-combat-fsm.ts`:

```
CHARACTER
    ↓
ANIMATION CONTROLLER
    ↓
┌──────────────────────────────┐
│  MOVEMENT STATES (looping)   │
│  idle · walk · run · crouch  │
└──────────────────────────────┘
    ↓
┌──────────────────────────────┐
│  ACTION STATES (one-shot)    │
│  interact · talk · examine   │
│  attack · hurt · death       │
│  cast · skill                │
└──────────────────────────────┘
    ↓
┌──────────────────────────────┐
│  COMBAT STATES (one-shot)    │
│  lightAttack1 · lightAttack2 │
│  heavyAttack · aerialAttack  │
│  dash · airDash              │
│  jump · doubleJump · fall    │
│  guard · parry · knockback   │
└──────────────────────────────┘
    ↓
┌──────────────────────────────┐
│  FRAME EVENTS (future)       │
│  footstep · hitFrame         │
│  projectileSpawn · sfx       │
│  cameraShake · effectSpawn   │
└──────────────────────────────┘
```

---

## Frame Spec Reference

| Property | Red Mage (reference) | Kwame target |
|----------|---------------------|--------------|
| Frame width × height | 128×128 | 256×256 (or 96×96 packed) |
| GIF preview size | 384×384 | — |
| Recommended FPS | ~12 | 12 FPS |
| Strip format | horizontal | horizontal or individual PNGs |
| Idle frames | 8 | 6–8 |
| Walk frames | — | 8 |
| Attack frames | 5–9 | 5–9 (per COMBAT_ANIM_SPEC) |
| Death frames | ~12 | — |

---

## Combat Timing Reference

Derived from the Red Mage attack strips:

| Action | Frames | At 12 FPS | Notes |
|--------|--------|-----------|-------|
| Light attack | 5–6 | ~417–500ms | Quick, chained |
| Heavy attack | 8–9 | ~667–750ms | Wind-up + follow-through |
| Area attack | 12+ | 1000ms+ | Requires anticipation |
| Aerial attack | 6 | 500ms | Mid-air, pop-up |
| Death | 12–15 | 1000–1250ms | Long, must feel weighty |

These match the values in `COMBAT_ANIM_SPEC` in `legacy-combat-fsm.ts`.

---

## What NOT to Copy

The Red Mage asset is:
- Pixel art style — incompatible with Niakofa's hand-drawn 2.5D direction
- Fantasy mage archetype — incompatible with Niakofa's historical African setting
- Generic fantasy color palette

**Only the animation state machine architecture and frame timing are adopted.**

---

## DarkNinja Reference (separate archive)

32px pixel character, 64×64 grid, 12 FPS, CC-licensed (no redistribution/resale).

| State | Frames |
|-------|--------|
| Idle | 8 |
| Move | 8 |
| Jump | 12 |
| Attack 1 | 6 |
| Attack 2 | 6 |
| Attack 3 | 6 |
| Defend | 8 |
| Hurt | 3 |

Use as: frame count reference, animation naming, 12 FPS concept, transparent PNG workflow.
Do NOT promote to Niakofa character — license prohibits redistribution of assets.

---

_Last updated: Aug 2026_
