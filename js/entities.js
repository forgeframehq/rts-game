// Entities, economy, unit behaviour and combat.
(function () {
  let nextId = 1;
  G.ents = [];
  G.byId = new Map();
  G.projs = [];
  G.effects = [];

  const mods = p => G.CIVS[G.players[p].civ].mods;

  // ---------- Players & costs ----------
  G.makePlayer = function (id, civ) {
    const m = G.CIVS[civ].mods;
    const res = { ...G.START_RES };
    if (m.startFoodDelta) res.food += m.startFoodDelta;
    return { id, civ, res, gathered: { food: 0, wood: 0, gold: 0, stone: 0 }, killed: 0, lost: 0, alive: true };
  };

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
      if (e.kind === 'unit') pop++;
      else if (e.kind === 'building') {
        pop += e.queue ? e.queue.length : 0;
        if (e.built && e.def.pop) cap += (e.type === 'house' && mods(p).housePop) ? mods(p).housePop : e.def.pop;
      }
    }
    return { pop, cap: Math.min(200, cap) };
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
    const def = G.UNITS[type];
    const e = base('unit', type, owner, def);
    e.x = x; e.y = y;
    let hp = def.hp; if (type === 'knight' && mods(owner).knightHp) hp = Math.round(hp * mods(owner).knightHp);
    e.hp = e.maxHp = hp;
    e.task = { t: 'idle' }; e.path = []; e.cool = 0; e.carry = null; e.face = 1; e.walk = 0; e.repath = 0;
    e.range = def.range + (type === 'archer' && mods(owner).archerRange ? mods(owner).archerRange : 0);
    return e;
  };

  G.kill = function (e) {
    if (e.dead) return;
    e.dead = true;
    if (e.kind !== 'unit' && e.type !== 'farm') G.setBlock(e, 0);
    if (e.kind === 'building' && e.queue) for (const q of e.queue) G.refund(e.owner, q.cost);
    if (e.kind === 'res' && e.type === 'tree' && G.decals) G.decals.push({ x: e.x, y: e.y, life: 150 });
    if (e.kind !== 'res') {
      G.effects.push({ t: 'die', x: e.x, y: e.y, life: 0.8, big: e.kind === 'building', size: e.size || 1 });
      if (e.owner > 0) G.players[e.owner].lost++;
    }
    G.byId.delete(e.id);
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
  G.enemies = (a, b) => a > 0 && b > 0 && a !== b;

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
      u.path = G.findPath(u.x, u.y, { x0: tx, y0: ty, x1: tx, y1: ty }, false, 0);
    } else {
      u.path = G.findPath(u.x, u.y, rectOf(t), adjacent, t.type === 'farm' ? 0 : t.id);
    }
    u.pathFor = t.id; u.repath = 1.2;
  }

  // ---------- Commands ----------
  G.cmdMove = function (units, x, y) {
    const n = units.length, cols = Math.ceil(Math.sqrt(n));
    units.forEach((u, i) => {
      if (u.kind !== 'unit') return;
      const ox = (i % cols) - (cols - 1) / 2, oy = Math.floor(i / cols) - (cols - 1) / 2;
      let tx = x + ox * 0.9, ty = y + oy * 0.9;
      const f = G.nearestFree(tx, ty, 6) || { x: x | 0, y: y | 0 };
      if (!G.isFree(tx | 0, ty | 0)) { tx = f.x + 0.5; ty = f.y + 0.5; }
      u.task = { t: 'move', x: tx, y: ty };
      u.path = G.findPath(u.x, u.y, { x0: tx | 0, y0: ty | 0, x1: tx | 0, y1: ty | 0 }, false, 0);
      if (u.path.length) u.path[u.path.length - 1] = { x: tx, y: ty };
    });
  };
  G.cmdAttack = function (units, t) {
    for (const u of units) if (u.kind === 'unit') { u.task = { t: 'attack', id: t.id, forced: true }; u.path = []; u.pathFor = 0; }
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
  G.cmdSmart = function (units, x, y, t) {
    units = units.filter(u => u.kind === 'unit' && !u.dead);
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
          if (!t.built || t.hp < t.maxHp) { G.cmdBuild(vils, t); return 'build'; }
          if (t.type === 'farm') { G.cmdFarm(vils.slice(0, 1), t); return 'gather'; }
          if (t.def.drop) { G.cmdDeposit(vils, t); return 'move'; }
        }
      }
    }
    G.cmdMove(units, x, y);
    return 'move';
  };

  G.placeBuilding = function (owner, type, tx, ty, builders) {
    const def = G.BUILDINGS[type];
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
    if (builders && builders.length) G.cmdBuild(builders, b);
    return b;
  };

  G.train = function (b, type) {
    if (!b.built || b.dead) return false;
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
      dmg = d.ranged ? 1 : Math.max(1, d.atk - 1);
      if (d.bonus && d.bonus.bld) dmg += d.bonus.bld;
      if (att.kind === 'building') dmg = 1;
    } else {
      const arm = d.ranged || att.kind === 'building' ? t.def.pierce : t.def.armor;
      dmg = Math.max(1, d.atk - arm);
      if (d.bonus && d.bonus[t.def.cls]) dmg += d.bonus[t.def.cls];
    }
    return dmg;
  }
  function hit(att, t, dmg) {
    if (t.dead) return;
    t.hp -= dmg; t.hitT = 0.2;
    if (t.hp <= 0) { if (att.owner > 0) G.players[att.owner].killed++; G.kill(t); return; }
    // Retaliate / alert
    if (t.kind === 'unit' && t.task.t !== 'attack' && G.enemies(att.owner, t.owner)) {
      if (t.type !== 'villager') t.task = { t: 'attack', id: att.id };
      else if (att.kind === 'unit' && att.def.cls !== 'cav' && t.hp < t.maxHp * 0.4) {
        // flee toward town center
        const tc = nearest(t, e => e.type === 'towncenter' && e.owner === t.owner && e.built);
        if (tc) { t.task = { t: 'move', x: tc.x, y: tc.y + tc.size / 2 + 0.6 }; t.path = G.findPath(t.x, t.y, rectOf(tc), true, tc.id); }
      }
    }
    if (G.onHit) G.onHit(att, t);
  }
  function fire(att, t) {
    const dmg = damage(att, t);
    if (att.def.ranged || att.kind === 'building') {
      G.projs.push({ x: att.x, y: att.y, z: att.kind === 'building' ? 1.6 : 0.6, tx: t.x, ty: t.y, tid: t.id, from: att, dmg, t: 0, dur: Math.max(0.25, G.dist(att, t) / 9) });
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
      if (b.queue.length) {
        const q = b.queue[0], def = G.UNITS[q.type];
        const speed = (b.type === 'towncenter' && mods(b.owner).tcSpeed) ? mods(b.owner).tcSpeed : 1;
        const { pop, cap } = G.popOf(b.owner);
        const blocked = pop - b.queue.length + 1 > cap; // housed
        if (!blocked) b.qt += dt * speed * (G.fastTrain || 1);
        b.housed = blocked;
        if (b.qt >= def.time) {
          b.qt = 0; b.queue.shift();
          spawn(b, q.type);
        }
      } else b.housed = false;
      if (b.def.atk) {
        b.cool -= dt;
        if (b.cool <= 0) {
          const t = nearest(b, e => e.kind === 'unit' && G.enemies(e.owner, b.owner), b.def.range);
          if (t) { fire(b, t); b.cool = b.def.rate; }
        }
      }
    }
    // Units
    for (const u of G.ents) if (!u.dead && u.kind === 'unit') updateUnit(u, dt);
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
      if (G.isFree(nx | 0, ny | 0)) { u.x = nx; u.y = ny; }
    }
    // Projectiles
    for (const p of G.projs) {
      p.t += dt;
      const t = G.byId.get(p.tid);
      if (t) { p.tx = t.x; p.ty = t.y; }
      if (p.t >= p.dur) { p.done = true; if (t && !t.dead) hit(p.from, t, p.dmg); }
    }
    G.projs = G.projs.filter(p => !p.done);
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
    const step = u.def.speed * dt * (G.terrainSpeed || 1);
    if (Math.abs(dx - dy) > 0.01) u.face = (dx - dy) > 0 ? 1 : -1;
    u.walk += dt;
    if (d <= step) { u.x = wp.x; u.y = wp.y; u.path.shift(); return u.path.length === 0; }
    u.x += dx / d * step; u.y += dy / d * step;
    return false;
  }

  function faceTo(u, t) { const dx = t.x - u.x, dy = t.y - u.y; if (Math.abs(dx - dy) > 0.01) u.face = (dx - dy) > 0 ? 1 : -1; }

  function findNewResource(u, rtype, lx, ly) {
    const p = { x: lx, y: ly };
    return nearest(p, e => e.kind === 'res' && e.type === rtype && e.amount > 0, 10);
  }

  function updateUnit(u, dt) {
    if (u.hitT) u.hitT = Math.max(0, u.hitT - dt);
    u.cool -= dt;
    u.repath -= dt;
    u.working = false;
    // Byzantine healing near own TC
    if (u.hp < u.maxHp && mods(u.owner).tcHeal) {
      const tc = nearest(u, e => e.type === 'towncenter' && e.owner === u.owner && e.built, 6);
      if (tc) u.hp = Math.min(u.maxHp, u.hp + dt * 0.8);
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
            u.path = G.findPath(u.x, u.y, { x0: task.x | 0, y0: task.y | 0, x1: task.x | 0, y1: task.y | 0 }, false, 0);
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
          const n = u.type === 'villager' ? null : nearest(u, e => (e.kind === 'unit' || e.kind === 'building') && G.enemies(e.owner, u.owner), u.def.los);
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
        if (f.farmer && f.farmer !== u.id) { const o = G.byId.get(f.farmer); if (o && !o.dead && o.task.t === 'farm' && o.task.id === f.id) { u.task = { t: 'idle' }; break; } }
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
          if (f.food <= 0) { G.kill(f); }
        } else {
          u.atFarm = false;
          if (u.pathFor !== f.id || !u.path.length) {
            if (u.repath <= 0 || u.pathFor !== f.id) { u.path = G.findPath(u.x, u.y, rectOf(f), false, 0); u.pathFor = f.id; u.repath = 1; }
          }
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
          if (!b.built) {
            const inc = dt / b.def.time * (G.fastBuild || 1);
            b.progress = Math.min(1, b.progress + inc);
            b.hp = Math.min(b.maxHp, b.hp + inc * b.maxHp);
            if (b.progress >= 1) { b.built = true; b.hp = Math.max(b.hp, b.maxHp * 0.999); if (G.onBuilt) G.onBuilt(b); }
          } else {
            b.hp = Math.min(b.maxHp, b.hp + dt * b.maxHp / b.def.time * 0.5); // repair
          }
        } else {
          if (u.pathFor !== b.id || !u.path.length) {
            if (u.repath <= 0 || u.pathFor !== b.id) {
              if (b.type === 'farm') { u.path = G.findPath(u.x, u.y, rectOf(b), false, 0); u.pathFor = b.id; u.repath = 1; }
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
