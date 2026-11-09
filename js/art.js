// Loads painted sprites from assets/ and recolours magenta to each player's team colour.
// Falls back to the code-drawn sprites for anything missing or still loading.
(function () {
  const art = {};          // key -> { img, def }
  const tinted = new Map(); // key|color -> sprite object
  G.art = art;

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  // ---- dyeing a shared sprite for a dynasty ----
  // Villagers are painted once (the Britons set) and dyed per dynasty here, so every
  // dynasty gets its own cloth colour and skin tone without shipping another sprite sheet.
  // Cloth is hue-shifted; face, hands and hair are found per frame and left alone (bar a
  // small skin shift); magenta is skipped so the team colour still lands on top.
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 1e-6) h = 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
    return [h, mx ? d / mx : 0, mx];
  }
  function hsv2rgb(h, s, v) {
    const i = Math.floor(h / 60) % 6, f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const o = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i];
    return [o[0] * 255, o[1] * 255, o[2] * 255];
  }
  function dye(d, w, h, frames, rows, look) {
    const cw = w / frames, ch = h / rows;
    for (let ry = 0; ry < rows; ry++) for (let fx = 0; fx < frames; fx++) {
      const x0 = Math.round(fx * cw), x1 = Math.round((fx + 1) * cw);
      const y0 = Math.round(ry * ch), y1 = Math.round((ry + 1) * ch);
      let top = -1, bot = -1;
      for (let y = y0; y < y1; y++) {
        let any = false;
        for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] > 40) { any = true; break; }
        if (any) { if (top < 0) top = y; bot = y; }
      }
      if (top < 0) continue;
      const tall = bot - top + 1;
      // the head: the top fifth of the figure, narrowed to the columns the crown covers,
      // so the mask stops at the neck instead of running out over the shoulders
      const crown = top + Math.max(1, Math.round(tall * 0.07)), headBot = top + Math.max(1, Math.round(tall * 0.20));
      let hx0 = x1, hx1 = x0;
      for (let y = top; y < crown; y++) for (let x = x0; x < x1; x++) if (d[(y * w + x) * 4 + 3] > 40) {
        if (x < hx0) hx0 = x; if (x > hx1) hx1 = x;
      }
      hx0 = Math.max(x0, hx0 - 2); hx1 = Math.min(x1 - 1, hx1 + 2);
      const waist = top + Math.round(tall * 0.55);   // tunic above, trousers or skirt below
      for (let y = top; y <= bot; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] <= 40) continue;
        const hsv = rgb2hsv(d[i], d[i + 1], d[i + 2]), hu = hsv[0], sa = hsv[1], va = hsv[2];
        if (sa > 0.35 && hu > 270 && hu < 340) continue;                    // team colour
        const onHead = y < headBot && x >= hx0 && x <= hx1;
        const hair = onHead && va < 0.32;
        const skin = !hair && (onHead || (hu > 10 && hu < 46 && sa > 0.18 && sa < 0.68 && va > 0.38));
        let out;
        if (hair) out = hsv2rgb((hu + look.hairH + 360) % 360, Math.min(1, sa * look.hairS), Math.min(1, va * look.hairV));
        else if (skin) out = hsv2rgb((hu + look.skinH + 360) % 360, Math.min(1, sa * look.skinS), Math.min(1, va * look.skinV));
        // pale undyed cloth (the women's long apron): give it the dynasty's own tint too,
        // or every dynasty's women look the same from across the map
        else if (look.apron && sa < 0.32 && va > 0.55 && !onHead)
          out = hsv2rgb(look.apron[0], look.apron[1], Math.min(1, va * look.apron[2]));
        else if (sa > 0.18) {
          const lo = y >= waist;
          out = hsv2rgb(lo ? look.hue2 : look.hue,
            Math.min(1, sa * (lo ? look.sat2 : look.sat)), Math.min(1, va * (lo ? look.val2 : look.val)));
        } else continue;
        d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
      }
    }
  }

  // Replace magenta pixels with the team colour, keeping their light and shade.
  function recolor(img, color, look, def) {
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    if (!color && !look) return cv;
    let data;
    try { data = c.getImageData(0, 0, cv.width, cv.height); } catch (e) { return cv; } // file:// can block pixel access
    const d = data.data, [tr, tg, tb] = hexRgb(color || '#ffffff');
    // dye first: the dynasty pass needs to see the magenta it must skip
    if (look && def) dye(d, cv.width, cv.height, def.frames || 1, def.rows || 1, look);
    if (!color) { c.putImageData(data, 0, 0); return cv; }
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

  // Everything built on the shared villager body — villagers, the King, the Queen, the
  // Monk — is painted once and dyed per dynasty here. A dynasty dyes a sprite only when it
  // is borrowing another dynasty's art: the moment its own sheet exists
  // (unit3d_franks_villager_…), that art is used as painted.
  const DYED = ['_villager_', '_king_', '_queen_', '_monk_'];
  function lookFor(key, civ) {
    const l = civ && G.CIV_LOOK && G.CIV_LOOK[civ];
    if (!l || key.indexOf('_' + civ + '_') > 0) return null;
    return DYED.some(k => key.indexOf(k) > 0) ? l : null;
  }
  function sprite(key, color, civ) {
    const a = art[key];
    if (!a) return null;
    const look = lookFor(key, civ);
    const k = key + '|' + color + (look ? '|' + civ : '');
    let s = tinted.get(k);
    if (!s) {
      s = { cv: recolor(a.img, color, look, a.def), w: a.def.w, h: a.def.h, ax: a.def.ax, ay: a.def.ay, chim: a.def.chim || null, art: true };
      tinted.set(k, s);
    }
    return s;
  }

  const baseBuilding = G.buildingSprite, baseFoundation = G.foundationSprite;
  // buildings are made once per region (western / mediterranean / eastasian) and fall back to the western set
  const civOf = owner => (G.players[owner] && G.players[owner].civ) || null;
  const regionOf = owner => (G.players[owner] && G.REGION[G.players[owner].civ]) || 'western';
  // Buildings change with the Age, the way they do in Age of Empires: a Dark Age town is
  // thatch and rough timber, and the same plot is stone once you reach Feudal. Art for a
  // tier is optional — a building with none simply keeps its default look at every Age,
  // so new tier art can be dropped in one building at a time without touching this.
  const AGE_TIER = [null, 'dark', 'feudal', 'castle', 'imp'];
  const bldKey = (type, owner) => {
    // farms are the same field everywhere: one shared look for every dynasty and every Age
    if (type === 'farm' || type === 'farm_spent') return type;
    const r = regionOf(owner), west = r === 'western';
    const tier = AGE_TIER[(G.players[owner] && G.players[owner].age) || 1];
    const tries = [];
    if (tier) { if (!west) tries.push(r + '_' + type + '_' + tier); tries.push(type + '_' + tier); }
    if (!west) tries.push(r + '_' + type);
    for (const k of tries) if (art[k]) return k;
    return type;
  };
  // painted construction stage n (1 bare frame, 2 half built) of this owner's building, if any
  G.stageSprite = (type, owner, n) => { const k = bldKey(type, owner) + '_s' + n; return art[k] ? sprite(k, G.ownerColor(owner)) : null; };
  G.buildingSprite = function (type, owner, farmStage, mask) {
    // walls are drawn in code from their neighbours, so they never take painted art
    if (G.BUILDINGS[type] && G.BUILDINGS[type].wall) return baseBuilding(type, owner, farmStage, mask);
    const key = bldKey(type, owner);
    // a spent field gets its own harvested art so you can see at a glance what needs sowing
    if (type === 'farm' && farmStage === 'spent') {
      return sprite(bldKey('farm_spent', owner), G.ownerColor(owner)) || sprite(key, G.ownerColor(owner)) || baseBuilding(type, owner, 2);
    }
    return sprite(key, G.ownerColor(owner)) || baseBuilding(type, owner, farmStage);
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
      // farming and sowing a new field: bending to the crop with a basket (the rendered 'farm'
      // motion has no tool in hand and reads as flailing, so it is not used)
      if (t.t === 'farm') return ['forage', 'idle'];
      if (t.t === 'build') { const b = G.byId.get(t.id); return b && b.type === 'farm' ? ['forage', 'idle'] : ['build', 'idle']; }
      if (t.t === 'attack') return ['attack', 'chop', 'idle'];
    }
    return ['idle'];
  }
  function drawFrame3(ctx, key, owner, f, row, x, y, z, alpha) {
    const a = art[key], sp = sprite(key, G.ownerColor(owner), civOf(owner)), d = a.def;
    const cw = sp.cv.width / d.frames, ch = sp.cv.height / d.rows;
    if (alpha < 1) { ctx.save(); ctx.globalAlpha = alpha; }
    const fo = d.fo && d.fo[row] || [0, 0];   // per-direction foot correction (tools/foot_anchor.py)
    ctx.drawImage(sp.cv, (f % d.frames) * cw, row * ch, cw, ch, x - (d.ax + fo[0]) * z, y - (d.ay + fo[1]) * z, d.fw * z, d.fh * z);
    if (alpha < 1) ctx.restore();
  }
  // where in each attack animation the blow lands (0..1)
  const IMPACT = { militia: { attack: 0.5, attack2: 0.4 }, spearman: { attack: 0.55, attack2: 0.35 }, archer: { attack: 0.92 }, longbowman: { attack: 0.92 }, knight: { attack: 0.45 },
    axethrower: { attack: 0.62, attack2: 0.45 }, cataphract: { attack: 0.45 }, repeater: { attack: 0.92 },
    ram: { attack: 0.8 }, trebuchet: { attack: 0.45 }, elephant: { attack: 0.55 }, kamayuk: { attack: 0.5 }, templeguard: { attack: 0.5 } };   // ram: the head drives home; trebuchet: the sling lets go
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
      if (ph >= 0) { drawFrame3(ctx, sk, u.owner, Math.min(sd.frames - 1, Math.floor(ph * sd.frames)), u.dir || 0, x, y, z, 1); return true; }
      const hk = u.hurtT > 0 && (((u.id + (u.swingN || 0)) % 3 === 0 && key3d(u, 'block')) || key3d(u, 'hit'));
      if (hk) { const hd = art[hk].def; drawFrame3(ctx, hk, u.owner, Math.min(hd.frames - 1, Math.floor((1 - u.hurtT / 0.6) * hd.frames)), u.dir || 0, x, y, z, 1); return true; }
      const rk = key3d(u, 'ready') || key3d(u, 'idle');
      if (rk) { const rd = art[rk].def; drawFrame3(ctx, rk, u.owner, Math.floor((G.time + (u.id % 7) * 0.37) * Math.min(14, Math.max(7, rd.frames / (rd.cycle || 1.6)))), u.dir || 0, x, y, z, 1); return true; }
    }
    if (!moving && u.hurtT > 0 && u.type !== 'villager') {
      const hk = key3d(u, 'hit');
      if (hk) { const hd = art[hk].def; drawShadow(ctx, x, y, z); drawFrame3(ctx, hk, u.owner, Math.min(hd.frames - 1, Math.floor((1 - u.hurtT / 0.6) * hd.frames)), u.dir || 0, x, y, z, 1); return true; }
    }
    const f = moving ? Math.floor((u.dist || 0) / (d.stride || STRIDE3) * d.frames) : Math.floor((G.time + (u.id % 7) * 0.37) * (d.cycle ? Math.min(14, Math.max(7, d.frames / d.cycle)) : (FPS3[anim] || 8)));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(x, y, 9 * z, 4 * z, 0, 0, 7); ctx.fill();
    drawFrame3(ctx, key, u.owner, f, u.dir || 0, x, y, z, u.hitT ? 0.7 : 1);
    return true;
  }

  function drawFrame(ctx, key, owner, f, x, y, z, face, alpha) {
    const a = art[key], sp = sprite(key, G.ownerColor(owner), civOf(owner)), d = a.def;
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
    ctx.beginPath(); ctx.ellipse(x, y, (u.def && u.def.cls === 'sie' ? 13 : 9) * z, (u.def && u.def.cls === 'sie' ? 5 : 4) * z, 0, 0, 7); ctx.fill();
    // a siege engine is one painted machine with no swing of its own, so it rocks forward
    // into the blow and back out again as it strikes
    if (u.def && u.def.siege && u.atkAnim > 0) x += (u.face || 1) * Math.sin(u.atkAnim * Math.PI) * 3.5 * z;
    // quick turn: the sprite narrows and flips over ~0.12s instead of snapping
    const fc = u.face || 1;
    if (u.fv === undefined) u.fv = fc;
    u.fv += Math.max(-1, Math.min(1, fc - u.fv)) * Math.min(1, (G.frameDt || 0.016) / 0.06);
    const fs = Math.sign(u.fv || fc) * Math.max(0.35, Math.abs(u.fv));
    drawFrame(ctx, key, u.owner, f, x, y, z, fs, u.hitT ? 0.7 : 1);
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
      if (k3) drawFrame3(ctx, key, c.owner, f, c.dir || 0, s.x, s.y, z, alpha);
      else drawFrame(ctx, key, c.owner, f, s.x, s.y, z, c.face || 1, alpha);
    }
  };
  G.hasDeathArt = u => !!animKey(u, 'death', true);

  G.loadArt = function (done) {
    // the main index plus the construction stages, which keep their own small index
    Promise.all(['assets/manifest.json', 'assets/stages.json'].map(u => fetch(u).then(r => r.ok ? r.json() : {}).catch(() => ({}))))
      .then(([a, b]) => Object.assign({}, a, b)).then(man => {
      // each dynasty's own units (~15 MB a dynasty) load only when that dynasty is in a match
      MAN = man; const keys = Object.keys(man).filter(k => !CIV_ART.test(k));
      let left = keys.length;
      const fin = () => { if (--left === 0 && done) done(); };
      // packed unit images (tools/pack_units.py) hold several sheets: load each file once
      // and cut every sheet back out to a canvas of its own
      const get = f => files[f] || (files[f] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = f; }));
      for (const k of keys) {
        const d = man[k];
        get(d.file).then(img => {
          if (img && d.sh) {
            const c = document.createElement('canvas'); c.width = d.sw; c.height = d.sh;
            c.getContext('2d').drawImage(img, d.sx || 0, d.sy || 0, d.sw, d.sh, 0, 0, d.sw, d.sh);
            c.naturalWidth = d.sw; c.naturalHeight = d.sh;
            art[k] = { img: c, def: d };
          } else if (img) art[k] = { img, def: d };
          fin();
        });
      }
      for (const c of wanted) G.loadCivArt(c);
    }).catch(() => done && done());
  };
  // load one dynasty's own unit art (once). Until it arrives its units draw with the shared set.
  const CIV_ART = /^unit3d_(britons|franks|byzantines|chinese|persians|incas|cholas)_/;
  let MAN = null; const wanted = new Set(), civDone = new Set(), files = {};
  function get(f) { return files[f] || (files[f] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = f; })); }
  function cut(k, d, img) {
    if (img && d.sh) {
      const c = document.createElement('canvas'); c.width = d.sw; c.height = d.sh;
      c.getContext('2d').drawImage(img, d.sx || 0, d.sy || 0, d.sw, d.sh, 0, 0, d.sw, d.sh);
      c.naturalWidth = d.sw; c.naturalHeight = d.sh;
      art[k] = { img: c, def: d };
    } else if (img) art[k] = { img, def: d };
  }
  G.loadCivArt = function (civ) {
    if (!civ || civDone.has(civ)) return;
    if (!MAN) { wanted.add(civ); return; }
    civDone.add(civ);
    for (const k in MAN) if (k.startsWith('unit3d_' + civ + '_')) get(MAN[k].file).then(img => cut(k, MAN[k], img));
  };
})();
