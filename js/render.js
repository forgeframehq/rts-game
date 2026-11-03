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
  const GT = 16; // texels per tile
  let ground = null, fogCv = null, fogCtx = null, fogImg = null, borderRef = null;
  G.buildGround = function () {
    N = G.MAP;
    ground = document.createElement('canvas');
    ground.width = ground.height = N * GT;
    const g = ground.getContext('2d');
    const pal = ['#5f8a3a', '#679540', '#6e9c45', '#77a44b', '#9a8a5a'];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      g.fillStyle = pal[G.terrain[G.idx(x, y)]]; g.fillRect(x * GT, y * GT, GT, GT);
    }
    // blur-ish blend by drawing scaled copy
    const tmp = document.createElement('canvas'); tmp.width = tmp.height = N * 2;
    const t = tmp.getContext('2d'); t.imageSmoothingEnabled = true; t.drawImage(ground, 0, 0, N * 2, N * 2);
    g.imageSmoothingEnabled = true; g.globalAlpha = 0.75; g.drawImage(tmp, 0, 0, N * GT, N * GT); g.globalAlpha = 1;
    // speckles (grass tufts, dirt)
    const r = G.rng(1234);
    for (let k = 0; k < N * N * 3; k++) {
      const x = r() * N * GT, y = r() * N * GT;
      g.fillStyle = r() < 0.5 ? 'rgba(40,70,20,0.35)' : 'rgba(170,200,110,0.25)';
      g.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
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
    // darker patches under forests
    for (const e of G.ents) if (e.kind === 'res' && e.type === 'tree') {
      g.fillStyle = 'rgba(30,50,15,0.35)'; g.beginPath(); g.arc((e.tx + 0.5) * GT, (e.ty + 0.5) * GT, GT * 0.9, 0, 7); g.fill();
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
    // grid when placing
    if (G.ghost) {
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

    // placement ghost
    if (G.ghost && G.ghost.tx != null) drawGhost(z);

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
      drawSprite(sp, g.x, g.y, zz);
      ctx.restore();
      if (selected) hpBar(g.x, g.y - 70 * z, 30, e.amount / G.RES[e.type].amount, true);
      return;
    }
    if (e.kind === 'building') {
      const own = e.owner === 1;
      if (selected) selRingTile(e, own ? '#fff' : '#ff6b5e');
      const g = G.toScreen(e.tx + e.size / 2, e.ty + e.size / 2);
      let sp;
      if (e.built) sp = G.buildingSprite(e.type, e.owner, e.type !== 'farm' ? 0
        : e.food <= 0 ? 'spent' : Math.min(2, Math.floor((1 - e.food / G.BUILDINGS.farm.farm) * 3)),
        e.def.wall ? wallMask(e) : 0);
      else sp = G.foundationSprite(e.type, Math.min(3, Math.floor(e.progress * 4)));
      if (e.hitT) ctx.globalAlpha = 0.85;
      drawSprite(sp, g.x, g.y, z);
      // under construction: the finished building rises out of the scaffolding, revealed
      // from the ground up as the work goes on. No stage art — one clip of the real sprite.
      if (!e.built && e.progress > 0.04) {
        const fin = G.buildingSprite(e.type, e.owner, e.type === 'farm' ? 0 : undefined);
        if (fin) {
          const top = g.y - fin.ay * z, full = fin.h * z, shown = full * Math.min(1, e.progress);
          ctx.save();
          ctx.beginPath();
          ctx.rect(g.x - fin.ax * z - 2, top + full - shown, fin.w * z + 4, shown + 2);
          ctx.clip();
          drawSprite(fin, g.x, g.y, z);
          ctx.restore();
        }
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
      // smoke from town center chimney when training
      if (e.queue && e.queue.length && e.built) {
        const k = (G.time * 0.8) % 1;
        ctx.fillStyle = `rgba(200,200,200,${0.4 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(g.x + 20 * z, g.y - (e.size * 30 + k * 30) * z, (4 + k * 6) * z, 0, 7); ctx.fill();
      }
      const top = g.y - (sp.art ? sp.ay + 6 : e.size * 32 + 30) * z;
      if (selected || e.hp < e.maxHp * 0.999 || !e.built || (G.hpAlways && e.type !== 'farm')) {
        hpBar(g.x, top, 20 + e.size * 14, Math.max(0, e.hp / e.maxHp), own);
        if (!e.built) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(g.x - 10 - e.size * 7 - 1, top + 5, 20 + e.size * 14 + 2, 4); ctx.fillStyle = '#5ac8fa'; ctx.fillRect(g.x - 10 - e.size * 7, top + 6, (20 + e.size * 14) * e.progress, 2); }
      }
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
    if (selected) {
      ctx.strokeStyle = e.owner === 1 ? '#fff' : '#ff6b5e'; ctx.lineWidth = 1.5;
      const rr = G.mounted(e) ? 12 : 8;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, rr * z, rr * 0.5 * z, 0, 0, 7); ctx.stroke();
    }
    if (e.atkAnim > 0) e.atkAnim -= 0.016;
    if (!G.drawUnitArt || !G.drawUnitArt(ctx, e, s.x, s.y, z)) G.drawUnit(ctx, e, s.x, s.y, z * 1.6);
    if (selected || e.hp < e.maxHp || G.hpAlways) hpBar(s.x, s.y - ((G.unitArtHeight && G.unitArtHeight(e)) || (G.mounted(e) ? 34 : 28)) * z, 18, Math.max(0, e.hp / e.maxHp), e.owner === 1);
  }

  function drawGhost(z) {
    const gh = G.ghost, def = G.BUILDINGS[gh.type];
    const ok = G.areaFree(gh.tx, gh.ty, def.size) && G.isExplored(gh.tx + def.size / 2, gh.ty + def.size / 2);
    gh.ok = ok;
    const g = G.toScreen(gh.tx + def.size / 2, gh.ty + def.size / 2);
    ctx.globalAlpha = 0.6;
    drawSprite(G.buildingSprite(gh.type, 1), g.x, g.y, z);
    ctx.globalAlpha = 1;
    // colour every tile of the footprint, so a hidden blocker is easy to spot
    const s = def.size, explored = G.isExplored(gh.tx + s / 2, gh.ty + s / 2);
    for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
      const x = gh.tx + i, y = gh.ty + j, free = G.isFree(x, y) && explored;
      ctx.fillStyle = free ? 'rgba(80,220,100,0.32)' : 'rgba(255,50,40,0.55)';
      const a = G.toScreen(x, y), b = G.toScreen(x + 1, y), c = G.toScreen(x + 1, y + 1), d = G.toScreen(x, y + 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = free ? 'rgba(200,255,200,0.35)' : 'rgba(255,200,190,0.6)'; ctx.lineWidth = 1; ctx.stroke();
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
    for (const e of G.ents) {
      if (e.dead) continue;
      const x = e.kind === 'unit' ? e.x : e.tx, y = e.kind === 'unit' ? e.y : e.ty;
      if (!G.revealAll && !G.isExplored(x, y)) continue;
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
