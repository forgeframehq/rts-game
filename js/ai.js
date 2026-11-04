// Computer opponent: runs a simple economy, builds up, defends and sends attack waves.
(function () {
  const LEVELS = {
    // Easy plays like a beginner: a small economy, a slow first attack and small raids,
    // even when high starting resources would let it build an army at once.
    // research: how keen it is on upgrades (0-1). match: the most soldiers it keeps for each
    // one the player has, so an easier opponent grows with the player rather than ahead of them.
    // retreat: pulls a wave back home from a fight it is clearly losing.
    easy:   { maxVils: 15, firstAttack: 720, wave: 3, grow: 1, armyCap: 8, think: 1.8, armyPerVil: 0.4, research: 0.25, match: 0.7, minArmy: 4, retreat: false, counter: 0.3 },
    normal: { maxVils: 26, firstAttack: 420, wave: 6, grow: 3, armyCap: 24, think: 0.7, research: 0.7, match: 1.15, minArmy: 8, retreat: true, counter: 0.7 },
    hard:   { maxVils: 34, firstAttack: 330, wave: 8, grow: 4, armyCap: 40, think: 0.4, research: 1, match: 0, retreat: true, counter: 1 }
  };
  // what each soldier is good against (AoE2's rock-paper-scissors): inf, arc, cav, sie
  const COUNTER = {
    spearman:   { cav: 2.2, inf: 0.3 },
    militia:    { inf: 0.8, arc: 0.6, sie: 1.5, bld: 1 },
    archer:     { inf: 1.4, arc: 0.6 },
    longbowman: { inf: 1.6, arc: 1.0 },
    repeater:   { inf: 1.6, arc: 0.8 },
    knight:     { arc: 2.0, sie: 1.8, inf: 0.6 },
    scout:      { arc: 0.8, sie: 1.2 },
    cataphract: { inf: 2.4, arc: 1.2, sie: 1.5 },
    axethrower: { inf: 1.0, arc: 0.6, bld: 1.5 }
  };
G.makeAI = function () {
  const AI = {};
  AI.level = 'normal';

  AI.init = function (p) {
    AI.p = p; AI.t = 0; AI.waveN = 0; AI.nextAttack = LEVELS[AI.level].firstAttack;
    AI.cfg = LEVELS[AI.level];
  };

  const mine = (pred) => G.ents.filter(e => !e.dead && e.owner === AI.p && pred(e));
  const res = () => G.players[AI.p].res;

  function findSpot(type, ax, ay, minR) {
    const s = G.BUILDINGS[type].size;
    const gap = type === 'farm' ? 0 : 1;
    for (let r = minR || 2; r < 20; r++) {
      const cands = [];
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const tx = Math.round(ax + i - s / 2), ty = Math.round(ay + j - s / 2);
        if (G.areaFree(tx - gap, ty - gap, s + gap * 2)) cands.push({ tx, ty });
      }
      if (cands.length) return cands[Math.floor(Math.random() * cands.length)];
    }
    return null;
  }

  function build(type, ax, ay, minR, nBuilders) {
    // the same Age rules as the player: no towers or stables in the Dark Age
    if (!G.canBuildType(AI.p, type)) return null;
    if (!G.canAfford(AI.p, G.buildCost(AI.p, type))) return null;
    const spot = findSpot(type, ax, ay, minR);
    if (!spot) return null;
    const vils = mine(e => e.type === 'villager').sort((a, b) => Math.hypot(a.x - ax, a.y - ay) - Math.hypot(b.x - ax, b.y - ay));
    // prefer idle / non-food builders
    const builders = vils.filter(v => v.task.t !== 'build').slice(0, nBuilders || 1);
    if (!builders.length) return null;
    return G.placeBuilding(AI.p, type, spot.tx, spot.ty, builders);
  }

  function jobOf(v) {
    const t = v.task;
    if (t.t === 'gather') return G.RES[t.rtype] ? G.RES[t.rtype].res : null;
    if (t.t === 'farm') return 'food';
    if (t.t === 'return' && t.back) return t.back.t === 'farm' ? 'food' : G.RES[t.back.rtype] ? G.RES[t.back.rtype].res : null;
    if (t.t === 'build') return 'build';
    return null;
  }

  AI.update = function (dt) {
    if (!AI.cfg || G.over) return;
    AI.t -= dt;
    if (AI.t > 0) return;
    AI.t = AI.cfg.think;
    const p = AI.p, R = res();
    const tc = mine(e => e.type === 'towncenter')[0];
    const vils = mine(e => e.type === 'villager');
    // the King and Queen are not soldiers: they never march with an attack wave
    const army = mine(e => e.kind === 'unit' && e.type !== 'villager' && e.def.cls !== 'hero');
    const blds = mine(e => e.kind === 'building');
    const has = t => blds.some(b => b.type === t);
    const hasBuilt = t => blds.some(b => b.type === t && b.built);
    const { pop, cap } = G.popOf(p);
    const home = tc || blds[0] || vils[0];
    if (!home) return;

    // --- resign: no Town Center, no Castle and no army left to fight with. AoE2's AI concedes
    // rather than make the player hunt down its last stragglers ---
    if (!tc && !has('castle') && army.length < 5) {
      AI.lowT = (AI.lowT || 0) + AI.cfg.think;
      if (AI.lowT > 20) { G.resign(p); return; }
    } else AI.lowT = 0;

    // --- Regicide: hide the royals when enemy soldiers come near, let them out once it is quiet ---
    const regicide = G.rules.mode === 'regicide';
    if (regicide) {
      const enemyNear = (x, r) => G.nearest(x, e => e.kind === 'unit' && G.enemies(e.owner, p) && e.type !== 'villager', r);
      for (const r of ['king', 'queen'].map(t => G.royal(p, t)).filter(Boolean)) {
        if (r.inside) continue;
        const danger = enemyNear(r, 9);
        if (!danger) continue;
        AI.hideT = G.time;
        if (r.task.t !== 'garrison') {
          const b = G.nearest(r, e => (e.type === 'towncenter' || e.type === 'castle') && G.canGarrison(r, e));
          if (b) G.garrisonTo(r, b); else G.cmdMove([r], home.x, home.y + 2);
        }
        const guards = army.filter(u => u.task.t !== 'attack' || !G.byId.get(u.task.id));
        if (guards.length) G.cmdAttack(guards, danger);
      }
      if (G.time - (AI.hideT || 0) > 25) for (const b of blds)
        if (b.garrison && b.garrison.some(u => u.def.cls === 'hero') && !enemyNear(b, 12)) G.ungarrison(b, u => u.def.cls === 'hero');
    }
    // Regicide is won by killing royals, so attack waves go for the nearest one (hidden or not:
    // a royal inside a building turns the attack on the building)
    const royalTarget = () => {
      if (G.rules.mode === 'capture' || G.rules.mode === 'tcrush') return G.nearest(home, e => !e.dead && e.type === 'towncenter' && G.enemies(e.owner, p), 999);
      if (!regicide) return null;
      let best = null;
      for (const id in G.players) {
        if (!G.players[id].alive || !G.enemies(+id, p)) continue;
        for (const t of ['king', 'queen']) { const r = G.royal(+id, t); if (r && (!best || G.dist(home, r) < G.dist(home, best))) best = r; }
      }
      return best;
    };

    // --- Ages: advance once the economy is big enough (pauses villager training, like a real player) ---
    const age = G.ageOf(p), nxt = G.AGES[age + 1], nxtCost = G.ageCost(p, age + 1), AGE_VILS = [0, 0, 13, 19, 25];
    // how big an economy to want before advancing — never more villagers than this level
    // will ever train, or an easier opponent waits for an economy it cannot build and stalls
    const ageVils = n => Math.min(AGE_VILS[n] || 0, AI.cfg.maxVils);
    let saving = false;
    if (tc && tc.built && nxt && !tc.aging && vils.length >= ageVils(age + 1) && !G.ageBlock(p, null)) {
      saving = true;
      if (!tc.queue.length && G.canAfford(p, nxtCost)) G.advanceAge(tc);
    }
    // --- villagers ---
    if (tc && tc.built && !tc.aging && !saving && vils.length + tc.queue.length < AI.cfg.maxVils && tc.queue.length < 2) G.train(tc, 'villager');

    // --- stalled construction: a site whose builders can't reach it (or that nobody is working
    // on) is torn down after a while and its cost returned, so one bad spot can't freeze the town ---
    for (const b of blds) {
      if (b.built || b.type === 'farm') continue;
      if (b.progress > (b.aiLast || 0) + 0.001) { b.aiLast = b.progress; b.aiStall = 0; continue; }
      b.aiStall = (b.aiStall || 0) + AI.cfg.think;
      if (b.aiStall > 45) {
        for (const v of vils) if (v.task.t === 'build' && v.task.id === b.id) { v.task = { t: 'idle' }; v.path = []; }
        G.refund(p, G.buildCost(p, b.type)); G.kill(b);
      } else if (b.aiStall > 15 && !vils.some(v => v.task.t === 'build' && v.task.id === b.id)) {
        const v = vils.filter(x => x.task.t !== 'build').sort((a, c) => G.dist(a, b) - G.dist(c, b))[0];
        if (v && G.cmdBuild) G.cmdBuild([v], b);
      }
    }
    // --- houses ---
    // One house at a time was a bottleneck: a single builder walking out to the edge of
    // town took long enough that the Town Center sat pop-capped and idle waiting for it.
    const housing = blds.filter(b => b.type === 'house' && !b.built).length;
    // one house at a time, a little ahead of need, like a real player; two only once the
    // town is training from several buildings and filling up faster than one builder keeps up
    const tight = cap - pop <= (pop < 15 ? 2 : 5) && cap < 200;
    if (tight && housing < (pop >= 20 && cap - pop <= 2 ? 2 : 1)) build('house', home.x, home.y, 4, pop < 15 ? 1 : 2);

    // --- buildings the next Age needs: build the cheapest missing one ---
    const blk = nxt && G.ageBlock(p, null);
    if (blk && blk.startsWith('Needs')) {
      const cost = t => Object.values(G.buildCost(p, t)).reduce((a, b) => a + b, 0);
      const t = nxt.needs.filter(t => !has(t) && G.canBuildType(p, t)).sort((a, b) => cost(a) - cost(b))[0];
      // build it once the economy is big enough, or the moment it is simply affordable —
      // waiting on a villager count this level never reaches would stall the Age forever
      // Only once the economy is nearly ready for the Age. (ageVils is capped at this level's
      // villager limit, so an easy opponent still gets there.) Building them the moment they
      // were affordable put a whole town up in the first 30 seconds on high resources.
      if (t && vils.length >= ageVils(age + 1) - 2) {
        const near = { mill: 'berry', lumbercamp: 'tree', miningcamp: 'gold' }[t];
        const r = near && G.nearest(home, e => e.kind === 'res' && e.type === near, 22);
        build(t, r ? r.x : home.x, r ? r.y : home.y, r ? 1 : 5, 2);
      }
    }
    // --- military production buildings ---
    if (vils.length >= 11 && !has('barracks')) build('barracks', home.x, home.y, 5, 2);
    else if (vils.length >= 15 && hasBuilt('barracks') && !has('range')) build('range', home.x, home.y, 5, 2);
    else if (vils.length >= 16 && hasBuilt('range') && !has('blacksmith')) build('blacksmith', home.x, home.y, 6, 2);
    else if (vils.length >= 20 && hasBuilt('range') && !has('stable')) build('stable', home.x, home.y, 6, 2);
    else if (vils.length >= 24 && age >= 3 && hasBuilt('stable') && !has('siegeworkshop')) build('siegeworkshop', home.x, home.y, 6, 2);
    else if (vils.length >= 26 && age >= 3 && hasBuilt('siegeworkshop') && !has('monastery')) build('monastery', home.x, home.y, 6, 2);
    else if (vils.length >= 28 && age >= 3 && hasBuilt('blacksmith') && !has('university') && R.wood > 250) build('university', home.x, home.y, 6, 2);
    // don't spend the quarry on towers while a Castle is the thing standing between us and the next Age
    else if (vils.length >= 22 && hasBuilt('stable') && blds.filter(b => b.type === 'tower').length < 2
             && R.stone > 200 && !(nxt && nxt.needs.includes('castle') && !has('castle'))) build('tower', home.x, home.y, 6, 1);
    // --- research: a plan, not whatever is affordable. Economy first once the town is
    // working, then the upgrades that help the army it actually fields ---
    if (!saving && vils.length >= 12 && Math.random() < AI.cfg.research) {
      const comp = { melee: 0, ranged: 0, all: Math.max(1, army.length) };
      for (const u of army) comp[u.def.ranged ? 'ranged' : 'melee']++;
      const foeArc = G.ents.filter(e => !e.dead && G.enemies(e.owner, p) && e.kind === 'unit' && e.def.cls === 'arc').length;
      const lines = {}; for (const u of army) lines[u.type] = (lines[u.type] || 0) + 1;
      const score = (r) => {
        const e = r.def.eff || {};
        if (r.kind === 'up') return 2 + 3 * (lines[r.def.line] || 0) / comp.all * 3;
        let sc = 0;
        for (const k in e) {
          if (/^gather_|^farm$|^carry$|^vilSpeed$/.test(k)) sc += vils.length >= 18 ? 6 : 4;
          else if (k === 'vilHp') sc += 1.5;
          else if (k === 'build') sc += 1.5;
          else if (k === 'melee') sc += 1 + 5 * comp.melee / comp.all;
          else if (k === 'ranged' || k === 'range') sc += 0.5 + 3 * comp.ranged / comp.all;
          else if (k === 'armor') sc += 1 + 2 * army.length / 12;
          else if (k === 'pierce') sc += 1 + foeArc / 4;
          else if (/^unit(Atk|Range)_/.test(k)) sc += 1 + 6 * (lines[k.split('_')[1]] || 0) / comp.all;
          else if (/^trainSpeed_/.test(k)) sc += 2;
          else sc += 0.6;   // towers, walls, buildings: nice to have
        }
        return sc;
      };
      let best = null, bestS = 2.5;
      for (const b of blds) {
        if (!b.built || b.research || b.aging) continue;
        for (const r of G.researchesFor(b)) {
          if (r.why) continue;
          const sc = score(r); if (sc > bestS) { bestS = sc; best = { b, r }; }
        }
      }
      AI.resv = null;
      if (best) {
        if (G.canAfford(p, best.r.def.cost)) G.startResearch(best.b, best.r.id);
        // worth saving for: soldiers wait until it is paid for (villagers keep coming)
        else if (bestS >= 4) AI.resv = best.r.def.cost;
      }
    }

    // --- drop sites ---
    const nearDrop = (r, kind) => blds.some(b => b.def.drop && b.def.drop.includes(kind) && G.edgeDist(r, b) < 5);
    if (!blds.some(b => b.type === 'lumbercamp' && !b.built)) {
      const tree = G.nearest(home, e => e.kind === 'res' && e.type === 'tree', 18);
      if (tree && !nearDrop(tree, 'wood') && vils.length >= 6) build('lumbercamp', tree.x, tree.y, 1, 1);
    }
    if (!has('miningcamp') && vils.length >= 9) {
      const gold = G.nearest(home, e => e.kind === 'res' && e.type === 'gold', 18);
      if (gold && !nearDrop(gold, 'gold')) build('miningcamp', gold.x, gold.y, 1, 1);
    }
    if (!has('mill') && vils.length >= 5) {
      const berry = G.nearest(home, e => e.kind === 'res' && e.type === 'berry', 14);
      if (berry && !nearDrop(berry, 'food')) build('mill', berry.x, berry.y, 1, 1);
    }

    // --- rebalance: move gatherers off a resource we're swimming in ---
    AI.rb = (AI.rb || 0) + 1;
    if (AI.rb % 8 === 0) {
      const kinds = ['food', 'wood', 'gold', 'stone'];
      const rich = kinds.filter(k => R[k] > 500).sort((a, b) => R[b] - R[a])[0];
      const poor = kinds.filter(k => k !== 'stone' && R[k] < 150).sort((a, b) => R[a] - R[b])[0];
      if (rich && poor) {
        const movers = vils.filter(v => jobOf(v) === rich && v.task.t !== 'return').slice(0, 2);
        for (const v of movers) { v.task = { t: 'idle' }; v.path = []; }
      }
    }
    // spend surplus wood on extra production
    if (R.wood > 450 && vils.length >= 20) {
      const nb = blds.filter(b => ['barracks', 'range', 'stable'].includes(b.type)).length;
      if (nb < 6) build(['barracks', 'range', 'stable'][nb % 3], home.x, home.y, 6, 2);
    }

    // --- assign idle villagers ---
    const counts = { food: 0, wood: 0, gold: 0, stone: 0 };
    for (const v of vils) { const j = jobOf(v); if (counts[j] != null) counts[j]++; }
    const n = Math.max(1, vils.length);
    const want = vils.length < 10 ? { food: 0.55, wood: 0.45, gold: 0, stone: 0 }
      : vils.length < 18 ? { food: 0.45, wood: 0.35, gold: 0.2, stone: 0 }
      : { food: 0.4, wood: 0.3, gold: 0.22, stone: 0.08 };
    if (saving) for (const k in nxtCost) if (R[k] < nxtCost[k]) want[k] = (want[k] || 0) + 0.25;   // gather what the Age costs
    // gather what a missing Age-requirement building costs too — the Castle is a lot of stone,
    // and nothing else in the build order sends villagers to the quarry in bulk. Only while the
    // Age is actually held up by a building, or it would mine stone forever for a tower it doesn't need.
    if (blk && blk.startsWith('Needs')) for (const t of nxt.needs) {
      if (has(t) || !G.canBuildType(p, t)) continue;
      const c = G.buildCost(p, t);
      for (const k in c) if (R[k] < c[k]) want[k] = (want[k] || 0) + 0.3;
    }
    // --- rebalance ---
    // A villager never leaves a job on its own, so a crew assigned to wood early keeps
    // chopping while the granary empties and the lumber pile grows past any use. Move one
    // worker per think from the most over-served resource to the most under-served one.
    const gapOf = k => (want[k] || 0) - counts[k] / n - Math.min(0.3, R[k] / 2500);
    let needK = null, needGap = -1e9, overK = null, overGap = 1e9;
    for (const k in counts) {
      const g = gapOf(k);
      if (g > needGap) { needGap = g; needK = k; }
      if (counts[k] > 1 && g < overGap) { overGap = g; overK = k; }
    }
    if (needK && overK && needK !== overK && needGap - overGap > 0.25) {
      const rt = { wood: 'tree', gold: 'gold', stone: 'stone' }[overK];
      const spare = overK === 'food'
        ? vils.find(x => x.task.t === 'farm')
        : vils.find(x => x.task.t === 'gather' && x.task.rtype === rt && !(x.carry && x.carry.amt > G.CARRY * 0.5));
      if (spare) { spare.task = { t: 'idle' }; spare.path = []; spare.pathFor = 0; counts[overK]--; }
    }

    for (const v of vils) {
      if (v.task.t !== 'idle') continue;
      let best = 'food', bestGap = -1e9;
      for (const k in want) { const gap = want[k] - counts[k] / n - Math.min(0.3, R[k] / 2500) + (R[k] < 100 && want[k] > 0 ? 0.08 : 0); if (gap > bestGap) { bestGap = gap; best = k; } }
      counts[best]++;
      if (best === 'food') {
        const berry = G.nearest(v, e => e.kind === 'res' && e.type === 'berry', 14);
        if (berry && G.dist(berry, home) < 14) { G.cmdGather([v], berry); continue; }
        // an unworked field — sowing a spent one again is far cheaper than a new farm
        const free = blds.find(b => b.type === 'farm' && b.built && !G.farmBusy(b, v)
                                    && (b.food > 0 || G.canAfford(p, G.resowCost(p))));
        if (free) { G.cmdFarm([v], free); continue; }
        if (G.canAfford(p, G.buildCost(p, 'farm'))) {
          const spot = findSpot('farm', home.x, home.y, 3);
          if (spot) { G.placeBuilding(p, 'farm', spot.tx, spot.ty, [v]); continue; }
        }
        best = 'wood';
      }
      const rt = { wood: 'tree', gold: 'gold', stone: 'stone' }[best];
      let r = G.nearest(v, e => e.kind === 'res' && e.type === rt && (e.unreach || 0) < 3, 40);
      // That kind has run out within reach. Take anything else rather than stand still —
      // an idle villager is the most expensive thing on the map.
      if (!r) for (const alt of ['tree', 'berry', 'gold', 'stone']) {
        if (alt === rt) continue;
        r = G.nearest(v, e => e.kind === 'res' && e.type === alt && (e.unreach || 0) < 3, 70);
        if (r) break;
      }
      if (r) { G.cmdGather([v], r); continue; }
      // nothing left to gather anywhere: work a field, sowing it again if it is spent
      const fld = blds.find(b => b.type === 'farm' && b.built && !G.farmBusy(b, v)
                                 && (b.food > 0 || G.canAfford(p, G.resowCost(p))));
      if (fld) { G.cmdFarm([v], fld); continue; }
      if (G.canAfford(p, G.buildCost(p, 'farm'))) {
        const spot = findSpot('farm', home.x, home.y, 3);
        if (spot) G.placeBuilding(p, 'farm', spot.tx, spot.ty, [v]);
      }
    }

    const threatNear = !!G.nearest(home, e => e.kind === 'unit' && G.enemies(e.owner, p) && e.type !== 'villager', 16);
    // --- army production ---
    const needBld = nxt && G.ageBlock(p, null) && G.ageBlock(p, null).startsWith('Needs') && vils.length >= ageVils(age + 1) ? 180 : 0;
    // How much of each resource not to spend on soldiers. While saving for an Age this has to
    // cover EVERY resource that Age costs, not just the food: an army that drinks the gold as
    // fast as it is mined will sit in Feudal forever on a granary full of food it cannot use.
    const keep = k => {
      if (saving && nxtCost[k]) return nxtCost[k];
      if (AI.resv && AI.resv[k] && !threatNear) return AI.resv[k];
      if (k === 'food') return vils.length < AI.cfg.maxVils ? 60 : 0;
      if (k === 'wood') return needBld;
      return 0;
    };
    // what the enemy fields, to pick counters and to keep an easier AI level with the player
    const foe = { inf: 0, arc: 0, cav: 0, sie: 0, n: 0 };
    for (const e of G.ents) if (!e.dead && e.kind === 'unit' && G.enemies(e.owner, p) && e.type !== 'villager' && e.def.cls !== 'hero') { foe.n++; if (foe[e.def.cls] != null) foe[e.def.cls]++; }
    const cap2 = AI.cfg.match ? Math.min(AI.cfg.armyCap, Math.max(AI.cfg.minArmy, Math.ceil(foe.n * AI.cfg.match) + AI.waveN)) : AI.cfg.armyCap;
    const pickUnit = (opts) => {
      const w = opts.map(t => { const c = COUNTER[t]; let v = 1;
        if (c && foe.n) v += AI.cfg.counter * ((c.inf || 0) * foe.inf + (c.arc || 0) * foe.arc + (c.cav || 0) * foe.cav + (c.sie || 0) * foe.sie) / foe.n * 2;
        if (G.CIVS[G.players[p].civ].unique && G.CIVS[G.players[p].civ].unique.type === t) v += 1;   // play to the dynasty's strength
        return Math.max(0.1, v); });
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
      return opts[opts.length - 1];
    };
    if (army.length < cap2 && pop < cap && (!AI.cfg.armyPerVil || army.length < vils.length * AI.cfg.armyPerVil)) {
      for (const b of blds) {
        if (!b.built || b.type === 'towncenter' || b.queue.length >= 2 || b.research) continue;
        // the Castle has no train list of its own: its only unit is the dynasty's unique one
        let opts = G.trainsFor(b).filter(t => G.canTrainType(p, t));
        if (!opts.length) continue;
        // siege is slow and dear: keep a few to crack buildings, not an army of them
        if (b.type === 'siegeworkshop' && army.filter(u => u.def.cls === 'sie').length >= 4) continue;
        // a couple of Monks is plenty; they cost gold that is better spent on soldiers
        if (b.type === 'monastery' && G.ents.filter(e => !e.dead && e.owner === p && e.type === 'monk').length >= 2) continue;
        // counter what the player fields
        const type = (b.type === 'siegeworkshop' || b.type === 'monastery') ? opts[Math.floor(Math.random() * opts.length)] : pickUnit(opts);
        const cost = G.unitCost(p, type);
        if (Object.keys(cost).every(k => R[k] - keep(k) >= cost[k])) G.train(b, type);
      }
    }
    // rally army near home
    for (const b of blds) if (b.def.trains && b.type !== 'towncenter' && !b.rally) b.rally = { x: home.x + 3, y: home.y + 3 };

    // --- defend ---
    const threat = G.nearest(home, e => e.kind === 'unit' && G.enemies(e.owner, AI.p), 13);
    if (threat) {
      const idle = army.filter(u => u.task.t !== 'attack' || !G.byId.get(u.task.id));
      if (idle.length) G.cmdAttack(idle, threat);
      // villagers fight back if few soldiers
      if (army.length < 3) { const near = vils.filter(v => G.dist(v, threat) < 4); if (near.length >= 3) G.cmdAttack(near, threat); }
    }

    // --- attack waves ---
    // Wait rather than walk a wave into a far bigger army (Easy still does: it is meant to be beaten)
    const outnumbered = AI.cfg.retreat && foe.n > army.length * 1.6 && foe.n >= 6;
    if (G.time > AI.nextAttack && !outnumbered && army.length >= Math.min(AI.cfg.wave + AI.waveN * AI.cfg.grow, Math.max(AI.cfg.wave, cap2))) {
      AI.waveN++;
      AI.nextAttack = G.time + 150;
      const target = royalTarget() || G.nearest(home, e => G.enemies(e.owner, AI.p) && e.kind === 'building' && e.type !== 'farm') || G.nearest(home, e => G.enemies(e.owner, AI.p));
      if (target) {
        G.cmdAttack(army, target);
        for (const u of army) u.task.forced = true;
        if (G.ui && target.owner === 1) G.ui.alert('⚠️ Enemy army is attacking!');
      }
    }
    // retreat: a wave that is clearly losing pulls back home to regroup instead of dying to the last man
    if (AI.cfg.retreat && AI.waveN > 0) {
      const out = army.filter(u => G.dist(u, home) > 16);
      if (out.length) {
        const cx = out.reduce((a, u) => a + u.x, 0) / out.length, cy = out.reduce((a, u) => a + u.y, 0) / out.length;
        const str = us => us.reduce((a, u) => a + u.hp * (u.def.atk || 1), 0);
        const foes = G.ents.filter(e => !e.dead && G.enemies(e.owner, p) && (e.kind === 'unit' && e.type !== 'villager' || e.type === 'tower' || e.type === 'castle') && Math.hypot(e.x - cx, e.y - cy) < 9);
        if (foes.length && str(out) < str(foes) * 0.45) {
          G.cmdMove(out, home.x + 3, home.y + 3); for (const u of out) u.task.forced = true;
          AI.nextAttack = G.time + 90; AI.waveN = Math.max(0, AI.waveN - 1);
        }
      }
    }
    // keep attacking units busy: when their target dies they auto-acquire; idle stragglers rejoin
    if (AI.waveN > 0) {
      const target = royalTarget() || G.nearest(home, e => G.enemies(e.owner, AI.p) && e.kind === 'building' && e.type !== 'farm');
      const away = army.filter(u => u.task.t === 'idle' && G.dist(u, home) > 15);
      if (target && away.length) { G.cmdAttack(away, target); for (const u of away) u.task.forced = true; }
    }
  };
  return AI;
};

})();
