// Entities, economy, unit behaviour and combat.
(function () {
  let nextId = 1;
  const snd = (k, x, y) => G.sound && G.sound.play(k, x, y);
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
    if (m.startFoodDelta) res.food += m.startFoodDelta;
    return { id, civ, age: 1, up: {}, techs: {}, team: opts.team || 0, ai: opts.ai || null, res, gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, killed: 0, lost: 0, alive: true };
  };

  // ---------- Ages ----------
  G.ageOf = p => (G.players[p] && G.players[p].age) || 1;
  G.canBuildType = (p, type) => G.ageOf(p) >= (G.BUILD_AGE[type] || 1);
  G.canTrainType = (p, type) => G.ageOf(p) >= (G.UNIT_AGE[type] || 1);
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
      : `Needs ${want} of: ${next.needs.map(t => G.BUILDINGS[t].name).join(', ')}`;
    if (tc && tc.queue.length) return 'Town Center busy';
    return null;
  };
  G.advanceAge = function (tc) {
    const p = tc.owner, next = G.AGES[G.ageOf(p) + 1];
    if (!next || G.ageBlock(p, tc)) return false;
    if (!G.pay(p, next.cost)) return 'res';
    tc.aging = { t: 0, to: G.ageOf(p) + 1, cost: next.cost };
    return true;
  };
  G.cancelAge = function (tc) { if (tc.aging) { G.refund(tc.owner, tc.aging.cost); tc.aging = null; } };
  function finishAge(tc) {
    const p = G.players[tc.owner], to = tc.aging.to; tc.aging = null; p.age = to;
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
    for (const id in t) if (t[id] && G.TECHS[id]) for (const k in G.TECHS[id].eff) b[k] += G.TECHS[id].eff[k];
    return b;
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
    if (b.type === 'blacksmith') for (const id in G.TECHS) {
      const t = G.TECHS[id]; if (pl.techs[id] || (t.req && !pl.techs[t.req])) continue;
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
      pl.techs[r.id] = true;
      const tb = G.techBonus(b.owner);
      for (const e of G.ents) if (!e.dead && e.owner === b.owner && e.kind === 'unit' && e.def.ranged) e.range = e.def.range + tb.range + ((e.type === 'archer' || e.type === 'longbowman') && mods(b.owner).archerRange ? mods(b.owner).archerRange : 0);
      if (G.onResearched) G.onResearched(b.owner, G.TECHS[r.id].name);
    }
  }

  G.unitCost = function (p, type) {
    const m = mods(p), base = G.UNITS[type].cost, c = {};
    let f = 1;
    if (type === 'archer' && m.archerCost) f = m.archerCost;
    if (type === 'spearman' && m.spearCost) f = m.spearCost;
    if (type === 'villager' && m.vilCost) f = m.vilCost;
    for (const k in base) c[k] = Math.round(base[k] * f);
    return c;
  };
  G.buildCost = (p, type) => ({ ...G.BUILDINGS[type].cost });
  G.canAfford = (p, cost) => Object.keys(cost).every(k => G.players[p].res[k] >= cost[k]);
  G.pay = function (p, cost) { if (!G.canAfford(p, cost)) return false; for (const k in cost) G.players[p].res[k] -= cost[k]; return true; };
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
    e.maxHp = hp; e.hp = built ? hp : 1; e.built = !!built; e.progress = built ? 1 : 0;
    e.queue = []; e.qt = 0; e.cool = 0; e.rally = null;
    if (type === 'farm') { e.food = Math.round(def.farm * (mods(owner).farmFood || 1)); e.farmer = 0; }
    if (type !== 'farm') G.setBlock(e, e.id);
    return e;
  };

  G.addUnit = function (type, owner, x, y) {
    const def = G.unitDef(owner, type);
    const e = base('unit', type, owner, def);
    e.x = x; e.y = y;
    let hp = def.hp; if (type === 'knight' && mods(owner).knightHp) hp = Math.round(hp * mods(owner).knightHp);
    e.hp = e.maxHp = hp;
    if (type === 'villager') e.sex = Math.random() < 0.5 ? 'f' : 'm';
    if (type === 'queen') e.sex = 'f';
    e.task = { t: 'idle' }; e.path = []; e.cool = 0; e.carry = null; e.face = 1; e.walk = 0; e.repath = 0;
    e.range = def.range + (def.ranged ? G.techBonus(owner).range : 0) + ((type === 'archer' || type === 'longbowman') && mods(owner).archerRange ? mods(owner).archerRange : 0);
    return e;
  };

  // ---- Garrison (AoE2-style): villagers shelter in their Town Center, each one adds an arrow ----
  G.GARRISON_MAX = 15;
  // Villagers shelter anywhere that takes a garrison; a Castle takes soldiers too,
  // and every unit inside adds an arrow to what the building shoots.
  G.canGarrison = (u, b) => b && !b.dead && b.built && b.def.garrison && b.owner === u.owner
    && (u.type === 'villager' || b.type === 'castle')
    && (b.garrison || []).length + (b.incoming || 0) < b.def.garrison;
  G.garrisonTo = function (u, b) { if (G.canGarrison(u, b)) { u.task = { t: 'garrison', id: b.id }; u.path = []; u.pathFor = 0; } };
  G.ringBell = function (owner) {
    if (owner === 1) snd('bell');
    for (const u of G.ents) if (!u.dead && u.owner === owner && u.type === 'villager') {
      const tc = nearest(u, e => e.type === 'towncenter' && G.canGarrison(u, e));
      if (tc) G.garrisonTo(u, tc);
    }
  };
  G.ungarrison = function (b) {
    const list = b.garrison || []; b.garrison = [];
    for (const u of list) {
      const spot = G.nearestFree(b.x + 1.5, b.y + 1.5, 10) || { x: b.tx, y: b.ty };
      u.x = spot.x + 0.5 + (Math.random() - 0.5) * 0.4; u.y = spot.y + 0.5 + (Math.random() - 0.5) * 0.4;
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
      if (e.owner > 0) G.players[e.owner].lost++;
    }
    G.byId.delete(e.id);
    snd(e.kind === 'building' ? 'buildingdown' : e.type === 'king' ? 'kingdown' : 'die', e.x, e.y);
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
  G.cmdMove = function (units, x, y) {
    units = units.filter(u => u.kind === 'unit');
    const n = units.length; if (!n) return;
    let cx = 0, cy = 0; for (const u of units) { cx += u.x; cy += u.y; } cx /= n; cy /= n;
    let fx = x - cx, fy = y - cy; const fl = Math.hypot(fx, fy) || 1; fx /= fl; fy /= fl;   // forward
    const rx = -fy, ry = fx;                                                              // right
    const sorted = units.slice().sort((a, b) => (RANK[a.def.cls] || 0) - (RANK[b.def.cls] || 0) || a.id - b.id);
    const cols = n <= 3 ? n : Math.max(3, Math.ceil(Math.sqrt(n * 2)));
    const rows = Math.ceil(n / cols), gap = 0.85;
    const military = units.some(u => u.type !== 'villager') && n > 1;
    const gs = military ? Math.min(...units.map(u => u.def.speed)) : 0;
    sorted.forEach((u, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), col = i % cols;
      const ox = (col - (inRow - 1) / 2) * gap, oy = -(row - (rows - 1) / 2) * gap;   // row 0 at the front
      let tx = x + rx * ox + fx * oy, ty = y + ry * ox + fy * oy;
      const f = G.nearestFree(tx, ty, 6) || { x: x | 0, y: y | 0 };
      if (!G.isFree(tx | 0, ty | 0)) { tx = f.x + 0.5; ty = f.y + 0.5; }
      u.task = { t: 'move', x: tx, y: ty, gs };
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
  G.farmFull = owner => Math.round(G.BUILDINGS.farm.farm * (mods(owner).farmFood || 1));
  G.farmSpent = f => !!f && !f.dead && f.type === 'farm' && f.built && f.food <= 0;
  G.resowCost = owner => ({ wood: Math.round(G.BUILDINGS.farm.reseed * (mods(owner).farmCost || 1)) });
  G.resowFarm = function (f, owner) {
    if (!G.farmSpent(f) || f.owner !== owner) return false;
    if (!G.pay(owner, G.resowCost(owner))) return false;
    f.food = G.farmFull(owner);
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
        G.cmdGather(vils, t); G.cmdMove(units.filter(u => u.type !== 'villager'), x, y);
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
            return f === t ? 'gather' : 'gather-moved';
          }
          if (!t.built || t.hp < t.maxHp) { G.cmdBuild(vils, t); return 'build'; }
          if (t.def.drop) { G.cmdDeposit(vils, t); return 'move'; }
        }
      }
    }
    G.cmdMove(units, x, y);
    return 'move';
  };

  G.placeBuilding = function (owner, type, tx, ty, builders) {
    const def = G.BUILDINGS[type];
    if (!G.canBuildType(owner, type)) return null;
    if (!G.areaFree(tx, ty, def.size)) return null;
    // keep units from being trapped: no own units standing in footprint is fine, they get pushed out
    const cost = G.buildCost(owner, type);
    if (!G.pay(owner, cost)) return null;
    const b = G.addBuilding(type, owner, tx, ty, false);
    b.cost = cost;
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

  // ---------- Damage ----------
  function damage(att, t) {
    const d = att.def;
    let dmg;
    if (t.kind === 'building') {
      // an arrow does nothing to a wall, but a ram or a trebuchet lands its whole blow
      dmg = d.siege ? d.atk : d.ranged ? 1 : Math.max(1, d.atk - 1);
      if (d.bonus && d.bonus.bld) dmg += d.bonus.bld;
      if (att.kind === 'building') dmg = 1;
    } else {
      const soldier = att.kind === 'unit' && att.type !== 'villager';
      const tbA = soldier ? G.techBonus(att.owner) : null;
      const aa = soldier ? (G.ageOf(att.owner) >= 3 ? 1 : 0) + (G.ageOf(att.owner) >= 4 ? 1 : 0) + (d.ranged ? tbA.ranged : tbA.melee) : 0;
      const tSold = t.kind === 'unit' && t.type !== 'villager', tbT = tSold ? G.techBonus(t.owner) : null;
      const ta = tSold ? (G.ageOf(t.owner) >= 4 ? 1 : 0) + (d.ranged || att.kind === 'building' ? tbT.pierce : tbT.armor) : 0;
      const arm = (d.ranged || att.kind === 'building' ? t.def.pierce : t.def.armor) + ta;
      dmg = Math.max(1, d.atk + aa - arm);
      if (d.bonus && d.bonus[t.def.cls]) dmg += d.bonus[t.def.cls];
    }
    return dmg;
  }
  function hit(att, t, dmg) {
    if (t.dead) return;
    t.hp -= dmg; t.hitT = 0.2; if (t.kind === 'unit') t.hurtT = 0.6;
    if (t.hp <= 0) { if (att.owner > 0) G.players[att.owner].killed++; G.kill(t); return; }
    // Retaliate / alert
    if (t.kind === 'unit' && t.task.t !== 'attack' && G.enemies(att.owner, t.owner)) {
      if (t.type !== 'villager' && !t.def.heal) t.task = { t: 'attack', id: att.id };
      else if (att.kind === 'unit' && att.def.cls !== 'cav' && t.hp < t.maxHp * 0.4) {
        // flee toward town center
        const tc = nearest(t, e => e.type === 'towncenter' && e.owner === t.owner && e.built);
        if (tc) { t.task = { t: 'move', x: tc.x, y: tc.y + tc.size / 2 + 0.6 }; t.path = G.findPath(t.x, t.y, rectOf(tc), true, tc.id, t.owner); }
      }
    }
    const W = { militia: 'sword', king: 'sword', spearman: 'spear', knight: 'sword', scout: 'spear',
      cataphract: 'sword', archer: 'bow', longbowman: 'bow', repeater: 'bolt', axethrower: 'axethrow',
      ram: 'ram', trebuchet: 'stonehit' };
    snd(W[att.type] || (att.kind === 'building' ? 'bow' : 'sword'), t.x, t.y);
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
    } else hit(att, t, dmg);
  }

  // ---------- Per-frame update ----------
  const SEP = 0.42;
  G.updateEntities = function (dt) {
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
        const speed = (b.type === 'towncenter' && mods(b.owner).tcSpeed) ? mods(b.owner).tcSpeed : 1;
        const { pop, cap } = G.popOf(b.owner);
        const blocked = pop - b.queue.length + 1 > cap; // housed
        if (!blocked) b.qt += dt * speed * (G.fastTrain || 1);
        b.housed = blocked;
        if (b.qt >= def.time) {
          b.qt = 0; b.queue.shift(); if (b.owner === 1) snd('train');
          spawn(b, q.type);
        }
      } else b.housed = false;
      if (b.def.atk) {
        b.cool -= dt;
        if (b.cool <= 0) {
          const t = nearest(b, e => e.kind === 'unit' && G.enemies(e.owner, b.owner), b.def.range);
          if (t) { const n = 1 + (b.garrison ? b.garrison.length : 0); for (let i = 0; i < n; i++) fire(b, t); b.cool = b.def.rate; }
        }
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
    const step = (u.task.gs && u.task.t === 'move' ? Math.min(u.def.speed, u.task.gs) : u.def.speed) * dt * (G.terrainSpeed || 1);
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
    const p = { x: lx, y: ly };
    return nearest(p, e => e.kind === 'res' && e.type === rtype && e.amount > 0, 10);
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
            const t = nearest(u, e => (e.kind === 'unit' || e.kind === 'building') && G.enemies(e.owner, u.owner), u.def.los);
            if (t) u.task = { t: 'attack', id: t.id, home: { x: u.x, y: u.y } };
          }
        }
        break;
      }
      case 'move': {
        if (!u.path.length) {
          if (Math.hypot(task.x - u.x, task.y - u.y) < 0.6 || task.tries > 2) { u.task = { t: 'idle' }; break; }
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
      case 'attack': {
        const t = G.byId.get(task.id);
        if (!t || t.dead) {
          // look for another enemy nearby
          const n = (u.type === 'villager' || u.def.heal) ? null : nearest(u, e => (e.kind === 'unit' || e.kind === 'building') && G.enemies(e.owner, u.owner), u.def.los);
          if (n) u.task = { t: 'attack', id: n.id, home: task.home }; else u.task = { t: 'idle' };
          u.path = [];
          break;
        }
        // leash for auto-acquired targets
        if (task.home && !task.forced && Math.hypot(u.x - task.home.x, u.y - task.home.y) > 9) {
          G.cmdMove([u], task.home.x, task.home.y); break;
        }
        const d = G.edgeDist(u, t);
        if (d <= u.range + (t.kind === 'unit' ? 0.25 : 0.3)) {
          u.path = []; faceTo(u, t); u.working = true;
          if (u.cool <= 0) { fire(u, t); u.cool = u.def.rate; u.atkAnim = 0.25; }
        } else {
          if (u.pathFor !== t.id || u.repath <= 0 || !u.path.length) pathTo(u, t, true);
          moveAlong(u, dt);
        }
        break;
      }
      case 'gather': {
        if (u.carry && u.carry.amt >= G.CARRY) { goDrop(u); break; }
        let r = G.byId.get(task.id);
        if (!r || r.dead || r.amount <= 0) {
          r = findNewResource(u, task.rtype, task.lx, task.ly);
          if (!r) { if (u.carry && u.carry.amt > 0) goDrop(u); else u.task = { t: 'idle' }; break; }
          task.id = r.id; u.path = []; u.pathFor = 0;
        }
        task.lx = r.x; task.ly = r.y;
        if (G.edgeDist(u, r) <= 0.75) {
          u.path = []; faceTo(u, r); u.working = true;
          snd({ tree: 'chop', gold: 'mine', stone: 'mine', berry: 'farm' }[r.rtype] || 'chop', u.x, u.y);
          if (u.carry && u.carry.res !== r.rtype) u.carry = null;
          if (!u.carry) u.carry = { res: r.rtype, amt: 0 };
          let rate = G.RES[r.type].rate * (G.fastGather || 1);
          if (r.type === 'berry' && mods(u.owner).berryRate) rate *= mods(u.owner).berryRate;
          const amt = Math.min(rate * dt, r.amount);
          u.carry.amt += amt; r.amount -= amt;
          if (r.amount <= 0.001) G.kill(r);
        } else {
          if (u.pathFor !== r.id || !u.path.length) {
            if (u.repath <= 0 || u.pathFor !== r.id) pathTo(u, r, true);
          }
          if (moveAlong(u, dt) && G.edgeDist(u, r) > 0.75) {
            // reached the end of path but not adjacent: resource probably unreachable, try another
            u.stuck = (u.stuck || 0) + 1;
            if (u.stuck > 3) { u.stuck = 0; r.unreach = (r.unreach || 0) + 1; const alt = nearest(u, e => e.kind === 'res' && e.type === r.type && e !== r && e.amount > 0, 10); if (alt) task.id = alt.id; }
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
        if (u.carry && u.carry.amt >= G.CARRY) { u.atFarm = false; goDrop(u); break; }
        const inside = u.x >= f.tx && u.x <= f.tx + f.size && u.y >= f.ty && u.y <= f.ty + f.size;
        if (inside) {
          u.atFarm = true; u.path = []; u.working = true;
          // wander slightly over the field
          u.fw = (u.fw || 0) + dt;
          const tx = f.tx + 0.5 + (Math.sin(u.fw * 0.5) + 1) * 0.5, ty = f.ty + 0.5 + (Math.cos(u.fw * 0.37) + 1) * 0.5;
          u.x += (tx - u.x) * dt; u.y += (ty - u.y) * dt;
          if (!u.carry || u.carry.res !== 'food') u.carry = { res: 'food', amt: 0 };
          const amt = Math.min(G.FARM_RATE * dt * (G.fastGather || 1), f.food);
          u.carry.amt += amt; f.food -= amt;
          if (f.food <= 0) {
            // The field is spent, not destroyed. Sow it again for a fraction of a new farm
            // and keep working; with no wood it lies fallow until someone comes back to it.
            f.food = 0;
            if (!G.resowFarm(f, u.owner)) {
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
          moveAlong(u, dt);
        }
        break;
      }
      case 'build': {
        const b = G.byId.get(task.id);
        if (!b || b.dead) { u.task = { t: 'idle' }; break; }
        if (b.built && b.hp >= b.maxHp) { afterBuild(u, b); break; }
        if (G.edgeDist(u, b) <= 0.8 || (b.type === 'farm' && u.x >= b.tx && u.x <= b.tx + b.size && u.y >= b.ty && u.y <= b.ty + b.size)) {
          u.path = []; faceTo(u, b); u.working = true;
          snd('build', u.x, u.y);
          if (!b.built) {
            const inc = dt / b.def.time * (G.fastBuild || 1);
            b.progress = Math.min(1, b.progress + inc);
            b.hp = Math.min(b.maxHp, b.hp + inc * b.maxHp);
            if (b.progress >= 1) { b.built = true; b.hp = Math.max(b.hp, b.maxHp * 0.999); snd('complete', b.x, b.y); if (G.onBuilt) G.onBuilt(b); }
          } else {
            b.hp = Math.min(b.maxHp, b.hp + dt * b.maxHp / b.def.time * 0.5); // repair
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
