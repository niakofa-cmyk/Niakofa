# Niakofa Legacy RPG — Repo Findings

Scope: `artifacts/pay-it-forward/src/{pages,components,lib}/legacy-*` and
`artifacts/api-server/src/lib/legacy-character-asset-engine.ts` — the actual
game runtime, not the rest of the Niakofa app (Circles, Civic, Businesses,
etc. were left alone, per your scope).

I don't have write access to `github.com/niakofa-cmyk/Niakofa` (no GitHub
connector is exposed in this session — I checked again and it's still not
available; only Railway is connected). Everything below is a **finding +
proposed fix**, delivered as documents/scaffold code for you or a connected
agent to apply, not a live commit.

---

## 1. Confirmed bug: duplicate source trees have drifted apart

The design document you shared flagged this as a risk ("duplicate Legacy
world-evolution, map and agent-memory files... future AI/code agents [may]
modify the wrong copy"). I checked, and it's not a hypothetical — it's already
happened:

```
artifacts/pay-it-forward/src/pages/legacy-*.tsx          ← canonical, newer
niakofa-repo/artifacts/pay-it-forward/src/pages/legacy-*.tsx  ← stale fork
```

Diffing three files confirms real divergence, not just duplication:

| File | What the stale `niakofa-repo/` copy is missing |
|---|---|
| `legacy-chapter.tsx` | `LegacyCoreLoop` / `buildWorldChanges` import — the world-change summary shown after a chapter (per `NIAKOFA_LEGACY_REFERENCE.md`, this is the "World Updated" moment); also missing `requiredStats` choice-gating (stat thresholds that unlock/lock narrative choices) |
| `legacy-home.tsx` | `LegacyStartVisual` and `LegacyHouseDemo` component imports entirely |
| `legacy-map.tsx` | The geocoding-backfill effect (`backfillFiredRef`, auto-geocode places missing coordinates) |

**Risk:** if any tooling (human or agent) opens the wrong copy — easy to do,
since the folder names look almost identical — it'll edit a version that's
missing three real features, and those edits won't reach production.

**Recommended fix:** delete or explicitly archive `niakofa-repo/` (e.g. move
it to `docs/archive/niakofa-repo-fork-2026-08/` with a `DO_NOT_EDIT.md`), and
keep exactly one canonical `artifacts/` tree. This is a five-minute git
operation once you have push access — I'd do it first, before any of the art
work below, since it's the kind of thing that causes silent regressions.

---

## 2. There is currently no map/environment rendering system to extend

I looked for it before assuming otherwise: `legacy-chapter.tsx` — the actual
"Living RPG gameplay scene" route — has zero `<img>`, `backgroundImage`, or
tileset references. Gameplay today is entirely text/choice-driven (dialogue
text + button choices + stat bars). This matches the design document's own
diagnosis ("no full playable scenes... Walk → encounter → dialogue → decision
→ discovery → consequence" is still missing).

This isn't a bug, but it resets expectations for "make the game use hand-drawn
art for all map builds": **there's no existing map renderer to re-skin. A map
system has to be built new.** See the architecture plan below.

---

## 3. What's already correctly built (keep this)

- `legacy-character-engine.ts` has a clean, typed `assetId`-based resolver
  (`LegacyAssetRecord`, `APPROVED_LAYER_ASSETS`) with an explicit
  `runtime: "approved" | "catalog-only"` gate. This is exactly the registry
  pattern needed to swap in hand-drawn assets later — don't throw it out,
  extend it (see architecture plan).
- `legacy-character-sprite.tsx` has a load-bearing ethics comment already in
  place: *"a stylized gameplay rendering and is never presented as a real
  family photograph or an AI-generated likeness."* Keep this guarantee true
  for whatever art replaces the current pixel sprite.
- `legacy-world-evolution.ts` / `logWorldEvolution()` — the vault-mutation →
  world-change pipeline — is real and wired, per `NIAKOFA_LEGACY_REFERENCE.md`.
  Nothing here needs to change for the art-direction work.
