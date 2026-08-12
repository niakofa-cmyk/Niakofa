# Niakofa Legacy reference bundle

This directory preserves the complete reference material uploaded for the
Niakofa Legacy production-readiness pass on 2026-08-12.

## Contents

- `Pasted-*.txt` — design and architecture guidance for the House of Mensah
  vertical slice, the Living Baobab, world regeneration, and the RPG runtime
- `APPLY_*.md` — supplied application instructions
- `legacy-character-engine_*.patch` — supplied engine diff
- `niakofa-engine-patch_*.zip` — supplied patch bundles, including tests,
  catalog metadata, and original-art runtime layers
- `generator_*.zip` — source character-generator archive, retained as
  reference-only material

## Runtime boundary

The full generator archive is not shipped to the browser. Only the explicitly
promoted, original-art TV layers are in
`artifacts/pay-it-forward/public/legacy-world-assets/`, with paths described by
`catalog-original.json`. The generator-backed library remains the default for
backward compatibility and its licensing status remains review-required.

The engine must continue to use explicit appearance data. These references are
design and implementation input; they are not evidence about a real person's
identity, history, gender, or relationships.