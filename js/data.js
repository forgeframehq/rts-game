// Game data: civilizations, units, buildings, resources.
window.G = window.G || {};

G.TW = 64;          // iso tile width (px at zoom 1)
G.TH = 32;          // iso tile height
G.MAP = 72;         // map size in tiles

G.PLAYER_COLORS = { 0: '#bbbbbb', 1: '#2f6fd6', 2: '#d63a2f' };

G.CIVS = {
  britons: {
    name: 'Britons', color: '#2f6fd6',
    desc: 'Archer civ. Archers +1 range and 20% cheaper. Town Center works 15% faster.',
    mods: { archerRange: 1, archerCost: 0.8, tcSpeed: 1.15 }
  },
  franks: {
    name: 'Franks', color: '#3a8f3a',
    desc: 'Cavalry civ. Knights +25% HP. Farms 25% more food. Berries gathered 20% faster.',
    mods: { knightHp: 1.25, farmFood: 1.25, berryRate: 1.2 }
  },
  byzantines: {
    name: 'Byzantines', color: '#8a3fb8',
    desc: 'Defensive civ. Buildings +30% HP. Spearmen 25% cheaper. Units heal slowly near Town Center.',
    mods: { buildingHp: 1.3, spearCost: 0.75, tcHeal: true }
  },
  chinese: {
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
  towncenter: { name: 'Town Center', cost: { wood: 275, stone: 100 }, time: 60, hp: 2400, size: 3, los: 8, pop: 5, drop: ['food','wood','gold','stone'], trains: ['villager'], atk: 5, range: 6, rate: 2, icon: '🏰' },
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
G.CARRY = 10;
G.FARM_RATE = 0.33;

G.START_RES = { food: 200, wood: 200, gold: 100, stone: 200 };
