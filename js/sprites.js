// Procedurally drawn sprites (no image files needed). Cached to offscreen canvases.
(function () {
  const TW = G.TW, TH = G.TH;
  const S = 2; // cache resolution multiplier
  const cache = new Map();

  G.shade = function (hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 1) { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
    else { r *= f; g *= f; b *= f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  };
  const sh = G.shade;

  function make(key, w, h, ax, ay, draw) {
    let c = cache.get(key);
    if (c) return c;
    const cv = document.createElement('canvas');
    cv.width = w * S; cv.height = h * S;
    const ctx = cv.getContext('2d');
    ctx.scale(S, S); ctx.translate(ax, ay);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    draw(ctx);
    c = { cv, w, h, ax, ay };
    cache.set(key, c);
    return c;
  }
  G.spriteCacheClear = () => cache.clear();

  // ---- primitives (origin = ground point) ----
  function diamond(ctx, hw, hh, z) {
    ctx.beginPath(); ctx.moveTo(0, -hh - z); ctx.lineTo(hw, -z); ctx.lineTo(0, hh - z); ctx.lineTo(-hw, -z); ctx.closePath();
  }
  // iso box: footprint half-width hw (px), height z (px)
  function box(ctx, hw, z, top, left, right, lift) {
    const hh = hw / 2; lift = lift || 0;
    ctx.beginPath(); ctx.moveTo(-hw, -lift); ctx.lineTo(0, hh - lift); ctx.lineTo(0, hh - z - lift); ctx.lineTo(-hw, -z - lift); ctx.closePath(); ctx.fillStyle = left; ctx.fill();
    ctx.beginPath(); ctx.moveTo(hw, -lift); ctx.lineTo(0, hh - lift); ctx.lineTo(0, hh - z - lift); ctx.lineTo(hw, -z - lift); ctx.closePath(); ctx.fillStyle = right; ctx.fill();
    diamond(ctx, hw, hh, z + lift); ctx.fillStyle = top; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-hw, -lift); ctx.lineTo(0, hh - lift); ctx.lineTo(hw, -lift); ctx.lineTo(hw, -z - lift); ctx.lineTo(0, -hh - z - lift); ctx.lineTo(-hw, -z - lift); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, hh - lift); ctx.lineTo(0, hh - z - lift); ctx.stroke();
  }
  function pyramid(ctx, hw, base, peak, left, right) {
    const hh = hw / 2;
    ctx.beginPath(); ctx.moveTo(-hw, -base); ctx.lineTo(0, hh - base); ctx.lineTo(0, -base - peak); ctx.closePath(); ctx.fillStyle = left; ctx.fill();
    ctx.beginPath(); ctx.moveTo(hw, -base); ctx.lineTo(0, hh - base); ctx.lineTo(0, -base - peak); ctx.closePath(); ctx.fillStyle = right; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hw, -base); ctx.lineTo(0, -hh - base); ctx.lineTo(0, -base - peak); ctx.closePath(); ctx.fillStyle = sh(left, 1.1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hw, -base); ctx.lineTo(0, -hh - base); ctx.lineTo(0, -base - peak); ctx.closePath(); ctx.fillStyle = sh(right, 1.15); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(-hw, -base); ctx.lineTo(0, -base - peak); ctx.lineTo(hw, -base); ctx.moveTo(0, hh - base); ctx.lineTo(0, -base - peak); ctx.stroke();
  }
  // gable roof running along the x-axis (screen down-right), over footprint half-width hw
  function gable(ctx, hw, base, peak, colA, colB) {
    const hh = hw / 2;
    // ridge from left corner area to right; simple version: two sloped planes
    const L = [-hw, -base], B = [0, hh - base], R = [hw, -base], T = [0, -hh - base];
    const mLB = [(L[0] + B[0]) / 2, (L[1] + B[1]) / 2 - peak], mTR = [(T[0] + R[0]) / 2, (T[1] + R[1]) / 2 - peak];
    // back plane (T-L side)
    ctx.beginPath(); ctx.moveTo(...L); ctx.lineTo(...T); ctx.lineTo(...mTR); ctx.lineTo(...mLB); ctx.closePath(); ctx.fillStyle = sh(colA, 1.12); ctx.fill();
    // front plane (B-R side)
    ctx.beginPath(); ctx.moveTo(...B); ctx.lineTo(...R); ctx.lineTo(...mTR); ctx.lineTo(...mLB); ctx.closePath(); ctx.fillStyle = colB; ctx.fill();
    // gable end triangle (front-left)
    ctx.beginPath(); ctx.moveTo(...L); ctx.lineTo(...B); ctx.lineTo(...mLB); ctx.closePath(); ctx.fillStyle = colA; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(...mLB); ctx.lineTo(...mTR); ctx.lineTo(...R); ctx.lineTo(...B); ctx.lineTo(...mLB); ctx.lineTo(...L); ctx.stroke();
    // shingle lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let k = 1; k < 4; k++) { const t = k / 4; ctx.beginPath(); ctx.moveTo(B[0] + (mLB[0] - B[0]) * t, B[1] + (mLB[1] - B[1]) * t); ctx.lineTo(R[0] + (mTR[0] - R[0]) * t, R[1] + (mTR[1] - R[1]) * t); ctx.stroke(); }
  }
  function crenel(ctx, hw, z, col) {
    const hh = hw / 2;
    ctx.fillStyle = col;
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      for (const [ax, ay, bx, by] of [[-hw, 0, 0, hh], [hw, 0, 0, hh]]) {
        const x = ax + (bx - ax) * t, y = ay + (by - ay) * t - z;
        ctx.fillRect(x - 2, y - 4, 4, 4);
      }
    }
  }
  function flag(ctx, x, y, h, col) {
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + 10, y - h + 3); ctx.lineTo(x, y - h + 7); ctx.closePath(); ctx.fill();
  }
  function door(ctx, x, y, w, h) { ctx.fillStyle = '#3b2615'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + w / 2); ctx.lineTo(x + w, y + w / 2 - h); ctx.lineTo(x, y - h); ctx.closePath(); ctx.fill(); }
  function windowR(ctx, x, y) { ctx.fillStyle = '#1e1a16'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x + 4, y - 3); ctx.lineTo(x, y - 5); ctx.closePath(); ctx.fill(); }
  function stoneTex(ctx, hw, z, lift) {
    const hh = hw / 2; ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.6;
    for (let k = 1; k < z / 6; k++) {
      const y = -k * 6 - (lift || 0);
      ctx.beginPath(); ctx.moveTo(-hw, y); ctx.lineTo(0, y + hh); ctx.lineTo(hw, y); ctx.stroke();
    }
  }

  const STONE = ['#cfc6b4', '#a59d8c', '#8b8474'];
  const WOOD = ['#b88a57', '#94693d', '#7a5530'];
  const PLASTER = ['#efe4cc', '#d8c9a8', '#bfae8a'];

  // ---- buildings ----
  // One wall piece, drawn along whichever diagonals its neighbours sit on, so a run of
  // them reads as a single wall. Drawn rather than painted because walls must tile
  // seamlessly in every combination, which is a lot of art for something this repetitive.
  function wallPiece(ctx, c, mask, kind) {
    const half = TW / 2 - 1;
    const H = kind === 'wood' ? 26 : 36;                       // how tall it stands
    const pal = kind === 'wood'
      ? { lit: '#a98351', sun: '#8a663c', shade: '#664828', line: '#4a331c', top: '#b89260' }
      : { lit: '#b9b2a4', sun: '#968f83', shade: '#6d675e', line: '#514c45', top: '#c8c1b4' };
    // the stretch running towards one neighbour; dx/dy point at it
    const run = (dx, dy) => {
      const ex = dx * half, ey = dy * half / 2;
      const sunny = dx * dy < 0;                                // the two iso axes catch
      const face = sunny ? pal.sun : pal.shade;                 // different light
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.lineTo(ex, ey - H); ctx.lineTo(0, -H);
      ctx.closePath();
      ctx.fillStyle = face; ctx.fill();
      ctx.clip();
      if (kind === 'wood') {                                    // upright palings
        ctx.strokeStyle = pal.line; ctx.lineWidth = 1;
        for (let t = 0.12; t < 1; t += 0.16) {
          ctx.beginPath();
          ctx.moveTo(ex * t, ey * t + 1); ctx.lineTo(ex * t, ey * t - H);
          ctx.stroke();
        }
        ctx.strokeStyle = pal.lit; ctx.lineWidth = 2;           // the rail holding them
        ctx.beginPath();
        ctx.moveTo(0, -H * 0.55); ctx.lineTo(ex, ey - H * 0.55); ctx.stroke();
      } else {                                                  // courses of block
        ctx.strokeStyle = pal.line; ctx.lineWidth = 1;
        for (let r = 1; r < 4; r++) {
          const y = -H * r / 4;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ex, ey + y); ctx.stroke();
          const off = r % 2 ? 0.25 : 0.5;                       // staggered joints
          for (let t = off; t < 1; t += 0.5) {
            ctx.beginPath();
            ctx.moveTo(ex * t, ey * t + y); ctx.lineTo(ex * t, ey * t + y + H / 4);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      ctx.beginPath();                                          // the walkway on top
      ctx.moveTo(0, -H); ctx.lineTo(ex, ey - H);
      ctx.lineTo(ex, ey - H - 5); ctx.lineTo(0, -H - 5);
      ctx.closePath();
      ctx.fillStyle = pal.top; ctx.fill();
      if (kind !== 'wood') {                                    // crenellations
        ctx.fillStyle = pal.lit;
        for (let t = 0.14; t < 0.95; t += 0.28) {
          ctx.fillRect(ex * t - 3, ey * t - H - 11, 6, 7);
          ctx.fillStyle = pal.sun;
          ctx.fillRect(ex * t - 3, ey * t - H - 5, 6, 2);
          ctx.fillStyle = pal.lit;
        }
      }
    };
    ctx.fillStyle = 'rgba(0,0,0,.22)';                          // sat on the ground
    ctx.beginPath();
    ctx.ellipse(2, 2, half * 0.8, half * 0.42, 0, 0, 7);
    ctx.fill();
    const n = mask & 1, e = mask & 2, so = mask & 4, w = mask & 8;
    if (!mask) { run(1, -1); run(-1, 1); }        // standing alone: show a short stretch
    if (n) run(1, -1);
    if (so) run(-1, 1);
    if (e) run(1, 1);
    if (w) run(-1, -1);
    // the post where the wall turns, ends or stands alone
    ctx.fillStyle = pal.top;
    ctx.beginPath();
    ctx.moveTo(0, -H - 10); ctx.lineTo(11, -H - 4); ctx.lineTo(0, -H + 2); ctx.lineTo(-11, -H - 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.shade;
    ctx.beginPath();
    ctx.moveTo(-11, -H - 4); ctx.lineTo(0, -H + 2); ctx.lineTo(0, -H + 10); ctx.lineTo(-11, -H + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.sun;
    ctx.beginPath();
    ctx.moveTo(11, -H - 4); ctx.lineTo(0, -H + 2); ctx.lineTo(0, -H + 10); ctx.lineTo(11, -H + 4);
    ctx.closePath(); ctx.fill();
    if (kind === 'gate') {
      ctx.fillStyle = pal.top;                                  // towers either side
      ctx.fillRect(-20, -H - 16, 9, 20); ctx.fillRect(11, -H - 16, 9, 20);
      ctx.fillStyle = pal.shade;
      ctx.fillRect(-20, -H - 16, 9, 4); ctx.fillRect(11, -H - 16, 9, 4);
      ctx.fillStyle = '#1d1510';                                // the dark of the archway
      ctx.beginPath(); ctx.ellipse(0, -11, 9, 15, 0, Math.PI, 0); ctx.fill();
      ctx.fillRect(-9, -11, 18, 11);
      ctx.fillStyle = '#6b4a2e';                                // doors, standing open
      ctx.fillRect(-10, -24, 4, 23); ctx.fillRect(6, -24, 4, 23);
      ctx.fillStyle = '#8a6440';
      ctx.fillRect(-10, -24, 4, 2); ctx.fillRect(6, -24, 4, 2);
      ctx.fillStyle = c;                                        // banner over the gate
      ctx.fillRect(-5, -H - 24, 10, 13);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(0, -H - 24, 5, 13);
    }
  }

  const BDRAW = {
    towncenter(ctx, c) {
      const hw = 3 * TW / 2 - 6;
      box(ctx, hw, 22, STONE[0], STONE[1], STONE[2]); stoneTex(ctx, hw, 22);
      box(ctx, hw - 18, 22, PLASTER[0], PLASTER[1], PLASTER[2], 22);
      // timber beams
      ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1.5;
      const h2 = hw - 18;
      for (let k = 0; k <= 4; k++) { const t = k / 4; ctx.beginPath(); ctx.moveTo(-h2 + h2 * t, -22 + h2 / 2 * t); ctx.lineTo(-h2 + h2 * t, -44 + h2 / 2 * t); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h2 - h2 * t, -22 + h2 / 2 * t); ctx.lineTo(h2 - h2 * t, -44 + h2 / 2 * t); ctx.stroke(); }
      pyramid(ctx, h2 + 4, 44, 30, sh(c, 0.75), sh(c, 0.6));
      door(ctx, -14, 12, 10, 14); windowR(ctx, -40, 2); windowR(ctx, 20, 6);
      // corner tower
      ctx.save(); ctx.translate(0, -hw / 2 + 4); box(ctx, 12, 58, STONE[0], STONE[1], STONE[2]); crenel(ctx, 12, 58, STONE[1]); pyramid(ctx, 13, 58, 16, sh(c, 0.8), sh(c, 0.62)); ctx.restore();
      flag(ctx, 0, -hw / 2 - 70, 14, c);
    },
    house(ctx, c) {
      const hw = TW - 10;
      box(ctx, hw, 20, PLASTER[0], PLASTER[1], PLASTER[2]);
      ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-hw, -20); ctx.lineTo(0, hw / 2 - 20); ctx.lineTo(hw, -20); ctx.moveTo(-hw / 2, hw / 4); ctx.lineTo(-hw / 2, hw / 4 - 20); ctx.moveTo(hw / 2, hw / 4); ctx.lineTo(hw / 2, hw / 4 - 20); ctx.stroke();
      door(ctx, 8, 14, 8, 12); windowR(ctx, -30, 2);
      gable(ctx, hw + 3, 20, 20, sh(c, 0.7), sh(c, 0.55));
    },
    mill(ctx, c) {
      const hw = TW - 14;
      box(ctx, hw, 26, PLASTER[0], PLASTER[1], PLASTER[2]);
      door(ctx, 6, 14, 8, 12);
      pyramid(ctx, hw + 2, 26, 22, sh(c, 0.7), sh(c, 0.55));
      // sacks
      ctx.fillStyle = '#d9c38a'; ctx.beginPath(); ctx.ellipse(-30, 10, 6, 5, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(-22, 14, 6, 5, 0, 0, 7); ctx.fill();
    },
    lumbercamp(ctx, c) {
      const hw = TW - 12;
      // open shed: posts + roof
      ctx.fillStyle = WOOD[2];
      for (const [x, y] of [[-hw + 6, 0], [0, hw / 2 - 3], [hw - 6, 0], [0, -hw / 2 + 3]]) ctx.fillRect(x - 1.5, y - 24, 3, 24);
      // logs
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3 - k; j++) { ctx.fillStyle = WOOD[1]; ctx.beginPath(); ctx.ellipse(-14 + j * 10 + k * 5, 6 - k * 6, 5, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#d9b27a'; ctx.beginPath(); ctx.ellipse(-14 + j * 10 + k * 5, 6 - k * 6, 3, 3, 0, 0, 7); ctx.fill(); }
      gable(ctx, hw, 24, 12, sh(c, 0.7), sh(c, 0.55));
      ctx.fillStyle = '#888'; ctx.fillRect(20, 4, 10, 2); ctx.fillStyle = WOOD[2]; ctx.fillRect(28, -2, 2, 12);
    },
    miningcamp(ctx, c) {
      const hw = TW - 12;
      ctx.fillStyle = WOOD[2];
      for (const [x, y] of [[-hw + 6, 0], [0, hw / 2 - 3], [hw - 6, 0], [0, -hw / 2 + 3]]) ctx.fillRect(x - 1.5, y - 22, 3, 22);
      // cart with ore
      box(ctx, 14, 8, WOOD[0], WOOD[1], WOOD[2], 4);
      ctx.fillStyle = '#e6c34a'; ctx.beginPath(); ctx.arc(-4, -14, 4, 0, 7); ctx.arc(4, -14, 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(-10, 4, 3, 0, 7); ctx.arc(10, 4, 3, 0, 7); ctx.fill();
      gable(ctx, hw, 22, 12, sh(c, 0.7), sh(c, 0.55));
    },
    farm(ctx, c, b) {
      const hw = TW - 2, hh = hw / 2;
      diamond(ctx, hw, hh, 0); ctx.fillStyle = '#7a5a34'; ctx.fill();
      ctx.strokeStyle = '#5c4126'; ctx.lineWidth = 1; ctx.stroke();
      const f = b ? b.food / G.BUILDINGS.farm.farm : 1;
      const crop = f > 0.6 ? '#c9b24a' : f > 0.25 ? '#a7a33c' : '#7c8a37';
      ctx.strokeStyle = crop; ctx.lineWidth = 2.2;
      for (let k = 1; k < 8; k++) { const t = k / 8; ctx.beginPath(); ctx.moveTo(-hw + hw * t + 3, -hh * t + 1.5); ctx.lineTo(hw * t - 3, hh - hh * t - 1.5); ctx.stroke(); }
      // fence posts
      ctx.fillStyle = WOOD[2]; for (const [x, y] of [[-hw, 0], [0, hh], [hw, 0], [0, -hh]]) ctx.fillRect(x - 1, y - 6, 2, 6);
    },
    barracks(ctx, c) {
      const hw = 3 * TW / 2 - 10;
      box(ctx, hw, 34, STONE[0], STONE[1], STONE[2]); stoneTex(ctx, hw, 34);
      crenel(ctx, hw, 34, STONE[1]);
      door(ctx, -6, 26, 14, 18); windowR(ctx, -50, 4); windowR(ctx, 36, 8);
      // banners
      ctx.fillStyle = c; ctx.fillRect(-36, -2, 8, 18); ctx.fillRect(26, 2, 8, 18);
      // weapon rack
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(50 + k * 4, 18 - k * 2); ctx.lineTo(54 + k * 4, 2 - k * 2); ctx.stroke(); }
      flag(ctx, 0, -hw / 2 - 34, 16, c);
    },
    range(ctx, c) {
      const hw = 3 * TW / 2 - 10;
      box(ctx, hw - 10, 24, WOOD[0], WOOD[1], WOOD[2], 0);
      gable(ctx, hw - 6, 24, 18, sh(c, 0.7), sh(c, 0.55));
      door(ctx, -6, 22, 12, 14);
      // target
      for (const [x, y] of [[-52, 8], [48, 10]]) { ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.ellipse(x, y - 10, 7, 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.ellipse(x, y - 10, 4.5, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.ellipse(x, y - 10, 2, 2.3, 0, 0, 7); ctx.fill(); ctx.fillStyle = WOOD[2]; ctx.fillRect(x - 1, y - 2, 2, 6); }
    },
    stable(ctx, c) {
      const hw = 3 * TW / 2 - 10;
      box(ctx, hw - 8, 22, WOOD[0], WOOD[1], WOOD[2]);
      ctx.strokeStyle = WOOD[2]; ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) { const y = -k * 5.5; ctx.beginPath(); ctx.moveTo(-hw + 8, y); ctx.lineTo(0, y + (hw - 8) / 2); ctx.lineTo(hw - 8, y); ctx.stroke(); }
      gable(ctx, hw - 4, 22, 22, sh(c, 0.7), sh(c, 0.55));
      // stall doors
      for (let k = 0; k < 3; k++) door(ctx, 8 + k * 18, 22 - 0 + k * 9 - 2, 10, 13);
      // hay
      ctx.fillStyle = '#e3c75d'; ctx.beginPath(); ctx.ellipse(-50, 12, 9, 6, 0, 0, 7); ctx.fill();
    },
    // Anything without a drawer of its own — Blacksmith, Castle, Siege Workshop,
    // Monastery — falls back to this, so a sprite that fails to load costs the player a
    // plain building rather than a crash.
    generic(ctx, c, _d, size) {
      const hw = (size || 3) * TW / 2 - 8, h = 14 + (size || 3) * 5;
      box(ctx, hw, h, STONE[0], STONE[1], STONE[2]); stoneTex(ctx, hw, h);
      gable(ctx, hw - 4, h, 16 + (size || 3) * 3, sh(c, 0.7), sh(c, 0.55));
      door(ctx, -4, h - 2, 12, 15);
      flag(ctx, 0, -hw / 2 - h - 20, 12, c);
    },
    // A wall segment works out its own shape from the neighbours it finds, so a run of
    // them reads as one wall rather than a row of posts. mask bits: 1 N, 2 E, 4 S, 8 W.
    palisade(ctx, c, _d, _size, mask) { wallPiece(ctx, c, mask || 0, 'wood'); },
    stonewall(ctx, c, _d, _size, mask) { wallPiece(ctx, c, mask || 0, 'stone'); },
    gate(ctx, c, _d, _size, mask) { wallPiece(ctx, c, mask || 0, 'gate'); },
    tower(ctx, c) {
      const hw = TW / 2 - 6;
      box(ctx, hw, 64, STONE[0], STONE[1], STONE[2]); stoneTex(ctx, hw, 64);
      box(ctx, hw + 3, 8, STONE[0], STONE[1], STONE[2], 64);
      crenel(ctx, hw + 3, 72, STONE[1]);
      windowR(ctx, -10, -20); windowR(ctx, 4, -36);
      flag(ctx, 0, -hw / 2 - 72, 14, c);
    }
  };

  G.buildingSprite = function (type, owner, farmStage, mask) {
    const size = G.BUILDINGS[type].size;
    const c = G.ownerColor(owner);
    const w = size * TW + 40, h = size * TH + 140;
    const key = type + '|' + c + '|' + (farmStage || 0) + '|' + (mask || 0);
    return make(key, w, h, w / 2, h - size * TH / 2 - 14, ctx => {
      // soft shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; diamond(ctx, size * TW / 2 + 2, size * TH / 2 + 1, -2); ctx.fill();
      (BDRAW[type] || BDRAW.generic)(ctx, c, type === 'farm' ? { food: G.BUILDINGS.farm.farm * (1 - (farmStage || 0) / 3) } : null, size, mask);
    });
  };

  G.foundationSprite = function (type, stage) {
    const size = G.BUILDINGS[type].size;
    const w = size * TW + 40, h = size * TH + 80;
    return make('fnd|' + type + '|' + stage, w, h, w / 2, h - size * TH / 2 - 14, ctx => {
      const hw = size * TW / 2 - 4, hh = hw / 2;
      diamond(ctx, hw, hh, 0); ctx.fillStyle = 'rgba(120,95,60,0.55)'; ctx.fill(); ctx.strokeStyle = '#6b5232'; ctx.lineWidth = 1; ctx.stroke();
      if (stage > 0) {
        const z = 6 + stage * 10;
        ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2;
        for (const [x, y] of [[-hw, 0], [0, hh], [hw, 0], [0, -hh]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - z); ctx.stroke(); }
        ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-hw, -z); ctx.lineTo(0, hh - z); ctx.lineTo(hw, -z); ctx.lineTo(0, -hh - z); ctx.closePath(); ctx.stroke();
        if (stage > 1) { ctx.beginPath(); ctx.moveTo(-hw, -z / 2); ctx.lineTo(0, hh - z / 2); ctx.lineTo(hw, -z / 2); ctx.stroke(); }
      }
      // planks
      ctx.fillStyle = '#b08a5a'; ctx.fillRect(-10, -2, 14, 3); ctx.fillRect(-6, 2, 14, 3);
    });
  };

  // ---- resources ----
  G.resSprite = function (type, v) {
    return make('res|' + type + '|' + v, 70, 110, 35, 90, ctx => {
      const r = G.rng(v * 977 + type.length * 31);
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 2, 18, 8, 0, 0, 7); ctx.fill();
      if (type === 'tree') {
        ctx.fillStyle = '#5b3b1f'; ctx.fillRect(-2.5, -20, 5, 22);
        if (v % 2 === 0) { // pine
          const g = ['#1f5b2a', '#2a7134', '#358a3f'];
          for (let k = 2; k >= 0; k--) {
            const apex = -64 + k * 11, base = -38 + k * 11, hw = 8 + k * 4;
            ctx.fillStyle = g[k]; ctx.beginPath(); ctx.moveTo(0, apex); ctx.lineTo(hw, base); ctx.lineTo(-hw, base); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(0, apex); ctx.lineTo(hw, base); ctx.lineTo(0, base); ctx.closePath(); ctx.fill();
          }
        } else { // oak
          const g = ['#2e6b2a', '#3a8234', '#4c9a40'];
          const blobs = [[0, -38, 15], [-9, -30, 11], [9, -30, 11], [-4, -46, 10], [6, -44, 10]];
          blobs.forEach(([x, y, rr], k) => { ctx.fillStyle = g[k % 3]; ctx.beginPath(); ctx.arc(x + (r() - 0.5) * 3, y, rr, 0, 7); ctx.fill(); });
          ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(-4, -44, 6, 0, 7); ctx.fill();
        }
      } else if (type === 'berry') {
        ctx.fillStyle = '#2f6b2a'; ctx.beginPath(); ctx.arc(-6, -8, 9, 0, 7); ctx.arc(6, -8, 9, 0, 7); ctx.arc(0, -14, 10, 0, 7); ctx.fill();
        ctx.fillStyle = '#3e8a36'; ctx.beginPath(); ctx.arc(-2, -16, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#c62a4a';
        for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.arc((r() - 0.5) * 22, -6 - r() * 14, 2, 0, 7); ctx.fill(); }
      } else {
        const gold = type === 'gold';
        const cols = gold ? ['#8a7a5a', '#a89668', '#6e6248'] : ['#9c9a94', '#bbb8b0', '#7c7a75'];
        for (let k = 0; k < 4; k++) {
          const x = (k - 1.5) * 8 + (r() - 0.5) * 4, y = -4 - (k % 2) * 4, rr = 8 + r() * 4;
          ctx.fillStyle = cols[k % 3]; ctx.beginPath(); ctx.moveTo(x - rr, y); ctx.lineTo(x - rr * 0.4, y - rr * 1.1); ctx.lineTo(x + rr * 0.6, y - rr * 0.9); ctx.lineTo(x + rr, y); ctx.closePath(); ctx.fill();
        }
        if (gold) { ctx.fillStyle = '#f2cf3a'; for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc((r() - 0.5) * 26, -4 - r() * 12, 2 + r() * 1.5, 0, 7); ctx.fill(); } }
        else { ctx.fillStyle = '#e4e2dc'; for (let k = 0; k < 5; k++) ctx.fillRect((r() - 0.5) * 24, -6 - r() * 10, 3, 2); }
      }
    });
  };

  // ---- units (drawn live, small) ----
  G.drawUnit = function (ctx, u, x, y, z) {
    const c = G.ownerColor(u.owner);
    const t = u.type;
    const moving = u.path.length > 0;
    const step = moving ? Math.sin(u.walk * 12) : 0;
    const work = u.working ? Math.sin(G.time * 10 + u.id) : 0;
    ctx.save(); ctx.translate(x, y); ctx.scale(z * u.face, z);
    if (u.hitT) ctx.globalAlpha = 0.7;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); const mnt = G.mounted(u), sie = u.def && u.def.cls === 'sie';
    ctx.ellipse(0, 0, sie ? 13 : mnt ? 10 : 6, sie ? 5 : mnt ? 4 : 3, 0, 0, 7); ctx.fill();
    if (t === 'ram') {
      // a log under a pitched roof on four wheels; the log drives forward as it strikes
      const sw = u.atkAnim > 0 ? 1 : 0, roll = (u.dist || 0) * 3;
      ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.2;
      for (const wx of [-8, -2, 4, 10]) {
        ctx.fillStyle = '#5a3f24'; ctx.beginPath(); ctx.arc(wx, -3, 3, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(wx, -3); ctx.lineTo(wx + Math.cos(roll) * 2.6, -3 + Math.sin(roll) * 2.6); ctx.stroke();
      }
      ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-11, -9, 23, 4);                    // bed
      ctx.fillStyle = '#7a5530';                                                  // the ram itself
      ctx.fillRect(-6 + sw * 4, -14, 20, 4.5);
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(13 + sw * 4, -14.5, 3.5, 5.5);      // iron head
      ctx.fillStyle = '#4a3828';                                                  // roof
      ctx.beginPath(); ctx.moveTo(-13, -17); ctx.lineTo(0, -24); ctx.lineTo(13, -17); ctx.lineTo(13, -15); ctx.lineTo(-13, -15); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(-3, -25, 6, 3);                             // team pennant
    } else if (t === 'trebuchet') {
      // a timber frame, a counterweight that drops and an arm that whips over
      const sw = u.atkAnim > 0 ? 1 : 0, a = -2.1 + sw * 2.4;
      ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(0, -20); ctx.lineTo(9, -2); ctx.stroke();   // A-frame
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.stroke(); // base beam
      ctx.fillStyle = '#5a3f24';
      for (const wx of [-7, 7]) { ctx.beginPath(); ctx.arc(wx, -3, 2.6, 0, 7); ctx.fill(); }
      ctx.save(); ctx.translate(0, -20); ctx.rotate(a);                            // throwing arm
      ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 7); ctx.stroke();
      ctx.fillStyle = '#4a4238'; ctx.fillRect(-3, 6, 6, 6);                        // counterweight
      ctx.restore();
      ctx.fillStyle = c; ctx.fillRect(-2.5, -23, 5, 2.5);
    } else if (t === 'monk') {
      // a robed figure with no legs showing, a tonsure, and a cross he raises as he heals
      const sw = u.working ? (0.5 + 0.5 * Math.sin(G.time * 4 + u.id)) : 0;
      ctx.fillStyle = '#6d5a3f';
      ctx.beginPath(); ctx.moveTo(-5, -1); ctx.lineTo(-3.5, -15); ctx.lineTo(3.5, -15); ctx.lineTo(5, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(-4.2, -9, 8.4, 2.4);                       // girdle
      ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(0, -17.5, 2.9, 0, 7); ctx.fill();
      ctx.fillStyle = '#8b7355'; ctx.beginPath(); ctx.arc(0, -18.6, 2.9, Math.PI, 0); ctx.fill();   // tonsure
      ctx.strokeStyle = '#c9a65c'; ctx.lineWidth = 1.2;                           // cross
      const cy = -13 - sw * 4;
      ctx.beginPath(); ctx.moveTo(5.5, cy + 4); ctx.lineTo(5.5, cy - 4);
      ctx.moveTo(3.4, cy - 1.6); ctx.lineTo(7.6, cy - 1.6); ctx.stroke();
    } else if (mnt) {
      // horse
      const b = step * 1.5;
      ctx.fillStyle = '#6b4a2e';
      ctx.fillRect(-7 + b, -6, 2, 6); ctx.fillRect(5 - b, -6, 2, 6); ctx.fillRect(-4 - b, -6, 2, 6); ctx.fillRect(2 + b, -6, 2, 6);
      ctx.beginPath(); ctx.ellipse(0, -9, 9, 4.5, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(6, -11); ctx.lineTo(11, -17); ctx.lineTo(13, -15); ctx.lineTo(9, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c; ctx.fillRect(-6, -12, 10, 4); // caparison
      // rider
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(-3, -21, 6, 9);
      ctx.fillStyle = c; ctx.fillRect(-3, -17, 6, 3);
      ctx.fillStyle = '#b8bec6'; ctx.beginPath(); ctx.arc(0, -24, 3.2, 0, 7); ctx.fill();
      // lance
      ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-2, -16); ctx.lineTo(16 + work * 3, -24 + (u.atkAnim > 0 ? 6 : 0)); ctx.stroke();
    } else {
      // legs
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(-2.5 + step * 1.5, -6, 2, 6); ctx.fillRect(0.5 - step * 1.5, -6, 2, 6);
      // body
      const armored = t === 'militia' || t === 'spearman' || t === 'axethrower';
      ctx.fillStyle = t === 'villager' ? '#9b7b53' : armored ? '#8d939b' : '#6f7a46';
      ctx.fillRect(-3.5, -14, 7, 8.5);
      ctx.fillStyle = c; ctx.fillRect(-3.5, -11, 7, 3);
      // head
      ctx.fillStyle = '#e0b48a'; ctx.beginPath(); ctx.arc(0, -16.5, 2.8, 0, 7); ctx.fill();
      if (t === 'repeater') { // wide straw hat
        ctx.fillStyle = '#c8a85c'; ctx.beginPath(); ctx.moveTo(-5.5, -18); ctx.lineTo(5.5, -18); ctx.lineTo(0, -21.5); ctx.closePath(); ctx.fill();
      } else if (armored) { ctx.fillStyle = '#9aa0a8'; ctx.beginPath(); ctx.arc(0, -17.5, 3, Math.PI, 0); ctx.fill(); }
      else if (t === 'archer' || t === 'longbowman') { ctx.fillStyle = sh(c, 0.7); ctx.beginPath(); ctx.arc(0, -17.5, 3, Math.PI, 0); ctx.fill(); }
      else { ctx.fillStyle = '#c9a65c'; ctx.fillRect(-3.5, -19.5, 7, 1.6); }
      // weapon / tool
      const sw = u.atkAnim > 0 ? 1 : work;
      ctx.lineWidth = 1.3;
      if (t === 'militia') {
        ctx.strokeStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(3, -10); ctx.lineTo(9, -16 + sw * 6); ctx.stroke();
        ctx.fillStyle = sh(c, 0.8); ctx.fillRect(-6, -13, 3, 6);
      } else if (t === 'axethrower') {
        // francisca, cocked back over the shoulder and flung forward
        const a = -0.9 + sw * 2.1;
        ctx.save(); ctx.translate(3, -12); ctx.rotate(a);
        ctx.strokeStyle = '#7a5530'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -7); ctx.stroke();
        ctx.fillStyle = '#cfd4d9'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4, -8.5); ctx.lineTo(4, -4.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (t === 'repeater') {
        // magazine crossbow held level, box on top
        ctx.strokeStyle = '#6b4a2e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(1, -11); ctx.lineTo(8, -11.5); ctx.stroke();
        ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(6.5, -14); ctx.lineTo(6.5, -9); ctx.stroke();
        ctx.fillStyle = '#5a3a1f'; ctx.fillRect(3, -13.5, 3.5, 2);
      } else if (t === 'spearman') {
        ctx.strokeStyle = '#7a5530'; ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(7 + sw * 2, -24); ctx.stroke();
        ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.moveTo(7 + sw * 2, -27); ctx.lineTo(8.5 + sw * 2, -23); ctx.lineTo(5.8 + sw * 2, -23.5); ctx.closePath(); ctx.fill();
      } else if (t === 'archer') {
        ctx.strokeStyle = '#6b4a2e'; ctx.beginPath(); ctx.arc(4, -11, 6, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(4 + 6 * Math.cos(-1.2), -11 + 6 * Math.sin(-1.2)); ctx.lineTo(4 - (u.atkAnim > 0 ? 2 : 0), -11); ctx.lineTo(4 + 6 * Math.cos(1.2), -11 + 6 * Math.sin(1.2)); ctx.stroke();
      } else if (t === 'villager') {
        const job = u.task.t === 'gather' ? (u.task.rtype || '') : u.task.t;
        ctx.strokeStyle = '#7a5530';
        if (u.working && (job === 'tree' || job === 'gold' || job === 'stone' || job === 'build')) {
          const a = -0.6 + work * 0.9;
          ctx.save(); ctx.translate(3, -11); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -8); ctx.stroke();
          ctx.fillStyle = job === 'build' ? '#888' : '#bbb'; ctx.fillRect(-2, -9, job === 'tree' ? 3 : 4, 2.5); ctx.restore();
        } else if (u.working && (job === 'berry' || job === 'farm')) {
          ctx.fillStyle = '#c9a65c'; ctx.beginPath(); ctx.ellipse(4, -8 + work, 3, 2, 0, 0, 7); ctx.fill();
        }
        if (u.carry && u.carry.amt > 1) {
          const col = { wood: '#8a5f34', food: '#d14a4a', gold: '#f0c93a', stone: '#c8c6c0' }[u.carry.res];
          ctx.fillStyle = col; ctx.fillRect(-6, -14, 3.5, 5);
        }
      }
    }
    ctx.restore();
  };
})();
