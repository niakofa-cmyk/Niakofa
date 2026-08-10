# Legacy Character Engine — source and runtime reference

This reference records the uploaded material used for the August 10, 2026
Legacy Mode character-engine pass.

## Source material

- Guidance: `uploaded-source/Pasted-One-thing-I-would-NOT-do-Don-t-simply-dump-this-ZIP-int_1786371339631.txt`
- Archive: `uploaded-source/generator_1786371386883.zip`
- Archive SHA-256: `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f`
- Integrity: `unzip -t` passed
- Inventory: 4,226 PNG assets — Face 1,138, TV 946, TVD 726, SV 744, Variation 668, gradients 4

The archive remains a source library, not a browser bundle. macOS metadata is
not used by the runtime. Run `node scripts/src/audit-legacy-generator.mjs`
to repeat the inventory and integrity check.

## Runtime contract

Family Vault and the knowledge graph remain the source of truth for identity,
history, relationships, and verification status. The generator only supplies
stylized visual vocabulary. Character data stores stable `assetId` values, not
raw archive paths.

The browser currently ships an explicitly curated TV sample. Body, clothing,
rear-hair, and front-hair layers resolve for the three explicit profiles:

- adult / male
- adult / female
- kid / unspecified

Unknown adult gender still renders no character rather than guessing. Explicit
layer selections that are unknown or not approved for runtime are ignored and
the safe profile defaults remain. Face, TVD, SV, Variation, and gradients stay
cataloged for later licensed expansion.

## Boundaries kept intact

- The public House of Mensah demo and its `niakofa:demo:v2` state contract are unchanged.
- Legacy history labels remain separate from stylized RPG rendering.
- No asset filename is used to infer gender, age, family role, or historical facts.
- The existing `/legacy/characters` page now receives a layered walking sprite
  through the same `LegacyCharacterSprite` component.
- `/legacy/characters` and `/legacy/character/:memberId` now show deterministic
  life-stage metadata. A deceased profile is anchored to its recorded death
  year, and missing birth years remain explicitly unknown.