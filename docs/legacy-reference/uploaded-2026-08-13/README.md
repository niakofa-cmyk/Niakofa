# Legacy reference bundle — 13 August 2026

This folder records the four source uploads reviewed for the next Niakofa
Legacy RPG pass. The complete source uploads were read from the local
checkpoint before implementation; they are reference material, not browser
runtime dependencies.

## Review boundary

- The Universal LPC document is design guidance for a modular, animated
  character/world pipeline.
- `charactercreator-master` is a layered character-builder reference. Its
  README records AGPL code and CC-BY-NC art constraints; it is not imported.
- `Flexible2DCharacterControllerForUnity-main` is a Unity controller/editor
  reference. Its runtime and project files are not imported into the React
  app.
- `ai-game-asset-creator-master` is an MIT-licensed prompt/pipeline reference,
  but its API keys, Streamlit app, old dependencies, and generated URLs are not
  used by the Legacy browser runtime.

The app promotes only small, auditable presentation cues. Family Vault data
remains authoritative for names, relationships, places, and verified history.
Stylized assets must never be described as a family likeness.

## What the review contributed

1. Keep appearance as explicit composable layers with stable asset IDs.
2. Keep keyboard and touch movement deterministic and bounded by a walkable
   world layout.
3. Treat generated content as a pipeline input that must be reviewed before it
   becomes a world change.
4. Keep provenance and commercial-use status visible before launch.

See `UPLOAD_MANIFEST_2026-08-13.md` for the complete file counts and hashes.