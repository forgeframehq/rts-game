# Art Asset Specification

Master spec for all sprites in Dawn of Dynasties. Every asset follows these rules so it lines up with the game's grid without manual fixes.

## Global rules
- **Style:** hand-painted, semi-realistic, matching `house` (the reference sprite).
- **Lighting:** from the top-left. Lit faces face up-left, shaded faces face down-right.
- **Projection:** true 2:1 isometric. Ground edges slope 26.57° (2 px across for every 1 px down). Left and right sides are symmetrical.
- **Background:** transparent PNG. No ground tile, no cast shadow outside the footprint.
- **Team colour:** pure magenta `#FF00FF` on roof trim, banners, flags, awnings, tunics and shields. Nothing else may be magenta or pink. The game recolours it per player.
- **Text:** none.

## Scale
One map tile at art scale is a diamond **256 px wide × 128 px tall**.

| Footprint | Diamond width | Diamond height |
|---|---|---|
| 1×1 | 256 px | 128 px |
| 2×2 | 512 px | 256 px |
| 3×3 | 768 px | 384 px |

## Canvas and alignment
The canvas is larger than the footprint so tall buildings fit. The footprint is always placed the same way:
- Centred horizontally on the canvas.
- The **bottom corner** of the footprint diamond sits **64 px above the bottom edge** of the canvas.

| Asset | Footprint | Canvas |
|---|---|---|
| Watch Tower | 1×1 | 512 × 1024 |
| House, Mill, Lumber Camp, Mining Camp, Farm | 2×2 | 768 × 768 |
| Town Center, Barracks, Archery Range, Stable | 3×3 | 1024 × 1024 |
| Trees, berry bush, gold, stone | 1×1 | 384 × 512 |
| Unit frames | — | 256 × 256 per frame (knight 384 × 384), feet at the same point in every frame |

AI image tools can't hit exact pixels. These are targets: the game measures each sprite's footprint and aligns it on import.

## Buildings
| File | Footprint | Notes |
|---|---|---|
| `building_house.png` | 2×2 | Reference sprite ✅ |
| `building_towncenter.png` | 3×3 | Stone ground floor, timber upper floor, corner keep with flag |
| `building_barracks.png` | 3×3 | Stone hall, crenellations, banners, weapon rack |
| `building_range.png` | 3×3 | Timber hall, straw targets |
| `building_stable.png` | 3×3 | Wooden stalls, hay, trough |
| `building_mill.png` | 2×2 | Windmill sails (drawn without sails is also fine; the game can animate them) |
| `building_lumbercamp.png` | 2×2 | Open shed, logs, chopping block |
| `building_miningcamp.png` | 2×2 | Open shed, ore cart, pickaxes |
| `building_farm.png` | 2×2 | Flat field with wheat rows and a low fence |
| `building_tower.png` | 1×1 | Tall stone tower, crenellated top, flag |
| `construction_1.png` / `_2` / `_3` | 1×1 / 2×2 / 3×3 | Optional: dirt footprint with scaffolding and planks |

## Resources
`res_tree_oak_1.png`, `res_tree_oak_2.png`, `res_tree_pine_1.png`, `res_tree_pine_2.png`, `res_berry.png`, `res_gold.png`, `res_stone.png`

## Units
One sheet per unit, facing south-east (the game mirrors it). Rows in this order, frames evenly spaced, no gaps or labels:

| Row | Frames |
|---|---|
| Idle | 4 |
| Walk | 8 |
| Attack | 6 |
| Death | 6 |

Villager adds rows for chop, mine, farm and build (6 frames each).
Files: `unit_villager.png`, `unit_swordsman.png`, `unit_spearman.png`, `unit_archer.png`, `unit_knight.png`

## Regional buildings
Buildings are made once per region, not once per dynasty. The regions are `western`
(Britons, Franks), `mediterranean` (Byzantines) and `eastasian` (Chinese), set by
`G.REGION` in `js/data.js`.

The western set is the plain `house.png`, `barracks.png` and so on above. A region's own
art is the same name under that region's prefix — `mediterranean_house`,
`eastasian_barracks` — and the game prefers it automatically, falling back to the western
set wherever a region has no art of its own. Adding a region's buildings needs no code
change.

Generate each one image-to-image from the matching western sprite in `assets/source/`, so
the camera angle, footprint width and painted style carry over and only the architecture
changes. Then process it with the region named:

```
python3 tools/process_art.py <folder of source PNGs> mediterranean
```

That measures each footprint, scales it to the grid, writes `assets/<region>_<key>.png`,
keeps the original under `assets/source/<region>/` and adds the anchors to the manifest.

## Villager dress
Villagers are painted once, for the Britons, and dyed for the other dynasties at runtime
(`dye()` in `js/art.js`, colours in `G.CIV_LOOK` in `js/data.js`). Each dynasty gets a
tunic colour, a second colour below the waist, its own hair and its own skin tone; the
face, hands and hair are found per frame, and magenta is left alone for the team colour.

So no villager art ships per dynasty. If a dynasty is later given villager sheets of its
own (`unit3d_franks_villager_m_idle` and friends), the dye stops applying to it by itself.

## Where files go
Put finished files in `assets/` in this repo using the file names above.
