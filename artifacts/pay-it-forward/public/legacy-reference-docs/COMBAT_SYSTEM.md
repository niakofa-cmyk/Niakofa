# Niakofa Legacy RPG — Real-Time Combat System v1
### (amends `NIAKOFA_LEGACY_RPG_VISUAL_RUNTIME_BIBLE_v1`)

## Document change

The Visual + Runtime Bible you uploaded with the atlas explicitly deferred
combat: its **Animation** section lists combat under **P2** (lowest priority,
after idle/walk/interact and run/emotional reactions), and its **Quality Bar**
section doesn't mention it at all.

**This is now amended.** Per your direction, real-time combat — including
aerial combat — is a first-class pillar of Niakofa Legacy, not a deferred
nice-to-have. Two sections of the Bible change:

- **Animation priority:** combat moves from P2 to **P1**, alongside run and
  emotional reactions. Idle/walk/interact (P0) still ships first — you can't
  fight in a world you can't walk around in — but combat is no longer "maybe
  later," it's on the same production track as movement.
- **Quality Bar:** add *"real-time action combat with aerial capability, in
  the spirit of Aurion's combat feel"* alongside the existing hand-drawn
  identity and family-history differentiator. Combat is now part of what
  "Aurion-inspired ambition" means for Niakofa, not excluded from it.

The **North Star loop** (`DISCOVER → INTERACT → CHOOSE → PRESERVE →
REGENERATE → PLAY AGAIN`) is unchanged — combat is a new *verb* inside
INTERACT/CHOOSE (a family story can lead to a real fight, not just a
dialogue choice), not a replacement for the loop.

---

## LMBS as architecture reference — confirmed scope

I checked `lmbs.zip` again with combat specifically in mind. It's the 8-file
`MOG_LMBS` bundle (`MOG_LMBS.js`, `MOG_BattleCamera.js`, `MOG_BattleHud.js`,
`MOG_BattleResult.js`, `MOG_BattleTransitions.js`, `MOG_BattlebackEX.js`,
`MOG_BattleCry.js`, `MOG_LMBS_EnemyHP.js`) — a real-time action-battle plugin
for RPG Maker MV with configurable dash keys, guard, air dash, double jump,
gravity, escape zones, and turn/combo timing.

**The decision from the last rebuild pack stands: none of this JS gets
imported.** It's RPG Maker MV's plugin API (`Game_CharacterBase`,
`Sprite_Battler` subclassing, `Scene_Battle` overrides) — architecturally
bound to an engine Niakofa doesn't run. What changes now is *how much* of it
gets reimplemented natively, because combat is now P1 instead of deferred:
the mapping table below is more complete than the one-line mention in the
last rebuild pack.

| LMBS concept (from its own parameters) | Native Niakofa implementation |
|---|---|
| `Attack Key` / `Normal Attack Rate` | `LegacyCombatController.lightAttack()` — see scaffold |
| `Dash Key`, `Air Dash Animation ID` | `dash()` (ground) / `airDash()` (aerial) — both consume the SP resource |
| `Double Jump Animation ID`, `Gravity Power`, `Ground Height` | Aerial state: `jump()` → `doubleJump()`, gravity constant applied per tick until `Ground Height` reached |
| `Guard Key`, `Guard Animation ID` | `guard()` — holds a block state; a well-timed `guard()` just before a hit lands becomes a parry (bonus window, see below) |
| `Turn Duration`, combo timing | `comboWindowMs` on `LegacyCombatController` — chaining `lightAttack()` inside the window extends the combo, outside it resets |
| `MOG_BattleCamera.js` | Reuse the existing camera-follow concept from `ARCHITECTURE_PLAN.md` §4, add an impact-frame zoom/shake pulse on hit |
| `MOG_BattleHud.js` | Reskin, don't reuse code — HP/SP bars already exist in the app's real dark-brown/gold UI language (see `BrandPack/design-tokens.json` from the style-gap report) |
| `MOG_LMBS_EnemyHP.js` | A boss/antagonist HP bar component, native React, gold/amber styled |
| `MOG_BattleCry.js` | **Not generic battle voice lines.** Per the original design notes, this becomes real recorded family audio triggered on specific actions — this is the one LMBS idea that plugs into the Family Vault instead of into combat code at all |
| `MOG_BattleTransitions.js`, `MOG_BattlebackEX.js` | Scene-transition-into-combat visual treatment — reference only for *timing/feel*, implemented as a CSS/canvas transition, not ported |

---

## Combat state machine (extends `legacy-animation-fsm.ts`)

Builds directly on the `LegacyActorController` shipped in the last rebuild
pack — same tick loop (`Character → Movement → Animation → Action →
Collision → World response`), extended with combat states and aerial
physics. See `scaffold/legacy-combat-fsm.ts`.

New `LegacyAnimState` values: `lightAttack1`, `lightAttack2`, `heavyAttack`,
`aerialAttack`, `dash`, `airDash`, `jump`, `doubleJump`, `fall`, `guard`,
`parry`, `knockback`.

### Ground combat
- **Light attack** — fast, low damage, chainable into a 2-hit combo
  (`lightAttack1 → lightAttack2` inside `comboWindowMs`, resets to
  `lightAttack1` if the window expires)
- **Heavy attack** — slower windup, higher damage, cannot combo, can be
  canceled into a dash to reposition
- **Guard** — reduces incoming damage while held; a guard input in the last
  ~150ms before a hit connects becomes a **parry** (no damage, brief
  attacker stagger — this is the "tactical freeze like Aurion" counter idea
  from the design notes, timing-based rather than a separate freeze-frame
  minigame, since Kwame's frame set doesn't currently include a distinct
  freeze pose)
- **Dash** — short burst of speed, brief invulnerability window (a real-time
  dodge, not a separate "Dodge" menu command)

### Aerial combat
- **Jump → double jump** — gravity-driven per calibration sheet's world
  unit; double jump available once per airborne cycle
- **Air dash** — horizontal burst while airborne, same brief-invuln property
  as the ground dash
- **Aerial attack** — available once airborne; on hit, applies a small
  upward knockback to the target so a second aerial attack can connect
  (the "juggle" pattern LMBS's air-dash/double-jump params are built for)
- Landing after any aerial action returns to `idle`/`walk` cleanly — no
  landing-lag state in v1, keep it responsive

### Resource
- **SP** (already shown in the app's real UI reference renders as a blue
  stat bar) gates dash/air dash/heavy attack, not light attacks — keeps
  basic combat free-flowing, makes mobility/power a resource decision

---

## What this needs from the art pipeline that doesn't exist yet

Per `kwame_atlas/packaged/README.md`, the current 32-frame atlases cover
idle/walk/run/talk/interact/inspect/pick-up/hurt — **no attack, dash, jump,
guard, or aerial frames exist yet.** Before combat can render (as opposed to
just being playable as raw physics/hitboxes), the same atlas-production
pipeline that made the current 11 files needs a second pass covering:

- `attack-light-1`, `attack-light-2`, `attack-heavy` (4-direction or at
  least down/side, per calibration sheet minimums)
- `jump`, `double-jump`, `fall`
- `dash`, `air-dash`
- `guard`, `parry` (a distinct held-guard pose plus a short parry-flash pose)
- `knockback` (aerial and ground variants)

Until those exist, `legacy-combat-fsm.ts` is fully functional at the physics/
state-machine level (hitboxes, damage, combo timing, aerial arcs) — it just
renders Kwame's existing `hurt` frames as a stand-in for knockback and a
placeholder box for attack states, exactly the same "visible incomplete
placeholder, never a silent fallback to the wrong art tier" rule from the
hand-drawn enforcement gate in the last rebuild pack.
