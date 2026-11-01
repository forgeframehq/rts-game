// Camera and world rendering.
(function () {
  const TW = G.TW, TH = G.TH, N = G.MAP;
  G.ownerColor = o => G.PLAYER_COLORS[o];

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  G.canvas = canvas;
  let W = 0, H = 0, DPR = 1;

  G.resize = function () {
    DPR = Math.min(2, window.devicePixelRatio || 1);
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
  let ground = null, fogCv = null, fogCtx = null, fogImg = null;
  G.buildGround = function () {
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
      const a = G.visible[i] ? 0 : G.explored[i] ? 110 : 255;
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
      if (e.kind === 'unit' && e.owner !== 1 && !G.isVisible(e.x, e.y)) continue;
      if (e.kind !== 'unit') {
        const cx = e.tx + (e.size || 1) / 2, cy = e.ty + (e.size || 1) / 2;
        if (!G.isExplored(cx, cy) && !G.revealAll) continue;
        if (e.kind === 'building' && e.owner === 2 && !G.isVisible(cx, cy) && !e.seen && !G.revealAll) continue;
        if (e.kind === 'building' && e.owner === 2 && G.isVisible(cx, cy)) e.seen = true;
      }
      const depth = e.kind === 'unit' ? e.x + e.y : e.type === 'farm' ? e.tx + e.ty - 10 : e.tx + e.ty + (e.size || 1) * 1.5 - 0.5;
      list.push({ e, s, depth });
    }
    list.sort((a, b) => a.depth - b.depth);

    const sel = G.selection || [];
    // farms & ground-level marks first (already sorted low)
    for (const it of list) drawEntity(it.e, it.s, z, sel.includes(it.e));

    // projectiles
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4 * z;
    for (const p of G.projs) {
      const k = p.t / p.dur;
      const x = p.from.x + (p.tx - p.from.x) * k, y = p.from.y + (p.ty - p.from.y) * k;
      const h = (p.z + Math.sin(k * Math.PI) * 1.2) * TH;
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
      } else if (f.t === 'ping') {
        const k = 1 - f.life / 0.6;
        ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.globalAlpha = 1 - k;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, (6 + k * 14) * z, (3 + k * 7) * z, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
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

  function selRingTile(e, col) {
    const s = e.size || 1;
    const a = G.toScreen(e.tx, e.ty), b = G.toScreen(e.tx + s, e.ty), c = G.toScreen(e.tx + s, e.ty + s), d = G.toScreen(e.tx, e.ty + s);
    ctx.strokeStyle = col; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.stroke();
  }

  function drawEntity(e, s, z, selected) {
    if (e.kind === 'res') {
      if (selected) selRingTile(e, '#fff');
      const sp = G.resSprite(e.type, e.var);
      const g = G.toScreen(e.tx + 0.5, e.ty + 0.5);
      drawSprite(sp, g.x, g.y, z * 0.9);
      if (selected) hpBar(g.x, g.y - 70 * z, 30, e.amount / G.RES[e.type].amount, true);
      return;
    }
    if (e.kind === 'building') {
      const own = e.owner === 1;
      if (selected) selRingTile(e, own ? '#fff' : '#ff6b5e');
      const g = G.toScreen(e.tx + e.size / 2, e.ty + e.size / 2);
      let sp;
      if (e.built) sp = G.buildingSprite(e.type, e.owner, e.type === 'farm' ? Math.min(2, Math.floor((1 - e.food / G.BUILDINGS.farm.farm) * 3)) : 0);
      else sp = G.foundationSprite(e.type, Math.min(3, Math.floor(e.progress * 4)));
      if (e.hitT) ctx.globalAlpha = 0.85;
      drawSprite(sp, g.x, g.y, z);
      ctx.globalAlpha = 1;
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
      if (selected || e.hp < e.maxHp * 0.999 || !e.built) {
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
      const rr = e.type === 'knight' ? 12 : 8;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, rr * z, rr * 0.5 * z, 0, 0, 7); ctx.stroke();
    }
    if (e.atkAnim > 0) e.atkAnim -= 0.016;
    G.drawUnit(ctx, e, s.x, s.y, z * 1.6);
    if (selected || e.hp < e.maxHp) hpBar(s.x, s.y - (e.type === 'knight' ? 34 : 28) * z, 18, Math.max(0, e.hp / e.maxHp), e.owner === 1);
  }

  function drawGhost(z) {
    const gh = G.ghost, def = G.BUILDINGS[gh.type];
    const ok = G.areaFree(gh.tx, gh.ty, def.size) && G.isExplored(gh.tx + def.size / 2, gh.ty + def.size / 2);
    gh.ok = ok;
    const g = G.toScreen(gh.tx + def.size / 2, gh.ty + def.size / 2);
    ctx.globalAlpha = 0.6;
    drawSprite(G.buildingSprite(gh.type, 1), g.x, g.y, z);
    ctx.globalAlpha = 1;
    const s = def.size;
    ctx.fillStyle = ok ? 'rgba(80,220,100,0.25)' : 'rgba(255,60,50,0.35)';
    const a = G.toScreen(gh.tx, gh.ty), b = G.toScreen(gh.tx + s, gh.ty), c = G.toScreen(gh.tx + s, gh.ty + s), d = G.toScreen(gh.tx, gh.ty + s);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
  }

  // ---------- Minimap ----------
  G.drawMinimap = function (mc) {
    const m = mc.getContext('2d');
    const w = mc.width, h = mc.height;
    m.setTransform(1, 0, 0, 1, 0, 0);
    m.clearRect(0, 0, w, h);
    // diamond transform: tile (x,y) -> minimap
    const sx = w / N / 2, sy = h / N / 2;
    m.setTransform(sx, sy, -sx, sy, w / 2, 0);
    m.fillStyle = '#4f7a30'; m.fillRect(0, 0, N, N);
    for (const e of G.ents) {
      if (e.dead) continue;
      const x = e.kind === 'unit' ? e.x : e.tx, y = e.kind === 'unit' ? e.y : e.ty;
      if (!G.revealAll && !G.isExplored(x, y)) continue;
      if (e.kind === 'unit' && e.owner === 2 && !G.isVisible(x, y) && !G.revealAll) continue;
      if (e.kind === 'res') m.fillStyle = e.type === 'tree' ? '#1f4d1a' : e.type === 'gold' ? '#f2cf3a' : e.type === 'stone' ? '#bbb' : '#d14a6a';
      else m.fillStyle = G.ownerColor(e.owner);
      const s = e.kind === 'unit' ? 1.2 : (e.size || 1);
      m.fillRect(x - (e.kind === 'unit' ? 0.6 : 0), y - (e.kind === 'unit' ? 0.6 : 0), s, s);
    }
    if (!G.revealAll) { updateFogImage(); m.imageSmoothingEnabled = true; m.drawImage(fogCv, 0, 0, N, N); }
    // camera view
    m.setTransform(1, 0, 0, 1, 0, 0);
    const corners = [G.toWorld(0, 0), G.toWorld(W, 0), G.toWorld(W, H), G.toWorld(0, H)];
    m.strokeStyle = '#fff'; m.lineWidth = 1;
    m.beginPath();
    corners.forEach((c, i) => { const px = (c.x - c.y) * sx + w / 2, py = (c.x + c.y) * sy; i ? m.lineTo(px, py) : m.moveTo(px, py); });
    m.closePath(); m.stroke();
  };
  G.minimapToWorld = function (mc, mx, my) {
    const w = mc.clientWidth, h = mc.clientHeight;
    const sx = w / N / 2, sy = h / N / 2;
    const a = (mx - w / 2) / sx, b = my / sy; // a = x - y, b = x + y
    return { x: (a + b) / 2, y: (b - a) / 2 };
  };
})();
