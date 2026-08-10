# Niakofa Legacy Character Engine

The uploaded RPG Maker generator archive is a **visual asset library**, not
the source of family history. Legacy Mode keeps the family vault and knowledge
graph as the source of truth:

```text
Family member → character profile → appearance definition
             → asset registry → portrait / map / state representation
```

## What was reviewed

- Guidance document: `docs/legacy-reference/uploaded-source/Pasted-One-thing-I-would-NOT-do-Don-t-simply-dump-this-ZIP-int_1786371339631.txt`
- Uploaded archive: `docs/legacy-reference/uploaded-source/generator_1786371386883.zip`
- Archive SHA-256: `b98843ce0ca4687b44ef4679b7137b11a9e14af88c6e901666194f442da2d64f`
- Archive integrity: verified with `unzip -t`
- Archive shape: `Face`, `TV`, `TVD`, `SV`, `Variation`, and four gradient
  palettes (`grad_skin`, `grad_hair`, `grad_eyes`, `grad_common`)
- Runtime-relevant counts: Face 1,138; TV 946; TVD 726; SV 744;
  Variation 668; gradients 4 (4,226 PNG assets total)

The archive also contains macOS `__MACOSX` metadata. It is intentionally not
copied into the application.

## Controlled import

Only a small, reviewed TV sample is shipped in
`artifacts/pay-it-forward/public/legacy-character-assets/`:

- 144×192 walking body, clothing, rear-hair, and front-hair spritesheets for
  the explicit `adult/male`, `adult/female`, and `kid/unspecified` profiles
- the four palette files remain cataloged as engine inputs, not family data
- the full archive remains available in the uploaded attachment for future
  processing and is not delivered wholesale to the browser

The catalog is `public/legacy-character-assets/catalog.json`. Each record
uses a stable `assetId` and stores category, age group, source path, and
dimensions. Future appearance definitions should reference those IDs rather
than raw archive paths.

## Provenance boundary

The generator can answer “how should this character look in the RPG?” It
cannot answer who a family member was, what happened, or whether a story is
verified. Those claims continue to come from the Family Vault and are labeled
in gameplay as verified history, historical context, narrative interpretation,
or fictionalized gameplay.

Before expanding the imported set or distributing it outside this project,
verify the upstream RPG Maker asset license and record that decision in the
project's provenance documentation.

## Life-stage rendering

The runtime now derives presentation metadata from verified birth/death years:
`youth` (under 18), `adult` (18–34), `mature` (35–54), and `elder` (55+).
Deceased characters are evaluated at their recorded death year rather than
continuing to age. The resolver selects a deterministic curated variant using
character ID, life stage, era, and appearance seed. It never infers gender,
family role, history, or likeness.