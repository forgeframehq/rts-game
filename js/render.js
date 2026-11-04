// Camera and world rendering.
(function () {
  const TW = G.TW, TH = G.TH;
  let N = G.MAP;
  G.ownerColor = o => G.PLAYER_COLORS[o];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  G.canvas = canvas;
  let W = 0, H = 0, DPR = 1;

  G.resize = function () {
    DPR = G.gfxLow ? 1 : Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    G.W = W; G.H = H;
  };
  window.addEventListener('resize', G.resize);
  G.resize();

  // ---------- Camera ----------
  const cam = G.camera = {
    x: 0, y: N * TH / 2, zoom: 1, vx: 0, vy: 0,
    focus(wx, wy) { const p = iso(wx, wy); this.x = p.x; this.y = p.y; },
    update(dt) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      const fr = Math.pow(0.02, dt); this.vx *= fr; this.vy *= fr;
      if (Math.abs(this.vx) < 2) this.vx = 0; if (Math.abs(this.vy) < 2) this.vy = 0;
      if (G.view && G.view.rect) {
        // rectangle maps: keep the whole screen inside the map (plus a thin strip of the forest edge)
        const A = G.view.a * TW / 2, y0 = (N - G.view.b) * TH / 2, y1 = (N + G.view.b) * TH / 2, edge = 1.2 * TH;
        G.minZoom = Math.max(0.45, W / (2 * A + 2 * edge), H / (y1 - y0 + 2 * edge));
        if (this.zoom < G.minZoom) this.zoom = G.minZoom;
        const hw = W / 2 / this.zoom, hh = H / 2 / this.zoom;
        const lx = -A - edge + hw, hx = A + edge - hw, ly = y0 - edge + hh, hy = y1 + edge - hh;
        this.x = lx > hx ? 0 : Math.max(lx, Math.min(hx, this.x));
        this.y = ly > hy ? N * TH / 2 : Math.max(ly, Math.min(hy, this.y));
        return;
      }
      G.minZoom = 0.45;
      // clamp to map diamond bounds
      const maxX = N * TW / 2, maxY = N * TH;
      this.x = Math.max(-maxX, Math.min(maxX, this.x));
      this.y = Math.max(0, Math.min(maxY, this.y));
    }
  };
  function iso(wx, wy) { return { x: (wx - wy) * TW / 2, y: (wx + wy) * TH / 2 }; }
  G.iso = iso;
  G.toScreen = function (wx, wy, wz) {
    const p = iso(wx, wy);
    return { x: (p.x - cam.x) * cam.zoom + W / 2, y: (p.y - (wz || 0) - cam.y) * cam.zoom + H / 2 };
  };
  G.toWorld = function (sx, sy) {
    const px = (sx - W / 2) / cam.zoom + cam.x, py = (sy - H / 2) / cam.zoom + cam.y;
    return { x: px / TW + py / TH, y: py / TH - px / TW };
  };

  // ---------- Ground texture in tile space (drawn with an iso transform) ----------
  // Four painted textures (lush and dry grass, worn earth, forest floor) are blended per pixel
  // with ragged, noise-broken edges, so the tile grid never shows; a large slow light
  // variation gives the land depth, and small flowers and pebbles are scattered on top.
  // Everything is baked once when the map is made, so it costs nothing per frame.
  let GT = 16; // texels per tile, set per map size in buildGround
  let ground = null, fogCv = null, fogCtx = null, fogImg = null, borderRef = null;
  const TEX = {}, TEXN = ['grass_a', 'grass_b', 'dirt', 'forest_floor'], TEXX = ['water', 'shallows', 'sand', 'rock'];
  let texReady = 0;
  for (const k of TEXN) {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 256, 256);
      try { TEX[k] = x.getImageData(0, 0, 256, 256).data; } catch (e) { /* no pixel access: keep the plain ground */ }
      TEX[k + '_img'] = im;
      if (++texReady === TEXN.length && G.players && ground) G.buildGround();   // arrived after the map was made
    };
    im.src = 'assets/ground/' + k + '.jpg';
  }
  // map-type textures: loaded too, with flat painted stand-ins until they arrive
  const FLAT = { water: [52, 104, 140], shallows: [96, 160, 165], sand: [214, 188, 132], rock: [128, 118, 104] };
  for (const k of TEXX) {
    const im = new Image();
    im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 256, 256); try { TEX[k] = x.getImageData(0, 0, 256, 256).data; if (G.players && ground && G.terrain.some(t => t >= 5)) G.buildGround(); } catch (e) { /* keep flat */ } };
    im.src = 'assets/ground/' + k + '.jpg';
  }
  function flatTex(k) {
    if (TEX[k]) return TEX[k];
    const a = new Uint8ClampedArray(256 * 256 * 4), c = FLAT[k], r = G.rng(k.length * 31);
    for (let i = 0; i < 256 * 256; i++) { const v = 0.92 + r() * 0.16; a[i * 4] = c[0] * v; a[i * 4 + 1] = c[1] * v; a[i * 4 + 2] = c[2] * v; a[i * 4 + 3] = 255; }
    return a;
  }
  // tileable value noise, 256x256, smoothed: used for edges, grass mixing and light
  function makeNoise(seed, cell) {
    const r = G.rng(seed), n = 256 / cell, grid = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) grid[i] = r();
    const out = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
      let fx = gx - x0, fy = gy - y0; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const g = (i, j) => grid[((j % n + n) % n) * n + ((i % n + n) % n)];
      const top = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx, bot = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
      out[y * 256 + x] = top + (bot - top) * fy;
    }
    return out;
  }
  let NZ1 = null, NZ2 = null, NZ3 = null;
  const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  function paintGround(g) {
    if (!NZ1) { NZ1 = makeNoise(11, 8); NZ2 = makeNoise(23, 32); NZ3 = makeNoise(37, 64); }
    const W_ = N * GT, img = g.createImageData(W_, W_), d = img.data;
    // per-tile fields, bilinearly sampled per pixel: dirt, and forest (from where the trees stand)
    const dirt = new Float32Array(N * N), forest = new Float32Array(N * N);
    const wat = new Float32Array(N * N), sha = new Float32Array(N * N), snd = new Float32Array(N * N), rck = new Float32Array(N * N);
    let extra = false;
    for (let i = 0; i < N * N; i++) { const t = G.terrain[i]; dirt[i] = t === 4 ? 1 : 0; wat[i] = t === 5 ? 1 : 0; sha[i] = t === 6 ? 1 : 0; snd[i] = t === 7 ? 1 : 0; rck[i] = t === 8 ? 1 : 0; if (t >= 5) extra = true; }
    const XW = extra ? flatTex('water') : null, XS = extra ? flatTex('shallows') : null, XD = extra ? flatTex('sand') : null, XR = extra ? flatTex('rock') : null;
    for (const e of G.ents) if (!e.dead && e.kind === 'res' && e.type === 'tree')
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
        const x = e.tx + i, y = e.ty + j; if (x < 0 || y < 0 || x >= N || y >= N) continue;
        forest[y * N + x] = Math.min(1, forest[y * N + x] + (i === 0 && j === 0 ? 0.6 : Math.abs(i) + Math.abs(j) <= 2 ? 0.25 : 0.1));
      }
    const bil = (f, u, v) => {
      const x0 = Math.max(0, Math.min(N - 1, Math.floor(u))), y0 = Math.max(0, Math.min(N - 1, Math.floor(v)));
      const x1 = Math.min(N - 1, x0 + 1), y1 = Math.min(N - 1, y0 + 1), fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0));
      const t = f[y0 * N + x0] + (f[y0 * N + x1] - f[y0 * N + x0]) * fx, b = f[y1 * N + x0] + (f[y1 * N + x1] - f[y1 * N + x0]) * fx;
      return t + (b - t) * fy;
    };
    const A = TEX.grass_a, B = TEX.grass_b, D = TEX.dirt, F = TEX.forest_floor;
    const tpt = 256 / 8;                  // a texture repeats every 8 tiles
    for (let py = 0; py < W_; py++) {
      const v = py / GT - 0.5;
      for (let px = 0; px < W_; px++) {
        const u = px / GT - 0.5;
        const tx = ((u + 0.5) * tpt | 0) & 255, ty = ((v + 0.5) * tpt | 0) & 255, ti = (ty * 256 + tx) * 4;
        const n1 = NZ1[((py * 3 & 255) * 256) + (px * 3 & 255)];          // fine: ragged edges
        const n2 = NZ2[(((py >> 1) & 255) * 256) + ((px >> 1) & 255)];   // medium: grass patches
        const n3 = NZ3[(((py >> 2) & 255) * 256) + ((px >> 2) & 255)];   // large: light and shade
        const dw = ss(0.42, 0.6, bil(dirt, u, v) + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.2);
        const fw = ss(0.25, 0.75, bil(forest, u, v) + (n1 - 0.5) * 0.35) * 0.85;
        const gw = ss(0.38, 0.62, n2);
        let ww = 0, shw = 0, sdw = 0, rw = 0;
        if (extra) { ww = bil(wat, u, v) + (n1 - 0.5) * 0.25; shw = bil(sha, u, v) + (n1 - 0.5) * 0.25; sdw = ss(0.3, 0.6, bil(snd, u, v) + (n1 - 0.5) * 0.4 + (n2 - 0.5) * 0.15); rw = ss(0.35, 0.6, bil(rck, u, v) + (n1 - 0.5) * 0.45); }
        const light = 0.9 + n3 * 0.2;
        const o = (py * W_ + px) * 4;
        for (let c = 0; c < 3; c++) {
          let col = A[ti + c] + (B[ti + c] - A[ti + c]) * gw;
          col += (F[ti + c] - col) * fw;
          col += (D[ti + c] - col) * dw;
          if (extra) {
            col += (XD[ti + c] - col) * sdw; col += (XR[ti + c] - col) * rw;
            // water: a wet dark rim, then the shallows, then deep water
            col *= 1 - 0.35 * ss(0.15, 0.45, ww + shw);
            col += (XS[ti + c] - col) * ss(0.3, 0.55, ww + shw); col += (XW[ti + c] - col) * ss(0.5, 0.75, ww);
          }
          d[o + c] = col * light;
        }
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // small flowers and pebbles, in clusters, never on worn earth
    const r = G.rng(4321);
    const cols = ['#f2efe2', '#f4d24a', '#c9a3e8', '#e8f0ff'];
    for (let k = 0; k < N * N * 0.06; k++) {
      const cx = r() * N, cy = r() * N;
      if (dirt[(cy | 0) * N + (cx | 0)] || G.terrain[(cy | 0) * N + (cx | 0)] >= 5 || forest[(cy | 0) * N + (cx | 0)] > 0.5) continue;
      const col = cols[(r() * cols.length) | 0], m = 3 + (r() * 6 | 0);
      for (let i = 0; i < m; i++) {
        const x = (cx + (r() - 0.5) * 0.9) * GT, y = (cy + (r() - 0.5) * 0.9) * GT;
        g.fillStyle = 'rgba(30,50,15,0.35)'; g.fillRect(x, y + 0.6, GT * 0.07, GT * 0.07);
        g.fillStyle = col; g.fillRect(x, y, GT * 0.07, GT * 0.07);
      }
    }
    for (let k = 0; k < N * N * 0.05; k++) {
      const x = r() * N * GT, y = r() * N * GT, s = GT * (0.04 + r() * 0.05);
      const tt = G.terrain[((y / GT) | 0) * N + ((x / GT) | 0)]; if (tt === 5 || tt === 6) continue;
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + s * 0.3, y + s * 0.3, s, s * 0.8, 0, 0, 7); g.fill();
      g.fillStyle = r() < 0.5 ? '#9a958a' : '#b8b0a0'; g.beginPath(); g.ellipse(x, y, s, s * 0.8, 0, 0, 7); g.fill();
     }
    // ridges: piled boulders so the rock reads as high ground you can't climb
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (G.terrain[y * N + x] !== 8) continue;
      for (let k = 0; k < 3; k++) {
        const bx = (x + 0.2 + r() * 0.6) * GT, by = (y + 0.2 + r() * 0.6) * GT, s = GT * (0.28 + r() * 0.22);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(bx + s * 0.25, by + s * 0.3, s, s * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = ['#8a8070', '#9b917f', '#7a7163'][k]; g.beginPath(); g.ellipse(bx, by, s, s * 0.75, 0, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,250,235,0.28)'; g.beginPath(); g.ellipse(bx - s * 0.3, by - s * 0.3, s * 0.45, s * 0.3, 0, 0, 7); g.fill();
      }
    }
  }

  G.buildGround = function () {
    N = G.MAP;
    // as sharp as a phone's canvas limits allow: about 9 megapixels for the whole map
    GT = (TEX.grass_a && TEX.dirt) ? Math.max(16, Math.min(32, Math.floor(3000 / N))) : 16;
    ground = document.createElement('canvas');
    ground.width = ground.height = N * GT;
    const g = ground.getContext('2d');
    if (TEX.grass_a && TEX.grass_b && TEX.dirt && TEX.forest_floor) paintGround(g);
    else {
      // textures not loaded (or no pixel access): the plain painted ground
      const pal = ['#5f8a3a', '#679540', '#6e9c45', '#77a44b', '#9a8a5a'];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        g.fillStyle = pal[G.terrain[G.idx(x, y)]]; g.fillRect(x * GT, y * GT, GT, GT);
      }
      const tmp = document.createElement('canvas'); tmp.width = tmp.height = N * 2;
      const t = tmp.getContext('2d'); t.imageSmoothingEnabled = true; t.drawImage(ground, 0, 0, N * 2, N * 2);
      g.imageSmoothingEnabled = true; g.globalAlpha = 0.75; g.drawImage(tmp, 0, 0, N * GT, N * GT); g.globalAlpha = 1;
    }
    // rectangle maps: the land past the edge is dark forest floor with a decorative tree line
    G.deco = []; borderRef = null;
    if (G.view && G.view.rect) {
      const A = G.view.a, B = G.view.b, rr = G.rng(777);
      borderRef = new Int32Array(N * N).fill(-1);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (G.inPlay(x, y)) continue;
        const d = x - y, s = x + y + 1 - N;
        const out = Math.max(Math.abs(d) - A, Math.abs(s) - B);          // how far past the edge
        g.fillStyle = `rgba(18,32,12,${Math.min(0.78, 0.35 + out * 0.06)})`; g.fillRect(x * GT, y * GT, GT, GT);
        // nearest playable tile (for fog)
        let dc = Math.max(-A, Math.min(A, d)), sc = Math.max(-B, Math.min(B, s));
        let nx = Math.round((sc + N - 1 + dc) / 2), ny = Math.round((sc + N - 1 - dc) / 2);
        for (let k = 0; k < 4 && !G.inPlay(nx, ny); k++) { nx += Math.sign(N / 2 - nx); ny += Math.sign(N / 2 - ny); }
        if (nx >= 0 && ny >= 0 && nx < N && ny < N) borderRef[G.idx(x, y)] = G.idx(nx, ny);
        if (out <= 5 && rr() < (out <= 2 ? 0.75 : 0.45)) G.deco.push({ x: x + 0.3 + rr() * 0.4, y: y + 0.3 + rr() * 0.4, v: Math.floor(rr() * 4) });
      }
    }
    // the shade right under each tree
    for (const e of G.ents) if (!e.dead && e.kind === 'res' && e.type === 'tree') {
      g.fillStyle = 'rgba(20,35,10,0.28)'; g.beginPath(); g.arc((e.tx + 0.5) * GT, (e.ty + 0.5) * GT, GT * 0.75, 0, 7); g.fill();
    }
    fogCv = document.createElement('canvas'); fogCv.width = fogCv.height = N;
    fogCtx = fogCv.getContext('2d'); fogImg = fogCtx.createImageData(N, N);
  };

  function setIso(c) {
    // maps tile coords (x,y) to screen with current camera, scaled by DPR
    const z = cam.zoom * DPR;
    c.setTransform(TW / 2 * z, TH / 2 * z, -TW / 2 * z, TH / 2 * z, (W / 2 - cam.x * cam.zoom) * DPR, (H / 2 - cam.y * cam.zoom) * DPR);
  }

  function updateFogImage() {
    const d = fogImg.data;
    for (let i = 0; i < N * N; i++) {
      const j = borderRef && borderRef[i] >= 0 ? borderRef[i] : i;   // the forest edge takes the fog of the land next to it
      let a = G.visible[j] ? 0 : G.explored[j] ? 110 : 255;
      if (j !== i) a = Math.max(a, 60);
      d[i * 4] = 10; d[i * 4 + 1] = 12; d[i * 4 + 2] = 18; d[i * 4 + 3] = a;
    }
    fogCtx.putImageData(fogImg, 0, 0);
  }

  // ---------- Building aprons ----------
  // Every building stands on a patch of trodden earth that frays out into the grass, with a
  // soft shadow where it meets the ground, so it sits in the land instead of on top of it.
  // One apron image per footprint size, made once; drawn flat on the ground before anything.
  const aprons = {};
  function apron(size) {
    if (aprons[size]) return aprons[size];
    if (!TEX.dirt_img) return null;
    const pad = 1.1, T = 24, S = Math.round((size + pad * 2) * T);
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    x.fillStyle = x.createPattern(TEX.dirt_img, 'repeat'); x.fillRect(0, 0, S, S);
    const m = x.getImageData(0, 0, S, S), d = m.data, r = G.rng(size * 97);
    if (!NZ1) { NZ1 = makeNoise(11, 8); NZ2 = makeNoise(23, 32); NZ3 = makeNoise(37, 64); }
    const lo = pad * T, hi = S - pad * T;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      // distance outside the footprint square, in tiles
      const dx = Math.max(lo - px, 0, px - hi) / T, dy = Math.max(lo - py, 0, py - hi) / T;
      const out = Math.hypot(dx, dy);
      const n = NZ1[((py * 2) & 255) * 256 + ((px * 2) & 255)];
      let a = 1 - ss(0.15, 0.95, out + (n - 0.5) * 0.7);
      const o = (py * S + px) * 4;
      // the shadow: darkest right at the walls
      const sh = 1 - 0.32 * (1 - ss(0, 0.45, out));
      d[o] *= sh; d[o + 1] *= sh; d[o + 2] *= sh; d[o + 3] = a * 235;
    }
    x.putImageData(m, 0, 0);
    return (aprons[size] = { cv: c, pad });
  }
  function drawAprons() {
    for (const e of G.ents) {
      if (e.dead || e.kind !== 'building' || e.type === 'farm' || e.def.wall) continue;
      const cx = e.tx + e.size / 2, cy = e.ty + e.size / 2;
      if (!G.revealAll && !G.isExplored(cx, cy)) continue;
      const s = G.toScreen(cx, cy);
      if (s.x < -300 || s.x > W + 300 || s.y < -300 || s.y > H + 300) continue;
      const a = apron(e.size); if (!a) return;
      ctx.drawImage(a.cv, e.tx - a.pad, e.ty - a.pad, e.size + a.pad * 2, e.size + a.pad * 2);
    }
  }

  // ---------- Main render ----------
  G.render = function () {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0a0c12'; ctx.fillRect(0, 0, W, H);
    if (!ground) return;
    const z = cam.zoom;
    // ground
    setIso(ctx);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(ground, 0, 0, N, N);
    drawAprons();
    // grid when placing
    if (G.ghost && !G.noGrid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.03;
      const w = G.toWorld(W / 2, H / 2);
      for (let i = -14; i <= 14; i++) {
        ctx.beginPath(); ctx.moveTo((w.x | 0) + i, (w.y | 0) - 14); ctx.lineTo((w.x | 0) + i, (w.y | 0) + 14); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((w.x | 0) - 14, (w.y | 0) + i); ctx.lineTo((w.x | 0) + 14, (w.y | 0) + i); ctx.stroke();
      }
    }
    // selection rings on the ground
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // collect visible drawables
    const list = [];
    const margin = 200;
    for (const e of G.ents) {
      if (e.dead) continue;
      const s = G.toScreen(e.x, e.y);
      if (s.x < -margin * z || s.x > W + margin * z || s.y < -margin * z || s.y > H + margin * 1.5 * z) continue;
      if (e.kind === 'unit' && !G.allied(1, e.owner) && !G.isVisible(e.x, e.y) && !G.revealAll) continue;
      if (e.kind !== 'unit') {
        const cx = e.tx + (e.size || 1) / 2, cy = e.ty + (e.size || 1) / 2;
        if (!G.isExplored(cx, cy) && !G.revealAll) continue;
        const foe = e.kind === 'building' && !G.allied(1, e.owner);
        if (foe && !G.isVisible(cx, cy) && !e.seen && !G.revealAll) continue;
        if (foe && G.isVisible(cx, cy)) e.seen = true;
      }
      const depth = e.kind === 'unit' ? e.x + e.y : e.type === 'farm' ? e.tx + e.ty - 10 : e.tx + e.ty + (e.size || 1) * 1.5 - 0.5;
      list.push({ e, s, depth });
    }
    if (G.deco && G.resSprite) for (const d of G.deco) {
      const s = G.toScreen(d.x, d.y);
      if (s.x < -margin * z || s.x > W + margin * z || s.y < -margin * z || s.y > H + margin * 1.5 * z) continue;
      list.push({ deco: d, s, depth: d.x + d.y + 0.5 });
    }
    list.sort((a, b) => a.depth - b.depth);

    // stumps left by chopped trees (ground level)
    const stump = G.stumpSprite && G.stumpSprite();
    for (const d of G.decals || []) {
      if (!G.isExplored(d.x, d.y)) continue;
      const s = G.toScreen(d.x, d.y);
      if (s.x < -90 || s.x > W + 90 || s.y < -90 || s.y > H + 90) continue;
      ctx.globalAlpha = Math.min(1, d.life / 10);
      if (d.t === 'rubble') drawRubble(d, s, z);
      else if (stump) drawSprite(stump, s.x, s.y, z);
      ctx.globalAlpha = 1;
    }
    if (G.drawCorpses) G.drawCorpses(ctx, z);
    const sel = G.selection || [];
    // farms & ground-level marks first (already sorted low)
    burning.length = 0;
    for (const it of list) { if (it.deco) { const sp = G.resSprite('tree', it.deco.v); if (sp) drawSprite(sp, it.s.x, it.s.y, z); } else drawEntity(it.e, it.s, z, sel.includes(it.e)); }
    // smoke and flame last, so a tree in front cannot wipe out a burning roof behind it
    for (const d of burning) damageOver(d[0], d[1], d[2], d[3]);

    // projectiles
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4 * z;
    for (const p of G.projs) {
      const k = p.t / p.dur;
      const x = p.from.x + (p.tx - p.from.x) * k, y = p.from.y + (p.ty - p.from.y) * k;
      const h = (p.z + Math.sin(k * Math.PI) * (p.heavy ? 5 : 1.2)) * TH;
      if (p.heavy) {   // a trebuchet stone lobs high and lands heavy: a boulder, not an arrow
        const s = G.toScreen(x, y, h);
        ctx.fillStyle = '#6f6a63'; ctx.beginPath(); ctx.arc(s.x, s.y, 3.4 * z, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(s.x - z, s.y - z, 1.5 * z, 0, 7); ctx.fill();
        continue;
      }
      const a = G.toScreen(x, y, h), b2 = G.toScreen(x - (p.tx - p.from.x) * 0.04, y - (p.ty - p.from.y) * 0.04, h - Math.cos(k * Math.PI) * 3);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    }
    // Greek Fire on the ground, and flames on buildings set alight by fire arrows
    const fl = G.realTime();
    for (const f of G.fires || []) {
      if (!G.revealAll && !G.isVisible(f.x, f.y)) continue;
      const s = G.toScreen(f.x, f.y), a = Math.min(1, f.until - G.time);
      for (let k = 0; k < 3; k++) {
        const h = (10 + 6 * Math.sin(fl * 9 + k * 2 + f.x)) * z, ox = (k - 1) * 6 * z;
        const gr = ctx.createRadialGradient(s.x + ox, s.y - h / 2, 0, s.x + ox, s.y - h / 2, h);
        gr.addColorStop(0, `rgba(255,230,120,${0.9 * a})`); gr.addColorStop(0.5, `rgba(255,120,30,${0.6 * a})`); gr.addColorStop(1, 'rgba(200,40,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(s.x + ox, s.y - h / 2, 6 * z, h, 0, 0, 7); ctx.fill();
      }
    }
    for (const e of G.ents) if (e.burn && !e.dead && (G.revealAll || G.isVisible(e.x, e.y))) {
      const s = G.toScreen(e.tx + e.size / 2, e.ty + e.size / 2);
      for (let k = 0; k < 4; k++) { const ox = Math.sin(k * 2.3 + e.id) * e.size * 10 * z, h = (14 + 8 * Math.sin(fl * 8 + k)) * z, y = s.y - e.size * 12 * z;
        const gr = ctx.createRadialGradient(s.x + ox, y - h / 2, 0, s.x + ox, y - h / 2, h); gr.addColorStop(0, 'rgba(255,220,110,0.9)'); gr.addColorStop(0.6, 'rgba(255,100,20,0.5)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(s.x + ox, y - h / 2, 7 * z, h, 0, 0, 7); ctx.fill(); }
    }
    // effects
    for (const f of G.effects) {
      const s = G.toScreen(f.x, f.y);
      if (f.t === 'die') {
        const k = 1 - f.life / 0.8;
        ctx.fillStyle = `rgba(140,120,90,${0.5 * (1 - k)})`;
        const r = (f.big ? 30 * f.size : 8) * (0.5 + k) * z;
        ctx.beginPath(); ctx.ellipse(s.x, s.y - r * 0.3, r, r * 0.6, 0, 0, 7); ctx.fill();
      } else if (f.t === 'text') {
        ctx.globalAlpha = Math.min(1, f.life); ctx.fillStyle = f.col; ctx.font = `bold ${12 * Math.max(0.8, z)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(f.text, s.x, s.y - (40 + (1.2 - f.life) * 25) * z); ctx.globalAlpha = 1;
      } else if (f.t === 'heal') {
        // a soft cross of light rising off the man being tended
        const k = 1 - f.life / 0.6, a = (1 - k) * 0.85;
        const y = s.y - (16 + k * 16) * z, r = 5 * z;
        ctx.strokeStyle = `rgba(255,244,190,${a})`; ctx.lineWidth = 2.2 * z;
        ctx.beginPath(); ctx.moveTo(s.x, y - r); ctx.lineTo(s.x, y + r);
        ctx.moveTo(s.x - r * 0.62, y - r * 0.25); ctx.lineTo(s.x + r * 0.62, y - r * 0.25); ctx.stroke();
      } else if (f.t === 'ping') {
        const k = 1 - f.life / 0.6;
        ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, (6 + k * 14) * z, (3 + k * 7) * z, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (f.t === 'formdot') {
        ctx.globalAlpha = Math.min(1, f.life / 0.4) * 0.8; ctx.fillStyle = f.col; ctx.beginPath(); ctx.ellipse(s.x, s.y, 3.2 * z, 1.7 * z, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      } else if (f.t === 'target') {
        // outline the tile the command landed on, so a tap on a tree or farm is visibly acknowledged
        const e = G.byId.get(f.id);
        if (e && !e.dead && e.tx != null) {
          const k = 1 - f.life / 0.9;                 // 0 at the tap, 1 as it fades
          ctx.globalAlpha = f.life < 0.3 ? f.life / 0.3 : 1;
          selRingTile(e, f.col, 3.2 - 1.6 * k);
          ctx.globalAlpha = 1;
        }
      }
    }

    // fog
    if (!G.revealAll) {
      updateFogImage();
      setIso(ctx); ctx.imageSmoothingEnabled = true;
      ctx.drawImage(fogCv, 0, 0, N, N);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    drawChimneys();

    // placement ghost
    if (G.ghost && G.ghost.tx != null) drawGhost(z);

    if (G.drawTutorial) G.drawTutorial(ctx);
    drawSelArrow();
    // box selection
    if (G.boxSel) {
      const b = G.boxSel;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
  };

  function hpBar(x, y, w, f, own) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = f > 0.5 ? (own ? '#4cd964' : '#ff5a4a') : f > 0.25 ? '#f5c242' : '#ff3b30';
    ctx.fillRect(x - w / 2, y, w * f, 3);
  }

  // the highest point of a sprite's roof (its smoke louvre or chimney), relative to its anchor, found once
  function roofTop(sp) {
    if (sp._top) return sp._top;
    let top = { x: 0, y: -sp.ay * 0.9 };
    try {
      const cv = sp.cv, w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
      outer: for (let y = 0; y < h; y++) {
        let sx = 0, n = 0;
        for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 200) { sx += x; n++; }
        if (n >= 3) { top = { x: sx / n * sp.w / w - sp.ax, y: (y + h * 0.02) * sp.h / h - sp.ay }; break outer; }
      }
    } catch (err) { /* canvas not readable: fall back to a point above the centre */ }
    return (sp._top = top);
  }
  // chimney smoke: soft puffs rising and drifting off the top of the roof, thicker while training.
  // Drawn after the fog, so unexplored sky behind a roof can't swallow it.
  // which buildings smoke, and how: a hearth in every house, the forge, the Town Center, the castle kitchens
  const SMOKE = {
    towncenter: { n: 4, size: 1, alpha: 1, speed: 1, col: '228,224,216', dx: 0, dy: 0 },
    house:      { n: 3, size: 0.6, alpha: 0.8, speed: 0.9, col: '226,222,214', dx: 0, dy: 0 },
    blacksmith: { n: 5, size: 0.85, alpha: 1.1, speed: 1.3, col: '150,145,140', dx: 0, dy: 0 },
    castle:     { n: 3, size: 0.7, alpha: 0.75, speed: 0.8, col: '222,218,210', dx: 0, dy: 0.05 }
  };
  let chimneys = [];
  function drawChimneys() {
    for (const [e, g, z, sp] of chimneys) {
        const S = SMOKE[e.type], tp = roofTop(sp), busy = (e.queue && e.queue.length) || e.research;
        const cx = g.x + (tp.x + S.dx * sp.w) * z, cy = g.y + (tp.y + S.dy * sp.h) * z, n = busy ? S.n + 2 : S.n;
        for (let i = 0; i < n; i++) {
          const t = (G.time * (busy ? 0.32 : 0.22) * S.speed + i / n + (e.id % 7) * 0.13) % 1;
          const px = cx + (Math.sin(t * 5 + i * 1.7 + e.id) * 3 + t * 22) * z * S.size, py = cy - (4 + t * 60) * z * S.size;
          const r = (5 + t * 18) * z * S.size, a = Math.sin(Math.PI * Math.min(1, t * 1.2)) * (busy ? 0.75 : 0.6) * S.alpha;
          const grd = ctx.createRadialGradient(px, py, 0, px, py, r), c = S.col;
          grd.addColorStop(0, `rgba(${c},${a.toFixed(3)})`); grd.addColorStop(0.55, `rgba(${c},${(a * 0.55).toFixed(3)})`); grd.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
        }
    }
    chimneys = [];
  }
  function drawSprite(sp, x, y, z) {
    ctx.drawImage(sp.cv, x - sp.ax * z, y - sp.ay * z, sp.w * z, sp.h * z);
  }

  // what is left where a building stood: broken stone and a scorch, drawn in code
  function drawRubble(d, s, z) {
    const rng = G.rng((d.id || 1) * 131), sz = (d.size || 2);
    ctx.save();
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = 'rgba(38,30,22,0.5)';
    ctx.beginPath(); ctx.ellipse(s.x, s.y, sz * 15 * z, sz * 7.5 * z, 0, 0, 7); ctx.fill();
    for (let i = 0; i < 5 + sz * 3; i++) {
      const a = rng() * 7, r = rng() * sz * 13 * z;
      const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r * 0.5;
      const w = (2.5 + rng() * 4) * z, h = w * 0.7;
      ctx.fillStyle = ['#8d867c', '#6f6963', '#a39b8f'][i % 3];
      ctx.beginPath();
      ctx.moveTo(x - w, y); ctx.lineTo(x - w * 0.4, y - h); ctx.lineTo(x + w * 0.7, y - h * 0.8);
      ctx.lineTo(x + w, y); ctx.closePath(); ctx.fill();
    }
    // a few charred beams
    ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 1.6 * z;
    for (let i = 0; i < 3; i++) {
      const a = rng() * 7, r = rng() * sz * 9 * z;
      const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r * 0.5, l = (6 + rng() * 9) * z, ang = rng() * 3;
      ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * l, y - Math.sin(ang) * l * 0.5);
      ctx.lineTo(x + Math.cos(ang) * l, y + Math.sin(ang) * l * 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- damage: cracks, then smoke, then flame, layered over the ordinary sprite ----
  // No damaged art is made for any building; this is drawn over whatever is there, so it
  // works for every building in every region, including ones that do not exist yet.
  // which sides of a wall tile have a wall of the same side carrying on: 1 N, 2 E, 4 S, 8 W
  function wallMask(e) {
    let m = 0;
    const at = (dx, dy) => {
      const b = G.block[G.idx(e.tx + dx, e.ty + dy)];
      if (!b) return false;
      const n = G.byId.get(b);
      return !!(n && n.def && n.def.wall && G.allied(n.owner, e.owner));
    };
    if (at(0, -1)) m |= 1;
    if (at(1, 0)) m |= 2;
    if (at(0, 1)) m |= 4;
    if (at(-1, 0)) m |= 8;
    return m;
  }

  const burning = [];
  // Damage, layered over the ordinary sprite: soot on the body, smoke off the roof, and
  // flame at the eaves once it is nearly down. Anchored to the sprite, so it sits on the
  // building rather than at a guessed height — a watch tower and a farm are not alike.
  function damageOver(e, g, z, sp) {
    const k = Math.max(0, Math.min(1, 1 - e.hp / e.maxHp));   // 0 whole, 1 nearly down
    if (k < 0.28) return;
    const rng = G.rng(e.id * 7919);
    const halfW = (sp ? sp.w * 0.34 : e.size * G.TW * 0.4) * z;
    const roof = g.y - (sp ? sp.ay * 0.82 : 30) * z;          // near the top of the art
    const body = g.y - (sp ? sp.ay * 0.38 : 14) * z;          // mid wall
    // soot
    const marks = 2 + Math.floor(k * 4);
    for (let i = 0; i < marks; i++) {
      const bx = g.x + (rng() - 0.5) * halfW * 1.8;
      const by = body + (rng() - 0.5) * (body - roof) * 0.9;
      const r = (6 + rng() * 10) * z * (0.7 + k);
      const a = Math.min(0.45, (k - 0.26) * 0.7);
      const grd = ctx.createRadialGradient(bx, by, 0, bx, by, r);
      grd.addColorStop(0, 'rgba(22,16,12,' + a.toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(22,16,12,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill();
    }
    if (k < 0.45) return;
    // smoke, rising off the roof and drifting
    const puffs = 4 + Math.floor(k * 5);
    for (let i = 0; i < puffs; i++) {
      const t = (G.time * 0.3 + i / puffs + (e.id % 13) * 0.077) % 1;
      const px = g.x + Math.sin(i * 2.1 + e.id) * halfW * 0.5 + t * 16 * z;
      const py = roof - 4 * z - t * 62 * z;
      const r = (7 + t * 26) * z;
      const a = (1 - t) * 0.62 * Math.min(1, (k - 0.42) * 4);
      const col = k > 0.72 ? '74,68,62' : '186,180,170';
      const grd = ctx.createRadialGradient(px, py, 0, px, py, r);
      grd.addColorStop(0, 'rgba(' + col + ',' + a.toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
    }
    if (k < 0.72) return;
    // flame along the eaves
    const fl = 6;
    for (let i = 0; i < fl; i++) {
      const ph = (G.time * 2.6 + i * 0.37) % 1;
      const fx = g.x + ((i / (fl - 1)) - 0.5) * halfW * 1.5 + Math.sin(G.time * 3 + i) * 2 * z;
      const fy = roof + (14 - ph * 11) * z;
      const h = (9 + Math.sin(G.time * 5 + i * 2) * 3) * z * (0.6 + 0.6 * (1 - ph));
      ctx.globalAlpha = 0.5 + 0.45 * (1 - ph);
      ctx.fillStyle = ph < 0.35 ? '#ffd863' : ph < 0.7 ? '#f3861f' : '#c33c17';
      ctx.beginPath();
      ctx.moveTo(fx, fy - h);
      ctx.quadraticCurveTo(fx + 3.5 * z, fy - h * 0.35, fx + 2.2 * z, fy);
      ctx.quadraticCurveTo(fx, fy + 1.5 * z, fx - 2.2 * z, fy);
      ctx.quadraticCurveTo(fx - 3.5 * z, fy - h * 0.35, fx, fy - h);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // When what you have selected is off-screen, a small arrow at the screen edge points to it
  // (with a count); tap it to jump back. Subtle on purpose: it only shows when you need it.
  let panelTop = 0, panelT = 0;
  function drawSelArrow() {
    G.selArrow = null;
    const sel = (G.selection || []).filter(e => !e.dead && e.owner === 1);
    if (!sel.length || G.over) return;
    let cx = 0, cy = 0; for (const e of sel) { cx += e.x; cy += e.y; } cx /= sel.length; cy /= sel.length;
    const s = G.toScreen(cx, cy);
    if (performance.now() - panelT > 500) { panelT = performance.now(); const p = document.getElementById('panel'); panelTop = p && !p.classList.contains('hidden') ? p.getBoundingClientRect().top : H; }
    const L = 26, T = 70, R = W - 80, B = Math.min(H, panelTop) - 26;     // the open field of view, clear of the HUD
    if (s.x > L && s.x < R && s.y > T && s.y < B) return;               // on screen: nothing to show
    const ox = (L + R) / 2, oy = (T + B) / 2, dx = s.x - ox, dy = s.y - oy;
    const k = Math.min(Math.abs((dx > 0 ? R - ox : L - ox) / (dx || 1e-6)), Math.abs((dy > 0 ? B - oy : T - oy) / (dy || 1e-6)));
    const ax = ox + dx * k, ay = oy + dy * k, ang = Math.atan2(dy, dx), pulse = 0.75 + 0.15 * Math.sin(G.realTime() * 3);
    ctx.save(); ctx.translate(ax, ay);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = 'rgba(20,14,8,0.55)'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
    ctx.rotate(ang);
    ctx.fillStyle = G.ownerColor(1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-5, -8); ctx.lineTo(-2, 0); ctx.lineTo(-5, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.rotate(-ang);
    if (sel.length > 1) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(sel.length, -dx / Math.hypot(dx, dy) * 22, -dy / Math.hypot(dx, dy) * 22 + 4); }
    ctx.restore();
    G.selArrow = { x: ax, y: ay, wx: cx, wy: cy };
  }
  // A soft outline around a sprite's own silhouette: selected buildings and the target an order
  // landed on glow, so it is always clear what was picked. Built once per sprite and colour.
  const glowCache = new Map();
  function glowOf(sp, col) {
    const key = col; let m = glowCache.get(sp); if (!m) { m = {}; glowCache.set(sp, m); }
    if (m[key]) return m[key];
    const P = 8, sil = document.createElement('canvas'); sil.width = sp.cv.width; sil.height = sp.cv.height;
    const sx = sil.getContext('2d'); sx.drawImage(sp.cv, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = col; sx.fillRect(0, 0, sil.width, sil.height);
    const c = document.createElement('canvas'); c.width = sil.width + P * 2; c.height = sil.height + P * 2;
    const x = c.getContext('2d'), k = sp.cv.width / sp.w;   // sprite pixels per display px
    for (let a = 0; a < 16; a++) { const r = 3.2 * k; x.drawImage(sil, P + Math.cos(a / 16 * 6.283) * r, P + Math.sin(a / 16 * 6.283) * r); }
    x.globalCompositeOperation = 'destination-out'; x.drawImage(sp.cv, P, P);   // keep only the rim
    m[key] = { cv: c, pad: P / k };
    return m[key];
  }
  function drawGlow(sp, x, y, z, col, alpha) {
    if (!sp || !sp.cv) return;
    const g = glowOf(sp, col);
    ctx.globalAlpha = alpha; ctx.drawImage(g.cv, x - (sp.ax + g.pad) * z, y - (sp.ay + g.pad) * z, (sp.w + g.pad * 2) * z, (sp.h + g.pad * 2) * z); ctx.globalAlpha = 1;
  }
  // what an order just landed on: { id: { col, t } } set by the UI
  G.flash = G.flash || new Map();
  G.realTime = G.realTime || (() => performance.now() / 1000);
  const flashOf = e => { const f = G.flash.get(e.id); if (!f) return null; const age = G.realTime() - f.t; if (age > 1.1) { G.flash.delete(e.id); return null; } return { col: f.col, a: age < 0.15 ? 1 : Math.max(0, 1 - (age - 0.15) / 0.95) * (0.75 + 0.25 * Math.sin(age * 18)) }; };
  function selRingTile(e, col, width) {
    const s = e.size || 1;
    const a = G.toScreen(e.tx, e.ty), b = G.toScreen(e.tx + s, e.ty), c = G.toScreen(e.tx + s, e.ty + s), d = G.toScreen(e.tx, e.ty + s);
    ctx.strokeStyle = col; ctx.lineWidth = width || 1.6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.stroke();
  }

  function drawEntity(e, s, z, selected) {
    if (e.kind === 'res') {
      if (selected) selRingTile(e, '#fff');
      const sp = G.resSprite(e.type, e.var);
      const g = G.toScreen(e.tx + 0.5, e.ty + 0.5);
      // A forest of identical trees reads as wallpaper. There are four tree sprites and
      // one of each rock, so the variety comes from the draw instead: every resource is
      // mirrored, sized and shaded a little by its own id, which costs no art at all.
      const v = (e.id * 2654435761) >>> 0;
      const flip = (v & 1) ? -1 : 1;
      const scale = 0.88 + ((v >>> 1) & 31) / 31 * 0.26;
      const shade = 0.9 + ((v >>> 6) & 15) / 15 * 0.2;
      const zz = (sp.art ? z : z * 0.9) * scale;
      ctx.save();
      if (shade !== 1) ctx.filter = 'brightness(' + shade.toFixed(2) + ')';
      if (flip < 0) { ctx.translate(g.x * 2, 0); ctx.scale(-1, 1); }
      const fl = flashOf(e);
      if (fl) { ctx.save(); ctx.filter = 'none'; drawGlow(sp, g.x, g.y, zz, fl.col, fl.a); ctx.restore(); }
      drawSprite(sp, g.x, g.y, zz);
      if (selected) { ctx.save(); ctx.filter = 'none'; drawGlow(sp, g.x, g.y, zz, '#fff', 0.8); ctx.restore(); }
      ctx.restore();
      if (selected) hpBar(g.x, g.y - 70 * z, 30, e.amount / G.RES[e.type].amount, true);
      return;
    }
    if (e.kind === 'building') {
      const own = e.owner === 1;
      if (selected) selRingTile(e, own ? '#fff' : '#ff6b5e');
      const g = G.toScreen(e.tx + e.size / 2, e.ty + e.size / 2);
      let sp;
      if (e.built) {
        sp = G.buildingSprite(e.type, e.owner, e.type !== 'farm' ? 0
          : e.food <= 0 ? 'spent' : Math.min(2, Math.floor((1 - e.food / G.BUILDINGS.farm.farm) * 3)),
          e.def.wall ? wallMask(e) : 0);
        if (e.hitT) ctx.globalAlpha = 0.85;
        drawSprite(sp, g.x, g.y, z);
        ctx.globalAlpha = 1;
        if (selected) drawGlow(sp, g.x, g.y, z, own ? '#ffffff' : '#ff6b5e', 0.7 + 0.2 * Math.sin(G.realTime() * 4));
        const fl = flashOf(e); if (fl) drawGlow(sp, g.x, g.y, z, fl.col, fl.a);
      } else {
        sp = G.buildingSprite(e.type, e.owner, e.type === 'farm' ? 0 : undefined);
        drawConstruction(e, g, z, sp);
      }
      ctx.globalAlpha = 1;
      if (e.built && e.hp < e.maxHp * 0.74 && e.type !== 'farm') burning.push([e, g, z, sp]);
      // mill blades
      if (e.type === 'mill' && e.built && !sp.art) {
        ctx.save(); ctx.translate(g.x - 8 * z, g.y - 62 * z); ctx.rotate(G.time * 1.2);
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2 * z; ctx.fillStyle = 'rgba(240,230,210,0.9)';
        for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -22 * z); ctx.stroke(); ctx.fillRect(1 * z, -22 * z, 6 * z, 16 * z); }
        ctx.restore();
      }
      if (SMOKE[e.type] && e.built && sp && sp.cv && !G.gfxLow && (e.owner === 1 || G.revealAll || G.isVisible(e.x, e.y))) chimneys.push([e, g, z, sp]);
      const top = g.y - (sp.art ? sp.ay + 6 : e.size * 32 + 30) * z;
      if (selected || e.hp < e.maxHp * 0.999 || !e.built || (G.hpAlways && e.type !== 'farm')) {
        hpBar(g.x, top, 20 + e.size * 14, Math.max(0, e.hp / e.maxHp), own);
        if (!e.built) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(g.x - 10 - e.size * 7 - 1, top + 5, 20 + e.size * 14 + 2, 4); ctx.fillStyle = '#5ac8fa'; ctx.fillRect(g.x - 10 - e.size * 7, top + 6, (20 + e.size * 14) * e.progress, 2); }
      }
      // Capture: a beaten Town Center flies a white flag, and shows how far a capture has got
      if (e.type === 'towncenter' && G.rules && G.rules.mode === 'capture' && e.built) {
        const low = e.hp < e.maxHp * (G.CAPTURE ? G.CAPTURE.LOW : 0.25), c = e.cap;
        if (low && !(e.immune > G.time)) {
          const fx = g.x + 14 * z, fy = top - 4, wv = Math.sin(G.realTime() * 6) * 2;
          ctx.strokeStyle = '#5a4630'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 30); ctx.stroke();
          ctx.fillStyle = '#f7f4ea'; ctx.beginPath(); ctx.moveTo(fx, fy - 30); ctx.quadraticCurveTo(fx + 9, fy - 30 + wv, fx + 18, fy - 27); ctx.lineTo(fx + 18, fy - 17); ctx.quadraticCurveTo(fx + 9, fy - 20 - wv, fx, fy - 18); ctx.closePath(); ctx.fill();
        }
        if (e.immune > G.time) { ctx.fillStyle = 'rgba(255,215,106,0.9)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🛡 ' + Math.ceil(e.immune - G.time) + 's', g.x, top - 10); }
        if (c && c.v > 0) {
          const w = 70, x0 = g.x - w / 2, y0 = top - 16;
          ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x0 - 2, y0 - 2, w + 4, 9);
          const capCol = c.side && c.side[0] === 'p' ? G.ownerColor(+c.side.slice(1)) : '#ffd76a';
          ctx.fillStyle = capCol; ctx.fillRect(x0, y0, w * c.v, 5);
          ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(c.contested ? 'Contested!' : 'Capturing ' + Math.round(c.v * 100) + '%', g.x, y0 - 5);
        }
        if (e.hold > 0) { ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; const left = Math.max(0, (G.CAPTURE ? G.CAPTURE.HOLD : 180) - e.hold); ctx.fillText(`Held · ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')} to win`, g.x, top - 30); }
      }
      if (e.type === 'farm' && own && e.fallow && e.food <= 0) { ctx.font = `${Math.round(16 * Math.max(0.8, z))}px sans-serif`; ctx.textAlign = 'center'; ctx.globalAlpha = 0.75 + 0.25 * Math.sin(G.realTime() * 4); ctx.fillText('🪵', g.x, g.y - 6 * z); ctx.globalAlpha = 1; }
      if (e.housed && own && selected) { ctx.fillStyle = '#ffcc00'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Need houses!', g.x, top - 6); }
      // rally point
      if (selected && e.rally && own) {
        const r = G.toScreen(e.rally.x, e.rally.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(r.x, r.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#fff'; ctx.fillRect(r.x - 1, r.y - 14, 2, 14); ctx.fillStyle = G.ownerColor(1); ctx.fillRect(r.x + 1, r.y - 14, 8, 6);
      }
      return;
    }
    // unit
    const ufl = flashOf(e);
    if (ufl) {
      const rr = (G.mounted(e) ? 15 : 11) * z, k = 1 - ufl.a;
      ctx.globalAlpha = ufl.a; ctx.strokeStyle = ufl.col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, rr * (1 + k * 0.5), rr * 0.5 * (1 + k * 0.5), 0, 0, 7); ctx.stroke();
      // a small chevron above the target's head
      const hy = s.y - (G.mounted(e) ? 60 : 46) * z - 6 * Math.sin(G.realTime() * 10);
      ctx.fillStyle = ufl.col; ctx.beginPath(); ctx.moveTo(s.x - 6, hy - 8); ctx.lineTo(s.x + 6, hy - 8); ctx.lineTo(s.x, hy); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // what a Special is doing to this unit right now
    if (e.brace > G.time || e.charge > G.time || e.rush > G.time || e.stun > G.time || e.combo) {
      const hy = s.y - (G.mounted(e) ? 58 : 44) * z;
      ctx.font = `${Math.round(11 * Math.max(0.8, z))}px sans-serif`; ctx.textAlign = 'center';
      const ic = e.stun > G.time ? '💫' : e.brace > G.time ? '🛡️' : e.charge > G.time ? '🐎' : e.rush > G.time ? '💨' : '';
      if (ic) ctx.fillText(ic, s.x, hy);
      else if (e.combo && e.owner === 1 && selected) { ctx.fillStyle = '#ffd76a'; ctx.fillText('⚑', s.x + 8 * z, hy + 4); }
    }
    if (selected) {
      ctx.strokeStyle = e.owner === 1 ? '#fff' : '#ff6b5e'; ctx.lineWidth = 1.5;
      const rr = G.mounted(e) ? 12 : 8;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, rr * z, rr * 0.5 * z, 0, 0, 7); ctx.stroke();
    }
    if (e.atkAnim > 0) e.atkAnim -= 0.016;
    if (!G.drawUnitArt || !G.drawUnitArt(ctx, e, s.x, s.y, z)) G.drawUnit(ctx, e, s.x, s.y, z * 1.6);
    if (selected || e.hp < e.maxHp || G.hpAlways) hpBar(s.x, s.y - ((G.unitArtHeight && G.unitArtHeight(e)) || (G.mounted(e) ? 34 : 28)) * z, 18, Math.max(0, e.hp / e.maxHp), e.owner === 1);
  }

  // ---------- Construction ----------
  // Drawn in code from the footprint itself, so every building, whatever its size, is built
  // exactly on its own square: the plot is staked out and dug, scaffold poles go up at its
  // four corners, and the building rises inside them from the ground up while dust kicks
  // up. A farm is not scaffolded: its field is tilled row by row inside a fence of stakes.
  function corner(e, i, j) { return G.toScreen(e.tx + i * e.size, e.ty + j * e.size); }
  function pole(p, h, z) {
    ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = Math.max(1.5, 2.4 * z);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,160,0.35)'; ctx.lineWidth = Math.max(0.6, 0.8 * z);
    ctx.beginPath(); ctx.moveTo(p.x - 0.8 * z, p.y); ctx.lineTo(p.x - 0.8 * z, p.y - h); ctx.stroke();
  }
  // two or three walkways up the scaffold, not a cage
  function planks(a, b, h, z) {
    ctx.strokeStyle = 'rgba(138,98,56,0.9)'; ctx.lineWidth = Math.max(1.2, 1.8 * z);
    const step = Math.max(18 * z, h / 3);
    for (let y = step * 0.6; y < h - 4 * z; y += step) { ctx.beginPath(); ctx.moveTo(a.x, a.y - y); ctx.lineTo(b.x, b.y - y); ctx.stroke(); }
  }
  const rise = document.createElement('canvas'), riseCtx = rise.getContext('2d');
  function drawRising(fin, g, z, e, p) {
    const W2 = Math.ceil(fin.w * z), H2 = Math.ceil(fin.h * z);
    if (W2 < 2 || H2 < 2) return;
    if (rise.width < W2 || rise.height < H2) { rise.width = Math.max(rise.width, W2); rise.height = Math.max(rise.height, H2); }
    const x = riseCtx;
    const grow = Math.min(1, p / 0.7);                      // how high the frame stands
    const color = Math.max(0, Math.min(1, (p - 0.45) / 0.5)); // how far it has been finished
    const soft = H2 * 0.18, edge = H2 * (1 - grow) - soft * (1 - grow);
    // mask: solid below the rising edge, fading out above it, the edge wavering a little
    const paint = (filter, alpha) => {
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W2 + 2, H2 + 2);
      x.filter = filter; x.drawImage(fin.cv, 0, 0, W2, H2); x.filter = 'none';
      if (grow < 1) {
        x.globalCompositeOperation = 'destination-in';
        const gr = x.createLinearGradient(0, edge, 0, edge + soft);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
        x.fillStyle = gr; x.fillRect(0, 0, W2, H2);
      }
      x.restore();
      ctx.globalAlpha = alpha;
      ctx.drawImage(rise, 0, 0, W2, H2, g.x - fin.ax * z, g.y - fin.ay * z, W2, H2);
      ctx.globalAlpha = 1;
    };
    // the raw frame: darker, browner, less saturated
    if (color < 1) paint('brightness(0.62) sepia(0.55) saturate(0.7)', 1);
    // the finished building fading in over it
    if (color > 0) paint('none', color);
  }

  function drawConstruction(e, g, z, fin) {
    const p = Math.max(0, Math.min(1, e.progress || 0));
    const N_ = corner(e, 0, 0), E_ = corner(e, 1, 0), S_ = corner(e, 1, 1), W_ = corner(e, 0, 1);  // back, right, front, left
    // the dug plot, exactly the footprint
    ctx.fillStyle = 'rgba(96,70,42,0.78)';
    ctx.beginPath(); ctx.moveTo(N_.x, N_.y); ctx.lineTo(E_.x, E_.y); ctx.lineTo(S_.x, S_.y); ctx.lineTo(W_.x, W_.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(230,210,170,0.55)'; ctx.lineWidth = Math.max(1, 1.2 * z); ctx.setLineDash([4 * z, 3 * z]); ctx.stroke(); ctx.setLineDash([]);
    // painted stages: the bare frame, then half built, then the finished building fades in
    const s1 = G.stageSprite && G.stageSprite(e.type, e.owner, 1), s2 = s1 && G.stageSprite(e.type, e.owner, 2);
    if (s1 && s2 && fin) {
      const sm = (a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
      const a1 = sm(0, 0.06), a2 = sm(0.44, 0.48), a3 = sm(0.9, 0.96);   // quick swaps: no lingering double image
      if (a2 < 1) { ctx.globalAlpha = a1 * (1 - a3); drawSprite(s1, g.x, g.y, z); }
      if (a2 > 0 && a3 < 1) { ctx.globalAlpha = a2; drawSprite(s2, g.x, g.y, z); }
      if (a3 > 0) { ctx.globalAlpha = a3; drawSprite(fin, g.x, g.y, z); }
      ctx.globalAlpha = 1;
      constructionDust(e, g, z, N_, E_, S_, W_);
      return;
    }
    if (e.type === 'farm') {
      // furrows ploughed one by one across the field, drawn on its exact outline; the wheat and
      // fence of the finished farm appear when it is done
      const rows = 9, sz = e.size;
      for (let i = 0; i < rows; i++) {
        const t = (i + 0.5) / rows; if (t > p + 0.02) break;
        const a = G.toScreen(e.tx + sz * t, e.ty + 0.12), b = G.toScreen(e.tx + sz * t, e.ty + sz - 0.12);
        ctx.strokeStyle = 'rgba(58,38,20,0.9)'; ctx.lineWidth = Math.max(1.5, 3.2 * z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.strokeStyle = 'rgba(170,130,80,0.55)'; ctx.lineWidth = Math.max(1, 1.2 * z);
        ctx.beginPath(); ctx.moveTo(a.x, a.y - 2 * z); ctx.lineTo(b.x, b.y - 2 * z); ctx.stroke();
        // young shoots on the furrows already sown
        if (t < p - 0.15) { ctx.fillStyle = 'rgba(120,170,60,0.9)'; for (let k = 1; k < 6; k++) { const q = G.toScreen(e.tx + sz * t, e.ty + sz * k / 6); ctx.fillRect(q.x - z, q.y - 3 * z, 2 * z, 3 * z); } }
      }
      for (const c of [N_, E_, S_, W_]) pole(c, 9 * z, z);
      return;
    }
    // the scaffold reaches the eaves, not the roof ridge: about half the art's height above the ground point
    const top = fin ? fin.ay * z * 0.62 : 40 * z;
    const h = 10 * z + top * Math.min(1, p * 1.15);          // scaffold runs a little ahead of the walls
    // behind the building: the back pole and the two back runs of planks
    pole(N_, h, z); planks(W_, N_, h, z); planks(N_, E_, h, z);
    // the building itself: first a bare timber frame rises with a soft, uneven top edge, then
    // it warms into the finished colours and thatch. No hard line sweeping up the picture.
    if (fin && p > 0.03) drawRising(fin, g, z, e, p);
    // in front: the other three poles and the front runs, until the last stretch of work
    if (p < 0.97) { pole(W_, h, z); pole(E_, h, z); pole(S_, h, z); planks(W_, S_, h, z); planks(S_, E_, h, z); }
    // timber and stone waiting by the front corner, used up as the building rises
    const left = 1 - p;
    if (left > 0.08) {
      const bx = S_.x + 10 * z, by = S_.y - 2 * z;
      for (let i = 0; i < Math.ceil(left * 4); i++) { ctx.fillStyle = i % 2 ? '#9a6a3c' : '#7c5230'; ctx.fillRect(bx + i * 1.5 * z, by - i * 3 * z, 16 * z, 3 * z); }
      for (let i = 0; i < Math.ceil(left * 3); i++) { ctx.fillStyle = '#a9a39a'; ctx.beginPath(); ctx.ellipse(bx - 8 * z - i * 5 * z, by + 2 * z, 3.4 * z, 2.4 * z, 0, 0, 7); ctx.fill(); }
    }
    constructionDust(e, g, z, N_, E_, S_, W_);
  }
  function constructionDust(e, g, z, N_, E_, S_, W_) {
    // dust while someone is working on it
    const working = G.ents.some(u => !u.dead && u.task && u.task.t === 'build' && u.task.id === e.id && u.working);
    if (working) for (let k = 0; k < 3; k++) {
      const ph = (G.time * 0.9 + k / 3 + e.id * 0.13) % 1, c = [W_, S_, E_][k];
      ctx.fillStyle = `rgba(190,165,125,${0.35 * (1 - ph)})`;
      ctx.beginPath(); ctx.arc(c.x + (g.x - c.x) * 0.3, c.y - ph * 18 * z, (4 + ph * 9) * z, 0, 7); ctx.fill();
    }
  }

  function drawGhost(z) {
    const gh = G.ghost, def = G.BUILDINGS[gh.type], s = def.size;
    // A tile is buildable when nothing stands on it and you have seen it. Say which it is:
    // red is something in the way (named in the hint bar), grey is land you have not explored.
    let why = '', allSeen = true, ok = true;
    const tiles = [];
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = gh.tx + i, y = gh.ty + j;
      const seen = G.isExplored(x + 0.5, y + 0.5) || G.revealAll;
      let blocker = null, inside = G.inMap(x, y);
      if (inside && !G.isFree(x, y)) blocker = G.byId.get(G.block[G.idx(x, y)]);
      const free = inside && !blocker && seen && G.isFree(x, y);
      if (!free) ok = false;
      if (!seen) allSeen = false;
      if (!why) {
        if (!inside) why = 'the edge of the map';
        else if (blocker) why = blocker.kind === 'res' ? (G.RES[blocker.type] && G.RES[blocker.type].name || blocker.type).toLowerCase()
          : (blocker.owner === 1 ? 'your ' : 'a ') + (blocker.def && blocker.def.name || blocker.type);
        else if (!G.isFree(x, y)) why = 'something on that spot';
      }
      tiles.push({ x, y, free, seen });
    }
    if (!why && !allSeen) why = 'land you have not explored yet';
    if (G.farmOverlap && G.farmOverlap(gh.tx, gh.ty, s)) { ok = false; if (!why) why = 'a farm'; for (const t of tiles) t.free = false; }
    const rule = G.ruleBlock && G.ruleBlock(1, gh.type, gh.tx, gh.ty);
    if (rule) { ok = false; if (!why) why = rule; for (const t of tiles) t.free = false; }
    gh.ok = ok;
    if (G.ui && G.ui.placeWhy) G.ui.placeWhy(ok ? '' : why);
    const g = G.toScreen(gh.tx + s / 2, gh.ty + s / 2);
    ctx.globalAlpha = 0.6;
    drawSprite(G.buildingSprite(gh.type, 1), g.x, g.y, z);
    ctx.globalAlpha = 1;
    for (const t of tiles) {
      const col = t.free ? 'rgba(80,220,100,0.32)' : !t.seen ? 'rgba(150,150,160,0.5)' : 'rgba(255,50,40,0.55)';
      ctx.fillStyle = col;
      const a = G.toScreen(t.x, t.y), b = G.toScreen(t.x + 1, t.y), c = G.toScreen(t.x + 1, t.y + 1), d = G.toScreen(t.x, t.y + 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = t.free ? 'rgba(200,255,200,0.35)' : 'rgba(255,220,210,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  // ---------- Minimap ----------
  G.drawMinimap = function (mc) {
    const want = G.view.rect ? [132, 110] : [160, 80];   // minimap matches the map's shape
    if (mc.width !== want[0]) { mc.width = want[0]; mc.height = want[1]; mc.style.width = want[0] + 'px'; mc.style.height = want[1] + 'px'; }
    const m = mc.getContext('2d');
    const w = mc.width, h = mc.height;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, h);
    // tile (x,y) -> minimap; the playable area (diamond or rectangle) fills the minimap
    const A = G.view.a, B = G.view.b, sx = w / (2 * A), sy = h / (2 * B);
    m.setTransform(sx, sy, -sx, sy, A * sx, -(N - B) * sy);
    m.fillStyle = G.view.rect ? '#22361a' : '#4f7a30'; m.fillRect(0, 0, N, N);
    if (G.view.rect) { m.save(); m.setTransform(1, 0, 0, 1, 0, 0); m.fillStyle = '#4f7a30'; m.fillRect(0, 0, w, h); m.restore(); }
    const MMC = { 5: '#2f6a96', 6: '#5aa0a8', 7: '#cdb37a', 8: '#7d7468' };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = MMC[G.terrain[y * N + x]]; if (c) { m.fillStyle = c; m.fillRect(x, y, 1, 1); } }
    for (const e of G.ents) {
      if (e.dead) continue;
      const x = e.kind === 'unit' ? e.x : e.tx, y = e.kind === 'unit' ? e.y : e.ty;
      if (!G.revealAll && !G.isExplored(x, y) && !(G.alwaysOnMap && G.alwaysOnMap(e))) continue;
      if (e.kind === 'unit' && !G.allied(1, e.owner) && !G.isVisible(x, y) && !G.revealAll) continue;
      if (e.kind === 'res') m.fillStyle = e.type === 'tree' ? '#1f4d1a' : e.type === 'gold' ? '#f2cf3a' : e.type === 'stone' ? '#bbb' : '#d14a6a';
      else m.fillStyle = G.ownerColor(e.owner);
      const s = e.kind === 'unit' ? 1.2 : (e.size || 1);
      m.fillRect(x - (e.kind === 'unit' ? 0.6 : 0), y - (e.kind === 'unit' ? 0.6 : 0), s, s);
    }
    if (!G.revealAll) { updateFogImage(); m.imageSmoothingEnabled = true; m.drawImage(fogCv, 0, 0, N, N); }
    // an enemy down to its last few pieces is shown through the fog, blinking, so the hunt doesn't drag
    if (Math.floor(G.time * 2) % 2 === 0) for (const e of G.ents) {
      if (e.dead || !e.owner || !G.players[e.owner] || !G.players[e.owner].exposed || e.kind === 'res') continue;
      if (e.kind === 'building' && (e.type === 'farm' || e.def.wall)) continue;
      const x = e.kind === 'unit' ? e.x : e.tx, y = e.kind === 'unit' ? e.y : e.ty, s = e.kind === 'unit' ? 2 : (e.size || 1) + 1;
      m.fillStyle = '#fff'; m.fillRect(x - s / 2 - 0.4, y - s / 2 - 0.4, s + 0.8, s + 0.8);
      m.fillStyle = G.ownerColor(e.owner); m.fillRect(x - s / 2, y - s / 2, s, s);
    }
    // a Town Center being captured pulses; the raiders' arrival point is marked
    const pul = 1.5 + Math.sin(G.realTime() * 8) * 1;
    for (const e of G.ents) if (!e.dead && e.type === 'towncenter' && e.cap && e.cap.v > 0) { m.strokeStyle = '#fff'; m.lineWidth = 0.6; m.beginPath(); m.arc(e.x, e.y, 3 + pul, 0, 7); m.stroke(); }
    if (G.spotted && G.spotted.until > G.time) { m.strokeStyle = '#ffb02e'; m.lineWidth = 0.8; m.beginPath(); m.arc(G.spotted.x, G.spotted.y, 3 + pul * 1.5, 0, 7); m.stroke(); }
    if (G.surv && G.surv.from && G.surv.from.until > G.time) { m.strokeStyle = '#ff3b2f'; m.lineWidth = 0.8; m.beginPath(); m.arc(G.surv.from.x, G.surv.from.y, 3 + pul * 1.5, 0, 7); m.stroke(); }
    // camera view
    m.setTransform(1, 0, 0, 1, 0, 0);
    const corners = [G.toWorld(0, 0), G.toWorld(W, 0), G.toWorld(W, H), G.toWorld(0, H)];
    m.strokeStyle = '#fff'; m.lineWidth = 1;
    m.beginPath();
    corners.forEach((c, i) => { const px = (c.x - c.y + A) * sx, py = (c.x + c.y - (N - B)) * sy; i ? m.lineTo(px, py) : m.moveTo(px, py); });
    m.closePath(); m.stroke();
  };
  G.minimapToWorld = function (mc, mx, my) {
    const w = mc.clientWidth, h = mc.clientHeight;
    const A = G.view.a, B = G.view.b, sx = w / (2 * A), sy = h / (2 * B);
    const a = mx / sx - A, b = my / sy + (N - B); // a = x - y, b = x + y
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };
})();
