# Sprite Extractor — Niakofa Development Utility

Browser-based sprite extraction tool for the Niakofa art pipeline. No server required — open `index.html` directly.

## What it does

- Loads a sprite atlas (PNG, JPG, WEBP, GIF, BMP, TIFF, SVG, ZIP)
- Auto-detects sprite boundaries using alpha threshold and size filtering
- Extracts individual frames as downloadable PNGs
- Handles grid-based and free-form sprite layouts

## How to use in the Niakofa pipeline

```
Master Atlas (e.g. kwame-walk-atlas.png)
         ↓
[Open tools/sprite-extractor/index.html]
         ↓
Load atlas → Adjust grid settings → Extract
         ↓
Download individual frames:
  kwame-walk-down-01.png
  kwame-walk-down-02.png
  ...
  kwame-walk-down-08.png
         ↓
Drop into public/legacy-character-assets/kwame-mensah/atlas/<DIRECTION>/
         ↓
Add paths to kwame-sprite-atlas.ts → KWAME_ATLAS_FRAMES
```

## Frame naming convention

```
<character>-<action>-<direction>-<frame>.png

Examples:
  kwame-walk-down-01.png
  kwame-idle-right-03.png
  kwame-light-attack-down-01.png
  ama-talk-left-02.png
```

## Recommended settings for Kwame atlas

- Frame width: 256px
- Frame height: 256px
- FPS: 12
- Grid: detect from source (usually 4×8 or 8×4)

## Source

`v1.0_1786877192651.zip` — uploaded Aug 2026 for Niakofa pipeline integration.
Uses JSZip for ZIP sprite archive support. All processing is browser-side.

## License

Evaluate license terms of any atlas you process before shipping extracted frames
in the production game. The tool itself has no restrictions.
