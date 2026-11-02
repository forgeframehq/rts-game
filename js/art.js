// Loads painted sprites from assets/ and recolours magenta to each player's team colour.
// Falls back to the code-drawn sprites for anything missing or still loading.
(function () {
  const art = {};          // key -> { img, def }
  const tinted = new Map(); // key|color -> sprite object
  G.art = art;

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // Replace magenta pixels with the team colour, keeping their light and shade.
  function recolor(img, color) {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    if (!color) return cv;
    let data;
    try { data = c.getImageData(0, 0, cv.width, cv.height); } catch (e) { return cv; } // file:// can block pixel access
    const d = data.data, [tr, tg, tb] = hexRgb(color);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lo = Math.min(r, b);
      // magenta = red and blue both well above green, and similar to each other
      const m = Math.max(0, Math.min(1, (lo - g - 18) / 40)) * Math.max(0, Math.min(1, 1 - (Math.abs(r - b) - 70) / 80));
      if (m <= 0) continue;
      const lum = Math.min(1.35, (r + b) / 2 / 210);
      d[i] = r + (Math.min(255, tr * lum) - r) * m;
      d[i + 1] = g + (Math.min(255, tg * lum) - g) * m;
      d[i + 2] = b + (Math.min(255, tb * lum) - b) * m;
    }
    c.putImageData(data, 0, 0);
    return cv;
  }

  function sprite(key, color) {
    const a = art[key];
    if (!a) return null;
    const k = key + '|' + color;
    let s = tinted.get(k);
    if (!s) {
      s = { cv: recolor(a.img, color), w: a.def.w, h: a.def.h, ax: a.def.ax, ay: a.def.ay, art: true };
      tinted.set(k, s);
    }
    return s;
  }

  const baseBuilding = G.buildingSprite, baseFoundation = G.foundationSprite;
  G.buildingSprite = function (type, owner, farmStage) {
    // a spent field gets its own harvested art so you can see at a glance what needs sowing
    if (type === 'farm' && farmStage === 'spent') {
      return sprite('farm_spent', G.ownerColor(owner)) || sprite('farm', G.ownerColor(owner)) || baseBuilding(type, owner, 2);
    }
    return sprite(type, G.ownerColor(owner)) || baseBuilding(type, owner, farmStage);
  };
  G.foundationSprite = function (type, stage) {
    const size = G.BUILDINGS[type].size;
    return sprite('fnd_' + size, null) || baseFoundation(type, stage);
  };
  const baseRes = G.resSprite;
  G.resSprite = function (type, v) {
    return sprite(type === 'tree' ? 'res_tree_' + (v % 4) : 'res_' + type, null) || baseRes(type, v);
  };
  G.stumpSprite = () => sprite('stump', null);
  G.hasArt = key => !!art[key];

  // ---- animated units ----
  // Art keys: unit_<civ>_<type>_<sex>_<anim>, falling back to the Britons set, then to the old single walk strip.
  const CARRY = { wood: '#8a5f34', food: '#c8414a', gold: '#f0c93a', stone: '#c8c6c0' };
  const FPS = { walk_se: 11, walk_ne: 11, carry_wood: 10, carry_ore: 9, carry_food: 10, idle: 5, chop: 9, mine: 9, farm: 8, forage: 8, build: 10, death: 10 };
  const STRIDE = 1.15;
  const WORK = { tree: 'chop', gold: 'mine', stone: 'mine', berry: 'forage' };
  const CARRY_ANIM = { wood: 'carry_wood', gold: 'carry_ore', stone: 'carry_ore', food: 'carry_food' };

  function animKey(u, anim, anySex) {
    const civ = G.players[u.owner] ? G.players[u.owner].civ : 'britons';
    const sx = u.sex || 'm';
    const keys = [`unit_${civ}_${u.type}_${sx}_${anim}`, `unit_britons_${u.type}_${sx}_${anim}`];
    if (anySex) keys.push(`unit_britons_${u.type}_m_${anim}`, `unit_britons_${u.type}_f_${anim}`);
    for (const k of keys) if (art[k]) return k;
    return null;
  }
  function pickAnim(u) {
    const moving = u.path.length > 0;
    if (moving) {
      if (u.carry && u.carry.amt >= 1 && (u.task.t === 'return' || u.carry.amt >= G.CARRY - 0.01)) return [CARRY_ANIM[u.carry.res], 'walk_se'];
      return u.up ? ['walk_ne', 'walk_se'] : ['walk_se'];
    }
    if (u.working) {
      const t = u.task;
      if (t.t === 'gather') return [WORK[t.rtype] || 'chop', 'idle'];
      if (t.t === 'farm') return ['farm', 'forage', 'idle'];
      if (t.t === 'build') return ['build', 'idle'];
      if (t.t === 'attack') return ['chop', 'idle'];
    }
    return ['idle', 'walk_se'];
  }
  // ---- 3D-rendered units: 8 directions (rows) x frames (columns), see tools/render3d ----
  G.use3d = !/[?&]2d\b/.test(location.search);
  const FPS3 = { idle: 5, chop: 9, mine: 9, farm: 8, forage: 8, build: 10, death: 10 };
  const STRIDE3 = 0.95;
  function key3d(u, a3) {
    const civ = G.players[u.owner] ? G.players[u.owner].civ : 'britons';
    const sx = u.sex || 'm';
    const reg = G.REGION[civ] || 'western';   // soldiers are shared per region, like AoE2
    const tier = (u.def && u.def.tier) || 0;    // upgraded look (Man-at-Arms, Pikeman, ...); falls back to the best lower tier
    for (let t = tier; t >= 0; t--) {
      const sfx = t ? `${sx}_t${t}_${a3}` : `${sx}_${a3}`;
      for (const k of [`unit3d_${civ}_${u.type}_${sfx}`, `unit3d_${reg}_${u.type}_${sfx}`, `unit3d_britons_${u.type}_${sfx}`, `unit3d_western_${u.type}_${sfx}`]) if (art[k]) return k;
    }
    return null;
  }
  function pick3d(u) {
    const moving = u.path.length > 0;
    if (moving) {
      if (u.carry && u.carry.amt >= 1 && (u.task.t === 'return' || u.carry.amt >= G.CARRY - 0.01)) return [CARRY_ANIM[u.carry.res], 'walk'];
      return ['walk'];
    }
    if (u.working) {
      const t = u.task;
      if (t.t === 'gather') return [WORK[t.rtype] || 'chop', 'idle'];
      if (t.t === 'farm') return ['farm', 'idle'];
      if (t.t === 'build') return ['build', 'idle'];
      if (t.t === 'attack') return ['attack', 'chop', 'idle'];
    }
    return ['idle'];
  }
  function drawFrame3(ctx, key, color, f, row, x, y, z, alpha) {
    const a = art[key], sp = sprite(key, color), d = a.def;
    const cw = sp.cv.width / d.frames, ch = sp.cv.height / d.rows;
    if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
    ctx.drawImage(sp.cv, (f % d.frames) * cw, row * ch, cw, ch, x - d.ax * z, y - d.ay * z, d.fw * z, d.fh * z);
    if (alpha < 1) ctx.restore();
  }
  // where in each attack animation the blow lands (0..1)
  const IMPACT = { militia: { attack: 0.5, attack2: 0.4 }, spearman: { attack: 0.55, attack2: 0.35 }, archer: { attack: 0.92 }, longbowman: { attack: 0.92 }, knight: { attack: 0.45 } };
  function drawShadow(ctx, x, y, z) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y, 9 * z, 4 * z, 0, 0, 7); ctx.fill(); }
  function draw3d(ctx, u, x, y, z) {
    if (!G.use3d) return false;
    let key = null, anim = null;
    for (const name of pick3d(u)) { key = key3d(u, name); if (key) { anim = name; break; } }
    if (!key) return false;
    const d = art[key].def, moving = u.path.length > 0;
    // ---- combat: swing locked to the real hit, combat stance between swings, flinch / block when struck ----
    if (anim === 'attack' && !moving) {
      const rate = u.def.rate || 2, cool = Math.max(0, u.cool);
      if (u.lastCool !== undefined && cool > u.lastCool + 0.01) u.swingN = (u.swingN || 0) + 1;   // a new strike was dealt
      u.lastCool = cool;
      const k2 = (u.swingN || 0) % 2 && key3d(u, 'attack2');
      const sk = k2 || key, sd = art[sk].def;
      const imp = (IMPACT[u.type] || {})[k2 ? 'attack2' : 'attack'] || (u.def.ranged ? 0.9 : 0.55);
      const T = Math.min(rate * 0.95, sd.cycle || 1), e = rate - cool;
      let ph = -1;
      if (e < (1 - imp) * T) ph = imp + e / T;            // follow-through after the hit
      else if (cool <= imp * T) ph = imp - cool / T;      // wind-up into the next hit
      drawShadow(ctx, x, y, z);
      if (ph >= 0) { drawFrame3(ctx, sk, G.ownerColor(u.owner), Math.min(sd.frames - 1, Math.floor(ph * sd.frames)), u.dir || 0, x, y, z, 1); return true; }
      const hk = u.hurtT > 0 && (((u.id + (u.swingN || 0)) % 3 === 0 && key3d(u, 'block')) || key3d(u, 'hit'));
      if (hk) { const hd = art[hk].def; drawFrame3(ctx, hk, G.ownerColor(u.owner), Math.min(hd.frames - 1, Math.floor((1 - u.hurtT / 0.6) * hd.frames)), u.dir || 0, x, y, z, 1); return true; }
      const rk = key3d(u, 'ready') || key3d(u, 'idle');
      if (rk) { const rd = art[rk].def; drawFrame3(ctx, rk, G.ownerColor(u.owner), Math.floor((G.time + (u.id % 7) * 0.37) * Math.min(14, Math.max(7, rd.frames / (rd.cycle || 1.6)))), u.dir || 0, x, y, z, 1); return true; }
    }
    if (!moving && u.hurtT > 0 && u.type !== 'villager') {
      const hk = key3d(u, 'hit');
      if (hk) { const hd = art[hk].def; drawShadow(ctx, x, y, z); drawFrame3(ctx, hk, G.ownerColor(u.owner), Math.min(hd.frames - 1, Math.floor((1 - u.hurtT / 0.6) * hd.frames)), u.dir || 0, x, y, z, 1); return true; }
    }
    const f = moving ? Math.floor((u.dist || 0) / (d.stride || STRIDE3) * d.frames) : Math.floor((G.time + (u.id % 7) * 0.37) * (d.cycle ? Math.min(14, Math.max(7, d.frames / d.cycle)) : (FPS3[anim] || 8)));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y, 9 * z, 4 * z, 0, 0, 7); ctx.fill();
    drawFrame3(ctx, key, G.ownerColor(u.owner), f, u.dir || 0, x, y, z, u.hitT ? 0.7 : 1);
    return true;
  }

  function drawFrame(ctx, key, color, f, x, y, z, face, alpha) {
    const a = art[key], sp = sprite(key, color), d = a.def;
    const cw = sp.cv.width / d.frames, ch = sp.cv.height;
    ctx.save(); ctx.translate(x, y);
    if (alpha < 1) ctx.globalAlpha = alpha;
    ctx.scale(face * z, z);
    ctx.drawImage(sp.cv, (f % d.frames) * cw, 0, cw, ch, -d.ax, -d.ay, d.fw, d.fh);
    ctx.restore();
  }

  G.drawUnitArt = function (ctx, u, x, y, z) {
    if (draw3d(ctx, u, x, y, z)) return true;
    let key = null, anim = null;
    const names = pickAnim(u);
    for (const name of names) { key = animKey(u, name); if (key) { anim = name; break; } }
    if (!key) for (const name of names) { key = animKey(u, name, true); if (key) { anim = name; break; } }
    let legacy = false;
    if (!key) { key = 'unit_' + u.type + '_walk'; if (!art[key]) return false; legacy = true; }
    const d = art[key].def;
    const moving = u.path.length > 0;
    let f = 0;
    if (legacy) f = moving ? Math.floor(u.walk * 11) % d.frames : 0;
    // steps follow distance travelled, so feet don't slide (one full 8-frame cycle per STRIDE tiles)
    else if (moving) f = Math.floor((u.dist || 0) / STRIDE * d.frames);
    else f = Math.floor((G.time + (u.id % 7) * 0.37) * (FPS[anim] || 8));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y, 9 * z, 4 * z, 0, 0, 7); ctx.fill();
    // quick turn: the sprite narrows and flips over ~0.12s instead of snapping
    const fc = u.face || 1;
    if (u.fv === undefined) u.fv = fc;
    u.fv += Math.max(-1, Math.min(1, fc - u.fv)) * Math.min(1, (G.frameDt || 0.016) / 0.06);
    const fs = Math.sign(u.fv || fc) * Math.max(0.35, Math.abs(u.fv));
    drawFrame(ctx, key, G.ownerColor(u.owner), f, x, y, z, fs, u.hitT ? 0.7 : 1);
    // carried load: drawn only when there is no dedicated carry animation
    if (u.carry && u.carry.amt > 1 && (legacy || anim === 'walk_se' || anim === 'walk_ne' || anim === 'idle')) {
      ctx.fillStyle = CARRY[u.carry.res];
      ctx.fillRect(x - 11 * z * (u.face || 1), y - 26 * z, 6 * z, 8 * z);
    }
    return true;
  };
  G.unitArtHeight = u => (G.use3d && key3d(u, 'idle')) ? Math.max(46, art[key3d(u, 'idle')].def.ay + 4) : (animKey(u, 'idle', true) || animKey(u, 'walk_se', true) || art['unit_' + u.type + '_walk']) ? 46 : 0;

  // corpses: play the death animation once, hold the last frame, then fade
  G.drawCorpses = function (ctx, z) {
    for (const c of G.corpses || []) {
      const k3 = G.use3d ? key3d(c, 'death') : null;
      const key = k3 || animKey(c, 'death') || animKey(c, 'death', true);
      if (!key || !(G.revealAll || G.isVisible(c.x, c.y))) continue;
      const s = G.toScreen(c.x, c.y);
      if (s.x < -80 || s.y < -80 || s.x > G.W + 80 || s.y > G.H + 80) continue;
      const n = art[key].def.frames;
      const f = Math.min(n - 1, Math.floor(c.t * FPS.death));
      const alpha = c.t > 10 ? Math.max(0, 1 - (c.t - 10) / 4) : 1;
      if (k3) drawFrame3(ctx, key, G.ownerColor(c.owner), f, c.dir || 0, s.x, s.y, z, alpha);
      else drawFrame(ctx, key, G.ownerColor(c.owner), f, s.x, s.y, z, c.face || 1, alpha);
    }
  };
  G.hasDeathArt = u => !!animKey(u, 'death', true);

  G.loadArt = function (done) {
    fetch('assets/manifest.json').then(r => r.json()).then(man => {
      const keys = Object.keys(man);
      let left = keys.length;
      const fin = () => { if (--left === 0 && done) done(); };
      for (const k of keys) {
        const img = new Image();
        img.onload = () => { art[k] = { img, def: man[k] }; fin(); };
        img.onerror = fin;
        img.src = man[k].file;
      }
    }).catch(() => done && done());
  };
})();
