// ⭐ Specials: one simple move per kind of soldier, on one button. Plus Combined Arms, a small
// automatic bonus for armies that mix melee, archers and cavalry.
(function () {
  const COOL = 30;
  // unit type -> its move
  const BY_TYPE = {
    spearman: 'brace', militia: 'rush', archer: 'volley', scout: 'charge', knight: 'charge',
    longbowman: 'firearrows', axethrower: 'axestorm', cataphract: 'greekfire', repeater: 'rocket'
  };
  G.SPECIALS = {
    brace:      { name: 'Brace',       icon: '🛡️', desc: 'Spearmen plant their spears and hold: tougher for 8 s, and cavalry that charge them get hurt.' },
    rush:       { name: 'Rush',        icon: '💨', desc: 'Swordsmen sprint for 5 s to close in fast.' },
    volley:     { name: 'Volley',      icon: '🏹', desc: 'Archers loose one big volley together: harder hits that splash.' },
    charge:     { name: 'Charge',      icon: '🐎', desc: 'Cavalry burst forward; the first blow hits twice as hard and knocks back. Tired for a while after.' },
    firearrows: { name: 'Fire Arrows', icon: '🔥', desc: 'Britons: a burning volley. Buildings hit keep burning.' },
    axestorm:   { name: 'Axe Storm',   icon: '🪓', desc: 'Franks: two throws at once that stun the target.' },
    greekfire:  { name: 'Greek Fire',  icon: '🔥', desc: 'Byzantines: a line of fire on the ground ahead that burns the enemy crossing it.' },
    rocket:     { name: 'Rocket Barrage', icon: '🎆', desc: 'Chinese: a salvo that lands on an area after a moment.' }
  };
  G.specialOf = u => (u && u.kind === 'unit' && u.type !== 'villager' && !u.def.siege && u.def.cls !== 'hero' ? BY_TYPE[u.type] || (u.def.ranged ? 'volley' : u.def.cls === 'cav' ? 'charge' : 'rush') : null);
  G.specialReady = u => !(u.spReady > G.time);

  const enemyNear = (u, r) => G.nearest(u, e => (e.kind === 'unit' || e.kind === 'building') && !e.dead && G.enemies(e.owner, u.owner), r);
  const fx = (x, y, col) => G.effects.push({ t: 'ping', x, y, col, life: 0.6 });
  G.fires = [];

  // use the Special of every ready unit in the group; returns how many acted
  G.useSpecial = function (units) {
    let n = 0;
    for (const u of units) {
      if (u.dead || !G.specialReady(u)) continue;
      const k = G.specialOf(u); if (!k) continue;
      if (doSpecial(u, k)) { u.spReady = G.time + COOL; u.spKind = k; n++; }
    }
    if (n && G.sound) G.sound.play(units.some(u => u.spKind === 'charge' && u.spReady > G.time) ? 'charge' : 'special', units[0].x, units[0].y);
    return n;
  };
  function doSpecial(u, k) {
    const t = (u.task.t === 'attack' && G.byId.get(u.task.id)) || enemyNear(u, Math.max(u.def.range || 1, 1) + (u.def.ranged ? 1.5 : 7));
    switch (k) {
      case 'brace': u.brace = G.time + 8; u.task = { t: 'idle' }; u.path = []; fx(u.x, u.y, '#9fd3ff'); return true;
      case 'rush': u.rush = G.time + 5; if (t && u.task.t !== 'attack') G.cmdAttack([u], t); fx(u.x, u.y, '#fff'); return true;
      case 'charge':
        u.charge = G.time + 3; u.chargeHit = true; u.tired = G.time + 13;
        if (t) { G.cmdAttack([u], t); }
        fx(u.x, u.y, '#ffd76a'); return true;
      case 'volley': case 'firearrows': case 'axestorm': case 'rocket': {
        if (!t || G.dist(u, t) > (u.def.range || 1) + 2) return false;   // nothing in range: the move isn't spent
        u.boost = { k, until: G.time + 0.6 };
        if (k === 'rocket') { G.later = G.later || []; G.later.push({ at: G.time + 1, x: t.x, y: t.y, owner: u.owner, dmg: (u.def.atk || 4) * 2.5, r: 1.6, from: u }); fx(t.x, t.y, '#ffb347'); }
        else { G.fire(u, t); if (k === 'axestorm') G.fire(u, t); }
        u.cool = u.def.rate;
        return true;
      }
      case 'greekfire': {
        const dx = t ? t.x - u.x : Math.cos(u.face || 0), dy = t ? t.y - u.y : Math.sin(u.face || 0), l = Math.hypot(dx, dy) || 1;
        for (let i = 1; i <= 4; i++) G.fires.push({ x: u.x + dx / l * i * 0.9, y: u.y + dy / l * i * 0.9, owner: u.owner, until: G.time + 6 });
        if (t) G.cmdAttack([u], t);
        return true;
      }
    }
    return false;
  }

  // ---------- hooks used by the core ----------
  // movement speed multiplier
  G.speedMul = u => {
    if (u.stun > G.time) return 0;
    let m = 1;
    if (u.brace > G.time) return 0;
    if (u.charge > G.time) m *= 1.8; else if (u.tired > G.time) m *= 0.8;
    if (u.rush > G.time) m *= 1.6;
    return m;
  };
  // damage modifiers: Specials, Combined Arms, Brace
  G.dmgMod = function (att, t, dmg) {
    if (att.kind !== 'unit') return dmg;
    if (att.boost && att.boost.until > G.time) {
      const k = att.boost.k;
      dmg *= k === 'axestorm' ? 1.2 : 1.5;
      if (k === 'axestorm' && t.kind === 'unit') t.stun = G.time + 1.5;
      if (k === 'firearrows' && t.kind === 'building') t.burn = { until: G.time + 10, owner: att.owner };
      if (k === 'volley' || k === 'firearrows') splash(att, t, dmg * 0.4);
    }
    if (att.chargeHit && att.charge > G.time) {
      dmg *= 2; att.chargeHit = false;
      if (t.kind === 'unit' && !t.def.siege) { const dx = t.x - att.x, dy = t.y - att.y, l = Math.hypot(dx, dy) || 1, nx = t.x + dx / l * 0.8, ny = t.y + dy / l * 0.8; if (G.isFree(nx | 0, ny | 0)) { t.x = nx; t.y = ny; t.path = []; } }
    }
    if (att.combo) dmg *= 1.1;
    if (t.brace > G.time) {
      dmg = Math.max(1, dmg - 4);
      if (att.def.cls === 'cav' && !att.def.ranged) { att.hp -= 6; att.hitT = 0.2; if (att.hp <= 0) G.kill(att); }
    }
    return Math.max(1, Math.round(dmg));
  };
  function splash(att, t, d) {
    for (const e of G.ents) if (!e.dead && e !== t && e.kind === 'unit' && G.enemies(e.owner, att.owner) && Math.hypot(e.x - t.x, e.y - t.y) < 1.1) { e.hp -= Math.max(1, Math.round(d)); e.hitT = 0.2; if (e.hp <= 0) G.kill(e); }
  }

  // ---------- per-step: fire zones, burning buildings, delayed rockets, Combined Arms ----------
  let comboT = 0;
  G.specialsStep = function (dt) {
    if (G.fires.length) {
      G.fires = G.fires.filter(f => f.until > G.time);
      for (const f of G.fires) for (const e of G.ents) if (!e.dead && e.kind === 'unit' && G.enemies(e.owner, f.owner) && Math.abs(e.x - f.x) < 0.7 && Math.abs(e.y - f.y) < 0.7) { e.hp -= 6 * dt; if (e.hp <= 0) G.kill(e); }
    }
    for (const b of G.ents) if (b.burn && !b.dead) { if (b.burn.until < G.time) b.burn = null; else { b.hp -= 5 * dt; if (b.hp <= (G.hpFloor && G.hpFloor(b) || 0)) { if (G.hpFloor && G.hpFloor(b)) b.hp = G.hpFloor(b); else G.kill(b); } } }
    if (G.later && G.later.length) {
      const due = G.later.filter(l => l.at <= G.time); G.later = G.later.filter(l => l.at > G.time);
      for (const l of due) {
        fx(l.x, l.y, '#ff8a3a');
        for (const e of G.ents) if (!e.dead && (e.kind === 'unit' || e.kind === 'building') && G.enemies(e.owner, l.owner) && Math.hypot(e.x - l.x, e.y - l.y) < l.r + (e.size || 0) / 2) {
          const floor = G.hpFloor && G.hpFloor(e); e.hp -= e.kind === 'building' ? l.dmg * 0.3 : l.dmg; e.hitT = 0.2;
          if (floor != null && e.hp < floor) e.hp = floor; else if (e.hp <= 0) G.kill(e);
        }
      }
    }
    // Combined Arms: a soldier with melee, archers and cavalry of its own side within 7 tiles
    comboT -= dt; if (comboT > 0) return; comboT = 1;
    const sol = G.ents.filter(e => !e.dead && e.kind === 'unit' && e.type !== 'villager' && !e.def.siege && e.def.cls !== 'hero');
    for (const u of sol) {
      let inf = false, arc = false, cav = false;
      for (const o of sol) {
        if (o.owner !== u.owner || Math.abs(o.x - u.x) > 7 || Math.abs(o.y - u.y) > 7) continue;
        if (o.def.ranged) arc = true; else if (o.def.cls === 'cav') cav = true; else inf = true;
        if (inf && arc && cav) break;
      }
      u.combo = inf && arc && cav;
    }
  };

  // the computer uses Specials too: when its soldiers are fighting, now and then
  G.aiSpecials = function (p) {
    const army = G.ents.filter(u => !u.dead && u.owner === p && u.kind === 'unit' && u.task.t === 'attack' && G.specialReady(u) && G.specialOf(u));
    const fighting = army.filter(u => { const t = G.byId.get(u.task.id); return t && !t.dead && G.dist(u, t) < (u.def.range || 1) + 3; });
    if (fighting.length >= 3) G.useSpecial(fighting);
  };
})();
