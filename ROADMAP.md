# Dawn of Dynasties: Roadmap & Reuse Plan

The guiding rule: **pay for pieces, not combinations.** Every asset should be made once and reused as widely as possible, so credits go into new content, not redoing old content.

---

## 1. Which method for which asset

| Asset | Method | Why |
|---|---|---|
| Buildings, resources, crests, title and UI art | 2D image generation (Kie, GPT Image) | Static, one image each, results already match the art style |
| Anything that moves (villagers, soldiers, King and Queen, siege) | 3D models rendered to sprites | 8 directions, smooth motion, shared animations, free re-renders |

The current painted Britons villagers (2D sheets) stay in the game until the 3D pipeline is proven, then get replaced.

---

## 2. Reuse system

### 2.1 Animations: made once, shared by everything
- **One human skeleton** for every humanoid: villagers, soldiers, King, Queen, monks, and later fantasy races.
- **One horse skeleton** with a rider slot for all cavalry.
- Each motion is bought once and works for every unit on that skeleton. Improving a motion improves every unit at once.

**Human animation library**

| Group | Animations |
|---|---|
| Movement | idle, walk, run |
| Work (villagers) | chop, mine, farm, forage, build, carry (wood / ore / food) |
| Combat | sword swing, spear thrust, bow shot, crossbow shot, throw, hit reaction, death ×2, victory cheer |
| Support | heal/bless (Monk, Queen), command gesture (King) |

**Horse library:** idle, walk, gallop, rider strike, death.
**Siege:** ram swing; trebuchet wind-up and launch; mangonel fire (later).

### 2.2 Units are built from parts ("body + kit")
A unit is defined in data, not drawn as a whole:

```js
swordsman: { body: 'western_m', armour: 'leather', helmet: 'cap', weapon: 'sword', shield: 'round' }
champion:  { body: 'western_m', armour: 'plate',   helmet: 'great_helm', weapon: 'sword', shield: 'kite' }
```

| Part | Pieces (paid once each) | Notes |
|---|---|---|
| Bodies | per region and sex: Western, Mediterranean, East Asian (+ per-dynasty villager bodies) | skin, face, hair, base clothes |
| Armour | leather, chainmail, plate | fitted to the skeleton once |
| Helmets | none, cap, kettle, great helm (+ regional variants) | snapped to the head bone |
| Weapons | sword, spear, bow, crossbow, axe, mallet, pickaxe, sickle, lance | snapped to the hand bone |
| Shields | round, kite, tower | snapped to the arm bone |

About 20–30 paid pieces give hundreds of possible units. Every combination is a free re-render: 8 directions × every animation, produced by script.

**Fallback:** if fitting armour over AI-made bodies proves too fiddly, each unit becomes one full model (~65 Meshy credits) that still uses the shared animations.

### 2.3 Ages: upgrades, not new art
- **Units:** an Age upgrade swaps armour and helmet tiers on the same body (Swordsman → Champion, Knight → Paladin). No new model, no new animation.
- **Buildings:** each building is made once per region. Age looks are made by feeding that image back to the image model ("same building, upgraded…"), which costs one cheap image per building per tier with the same footprint and angle.
- To save more, use **2 visual tiers**: wood (Dark/Feudal) and stone (Castle/Imperial).

### 2.4 Shared by region, unique where it shows
| What | Shared or unique |
|---|---|
| Villagers | Unique per dynasty (skin, clothing), male and female |
| Soldiers | Shared by region: Western (Britons, Franks), Mediterranean (Byzantines), East Asian (Chinese) |
| Unique unit | One per dynasty |
| King and Queen | Unique per dynasty |
| Buildings | One set per region, upgraded per Age tier |
| Siege | Shared by everyone |

### 2.5 Team colour
All art uses pure magenta `#FF00FF` on team-coloured parts (see `ASSETS.md`). The game recolours it per player, so no art is ever made per colour.

### 2.6 Data-driven game
Units, buildings, dynasties, Ages, upgrades and kits live in data files. Adding a dynasty = data + art, with no engine changes. The same engine, skeletons and tools will power the fantasy game later.

---

## 3. Unit roster

| Age | Infantry | Archers | Cavalry | Other |
|---|---|---|---|---|
| Dark | Swordsman | | | Villager |
| Feudal | Spearman | Archer | Scout Rider | |
| Castle | | Crossbowman (upgrade) | Knight | Unique unit, Monk (heals), Battering Ram |
| Imperial | Champion (upgrade) | | Paladin (upgrade) | Trebuchet |

### Ages: what each one unlocks
| Age | To advance | New buildings | New units |
|---|---|---|---|
| Dark (start) | n/a | Town Center, House, Mill, Lumber Camp, Mining Camp, Farm, Barracks | Villager, Swordsman |
| Feudal | 500 food + 2 Dark Age buildings | Archery Range, Stable, Blacksmith, Market, Watch Tower, Palisade Wall | Spearman, Archer, Scout Rider |
| Castle | 800 food, 200 gold + 2 Feudal buildings | Castle, Monastery, Siege Workshop, University, Stone Wall, extra Town Centers | Knight, Unique unit, Monk, Battering Ram, Crossbowman upgrade |
| Imperial | 1000 food, 800 gold + 2 Castle buildings | Wonder (alternative victory) | Champion and Paladin upgrades, Trebuchet |

Upgrades: Blacksmith (armour and weapons), University (building strength, range), Age-ups (gathering speed). The prototype currently unlocks everything from the start; Phase 2 adds the Ages.

**Reuse:** new units in later Ages are mostly new kit combinations; new building types are one image per region plus their tier upgrade; upgrades need no new art except armour swaps.

### Unique units
| Dynasty | Unit | Role |
|---|---|---|
| Britons | Longbowman | Longest-range archer |
| Franks | Axe Thrower | Infantry that hurls axes for heavy damage |
| Byzantines | Cataphract | Heavily armoured horseman |
| Chinese | Repeater Crossbowman | Fires several bolts per volley |

### King and Queen
- **King:** central to the **Regicide** game mode, where you lose if your King dies. Tough but slow and weak in combat, so you guard him while hunting the enemy's.
- **Queen:** proposed as a **support hero** who heals or boosts nearby troops, so bringing her into battle is a risk-and-reward choice. *(To confirm.)*
- Each dynasty has its own King and Queen look, also used on the Dynasties pages and in the campaign.

### Effects
Arrows and bolts (done), weapon clash sparks, dust, buildings burning when damaged and crumbling to rubble. Blood is optional with an on/off setting, which helps app store age ratings.

---

## 4. Budget estimate (4 dynasties)

| Item | Count |
|---|---|
| Villager bodies (4 dynasties × male, female) | 8 |
| Regional soldier bodies | 3–6 |
| Armour, helmets, weapons, shields | ~20–30 pieces |
| Unique units | 4 |
| Kings and Queens | 8 |
| Siege engines | 2–3 |
| Animations | one-off library, shared |

- **Modular route:** roughly 45–60 paid 3D items. Full-model costs are ~65 Meshy credits each; parts are cheaper.
- **Fallback (one model per unit):** ~40 models × ~65 ≈ 2,600 Meshy credits.
- **Buildings:** 3 regions × 10 buildings × 2 tiers ≈ 60 Kie images.

Rule of thumb: **test one before making many.** Every new kind of asset gets a single test before a batch.

---

## 5. Roadmap

| Phase | Goal | Status |
|---|---|---|
| 0 | Engine, map, economy, combat, AI, menus, skirmish setup, save/continue | ✅ Done |
| 0 | Painted buildings, resources, title screen, Britons villagers (2D) | ✅ Done |
| 1 | **Lock the unit pipeline:** (a) one 3D villager rendered in 8 directions; (b) one modular soldier: 1 body, 2 armour tiers, 2 weapons | Next |
| 2 | **Core systems:** Ages and upgrades, unique units, King and Queen with Regicide mode, Monk, siege, sound | |
| 3 | **Content production:** run the pipeline for all dynasties, regions, units and building tiers | |
| 4 | **Campaign, tutorial mission, polish, performance**; release as installable web app, then Android via Capacitor | |
| 5 | **Fantasy game** on the same engine, skeletons and tools, with new art and data | |

### Phase 1 needs
- Meshy account with API credits and an API key
- Allowed domains in Claude settings: `api.meshy.ai`, `assets.meshy.ai`
- Already set up: Kie (`api.kie.ai`, `tempfile.aiquickdraw.com`)

---

## 6. Tools in this repo
| Tool | Purpose |
|---|---|
| `tools/process_art.py` | Building and resource images → aligned, scaled game sprites + `assets/manifest.json` |
| `tools/process_sheet.py` | AI animation grid sheets → aligned sprite strips (one scale per character) |
| `tools/process_unit.py` | Horizontal animation strips → sprite strips |
| `ASSETS.md` | Art specification: projection, scale, canvases, team colour |
