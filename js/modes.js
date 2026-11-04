// Game modes beyond Conquest and Regicide:
//   Capture         take enemy Town Centers instead of burning them (tightened against exploits)
//   Siege Survival  hold out against growing waves of raiders
//   Empire Wars     start in the Feudal Age with a working town
// The rules hook into the core through small G.* functions the entity code asks about.
(function () {
  const isCap = () => G.rules && G.rules.mode === 'capture';
  const isSurv = () => G.rules && G.rules.mode === 'survival';
  const tcs = () => G.ents.filter(e => !e.dead && e.type === 'towncenter' && e.built);
  const side = id => (id > 0 && G.players[id] && G.players[id].team > 0) ? 't' + G.players[id].team : 'p' + id;
  const alert = m => { if (G.ui) G.ui.alert(m); };
  const nameOf = id => (+id === 1 ? 'You' : G.players[id] ? (G.players[id].raider ? 'The Raiders' : `The ${G.CIVS[G.players[id].civ].name}`) : 'Nobody');
  const CAP = { LOW: 0.25, FLOOR: 0.10, AFTER: 0.30, IMMUNE: 20, HOLD: 180, GRACE: 90, MAXBUILT: 2, SPACING: 20 };
  G.CAPTURE = CAP;

  // ---------- hooks asked by the core ----------
  // HP a building can't be knocked below (null = no floor)
  G.hpFloor = t => (isCap() && t.type === 'towncenter' ? t.maxHp * CAP.FLOOR : null);
  // a beaten Town Center (white flag) stops shooting
  G.noShoot = b => isCap() && b.type === 'towncenter' && b.hp < b.maxHp * CAP.LOW;
  // repairing doesn't work while the enemy stands at the walls
  G.noRepair = b => isCap() && b.type === 'towncenter' && enemiesNear(b, 2.5).length > 0;
  // why this building may not be deleted, or ''
  G.deleteBlock = e => {
    if (!isCap() || e.type !== 'towncenter') return '';
    if (e.hp < e.maxHp * 0.5) return "A Town Center below half health can't be deleted";
    if (e.cap && e.cap.v > 0) return "You can't delete a Town Center that is being captured";
    return '';
  };
  // why a building may not go here, or ''. Applies to the AI as well.
  G.ruleBlock = function (owner, type, tx, ty) {
    const def = G.BUILDINGS[type]; if (!def) return '';
    const p = G.players[owner]; if (!p) return '';
    const cx = tx + def.size / 2, cy = ty + def.size / 2;
    const near = (e, r) => { const ex = Math.max(e.tx - r, Math.min(e.tx + e.size + r, cx)), ey = Math.max(e.ty - r, Math.min(e.ty + e.size + r, cy)); return Math.abs(ex - cx) < def.size / 2 + 0.01 && Math.abs(ey - cy) < def.size / 2 + 0.01; };
    if (type === 'towncenter') {
      if (G.ageOf(owner) < 3) return 'the Castle Age (new Town Centers need it)';
      if ((p.tcBuilt || 0) >= CAP.MAXBUILT) return `the limit (${CAP.MAXBUILT} new Town Centers a match)`;
      if (p.noTC) return 'losing your last Town Center: recapture one first';
      if (isCap() && G.ents.some(e => !e.dead && e.type === 'towncenter' && Math.hypot(e.x - cx, e.y - cy) < CAP.SPACING)) return `another Town Center (keep ${CAP.SPACING} tiles apart)`;
    }
    if (isCap() && type !== 'farm') {
      for (const t of G.ents) {
        if (t.dead || t.type !== 'towncenter') continue;
        if (near(t, 2)) return 'the space around a Town Center';
        if ((type === 'tower' || type === 'castle') && near(t, 6)) return 'a Town Center (no towers or castles within 6 tiles)';
      }
    }
    return '';
  };
  G.onBuildingPlaced = function (b) { if (b.type === 'towncenter') { const p = G.players[b.owner]; if (p) p.tcBuilt = (p.tcBuilt || 0) + 1; } };
  // Town Centers always show on the minimap in Capture
  G.alwaysOnMap = e => isCap() && e.type === 'towncenter' && !e.dead;
  // extra score for Town Centers held, so a Capture match decided by the clock is decided by the map
  G.modeScore = id => (isCap() ? tcs().filter(t => t.owner === +id).length * 600 : 0);

  function enemiesNear(b, r) {
    const out = [];
    for (const u of G.ents) if (!u.dead && u.kind === 'unit' && G.enemies(u.owner, b.owner) && G.edgeDist(u, b) <= r) out.push(u);
    return out;
  }

  // ---------- Capture ----------
  let tick = 0;
  function captureStep(dt) {
    tick += dt; if (tick < 0.25) return; const step = tick; tick = 0;
    for (const t of tcs()) {
      const c = t.cap = t.cap || { v: 0, side: null, by: 0 };
      const low = t.hp < t.maxHp * CAP.LOW && !(t.immune > G.time);
      // who is standing at the walls: units count after 1 s there; not villagers or siege for the attacker
      const by = {};
      let defenders = 0;
      for (const u of G.ents) {
        if (u.dead || u.kind !== 'unit' || G.edgeDist(u, t) > 1.6) { if (u.capAt === t.id) u.capAt = 0; continue; }
        if (u.capAt !== t.id) { u.capAt = t.id; u.capSince = G.time; }
        if (G.time - u.capSince < 1) continue;
        if (t.owner > 0 && G.allied(u.owner, t.owner)) { defenders += u.type === 'villager' ? 0.5 : 1; continue; }
        if (u.type === 'villager' || u.def.siege || u.def.heal) continue;
        const s = side(u.owner); (by[s] = by[s] || { n: 0, who: {} }).n++; by[s].who[u.owner] = (by[s].who[u.owner] || 0) + 1;
      }
      const sides = Object.keys(by).sort((a, b) => by[b].n - by[a].n);
      let lead = sides[0];
      // a tie goes to whoever started the capture
      if (sides.length > 1 && by[sides[0]].n === by[sides[1]].n && c.side && by[c.side]) lead = c.side;
      const a = lead ? by[lead].n : 0;
      let rate = 0;
      if (low && a > 0) {
        rate = Math.min(0.1, a * 0.01);                    // 5 men: 20 s, 10 or more: 10 s
        if (defenders > 0) rate = a >= defenders * 3 ? rate * 0.5 : 0;   // contested
      }
      c.contested = low && a > 0 && rate === 0;
      if (rate > 0) {
        if (c.side && c.side !== lead && c.v > 0) c.v = Math.max(0, c.v - rate * step);     // undo the other side's progress first
        else {
          if (!c.side || c.v === 0) { c.side = lead; c.started = G.time; }
          c.v = Math.min(1, c.v + rate * step);
          // the owner hears about it once in a while
          if (t.owner === 1 && (!c.warned || G.time - c.warned > 15)) { c.warned = G.time; alert('🏳️ Your Town Center is being captured! Send soldiers to stand beside it.'); if (G.sound) G.sound.play('attacked'); if (G.ui && G.ui.buzz) G.ui.buzz(200); }
        }
      } else if (!c.contested && c.v > 0) c.v = Math.max(0, c.v - 0.03 * step);       // drains slowly, never snaps back
      if (c.v === 0 && !c.contested) c.side = null;
      if (c.v >= 1 && lead) {
        const who = Object.entries(by[lead].who).sort((x, y) => y[1] - x[1])[0][0];
        flip(t, +who);
      }
      // hold timer for the win: an enemy's home Town Center held uninterrupted
      if (t.homeOf && t.homeOf !== t.owner && t.owner > 0 && G.enemies(t.homeOf, t.owner)) {
        if (c.v === 0 && !c.contested) t.hold = (t.hold || 0) + step;
      } else t.hold = 0;
    }
    // losing the last Town Center: 90 s to take one back
    for (const id in G.players) {
      const p = G.players[id]; if (!p.alive || p.raider) continue;
      const has = tcs().some(t => t.owner === +id);
      if (has) { if (p.noTC) { p.noTC = 0; if (+id === 1) alert('🏰 You hold a Town Center again!'); } continue; }
      if (!p.noTC) { p.noTC = G.time; alert(+id === 1 ? `⚠️ You have no Town Center! Capture one within ${CAP.GRACE} seconds or your dynasty falls.` : `🏳️ ${nameOf(id)} have lost their last Town Center!`); }
      else if (G.time - p.noTC >= CAP.GRACE) { if (+id === 1 || true) alert(+id === 1 ? '🏳️ Without a Town Center your dynasty has fallen.' : `🏳️ ${nameOf(id)} have fallen.`); G.eliminate(+id); G.checkEnd(); }
    }
    // winning: every Town Center on the map, or an enemy's home Town Center held for 3 minutes
    if (G.over) return;
    const all = tcs().filter(t => t.owner > 0);
    const sideOfAll = all.length ? side(all[0].owner) : null;
    let winner = null;
    if (all.length && all.every(t => side(t.owner) === sideOfAll) && tcs().every(t => t.owner > 0)) winner = sideOfAll;
    const held = all.find(t => (t.hold || 0) >= CAP.HOLD);
    if (!winner && held) winner = side(held.owner);
    if (winner) {
      for (const id in G.players) if (G.players[id].alive && side(+id) !== winner) G.eliminate(+id);
      G.overReason = held ? 'hold' : 'alltc';
      G.checkEnd();
    }
  }
  function flip(t, to) {
    const from = t.owner;
    if (t.garrison && t.garrison.length) G.ungarrison(t);
    t.queue = []; t.qt = 0; t.research = null; t.rally = null;   // no refund, and the captor gets nothing half-made
    t.owner = to; t.hp = Math.round(t.maxHp * CAP.AFTER); t.immune = G.time + CAP.IMMUNE; t.hold = 0;
    t.cap = { v: 0, side: null };
    const sf = G.players[from] && (G.players[from].stats = G.players[from].stats || {}), st = G.players[to].stats = G.players[to].stats || {};
    st.tcCaptured = (st.tcCaptured || 0) + 1; if (sf) sf.tcLost = (sf.tcLost || 0) + 1;
    if (G.ui && G.ui.onKilled) G.ui.onKilled(t);   // drops it from anyone's selection
    if (to === 1) { alert('🏰 Town Center captured! It is yours now: repair it, and hold it.'); if (G.sound) G.sound.play('ageup'); }
    else if (from === 1) { alert(`🏳️ ${nameOf(to)} captured your Town Center!`); if (G.sound) G.sound.play('kingdown'); }
    else alert(`🏰 ${nameOf(to)} captured ${from ? nameOf(from).replace(/^The /, 'the ') + "'s" : 'the neutral'} Town Center`);
    if (G.effects) G.effects.push({ t: 'ping', x: t.x, y: t.y, col: '#ffd76a', life: 0.6 });
  }

  // ---------- Siege Survival ----------
  const LVL = { easy: 0.6, normal: 1, hard: 1.4, brutal: 1.9 };
  function survivalStep(dt) {
    const S = G.surv; if (!S || G.over) return;
    const raid = G.players[S.raider]; if (!raid) return;
    const alive = G.ents.filter(e => !e.dead && e.owner === S.raider && e.kind === 'unit');
    if (S.active && alive.length === 0) {           // wave beaten
      S.active = false; S.done = S.wave; S.next = G.time + S.brk;
      alert(`🛡️ Wave ${S.wave} beaten! The next comes in ${S.brk} seconds.`);
      if (G.sound) G.sound.play('complete');
    }
    // stragglers that lose their way are sent at the town again
    if (S.active && Math.floor(G.time) % 5 === 0 && Math.floor(G.time - dt) % 5 !== 0) for (const u of alive) if (u.task.t === 'idle') aim([u]);
    if (!S.active && G.time >= S.next) spawnWave();
    if (G.ui && G.ui.waveBar) G.ui.waveBar(S, alive.length);
  }
  function aim(units) {
    const foes = G.ents.filter(e => !e.dead && e.owner > 0 && !G.players[e.owner].raider && (e.kind === 'building' && e.type !== 'farm' || e.kind === 'unit'));
    for (const u of units) {
      let best = null, bd = 1e9;
      for (const f of foes) { const d = Math.hypot(f.x - u.x, f.y - u.y) + (f.kind === 'unit' ? 4 : 0); if (d < bd) { bd = d; best = f; } }
      if (best) { G.cmdAttack([u], best); u.task.forced = true; }
    }
  }
  function spawnWave() {
    const S = G.surv, n = ++S.wave, k = LVL[S.lvl] || 1, raid = G.players[S.raider];
    S.active = true;
    raid.age = Math.min(4, 1 + Math.floor(n / 4));
    const tier = Math.floor(n / 5);
    raid.up = { militia: Math.min(3, tier), spearman: Math.min(2, tier), archer: Math.min(2, tier), knight: Math.min(2, Math.max(0, tier - 1)) };
    // where they come from: the map edge farthest from the defenders' heart, different each time
    const home = G.ents.find(e => !e.dead && e.type === 'towncenter' && e.owner === 1) || { x: G.MAP / 2, y: G.MAP / 2 };
    const N = G.MAP, edges = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; edges.push({ x: N / 2 + Math.cos(a) * N * 0.46, y: N / 2 + Math.sin(a) * N * 0.46 }); }
    edges.sort((a, b) => Math.hypot(b.x - home.x, b.y - home.y) - Math.hypot(a.x - home.x, a.y - home.y));
    const from = edges[Math.floor(Math.random() * 5)];
    const count = Math.round((3 + n * 1.6) * k);
    const pool = n < 3 ? ['militia', 'militia', 'spearman', 'archer'] : n < 6 ? ['militia', 'spearman', 'archer', 'archer', 'scout'] : ['militia', 'spearman', 'archer', 'knight', 'scout', 'archer'];
    const units = [];
    const put = type => { const f = G.nearestFree(from.x | 0, from.y | 0, 10); if (f) units.push(G.addUnit(type, S.raider, f.x + 0.5, f.y + 0.5)); };
    for (let i = 0; i < count; i++) put(pool[Math.floor(Math.random() * pool.length)]);
    const boss = n % 5 === 0;
    if (boss) { for (let i = 0; i < Math.max(1, Math.floor(n / 5)); i++) put('ram'); if (n >= 10) put('trebuchet'); if (n >= 15) put('king'); }
    aim(units);
    S.from = { x: from.x, y: from.y, until: G.time + 25 };
    const dir = (() => { const a = Math.atan2(from.y - home.y, from.x - home.x), d = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']; return d[(Math.round(a / (Math.PI / 4)) + 8) % 8]; })();
    alert(`${boss ? '💀 Boss wave' : '⚔️ Wave'} ${n}: ${units.length} raiders${boss ? ' with siege' : ''} coming!`);
    if (G.sound) G.sound.play('attacked');
    if (G.ui && G.ui.buzz) G.ui.buzz([120, 60, 120]);
  }
  // survival ends when the defenders lose their last Town Center
  function survivalLost() {
    if (!G.surv || G.over) return;
    const has = G.ents.some(e => !e.dead && e.type === 'towncenter' && e.owner > 0 && !G.players[e.owner].raider && G.allied(e.owner, 1));
    if (!has) { G.overReason = 'survival'; for (const id in G.players) if (G.allied(+id, 1)) G.eliminate(+id); G.checkEnd(); }
  }

  // ---------- set-up at match start ----------
  G.modeSetup = function (starts, r) {
    const m = G.rules.mode;
    for (const t of G.ents) if (t.type === 'towncenter' && !t.dead) t.homeOf = t.owner;
    if (m === 'capture' && G.rules.neutral) {
      const N = G.MAP, f = G.nearestFree(Math.round(N / 2 - 2), Math.round(N / 2 - 2), 8);
      if (f) { for (let j = -1; j <= 4; j++) for (let i = -1; i <= 4; i++) { const id = G.inMap(f.x + i, f.y + j) && G.block[G.idx(f.x + i, f.y + j)], e = id > 0 && G.byId.get(id); if (e && e.kind === 'res') { e.dead = true; G.setBlock(e, 0); } }
        const t = G.addBuilding('towncenter', 0, f.x, f.y, true); t.hp = Math.round(t.maxHp * 0.2); t.neutral = true; }
      G.ents = G.ents.filter(e => !e.dead);
    }
    if (m === 'survival') {
      const used = new Set(Object.values(G.players).map(p => p.civ)), pool = Object.keys(G.CIVS);
      const civ = pool.find(c => !used.has(c)) || pool[0], id = Object.keys(G.players).length + 1;
      const p = G.makePlayer(id, civ, { team: 99, ai: null }); p.raider = true; p.color = 1;
      // the raiders wear red; if a defender already does, they take the darkest free colour
      const taken = new Set(Object.values(G.players).map(q => q.color)); if (taken.has(1)) p.color = [7, 6, 5, 4, 3, 2, 0].find(c => !taken.has(c)) ?? 7;
      G.players[id] = p;
      G.applyColors();
      G.surv = { raider: id, wave: 0, done: 0, brk: G.rules.wave || 60, lvl: G.rules.raidLvl || 'normal', active: false, next: 120 };
    } else G.surv = null;
    if (m === 'empirewars') for (const s of starts) empireTown(s.p, r);
  };

  // Empire Wars: a working Feudal town for everyone
  function spot(type, cx, cy, rmin, rmax) {
    const s = G.BUILDINGS[type].size;
    for (let rr = rmin; rr <= rmax; rr++) for (let k = 0; k < 24; k++) {
      const a = k / 24 * Math.PI * 2 + rr, x = Math.round(cx + Math.cos(a) * rr - s / 2), y = Math.round(cy + Math.sin(a) * rr - s / 2);
      if (G.areaFree(x - 1, y - 1, s + 2)) return { x, y };
    }
    return null;
  }
  function nearestRes(type, x, y) { let b = null, bd = 1e9; for (const e of G.ents) if (!e.dead && e.type === type) { const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; b = e; } } return b; }
  function empireTown(owner, r) {
    const tc = G.ents.find(e => e.type === 'towncenter' && e.owner === owner); if (!tc) return;
    const p = G.players[owner], cx = tc.x, cy = tc.y;
    p.res = { food: 300, wood: 250, gold: 150, stone: 150 };
    const put = (type, near, rmin, rmax) => { const c = near || { x: cx, y: cy }, s = spot(type, c.x, c.y, rmin, rmax); return s ? G.addBuilding(type, owner, s.x, s.y, true) : null; };
    for (let i = 0; i < 4; i++) put('house', null, 6, 12);
    const wood = nearestRes('tree', cx, cy), gold = nearestRes('gold', cx, cy), stone = nearestRes('stone', cx, cy), berry = nearestRes('berry', cx, cy);
    const lc = wood && put('lumbercamp', wood, 2, 5), mc = gold && put('miningcamp', gold, 2, 4), mill = berry && put('mill', berry, 2, 4);
    put('barracks', null, 7, 12);
    const farms = []; for (let i = 0; i < 6; i++) { const f = put('farm', mill || null, 3, 9); if (f) farms.push(f); }
    // twenty villagers in total, already at work
    const have = G.ents.filter(e => !e.dead && e.owner === owner && e.type === 'villager');
    const jobs = [...farms.map(f => ['farm', f]), ...Array(6).fill(['tree', wood]), ...Array(4).fill(['gold', gold]), ...Array(2).fill(['stone', stone]), ...Array(2).fill(['berry', berry])].slice(0, 20);
    jobs.forEach((j, i) => {
      let v = have[i];
      if (!v) { const f = G.nearestFree(Math.round(cx + 2), Math.round(cy + 3), 8); if (!f) return; v = G.addUnit('villager', owner, f.x + 0.5, f.y + 0.5); }
      if (j[0] === 'farm') G.cmdFarm([v], j[1]);
      else { const t = j[1] && nearestRes(j[0], j[1].x, j[1].y); if (t) G.cmdGather([v], t); }
    });
    for (let i = 0; i < 2; i++) { const f = G.nearestFree(Math.round(cx + 4), Math.round(cy + 4), 8); if (f) G.addUnit(i ? 'spearman' : 'militia', owner, f.x + 0.5, f.y + 0.5); }
  }

  // ---------- the loop ----------
  G.modeStep = function (dt) {
    if (isCap()) captureStep(dt);
    if (isSurv()) { survivalStep(dt); survivalLost(); }
  };
})();
