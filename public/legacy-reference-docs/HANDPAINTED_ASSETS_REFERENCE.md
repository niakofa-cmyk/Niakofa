# Handpainted Assets — Classification & Integration Reference
## What This Package Contains

100 PNG textures + 1 FBX source model from a hand-painted 3D environment asset library.
Texture resolutions: mostly 512×512, 1024×1024, and 2048×2048.
The original source (`Assets_painted.fbx`) is a 3D prop/environment set — not a 2D RPG tileset.

**53 curated textures** have been copied to:
```
artifacts/pay-it-forward/public/legacy-reference-docs/handpainted-textures/
```

---

## Licensing Note ⚠️

Verify the license/provenance of `handpainted-assets.zip` before shipping.
Use as visual reference and style foundation now; confirm commercial redistribution rights before production.

---

## Asset Classification

### ✅ APPROVED — Use for House of Mensah interior / Cape Coast 1890s

| File | Niakofa Use |
|---|---|
| `Floor_wood_seamless_albedo.png` | House of Mensah interior floors |
| `Floor_wood_seamless_v2_albedo.png` | Variant wood floor |
| `Wall_wood_seamless_albedo.png` | Timber wall panels |
| `Wall_green_seamless_albedo.png` | Painted plaster walls |
| `Tiled_seamless_albedo.png` | Courtyard / exterior tiles |
| `Roof_seamless_albedo.png` | Building roof material |
| `Door_painted_albedo.png` | House doors |
| `Painted_door_albedo.png` | Alternate door |
| `Doors_albedo.png` | Additional doors |
| `Chair_simple_albedo.png` | Simple seating |
| `Chair_decorated_albedo.png` | Elder's decorated chair |
| `Blue_stool_albedo.png` | Household stool |
| `Stool_tall_albedo.png` | Tall stool |
| `stool_wide_albedo.png` | Wide stool |
| `Table_cloth_albedo.png` | Table with cloth |
| `Table_embroidered_albedo.png` | Embroidered table |
| `Table_hallway_albedo.png` | Entryway table |
| `Table_low_wide_albedo.png` | Low sitting table |
| `Desk_albedo.png` | Writing desk |
| `Bedside_table_albedo.png` | Bedside furniture |
| `Cute_Drawer_albedo.png` | Storage drawers |
| `Cabinet_albedo.png` | Storage cabinet |
| `Shelves_albedo.png` | Wall shelves |
| `Book_shelf.png` | Book shelf |
| `Carpet_big_albedo.png` | Floor carpet |
| `Curtains_oldtimey_albedo.png` | Period-appropriate curtains ✓ |
| `Curtains_painted_albedo.png` | Painted curtains |
| `Sack_albedo.png` | Grain/storage sacks |
| `Basket_albedo.png` | Woven baskets — excellent |
| `Bucket_wood_albedo.png` | Wooden bucket (well, washing) |
| `Cabin_stove_albedo.png` | Cooking stove (adapt style) |
| `Dishes_albedo.png` | Clay/wood dishes |
| `Utensils_wall_albedo.png` | Wall-hung utensils |
| `Utensils_wood_albedo.png` | Wooden utensils |
| `Knife_holder_albedo.png` | Kitchen knife storage |
| `Drying_rack_albedo.png` | Laundry/fish drying rack |
| `Axe_albedo.png` | Tool (woodcutting) |
| `Mirror_floor_albedo.png` | Standing mirror (wealthy homes) |
| `Lamp_old_albedo.png` | Oil lamp ✓ period-appropriate |
| `Lamp_painted_albedo.png` | Decorative lamp |
| `Candelabra_albedo.png` | Candelabra (church / elder's home) |
| `Candle_wick.png` | Candle element |
| `Winter_Fireplace_Albedo.png` | Fireplace (adapt for cooking hearth) |
| `Winter_Fireplace_decoration_Albedo.png` | Fireplace surround |
| `Plant_bue_albedo.png` | Indoor plant |
| `Plant_long_AlbedoAlpha.png` | Tall plant |
| `Plant_painted_albedo.png` | Painted plant |
| `Monstera_albedo.png` | Tropical plant — excellent for West Africa |
| `Tulips_albedo.png` | Flowers (garden scenes) |
| `Dandelions_albedo.png` | Wild flowers |
| `ocean_albedo.png` | Cape Coast ocean / river water |
| `Radio_mat_albedo.png` | Period radio (1910s–1920s, OK for mission school) |

### ❌ EXCLUDED — Not period-appropriate for 1880s–1920s Cape Coast

| File | Reason |
|---|---|
| `Fridge_albedo.png` | Anachronistic |
| `Fridge_cute_albedo.png` | Anachronistic |
| `Microwave_albedo.png` | Anachronistic |
| `Tv_and_table_albedo.png` | Anachronistic |
| `Old_coffe_machine_albedo.png` | European coffee culture, not Cape Coast |
| `Kitchen_system_albedo.png` | Modern fitted kitchen |
| `Kitchen_system_cute_albedo.png` | Modern kitchen |
| `Kitchen_island_painted_albedo.png` | Modern island design |
| `Corgi_albedo.png` | British colonial dog breed — avoid |
| `Pet_bed_albedo.png` | Modern pet aesthetic |
| `Skis_albedo.png` | Wrong climate/era |
| `Shoe_painted_albedo.png` | Style review needed |
| `Shoe_rack_albedo.png` | Modern design |
| `Sofa_albedo.png` | Overly modern upholstery |
| `Bed_wide_cute_albedo.png` | Too "cute" aesthetic |
| `Big_picture_albedo.png` | Review needed |

---

## Integration Pipeline

```
handpainted-assets/textures/
        │
        ├── SELECT (this document — 53 curated)
        │
        ▼
public/legacy-reference-docs/handpainted-textures/
        │
        ├── ADAPT (crop, recolor, restyle in image editor)
        ├── CONVERT (resize to atlas size: 128×128 or 256×256 for PixiJS)
        │
        ▼
public/environment-assets/house-of-mensah/
        │
        ├── interior/
        ├── furniture/
        ├── props/
        ├── floors/
        └── walls/
        │
        ▼
legacy-map-engine.ts environment registry
        │
        ▼
LegacyChapterWorld → PixiJS texture atlas
```

## Priority for House of Mensah Interior Production

1. **Floors**: `Floor_wood_seamless_albedo.png` → crop to 128×128 tile
2. **Walls**: `Wall_wood_seamless_albedo.png` + `Wall_green_seamless_albedo.png`
3. **Doors**: `Door_painted_albedo.png` + `Painted_door_albedo.png`
4. **Furniture**: baskets, stools, tables, shelves, lamps
5. **Plants**: monstera, indoor plants (excellent for West African courtyard)
6. **Cooking area**: adapted stove + utensils + drying rack + sacks

Each texture should be adapted (cropped/recolored) to match the Niakofa visual language:
warm earth tones, aged textures, hand-painted feel — NOT photorealistic.
