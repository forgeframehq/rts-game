// Map generation, blocking grid, fog of war and A* pathfinding.
(function () {
  let N = G.MAP;

  G.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  G.idx = (x, y) => y * N + x;
  // Playable area. In screen space d = x - y runs left/right and s = x + y runs up/down.
  // Diamond maps use the whole grid (a = b = N); rectangle maps keep |d| <= a and |s - N| <= b,
  // which is a rectangle aligned with the screen, about 1.2 : 1 wide, so no black corners show.
  G.view = { a: N, b: N, rect: false };
  const inRect = (x, y) => { const d = x - y, s = x + y + 1 - N; return d >= -G.view.a && d <= G.view.a - 0 && s >= -G.view.b && s <= G.view.b; };
  G.inPlay = (x, y) => !G.view.rect || inRect(x, y);
  G.inMap = (x, y) => x >= 0 && y >= 0 && x < N && y < N && (!G.view.rect || inRect(x, y));

  G.initMap = function (seed) {
    N = G.MAP;
    const rect = !!G.rules && G.rules.shape === 'rect';   // old saves have no shape: they were diamonds
    G.view = rect ? { a: Math.floor(N * 0.375), b: Math.floor(N * 0.625), rect: true } : { a: N, b: N, rect: false };
    gScore = new Float32Array(N * N); parent = new Int32Array(N * N); stamp = new Int32Array(N * N); curStamp = 0;
    G.terrain = new Uint8Array(N * N);   // visual variant 0..3 (grass shades), 4 = dirt
    G.block = new Int32Array(N * N);     // entity id blocking the tile, 0 = free
    G.explored = new Uint8Array(N * N);
    G.visible = new Uint8Array(N * N);
    const r = G.rng(seed);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const n = Math.sin(x * 0.21 + seed) * Math.cos(y * 0.17 - seed) + r() * 0.6;
      G.terrain[G.idx(x, y)] = n > 0.95 ? 4 : Math.min(3, Math.floor((n + 1.3) * 1.4));
    }
    G.mapRng = r;
  };

  G.isFree = (x, y) => G.inMap(x, y) && G.block[G.idx(x, y)] === 0;
  // A gate is a hole in your own wall: your men and your allies walk through it, the enemy
  // has to break it down. Everything else that blocks a tile blocks everyone.
  G.openTo = function (blockId, owner) {
    if (!blockId || !owner) return false;
    const e = G.byId && G.byId.get(blockId);
    return !!(e && e.def && e.def.gate && e.built && !e.dead && G.allied(e.owner, owner));
  };
  G.freeFor = (x, y, owner) => {
    if (!G.inMap(x, y)) return false;
    const b = G.block[G.idx(x, y)];
    return b === 0 || G.openTo(b, owner);
  };

  G.areaFree = function (x, y, size) {
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) if (!G.isFree(x + i, y + j)) return false;
    return true;
  };

  G.setBlock = function (e, val) {
    const s = e.size || 1;
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const tx = e.tx + i, ty = e.ty + j;
      if (G.inMap(tx, ty)) G.block[G.idx(tx, ty)] = val;
    }
  };

  // ---------- Fog of war (for the human player) ----------
  G.updateFog = function () {
    G.visible.fill(0);
    for (const e of G.ents) {
      if (e.dead || !G.allied(1, e.owner)) continue;
      const los = e.def.los || 4;
      const cx = e.kind === 'building' ? e.tx + e.size / 2 : e.x;
      const cy = e.kind === 'building' ? e.ty + e.size / 2 : e.y;
      const r2 = los * los;
      for (let y = Math.floor(cy - los); y <= cy + los; y++) for (let x = Math.floor(cx - los); x <= cx + los; x++) {
        if (!G.inMap(x, y)) continue;
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) { const i = G.idx(x, y); G.visible[i] = 1; G.explored[i] = 1; }
      }
    }
  };
  G.isVisible = (x, y) => G.inMap(x | 0, y | 0) && G.visible[G.idx(x | 0, y | 0)] === 1;
  G.isExplored = (x, y) => G.inMap(x | 0, y | 0) && G.explored[G.idx(x | 0, y | 0)] === 1;

  // ---------- A* pathfinding ----------
  // Binary heap keyed on f.
  class Heap {
    constructor() { this.a = []; }
    push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
    pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
    get size() { return this.a.length; }
  }
  const DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[1,-1,1.414],[-1,1,1.414],[-1,-1,1.414]];
  let gScore = new Float32Array(N * N);
  let parent = new Int32Array(N * N);
  let stamp = new Int32Array(N * N);
  let curStamp = 0;

  // rect: target footprint {x0,y0,x1,y1} inclusive. If adjacent=true, goal is any free tile touching the rect.
  G.findPath = function (sx, sy, rect, adjacent, ignoreId, owner) {
    sx = Math.max(0, Math.min(N - 1, sx | 0)); sy = Math.max(0, Math.min(N - 1, sy | 0));
    curStamp++;
    const tcx = (rect.x0 + rect.x1) / 2, tcy = (rect.y0 + rect.y1) / 2;
    const isGoal = (x, y) => adjacent
      ? x >= rect.x0 - 1 && x <= rect.x1 + 1 && y >= rect.y0 - 1 && y <= rect.y1 + 1 && !(x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1)
      : x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
    const free = (x, y) => { if (!G.inMap(x, y)) return false; const b = G.block[G.idx(x, y)]; return b === 0 || b === ignoreId || G.openTo(b, owner); };
    const h = (x, y) => { const dx = Math.abs(x - tcx), dy = Math.abs(y - tcy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const heap = new Heap();
    const si = G.idx(sx, sy);
    gScore[si] = 0; parent[si] = -1; stamp[si] = curStamp;
    heap.push({ i: si, x: sx, y: sy, f: h(sx, sy) });
    let best = si, bestH = h(sx, sy), found = -1, expanded = 0;
    while (heap.size && expanded < 3000) {
      const n = heap.pop(); expanded++;
      if (isGoal(n.x, n.y)) { found = n.i; break; }
      const hn = h(n.x, n.y); if (hn < bestH) { bestH = hn; best = n.i; }
      for (const [dx, dy, c] of DIRS) {
        const nx = n.x + dx, ny = n.y + dy;
        if (!free(nx, ny)) continue;
        if (dx && dy && (!free(n.x + dx, n.y) || !free(n.x, n.y + dy))) continue; // no corner cutting
        const ni = G.idx(nx, ny), g = gScore[n.i] + c;
        if (stamp[ni] === curStamp && gScore[ni] <= g) continue;
        stamp[ni] = curStamp; gScore[ni] = g; parent[ni] = n.i;
        heap.push({ i: ni, x: nx, y: ny, f: g + h(nx, ny) });
      }
    }
    let end = found >= 0 ? found : best;
    const path = [];
    while (end !== -1 && end !== si) { path.push({ x: (end % N) + 0.5, y: Math.floor(end / N) + 0.5 }); end = parent[end]; }
    path.reverse();
    return smooth(sx + 0.5, sy + 0.5, path, ignoreId, owner);
  };

  function lineFree(x0, y0, x1, y1, ignoreId, owner) {
    const d = Math.hypot(x1 - x0, y1 - y0), steps = Math.ceil(d * 3);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      for (const o of [-0.3, 0.3]) {
        const x = Math.floor(x0 + (x1 - x0) * t + o), y = Math.floor(y0 + (y1 - y0) * t + o);
        if (!G.inMap(x, y)) return false;
        const b = G.block[G.idx(x, y)]; if (b !== 0 && b !== ignoreId && !G.openTo(b, owner)) return false;
      }
    }
    return true;
  }
  function smooth(sx, sy, path, ignoreId, owner) {
    if (path.length < 3) return path;
    const out = []; let ax = sx, ay = sy, i = 0;
    while (i < path.length) {
      let j = path.length - 1;
      while (j > i && !lineFree(ax, ay, path[j].x, path[j].y, ignoreId, owner)) j--;
      out.push(path[j]); ax = path[j].x; ay = path[j].y; i = j + 1;
    }
    return out;
  }

  // Nearest free tile spiral search.
  G.nearestFree = function (x, y, maxR) {
    x |= 0; y |= 0;
    if (G.isFree(x, y)) return { x, y };
    for (let r = 1; r <= (maxR || 12); r++)
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        if (G.isFree(x + i, y + j)) return { x: x + i, y: y + j };
      }
    return null;
  };
})();
