# Material Maker Art Pipeline — Niakofa Legacy

**Tool:** Material Maker 1.7 (https://www.materialmaker.org)  
**License:** MIT  
**File provided:** `material_maker_1_7.dmg` (macOS application bundle)  
**Platform note:** Material Maker requires macOS, Windows, or Linux desktop. It cannot run inside the Replit web container (DMG is a macOS disk image). Use it locally to generate materials, then export to PNG for the Niakofa asset pipeline.

---

## What Material Maker Is

Material Maker is a procedural material authoring tool built on Godot Engine. It generates:
- **Albedo/color maps** — the base texture
- **Normal maps** — surface detail illusion
- **Roughness maps** — how light scatters across a surface
- **Height maps** — displacement data for 3D rendering
- **Mask maps** — for material blending

It works via **node graphs** (like Substance Designer, but free/open-source).

---

## Role in Niakofa's Art Pipeline

Material Maker is an **authoring tool, not a game engine component**. Use it offline to generate supporting procedural materials. The Niakofa game engine uses the exported PNGs directly — no Material Maker runtime is ever included.

```
Material Maker (designer's machine)
  ↓
Node graph → procedural recipe → exported PNG
  ↓
PNG added to public/legacy-character-assets/hand-drawn/environment/
  ↓
Registered in src/lib/legacy-environment-assets.ts
  ↓
Loaded by legacy-asset-loader.ts at runtime
  ↓
Rendered by legacy-scene-renderer.ts in the PixiJS layer stack
```

---

## Priority Material Types for Cape Coast (1890)

### Ground & Terrain
| Material | Use | Priority |
|---|---|---|
| Dirt ground | Village paths, compound floor | HIGH |
| Cobblestone | Market road, mission path | HIGH |
| Wet sand | River bank, beach area | HIGH |
| Dry grass | Compound yard, village edges | HIGH |
| River water | Animated water surface | MEDIUM |
| Mud | Rainy season ground variation | LOW |

### Architecture (Colonial + Traditional)
| Material | Use | Priority |
|---|---|---|
| Whitewashed lime plaster | Colonial admin, mission school walls | HIGH |
| Red earth daub | Traditional hut walls | HIGH |
| Palm thatch | Hut roofs | HIGH |
| Corrugated iron (early) | Newer building roofs | MEDIUM |
| Worn wood planks | Compound gates, door frames | HIGH |
| Rough stone masonry | Compound walls, church foundations | MEDIUM |

### Water & River
| Material | Use | Priority |
|---|---|---|
| Flowing river water | North bank, old jetty | HIGH |
| Mossy stone | River bank rocks | MEDIUM |
| Weathered dock wood | Old jetty planks | MEDIUM |

### Props
| Material | Use | Priority |
|---|---|---|
| Woven basket texture | Market stall props | MEDIUM |
| Glazed clay pot | Compound courtyard props | MEDIUM |
| Rope & hemp | Fishing nets, market stall ties | LOW |
| Aged brass | Door fixtures, colonial items | LOW |

---

## Recommended Node Graph Approach

For Cape Coast 1890, the hero look is:
**Hand-painted, warm, sun-faded, slightly dusty**

Not: modern AAA PBR. Not: sterile procedural tiles.

A Material Maker recipe for a Cape Coast compound wall might be:
```
Base noise (Perlin) → color: warm cream (#e8dcc0) with slight warm variation
+ Damaged/worn layer → random chips, edge darkening  
+ Lime wash coat → white semi-transparent layer with streaks  
+ Grime accumulation → bottom-heaviest, reddish-earth tone
→ Output: Albedo PNG (512×512) + Normal PNG
```

The PNG tiles seamlessly and gets registered in `legacy-environment-assets.ts`:
```typescript
{ id: "wall-lime-plaster-01", category: "building-wall", file: "wall-lime-plaster-01.png" }
```

---

## Export Settings for Niakofa

| Setting | Value |
|---|---|
| Resolution | 512×512 px (environment tiles) or 256×256 (small props) |
| Format | PNG (lossless, transparent where needed) |
| Color space | sRGB |
| Naming | `{category}-{variant}-{number}.png` (matches asset registry) |
| Output folder | `public/legacy-character-assets/hand-drawn/environment/` |

---

## Integration with the Tilegraph System

Material Maker 1.7 introduces a **tilegraph** node type for procedural tile generation with:
- Color output
- Height output  
- Material/roughness output

This maps to Niakofa's future World Regeneration concept:
```
NIAKOFA AI → Knowledge Graph → World Generation Instructions
  ↓
Tilegraph parameters (era, climate, cultural-context)
  ↓
Material Maker tilegraph → procedural tile set
  ↓
Exported PNGs → asset registry → game world
```

This is the long-term path to AI-driven world regeneration that produces authentic 1890s Gold Coast environments from family knowledge graph data.
