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
  G.newGame = function (config) {
    config = config || {};
    const seed = config.seed || (Math.random() * 1e9) | 0;
    G.config = { ...config, seed };
    G.rules = { size: config.size || 'medium', res: config.res || 'standard', pop: config.pop || 200, reveal: config.reveal || 'normal', shape: config.shape || 'rect' };
    G.MAP = (G.rules.shape === 'diamond' ? G.MAP_SIZES : G.MAP_SIZES_RECT)[G.rules.size] || 72;
    N = G.MAP;
    G.ents = []; G.byId = new Map(); G.projs = []; G.effects = []; G.decals = []; G.corpses = [];
    G.setNextId(1);
    G.initMap(seed);
    const slots = (config.players && config.players.length ? config.players : [{ civ: 'britons' }, { civ: 'franks', ai: 'normal' }]);
    G.players = {};
    slots.forEach((s, i) => { G.players[i + 1] = G.makePlayer(i + 1, s.civ, { team: s.team || 0, ai: i === 0 ? null : (s.ai || 'normal') }); });
    G.time = 0; G.over = null;
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
    // Town centers first (so resources avoid them)
    const tcs = starts.map(s => G.addBuilding('towncenter', s.p, s.x, s.y, true));
    for (const s of starts) startResources(r, s.x + 1, s.y + 1);
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
    for (let k = 0; k < Math.round(22 * scale); k++) {
      const { x, y } = rnd(3);
      if (far(x, y)) cluster(r, 'tree', x, y, 18 + Math.floor(r() * 30), 2);
    }
    for (let k = 0; k < Math.round(8 * scale); k++) {
      const { x, y } = rnd(6);
      if (far(x, y)) cluster(r, k % 3 === 0 ? 'stone' : k % 3 === 1 ? 'gold' : 'berry', x, y, 5, 1);
    }
    // Starting villagers
    for (const tc of tcs) {
      const md = G.CIVS[G.players[tc.owner].civ].mods;
      const n = 3 + (md.extraVils || 0);
      for (let i = 0; i < n; i++) {
        const f = G.nearestFree(tc.tx + 1 + (i % 3) - 1, tc.ty + 4 + Math.floor(i / 3), 6);
        G.addUnit('villager', tc.owner, f.x + 0.5, f.y + 0.5);
      }
    }
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

  const hasStuff = p => G.ents.some(x => !x.dead && x.owner === p && (x.kind === 'building' && x.type !== 'farm' || x.kind === 'unit'));
  G.onKilled = function (e) {
    if (G.ui && G.ui.onKilled) G.ui.onKilled(e);
    if (G.over || e.owner === 0) return;
    for (const id in G.players) {
      const p = G.players[id];
      if (p.alive && !hasStuff(+id)) { p.alive = false; if (+id !== 1 && G.ui) G.ui.alert(`${G.CIVS[p.civ].name} (${G.PLAYER_COLOR_NAMES[id]}) has been defeated!`); }
    }
    if (!G.players[1].alive) { G.over = 'defeat'; if (G.ui) G.ui.gameOver(G.over); return; }
    const foes = Object.keys(G.players).filter(id => G.players[id].alive && G.enemies(1, +id));
    if (!foes.length) { G.over = 'victory'; if (G.ui) G.ui.gameOver(G.over); }
  };

  G.speed = 1;
  G.paused = false;
  let last = 0, fogT = 0;
  G.step = function (dt) {
    G.time += dt;
    G.updateEntities(dt);
    if (G.ais) for (const a of G.ais) if (G.players[a.p] && G.players[a.p].alive) a.update(dt);
    fogT -= dt; if (fogT <= 0) { G.updateFog(); fogT = 0.2; }
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
