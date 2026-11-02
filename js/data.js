// Game data: civilizations, units, buildings, resources.
window.G = window.G || {};

G.TW = 64;          // iso tile width (px at zoom 1)
G.TH = 32;          // iso tile height
G.MAP = 72;         // map size in tiles

G.PLAYER_COLORS = { 0: '#bbbbbb', 1: '#2f6fd6', 2: '#d63a2f', 3: '#3aa04a', 4: '#e0a91c' };
G.PLAYER_COLOR_NAMES = { 1: 'Blue', 2: 'Red', 3: 'Green', 4: 'Yellow' };

G.CIVS = {
  britons: {
    role: "Archers",
    history: "The peoples of medieval Britain, from the Anglo-Saxon kingdoms to the England of the Plantagenets. Their archers became the terror of European battlefields: at Crécy (1346) and Agincourt (1415), English longbowmen cut down far larger armies of mounted knights.",
    bonuses: ["Archers +1 range", "Archers 20% cheaper", "Town Center works 15% faster"],
    name: 'Britons', color: '#2f6fd6',
    desc: 'Archer civ. Archers +1 range and 20% cheaper. Town Center works 15% faster.',
    mods: { archerRange: 1, archerCost: 0.8, tcSpeed: 1.15 },
    unique: { type: 'longbowman', at: 'castle', text: 'Longbowman — trained at the Castle. Out-ranges every other archer (5 tiles, +1 from the Britons bonus) and hits harder. The bowmen of Crécy and Agincourt.' }
  },
  franks: {
    role: "Cavalry",
    history: "A Germanic people who built the strongest kingdom in post-Roman western Europe. Clovis I united them around 500, and Charlemagne was crowned Emperor of the Romans in 800. Their armoured horsemen grew into the mounted knights of the high Middle Ages.",
    bonuses: ["Knights +25% HP", "Farms hold 25% more food", "Berries gathered 20% faster"],
    name: 'Franks', color: '#3a8f3a',
    desc: 'Cavalry civ. Knights +25% HP. Farms 25% more food. Berries gathered 20% faster.',
    mods: { knightHp: 1.25, farmFood: 1.25, berryRate: 1.2 },
    unique: { type: 'axethrower', at: 'castle', text: 'Axe Thrower — trained at the Castle. Infantry that hurls the francisca, a throwing axe, from 3 tiles away, and chews through buildings. Armoured enough to stand in the shield line when the axes run out.' }
  },
  byzantines: {
    role: "Defense",
    history: "The Eastern Roman Empire, ruled from Constantinople for over a thousand years until 1453. Behind the great Theodosian Walls, the city outlasted wave after wave of sieges, defended by armoured cataphracts and disciplined spearmen.",
    bonuses: ["Buildings +30% HP", "Spearmen 25% cheaper", "Units heal slowly near the Town Center"],
    name: 'Byzantines', color: '#8a3fb8',
    desc: 'Defensive civ. Buildings +30% HP. Spearmen 25% cheaper. Units heal slowly near Town Center.',
    mods: { buildingHp: 1.3, spearCost: 0.75, tcHeal: true },
    unique: { type: 'cataphract', at: 'castle', text: 'Cataphract — trained at the Castle. A horseman armoured head to hoof, who rides straight over infantry: huge bonus damage against foot soldiers and little to fear from arrows. The heavy fist of the Eastern Roman army.' }
  },
  chinese: {
    role: "Economy",
    history: "Under the Tang and Song dynasties, China was the largest and richest state on earth, with vast cities, paper money, printing and gunpowder. Huge populations and a well-run state let its armies field crossbowmen and cavalry in enormous numbers.",
    bonuses: ["Start with +3 villagers (but −50 food)", "Houses support 10 population", "Villagers 10% cheaper"],
    name: 'Chinese', color: '#d4a017',
    desc: 'Economy civ. Start with +3 villagers but -50 food. Houses support 10 pop. Villagers 10% cheaper.',
    mods: { extraVils: 3, startFoodDelta: -50, housePop: 10, vilCost: 0.9 },
    unique: { type: 'repeater', at: 'castle', text: 'Repeater Crossbowman — trained at the Castle. The chu-ko-nu: a magazine crossbow that looses bolt after bolt, each one light but twice as fast as any other bow. Deadly in numbers, which the Chinese always had.' }
  }
};

// Unit definitions. speed in tiles/sec, range in tiles, rate = seconds between attacks.
G.UNITS = {
  villager: { name: 'Villager', cost: { food: 50 }, time: 10, hp: 25, atk: 3, range: 0.6, rate: 2, armor: 0, pierce: 1, speed: 1.6, los: 4, icon: '👷', cls: 'vil' },
  militia:  { name: 'Swordsman', cost: { food: 60, gold: 20 }, time: 12, hp: 50, atk: 7, range: 0.6, rate: 2, armor: 1, pierce: 1, speed: 1.5, los: 4, icon: '⚔️', cls: 'inf', bonus: { bld: 3 } },
  spearman: { name: 'Spearman', cost: { food: 35, wood: 25 }, time: 11, hp: 45, atk: 4, range: 0.7, rate: 2, armor: 0, pierce: 0, speed: 1.5, los: 4, icon: '🔱', cls: 'inf', bonus: { cav: 15 } },
  archer:   { name: 'Archer', cost: { wood: 25, gold: 45 }, time: 14, hp: 30, atk: 4, range: 4, rate: 2, armor: 0, pierce: 0, speed: 1.4, los: 6, icon: '🏹', cls: 'arc', ranged: true, bonus: { inf: 2 } },
  longbowman: { name: 'Longbowman', cost: { wood: 35, gold: 40 }, time: 15, hp: 35, atk: 6, range: 5, rate: 2, armor: 0, pierce: 1, speed: 1.4, los: 7, icon: '🎯', cls: 'arc', ranged: true, bonus: { inf: 2 } },
  knight:   { name: 'Knight', cost: { food: 60, gold: 75 }, time: 18, hp: 100, atk: 10, range: 0.7, rate: 1.8, armor: 2, pierce: 2, speed: 2.4, los: 5, icon: '🐎', cls: 'cav' },
  // ---- unique units (one per dynasty, trained at the Castle) ----
  axethrower: { name: 'Axe Thrower', cost: { food: 55, gold: 25 }, time: 15, hp: 50, atk: 7, range: 3, rate: 2, armor: 1, pierce: 1, speed: 1.5, los: 6, icon: '🪓', cls: 'inf', ranged: true, bonus: { bld: 4 } },
  cataphract: { name: 'Cataphract', cost: { food: 70, gold: 75 }, time: 20, hp: 110, atk: 9, range: 0.7, rate: 1.8, armor: 2, pierce: 3, speed: 2.2, los: 5, icon: '🛡️', cls: 'cav', bonus: { inf: 9 } },
  repeater:   { name: 'Repeater Crossbowman', cost: { wood: 40, gold: 35 }, time: 16, hp: 35, atk: 3, range: 4, rate: 1, armor: 0, pierce: 0, speed: 1.4, los: 6, icon: '🎯', cls: 'arc', ranged: true, bonus: { inf: 1 } }
};

// Buildings. size in tiles (square footprint).
G.BUILDINGS = {
  towncenter: { name: 'Town Center', cost: { wood: 275, stone: 100 }, time: 60, hp: 2400, size: 3, los: 8, pop: 5, drop: ['food','wood','gold','stone'], trains: ['villager'], garrison: 15, atk: 5, range: 6, rate: 2, icon: '🏰' },
  house:      { name: 'House', cost: { wood: 25 }, time: 15, hp: 550, size: 2, los: 2, pop: 5, icon: '🏠' },
  mill:       { name: 'Mill', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['food'], icon: '🌾' },
  lumbercamp: { name: 'Lumber Camp', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['wood'], icon: '🪵' },
  miningcamp: { name: 'Mining Camp', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['gold','stone'], icon: '⛏️' },
  farm:       { name: 'Farm', cost: { wood: 60 }, time: 10, hp: 480, size: 2, los: 1, farm: 175, reseed: 25, icon: '🟫' },
  barracks:   { name: 'Barracks', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['militia','spearman'], icon: '⚔️' },
  range:      { name: 'Archery Range', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['archer'], icon: '🏹' },
  stable:     { name: 'Stable', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['knight'], icon: '🐎' },
  blacksmith: { name: 'Blacksmith', cost: { wood: 150 }, time: 35, hp: 1500, size: 3, los: 5, icon: '⚒️' },
  castle:     { name: 'Castle', cost: { stone: 350 }, time: 80, hp: 3000, size: 4, los: 9, garrison: 20, atk: 11, range: 8, rate: 2, icon: '🏯' },
  tower:      { name: 'Watch Tower', cost: { wood: 25, stone: 125 }, time: 40, hp: 1020, size: 1, los: 8, atk: 5, range: 7, rate: 2, icon: '🗼' }
};
// ---- Ages (AoE2): advance at the Town Center. Each Age needs 2 buildings from the previous one. ----
G.AGES = [
  null,
  { name: 'Dark Age', short: 'Dark' },
  { name: 'Feudal Age', short: 'Feudal', cost: { food: 500 }, time: 45, needs: ['mill', 'lumbercamp', 'miningcamp', 'barracks'], bonus: 'Unlocks Archery Range, Stable, Watch Tower, Spearman, Archer' },
  { name: 'Castle Age', short: 'Castle', cost: { food: 800, gold: 200 }, time: 60, needs: ['range', 'stable', 'tower', 'blacksmith'], bonus: 'Unlocks Knight and unique units. All soldiers +1 attack' },
  { name: 'Imperial Age', short: 'Imperial', cost: { food: 1000, gold: 800 }, time: 75, needs: ['castle'], bonus: 'All soldiers +1 attack, +1 armor. Buildings +20% HP' }
];
G.BUILD_AGE = { tower: 2, range: 2, stable: 2, blacksmith: 2, castle: 3 };
// ---- Unit upgrade lines (AoE2): researched at a building, upgrade every unit of that line ----
// stats are the unit's new values (any field of G.UNITS); tier picks the upgraded look.
G.UPGRADES = {
  manatarms:    { name: 'Man-at-Arms',     line: 'militia',    tier: 1, at: 'barracks', age: 2, cost: { food: 100, gold: 40 },   time: 30, stats: { hp: 55, atk: 8, armor: 1 } },
  longsword:    { name: 'Long Swordsman',  line: 'militia',    tier: 2, at: 'barracks', age: 3, cost: { food: 200, gold: 65 },   time: 40, stats: { hp: 60, atk: 10, armor: 1 } },
  champion:     { name: 'Champion',        line: 'militia',    tier: 3, at: 'barracks', age: 4, cost: { food: 750, gold: 350 },  time: 60, stats: { hp: 70, atk: 13, armor: 2 } },
  pikeman:      { name: 'Pikeman',         line: 'spearman',   tier: 1, at: 'barracks', age: 3, cost: { food: 215, gold: 90 },   time: 40, stats: { hp: 55, atk: 5, bonus: { cav: 22 } } },
  halberdier:   { name: 'Halberdier',      line: 'spearman',   tier: 2, at: 'barracks', age: 4, cost: { food: 300, gold: 600 },  time: 50, stats: { hp: 60, atk: 6, bonus: { cav: 32 } } },
  crossbow:     { name: 'Crossbowman',     line: 'archer',     tier: 1, at: 'range',    age: 3, cost: { food: 125, gold: 75 },   time: 35, stats: { hp: 35, atk: 5 } },
  arbalester:   { name: 'Arbalester',      line: 'archer',     tier: 2, at: 'range',    age: 4, cost: { food: 350, gold: 300 },  time: 50, stats: { hp: 40, atk: 6, range: 5 } },
  elitelongbow: { name: 'Elite Longbowman',line: 'longbowman', tier: 1, at: 'castle',   age: 4, cost: { food: 850, gold: 850 },  time: 50, stats: { hp: 40, atk: 7, range: 6 } },
  eliteaxe:     { name: 'Elite Axe Thrower',line: 'axethrower',tier: 1, at: 'castle',   age: 4, cost: { food: 900, gold: 500 },  time: 50, stats: { hp: 60, atk: 8, range: 4, armor: 2 } },
  elitecata:    { name: 'Elite Cataphract', line: 'cataphract',tier: 1, at: 'castle',   age: 4, cost: { food: 1200, gold: 600 }, time: 50, stats: { hp: 150, atk: 11, armor: 3, bonus: { inf: 13 } } },
  eliterepeater:{ name: 'Elite Repeater',   line: 'repeater',  tier: 1, at: 'castle',   age: 4, cost: { food: 760, gold: 760 },  time: 50, stats: { hp: 40, atk: 4, rate: 0.9 } },
  cavalier:     { name: 'Cavalier',        line: 'knight',     tier: 1, at: 'stable',   age: 4, cost: { food: 300, gold: 300 },  time: 50, stats: { hp: 120, atk: 12 } },
  paladin:      { name: 'Paladin',         line: 'knight',     tier: 2, at: 'stable',   age: 4, cost: { food: 1300, gold: 750 }, time: 60, stats: { hp: 160, atk: 14, armor: 3, pierce: 3 } }
};
// ---- Blacksmith techs: bonuses for all soldiers ----
G.TECHS = {
  forging:     { name: 'Forging',      icon: 'attack',   age: 2, cost: { food: 150 },             time: 30, eff: { melee: 1 } },
  ironcasting: { name: 'Iron Casting', icon: 'attack',   age: 3, cost: { food: 220, gold: 120 },  time: 40, eff: { melee: 1 }, req: 'forging' },
  fletching:   { name: 'Fletching',    icon: 'archer',   age: 2, cost: { food: 100, wood: 50 },   time: 30, eff: { ranged: 1, range: 1 } },
  bodkin:      { name: 'Bodkin Arrow', icon: 'archer',   age: 3, cost: { food: 200, wood: 100 },  time: 40, eff: { ranged: 1, range: 1 }, req: 'fletching' },
  scalemail:   { name: 'Scale Mail',   icon: 'garrison', age: 2, cost: { food: 100 },             time: 30, eff: { armor: 1 } },
  chainmail:   { name: 'Chain Mail',   icon: 'garrison', age: 3, cost: { food: 200, gold: 100 },  time: 40, eff: { armor: 1, pierce: 1 }, req: 'scalemail' }
};
G.UNIT_AGE = { spearman: 2, archer: 2, knight: 3, longbowman: 3, axethrower: 3, cataphract: 3, repeater: 3 };
G.VIL_BUILDS = ['house','mill','lumbercamp','miningcamp','farm','barracks','range','stable','blacksmith','castle','tower','towncenter'];

G.RES = {
  tree:   { name: 'Tree',  res: 'wood',  amount: 100, rate: 0.45 },
  berry:  { name: 'Berry Bush', res: 'food', amount: 125, rate: 0.35 },
  gold:   { name: 'Gold Mine', res: 'gold', amount: 800, rate: 0.38 },
  stone:  { name: 'Stone Mine', res: 'stone', amount: 350, rate: 0.36 }
};
G.REGION = { britons: 'western', franks: 'western', byzantines: 'mediterranean', chinese: 'eastasian' };
// How each dynasty's villagers are dyed from the shared (Britons) sprites: cloth takes the
// dynasty's hue, skin is nudged a little. Britons are the painted original, so they have no
// entry. A dynasty with its own villager art stops being dyed on its own (see art.js).
// hue 0-360; sat/val/skin* are multipliers; skinH is a hue nudge in degrees.
G.CIV_LOOK = {
  franks:     { hue: 95,  sat: 0.70, val: 1.25, skinH: -3, skinS: 0.92, skinV: 1.07 },  // green wool
  byzantines: { hue: 42,  sat: 0.45, val: 1.95, skinH: 5,  skinS: 1.10, skinV: 0.86 },  // undyed linen
  chinese:    { hue: 212, sat: 0.60, val: 1.30, skinH: 2,  skinS: 0.90, skinV: 1.00 }   // indigo
};
// mounted units: drawn taller, with a bigger shadow and selection ring
G.mounted = e => ((e.def || G.UNITS[e.type] || {}).cls) === 'cav';
G.CARRY = 10;
G.FARM_RATE = 0.33;

G.START_RES = { food: 200, wood: 200, gold: 100, stone: 200 };
G.RES_PRESETS = {
  standard: { food: 200, wood: 200, gold: 100, stone: 200 },
  medium: { food: 500, wood: 500, gold: 300, stone: 300 },
  high: { food: 1000, wood: 1000, gold: 700, stone: 500 }
};
G.MAP_SIZES = { small: 56, medium: 72, large: 96 };
// Rectangle maps: a bigger grid with a screen-aligned playable rectangle (about the same land area).
G.MAP_SIZES_RECT = { small: 82, medium: 105, large: 140 };
// Current match rules (set by the skirmish screen).
G.rules = { size: 'medium', res: 'standard', pop: 200, reveal: 'normal', shape: 'rect' };
