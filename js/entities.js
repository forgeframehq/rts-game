// Entities, economy, unit behaviour and combat.
(function () {
  let nextId = 1;
  const snd = (k, x, y) => G.sound && G.sound.play(k, x, y);
  // work sounds follow the player's attention: only villagers they have selected chop, mine and hammer audibly
  const workSnd = (u, k) => { if (u.owner === 1 && G.selection && G.selection.includes(u)) snd(k, u.x, u.y); };
  G.setNextId = n => { nextId = n; };
  G.ents = [];
  G.byId = new Map();
  G.projs = [];
  G.effects = [];

  const mods = p => G.CIVS[G.players[p].civ].mods;

  // ---------- Players & costs ----------
  G.makePlayer = function (id, civ, opts) {
    opts = opts || {};
    const m = G.CIVS[civ].mods;
    const res = { ...(G.RES_PRESETS[G.rules.res] || G.START_RES) };
    if (m.startFoodDelta) res.food = Math.max(0, res.food + m.startFoodDelta);
    if (m.startWoodDelta) res.wood = Math.max(0, res.wood + m.startWoodDelta);
    return { id, civ, age: 1, up: {}, techs: {}, team: opts.team || 0, ai: opts.ai || null, res, gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, killed: 0, lost: 0, alive: true };
  };

  // ---------- Ages ----------
  G.ageOf = p => (G.players[p] && G.players[p].age) || 1;
  // Stances, as in AoE2. Defensive is the default: fight what comes near, chase a little, go back.
  G.STANCES = ['aggressive', 'defensive', 'stand', 'passive'];
  G.stanceOf = u => u.stance || 'defensive';
  const LEASH = { aggressive: Infinity, defensive: 8, stand: 0, passive: 0 };
  G.canBuildType = (p, type) => G.ageOf(p) >= (G.BUILD_AGE[type] || 1) && !G.atBuildLimit(p, type) && !G.civBlocks(p, type);
  // a dynasty that never had this building (the Incas had no horses, so no Stable)
  G.civBlocks = (p, type) => type === 'stable' && !!(G.players[p] && mods(p).noStable);
  // some buildings are limited per player: one Infirmary (two in the Imperial Age)
  G.buildLimit = (p, type) => type === 'infirmary' ? (G.ageOf(p) >= 4 ? 2 : 1) : 0;
  G.atBuildLimit = (p, type) => { const n = G.buildLimit(p, type); return n > 0 && G.ents.filter(e => !e.dead && e.owner === p && e.type === type).length >= n; };
  G.enemySoldierNear = (p, x, y, r) => G.ents.some(e => !e.dead && e.kind === 'unit' && e.type !== 'villager' && !e.inside && G.enemies(e.owner, p) && Math.hypot(e.x - x, e.y - y) < r);
  G.canTrainType = (p, type) => G.ageOf(p) >= (G.UNIT_AGE[type] || 1);
  // the buildings the next Age asks for, and which of them stand: { want, got, list: [{ type, have }] }
  G.ageNeeds = function (p) {
    const next = G.AGES[G.ageOf(p) + 1];
    if (!next || !next.needs) return null;
    const have = new Set(G.ents.filter(e => !e.dead && e.owner === p && e.kind === 'building' && e.built).map(e => e.type));
    const list = next.needs.filter(t => !(G.civBlocks && G.civBlocks(p, t))).map(t => ({ type: t, have: have.has(t) }));
    return { want: Math.min(2, next.needs.length), got: list.filter(x => x.have).length, list };
  };
  // what still blocks advancing: returns null if ready, else a short reason
  G.ageBlock = function (p, tc) {
    const a = G.ageOf(p), next = G.AGES[a + 1];
    if (!next) return 'Max Age';
    if (G.ents.some(e => e.owner === p && e.aging && !e.dead)) return 'Advancing…';
    const have = new Set(G.ents.filter(e => !e.dead && e.owner === p && e.kind === 'building' && e.built).map(e => e.type));
    // most Ages ask for any 2 of a list; an Age may also name a single building (Imperial wants a Castle)
    const want = Math.min(2, next.needs.length);
    const got = next.needs.filter(t => have.has(t)).length;
    if (got < want) return next.needs.length === 1
      ? `Needs a ${G.BUILDINGS[next.needs[0]].name}`
      : `Build any ${want} of: ${next.needs.map(t => G.BUILDINGS[t].name).join(', ')}`;
    if (tc && tc.queue.length) return 'Town Center busy';
    return null;
  };
  // a dynasty can make an Age cheaper (Byzantines: Castle and Imperial Ages)
  G.ageCost = function (p, n) {
    const a = G.AGES[n]; if (!a) return null;
    const f = (G.CIVS[G.players[p].civ].mods.ageDisc || {})[n] || 1;
    const c = {}; for (const k in a.cost) c[k] = Math.round(a.cost[k] * f); return c;
  };
  G.advanceAge = function (tc) {
    const p = tc.owner, next = G.AGES[G.ageOf(p) + 1];
    if (!next || G.ageBlock(p, tc)) return false;
    const cost = G.ageCost(p, G.ageOf(p) + 1);
    if (!G.pay(p, cost)) return 'res';
    tc.aging = { t: 0, to: G.ageOf(p) + 1, cost };
    return true;
  };
  G.cancelAge = function (tc) { if (tc.aging) { G.refund(tc.owner, tc.aging.cost); tc.aging = null; } };
  function finishAge(tc) {
    const p = G.players[tc.owner], to = tc.aging.to; tc.aging = null; p.age = to;
    p.stats = p.stats || {}; (p.stats.ageT = p.stats.ageT || {})[to] = Math.round(G.time);
    if (to === 4) for (const e of G.ents) if (e.owner === tc.owner && e.kind === 'building' && !e.dead) { e.maxHp = Math.round(e.maxHp * 1.2); e.hp = Math.round(e.hp * 1.2); }
    if (tc.owner === 1) snd('ageup');
    if (G.onAgeUp) G.onAgeUp(tc.owner, to);
  }

  // ---------- Upgrades & techs ----------
  G.tierOf = (p, line) => (G.players[p] && G.players[p].up && G.players[p].up[line]) || 0;
  const defCache = new Map();
  // the unit definition for this player's current upgrade (cached; units point at it)
  G.unitDef = function (p, type) {
    const tier = G.tierOf(p, type), k = p + '|' + type + '|' + tier;
    let d = defCache.get(k);
    if (!d) {
      d = { ...G.UNITS[type] };
      for (const id in G.UPGRADES) { const u = G.UPGRADES[id]; if (u.line === type && u.tier <= tier) { Object.assign(d, u.stats); d.name = u.name; } }
      d.tier = tier; defCache.set(k, d);
    }
    return d;
  };
  G.techBonus = function (p) {
    const b = { melee: 0, ranged: 0, range: 0, armor: 0, pierce: 0 }, t = (G.players[p] && G.players[p].techs) || {};
    for (const id in t) if (t[id] && G.TECHS[id]) for (const k in G.TECHS[id].eff) if (k in b) b[k] += G.TECHS[id].eff[k];
    return b;
  };
  // the summed effect of one key across a player's researched techs (see G.TECHS in data.js)
  G.techEff = function (p, key) {
    const t = (G.players[p] && G.players[p].techs) || {}; let v = 0;
    for (const id in t) if (t[id] && G.TECHS[id] && G.TECHS[id].eff[key]) v += G.TECHS[id].eff[key];
    return v;
  };
  // a unit's attack range: its type, the Blacksmith's range techs, its dynasty, and its own techs
  G.rangeOf = function (owner, type, def) {
    return def.range + (def.ranged ? G.techBonus(owner).range : 0)
      + ((type === 'archer' || type === 'longbowman') && mods(owner).archerRange ? mods(owner).archerRange : 0)
      + G.techEff(owner, 'unitRange_' + type);
  };
  G.carryCap = u => G.CARRY + G.techEff(u.owner, 'carry');
  // building HP after Masonry, Architecture and the wall techs
  G.bldHpMult = (owner, def) => 1 + G.techEff(owner, 'bldHp') + ((def.wall || def.atk && !def.trains) ? G.techEff(owner, 'wallHp') : 0);
  // techs done at this building, for the Research page
  G.researchedAt = function (b) {
    const pl = G.players[b.owner]; if (!pl || !pl.techs) return [];
    return Object.keys(pl.techs).filter(id => pl.techs[id] && G.TECHS[id] && (G.TECHS[id].at || 'blacksmith') === b.type);
  };
  // what a building can research right now: [{ id, kind: 'up'|'tech', def, why }]
  G.researchesFor = function (b) {
    const p = b.owner, pl = G.players[p], out = [];
    if (!pl) return out;
    pl.up = pl.up || {}; pl.techs = pl.techs || {};   // games saved before upgrades existed
    for (const id in G.UPGRADES) {
      const u = G.UPGRADES[id];
      if (u.at !== b.type || G.tierOf(p, u.line) !== u.tier - 1) continue;
      if (!G.trainsFor(b).includes(u.line)) continue;
      out.push({ id, kind: 'up', def: u, why: G.ageOf(p) < u.age ? G.AGES[u.age].short + ' Age' : null });
    }
    for (const id in G.TECHS) {
      const t = G.TECHS[id];
      if ((t.at || 'blacksmith') !== b.type || (t.civ && t.civ !== pl.civ)) continue;
      if (pl.techs[id] || (t.req && !pl.techs[t.req])) continue;
      out.push({ id, kind: 'tech', def: t, why: G.ageOf(p) < t.age ? G.AGES[t.age].short + ' Age' : null });
    }
    return out;
  };
  G.startResearch = function (b, id) {
    if (!b.built || b.dead || b.research || b.aging) return false;
    const r = G.researchesFor(b).find(x => x.id === id); if (!r || r.why) return false;
    if (G.ents.some(e => !e.dead && e.owner === b.owner && e.research && e.research.id === id)) return false;
    if (!G.pay(b.owner, r.def.cost)) return 'res';
    b.research = { id, kind: r.kind, t: 0, cost: r.def.cost };
    return true;
  };
  G.cancelResearch = function (b) { if (b.research) { G.refund(b.owner, b.research.cost); b.research = null; } };
  function finishResearch(b) {
    const r = b.research, pl = G.players[b.owner]; b.research = null;
    if (r.kind === 'up') {
      const u = G.UPGRADES[r.id]; pl.up[u.line] = u.tier;
      for (const e of G.ents) if (!e.dead && e.owner === b.owner && e.type === u.line) {   // upgrade units already in the field
        const nd = G.unitDef(b.owner, u.line), f = e.hp / e.maxHp;
        e.def = nd; e.maxHp = nd.hp; e.hp = Math.max(1, Math.round(nd.hp * f)); e.range = nd.range + G.techBonus(b.owner).range * (nd.ranged ? 1 : 0) + ((u.line === 'archer' || u.line === 'longbowman') && mods(b.owner).archerRange ? mods(b.owner).archerRange : 0);
      }
      if (G.onResearched) G.onResearched(b.owner, u.name);
    } else {
      const before = {}; for (const e of G.ents) if (!e.dead && e.owner === b.owner && e.kind === 'building') before[e.id] = G.bldHpMult(b.owner, e.def);
      pl.techs[r.id] = true;
      const eff = G.TECHS[r.id].eff;
      for (const e of G.ents) {
        if (e.dead || e.owner !== b.owner) continue;
        if (e.kind === 'unit') {
          e.range = G.rangeOf(b.owner, e.type, e.def);
          if (e.type === 'villager' && eff.vilHp) { e.maxHp += eff.vilHp; e.hp += eff.vilHp; }
        } else if (e.kind === 'building' && before[e.id]) {
          const k = G.bldHpMult(b.owner, e.def) / before[e.id];
          if (k !== 1) { e.maxHp = Math.round(e.maxHp * k); e.hp = Math.round(e.hp * k); }
          if (e.type === 'farm' && eff.farm && e.built) e.food += eff.farm;
        }
      }
      if (G.onResearched) G.onResearched(b.owner, G.TECHS[r.id].name);
    }
  }

  G.unitCost = function (p, type) {
    const m = mods(p), base = G.UNITS[type].cost, c = {};
    let f = 1;
    if (type === 'archer' && m.archerCost) f = m.archerCost;
    if (type === 'spearman' && m.spearCost) f = m.spearCost;
    if (type === 'villager' && m.vilCost) f = m.vilCost;
    if (m.cavCost && G.UNITS[type].cls === 'cav') f = m.cavCost;
    for (const k in base) c[k] = Math.round(base[k] * f);
    return c;
  };
  G.buildCost = (p, type) => ({ ...G.BUILDINGS[type].cost });
  G.canAfford = (p, cost) => Object.keys(cost).every(k => G.players[p].res[k] >= cost[k]);
  G.pay = function (p, cost) { if (!G.canAfford(p, cost)) return false; const pl = G.players[p], st = pl.stats = pl.stats || {}; for (const k in cost) { pl.res[k] -= cost[k]; st.spent = (st.spent || 0) + cost[k]; } if (p === 1 && cost.gold && G.sound && !G.demo) G.sound.play('coin'); return true; };
  G.refund = function (p, cost) { for (const k in cost) G.players[p].res[k] += cost[k]; };

  G.popOf = function (p) {
    let pop = 0, cap = 0;
    for (const e of G.ents) {
      if (e.owner !== p || e.dead) continue;
      // the King and Queen are given, not trained: they must not eat the first
      // five places and leave a player pop-capped before the game starts
      if (e.kind === 'unit') { if (e.def.cls !== 'hero') pop++; }
      else if (e.kind === 'building') {
        pop += (e.queue ? e.queue.length : 0) + (e.garrison ? e.garrison.length : 0);
        if (e.built && e.def.pop) cap += (e.type === 'house' && mods(p).housePop) ? mods(p).housePop : e.def.pop;
      }
    }
    return { pop, cap: Math.min(G.rules.pop || 200, cap) };
  };

  // ---------- Creation ----------
  function base(kind, type, owner, def) {
    const e = { id: nextId++, kind, type, owner, def, dead: false };
    G.ents.push(e); G.byId.set(e.id, e);
    return e;
  }

  G.addResource = function (rtype, tx, ty) {
    if (!G.isFree(tx, ty)) return null;
    const e = base('res', rtype, 0, G.RES[rtype]);
    e.tx = tx; e.ty = ty; e.size = 1; e.x = tx + 0.5; e.y = ty + 0.5;
    e.amount = G.RES[rtype].amount; e.rtype = G.RES[rtype].res;
    e.var = Math.floor(G.mapRng() * 4);
    G.setBlock(e, e.id);
    return e;
  };

  G.addBuilding = function (type, owner, tx, ty, built) {
    const def = G.BUILDINGS[type];
    const e = base('building', type, owner, def);
    e.tx = tx; e.ty = ty; e.size = def.size;
    e.x = tx + def.size / 2; e.y = ty + def.size / 2;
    let hp = def.hp; if (owner > 0 && mods(owner).buildingHp) hp = Math.round(hp * mods(owner).buildingHp);
    if (owner > 0 && type === 'towncenter' && mods(owner).tcHp) hp = Math.round(hp * mods(owner).tcHp);
    if (owner > 0) hp = Math.round(hp * G.bldHpMult(owner, def));
    e.maxHp = hp; e.hp = built ? hp : 1; e.built = !!built; e.progress = built ? 1 : 0;
    e.queue = []; e.qt = 0; e.cool = 0; e.rally = null;
    if (type === 'farm') { e.food = G.farmFull(owner); e.farmer = 0; }
    if (type !== 'farm') G.setBlock(e, e.id);
    return e;
  };

  G.addUnit = function (type, owner, x, y) {
    const def = G.unitDef(owner, type);
    const e = base('unit', type, owner, def);
    e.x = x; e.y = y;
    let hp = def.hp; if (type === 'knight' && mods(owner).knightHp) hp = Math.round(hp * mods(owner).knightHp);
    if (owner > 0) hp += G.techEff(owner, 'unitHp_' + type) || 0;   // e.g. Cholas' Temple Endowment
    e.hp = e.maxHp = hp;
    if (type === 'villager') e.sex = G.rand() < 0.5 ? 'f' : 'm';
    if (type === 'queen') e.sex = 'f';
    e.task = { t: 'idle' }; e.path = []; e.cool = 0; e.carry = null; e.face = 1; e.walk = 0; e.repath = 0;
    e.range = G.rangeOf(owner, type, def);
    if (type === 'villager') { const h = G.techEff(owner, 'vilHp'); e.hp += h; e.maxHp += h; }
    return e;
  };

  // ---- Garrison (AoE2-style): villagers shelter in their Town Center, each one adds an arrow ----
  G.GARRISON_MAX = 15;
  // Villagers shelter anywhere that takes a garrison; a Castle takes soldiers too,
  // and every unit inside adds an arrow to what the building shoots.
  // The King and Queen may hide in a Town Center too, so they have shelter from the first minute.
  G.canGarrison = (u, b) => b && !b.dead && b.built && b.def.garrison && b.owner === u.owner
    && (u.type === 'villager' || u.def.cls === 'hero' || b.type === 'castle' || (b.type === 'infirmary' && !u.def.siege))
    && (b.garrison || []).length + (b.incoming || 0) < b.def.garrison;
  G.garrisonTo = function (u, b) { if (G.canGarrison(u, b)) { u.task = { t: 'garrison', id: b.id }; u.path = []; u.pathFor = 0; } };
  G.ringBell = function (owner) {
    if (owner === 1) snd('bell');
    // the bell calls the royals home along with the villagers
    for (const u of G.ents) if (!u.dead && u.owner === owner && (u.type === 'villager' || u.def.cls === 'hero')) {
      const tc = nearest(u, e => e.type === 'towncenter' && G.canGarrison(u, e));
      if (tc) G.garrisonTo(u, tc);
    }
  };
  // Units still standing inside a building are out of G.ents, so anything that asks
  // "does this player still have X" has to look inside garrisons too.
  G.unitsOf = function (p) {
    const out = [];
    for (const e of G.ents) {
      if (e.dead || e.owner !== p) continue;
      if (e.kind === 'unit') out.push(e);
      else if (e.garrison) for (const g of e.garrison) if (!g.dead) out.push(g);
    }
    return out;
  };
  G.royal = (p, type) => G.unitsOf(p).find(u => u.type === type) || null;
  // empty a building, or only the units matching keep (the AI lets its royals out alone)
  G.ungarrison = function (b, keep) {
    const all = b.garrison || [];
    const list = keep ? all.filter(keep) : all;
    b.garrison = keep ? all.filter(u => !keep(u)) : [];
    for (const u of list) {
      const spot = G.nearestFree(b.x + 1.5, b.y + 1.5, 10) || { x: b.tx, y: b.ty };
      u.x = spot.x + 0.5 + (G.rand() - 0.5) * 0.4; u.y = spot.y + 0.5 + (G.rand() - 0.5) * 0.4;
      u.task = { t: 'idle' }; u.path = []; u.inside = 0;
      G.ents.push(u);
    }
  };
  G.kill = function (e) {
    if (e.dead) return;
    e.dead = true;
    if (e.kind !== 'unit' && e.type !== 'farm') G.setBlock(e, 0);
    if (e.kind === 'building' && e.queue) for (const q of e.queue) G.refund(e.owner, q.cost);
    if (e.kind === 'building' && e.garrison && e.garrison.length) G.ungarrison(e);
    if (e.kind === 'res' && e.type === 'tree' && G.decals) G.decals.push({ x: e.x, y: e.y, life: 150 });
    // a building that falls leaves its stones on the ground for a good while
    if (e.kind === 'building' && e.type !== 'farm' && G.decals)
      G.decals.push({ t: 'rubble', x: e.tx + e.size / 2, y: e.ty + e.size / 2, size: e.size, id: e.id, life: 240 });
    if (e.kind === 'unit' && G.corpses) G.corpses.push({ type: e.type, def: { tier: (e.def && e.def.tier) || 0 }, owner: e.owner, sex: e.sex, face: e.face, dir: e.dir || 0, x: e.x, y: e.y, t: 0 });
    if (e.kind !== 'res') {
      G.effects.push({ t: 'die', x: e.x, y: e.y, life: 0.8, big: e.kind === 'building', size: e.size || 1 });
      if (e.owner > 0) { const pl = G.players[e.owner]; pl.lost++; const st = pl.stats = pl.stats || {}; if (e.kind === 'building') st.bldLost = (st.bldLost || 0) + 1; else st.unitsLost = (st.unitsLost || 0) + 1; }
    }
    G.byId.delete(e.id);
    snd(e.kind === 'building' ? 'buildingdown' : e.type === 'king' ? 'kingdown' : (e.sex === 'f' || e.type === 'queen') ? 'die_f' : 'die', e.x, e.y);
    if (G.onKilled) G.onKilled(e);
  };

  // ---------- Helpers ----------
  G.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // Distance from a point to an entity's edge (buildings/resources are rectangles).
  G.edgeDist = function (u, t) {
    if (t.kind === 'unit') return Math.hypot(u.x - t.x, u.y - t.y);
    const s = t.size || 1;
    const cx = Math.max(t.tx, Math.min(t.tx + s, u.x)), cy = Math.max(t.ty, Math.min(t.ty + s, u.y));
    return Math.hypot(u.x - cx, u.y - cy);
  };
  G.allied = (a, b) => a === b || (a > 0 && b > 0 && G.players[a] && G.players[b] && G.players[a].team > 0 && G.players[a].team === G.players[b].team);
  G.enemies = (a, b) => a > 0 && b > 0 && !G.allied(a, b);

  function nearest(u, pred, maxD) {
    let best = null, bd = maxD || 1e9;
    for (const e of G.ents) { if (e.dead || !pred(e)) continue; const d = G.edgeDist(u, e); if (d < bd) { bd = d; best = e; } }
    return best;
  }
  G.nearest = nearest;

  function dropSiteFor(u, rtype) {
    return nearest(u, e => e.kind === 'building' && e.owner === u.owner && e.built && e.def.drop && e.def.drop.includes(rtype));
  }

  function rectOf(t) { const s = t.size || 1; return { x0: t.tx, y0: t.ty, x1: t.tx + s - 1, y1: t.ty + s - 1 }; }

  function pathTo(u, t, adjacent) {
    // budget: a big battle can't spend the whole frame on A*; units with a path keep it a moment longer
    if (u.path && u.path.length && u.pathFor === t.id && (G.pathBudget | 0) <= 0) { u.repath = 0.15 + G.rand() * 0.2; return; }
    G.pathBudget = (G.pathBudget | 0) - 1;
    if (t.kind === 'unit') {
      const tx = t.x | 0, ty = t.y | 0;
      u.path = G.findPath(u.x, u.y, { x0: tx, y0: ty, x1: tx, y1: ty }, false, 0, u.owner);
    } else {
      u.path = G.findPath(u.x, u.y, rectOf(t), adjacent, t.type === 'farm' ? 0 : t.id, u.owner);
    }
    u.pathFor = t.id; u.repath = 1.2;
  }

  // ---------- Commands ----------
  // AoE2-style formation: a line facing the way the group travels. Melee in front, archers behind,
  // villagers last; a mixed army marches at the pace of its slowest unit so it arrives together.
  const RANK = { inf: 0, cav: 0, arc: 1, vil: 2 };
  // Offsets (ox across, oy forward) for each unit of a group, in its marching order.
  //   line      ranks facing forward, melee first (AoE2's default)
  //   staggered the same ranks spread wide and offset, so arrows and stones hit fewer men
  //   box       melee and cavalry on the outside of a square, archers, siege and the royals inside
  G.FORMATIONS = ['line', 'box', 'staggered', 'wedge'];
  G.formationSlots = (units, kind) => formationSlots(units, kind);
  // the order a group lines up in: melee first (cavalry first of all in a wedge), then archers, villagers last
  G.formationOrder = (units, kind) => units.slice().sort((a, b) => (kind === 'wedge' ? (b.def.cls === 'cav') - (a.def.cls === 'cav') : 0) || (RANK[a.def.cls] || 0) - (RANK[b.def.cls] || 0) || a.id - b.id);
  function formationSlots(units, kind) {
    const n = units.length, out = [];
    if (kind === 'wedge') {
      // a triangle pointing forward: one at the tip, two behind, three behind them...
      let r = 0, i = 0; const wg = units.some(u => u.def.cls === 'cav') ? 1.25 : 0.95;
      while (i < n) { const inRow = Math.min(r + 1, n - i); for (let c = 0; c < inRow; c++, i++) out.push({ ox: (c - (inRow - 1) / 2) * wg, oy: -r * wg }); r++; }
      const mid = (r - 1) * wg / 2; for (const o of out) o.oy += mid;
      return out;
    }
    if (kind === 'box' && n >= 4) {
      // a filled square: melee and cavalry take the outside cells, archers, siege and the
      // royals the middle. Cells run outermost first, so the walls of the square fill first.
      const gap = units.some(u => u.def.cls === 'cav') ? 1.25 : 0.95, side = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / side), cells = [];
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / side), inRow = Math.min(side, n - r * side), c = i % side;
        cells.push({ ox: (c - (inRow - 1) / 2) * gap, oy: ((rows - 1) / 2 - r) * gap });
      }
      cells.sort((a, b) => Math.max(Math.abs(b.ox), Math.abs(b.oy)) - Math.max(Math.abs(a.ox), Math.abs(a.oy)) || b.oy - a.oy || a.ox - b.ox);
      const outerFirst = units.map((u, i) => i).sort((a, b) => isOuter(units[b]) - isOuter(units[a]) || a - b);
      outerFirst.forEach((ui, k) => { out[ui] = cells[k]; });
      return out;
    }
    // line (and staggered): each kind of soldier in its own ranks, melee in front, archers
    // behind, villagers last, every rank a clean straight front centred on the target
    const wide = kind === 'staggered', gap = wide ? 1.45 : 0.95, maxRank = wide ? 8 : 12;
    const groups = [];
    units.forEach((u, i) => { const k = RANK[u.def.cls] || 0; if (!groups.length || groups[groups.length - 1].k !== k) groups.push({ k, idx: [] }); groups[groups.length - 1].idx.push(i); });
    const ranks = [];
    for (const g of groups) {
      const m = g.idx.length, nr = Math.ceil(m / maxRank), per = Math.ceil(m / nr);
      for (let r = 0; r < nr; r++) ranks.push(g.idx.slice(r * per, (r + 1) * per));
    }
    // horses need more room than men on foot, across and between ranks
    const rg = ranks.map(rk => gap * (rk.some(ui => units[ui].def.cls === 'cav') ? 1.4 : 1));
    const depth = [0]; for (let r = 1; r < ranks.length; r++) depth.push(depth[r - 1] + (rg[r - 1] + rg[r]) / 2);
    const mid = depth[depth.length - 1] / 2;
    ranks.forEach((rk, r) => {
      const shift = wide && r % 2 ? rg[r] / 2 : 0;
      rk.forEach((ui, c) => { out[ui] = { ox: (c - (rk.length - 1) / 2) * rg[r] + shift, oy: mid - depth[r] }; });
    });
    return out;
  }
  const isOuter = u => (u.def.cls === 'inf' || u.def.cls === 'cav') && !u.def.royal && !u.def.siege ? 1 : 0;
  // Which slot each man takes. Slots only say the shape; giving them out in list order sent
  // men across each other's paths. Within each kind of soldier, the men furthest forward take
  // the front rank and each rank is filled left to right by where the men stand now, so
  // nobody walks through the formation to reach his place. Ties break on id, so both phones
  // in a network match agree.
  function matchSlots(sorted, slots, kind, cx, cy, fx, fy, rx, ry) {
    const keyOf = u => kind === 'box' ? isOuter(u) : (RANK[u.def.cls] || 0);
    const fwd = u => (u.x - cx) * fx + (u.y - cy) * fy, lat = u => (u.x - cx) * rx + (u.y - cy) * ry;
    const byKey = new Map();
    sorted.forEach((u, i) => { const k = keyOf(u); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); });
    const res = new Array(sorted.length);
    for (const idx of byKey.values()) {
      const sl = idx.map(i => slots[i]).sort((a, b) => b.oy - a.oy || a.ox - b.ox);
      const men = idx.map(i => sorted[i]).sort((a, b) => fwd(b) - fwd(a) || a.id - b.id);
      let p = 0;
      while (p < sl.length) {
        let q = p; while (q < sl.length && Math.abs(sl[q].oy - sl[p].oy) < 0.01) q++;
        const row = sl.slice(p, q), crew = men.slice(p, q).sort((a, b) => lat(a) - lat(b) || a.id - b.id);
        crew.forEach((u, k) => { res[sorted.indexOf(u)] = row[k]; });
        p = q;
      }
    }
    return res;
  }
  G.cmdMove = function (units, x, y) {
    units = units.filter(u => u.kind === 'unit');
    const n = units.length; if (!n) return;
    let cx = 0, cy = 0; for (const u of units) { cx += u.x; cy += u.y; } cx /= n; cy /= n;
    let fx = x - cx, fy = y - cy; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;   // forward
    const rx = -fy, ry = fx;                                                              // right
    // each group keeps the formation it was given; otherwise the player's last choice
    const votes = {}; for (const u of units) if (u.form) votes[u.form] = (votes[u.form] || 0) + 1;
    const kind = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0] || (G.players[units[0].owner] || {}).formation || 'line';
    const sorted = G.formationOrder(units, kind);
    const military = units.some(u => u.type !== 'villager') && n > 1;
    const gs = military ? Math.min(...units.map(u => u.def.speed)) : 0;
    const slots = n > 1 ? matchSlots(sorted, formationSlots(sorted, kind), kind, cx, cy, fx, fy, rx, ry) : [{ ox: 0, oy: 0 }];
    const taken = new Set();   // tiles already given to a man whose own slot was blocked
    sorted.forEach((u, i) => {
      const { ox, oy } = slots[i];
      let tx = x + rx * ox + fx * oy, ty = y + ry * ox + fy * oy;
      if (!G.isFree(tx | 0, ty | 0)) {
        // a slot on a tree or wall: the nearest open tile no one else was moved to,
        // so blocked men don't all pile onto the same spot
        let best = null;
        for (let r = 1; r <= 6 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const ax = (tx | 0) + dx, ay = (ty | 0) + dy;
          if (G.isFree(ax, ay) && !taken.has(ax + ',' + ay)) { best = { x: ax, y: ay }; break; }
        }
        if (!best) best = G.nearestFree(tx, ty, 6) || { x: x | 0, y: y | 0 };
        taken.add(best.x + ',' + best.y); tx = best.x + 0.5; ty = best.y + 0.5;
      }
      u.task = { t: 'move', x: tx, y: ty, gs, fx: military ? fx : 0, fy: military ? fy : 0 };
      u.path = G.findPath(u.x, u.y, { x0: tx | 0, y0: ty | 0, x1: tx | 0, y1: ty | 0 }, false, 0, u.owner);
      if (u.path.length) u.path[u.path.length - 1] = { x: tx, y: ty };
    });
  };
  G.cmdAttack = function (units, t) {
    for (const u of units) if (u.kind === 'unit' && !u.def.heal) { u.task = { t: 'attack', id: t.id, forced: true }; u.path = []; u.pathFor = 0; }
  };
  G.cmdGather = function (units, r) {
    for (const u of units) if (u.type === 'villager') { u.task = { t: 'gather', id: r.id, rtype: r.type, lx: r.x, ly: r.y }; u.path = []; u.pathFor = 0; }
  };
  // How many villagers one patch of a resource can take before the next man is better off on
  // the patch beside it (AoE2 lets more crowd on, but they only bump into each other).
  const GATHER_CAP = { tree: 1, berry: 2, gold: 2, stone: 2 };
  // Send a group to gather a kind of resource around a point, spreading them out: each man
  // takes the nearest patch of that kind that still has room, so three villagers sent to a
  // forest take three trees, not one. `r` is the patch that was tapped (or the nearest one);
  // men who find no room within `radius` tiles of it share it anyway.
  G.cmdGatherSpread = function (units, r, radius) {
    const vils = units.filter(u => u.type === 'villager'); if (!vils.length || !r) return;
    radius = radius || 6;
    const load = new Map();   // resource id -> men already on it (counting the ones we assign here)
    for (const u of G.ents) if (!u.dead && u.kind === 'unit' && u.task.t === 'gather' && !vils.includes(u)) load.set(u.task.id, (load.get(u.task.id) || 0) + 1);
    const cap = GATHER_CAP[r.type] || 2;
    const pool = G.ents.filter(e => !e.dead && e.kind === 'res' && e.type === r.type && e.amount > 0 && Math.hypot(e.x - r.x, e.y - r.y) <= radius);
    // nearest men first, so the ones already there keep the tapped patch
    vils.sort((a, b) => G.dist(a, r) - G.dist(b, r) || a.id - b.id);
    for (const v of vils) {
      let best = null, bd = Infinity;
      for (const e of pool) {
        if ((load.get(e.id) || 0) >= cap) continue;
        // prefer the tapped patch and what is near it, then what is near the man
        const d = Math.hypot(e.x - r.x, e.y - r.y) * 2 + G.dist(v, e);
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) best = r;
      load.set(best.id, (load.get(best.id) || 0) + 1);
      G.cmdGather([v], best);
    }
  };
  G.cmdBuild = function (units, b) {
    for (const u of units) if (u.type === 'villager') { u.task = { t: 'build', id: b.id }; u.path = []; u.pathFor = 0; }
  };
  G.cmdFarm = function (units, f) {
    for (const u of units) if (u.type === 'villager') { u.task = { t: 'farm', id: f.id }; u.path = []; u.pathFor = 0; }
  };
  G.cmdDeposit = function (units, b) {
    for (const u of units) if (u.type === 'villager' && u.carry) { u.task = { t: 'return', id: b.id, back: u.task.t === 'gather' ? u.task : null }; u.path = []; u.pathFor = 0; }
  };

  // Context-sensitive command (what a tap / right-click on something does).
  // A spent farm keeps its tiles and can be sown again for a fraction of a new one.
  G.farmFull = owner => Math.round(G.BUILDINGS.farm.farm * (mods(owner).farmFood || 1)) + G.techEff(owner, 'farm');
  G.farmSpent = f => !!f && !f.dead && f.type === 'farm' && f.built && f.food <= 0;
  G.resowCost = owner => ({ wood: Math.round(G.BUILDINGS.farm.reseed * (mods(owner).farmCost || 1)) });
  G.resowFarm = function (f, owner) {
    if (!G.farmSpent(f) || f.owner !== owner) return false;
    if (!G.pay(owner, G.resowCost(owner))) return false;
    f.food = G.farmFull(owner); f.fallow = false;
    return true;
  };

  // A farm takes one worker. It counts as busy while another villager is working
  // it OR walking to it, so two villagers never get sent to the same plot.
  G.farmBusy = function (f, except) {
    for (const u of G.ents) {
      if (u.dead || u.kind !== 'unit' || u === except) continue;
      if (u.task.t === 'farm' && u.task.id === f.id) return true;
      if (u.task.t === 'build' && u.task.id === f.id && u.task.then === 'farm') return true;
      // still theirs while they walk a full load back to the mill
      if (u.task.t === 'return' && u.task.back && u.task.back.t === 'farm' && u.task.back.id === f.id) return true;
    }
    return false;
  };
  G.freeFarmNear = function (x, y, owner, except) {
    let best = null, bd = Infinity;
    for (const e of G.ents) {
      if (e.dead || e.kind !== 'building' || e.type !== 'farm' || e.owner !== owner) continue;
      if (G.farmBusy(e, except)) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  // G.cmdTarget is the entity actually acted on, which is not always the one
  // tapped (a busy farm hands off to the nearest free one). The UI outlines it.
  G.cmdSmart = function (units, x, y, t) {
    units = units.filter(u => u.kind === 'unit' && !u.dead);
    G.cmdTarget = t || null;
    if (!units.length) return null;
    if (t && !t.dead) {
      if (G.enemies(t.owner, units[0].owner)) { G.cmdAttack(units, t); return 'attack'; }
      if (t.kind === 'res') {
        const vils = units.filter(u => u.type === 'villager');
        if (vils.length > 1) G.cmdGatherSpread(vils, t); else G.cmdGather(vils, t);
        G.cmdMove(units.filter(u => u.type !== 'villager'), x, y);
        return vils.length ? 'gather' : 'move';
      }
      if (t.kind === 'building' && t.owner === units[0].owner) {
        const vils = units.filter(u => u.type === 'villager');
        if (vils.length) {
          // a farm only ever needs one villager, building it included
          if (t.type === 'farm') {
            const who = vils.slice(0, 1);
            let f = t;
            if (G.farmBusy(t, who[0])) {
              f = G.freeFarmNear(who[0].x, who[0].y, t.owner, who[0]);
              if (!f) { G.cmdTarget = t; return 'farm-busy'; }
            }
            G.cmdTarget = f;
            G.cmdFarm(who, f);   // the farm task builds it first when unbuilt
            // the others spread out over your other free farms (one farmer each, as in AoE2)
            let left = 0;
            for (const v of vils.slice(1)) { const g = G.freeFarmNear(v.x, v.y, t.owner, v); if (g) G.cmdFarm([v], g); else left++; }
            if (left && t.owner === 1 && G.ui) G.ui.alert(`${left} villager${left === 1 ? ' has' : 's have'} no free farm. Build more farms.`);
            return f === t ? 'gather' : 'gather-moved';
          }
          if (!t.built || t.hp < t.maxHp) { G.cmdBuild(vils, t); return 'build'; }
          if (t.def.drop) { G.cmdDeposit(vils, t); return 'move'; }
        }
      }
      if (t.owner === units[0].owner && (t.kind === 'unit' || t.kind === 'building')) {
        const sold = units.filter(u => u.type !== 'villager' && u !== t && !u.def.heal);
        if (sold.length) {
          // wounded to the Infirmary: shelter and heal there
          if (t.type === 'infirmary' && sold.some(u => u.hp < u.maxHp)) { let n = 0; for (const u of sold) if (G.canGarrison(u, t)) { G.garrisonTo(u, t); n++; } if (n) return 'shelter'; }
          G.cmdGuard(sold, t); return 'guard';
        }
      }
    }
    G.cmdMove(units, x, y);
    return 'move';
  };
  // turn a finished wall piece into a gate foundation on the same tile; the nearest villager builds it
  G.wallToGate = function (w) {
    if (!w || w.dead || !w.def.wall || w.type === 'gate' || !w.built) return 'not a wall';
    if (!G.canBuildType(w.owner, 'gate')) return 'needs the ' + G.AGES[G.BUILD_AGE.gate].name;
    const cost = G.buildCost(w.owner, 'gate'); if (!G.canAfford(w.owner, cost)) return 'cost';
    const tx = w.tx, ty = w.ty, owner = w.owner;
    w.dead = true; G.setBlock(w, 0); G.byId.delete(w.id); G.ents = G.ents.filter(e => e !== w);
    const vil = nearest(w, e => e.kind === 'unit' && e.owner === owner && e.type === 'villager' && !e.inside, 40);
    const g = G.placeBuilding(owner, 'gate', tx, ty, vil ? [vil] : null);
    if (!g) { const back = G.addBuilding(w.type, owner, tx, ty, true); back.hp = w.hp; return 'blocked'; }
    return g;
  };
  G.cmdStop = units => { for (const u of units) if (u && !u.dead) { u.task = { t: 'idle' }; u.path = []; } };
  G.setStance = (units, k) => { for (const u of units) if (u && !u.dead) u.stance = k; };
  G.setRally = (b, r) => { if (b && !b.dead) b.rally = r; };
  G.setForm = (units, k) => { for (const u of units) if (u && !u.dead) u.form = k; if (units[0] && G.players[units[0].owner]) G.players[units[0].owner].formation = k; };
  G.setReseed = (p, on) => { if (G.players[p]) G.players[p].noReseed = !on; };
  G.ungarrisonUnit = (b, u) => G.ungarrison(b, x => x === u);
  G.deleteEnt = e => { if (e && !e.dead) { G.kill(e); G.onKilled(e); } };
  G.cmdGuard = function (units, t) {
    for (const u of units) if (u.kind === 'unit' && !u.dead && u !== t) { u.task = { t: 'guard', id: t.id }; u.path = []; u.pathFor = 0; u.repath = 0; }
  };

  // a field never overlaps another field or a building (fields don't block walking, so the
  // blocking grid alone doesn't catch them)
  G.farmOverlap = (tx, ty, s, ignore) => G.ents.some(f => !f.dead && f !== ignore && f.type === 'farm' && tx < f.tx + f.size && tx + s > f.tx && ty < f.ty + f.size && ty + s > f.ty);
  G.placeBuilding = function (owner, type, tx, ty, builders) {
    const def = G.BUILDINGS[type];
    if (!G.canBuildType(owner, type)) return null;
    if (!G.areaFree(tx, ty, def.size)) return null;
    if (G.farmOverlap(tx, ty, def.size)) return null;
    if (G.ruleBlock && G.ruleBlock(owner, type, tx, ty)) return null;
    // keep units from being trapped: no own units standing in footprint is fine, they get pushed out
    const cost = G.buildCost(owner, type);
    if (!G.pay(owner, cost)) return null;
    const b = G.addBuilding(type, owner, tx, ty, false);
    b.cost = cost;
    if (G.onBuildingPlaced) G.onBuildingPlaced(b);
    // Push units standing inside the footprint out.
    for (const u of G.ents) if (u.kind === 'unit' && !u.dead && u.x >= tx && u.x < tx + def.size && u.y >= ty && u.y < ty + def.size) {
      const f = G.nearestFree(u.x, u.y, 6); if (f) { u.x = f.x + 0.5; u.y = f.y + 0.5; u.path = []; }
    }
    if (owner === 1) snd('place', b.x, b.y);
    if (builders && builders.length) G.cmdBuild(builders, b);
    return b;
  };

  // a building's train list plus the owner's unique unit (e.g. Britons Longbowman at the Archery Range)
  G.trainsFor = function (b) {
    const list = (b.def.trains || []).slice();
    const civ = G.players[b.owner] && G.CIVS[G.players[b.owner].civ];
    if (civ && civ.unique && civ.unique.at === b.type) list.push(civ.unique.type);
    return list;
  };
  G.train = function (b, type) {
    if (!b.built || b.dead) return false;
    if (!G.trainsFor(b).includes(type) || !G.canTrainType(b.owner, type)) return false;
    if (b.aging || b.research) return 'busy';
    const cost = G.unitCost(b.owner, type);
    const { pop, cap } = G.popOf(b.owner);
    if (pop >= cap) return 'pop';
    if (b.queue.length >= 10) return false;
    if (!G.pay(b.owner, cost)) return 'res';
    b.queue.push({ type, cost });
    return true;
  };
  G.cancelTrain = function (b, i) {
    const q = b.queue.splice(i, 1)[0];
    if (q) { G.refund(b.owner, q.cost); if (i === 0) b.qt = 0; }
  };

  // what an entity was worth, for the score: its cost, with a royal counted as a small army
  G.valueOf = e => e.def.cls === 'hero' ? 400 : Object.values(e.def.cost || {}).reduce((a, b) => a + b, 0);
  G.KING_AURA = 4;

  // ---------- Damage ----------
  function damage(att, t) {
    const d = att.def;
    let dmg;
    if (t.kind === 'building') {
      // an arrow does nothing to a wall, but a ram or a trebuchet lands its whole blow
      dmg = d.siege ? d.atk + (att.kind === 'unit' ? G.techEff(att.owner, 'unitAtk_' + att.type) : 0) : d.ranged ? 1 : Math.max(1, d.atk - 1);
      if (d.bonus && d.bonus.bld) dmg += d.bonus.bld;
      if (att.kind === 'building') dmg = 1;
    } else {
      const soldier = att.kind === 'unit' && att.type !== 'villager';
      const tbA = soldier ? G.techBonus(att.owner) : null;
      const aa = soldier ? (G.ageOf(att.owner) >= 3 ? 1 : 0) + (G.ageOf(att.owner) >= 4 ? 1 : 0) + (d.ranged ? tbA.ranged : tbA.melee) : 0;
      const tSold = t.kind === 'unit' && t.type !== 'villager', tbT = tSold ? G.techBonus(t.owner) : null;
      const ta = tSold ? (G.ageOf(t.owner) >= 4 ? 1 : 0) + (d.ranged || att.kind === 'building' ? tbT.pierce : tbT.armor) : 0;
      const arm = (d.ranged || att.kind === 'building' ? t.def.pierce : t.def.armor) + ta;
      dmg = Math.max(1, d.atk + aa - arm + (att.kind === 'building' ? G.techEff(att.owner, 'towerAtk') : G.techEff(att.owner, 'unitAtk_' + att.type)));
      if (d.bonus && d.bonus[t.def.cls]) dmg += d.bonus[t.def.cls];
      if (soldier && d.cls !== 'hero') {
        // soldiers fighting near their King hit harder
        const k = G.kings && G.kings[att.owner];
        if (k && G.dist(k, att) <= G.KING_AURA) dmg += 1;
        // a dynasty mourning its King fights weaker for a while
        if (G.players[att.owner].mourn > G.time) dmg = Math.max(1, Math.round(dmg * 0.8));
      }
    }
    if (G.dmgMod) dmg = G.dmgMod(att, t, dmg);
    return dmg;
  }
  G.fire = (a, t) => fire(a, t);
  function hit(att, t, dmg) {
    if (t.dead) return;
    // Capture: a Town Center can be beaten down to a white flag, never burned
    const floor = G.hpFloor && G.hpFloor(t);
    if (floor != null && t.hp - dmg < floor) { t.hp = Math.min(t.hp, floor); t.hitT = 0.2; return; }
    t.hp -= dmg; t.hitT = 0.2; if (t.kind === 'unit') t.hurtT = 0.6;
    if (t.hp <= 0) {
      if (att.owner > 0) { const pl = G.players[att.owner]; pl.killed++; pl.killValue = (pl.killValue || 0) + G.valueOf(t);
        // the results screen's detail: what killed what
        const st = pl.stats = pl.stats || {}; st.killsBy = st.killsBy || {}; st.killsBy[att.type] = (st.killsBy[att.type] || 0) + 1;
        if (t.kind === 'building') st.razed = (st.razed || 0) + 1; else st.unitsKilled = (st.unitsKilled || 0) + 1; }
      G.kill(t); return;
    }
    // Fight back. A soldier marching on a building (an attack wave, an attack-move) turns on
    // the unit that hits it, as in AoE2: without this four archers could shoot down a whole
    // army that kept walking at a Town Center. Siege and the royals keep to their orders.
    if (t.kind === 'unit' && att.kind === 'unit' && t.task.t === 'attack' && t.type !== 'villager' && !t.def.heal && G.stanceOf(t) !== 'passive'
        && !t.def.siege && t.def.cls !== 'hero' && G.enemies(att.owner, t.owner)) {
      const cur = G.byId.get(t.task.id);
      if (!cur || cur.kind === 'building' || G.dist(t, cur) > G.dist(t, att) + 2) {
        t.task = { t: 'attack', id: att.id, forced: t.task.forced, home: t.task.home };
        // and the men marching beside it turn with it
        for (const o of G.ents) {
          if (o === t || o.dead || o.kind !== 'unit' || o.owner !== t.owner || o.type === 'villager' || o.def.heal || o.def.siege || o.def.cls === 'hero') continue;
          if (o.task.t !== 'attack' || G.dist(o, t) > 5) continue;
          const oc = G.byId.get(o.task.id);
          if (oc && oc.kind === 'unit') continue;
          o.task = { t: 'attack', id: att.id, forced: o.task.forced, home: o.task.home }; o.path = []; o.pathFor = 0;
        }
      }
    }
    if (t.kind === 'unit' && t.task.t !== 'attack' && G.enemies(att.owner, t.owner)) {
      if (t.type !== 'villager' && !t.def.heal && G.stanceOf(t) !== 'passive') {
        t.task = { t: 'attack', id: att.id, home: { x: t.x, y: t.y } };
        // His comrades come too. Archers shoot from just beyond a swordsman's sight, so
        // without this the men standing beside him never notice: he charges alone, dies in
        // seconds, and the next man does the same. Idle soldiers within earshot (and those
        // only wandering) turn on the attacker; stand-ground and passive men stay put.
        if (att.kind === 'unit') for (const o of G.ents) {
          if (o === t || o.dead || o.kind !== 'unit' || o.owner !== t.owner || o.inside || o.type === 'villager' || o.def.heal || o.def.siege || o.def.cls === 'hero') continue;
          if (o.task.t !== 'idle' && !(o.task.t === 'move' && !o.task.forced)) continue;
          const st = G.stanceOf(o); if (st === 'stand' || st === 'passive') continue;
          if (G.dist(o, t) > 6) continue;
          o.task = { t: 'attack', id: att.id, home: { x: o.x, y: o.y }, resume: o.task.t === 'move' ? { x: o.task.x, y: o.task.y, fx: o.task.fx, fy: o.task.fy } : undefined }; o.path = []; o.pathFor = 0;
        }
      }
      else if (att.kind === 'unit' && att.def.cls !== 'cav' && t.hp < t.maxHp * 0.4) {
        // flee toward town center
        const tc = nearest(t, e => e.type === 'towncenter' && e.owner === t.owner && e.built);
        if (tc) { t.task = { t: 'move', x: tc.x, y: tc.y + tc.size / 2 + 0.6 }; t.path = G.findPath(t.x, t.y, rectOf(tc), true, tc.id, t.owner); }
      }
    }
    const W = { militia: 'sword', king: 'sword', spearman: 'spear', knight: 'sword', scout: 'spear',
      cataphract: 'sword', elephant: 'ram', kamayuk: 'spear', templeguard: 'sword', archer: 'bow', longbowman: 'bow', repeater: 'bolt', axethrower: 'axethrow',
      ram: 'ram', trebuchet: 'stonehit' };
    let k = W[att.type] || (att.kind === 'building' ? 'bow' : 'sword');
    // melee blows vary with what they land on: armour clanks, cloth and leather slash
    if (k === 'sword' && t.kind === 'unit') k = (t.def.cls === 'cav' || t.def.armor >= 2) ? (Math.random() < 0.5 ? 'armor' : 'sword') : (Math.random() < 0.5 ? 'slash' : 'sword');
    snd(k, t.x, t.y);
    // the music turns when the player's own war starts, not when two AIs scrap elsewhere
    if (G.sound && G.sound.fighting && (att.owner === 1 || t.owner === 1) && G.enemies(att.owner, t.owner)) G.sound.fighting();
    if (G.onHit) G.onHit(att, t);
  }
  function fire(att, t) {
    const dmg = damage(att, t);
    if (att.def.ranged || att.kind === 'building') {
      const heavy = !!att.def.siege;
      if (att.type === 'trebuchet') snd('trebuchet', att.x, att.y);   // a trebuchet stone lobs slowly and high, not like an arrow
      G.projs.push({ x: att.x, y: att.y, z: att.kind === 'building' ? 1.6 : 0.6, tx: t.x, ty: t.y, tid: t.id, from: att, dmg, t: 0, heavy, dur: Math.max(0.25, G.dist(att, t) / (heavy ? 4 : 9)) });
    } else {
      hit(att, t, dmg);
      if (att.def.splash && t.kind === 'unit') for (const o of G.ents) {
        if (o === t || o.dead || o.kind !== 'unit' || !G.enemies(o.owner, att.owner) || Math.hypot(o.x - t.x, o.y - t.y) > 1) continue;
        hit(att, o, Math.max(1, Math.round(dmg * att.def.splash)));
      }
    }
  }

  // ---------- Per-frame update ----------
  const SEP = 0.42;
  G.updateEntities = function (dt) {
    // where each player's King stands this frame (a King hiding indoors leads no one)
    G.kings = {};
    for (const e of G.ents) if (!e.dead && e.type === 'king') G.kings[e.owner] = e;
    // Buildings
    for (const b of G.ents) {
      if (b.dead || b.kind !== 'building') continue;
      if (b.hitT) b.hitT = Math.max(0, b.hitT - dt);
      if (!b.built) continue;
      if (b.research) {
        b.research.t += dt * (G.fastTrain || 1);
        const rd = b.research.kind === 'up' ? G.UPGRADES[b.research.id] : G.TECHS[b.research.id];
        if (b.research.t >= rd.time) finishResearch(b);
      } else if (b.aging) {
        const speed = mods(b.owner).tcSpeed || 1;
        b.aging.t += dt * speed * (G.fastTrain || 1);
        if (b.aging.t >= G.AGES[b.aging.to].time) finishAge(b);
      } else if (b.queue.length && !b.research) {
        const q = b.queue[0], def = G.UNITS[q.type];
        const speed = ((b.type === 'towncenter' && mods(b.owner).tcSpeed) ? mods(b.owner).tcSpeed : 1) * (1 + G.techEff(b.owner, 'trainSpeed_' + b.type));
        const { pop, cap } = G.popOf(b.owner);
        const blocked = pop - b.queue.length + 1 > cap; // housed
        if (!blocked) b.qt += dt * speed * (G.fastTrain || 1);
        b.housed = blocked;
        if (b.qt >= def.time) {
          b.qt = 0; b.queue.shift(); if (b.owner === 1) snd('train');
          spawn(b, q.type);
        }
      } else b.housed = false;
      if (b.def.atk && !(G.noShoot && G.noShoot(b))) {
        b.cool -= dt;
        if (b.cool <= 0) {
          const t = nearest(b, e => e.kind === 'unit' && G.enemies(e.owner, b.owner), b.def.range + G.techEff(b.owner, 'towerRange'));
          if (t) { const n = 1 + (b.garrison ? b.garrison.length : 0); for (let i = 0; i < n; i++) fire(b, t); b.cool = b.def.rate; }
        }
      }
      // shelter heals: wounded units inside slowly recover (faster in a Monastery)
      if (b.garrison && b.garrison.length) {
        // the Infirmary heals fast; any other shelter slowly. Nobody heals while the building is being hit.
        b.calmT = b.hitT ? 3 : Math.max(0, (b.calmT || 0) - dt);
        const rate = b.calmT > 0 ? 0 : b.def.heal || 1;
        if (rate) for (const g of b.garrison) if (!g.dead && g.hp < g.maxHp) g.hp = Math.min(g.maxHp, g.hp + rate * dt);
      }
    }
    // Units
    for (const u of G.ents) if (!u.dead && u.kind === 'unit' && !u.inside) updateUnit(u, dt);
    if (G.ents.some(e => e.entering)) { for (const e of G.ents) delete e.entering; G.ents = G.ents.filter(e => !e.inside); }
    // Separation using a tile bucket grid
    const buckets = new Map();
    for (const u of G.ents) if (!u.dead && u.kind === 'unit') {
      const k = (u.x | 0) * 1000 + (u.y | 0);
      let a = buckets.get(k); if (!a) buckets.set(k, a = []); a.push(u);
    }
    for (const u of G.ents) {
      if (u.dead || u.kind !== 'unit') continue;
      if (u.task.t === 'farm' && u.atFarm) continue;
      let px = 0, py = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const a = buckets.get(((u.x | 0) + dx) * 1000 + (u.y | 0) + dy); if (!a) continue;
        for (const o of a) {
          if (o === u) continue;
          const ddx = u.x - o.x, ddy = u.y - o.y, d = Math.hypot(ddx, ddy);
          if (d < SEP && d > 0.0001) { const f = (SEP - d) / d * 0.5; px += ddx * f; py += ddy * f; }
          else if (d <= 0.0001) { px += (u.id % 7 - 3) * 0.01; py += (u.id % 5 - 2) * 0.01; }
        }
      }
      const moving = u.path.length > 0;
      const k = moving ? 0.3 : 1;
      const nx = u.x + px * k, ny = u.y + py * k;
      if (G.freeFor(nx | 0, ny | 0, u.owner)) { u.x = nx; u.y = ny; }
    }
    // Projectiles
    for (const p of G.projs) {
      p.t += dt;
      const t = G.byId.get(p.tid);
      if (t) { p.tx = t.x; p.ty = t.y; }
      if (p.t >= p.dur) { p.done = true; if (t && !t.dead) hit(p.from, t, p.dmg); }
    }
    G.projs = G.projs.filter(p => !p.done);
    if (G.corpses) { for (const c of G.corpses) c.t += dt; if (G.corpses.length && G.corpses[0].t > 14) G.corpses = G.corpses.filter(c => c.t <= 14); }
    if (G.decals) { for (const d of G.decals) d.life -= dt; if (G.decals.length && G.decals[0].life <= 0) G.decals = G.decals.filter(d => d.life > 0); }
    for (const f of G.effects) f.life -= dt;
    G.effects = G.effects.filter(f => f.life > 0);
    // Cleanup dead
    if (G.ents.some(e => e.dead)) G.ents = G.ents.filter(e => !e.dead);
  };

  function spawn(b, type) {
    const s = b.size;
    // search ring around building, starting at the front (bottom on screen)
    let spot = null;
    for (let r = 0; r < 4 && !spot; r++) {
      const cands = [];
      for (let y = b.ty - 1 - r; y <= b.ty + s + r; y++) for (let x = b.tx - 1 - r; x <= b.tx + s + r; x++)
        if (G.isFree(x, y)) cands.push({ x, y, d: -(x + y) });
      cands.sort((a, c) => a.d - c.d);
      if (cands.length) spot = cands[0];
    }
    if (!spot) spot = G.nearestFree(b.x, b.y, 10) || { x: b.tx, y: b.ty };
    const u = G.addUnit(type, b.owner, spot.x + 0.5, spot.y + 0.5);
    if (b.rally) {
      const t = b.rally.id ? G.byId.get(b.rally.id) : null;
      if (t && !t.dead) G.cmdSmart([u], t.x, t.y, t);
      else G.cmdMove([u], b.rally.x, b.rally.y);
    }
    if (G.onSpawn) G.onSpawn(u, b);
  }

  function moveAlong(u, dt) {
    if (!u.path.length) return true;
    const wp = u.path[0];
    const dx = wp.x - u.x, dy = wp.y - u.y, d = Math.hypot(dx, dy);
    const step = (u.task.gs && u.task.t === 'move' ? Math.min(u.def.speed, u.task.gs) : u.def.speed) * dt * (G.terrainSpeed || 1)
      * (u.type === 'villager' ? 1 + G.techEff(u.owner, 'vilSpeed') : 1) * (1 + (G.techEff(u.owner, 'unitSpd_' + u.type) || 0)) * (G.speedMul ? G.speedMul(u) : 1);
    steer(u, dx / (d || 1), dy / (d || 1), dt);
    u.walk += dt;
    u.dist = (u.dist || 0) + Math.min(step, d);
    if (d <= step) { u.x = wp.x; u.y = wp.y; u.path.shift(); return u.path.length === 0; }
    u.x += dx / d * step; u.y += dy / d * step;
    return false;
  }

  // Smoothed heading: facing only changes when the new direction holds for a moment,
  // so zig-zags in the path don't make units flip back and forth.
  // 8 screen directions, in the order the 3D sheets are rendered: S SE E NE N NW W SW
  function setDir(u, sx, sy) {
    if (Math.abs(sx) + Math.abs(sy) < 1e-3) return;
    const a = Math.atan2(sx, sy) * 180 / Math.PI;
    if (u.dir !== undefined) {   // hysteresis: stay put until clearly pointing elsewhere
      const diff = Math.abs((((a - u.dir * 45) % 360) + 540) % 360 - 180);
      if (diff < 30) return;
    }
    u.dir = ((Math.round(a / 45) % 8) + 8) % 8;
  }
  function steer(u, nx, ny, dt) {
    const k = Math.min(1, dt * 7);
    u.hx = (u.hx === undefined ? nx : u.hx + (nx - u.hx) * k);
    u.hy = (u.hy === undefined ? ny : u.hy + (ny - u.hy) * k);
    const sx = u.hx - u.hy, sy = (u.hx + u.hy) / 2; // screen-space direction
    if (sx > 0.3) u.face = 1; else if (sx < -0.3) u.face = -1;
    if (sy < -0.22) u.up = true; else if (sy > 0.08) u.up = false;
    setDir(u, sx, sy);
  }
  function faceTo(u, t) { const dx = t.x - u.x, dy = t.y - u.y; if (Math.abs(dx - dy) > 0.01) u.face = (dx - dy) > 0 ? 1 : -1; setDir(u, dx - dy, (dx + dy) / 2); }

  function findNewResource(u, rtype, lx, ly) {
    // the next bush/tree/rock by the last one; skip ones others found unreachable, and look a
    // little wider from where the villager stands before giving up and going idle
    const ok = e => e.kind === 'res' && e.type === rtype && e.amount > 0 && !(e.unreach > 2);
    return nearest({ x: lx, y: ly }, ok, 10) || nearest(u, ok, 14) || nearest({ x: lx, y: ly }, e => e.kind === 'res' && e.type === rtype && e.amount > 0, 10);
  }

  function updateUnit(u, dt) {
    if (u.hitT) u.hitT = Math.max(0, u.hitT - dt);
    if (u.hurtT) u.hurtT = Math.max(0, u.hurtT - dt);
    u.cool -= dt;
    u.repath -= dt;
    u.working = false;
    // Byzantine healing near own TC
    if (u.hp < u.maxHp && mods(u.owner).tcHeal) {
      const tc = nearest(u, e => e.type === 'towncenter' && e.owner === u.owner && e.built, 6);
      if (tc) u.hp = Math.min(u.maxHp, u.hp + dt * 0.8);
    }
    // A Monk tends the nearest wounded man he can reach, as long as he is standing still:
    // he picks one and stays with him until he is whole, rather than flitting between them.
    if (u.def.heal && !u.path.length) {
      let t = u.healing && G.byId.get(u.healing);
      if (!t || t.dead || t.hp >= t.maxHp || G.dist(u, t) > u.def.healRange) {
        t = nearest(u, e => e.kind === 'unit' && e !== u && e.owner === u.owner
          && e.hp < e.maxHp && !e.def.heal, u.def.healRange);
        u.healing = t ? t.id : 0;
      }
      if (t) {
        u.working = true;
        t.hp = Math.min(t.maxHp, t.hp + dt * u.def.heal);
        u.healT = (u.healT || 0) - dt;
        if (u.healT <= 0) { u.healT = 0.5; G.effects.push({ t: 'heal', x: t.x, y: t.y, life: 0.6 }); snd('heal', t.x, t.y); }
      }
    }
    const task = u.task;
    switch (task.t) {
      case 'idle': {
        u.path = [];
        if (u.type !== 'villager' || false) {
          u.scan = (u.scan || 0) - dt;
          if (u.scan <= 0) {
            u.scan = 0.5;
            const st = G.stanceOf(u);
            // passive: never; stand ground: only what is already in reach; otherwise anything in sight
            const reach = st === 'passive' ? 0 : st === 'stand' ? Math.max(1.2, (u.range || 1) + 0.3) : u.def.los;
            const t = reach && nearest(u, e => (e.kind === 'unit' || e.kind === 'building') && G.enemies(e.owner, u.owner), reach);
            if (t) u.task = { t: 'attack', id: t.id, home: { x: u.x, y: u.y } };
          }
        }
        break;
      }
      case 'move': {
        // A soldier on the march fights what comes within reach instead of walking past it
        // while it hits him. He turns on the nearest enemy in a short radius (his own range
        // plus a little, so archers answer archers and a swordsman stops for a man beside
        // him), keeps the destination as home so the leash and the formation still make
        // sense, and carries on when the fight is done. Retreating waves (forced) march on.
        if (u.type !== 'villager' && !u.def.heal && !u.def.siege && u.def.cls !== 'hero' && !task.forced && G.stanceOf(u) !== 'passive') {
          u.scan = (u.scan || 0) - dt;
          if (u.scan <= 0) {
            u.scan = 0.4;
            const reach = Math.max(2.5, (u.range || 1) + 1.5);
            const t = nearest(u, e => e.kind === 'unit' && G.enemies(e.owner, u.owner) && !e.inside, reach);
            if (t) { u.task = { t: 'attack', id: t.id, home: { x: task.x, y: task.y }, resume: { x: task.x, y: task.y, fx: task.fx, fy: task.fy } }; u.path = []; u.pathFor = 0; break; }
          }
        }
        if (!u.path.length) {
          if (Math.hypot(task.x - u.x, task.y - u.y) < 0.6 || task.tries > 2) {
            if (task.fx || task.fy) faceTo(u, { x: u.x + task.fx, y: u.y + task.fy });   // a formation turns to face the way it marched
            u.task = { t: 'idle' }; break;
          }
          if (u.repath <= 0) {
            task.tries = (task.tries || 0) + 1;
            u.path = G.findPath(u.x, u.y, { x0: task.x | 0, y0: task.y | 0, x1: task.x | 0, y1: task.y | 0 }, false, 0, u.owner);
            u.repath = 0.5;
            if (!u.path.length) { u.task = { t: 'idle' }; break; }
          }
        }
        moveAlong(u, dt);
        break;
      }
      case 'guard': {
        // stay by a friendly unit or building and fight anything that comes near it
        const g = G.byId.get(task.id);
        if (!g || g.dead || g.inside) { if (g && g.inside) { u.path = []; break; } u.task = { t: 'idle' }; u.path = []; break; }
        task.scan = (task.scan || 0) - dt;
        if (task.scan <= 0) {
          task.scan = 0.4;
          const reach = g.kind === 'building' ? 4 + (g.size || 1) : 6;
          const foe = nearest(g, e => (e.kind === 'unit' || (e.kind === 'building' && e.def.atk)) && !e.dead && G.enemies(e.owner, u.owner) && (G.revealAll || u.owner !== 1 || (G.net && G.net.on) || G.isVisible(e.x, e.y)), reach);
          if (foe) { u.task = { t: 'attack', id: foe.id, guard: g.id }; u.path = []; u.pathFor = 0; break; }
        }
        const close = g.kind === 'building' ? G.edgeDist(u, g) <= 1.6 : G.dist(u, g) <= 1.8;
        if (!close) {
          if (!u.path.length || u.repath <= 0) { if (g.kind === 'unit') { const off = ((u.id % 6) / 6) * 6.283; u.path = G.findPath(u.x, u.y, { x0: (g.x + Math.cos(off)) | 0, y0: (g.y + Math.sin(off)) | 0, x1: (g.x + Math.cos(off)) | 0, y1: (g.y + Math.sin(off)) | 0 }, false, 0, u.owner); u.pathFor = g.id; u.repath = 0.8; } else pathTo(u, g, true); }
          moveAlong(u, dt);
        } else u.path = [];
        break;
      }
      case 'attack': {
        let t = G.byId.get(task.id);
        // the target ran inside: attack the building that shelters it
        if (t && t.inside) { const b = G.byId.get(t.inside); if (b && !b.dead && G.enemies(b.owner, u.owner)) { task.id = b.id; t = b; } else t = null; }
        if (!t || t.dead) {
          // look for another enemy nearby
          // (a man who stopped on the march only takes on units, not buildings, before resuming)
          const n = (u.type === 'villager' || u.def.heal) ? null : nearest(u, e => (e.kind === 'unit' || (e.kind === 'building' && !task.resume)) && G.enemies(e.owner, u.owner), u.def.los);
          const ward = task.guard && G.byId.get(task.guard);
          if (ward && !ward.dead) u.task = { t: 'guard', id: ward.id };   // back to guard duty
          else if (n) u.task = { t: 'attack', id: n.id, home: task.home, resume: task.resume };
          else if (task.resume) { const r = task.resume; u.task = { t: 'move', x: r.x, y: r.y, fx: r.fx, fy: r.fy }; }   // back on the march
          else u.task = { t: 'idle' };
          u.path = [];
          break;
        }
        // a guard doesn't chase far from what it protects
        if (task.guard) { const ward = G.byId.get(task.guard); if (ward && !ward.dead && G.dist(t, ward) > 10) { u.task = { t: 'guard', id: ward.id }; u.path = []; break; } }
        // leash for auto-acquired targets
        if (task.home && !task.forced) {
          const st = G.stanceOf(u);
          // stand ground: never step off the spot; a target out of reach is let go
          if ((st === 'stand' || st === 'passive') && G.edgeDist(u, t) > (u.range || 1) + 0.4) { u.task = { t: 'idle' }; u.path = []; break; }
          if (Math.hypot(u.x - task.home.x, u.y - task.home.y) > LEASH[st]) { G.cmdMove([u], task.home.x, task.home.y); break; }
        }
        const d = G.edgeDist(u, t);
        if (d <= u.range + (t.kind === 'unit' ? 0.25 : 0.3)) {
          u.path = []; faceTo(u, t); u.working = true;
          if (u.cool <= 0) { fire(u, t); u.cool = u.def.rate; u.atkAnim = 0.25; }
        } else {
          if (u.pathFor !== t.id || u.repath <= 0 || !u.path.length) pathTo(u, t, true);
          moveAlong(u, dt);
          // standing beside it but a hair out of reach (the path ends on the next tile): close the gap directly
          if (!u.path.length && d < u.range + 1.6) {
            const cx = t.kind === 'building' ? Math.max(t.tx, Math.min(t.tx + t.size, u.x)) : t.x, cy = t.kind === 'building' ? Math.max(t.ty, Math.min(t.ty + t.size, u.y)) : t.y;
            const dx = cx - u.x, dy = cy - u.y, l = Math.hypot(dx, dy) || 1, st = u.def.speed * dt * (G.speedMul ? G.speedMul(u) : 1);
            const nx = u.x + dx / l * st, ny = u.y + dy / l * st;
            if (G.freeFor(nx | 0, ny | 0, u.owner) || (t.kind === 'building' && G.block[G.idx(nx | 0, ny | 0)] === t.id)) { u.x = nx; u.y = ny; }
          }
          // the way is shut by an enemy wall (Fortress maps, or walls they built): break through it
          if (!u.path.length && d > u.range + 1.5 && !t.def.wall) {
            const w = nearest(u, e => e.kind === 'building' && e.def.wall && G.enemies(e.owner, u.owner), 2.5);
            if (w) { u.task = { t: 'attack', id: w.id, forced: true }; u.path = []; }
          }
        }
        break;
      }
      case 'gather': {
        if (u.carry && u.carry.amt >= G.carryCap(u)) { goDrop(u); break; }
        let r = G.byId.get(task.id);
        if (!r || r.dead || r.amount <= 0) {
          r = findNewResource(u, task.rtype, task.lx, task.ly);
          if (!r) { if (u.carry && u.carry.amt > 0) goDrop(u); else u.task = { t: 'idle' }; break; }
          task.id = r.id; u.path = []; u.pathFor = 0;
        }
        task.lx = r.x; task.ly = r.y;
        if (G.edgeDist(u, r) <= 0.75) {
          u.path = []; faceTo(u, r); u.working = true;
          // step right up to the rock, tree or bush, so the swing lands on it instead of on
          // the air a pace away (a worker on a diagonal neighbour stands well clear of it)
          const ed = G.edgeDist(u, r);
          if (ed > 0.3) {
            const cx = Math.max(r.tx, Math.min(r.tx + 1, u.x)), cy = Math.max(r.ty, Math.min(r.ty + 1, u.y));
            const k = Math.min(1, dt * 2.5 * (ed - 0.3) / ed);
            u.x += (cx - u.x) * k; u.y += (cy - u.y) * k;
          }
          workSnd(u, { tree: 'chop', gold: 'mine', stone: 'mine', berry: 'farm' }[r.rtype] || 'chop');
          if (u.carry && u.carry.res !== r.rtype) u.carry = null;
          if (!u.carry) u.carry = { res: r.rtype, amt: 0 };
          let rate = G.RES[r.type].rate * (G.fastGather || 1);
          if (r.type === 'berry' && mods(u.owner).berryRate) rate *= mods(u.owner).berryRate;
          rate *= 1 + G.techEff(u.owner, 'gather_' + G.RES[r.type].res);
          const amt = Math.min(rate * dt, r.amount);
          u.carry.amt += amt; r.amount -= amt;
          if (r.amount <= 0.001) G.kill(r);
        } else {
          if (u.pathFor !== r.id || !u.path.length) {
            if (u.repath <= 0 || u.pathFor !== r.id) pathTo(u, r, true);
          }
          const px = u.x, py = u.y, arrived = moveAlong(u, dt);
          if (Math.hypot(u.x - px, u.y - py) < 0.002) task.still = (task.still || 0) + dt; else task.still = 0;
          if (task.still > 3) {   // standing still, not working: give up on this one
            task.still = 0; r.unreach = (r.unreach || 0) + 3;
            const alt = findNewResource(u, task.rtype, u.x, u.y);
            if (alt && alt !== r) { task.id = alt.id; u.path = []; u.pathFor = 0; }
            else if (u.carry && u.carry.amt > 0) goDrop(u); else { u.task = { t: 'idle' }; u.path = []; }
            break;
          }
          if (arrived && G.edgeDist(u, r) > 0.75) {
            // reached the end of path but not adjacent: resource probably unreachable, try another
            u.stuck = (u.stuck || 0) + 1;
            if (u.stuck > 3) { u.stuck = 0; r.unreach = (r.unreach || 0) + 1; const alt = nearest(u, e => e.kind === 'res' && e.type === r.type && e !== r && e.amount > 0 && !(e.unreach > 2), 14); if (alt) { task.id = alt.id; u.path = []; u.pathFor = 0; } }
            u.repath = 0;
          }
        }
        break;
      }
      case 'farm': {
        const f = G.byId.get(task.id);
        if (!f || f.dead) { u.atFarm = false; if (u.carry && u.carry.amt > 0) goDrop(u); else u.task = { t: 'idle' }; break; }
        if (!f.built) { u.task = { t: 'build', id: f.id, then: 'farm' }; break; }
        if (f.farmer && f.farmer !== u.id) {
          const o = G.byId.get(f.farmer);
          if (o && !o.dead && o.task.t === 'farm' && o.task.id === f.id) {
            // someone got here first: take the nearest free plot rather than standing idle
            const alt = G.freeFarmNear(u.x, u.y, u.owner, u);
            u.task = alt ? { t: 'farm', id: alt.id } : { t: 'idle' };
            u.path = []; u.pathFor = 0;
            break;
          }
        }
        f.farmer = u.id;
        if (u.carry && u.carry.amt >= G.carryCap(u)) { u.atFarm = false; goDrop(u); break; }
        const inside = u.x >= f.tx && u.x <= f.tx + f.size && u.y >= f.ty && u.y <= f.ty + f.size;
        if (inside) {
          u.atFarm = true; u.path = []; u.working = true;
          // wander slightly over the field
          u.fw = (u.fw || 0) + dt;
          const sp = (f.size - 1) * 0.5;   // over the whole field, rows to rows
          const tx = f.tx + 0.5 + (Math.sin(u.fw * 0.5) + 1) * sp, ty = f.ty + 0.5 + (Math.cos(u.fw * 0.37) + 1) * sp;
          u.x += (tx - u.x) * dt; u.y += (ty - u.y) * dt;
          if (!u.carry || u.carry.res !== 'food') u.carry = { res: 'food', amt: 0 };
          const amt = Math.min(G.FARM_RATE * dt * (G.fastGather || 1) * (1 + G.techEff(u.owner, 'gather_food')), f.food);
          u.carry.amt += amt; f.food -= amt;
          if (f.food <= 0) {
            // The field is spent, not destroyed. Sow it again for a fraction of a new farm
            // and keep working; with no wood it lies fallow until someone comes back to it.
            f.food = 0;
            if ((G.players[u.owner] && G.players[u.owner].noReseed) || !G.resowFarm(f, u.owner)) {
              f.fallow = true;
              u.atFarm = false;
              if (u.carry && u.carry.amt > 0) goDrop(u); else u.task = { t: 'idle' };
            }
          }
        } else {
          u.atFarm = false;
          if (u.pathFor !== f.id || !u.path.length) {
            if (u.repath <= 0 || u.pathFor !== f.id) { u.path = G.findPath(u.x, u.y, rectOf(f), false, 0, u.owner); u.pathFor = f.id; u.repath = 1; }
          }
          moveAlong(u, dt);
        }
        break;
      }
      case 'garrison': {
        const b = G.byId.get(task.id);
        if (!b || b.dead || !b.built || (b.garrison || []).length >= b.def.garrison) { u.task = { t: 'idle' }; break; }
        if (G.edgeDist(u, b) <= 0.8) {
          if (u.carry) { G.players[u.owner].res[u.carry.res] += Math.round(u.carry.amt); G.players[u.owner].gathered[u.carry.res] += Math.round(u.carry.amt); u.carry = null; }
          (b.garrison = b.garrison || []).push(u); u.inside = b.id; u.entering = true; u.path = [];
        } else {
          if (u.pathFor !== b.id || !u.path.length) { if (u.repath <= 0 || u.pathFor !== b.id) pathTo(u, b, true); }
          moveAlong(u, dt);
        }
        break;
      }
      case 'return': {
        let b = G.byId.get(task.id);
        if (!b || b.dead || !b.built) { b = u.carry ? dropSiteFor(u, u.carry.res) : null; if (!b) { u.task = task.back || { t: 'idle' }; break; } task.id = b.id; }
        if (G.edgeDist(u, b) <= 0.8) {
          if (u.carry) { G.players[u.owner].res[u.carry.res] += Math.round(u.carry.amt); G.players[u.owner].gathered[u.carry.res] += Math.round(u.carry.amt); if (G.onDeposit) G.onDeposit(u, u.carry); u.carry = null; }
          u.path = []; u.pathFor = 0;
          u.task = task.back || { t: 'idle' };
        } else {
          if (u.pathFor !== b.id || !u.path.length) { if (u.repath <= 0 || u.pathFor !== b.id) pathTo(u, b, true); }
          // can't reach this drop site: try another, else go idle so the idle button finds him
          const px = u.x, py = u.y;
          moveAlong(u, dt);
          if (Math.hypot(u.x - px, u.y - py) < 0.002) task.still = (task.still || 0) + dt; else task.still = 0;
          if (task.still > 3) {
            task.still = 0; task.tried = task.tried || []; task.tried.push(b.id);
            const alt = nearest(u, e => e.kind === 'building' && e.owner === u.owner && e.built && e.def.drop && e.def.drop.includes(u.carry ? u.carry.res : '') && !task.tried.includes(e.id));
            if (alt && task.tried.length < 4) { task.id = alt.id; u.path = []; u.pathFor = 0; }
            else { u.task = { t: 'idle' }; u.path = []; }
          }
        }
        break;
      }
      case 'build': {
        const b = G.byId.get(task.id);
        if (!b || b.dead) { u.task = { t: 'idle' }; break; }
        if (b.built && b.hp >= b.maxHp) { afterBuild(u, b); break; }
        if (G.edgeDist(u, b) <= 0.8 || (b.type === 'farm' && u.x >= b.tx && u.x <= b.tx + b.size && u.y >= b.ty && u.y <= b.ty + b.size)) {
          u.path = []; faceTo(u, b); u.working = true;
          workSnd(u, 'build');
          if (!b.built && b.type === 'infirmary' && G.enemySoldierNear(b.owner, b.x, b.y, 12)) { if (b.owner === 1 && G.ui && !(b.warnT > G.time)) { b.warnT = G.time + 8; G.ui.alert('Infirmary: work stops while enemies are near'); } break; }
          if (!b.built) {
            const inc = dt / b.def.time * (G.fastBuild || 1) * (1 + G.techEff(u.owner, 'build'));
            b.progress = Math.min(1, b.progress + inc);
            b.hp = Math.min(b.maxHp, b.hp + inc * b.maxHp);
            if (b.progress >= 1) { b.built = true; b.hp = Math.max(b.hp, b.maxHp * 0.999); snd('complete', b.x, b.y); if (G.onBuilt) G.onBuilt(b); }
          } else {
            if (!(G.noRepair && G.noRepair(b))) b.hp = Math.min(b.maxHp, b.hp + dt * b.maxHp / b.def.time * 0.5); // repair (not under the enemy's nose in Capture)
          }
        } else {
          if (u.pathFor !== b.id || !u.path.length) {
            if (u.repath <= 0 || u.pathFor !== b.id) {
              if (b.type === 'farm') { u.path = G.findPath(u.x, u.y, rectOf(b), false, 0, u.owner); u.pathFor = b.id; u.repath = 1; }
              else pathTo(u, b, true);
            }
          }
          moveAlong(u, dt);
        }
        break;
      }
    }
  }

  function goDrop(u) {
    const b = dropSiteFor(u, u.carry.res);
    if (!b) { u.task = { t: 'idle' }; return; }
    const back = u.task.t === 'return' ? u.task.back : u.task;
    u.task = { t: 'return', id: b.id, back }; u.path = []; u.pathFor = 0;
  }

  function afterBuild(u, b) {
    // a wall is built piece by piece: move on to the next unbuilt piece nearby
    if (b.def.wall) { const nx = nearest(u, e => e.kind === 'building' && e.owner === u.owner && e.def.wall && !e.built && !e.dead, 10); if (nx) { G.cmdBuild([u], nx); return; } }
    const map = { lumbercamp: 'tree', miningcamp: 'gold', mill: 'berry' };
    if (b.type === 'farm') { G.cmdFarm([u], b); return; }
    if (map[b.type]) {
      const r = nearest(b, e => e.kind === 'res' && e.type === map[b.type] && e.amount > 0, 8);
      if (r) { G.cmdGather([u], r); return; }
    }
    // help another nearby foundation
    const f = nearest(u, e => e.kind === 'building' && e.owner === u.owner && !e.built, 10);
    if (f) { G.cmdBuild([u], f); return; }
    u.task = { t: 'idle' };
  }
})();
