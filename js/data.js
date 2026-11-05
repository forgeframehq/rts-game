// Game data: civilizations, units, buildings, resources.
window.G = window.G || {};

G.TW = 64;          // iso tile width (px at zoom 1)
G.TH = 32;          // iso tile height
G.MAP = 72;         // map size in tiles

G.PLAYER_COLORS = { 0: '#bbbbbb', 1: '#2f6fd6', 2: '#d63a2f', 3: '#3aa04a', 4: '#e0a91c' };
G.PLAYER_COLOR_NAMES = { 1: 'Blue', 2: 'Red', 3: 'Green', 4: 'Yellow' };
// the colours a player can pick in Skirmish; G.PLAYER_COLORS is filled from these for each game
G.PALETTE = [['Blue', '#2f6fd6'], ['Red', '#d63a2f'], ['Green', '#3aa04a'], ['Yellow', '#e0a91c'], ['Purple', '#8e44ad'], ['Orange', '#e67e22'], ['Teal', '#16a085'], ['White', '#e8e8e8']];
// royal titles and suggested names per dynasty (the player can type their own)
G.ROYALS = {
  britons:    { king: 'King', queen: 'Queen', names: [['Edward', 'Eleanor'], ['Alfred', 'Ealhswith'], ['Henry', 'Matilda'], ['Richard', 'Berengaria']] },
  franks:     { king: 'King', queen: 'Queen', names: [['Charles', 'Bertha'], ['Clovis', 'Clotilde'], ['Louis', 'Blanche'], ['Pepin', 'Bertrada']] },
  byzantines: { king: 'Emperor', queen: 'Empress', names: [['Basil', 'Theodora'], ['Justinian', 'Zoe'], ['Alexios', 'Irene'], ['Constantine', 'Helena']] },
  chinese:    { king: 'Emperor', queen: 'Empress', names: [['Taizong', 'Zhangsun'], ['Taizu', 'Du'], ['Wendi', 'Dugu'], ['Renzong', 'Cao']] },
  persians:   { king: 'Shah', queen: 'Shahbanu', names: [['Khosrow', 'Shirin'], ['Ardashir', 'Borandukht'], ['Shapur', 'Azarmidokht'], ['Bahram', 'Gordiya']] },
  incas:      { king: 'Sapa Inca', queen: 'Coya', names: [['Pachacuti', 'Mama Anawarkhi'], ['Tupac Yupanqui', 'Mama Ocllo'], ['Huayna Capac', 'Rahua Ocllo'], ['Manco Capac', 'Mama Huaco']] },
  cholas:     { king: 'Raja', queen: 'Rani', names: [['Rajaraja', 'Lokamahadevi'], ['Rajendra', 'Vanavan Mahadevi'], ['Kulothunga', 'Madhurantaki'], ['Parantaka', 'Kokkizhan']] }
};
G.royalName = (p, type) => { const pl = G.players[p]; if (!pl) return type; const R = G.ROYALS[pl.civ] || G.ROYALS.britons, n = (pl.royals || {})[type]; return (R[type] || type) + (n ? ' ' + n : ''); };

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
    bonuses: ["Knights +25% HP", "Cavalry 15% cheaper", "Farms hold 25% more food", "Berries gathered 20% faster"],
    name: 'Franks', color: '#3a8f3a',
    desc: 'Cavalry civ. Knights +25% HP. Cavalry 15% cheaper. Farms 25% more food. Berries gathered 20% faster.',
    mods: { knightHp: 1.25, cavCost: 0.85, farmFood: 1.25, berryRate: 1.2 },
    unique: { type: 'axethrower', at: 'castle', text: 'Axe Thrower — trained at the Castle. Infantry that hurls the francisca, a throwing axe, from 3 tiles away, and chews through buildings. Armoured enough to stand in the shield line when the axes run out.' }
  },
  byzantines: {
    role: "Defense",
    history: "The Eastern Roman Empire, ruled from Constantinople for over a thousand years until 1453. Behind the great Theodosian Walls, the city outlasted wave after wave of sieges, defended by armoured cataphracts and disciplined spearmen.",
    bonuses: ["Buildings +30% HP", "Spearmen 25% cheaper", "Castle and Imperial Ages 15% cheaper", "Units heal slowly near the Town Center"],
    name: 'Byzantines', color: '#8a3fb8',
    desc: 'Defensive civ. Buildings +30% HP. Spearmen 25% cheaper. Castle and Imperial Ages 15% cheaper. Units heal slowly near Town Center.',
    mods: { buildingHp: 1.3, spearCost: 0.75, tcHeal: true, ageDisc: { 3: 0.85, 4: 0.85 } },
    unique: { type: 'cataphract', at: 'castle', text: 'Cataphract — trained at the Castle. A horseman armoured head to hoof, who rides straight over infantry: huge bonus damage against foot soldiers and little to fear from arrows. The heavy fist of the Eastern Roman army.' }
  },
  chinese: {
    role: "Economy",
    history: "Under the Tang and Song dynasties, China was the largest and richest state on earth, with vast cities, paper money, printing and gunpowder. Huge populations and a well-run state let its armies field crossbowmen and cavalry in enormous numbers.",
    bonuses: ["Start with +3 villagers (but −150 food, −50 wood)", "Houses support 10 population", "Villagers 10% cheaper"],
    name: 'Chinese', color: '#d4a017',
    desc: 'Economy civ. Start with +3 villagers but -150 food, -50 wood. Houses support 10 pop. Villagers 10% cheaper.',
    mods: { extraVils: 3, startFoodDelta: -150, startWoodDelta: -50, housePop: 10, vilCost: 0.9 },
    unique: { type: 'repeater', at: 'castle', text: 'Repeater Crossbowman — trained at the Castle. The chu-ko-nu: a magazine crossbow that looses bolt after bolt, each one light but twice as fast as any other bow. Deadly in numbers, which the Chinese always had.' }
  },
  persians: {
    role: "Elephants & Economy",
    history: "Heirs of the great Persian empires, from the Sasanian Shahs who rivalled Rome to the Persian kingdoms of the Islamic age. Their cities were famed for turquoise domes, gardens and scholars, and their armies for armoured horsemen and towering war elephants.",
    bonuses: ["Start with +50 food and +50 wood", "Town Center +50% HP", "Knights +15% HP", "War Elephant: slow, huge and devastating"],
    name: 'Persians', color: '#1f8a8a',
    desc: 'Elephant and economy civ. Start with +50 food and wood. Town Center +50% HP. Knights +15% HP.',
    mods: { startFoodDelta: 50, startWoodDelta: 50, tcHp: 1.5, knightHp: 1.15 },
    unique: { type: 'elephant', at: 'castle', text: 'War Elephant — trained at the Castle. A towering armoured elephant that tramples everything in its path: enormous health and attack, and every blow also hurts enemies standing beside its target. Slow, costly, and weak against Monks and Spearmen.' }
  },
  incas: {
    role: "Infantry",
    history: "The Inca Empire, Tawantinsuyu, stretched four thousand kilometres along the Andes in the 1400s. Its rulers built roads, terraced mountains into farms and raised cities of stone so finely fitted that no blade fits between the blocks. With no horses in the Americas, its armies marched on foot.",
    bonuses: ["Buildings +15% HP (fitted stonework)", "Spearmen 20% cheaper", "Farms give +20% food (terraces)", "No Stable: no horses in the Americas"],
    name: 'Incas', color: '#c9a227',
    desc: 'Infantry civ with no cavalry. Buildings +15% HP. Spearmen 20% cheaper. Farms +20% food.',
    mods: { buildingHp: 1.15, spearCost: 0.8, farmFood: 1.2, noStable: true },
    unique: { type: 'kamayuk', at: 'castle', text: 'Kamayuk — trained at the Castle. Elite Inca warriors with very long spears that strike from a step further away than any other foot soldier, and hit horsemen and elephants very hard.' }
  },
  cholas: {
    role: "Economy & Infantry",
    history: "The Chola dynasty of South India, at its height around 1000 to 1200, sent fleets across the Bay of Bengal and raised the great temples of Thanjavur. Rich from rice paddies, trade and temple towns, they fielded large disciplined armies of foot soldiers and archers.",
    bonuses: ["Farms 20% cheaper", "Archers 15% cheaper", "Feudal Age 15% cheaper", "Temple Guard: tough elite infantry"],
    name: 'Cholas', color: '#c0392b',
    desc: 'Economy and infantry civ. Farms 20% cheaper. Archers 15% cheaper. Feudal Age 15% cheaper.',
    mods: { farmCost: 0.8, archerCost: 0.85, ageDisc: { 2: 0.85 } },
    unique: { type: 'templeguard', at: 'castle', text: 'Temple Guard — trained at the Castle. The Velaikkarar, sworn bodyguards of the Chola kings: heavily armoured foot soldiers with great health and armour against arrows, strong against other infantry.' }
  }
};

// Unit definitions. speed in tiles/sec, range in tiles, rate = seconds between attacks.
G.UNITS = {
  villager: { name: 'Villager', cost: { food: 50 }, time: 10, hp: 25, atk: 3, range: 0.6, rate: 2, armor: 0, pierce: 1, speed: 1.6, los: 4, icon: '👷', cls: 'vil' },
  militia:  { name: 'Swordsman', cost: { food: 60, gold: 20 }, time: 12, hp: 50, atk: 7, range: 0.6, rate: 2, armor: 1, pierce: 1, speed: 1.5, los: 4, icon: '⚔️', cls: 'inf', bonus: { bld: 3 } },
  spearman: { name: 'Spearman', cost: { food: 35, wood: 25 }, time: 11, hp: 45, atk: 4, range: 0.7, rate: 2, armor: 0, pierce: 0, speed: 1.5, los: 4, icon: '🔱', cls: 'inf', bonus: { cav: 15 } },
  archer:   { name: 'Archer', cost: { wood: 25, gold: 45 }, time: 14, hp: 30, atk: 4, range: 4, rate: 2, armor: 0, pierce: 0, speed: 1.4, los: 6, icon: '🏹', cls: 'arc', ranged: true, bonus: { inf: 2 } },
  longbowman: { name: 'Longbowman', cost: { wood: 35, gold: 40 }, time: 15, hp: 35, atk: 6, range: 5, rate: 2, armor: 0, pierce: 1, speed: 1.4, los: 7, icon: '🎯', cls: 'arc', ranged: true, bonus: { inf: 2 } },
  scout:    { name: 'Scout Rider', cost: { food: 80 }, time: 30, hp: 45, atk: 3, range: 0.7, rate: 2, armor: 0, pierce: 2, speed: 3.2, los: 11, icon: '🏇', cls: 'cav', bonus: { mon: 6 } },
  knight:   { name: 'Knight', cost: { food: 60, gold: 75 }, time: 18, hp: 100, atk: 10, range: 0.7, rate: 1.8, armor: 2, pierce: 2, speed: 2.4, los: 5, icon: '🐎', cls: 'cav' },
  // ---- unique units (one per dynasty, trained at the Castle) ----
  axethrower: { name: 'Axe Thrower', cost: { food: 55, gold: 25 }, time: 15, hp: 50, atk: 7, range: 3, rate: 2, armor: 1, pierce: 1, speed: 1.5, los: 6, icon: '🪓', cls: 'inf', ranged: true, bonus: { bld: 4 } },
  elephant:   { name: 'War Elephant', cost: { food: 140, gold: 80 }, time: 28, hp: 320, atk: 14, range: 0.9, rate: 2.2, armor: 1, pierce: 2, speed: 1.0, los: 5, icon: '🐘', cls: 'cav', splash: 0.5, bonus: { bld: 6 } },
  kamayuk:    { name: 'Kamayuk', cost: { food: 60, gold: 30 }, time: 10, hp: 60, atk: 7, range: 1.3, rate: 2, armor: 0, pierce: 0, speed: 1.6, los: 5, icon: '🔱', cls: 'inf', bonus: { cav: 12 } },
  templeguard:{ name: 'Temple Guard', cost: { food: 65, gold: 45 }, time: 14, hp: 90, atk: 8, range: 0.6, rate: 2, armor: 2, pierce: 4, speed: 1.4, los: 4, icon: '🛡️', cls: 'inf', bonus: { inf: 3 } },
  cataphract: { name: 'Cataphract', cost: { food: 70, gold: 75 }, time: 20, hp: 110, atk: 9, range: 0.7, rate: 1.8, armor: 2, pierce: 3, speed: 2.2, los: 5, icon: '🛡️', cls: 'cav', bonus: { inf: 9 } },
  repeater:   { name: 'Repeater Crossbowman', cost: { wood: 40, gold: 35 }, time: 16, hp: 35, atk: 3, range: 4, rate: 1, armor: 0, pierce: 0, speed: 1.4, los: 6, icon: '🎯', cls: 'arc', ranged: true, bonus: { inf: 1 } },
  // ---- siege: shared by every dynasty. siege:true means the full attack lands on
  // buildings instead of the single point a bow would do, so walls actually come down.
  ram:        { name: 'Battering Ram', cost: { wood: 160 }, time: 36, hp: 175, atk: 2, range: 0.6, rate: 5, armor: 0, pierce: 10, speed: 0.55, los: 3, icon: '🐏', cls: 'sie', siege: true, bonus: { bld: 48 } },
  // ---- heroes: one each per player in Regicide, never trained ----
  king:       { name: 'King', cost: {}, time: 0, hp: 150, atk: 6, range: 0.7, rate: 2, armor: 3, pierce: 3, speed: 0.95, los: 7, icon: '👑', cls: 'hero' },
  queen:      { name: 'Queen', cost: {}, time: 0, hp: 110, atk: 0, range: 0, rate: 2, armor: 2, pierce: 2, speed: 1.05, los: 8, icon: '👸', cls: 'hero', heal: 1.4, healRange: 3 },
  monk:       { name: 'Monk', cost: { gold: 100 }, time: 25, hp: 30, atk: 0, range: 0, rate: 2, armor: 0, pierce: 0, speed: 1.0, los: 9, icon: '✝️', cls: 'mon', heal: 2.0, healRange: 4 },
  trebuchet:  { name: 'Trebuchet', cost: { wood: 200, gold: 160 }, time: 50, hp: 150, atk: 10, range: 12, rate: 10, armor: 1, pierce: 2, speed: 0.5, los: 14, icon: '🪨', cls: 'sie', ranged: true, siege: true, bonus: { bld: 190 } }
};

// Buildings. size in tiles (square footprint).
G.BUILDINGS = {
  towncenter: { name: 'Town Center', cost: { wood: 275, stone: 100 }, time: 60, hp: 2400, size: 4, los: 8, pop: 5, drop: ['food','wood','gold','stone'], trains: ['villager'], garrison: 15, atk: 5, range: 6, rate: 2, icon: '🏰' },
  house:      { name: 'House', cost: { wood: 25 }, time: 15, hp: 550, size: 2, los: 2, pop: 5, icon: '🏠' },
  mill:       { name: 'Mill', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['food'], icon: '🌾' },
  lumbercamp: { name: 'Lumber Camp', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['wood'], icon: '🪵' },
  miningcamp: { name: 'Mining Camp', cost: { wood: 100 }, time: 20, hp: 600, size: 2, los: 4, drop: ['gold','stone'], icon: '⛏️' },
  farm:       { name: 'Farm', cost: { wood: 60 }, time: 10, hp: 480, size: 3, los: 1, farm: 175, reseed: 25, icon: '🟫' },
  barracks:   { name: 'Barracks', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['militia','spearman'], icon: '⚔️' },
  range:      { name: 'Archery Range', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['archer'], icon: '🏹' },
  stable:     { name: 'Stable', cost: { wood: 175 }, time: 30, hp: 1200, size: 3, los: 5, trains: ['scout','knight'], icon: '🐎' },
  blacksmith: { name: 'Blacksmith', cost: { wood: 150 }, time: 35, hp: 1500, size: 3, los: 5, icon: '⚒️' },
  monastery:  { name: 'Monastery', cost: { wood: 175 }, time: 40, hp: 1050, size: 3, los: 6, trains: ['monk'], icon: '✝️' },
  siegeworkshop: { name: 'Siege Workshop', cost: { wood: 200 }, time: 40, hp: 1050, size: 4, los: 5, trains: ['ram','trebuchet'], icon: '⚙️' },
  university: { name: 'University', cost: { wood: 200 }, time: 50, hp: 1500, size: 3, los: 5, icon: '🎓' },
  infirmary:  { name: 'Infirmary', cost: { wood: 150, gold: 50 }, time: 60, hp: 1200, size: 3, los: 5, garrison: 10, heal: 4, icon: '✚' },
  castle:     { name: 'Castle', cost: { stone: 350 }, time: 80, hp: 3000, size: 4, los: 9, garrison: 20, atk: 11, range: 8, rate: 2, icon: '🏯' },
  // ---- walls: cheap, quick, and built in runs. size 1 so they follow a line. ----
  palisade:   { name: 'Palisade Wall', cost: { wood: 5 }, time: 3, hp: 250, size: 1, los: 2, wall: 'wood', icon: '🪵' },
  stonewall:  { name: 'Stone Wall', cost: { stone: 6 }, time: 6, hp: 700, size: 1, los: 2, wall: 'stone', icon: '🧱' },
  gate:       { name: 'Gate', cost: { stone: 30 }, time: 20, hp: 1400, size: 1, los: 4, wall: 'gate', gate: true, icon: '🚪' },
  tower:      { name: 'Watch Tower', cost: { wood: 25, stone: 125 }, time: 40, hp: 1020, size: 1, los: 8, atk: 5, range: 7, rate: 2, icon: '🗼' }
};
// ---- Ages (AoE2): advance at the Town Center. Each Age needs 2 buildings from the previous one. ----
G.AGES = [
  null,
  { name: 'Dark Age', short: 'Dark' },
  { name: 'Feudal Age', short: 'Feudal', cost: { food: 500 }, time: 45, needs: ['mill', 'lumbercamp', 'miningcamp', 'barracks'], bonus: 'Unlocks Archery Range, Stable, Watch Tower, Palisade Wall, Spearman, Archer, Scout Rider' },
  { name: 'Castle Age', short: 'Castle', cost: { food: 800, gold: 200 }, time: 60, needs: ['range', 'stable', 'tower', 'blacksmith'], bonus: 'Unlocks Castle, Siege Workshop, Monastery, Stone Wall, Gate, Knight, Battering Ram, Monk and unique units. All soldiers +1 attack' },
  { name: 'Imperial Age', short: 'Imperial', cost: { food: 1000, gold: 800 }, time: 75, needs: ['castle'], bonus: 'Unlocks the Trebuchet. All soldiers +1 attack, +1 armor. Buildings +20% HP' }
];
G.BUILD_AGE = { university: 3, tower: 2, range: 2, stable: 2, blacksmith: 2, castle: 3, siegeworkshop: 3, monastery: 3, infirmary: 2, palisade: 2, stonewall: 3, gate: 3 };
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
  eliteeleph:   { name: 'Elite War Elephant', line: 'elephant', tier: 1, at: 'castle', age: 4, cost: { food: 1600, gold: 1000 }, time: 60, stats: { hp: 450, atk: 18 } },
  elitekama:    { name: 'Elite Kamayuk', line: 'kamayuk', tier: 1, at: 'castle', age: 4, cost: { food: 900, gold: 500 }, time: 45, stats: { hp: 80, atk: 8, armor: 1, bonus: { cav: 16 } } },
  eliteguard:   { name: 'Elite Temple Guard', line: 'templeguard', tier: 1, at: 'castle', age: 4, cost: { food: 1000, gold: 600 }, time: 45, stats: { hp: 120, atk: 10, armor: 3, pierce: 6 } },
  elitecata:    { name: 'Elite Cataphract', line: 'cataphract',tier: 1, at: 'castle',   age: 4, cost: { food: 1200, gold: 600 }, time: 50, stats: { hp: 150, atk: 11, armor: 3, bonus: { inf: 13 } } },
  eliterepeater:{ name: 'Elite Repeater',   line: 'repeater',  tier: 1, at: 'castle',   age: 4, cost: { food: 760, gold: 760 },  time: 50, stats: { hp: 40, atk: 4, rate: 0.9 } },
  cavalier:     { name: 'Cavalier',        line: 'knight',     tier: 1, at: 'stable',   age: 4, cost: { food: 300, gold: 300 },  time: 50, stats: { hp: 120, atk: 12 } },
  paladin:      { name: 'Paladin',         line: 'knight',     tier: 2, at: 'stable',   age: 4, cost: { food: 1300, gold: 750 }, time: 60, stats: { hp: 160, atk: 14, armor: 3, pierce: 3 } }
};
// ---- Blacksmith techs: bonuses for all soldiers ----
// Technologies. `at` is the building that researches it (default the Blacksmith); `civ` limits
// it to one dynasty (researched at its Castle). eff keys are summed per player by G.techEff:
//   melee ranged range armor pierce   soldiers' attack, range and armour
//   gather_<res>  +fraction gather rate      farm  extra food per field
//   vilHp vilSpeed carry                       villagers
//   build  +fraction build speed     bldHp / wallHp  +fraction building / wall-and-tower HP
//   towerAtk towerRange                        towers, Town Centers and Castles
//   trainSpeed_<building>  unitAtk_<type>  unitRange_<type>
// Dynasty techs are worth about the same as each other and each sharpens one thing the
// dynasty is already good at, rather than making it stronger at everything.
G.TECHS = {
  // Blacksmith
  forging:     { name: 'Forging',       icon: 'attack',   age: 2, cost: { food: 150 },             time: 30, eff: { melee: 1 }, desc: 'Soldiers +1 melee attack' },
  ironcasting: { name: 'Iron Casting',  icon: 'attack',   age: 3, cost: { food: 220, gold: 120 },  time: 40, eff: { melee: 1 }, req: 'forging', desc: '+1 melee attack' },
  blastfurnace:{ name: 'Blast Furnace', icon: 'attack',   age: 4, cost: { food: 275, gold: 225 },  time: 50, eff: { melee: 2 }, req: 'ironcasting', desc: '+2 melee attack' },
  fletching:   { name: 'Fletching',     icon: 'archer',   age: 2, cost: { food: 100, wood: 50 },   time: 30, eff: { ranged: 1, range: 1 }, desc: 'Archers +1 attack, +1 range' },
  bodkin:      { name: 'Bodkin Arrow',  icon: 'archer',   age: 3, cost: { food: 200, wood: 100 },  time: 40, eff: { ranged: 1, range: 1 }, req: 'fletching', desc: '+1 attack, +1 range' },
  bracer:      { name: 'Bracer',        icon: 'archer',   age: 4, cost: { food: 300, wood: 200 },  time: 50, eff: { ranged: 1, range: 1 }, req: 'bodkin', desc: '+1 attack, +1 range' },
  scalemail:   { name: 'Scale Mail',    icon: 'garrison', age: 2, cost: { food: 100 },             time: 30, eff: { armor: 1 }, desc: 'Soldiers +1 armour' },
  chainmail:   { name: 'Chain Mail',    icon: 'garrison', age: 3, cost: { food: 200, gold: 100 },  time: 40, eff: { armor: 1, pierce: 1 }, req: 'scalemail', desc: '+1 armour, +1 arrow armour' },
  platemail:   { name: 'Plate Mail',    icon: 'garrison', age: 4, cost: { food: 300, gold: 150 },  time: 50, eff: { armor: 1, pierce: 2 }, req: 'chainmail', desc: '+1 armour, +2 arrow armour' },
  // Town Center
  loom:        { name: 'Loom',          icon: 'villager', at: 'towncenter', age: 1, cost: { gold: 50 },  time: 20, eff: { vilHp: 15 }, desc: 'Villagers +15 HP' },
  wheelbarrow: { name: 'Wheelbarrow',   icon: 'villager', at: 'towncenter', age: 2, cost: { food: 175, wood: 50 }, time: 35, eff: { vilSpeed: 0.1, carry: 3 }, desc: 'Villagers 10% faster, carry +3' },
  handcart:    { name: 'Hand Cart',     icon: 'villager', at: 'towncenter', age: 3, cost: { food: 300, wood: 200 }, time: 45, eff: { vilSpeed: 0.1, carry: 4 }, req: 'wheelbarrow', desc: 'Villagers 10% faster, carry +4' },
  // Mill, Lumber Camp, Mining Camp
  horsecollar: { name: 'Horse Collar',  icon: 'farm',     at: 'mill', age: 2, cost: { food: 75, wood: 75 },   time: 25, eff: { farm: 75 }, desc: 'Farms hold +75 food' },
  heavyplow:   { name: 'Heavy Plow',    icon: 'farm',     at: 'mill', age: 3, cost: { food: 125, wood: 125 }, time: 35, eff: { farm: 125, gather_food: 0.1 }, req: 'horsecollar', desc: 'Farms +125 food, farming 10% faster' },
  doublebit:   { name: 'Double-Bit Axe',icon: 'wood',     at: 'lumbercamp', age: 2, cost: { food: 100, wood: 50 },  time: 25, eff: { gather_wood: 0.2 }, desc: 'Woodcutting 20% faster' },
  bowsaw:      { name: 'Bow Saw',       icon: 'wood',     at: 'lumbercamp', age: 3, cost: { food: 150, wood: 100 }, time: 35, eff: { gather_wood: 0.2 }, req: 'doublebit', desc: 'Woodcutting 20% faster' },
  goldmining:  { name: 'Gold Mining',   icon: 'gold',     at: 'miningcamp', age: 2, cost: { food: 100, wood: 75 },  time: 25, eff: { gather_gold: 0.15 }, desc: 'Gold mining 15% faster' },
  goldshaft:   { name: 'Gold Shaft',    icon: 'gold',     at: 'miningcamp', age: 3, cost: { food: 200, wood: 100 }, time: 35, eff: { gather_gold: 0.15 }, req: 'goldmining', desc: 'Gold mining 15% faster' },
  stonemining: { name: 'Stone Mining',  icon: 'stone',    at: 'miningcamp', age: 2, cost: { food: 100, wood: 75 },  time: 25, eff: { gather_stone: 0.15 }, desc: 'Stone mining 15% faster' },
  // University (Castle Age)
  masonry:     { name: 'Masonry',       icon: 'castle',   at: 'university', age: 3, cost: { wood: 175, stone: 150 }, time: 40, eff: { bldHp: 0.1 }, desc: 'Buildings +10% HP' },
  architecture:{ name: 'Architecture',  icon: 'castle',   at: 'university', age: 4, cost: { wood: 200, stone: 300 }, time: 50, eff: { bldHp: 0.1 }, req: 'masonry', desc: 'Buildings +10% HP' },
  arrowslits:  { name: 'Arrowslits',    icon: 'tower',    at: 'university', age: 3, cost: { food: 250, wood: 250 },  time: 40, eff: { towerAtk: 2 }, desc: 'Towers, Town Centers, Castles +2 attack' },
  treadmill:   { name: 'Treadmill Crane', icon: 'build',  at: 'university', age: 3, cost: { food: 300, wood: 200 },  time: 40, eff: { build: 0.2 }, desc: 'Villagers build 20% faster' },
  fortwalls:   { name: 'Fortified Walls', icon: 'stone',  at: 'university', age: 4, cost: { food: 200, stone: 100 }, time: 45, eff: { wallHp: 0.25 }, desc: 'Walls and towers +25% HP' },
  // Dynasty techs, at the Castle
  yeomen:      { name: 'Yeomen',        icon: 'longbowman', at: 'castle', civ: 'britons', age: 3, cost: { wood: 300, gold: 200 }, time: 45, eff: { unitRange_archer: 1, unitRange_longbowman: 1 }, desc: 'Archers and Longbowmen +1 range' },
  warwolf:     { name: 'Warwolf',       icon: 'trebuchet',  at: 'castle', civ: 'britons', age: 4, cost: { food: 800, gold: 400 }, time: 60, eff: { unitAtk_trebuchet: 12 }, desc: 'Trebuchets hit much harder' },
  chivalry:    { name: 'Chivalry',      icon: 'knight',     at: 'castle', civ: 'franks', age: 3, cost: { food: 400, wood: 400 }, time: 45, eff: { trainSpeed_stable: 0.4 }, desc: 'Stables train 40% faster' },
  beardedaxe:  { name: 'Bearded Axe',   icon: 'axethrower', at: 'castle', civ: 'franks', age: 4, cost: { food: 400, gold: 400 }, time: 60, eff: { unitRange_axethrower: 1 }, desc: 'Axe Throwers +1 range' },
  logistica:   { name: 'Logistica',     icon: 'cataphract', at: 'castle', civ: 'byzantines', age: 3, cost: { food: 600, gold: 300 }, time: 45, eff: { unitAtk_cataphract: 3 }, desc: 'Cataphracts +3 attack' },
  zoroastrian: { name: 'Mahouts',       icon: 'elephant',   at: 'castle', civ: 'persians', age: 3, cost: { food: 300, gold: 200 }, time: 40, eff: { unitSpd_elephant: 0.3 }, desc: 'War Elephants move 30% faster' },
  andeanSling: { name: 'Andean Sling',  icon: 'kamayuk',    at: 'castle', civ: 'incas',    age: 3, cost: { food: 200, gold: 300 }, time: 40, eff: { unitAtk_kamayuk: 2 }, desc: 'Kamayuks +2 attack' },
  rajaraja:    { name: 'Temple Endowment', icon: 'templeguard', at: 'castle', civ: 'cholas', age: 3, cost: { food: 400, gold: 200 }, time: 40, eff: { unitHp_templeguard: 20 }, desc: 'Temple Guards +20 HP' },
  greekfire:   { name: 'Greek Fire',    icon: 'tower',      at: 'castle', civ: 'byzantines', age: 4, cost: { food: 250, gold: 300 }, time: 60, eff: { towerAtk: 1, towerRange: 1 }, desc: 'Towers and Castles +1 attack, +1 range' },
  rocketry:    { name: 'Rocketry',      icon: 'repeater',   at: 'castle', civ: 'chinese', age: 3, cost: { wood: 750, gold: 450 }, time: 45, eff: { unitAtk_repeater: 2 }, desc: 'Repeater Crossbows +2 attack' },
  greatwall:   { name: 'Great Wall',    icon: 'stone',      at: 'castle', civ: 'chinese', age: 4, cost: { wood: 400, stone: 400 }, time: 60, eff: { wallHp: 0.3 }, desc: 'Walls and towers +30% HP' }
};
G.UNIT_AGE = { spearman: 2, archer: 2, scout: 2, knight: 3, longbowman: 3, axethrower: 3, cataphract: 3, repeater: 3, elephant: 3, kamayuk: 3, templeguard: 3, ram: 3, trebuchet: 4, monk: 3 };
G.VIL_BUILDS = ['house','mill','lumbercamp','miningcamp','farm','barracks','range','stable','blacksmith','infirmary','siegeworkshop','monastery','university','castle','tower','palisade','stonewall','gate','towncenter'];

G.RES = {
  tree:   { name: 'Tree',  res: 'wood',  amount: 100, rate: 0.45 },
  berry:  { name: 'Berry Bush', res: 'food', amount: 125, rate: 0.35 },
  gold:   { name: 'Gold Mine', res: 'gold', amount: 800, rate: 0.38 },
  stone:  { name: 'Stone Mine', res: 'stone', amount: 350, rate: 0.36 }
};
G.REGION = { britons: 'western', franks: 'western', byzantines: 'mediterranean', chinese: 'eastasian', persians: 'middleeast', incas: 'americas', cholas: 'indian' };
// How each dynasty's villagers are dyed from the shared (Britons) sprites. Britons are the
// painted original, so they have no entry; a dynasty with villager art of its own stops being
// dyed automatically (see art.js). Each dynasty dresses in two colours — hue for the tunic or
// dress, hue2 for what is worn below the waist — and has its own hair and skin.
// hue/hue2 are 0-360; everything else is a multiplier, except the *H hue nudges in degrees.
G.CIV_LOOK = {
  // apron: [hue, saturation, brightness] for pale cloth such as the women's long apron.
  // Kept clear of purple: that range is reserved for the team colour.
  franks: {    // green wool over russet, fair hair, pale green apron
    hue: 100, sat: 1.05, val: 1.25,  hue2: 18,  sat2: 1.05, val2: 1.05, apron: [95, 0.38, 0.92],
    hairH: 10, hairS: 1.10, hairV: 1.55, skinH: -3, skinS: 0.92, skinV: 1.08
  },
  byzantines: {  // deep crimson over gold, dark hair, cream-gold apron
    hue: 356, sat: 1.25, val: 1.05,  hue2: 42,  sat2: 1.10, val2: 1.25, apron: [44, 0.45, 0.95],
    hairH: -4, hairS: 0.95, hairV: 0.80, skinH: 5, skinS: 1.12, skinV: 0.85
  },
  persians: {  // turquoise over gold, black hair
    hue: 180, sat: 1.05, val: 1.05,  hue2: 42,  sat2: 1.0, val2: 1.15, apron: [175, 0.35, 0.95],
    hairH: 0, hairS: 0.6, hairV: 0.55, skinH: 2, skinS: 1.02, skinV: 0.95
  },
  incas: {     // saffron over red, black hair
    hue: 40, sat: 1.15, val: 1.15,  hue2: 8,  sat2: 1.10, val2: 1.0, apron: [38, 0.45, 0.95],
    hairH: 0, hairS: 0.5, hairV: 0.5, skinH: 4, skinS: 1.08, skinV: 0.9
  },
  cholas: {    // vermilion over gold, black hair
    hue: 8, sat: 1.15, val: 1.05,  hue2: 45,  sat2: 1.1, val2: 1.2, apron: [10, 0.4, 0.95],
    hairH: 0, hairS: 0.5, hairV: 0.5, skinH: 4, skinS: 1.1, skinV: 0.82
  },
  chinese: {   // indigo over slate, black hair, sky-blue apron
    hue: 215, sat: 1.05, val: 1.20,  hue2: 205, sat2: 0.55, val2: 0.80, apron: [205, 0.40, 0.92],
    hairH: 0,  hairS: 0.45, hairV: 0.60, skinH: 3, skinS: 0.88, skinV: 1.02
  }
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
