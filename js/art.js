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
  const CARRY = { wood: '#8a5f34', food: '#c8414a', gold: '#f0c93a', stone: '#c8c6c0' };
  G.drawUnitArt = function (ctx, u, x, y, z) {
    const key = 'unit_' + u.type + '_walk';
    const a = art[key];
    if (!a) return false;
    const sp = sprite(key, G.ownerColor(u.owner));
    const d = a.def, n = d.frames;
    const moving = u.path.length > 0;
    let f = 0, bob = 0, tilt = 0;
    if (moving) f = Math.floor(u.walk * 11) % n;
    else if (u.working) { const t = G.time * 6 + u.id; bob = Math.abs(Math.sin(t)) * 1.5; tilt = Math.sin(t) * 0.12; f = 4; }
    const cw = sp.cv.width / n, ch = sp.cv.height;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(0, 0, 9 * z, 4 * z, 0, 0, 7); ctx.fill();
    if (u.hitT) ctx.globalAlpha = 0.7;
    ctx.scale(u.face * z, z);
    ctx.translate(0, -bob);
    if (tilt) ctx.rotate(tilt);
    ctx.drawImage(sp.cv, f * cw, 0, cw, ch, -d.ax, -d.ay, d.fw, d.fh);
    if (u.carry && u.carry.amt > 1) { ctx.fillStyle = CARRY[u.carry.res]; ctx.fillRect(-11, -26, 6, 8); ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.strokeRect(-11, -26, 6, 8); }
    ctx.restore();
    return true;
  };

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
