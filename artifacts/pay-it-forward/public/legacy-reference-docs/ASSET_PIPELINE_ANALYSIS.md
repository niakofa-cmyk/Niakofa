# Niakofa Legacy — Asset Pipeline Analysis & Scene Requirements

> Source: Agent investigation + uploaded asset analysis document, Aug 2026.

## House of Mensah Demo — Scene Asset Requirements

We need far less than the entire asset package. Build the demo asset set around these scenes:

### Scene 1 — Grandmother's House (Present Day)
- kitchen, dining room, photographs, family table
- chairs, cabinets, walls, windows, family artifacts

### Scene 2 — Mensah Family Compound, 1890
- village ground, dirt paths, homes, vegetation
- trees, farm, cocoa environment, tools, animals, marketplace objects

### Scene 3 — Village
- roads, homes, market, elders' gathering area
- wells, crops, trees, collectibles

### Scene 4 — Mission School
- school building, desks, books, paths, surrounding village

### Scene 5 — Collapse (World Regeneration of Scene 2/3)
Reuse the same world but swap state variants:
- damaged buildings, empty shops, missing NPCs, overgrown areas, lost artifacts

**KEY PRINCIPLE: The same world changes. That's World Regeneration.**
Do NOT create completely new maps for every chapter. Same asset library, different state.

### Migration Chapter (Chapter ~17)
Existing assets `Train.png`, `TrainStation.png`, `Roof_Train.png`, `Roof_TrainStation.png`
are already useful. Additionally need: port, ship, train station, train, city, neighborhood, new home.

## World Regeneration Timeline

Same asset library supports historical transformation:

| Era | World State |
|---|---|
| 1890 | Family compound · Healthy cocoa farm · Busy marketplace |
| 1912 | Expanded business · New school · More homes |
| 1920 | Damaged business · Fewer people · Abandoned buildings |
| 1930 | Migration — port, ships, trains |
| Present | Grandmother's house · Modern neighborhood · Family reunion |

## Weather System (img/weather/) — PRIORITY: HIGH

The weather folder is only ~0.6 MB. Contains: Rain, Fire, Leaves, Flowers, Clouds, Light,
Snow, Wind, Particles.

**Chapter-to-weather mapping:**
- Chapter 1 (Morning): Bright sunlight, light wind
- Chapter 3 (Betrayal): Clouds darken, wind increases  
- Chapter 4 (Collapse): Rain, empty marketplace, damaged buildings
- Chapter 5 (Migration): Ocean, storm, fog
- Present-day finale: Warm Sunday afternoon

This makes the world feel alive without huge additional technology.

## Event Indicators (img/eventindicators/) — Keep ALL

Tiny size. Reinterpret for Niakofa:

| Generic RPG | Niakofa Equivalent |
|---|---|
| Quest marker | Memory discovered |
| Quest_A.png | Ancestor clue |
| Quest_B.png | Family member |
| NewIndicator.png | Oral history / Landmark / Artifact |
| EnemyNormal/Hard/Boss | Chapter seed / New story |
| ArrowUp/Down/Left/Right | World navigation directionals |

## UI System — Harvest, Don't Copy

Generic RPG UI elements are reference only. Niakofa stat mapping:

| Generic RPG | Niakofa |
|---|---|
| HP | HEALTH |
| MP | KNOWLEDGE |
| XP | COURAGE |
| — | RELATIONSHIPS |
| — | LEGACY |

**Dialogue treatment**: Not a generic RPG dialogue box. Use the Niakofa cinematic dialogue
treatment (already built in `legacy-cinematic-dialogue.tsx`).

## Living Baobab — Dedicated Asset Spec

Do NOT use a generic tree as the final Niakofa Baobab. Create a dedicated asset:

```
Baobab_Base
Baobab_Branch_01 ... Baobab_Branch_N
Baobab_LeafCluster
Baobab_AncestorNode    ← ancestor portrait
Baobab_FamilyNode      ← family member portrait
Baobab_MemoryNode      ← memory/artifact
```

**Interaction flow:**
```
New family member → New branch → Family member portrait appears
→ Touch branch → Family member card opens → Tap card → Family Vault / RPG chapter
```

## What NOT to Put in Git

| Folder | Size | Decision |
|---|---|---|
| Grass/ | ~502 MB | ❌ Never in Git. Extract only referenced textures. |
| Ground/ | ~433 MB | ❌ Never in Git. Referenced textures only. |
| Tree Bark/ | ~289 MB | ❌ Never in Git. Referenced textures only. |
| Indoor Walls/ | ~144 MB | ❌ Never in Git. Referenced textures only. |
| img/weather/ | ~0.6 MB | ✅ Include all |
| img/eventindicators/ | tiny | ✅ Include all |
| img/UI/ | small | ✅ Include selectively |

**Production texture pattern:**
```
niakofa-legacy/assets/world/materials/
    village-ground.png
    cocoa-soil.png
    coastal-sand.png
    red-earth.png
    forest-floor.png
    family-compound-ground.png
```

## 3D Assets — Strategic Use Only

### Retro Tree Pack (~21 MB)
- Live Trees, Dead Trees, Tree Bark (GLB/FBX/OBJ/DAE)
- Super Low Res + Low Res variants: tree_rt_1..4, small_tree_rt_1, dead_tree_rt_1/2
- **Don't use as final Baobab** — create dedicated Niakofa Baobab asset instead
- Useful as: environmental foundation reference

### StylooVillageFREEPack (~14 MB)
- FBX + GLB: houses, carts, trees, fences, benches, gardens, street lights, billboards
- README recommends GLTF/GLB for easier use
- **Strategic use only**: Present-day grandmother's neighborhood (3D presentation layer)
- Don't mix 3D Styloo assets with the 2D RPG world — use selectively

### Brezhnevka.FBX (Soviet-era building)
- NOT a Niakofa environment asset
- Use as: 3D blockout/composition reference only

### Company Asset Pack Styloo (~49 MB, CC0)
- Contains: elf, knight, dragon, mage, nain, plants
- Fantasy characters: NOT a fit for House of Mensah
- Plant/environment assets: potentially useful
- Keep outside core repo until individual assets are actually used
