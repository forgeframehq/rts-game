// World setup, main loop, victory.
(function () {
  let N = G.MAP;

  function cluster(r, type, cx, cy, count, spread) {
    let placed = 0, tries = 0;
    const pts = [{ x: cx, y: cy }];
    while (placed < count && tries < count * 30) {
      tries++;
      const p = pts[Math.floor(r() * pts.length)];
      const x = Math.round(p.x + (r() * 2 - 1) * (spread || 1)), y = Math.round(p.y + (r() * 2 - 1) * (spread || 1));
      if (!G.inMap(x, y) || x < 1 || y < 1 || x > N - 2 || y > N - 2) continue;
      if (G.addResource(type, x, y)) { placed++; pts.push({ x, y }); }
    }
  }

  function startResources(r, cx, cy, avoidAngle) {
    // pick angles for each resource around the TC
    const ang = [];
    const pick = () => { for (let k = 0; k < 50; k++) { const a = r() * Math.PI * 2; if (ang.every(b => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > 0.9)) { ang.push(a); return a; } } const a = r() * 6.28; ang.push(a); return a; };
    let a = pick(); cluster(r, 'berry', Math.round(cx + Math.cos(a) * 5.5), Math.round(cy + Math.sin(a) * 5.5), 6, 1);
    a = pick(); cluster(r, 'gold', Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 8), 6, 1);
    a = pick(); cluster(r, 'stone', Math.round(cx + Math.cos(a) * 9), Math.round(cy + Math.sin(a) * 9), 5, 1);
    a = pick(); cluster(r, 'tree', Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 8), 30, 2);
    a = pick(); cluster(r, 'tree', Math.round(cx + Math.cos(a) * 10), Math.round(cy + Math.sin(a) * 10), 22, 2);
  }

  // config: { players: [{ civ, team, ai }], size, res, pop, reveal, seed }
  // players[0] is always the human. ai is a difficulty ('easy'|'normal'|'hard') for computer players.
  G.applyColors = function () {
    for (const id in G.players) { const c = G.PALETTE[G.players[id].color != null ? G.players[id].color : (+id - 1)] || G.PALETTE[0]; G.PLAYER_COLORS[id] = c[1]; G.PLAYER_COLOR_NAMES[id] = c[0]; }
  };
  G.newGame = function (config) {
    config = config || {};
    const seed = config.seed || (Math.random() * 1e9) | 0;
    G.config = { ...config, seed };
    G.rules = { size: config.size || 'medium', res: config.res || 'standard', pop: config.pop || 200, reveal: config.reveal || 'normal', shape: 'diamond', mode: config.mode || 'conquest', time: +config.time || 0, map: 'grasslands', wave: +config.wave || 60, neutral: !!config.neutral, raidLvl: config.raidLvl || 'normal', startAge: Math.min(4, Math.max(1, +config.startAge || 1)) };
    G.MAP = (G.rules.shape === 'diamond' ? G.MAP_SIZES : G.MAP_SIZES_RECT)[G.rules.size] || 72;
    N = G.MAP;
    G.ents = []; G.byId = new Map(); G.projs = []; G.effects = []; G.decals = []; G.corpses = [];
    G.setNextId(1);
    G.initMap(seed);
    const slots = (config.players && config.players.length ? config.players : [{ civ: 'britons' }, { civ: 'franks', ai: 'normal' }]);
    G.players = {};
    slots.forEach((s, i) => { G.players[i + 1] = G.makePlayer(i + 1, s.civ, { team: s.team || 0, ai: i === 0 ? null : (s.ai || 'normal') }); });
    // colours: each player's pick, or with team colours on, one colour per team
    const used = new Set();
    slots.forEach((s, i) => {
      let c = config.teamColors && s.team > 0 ? s.team - 1 : (s.color != null ? s.color : i);
      if (!config.teamColors) { while (used.has(c)) c = (c + 1) % G.PALETTE.length; used.add(c); }
      G.players[i + 1].color = c;
      const R = G.ROYALS[s.civ] || G.ROYALS.britons, pick = R.names[Math.floor(G.mapRng ? (i * 7 + seed) % R.names.length : 0)];
      G.players[i + 1].royals = { king: s.kingName || pick[0], queen: s.queenName || pick[1] };
    });
    G.applyColors();
    // a later starting Age, as in AoE2's setup: everyone begins already advanced
    for (const id in G.players) G.players[id].age = G.rules.startAge;
    if (G.loadCivArt && !config.demo) for (const id in G.players) G.loadCivArt(G.players[id].civ);
    G.time = 0; G.over = null; G.overReason = null; if (G.resetTimeWarnings) G.resetTimeWarnings();
    const r = G.mapRng;
    // corner spots: bottom-left, top-right, top-left, bottom-right on screen
    let spots;
    if (G.view.rect) {
      // corners of the screen rectangle, pulled in so each base has room around it
      const A = G.view.a, B = G.view.b, ia = Math.round(A * 0.62), ib = Math.round(B * 0.62);
      const at = (d, s) => ({ x: Math.round((s + N + d) / 2) - 1, y: Math.round((s + N - d) / 2) - 1 });
      spots = [at(-ia, ib), at(ia, -ib), at(-ia, -ib), at(ia, ib)];
    } else {
      const m = Math.round(N * 0.18);
      spots = [{ x: m, y: N - m - 3 }, { x: N - m - 3, y: m }, { x: m, y: m }, { x: N - m - 3, y: N - m - 3 }];
    }
    const starts = slots.map((s, i) => ({ p: i + 1, x: spots[i].x, y: spots[i].y }));
    G.rules.map = G.pickMap ? G.pickMap(config.map || 'grasslands', r) : 'grasslands';
    if (G.mapPaint) G.mapPaint(G.rules.map, r, starts);
    // Town centers first (so resources avoid them)
    const tcs = starts.map(s => G.addBuilding('towncenter', s.p, s.x, s.y, true));
    // Regicide: each player is given a King and a Queen. Lose both and the dynasty falls.
    if (G.rules.mode === 'regicide') for (const s of starts) {
      G.addUnit('king', s.p, s.x + 3.5, s.y + 4.2);
      G.addUnit('queen', s.p, s.x + 4.4, s.y + 3.6);
    }
    if (G.mapWalls) G.mapWalls(G.rules.map, starts);
    for (const s of starts) startResources(r, s.x + 2, s.y + 2);   // around the 4x4 Town Center's middle
    // Forests and scattered resources across the map, away from starts
    const far = (x, y) => starts.every(s => Math.hypot(x - s.x, y - s.y) > 13);
    // random points inside the playable area
    const playArea = G.view.rect ? 2 * G.view.a * G.view.b : N * N;
    const scale = playArea / (72 * 72);
    const rnd = (pad) => {
      if (!G.view.rect) return { x: pad + Math.floor(r() * (N - pad * 2)), y: pad + Math.floor(r() * (N - pad * 2)) };
      const d = (r() * 2 - 1) * (G.view.a - pad), s = (r() * 2 - 1) * (G.view.b - pad);
      return { x: Math.round((s + N + d) / 2), y: Math.round((s + N - d) / 2) };
    };
    for (let k = 0; k < Math.round(22 * scale * (G.mapForest ? G.mapForest(G.rules.map) : 1)); k++) {
      const { x, y } = rnd(3);
      if (far(x, y)) cluster(r, 'tree', x, y, 18 + Math.floor(r() * 30), 2);
    }
    for (let k = 0; k < Math.round(8 * scale); k++) {
      const { x, y } = rnd(6);
      if (far(x, y)) cluster(r, k % 3 === 0 ? 'stone' : k % 3 === 1 ? 'gold' : 'berry', x, y, 5, 1);
    }
    if (G.mapExtras) G.mapExtras(G.rules.map, r, starts, cluster);
    // Starting villagers
    for (const tc of tcs) {
      const md = G.CIVS[G.players[tc.owner].civ].mods;
      const n = 3 + (md.extraVils || 0);
      for (let i = 0; i < n; i++) {
        const f = G.nearestFree(tc.tx + 1 + (i % 3), tc.ty + 5 + Math.floor(i / 3), 6);
        G.addUnit('villager', tc.owner, f.x + 0.5, f.y + 0.5);
      }
    }
    if (G.modeSetup) G.modeSetup(starts, r);
    G.revealAll = G.rules.reveal === 'all';
    if (G.rules.reveal === 'explored') G.explored.fill(1);
    G.updateFog();
    G.camera.focus(tcs[0].x, tcs[0].y + 2);
    G.ais = [];
    for (const id in G.players) {
      const p = G.players[id];
      if (!p.ai) continue;
      const a = G.makeAI(); a.level = p.ai; a.init(+id); G.ais.push(a);
    }
    if (G.ui) G.ui.reset();
  };

  // Walls and fields don't keep a dynasty alive: nobody should have to hunt down a lone palisade.
  // Units sheltering in a building still count.
  const counts = x => !x.dead && (x.kind === 'unit' || x.kind === 'building' && x.type !== 'farm' && !x.def.wall);
  const hasStuff = p => G.unitsOf(p).length > 0 || G.ents.some(x => x.owner === p && x.kind === 'building' && counts(x));
  // Regicide: the dynasty stands while either royal lives; when the King falls the Queen rules on
  const royalsDown = p => G.rules && G.rules.mode === 'regicide' && !G.royal(p, 'king') && !G.royal(p, 'queen');
  // Town Center Siege: a dynasty without a standing Town Center is beaten
  const tcsDown = p => G.rules && G.rules.mode === 'tcrush' && !G.ents.some(e => !e.dead && e.owner === p && e.type === 'towncenter' && e.built);
  const nameOf = id => +id === 1 ? 'Your' : `The ${G.CIVS[G.players[id].civ].name}'`;
  G.MOURN = 120;

  // a defeated or resigning dynasty's town falls with it
  G.eliminate = function (id) {
    const p = G.players[id]; if (!p) return;
    p.alive = false;
    for (const e of G.ents.slice()) if (!e.dead && e.owner === +id && e.kind === 'building') G.kill(e);
    for (const e of G.ents.slice()) if (!e.dead && e.owner === +id && e.kind === 'unit') G.kill(e);
  };
  G.resign = function (id) {
    const p = G.players[id]; if (!p || !p.alive || G.over) return;
    if (G.ui) G.ui.alert(`🏳️ ${G.CIVS[p.civ].name} (${G.PLAYER_COLOR_NAMES[id]}) resigned`);
    G.eliminate(id);
    checkEnd();
  };

  // Score, AoE2-style: economy, military and progress. Used for the time limit and the end screen.
  G.scoreOf = function (id) {
    const p = G.players[id], g = p.gathered;
    const ups = Object.values(p.up || {}).reduce((a, b) => a + b, 0) + Object.keys(p.techs || {}).length;
    return Math.round((g.food + g.wood + g.gold + g.stone) / 10 + (p.killValue || 0) / 5 + (p.age - 1) * 150 + ups * 20 + (G.modeScore ? G.modeScore(id) : 0));
  };
  const sideOf = id => G.players[id].team > 0 ? 't' + G.players[id].team : 'p' + id;

  G.checkEnd = () => checkEnd();
  function checkEnd() {
    if (G.over) return;
    if (!G.players[1].alive) { G.over = 'defeat'; if (G.ui) G.ui.gameOver(G.over); return; }
    const foes = Object.keys(G.players).filter(id => G.players[id].alive && G.enemies(1, +id));
    if (!foes.length) { G.over = 'victory'; if (G.ui) G.ui.gameOver(G.over); }
  }

  G.onKilled = function (e) {
    if (G.ui && G.ui.onKilled) G.ui.onKilled(e);
    if (G.over || e.owner === 0) return;
    // a royal has fallen but the other still lives
    if (G.rules.mode === 'regicide' && e.def.cls === 'hero' && G.players[e.owner].alive && !royalsDown(e.owner)) {
      const p = G.players[e.owner];
      if (e.type === 'king') {
        p.mourn = G.time + G.MOURN;
        if (G.ui) G.ui.alert(`👑 ${e.owner === 1 ? 'Your ' : ''}${G.royalName(e.owner, 'king')} has fallen! ${G.royalName(e.owner, 'queen')} takes the throne.`);
      } else if (G.ui) G.ui.alert(`👸 ${e.owner === 1 ? 'Your ' : ''}${G.royalName(e.owner, 'queen')} has fallen!`);
    }
    for (const id in G.players) {
      const p = G.players[id];
      if (!p.alive || p.raider) continue;
      const lostCrown = royalsDown(+id), lostTC = tcsDown(+id);
      if (!hasStuff(+id) || lostCrown || lostTC) {
        p.alive = false;
        if (G.ui) {
          if (lostCrown) G.ui.alert(+id === 1 ? '👑 Your King and Queen are dead. Your dynasty has fallen.' : `👑 ${nameOf(id)} King and Queen are dead. Their dynasty has fallen!`);
          else if (lostTC) G.ui.alert(+id === 1 ? '🏚️ Your last Town Center has fallen.' : `🏚️ The ${G.CIVS[p.civ].name}' last Town Center has fallen!`);
          else if (+id !== 1) G.ui.alert(`${G.CIVS[p.civ].name} (${G.PLAYER_COLOR_NAMES[id]}) has been defeated!`);
        }
        if ((lostCrown || lostTC) && +id !== 1) G.eliminate(+id);
      }
    }
    // when an enemy is down to its last few pieces, show them on the minimap so the hunt doesn't drag
    for (const id in G.players) {
      const p = G.players[id];
      if (!p.alive || p.exposed || !G.enemies(1, +id)) continue;
      const left = G.unitsOf(+id).length + G.ents.filter(x => x.owner === +id && x.kind === 'building' && counts(x)).length;
      if (left <= 6) { p.exposed = true; if (G.ui) G.ui.alert(`📍 ${G.CIVS[p.civ].name}'s last forces are shown on the minimap`); }
    }
    checkEnd();
  };

  // Time limit: when the clock runs out, the side with the highest score wins
  let warned = 0;
  function checkTime() {
    const lim = G.rules && G.rules.time ? G.rules.time * 60 : 0;
    if (!lim || G.over) return;
    const left = lim - G.time;
    if (left <= 300 && warned < 1 && lim > 300) { warned = 1; if (G.ui) G.ui.alert('⏳ 5 minutes left. Highest score wins.'); }
    if (left <= 60 && warned < 2) { warned = 2; if (G.ui) G.ui.alert('⏳ 1 minute left!'); }
    if (left > 0) return;
    const sides = {};
    for (const id in G.players) if (G.players[id].alive) { const k = sideOf(+id); sides[k] = (sides[k] || 0) + G.scoreOf(+id); }
    const mine = sides[sideOf(1)] || 0;
    const best = Math.max(...Object.keys(sides).filter(k => k !== sideOf(1)).map(k => sides[k]), 0);
    G.over = mine >= best ? 'victory' : 'defeat';
    G.overReason = 'time';
    if (G.ui) G.ui.gameOver(G.over);
  }
  G.resetTimeWarnings = () => { warned = G.rules && G.rules.time && G.time > G.rules.time * 60 - 300 ? (G.time > G.rules.time * 60 - 60 ? 2 : 1) : 0; G.overReason = null; };

  G.speed = 1;
  G.paused = false;
  let last = 0, fogT = 0;
  G.step = function (dt) {
    G.time += dt;
    G.updateEntities(dt);
    if (G.tutorial && G.tutorial.on) G.tutorial.update();
    if (G.modeStep) G.modeStep(dt);
    if (G.ais) for (const a of G.ais) if (G.players[a.p] && G.players[a.p].alive) a.update(dt);
    fogT -= dt; if (fogT <= 0) { G.updateFog(); fogT = 0.2; checkTime(); }
    // every 30 s: a point on each player's score timeline, and their peak army and workforce
    if (Math.floor(G.time / 30) !== Math.floor((G.time - dt) / 30)) for (const id in G.players) {
      const p = G.players[id], st = p.stats = p.stats || {};
      (st.timeline = st.timeline || []).push([Math.round(G.time), G.scoreOf(+id)]);
      const army = G.ents.filter(e => !e.dead && e.owner === +id && e.kind === 'unit' && e.type !== 'villager' && e.def.cls !== 'hero').length;
      const vils = G.ents.filter(e => !e.dead && e.owner === +id && e.type === 'villager').length;
      st.peakArmy = Math.max(st.peakArmy || 0, army); st.peakVils = Math.max(st.peakVils || 0, vils);
    }
  };
  // AoE2's four score categories, for the results screen
  G.scoreParts = function (id) {
    const p = G.players[id], g = p.gathered;
    const ups = Object.values(p.up || {}).reduce((a, b) => a + b, 0) + Object.keys(p.techs || {}).length;
    return { military: Math.round((p.killValue || 0) / 5), economy: Math.round((g.food + g.wood + g.gold + g.stone) / 10), technology: ups * 20, society: (p.age - 1) * 150 };
  };
  function frame(t) {
    const real = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    if (!G.paused && !G.over && G.ents.length) {
      const dt = real * G.speed;
      // substeps keep movement stable at higher speeds
      const n = Math.ceil(dt / 0.034);
      for (let i = 0; i < n; i++) G.step(dt / n);
    }
    G.frameDt = real;
    G.camera.update(real);
    G.render();
    if (G.ui) G.ui.update(real);
    requestAnimationFrame(frame);
  }
  G.start = function () { requestAnimationFrame(t => { last = t; frame(t); }); };
})();
