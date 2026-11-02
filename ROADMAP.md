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

### 2.6 Free and multiplied assets (no credits)
**Made in code**
- Effects as particles: fire and smoke on damaged buildings, dust, weapon sparks, arrows, rubble piles
- Terrain drawn by code: ground, dirt roads, shallow water, shorelines
- Construction: the finished building rises bottom-up behind the shared scaffolding as progress grows (no stage images)
- Damage states: cracks, smoke and flames layered over the normal sprite as HP drops

**Multiplied from existing art**
- Map themes by recolouring: autumn, winter and desert versions of trees, grass and berries
- Variety by flipping, scaling and slight tinting of trees, rocks and gold (never buildings, whose lighting would flip)
- Icons and portraits cut from sprites or rendered from 3D models

**One-time packs, reused everywhere**
- Props pack: fences, barrels, carts, haystacks, flowers, banners, rocks, scattered by code
- Terrain pack: cliffs, bridges, dock edges, used on every map and in the campaign
- Sound: free CC0 libraries (Kenney, Freesound CC0) plus a few voice lines per region, not per unit

**Spending rules**
- Draft prompts with the cheaper model at low resolution; generate the final only once the prompt is right
- Fix by reprocessing, never by regenerating: size, alignment, background and colour are fixed by script; originals stay in `assets/source/`
- Small things (resources, props) at small resolution
- Test one before making many

### 2.7 Data-driven game
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
All four are in the game, trained at the Castle, each with an Elite upgrade.

| Dynasty | Unit | Role |
|---|---|---|
| Britons | Longbowman | Longest-range archer |
| Franks | Axe Thrower | Infantry that hurls axes for heavy damage |
| Byzantines | Cataphract | Heavily armoured horseman |
| Chinese | Repeater Crossbowman | Fires several bolts per volley |

### King and Queen
- **King:** central to the **Regicide** game mode, where you lose if your King dies. Tough but slow and weak in combat, so you guard him while hunting the enemy's.
- **Queen:** a **support hero** who heals nearby troops a little faster than a Monk, so bringing her into battle is a risk-and-reward choice. Built, and she takes no population.
- Each dynasty has its own King and Queen look. They are the shared villager body with a crown, mantle and gown as props, dyed per dynasty like the villagers, so the set cost no Meshy credits rather than the eight models first budgeted.

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
| 1 | **Lock the unit pipeline:** (a) one 3D villager rendered in 8 directions; (b) one modular soldier: 1 body, 2 armour tiers, 2 weapons | ✅ Done |
| 1b | **Free polish:** buildings rise during construction, fire/smoke/rubble damage states, tree and rock variety | ✅ Done |
| 2 | **Core systems:** Ages and upgrades, unique units, King and Queen with Regicide mode, Monk, siege, walls and gates | ✅ Done (sound effects outstanding) |
| 3 | **Content production:** run the pipeline for all dynasties, regions, units and building tiers | In progress — all four dynasties and three regions done; Dark Age building tier done, Feudal/Castle/Imperial tiers outstanding |
| 4 | **Campaign, tutorial mission, polish, performance**; release as installable web app, then Android via Capacitor | |
| 5 | **Fantasy game** on the same engine, skeletons and tools, with new art and data | |

### Phase 1 needs
- Meshy account (Pro plan ✅) and an API key
- Allowed domains in Claude settings: `api.meshy.ai`, `assets.meshy.ai`
- Already set up: Kie (`api.kie.ai`, `tempfile.aiquickdraw.com`)

---

## 6. Tools in this repo
| Tool | Purpose |
|---|---|
| `tools/gen_art.py` | Generate art with Kie, image-to-image from the sprites already in the repo |
| `tools/art_jobs/*.json` | The prompt sets that made the current art — buildings, siege engines, icons |
| `tools/ingest_art.py` | Sort generated art into regions and run `process_art.py` over it |
| `tools/process_art.py` | Building and resource images → aligned, scaled game sprites + `assets/manifest.json` |
| `tools/process_sheet.py` | AI animation grid sheets → aligned sprite strips (one scale per character) |
| `tools/process_unit.py` | Horizontal animation strips → sprite strips |
| `tools/render3d/setup.sh` | Fetch three.js and the rigged models, so a re-render needs no hand assembly |
| `tools/render3d/drive_jobs.py` | Render a rigged GLB to 8-direction sheets (free: no Meshy credits) |
| `tools/process_render.py` | 3D render output → game sheets + manifest |
| `ASSETS.md` | Art specification: projection, scale, canvases, team colour |

### Making art without wasting credits
The whole point of the pipeline is that a thing is paid for once and used everywhere.

**Images (Kie, ~6 credits each).** Never prompt a building from nothing: generate it
image-to-image from the matching sprite in `assets/source/`, so the camera angle, the
footprint and the painted style come along and the prompt only has to describe what
changes. The prompt sets that worked are in `tools/art_jobs/`; start from them.

```
KIE_KEY=... python3 tools/gen_art.py tools/art_jobs/buildings.json
python3 tools/ingest_art.py build/art/buildings
```

Buildings are made once per **region**, not per dynasty, so another Mediterranean or East
Asian dynasty inherits the whole set for nothing. Villagers are not made per dynasty at
all — they are dyed from the shared set at runtime (`G.CIV_LOOK`). Siege is shared by
everyone: two sprites, however many dynasties there are.

The key is restricted to the GPT Image models. Kie validates input *before* it checks
authorisation, so an unauthorised model answers 422 about a missing field and looks
available; only a fully-formed request returns the 401 that tells the truth.

**Animation (Meshy).** Credits are spent only on rigging a model and on generating a
motion. After that the GLB is yours and every render from it is free, for ever:

```
bash tools/render3d/setup.sh                                  # three.js + the GLBs
python3 tools/render3d/drive_jobs.py tools/render3d/j_cata.json out_cata
python3 tools/process_render.py out_cata unit3d_byzantines_cataphract_m 110
```

Rig every new model to the **same skeleton** and it inherits the entire motion library at
no cost — the mounted hit reaction uses `Hit_Reaction_1`, the same clip the swordsman
already uses, and it serves the Cataphract and all three Knight tiers. The horse is built
in code, so every mounted unit is free.

⚠️ **Meshy deletes tasks after about three days.** Anything newly rigged or animated must
be pushed to the `models` branch inside that window, or it is gone and must be bought
again. `setup.sh` restores everything from there.


---

## Game logic still to build

Checked against the code, not from memory. Already in and working: garrison (Town Centre
and Castle), line formations, villager repair, control groups, minimap, idle-villager,
rally points, farm re-sowing, conquest and Regicide victory.

**1. Market.** There is no way to trade one resource for another. A player who runs out of
gold has no route back — no selling surplus wood, no trade carts. In Age of Empires the
Market is what unsticks a stalled economy, and this game has no equivalent. Biggest gap.

**2. Monk conversion and relics.** Monks only heal. They cannot convert enemy units, there
are no relics on the map and no relic gold trickle, which leaves the Monastery half a
building and the Monk a medic.

**3. Unit stances and patrol.** No aggressive / defensive / stand-ground / no-attack, and
no patrol command. Units auto-acquire on one fixed behaviour, so archers cannot be told to
hold a line and villagers cannot be told to stop wandering into a fight.

**4. Victory conditions.** Conquest and Regicide only. No Wonder, no relic victory, no time
or score limit, so every game ends by elimination.

**5. Per-dynasty tech trees.** Every dynasty can build and research everything, plus its own
unique unit. In Age of Empires what a civilisation *cannot* do defines it as much as its
bonuses — the Franks having no Crossbowman is the point.

**6. The AI ignores tools it already has.** Zero references in `ai.js` to walls, gates,
garrisoning or repair. It reaches the Castle Age with stone walls and a Castle available and
never walls its town, never pulls villagers inside under attack, and never repairs anything.

**7. Tower garrison.** Towers have no garrison capacity, so units cannot add arrows to one.

Deliberately out of scope for now: water, docks, ships and fishing (no map generates water),
and diplomacy or tribute (there is no human opponent to trade with).

### Not logic, still outstanding
- Sound effects: 29 keys are wired to call sites and waiting on an effects pack. Music is in
  and loudness-normalised.
- Building tiers for Feudal, Castle and Imperial (the Dark Age tier is done).

---

## Building tiers by Age

A building's art can change with the Age, the way it does in Age of Empires. `art.js`
looks for `<region>_<type>_<tier>` and falls back to the building's default look, so a
tier can be filled in one building at a time and anything missing simply keeps the look
it already has.

Tiers are `dark`, `feudal`, `castle`, `imp`. Only `dark` exists so far — house, town
centre, barracks and mill, in all three regions — which is what gives the opening its
thatch-and-timber village before Feudal turns the town to stone. Everything else uses its
default art at every Age, which is the Feudal-and-later look.

To add a tier, name the jobs `<prefix>_<stem>_<tier>` (`med_house_feudal`) and the
existing pipeline handles the rest:

```
KIE_KEY=... python3 tools/gen_art.py tools/art_jobs/dark_age.json
python3 tools/ingest_art.py build/art/dark_age
python3 -I tools/shrink_sprites.py --apply assets/*_feudal.png
```
