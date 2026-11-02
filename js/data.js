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
    mods: { archerRange: 1, archerCost: 0.8, tcSpeed: 1.15 }
  },
  franks: {
    role: "Cavalry",
    history: "A Germanic people who built the strongest kingdom in post-Roman western Europe. Clovis I united them around 500, and Charlemagne was crowned Emperor of the Romans in 800. Their armoured horsemen grew into the mounted knights of the high Middle Ages.",
    bonuses: ["Knights +25% HP", "Farms hold 25% more food", "Berries gathered 20% faster"],
    name: 'Franks', color: '#3a8f3a',
    desc: 'Cavalry civ. Knights +25% HP. Farms 25% more food. Berries gathered 20% faster.',
    mods: { knightHp: 1.25, farmFood: 1.25, berryRate: 1.2 }
  },
  byzantines: {
    role: "Defense",
    history: "The Eastern Roman Empire, ruled from Constantinople for over a thousand years until 1453. Behind the great Theodosian Walls, the city outlasted wave after wave of sieges, defended by armoured cataphracts and disciplined spearmen.",
    bonuses: ["Buildings +30% HP", "Spearmen 25% cheaper", "Units heal slowly near the Town Center"],
    name: 'Byzantines', color: '#8a3fb8',
    desc: 'Defensive civ. Buildings +30% HP. Spearmen 25% cheaper. Units heal slowly near Town Center.',
    mods: { buildingHp: 1.3, spearCost: 0.75, tcHeal: true }
  },
  chinese: {
    role: "Economy",
    history: "Under the Tang and Song dynasties, China was the largest and richest state on earth, with vast cities, paper money, printing and gunpowder. Huge populations and a well-run state let its armies field crossbowmen and cavalry in enormous numbers.",
    bonuses: ["Start with +3 villagers (but −50 food)", "Houses support 10 population", "Villagers 10% cheaper"],
    name: 'Chinese', color: '#d4a017',
    desc: 'Economy civ. Start with +3 villagers but -50 food. Houses support 10 pop. Villagers 10% cheaper.',
    mods: { extraVils: 3, startFoodDelta: -50, housePop: 10, vilCost: 0.9 }
  }
};

// Unit definitions. speed in tiles/sec, range in tiles, rate = seconds between attacks.
G.UNITS = {
  villager: { name: 'Villager', cost: { food: 50 }, time: 10, hp: 25, atk: 3, range: 0.6, rate: 2, armor: 0, pierce: 1, speed: 1.6, los: 4, icon: '👷', cls: 'vil' },
  militia:  { name: 'Swordsman', cost: { food: 60, gold: 20 }, time: 12, hp: 50, atk: 7, range: 0.6, rate: 2, armor: 1, pierce: 1, speed: 1.5, los: 4, icon: '⚔️', cls: 'inf', bonus: { bld: 3 } },
  spearman: { name: 'Spearman', cost: { food: 35, wood: 25 }, time: 11, hp: 45, atk: 4, range: 0.7, rate: 2, armor: 0, pierce: 0, speed: 1.5, los: 4, icon: '🔱', cls: 'inf', bonus: { cav: 15 } },
  archer:   { name: 'Archer', cost: { wood: 25, gold: 45 }, time: 14, hp: 30, atk: 4, range: 4, rate: 2, armor: 0, pierce: 0, speed: 1.4, los: 6, icon: '🏹', cls: 'arc', ranged: true, bonus: { inf: 2 } },
  knight:   { name: 'Knight', cost: { food: 60, gold: 75 }, time: 18, hp: 100, atk: 10, range: 0.7, rate: 1.8, armor: 2, pierce: 2, speed: 2.4, los: 5, icon: '🐎', cls: 'cav' }
};

// Buildings. size in tiles (square footprint).
G.BUILDINGS = {
  towncenter: { name: 'Town Center', cost: { wood: 275, stone: 100 }, time: 60, hp: 2400, size: 3, los: 8, pop: 5, drop: ['food','wood','gold','stone'], trains: ['villager'], garrison: 15, atk: 5, range: 6, rate: 2, icon: '🏰' },
  house:      { name: 'House', cost: { wood: 25 }, time: 15, hp: 550, size: 2, los: 2, pop: 5, icon: '🏠' },
  mill:       { name: 'Mill', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['food'], icon: '🌾' },
  lumbercamp: { name: 'Lumber Camp', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['wood'], icon: '🪵' },
  miningcamp: { name: 'Mining Camp', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['gold','stone'], icon: '⛏️' },
  farm:       { name: 'Farm', cost: { wood: 60 }, time: 10, hp: 480, size: 2, los: 1, farm: 175, icon: '🟫' },
  barracks:   { name: 'Barracks', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['militia','spearman'], icon: '⚔️' },
  range:      { name: 'Archery Range', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['archer'], icon: '🏹' },
  stable:     { name: 'Stable', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['knight'], icon: '🐎' },
  tower:      { name: 'Watch Tower', cost: { wood: 25, stone: 125 }, time: 40, hp: 1020, size: 1, los: 8, atk: 5, range: 7, rate: 2, icon: '🗼' }
};
G.VIL_BUILDS = ['house','mill','lumbercamp','miningcamp','farm','barracks','range','stable','tower','towncenter'];

G.RES = {
  tree:   { name: 'Tree',  res: 'wood',  amount: 100, rate: 0.45 },
  berry:  { name: 'Berry Bush', res: 'food', amount: 125, rate: 0.35 },
  gold:   { name: 'Gold Mine', res: 'gold', amount: 800, rate: 0.38 },
  stone:  { name: 'Stone Mine', res: 'stone', amount: 350, rate: 0.36 }
};
G.REGION = { britons: 'western', franks: 'western', byzantines: 'mediterranean', chinese: 'eastasian' };
G.CARRY = 10;
G.FARM_RATE = 0.33;

G.START_RES = { food: 200, wood: 200, gold: 100, stone: 200 };
G.RES_PRESETS = {
  standard: { food: 200, wood: 200, gold: 100, stone: 200 },
  medium: { food: 500, wood: 500, gold: 300, stone: 300 },
  high: { food: 1000, wood: 1000, gold: 700, stone: 500 }
};
G.MAP_SIZES = { small: 56, medium: 72, large: 96 };
// Current match rules (set by the skirmish screen).
G.rules = { size: 'medium', res: 'standard', pop: 200, reveal: 'normal' };
