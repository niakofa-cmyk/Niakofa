# Legacy Mode source references

This directory preserves the exact source material supplied for the Niakofa
Legacy Character Asset Engine continuation. The files are reference inputs,
not direct browser assets.

## August 10, 2026 upload

- `Pasted--The-app-still-needs-more-of-the-cinematic-game-world-v_1786389821723.txt`
  — full cinematic/game-world roadmap and gap audit.
- `generator_1786389835463.zip` — RPG Maker generator source archive.

Archive verification:

- SHA-256: `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f`
- `unzip -t`: passed
- 8,494 archive entries
- 4,226 meaningful PNG assets: Face 1,138; TV 946; TVD 726; SV 744;
  Variation 668; gradients 4
- macOS `__MACOSX` metadata is retained inside the reference archive but is not
  promoted to the web runtime.

## Runtime boundary

The engine stores stable asset IDs and promotes only reviewed, approved runtime
samples. Family Vault and the knowledge graph remain the source of truth for
identity and history. Missing age or gender evidence leaves a regenerated
character in `pending_verified_appearance` state rather than guessing a
likeness. See `docs/legacy-character-engine.md` and the server-side
`legacy-character-asset-engine.ts` for the active contract.
