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
    drawFrame(ctx, key, G.ownerColor(u.owner), f, x, y, z, u.face || 1, u.hitT ? 0.7 : 1);
    // carried load: drawn only when there is no dedicated carry animation
    if (u.carry && u.carry.amt > 1 && (legacy || anim === 'walk_se' || anim === 'walk_ne' || anim === 'idle')) {
      ctx.fillStyle = CARRY[u.carry.res];
      ctx.fillRect(x - 11 * z * (u.face || 1), y - 26 * z, 6 * z, 8 * z);
    }
    return true;
  };
  G.unitArtHeight = u => (animKey(u, 'idle', true) || animKey(u, 'walk_se', true) || art['unit_' + u.type + '_walk']) ? 46 : 0;

  // corpses: play the death animation once, hold the last frame, then fade
  G.drawCorpses = function (ctx, z) {
    for (const c of G.corpses || []) {
      const key = animKey(c, 'death') || animKey(c, 'death', true);
      if (!key || !(G.revealAll || G.isVisible(c.x, c.y))) continue;
      const s = G.toScreen(c.x, c.y);
      if (s.x < -80 || s.y < -80 || s.x > G.W + 80 || s.y > G.H + 80) continue;
      const n = art[key].def.frames;
      const f = Math.min(n - 1, Math.floor(c.t * FPS.death));
      const alpha = c.t > 10 ? Math.max(0, 1 - (c.t - 10) / 4) : 1;
      drawFrame(ctx, key, G.ownerColor(c.owner), f, s.x, s.y, z, c.face || 1, alpha);
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
