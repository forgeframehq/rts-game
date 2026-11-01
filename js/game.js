// World setup, main loop, victory.
(function () {
  const N = G.MAP;

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

  G.newGame = function (civ1, civ2, seed) {
    seed = seed || (Math.random() * 1e9) | 0;
    G.ents = []; G.byId = new Map(); G.projs = []; G.effects = [];
    G.initMap(seed);
    G.players = { 1: G.makePlayer(1, civ1), 2: G.makePlayer(2, civ2) };
    G.time = 0; G.over = null;
    const r = G.mapRng;
    const starts = [{ p: 1, x: 13, y: N - 16 }, { p: 2, x: N - 16, y: 13 }];
    // Town centers first (so resources avoid them)
    const tcs = starts.map(s => G.addBuilding('towncenter', s.p, s.x, s.y, true));
    for (const s of starts) startResources(r, s.x + 1, s.y + 1);
    // Forests and scattered resources across the map, away from starts
    const far = (x, y) => starts.every(s => Math.hypot(x - s.x, y - s.y) > 13);
    for (let k = 0; k < 22; k++) {
      const x = 3 + Math.floor(r() * (N - 6)), y = 3 + Math.floor(r() * (N - 6));
      if (far(x, y)) cluster(r, 'tree', x, y, 18 + Math.floor(r() * 30), 2);
    }
    for (let k = 0; k < 8; k++) {
      const x = 6 + Math.floor(r() * (N - 12)), y = 6 + Math.floor(r() * (N - 12));
      if (far(x, y)) cluster(r, k % 3 === 0 ? 'stone' : k % 3 === 1 ? 'gold' : 'berry', x, y, 5, 1);
    }
    // Starting villagers
    for (const tc of tcs) {
      const m = G.CIVS[G.players[tc.owner].civ].mods;
      const n = 3 + (m.extraVils || 0);
      for (let i = 0; i < n; i++) {
        const f = G.nearestFree(tc.tx + 1 + (i % 3) - 1, tc.ty + 4 + Math.floor(i / 3), 6);
        G.addUnit('villager', tc.owner, f.x + 0.5, f.y + 0.5);
      }
    }
    G.updateFog();
    const tc1 = tcs[0];
    G.camera.focus(tc1.x, tc1.y + 2);
    if (G.ai) G.ai.init(2);
    if (G.ui) G.ui.reset();
  };

  G.onKilled = function (e) {
    if (G.over || e.owner === 0) return;
    for (const p of [1, 2]) {
      const has = G.ents.some(x => !x.dead && x.owner === p && (x.kind === 'building' && x.type !== 'farm' || x.kind === 'unit'));
      if (!has) { G.players[p].alive = false; G.over = p === 1 ? 'defeat' : 'victory'; if (G.ui) G.ui.gameOver(G.over); }
    }
    if (G.ui && G.ui.onKilled) G.ui.onKilled(e);
  };

  G.speed = 1;
  G.paused = false;
  let last = 0, fogT = 0;
  G.step = function (dt) {
    G.time += dt;
    G.updateEntities(dt);
    if (G.ai) G.ai.update(dt);
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
    G.camera.update(real);
    G.render();
    if (G.ui) G.ui.update(real);
    requestAnimationFrame(frame);
  }
  G.start = function () { requestAnimationFrame(t => { last = t; frame(t); }); };
})();
