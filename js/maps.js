// Map types. Each one shapes the land before the Town Centers go down, sets how much forest
// grows, and adds its own features once the bases are placed.
// Terrain codes: 0..3 grass, 4 worn earth, 5 deep water, 6 shallow ford, 7 sand, 8 rock ridge.
// Deep water and rock ridges block every unit (block = -1); fords and sand are walkable.
(function () {
  const WATER = 5, FORD = 6, SAND = 7, ROCK = 8, WALL = -1;
  G.T_BLOCKING = t => t === WATER || t === ROCK;

  G.MAPS = {
    grasslands:  { name: 'Grasslands',   desc: 'Open meadows and scattered woods. A fair, classic fight.' },
    blackforest: { name: 'Black Forest', desc: 'Dense forest everywhere. Narrow paths, lots of wood, slow attacks.' },
    highlands:   { name: 'Highlands',    desc: 'Rocky ridges with narrow passes. Extra stone and gold.' },
    greatlake:   { name: 'Great Lake',   desc: 'A great lake in the middle. Armies march around its shores.' },
    twinrivers:  { name: 'Twin Rivers',  desc: 'Two rivers split the land. Cross only at the shallow fords.' },
    goldrush:    { name: 'Gold Rush',    desc: 'A rich gold field in the centre. Whoever holds it gets rich.' },
    fortress:    { name: 'Fortress',     desc: 'Every base starts inside a wall. Breaking in takes siege.' },
    desertoasis: { name: 'Desert Oasis', desc: 'Sand everywhere. Wood grows only around the oases.' }
  };
  G.MAP_KEYS = Object.keys(G.MAPS);
  G.pickMap = (k, r) => (G.MAPS[k] ? k : G.MAP_KEYS[Math.floor((r ? r() : Math.random()) * G.MAP_KEYS.length)]);

  const N = () => G.MAP;
  function set(x, y, t) {
    if (x < 1 || y < 1 || x >= N() - 1 || y >= N() - 1) return;
    const i = G.idx(x, y); G.terrain[i] = t;
    G.block[i] = G.T_BLOCKING(t) ? WALL : (G.block[i] === WALL ? 0 : G.block[i]);
  }
  // keep a clear circle around every base
  const nearBase = (spots, x, y, r) => spots.some(s => Math.hypot(x - s.x - 2, y - s.y - 2) < r);
  function blob(cx, cy, rad, t, r, spots, keep) {
    for (let y = Math.floor(cy - rad - 2); y <= cy + rad + 2; y++) for (let x = Math.floor(cx - rad - 2); x <= cx + rad + 2; x++) {
      const a = Math.atan2(y - cy, x - cx), wob = rad * (1 + 0.18 * Math.sin(a * 3 + cx) + 0.1 * Math.cos(a * 5 + cy));
      if (Math.hypot(x - cx, y - cy) <= wob && !nearBase(spots, x, y, keep || 11)) set(x, y, t);
    }
  }
  // a wavy band from (x0,y0) to (x1,y1)
  function band(x0, y0, x1, y1, width, t, spots, r, onPoint) {
    const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L, ph = r() * 6;
    for (let s = 0; s <= L; s += 0.4) {
      const k = s / L, w = Math.sin(k * 7 + ph) * 2.2, cx = x0 + (x1 - x0) * k + nx * w, cy = y0 + (y1 - y0) * k + ny * w;
      for (let d = -width / 2; d <= width / 2; d += 0.5) {
        const x = Math.round(cx + nx * d), y = Math.round(cy + ny * d);
        if (!nearBase(spots, x, y, 10)) { if (onPoint) onPoint(x, y, k); else set(x, y, t); }
      }
    }
  }

  // shape the land: runs right after the map is cleared, before anything is placed
  G.mapPaint = function (key, r, spots) {
    const n = N(), c = n / 2;
    if (key === 'greatlake') blob(c, c, n * 0.17, WATER, r, spots, 13);
    if (key === 'twinrivers') {
      for (const off of [-0.17, 0.17]) {
        const o = n * off;
        band(o + 1, 1 - o, n - 2 + o, n - 2 - o, 4, WATER, spots, r);
        // fords: three shallow crossings per river
        for (const k of [0.22, 0.5, 0.78]) {
          const fx = Math.round(o + (n - 3) * k + 1), fy = Math.round(-o + (n - 3) * k + 1);
          for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
            const x = fx + i, y = fy + j;
            if (x > 0 && y > 0 && x < n - 1 && y < n - 1 && G.terrain[G.idx(x, y)] === WATER && Math.abs(i + j) <= 2) set(x, y, FORD);
          }
        }
      }
      // sandy banks
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const t = G.terrain[G.idx(x, y)]; if (t === WATER || t === FORD || t === SAND) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => { const u = G.terrain[G.idx(x + i, y + j)]; return u === WATER || u === FORD; }) && r() < 0.8) G.terrain[G.idx(x, y)] = SAND;
      }
    }
    if (key === 'highlands') {
      for (let k = 0; k < Math.round(n / 9); k++) {
        const x0 = 4 + r() * (n - 8), y0 = 4 + r() * (n - 8), a = r() * 6.28, L = 10 + r() * 16;
        band(x0, y0, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L, 2, ROCK, spots, r, (x, y, kk) => { if (kk < 0.42 || kk > 0.58) set(x, y, ROCK); });   // a pass in the middle
      }
      // a few rocky outcrops without blocking: dirt patches around the ridges
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) if (G.terrain[G.idx(x, y)] < 4 && G.terrain[G.idx(x + 1, y)] === ROCK && r() < 0.6) G.terrain[G.idx(x, y)] = 4;
    }
    if (key === 'desertoasis') {
      for (let i = 0; i < n * n; i++) if (G.terrain[i] !== 4) G.terrain[i] = SAND;
      // green ground around each base, so it still feels like home
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (nearBase(spots, x, y, 7 + r() * 2)) G.terrain[G.idx(x, y)] = r() < 0.5 ? 1 : 2;
      G._oases = [];
      for (let k = 0, tries = 0; k < 3 + Math.round(n / 30) && tries < 200; tries++) {
        const x = 8 + r() * (n - 16), y = 8 + r() * (n - 16);
        if (nearBase(spots, x, y, 18) || G._oases.some(o => Math.hypot(o.x - x, o.y - y) < 14)) continue;
        G._oases.push({ x, y }); k++;
        blob(x, y, 5.5, 1, r, spots); blob(x, y, 2.6, WATER, r, spots);
      }
    }
  };

  // how much forest the map grows (1 = Grasslands)
  G.mapForest = key => ({ blackforest: 3.2, desertoasis: 0, goldrush: 0.8, highlands: 0.8, greatlake: 0.9, fortress: 0.9 }[key] ?? 1);

  // features added after the bases and their starting resources
  G.mapExtras = function (key, r, starts, cluster) {
    const n = N(), c = n / 2;
    if (key === 'goldrush') {
      cluster(r, 'gold', Math.round(c), Math.round(c), 26, 1);
      for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; cluster(r, 'tree', Math.round(c + Math.cos(a) * 9), Math.round(c + Math.sin(a) * 9), 8, 1); }
    }
    if (key === 'highlands') for (let k = 0; k < 6; k++) cluster(r, k % 2 ? 'stone' : 'gold', 6 + Math.floor(r() * (n - 12)), 6 + Math.floor(r() * (n - 12)), 6, 1);
    if (key === 'desertoasis') for (const o of G._oases || []) {
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + r(); cluster(r, 'tree', Math.round(o.x + Math.cos(a) * 4.2), Math.round(o.y + Math.sin(a) * 4.2), 4, 1); }
      cluster(r, 'berry', Math.round(o.x + 5), Math.round(o.y - 5), 4, 1);
    }
  };

  G.mapWalls = function (key, starts) {
    const n = N();
    if (key === 'fortress') for (const s of starts) {
      // a stone wall ring around the base, with four gates
      const cx = s.x + 2, cy = s.y + 2, R = 11;
      for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== R || !G.inMap(x, y) || x < 1 || y < 1 || x > n - 2 || y > n - 2) continue;
        const gate = (x === cx || y === cy);
        if (G.isFree(x, y)) G.addBuilding(gate ? 'gate' : 'stonewall', s.p, x, y, true);
      }
    }
  };

  // after loading a save, put the water and rock back into the blocking grid
  G.applyTerrainBlocks = function () {
    for (let i = 0; i < G.terrain.length; i++) if (G.T_BLOCKING(G.terrain[i]) && G.block[i] === 0) G.block[i] = WALL;
  };
})();
