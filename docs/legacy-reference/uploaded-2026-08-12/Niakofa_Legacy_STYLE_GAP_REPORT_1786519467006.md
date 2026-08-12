# Style Gap Report — CharacterPack/WorldPack vs. Niakofa's actual target art

I checked `Niakofa-main.zip` against the two packs delivered earlier. Short version:
**the RPG Maker-style packs are structurally right but stylistically wrong**, and
that's the most important thing to flag before anyone builds on them.

## What the app is actually targeting

`docs/legacy-mode-design/` contains a full set of reference renders
(`legacy-dashboard-full.png`, `legacy-ui-reference-aug1-rpg-session.png`,
`niakofa-legacy-live-demo.png`, `niakofa-legacy-family-tree-reference.png`, etc.)
that show the intended look:

- **Gameplay scenes** are painterly/cinematic, near-photoreal illustrated
  backgrounds (a market street in Cape Coast, a colonial town, an ocean crossing) with realistic-proportioned character portraits in an
  over-the-shoulder dialogue framing — closer to a narrative adventure game or
  visual novel than a top-down tile RPG.
- **The Living Baobab** (`niakofa-legacy-family-tree-reference.png`) is a fully
  rendered, glowing, painted tree — not an icon or sprite.
- **UI chrome** uses a warm dark-brown/gold palette (`#1A0F08` background,
  amber-400/500 accents — documented in `docs/legacy-mode-design/legacy-ui-reference.md`),
  not the blue/parchment RPG Maker default.
- **The brand mark** is a teal layered-gradient vector Sankofa bird
  (`SankofaBirdSvg.tsx`, 1024×1024, exported to SVG/Rive/Lottie/Spine —
  see `sankofa-bird-reference.png`), not a generic RPG emblem.

## What's actually wired up in the app right now

`artifacts/pay-it-forward/public/legacy-character-assets/` — the real runtime
folder — currently ships only the same small RPG-Maker placeholder sample the
design notes describe (`tv_body_male_base`, 144×192, 48×48 chibi frames). I
pulled one of the actual files (`tv/TV_Body_p01-male.png`) and it's a tiny
pixel-art chibi sprite — visually nothing like the painted reference renders.

**This confirms it's a known, acknowledged gap, not a surprise:** the app's own
`legacy-character-asset-engine.ts` and catalog explicitly treat these as a
placeholder "curated runtime sample," and the design document says as much too
("The default RPG Maker generator assets aren't specifically designed around
1890 Ghanaian clothing... I would not rely exclusively on these assets for the
final visual identity").

## What I'd add to the demo pack because of this

1. **`BrandPack.zip`** (new, attached) — pulls the app's *actual* brand and UI
   assets straight from the repo instead of substitutes:
   - `sankofa-bird/` — the real logo in its current PNG exports, plus the full
     SVG pipeline spec sheet (turn sequence, gradients, layer hierarchy) so a
     dev can regenerate any angle/pose needed
   - `icons/` — the real app icons/favicons (192/512/maskable/apple-touch)
   - `reference-renders/` — the three key target-style renders, kept as the
     art-direction north star
   - `design-tokens.json` — the actual documented palette (`#1A0F08` bg,
     amber accents) pulled from `legacy-ui-reference.md`, so any new UI work
     matches the real app instead of defaulting to RPG Maker blue/parchment

2. **This report** — so the gap is written down once instead of getting
   rediscovered later. My recommendation, in line with what the design notes
   already conclude:

   | Layer | Use CharacterPack/WorldPack (RPG Maker) for... | Use painted/illustrated art for... |
   |---|---|---|
   | Rapid prototyping, playtesting movement/collision/dialogue logic | ✅ Yes — fast, free, already organized | — |
   | Placeholder NPCs during development | ✅ Yes | — |
   | Anything a player actually sees in a marketed demo | ❌ No | ✅ Yes — matches `niakofa-legacy-live-demo.png` |
   | Family member portraits in the Living Baobab / dialogue | ❌ No | ✅ Yes |
   | UI chrome (buttons, dialogue box, bars) | ❌ No — reskin or replace | ✅ Match `#1A0F08`/amber-gold tokens |

3. **Not included, because I can't produce it here:** the actual painterly
   character/background art. That requires either a commissioned illustrator/
   concept artist working from the existing reference renders, or an AI image
   pipeline run outside this chat (I don't have an image-generation tool
   available in this session — only web image search, which isn't appropriate
   for original character art). The reference renders in `BrandPack/reference-renders/`
   are the style brief for whoever does that work.

## One more concrete thing worth doing next

`legacy-character-assets/catalog.json` (schemaVersion 2) already defines a
clean `assetId` / `representation` / `ageGroup` / `gender` / `file` schema.
`CharacterPack/catalog.json` (delivered earlier) uses a compatible shape — so
if the RPG-Maker layer stays in as a **prototyping** layer, extending the
app's existing catalog with more `assetId` entries from `CharacterPack` (e.g.
`TVD` variants for world-state changes, more `Face` portraits for more NPCs)
is a low-effort way to get the prototype more populated without touching the
final-art question at all.
