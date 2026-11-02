// Computer opponent: runs a simple economy, builds up, defends and sends attack waves.
(function () {
  const LEVELS = {
    easy:   { maxVils: 18, firstAttack: 540, wave: 4, grow: 2, armyCap: 14, think: 1.2 },
    normal: { maxVils: 26, firstAttack: 420, wave: 6, grow: 3, armyCap: 24, think: 0.7 },
    hard:   { maxVils: 34, firstAttack: 330, wave: 8, grow: 4, armyCap: 36, think: 0.4 }
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
    const army = mine(e => e.kind === 'unit' && e.type !== 'villager');
    const blds = mine(e => e.kind === 'building');
    const has = t => blds.some(b => b.type === t);
    const hasBuilt = t => blds.some(b => b.type === t && b.built);
    const { pop, cap } = G.popOf(p);
    const home = tc || blds[0] || vils[0];
    if (!home) return;

    // --- Ages: advance once the economy is big enough (pauses villager training, like a real player) ---
    const age = G.ageOf(p), nxt = G.AGES[age + 1], AGE_VILS = [0, 0, 17, 22, 28];
    let saving = false;
    if (tc && tc.built && nxt && !tc.aging && vils.length >= AGE_VILS[age + 1] && !G.ageBlock(p, null)) {
      saving = true;
      if (!tc.queue.length && G.canAfford(p, nxt.cost)) G.advanceAge(tc);
    }
    // --- villagers ---
    if (tc && tc.built && !tc.aging && !saving && vils.length + tc.queue.length < AI.cfg.maxVils && tc.queue.length < 2) G.train(tc, 'villager');

    // --- houses ---
    const housing = blds.some(b => b.type === 'house' && !b.built);
    if (cap - pop <= 4 && cap < 200 && !housing) build('house', home.x, home.y, 4, 1);

    // --- buildings the next Age needs: build the cheapest missing one ---
    const blk = nxt && G.ageBlock(p, null);
    if (blk && blk.startsWith('Needs') && vils.length >= AGE_VILS[age + 1] - 2) {
      const cost = t => Object.values(G.buildCost(p, t)).reduce((a, b) => a + b, 0);
      const t = nxt.needs.filter(t => !has(t) && G.canBuildType(p, t)).sort((a, b) => cost(a) - cost(b))[0];
      if (t) {
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
    else if (vils.length >= 22 && hasBuilt('stable') && blds.filter(b => b.type === 'tower').length < 2 && R.stone > 200) build('tower', home.x, home.y, 6, 1);
    // research: unit upgrades and blacksmith techs when there is spare food/gold (never while saving for an Age)
    if (!saving && vils.length >= 16) for (const b of blds) {
      if (!b.built || b.research || (b.queue && b.queue.length)) continue;
      const opts = G.researchesFor(b).filter(r => !r.why && Object.keys(r.def.cost).every(k => R[k] >= r.def.cost[k] + (k === 'food' ? 150 : 50)));
      if (opts.length) { G.startResearch(b, opts[0].id); break; }
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
    if (saving) for (const k in nxt.cost) if (R[k] < nxt.cost[k]) want[k] = (want[k] || 0) + 0.25;   // gather what the Age costs
    for (const v of vils) {
      if (v.task.t !== 'idle') continue;
      let best = 'food', bestGap = -1e9;
      for (const k in want) { const gap = want[k] - counts[k] / n - Math.min(0.3, R[k] / 2500) + (R[k] < 100 && want[k] > 0 ? 0.08 : 0); if (gap > bestGap) { bestGap = gap; best = k; } }
      counts[best]++;
      if (best === 'food') {
        const berry = G.nearest(v, e => e.kind === 'res' && e.type === 'berry', 14);
        if (berry && G.dist(berry, home) < 14) { G.cmdGather([v], berry); continue; }
        // free farm or build a new one
        const free = blds.find(b => b.type === 'farm' && b.built && !(b.farmer && G.byId.get(b.farmer) && G.byId.get(b.farmer).task.t === 'farm' && G.byId.get(b.farmer).task.id === b.id));
        if (free) { G.cmdFarm([v], free); continue; }
        if (G.canAfford(p, G.buildCost(p, 'farm'))) {
          const spot = findSpot('farm', home.x, home.y, 3);
          if (spot) { G.placeBuilding(p, 'farm', spot.tx, spot.ty, [v]); continue; }
        }
        best = 'wood';
      }
      const rt = { wood: 'tree', gold: 'gold', stone: 'stone' }[best];
      const r = G.nearest(v, e => e.kind === 'res' && e.type === rt && (e.unreach || 0) < 3, 40);
      if (r) G.cmdGather([v], r);
    }

    // --- army production ---
    const reserve = saving ? 1e9 : vils.length < AI.cfg.maxVils ? 60 : 0;   // while saving for an Age, keep the food
    const needBld = nxt && G.ageBlock(p, null) && G.ageBlock(p, null).startsWith('Needs') && vils.length >= AGE_VILS[age + 1] ? 180 : 0;
    if (army.length < AI.cfg.armyCap && pop < cap) {
      for (const b of blds) {
        if (!b.built || !b.def.trains || b.type === 'towncenter' || b.queue.length >= 2 || b.research) continue;
        let opts = b.def.trains;
        // counter what the player fields
        const enemyCav = G.ents.filter(e => G.enemies(e.owner, AI.p) && e.type === 'knight').length;
        if (b.type === 'barracks') opts = enemyCav > 2 ? ['spearman'] : ['militia', 'spearman'];
        const type = opts[Math.floor(Math.random() * opts.length)];
        const cost = G.unitCost(p, type);
        if (Object.keys(cost).every(k => R[k] - (k === 'food' ? reserve : k === 'wood' ? needBld : 0) >= cost[k])) G.train(b, type);
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
    if (G.time > AI.nextAttack && army.length >= AI.cfg.wave + AI.waveN * AI.cfg.grow) {
      AI.waveN++;
      AI.nextAttack = G.time + 150;
      const target = G.nearest(home, e => G.enemies(e.owner, AI.p) && e.kind === 'building' && e.type !== 'farm') || G.nearest(home, e => G.enemies(e.owner, AI.p));
      if (target) {
        G.cmdAttack(army, target);
        for (const u of army) u.task.forced = true;
        if (G.ui && target.owner === 1) G.ui.alert('⚠️ Enemy army is attacking!');
      }
    }
    // keep attacking units busy: when their target dies they auto-acquire; idle stragglers rejoin
    if (AI.waveN > 0) {
      const target = G.nearest(home, e => G.enemies(e.owner, AI.p) && e.kind === 'building' && e.type !== 'farm');
      const away = army.filter(u => u.task.t === 'idle' && G.dist(u, home) > 15);
      if (target && away.length) { G.cmdAttack(away, target); for (const u of away) u.task.forced = true; }
    }
  };
  return AI;
};

})();
