// HUD, command panel, touch/mouse input, menus.
(function () {
  const $ = id => document.getElementById(id);
  const UI = G.ui = {};
  const ICON = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
  const TASK_TXT = { idle: 'Idle', move: 'Moving', attack: 'Attacking', build: 'Building', farm: 'Farming', return: 'Delivering' };
  G.selection = [];
  let mode = null; // null | 'place' | 'rally' | 'box'
  let chosenCiv = 'britons', difficulty = 'normal';
  let panelKey = '', toastT = 0, idleIdx = 0, mmT = 0, lastAlertT = -99;

  // ---------- Start screen ----------
  const civBox = $('civs');
  for (const k in G.CIVS) {
    const c = G.CIVS[k];
    const b = document.createElement('button');
    b.className = 'civ' + (k === chosenCiv ? ' on' : '');
    b.innerHTML = `<b>${c.name}</b><small>${c.desc}</small>`;
    b.onclick = () => { chosenCiv = k; [...civBox.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); };
    civBox.appendChild(b);
  }
  $('diff').onclick = e => { const d = e.target.dataset.d; if (!d) return; difficulty = d; [...$('diff').children].forEach(x => x.classList.toggle('on', x === e.target)); };
  function startGame() {
    const others = Object.keys(G.CIVS).filter(k => k !== chosenCiv);
    G.ai.level = difficulty;
    G.newGame(chosenCiv, others[Math.floor(Math.random() * others.length)]);
    G.buildGround();
    $('start').classList.add('hidden'); $('over').classList.add('hidden'); $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.paused = false;
    UI.alert(`You are the ${G.CIVS[chosenCiv].name}. Enemy: ${G.CIVS[G.players[2].civ].name}`);
  }
  $('btn-start').onclick = startGame;
  $('btn-again').onclick = () => { $('over').classList.add('hidden'); $('start').classList.remove('hidden'); $('hud').classList.add('hidden'); };
  $('btn-menu').onclick = () => { G.paused = true; $('menu').classList.remove('hidden'); };
  $('btn-resume').onclick = () => { G.paused = false; $('menu').classList.add('hidden'); };
  $('btn-restart').onclick = () => { $('menu').classList.add('hidden'); startGame(); };
  $('btn-quit').onclick = () => { $('menu').classList.add('hidden'); $('hud').classList.add('hidden'); $('start').classList.remove('hidden'); G.paused = true; };
  $('speed').onclick = e => { const s = e.target.dataset.s; if (!s) return; G.speed = +s; [...$('speed').children].forEach(x => x.classList.toggle('on', x === e.target)); };

  UI.reset = function () { G.selection = []; mode = null; G.ghost = null; panelKey = ''; $('place-bar').classList.add('hidden'); $('btn-box').classList.remove('on'); refreshPanel(true); };
  UI.alert = function (msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = 2.5; };
  UI.gameOver = function (res) {
    const p = G.players[1];
    $('over-title').textContent = res === 'victory' ? '👑 Victory!' : '💀 Defeat';
    const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
    $('over-stats').innerHTML = `Time: ${m}:${String(s).padStart(2, '0')}<br>Enemies defeated: ${p.killed}<br>Units & buildings lost: ${p.lost}<br>` +
      `Gathered: 🍖${p.gathered.food} 🪵${p.gathered.wood} 🪙${p.gathered.gold} 🪨${p.gathered.stone}`;
    setTimeout(() => $('over').classList.remove('hidden'), 900);
  };
  G.onHit = function (att, t) {
    if (t.owner === 1 && att.owner === 2 && G.time - lastAlertT > 12) {
      const s = G.toScreen(t.x, t.y);
      if (s.x < 0 || s.y < 0 || s.x > G.W || s.y > G.H) { lastAlertT = G.time; UI.alert(t.kind === 'building' ? `⚠️ Your ${t.def.name} is under attack!` : '⚠️ Your units are under attack!'); UI.lastAttack = { x: t.x, y: t.y }; }
    }
  };
  G.onDeposit = function (u, c) {
    if (u.owner === 1 && G.isVisible(u.x, u.y)) G.effects.push({ t: 'text', x: u.x, y: u.y, text: `+${Math.round(c.amt)} ${ICON[c.res]}`, col: '#fff', life: 1.2 });
  };
  UI.onKilled = function (e) { if (G.selection.includes(e)) { G.selection = G.selection.filter(x => x !== e); panelKey = ''; } };

  // ---------- Selection helpers ----------
  function select(list, add) {
    if (add) { for (const e of list) if (!G.selection.includes(e)) G.selection.push(e); }
    else G.selection = list.slice();
    // never mix own and others
    const own = G.selection.filter(e => e.owner === 1);
    if (own.length) G.selection = own;
    else G.selection = G.selection.slice(0, 1);
    // units take priority over buildings in multi-select
    if (G.selection.length > 1 && G.selection.some(e => e.kind === 'unit')) G.selection = G.selection.filter(e => e.kind === 'unit');
    if (G.selection.length > 1 && G.selection.every(e => e.kind === 'building')) G.selection = G.selection.filter(e => e.type === G.selection[0].type);
    panelKey = ''; refreshPanel(true);
  }
  const ownUnits = () => G.selection.filter(e => e.kind === 'unit' && e.owner === 1);

  function pick(sx, sy) {
    const z = G.camera.zoom;
    let best = null, bd = 1e9;
    for (const e of G.ents) {
      if (e.dead || e.kind !== 'unit') continue;
      if (e.owner !== 1 && !G.isVisible(e.x, e.y)) continue;
      const s = G.toScreen(e.x, e.y);
      const d = Math.hypot(s.x - sx, s.y - 12 * z - sy);
      const r = (e.type === 'knight' ? 22 : 18) * Math.max(z, 0.8);
      if (d < r && d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    // buildings / resources: check tile under finger, and tiles "behind" it for tall sprites
    for (const off of [0, 16, 32, 48, 64]) {
      const w = G.toWorld(sx, sy + off * z);
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if (!G.inMap(tx, ty)) continue;
      const id = G.block[G.idx(tx, ty)];
      let e = id ? G.byId.get(id) : null;
      if (!e) e = G.ents.find(f => f.type === 'farm' && !f.dead && tx >= f.tx && tx < f.tx + f.size && ty >= f.ty && ty < f.ty + f.size);
      if (e && (G.isExplored(tx, ty) || G.revealAll)) {
        if (off > 0 && e.kind === 'res' && e.type !== 'tree') continue;
        if (off > 0 && e.type === 'farm') continue;
        return e;
      }
    }
    return null;
  }

  function ping(x, y, col) { G.effects.push({ t: 'ping', x, y, col, life: 0.6 }); }

  // ---------- Tap logic ----------
  let lastTap = { t: 0, x: 0, y: 0, id: 0 };
  function tap(sx, sy, opts) {
    opts = opts || {};
    const w = G.toWorld(sx, sy);
    if (mode === 'place') { moveGhost(sx, sy); if (opts.mouse) { G.render(); confirmPlace(opts.add); } return; }
    const target = pick(sx, sy);
    if (mode === 'rally') {
      const b = G.selection[0];
      if (b && b.kind === 'building') { b.rally = { x: w.x, y: w.y, id: target && target.kind === 'res' ? target.id : 0 }; ping(w.x, w.y, '#fff'); }
      setMode(null); return;
    }
    const units = ownUnits();
    const now = performance.now();
    const dbl = now - lastTap.t < 350 && Math.hypot(sx - lastTap.x, sy - lastTap.y) < 30;
    lastTap = { t: now, x: sx, y: sy, id: target ? target.id : 0 };

    if (opts.command) { // right click
      if (units.length) { const r = G.cmdSmart(units, w.x, w.y, target); ping(w.x, w.y, r === 'attack' ? '#ff5a4a' : r === 'move' ? '#fff' : '#8f8'); }
      else if (G.selection[0] && G.selection[0].kind === 'building' && G.selection[0].owner === 1 && G.selection[0].def.trains) {
        G.selection[0].rally = { x: w.x, y: w.y, id: target && target.kind === 'res' ? target.id : 0 }; ping(w.x, w.y, '#fff');
      }
      return;
    }

    if (target && target.owner === 1) {
      // villagers + own foundation/farm/damaged building => work on it
      const vils = units.filter(u => u.type === 'villager');
      if (target.kind === 'building' && vils.length && !G.selection.includes(target) && (!target.built || target.hp < target.maxHp || target.type === 'farm')) {
        G.cmdSmart(vils, target.x, target.y, target); ping(target.x, target.y, '#8f8'); return;
      }
      if (dbl && target.kind === 'unit') { // select all of this type on screen
        const same = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === target.type && onScreen(e));
        select(same, false); return;
      }
      select([target], opts.add); return;
    }
    if (units.length) {
      const r = G.cmdSmart(units, w.x, w.y, target);
      ping(target ? target.x : w.x, target ? target.y : w.y, r === 'attack' ? '#ff5a4a' : r === 'move' ? '#fff' : '#8f8');
      return;
    }
    if (target) { select([target], false); return; }
    select([], false);
  }
  const onScreen = e => { const s = G.toScreen(e.x, e.y); return s.x > 0 && s.y > 0 && s.x < G.W && s.y < G.H; };

  function boxSelect(b) {
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const found = G.ents.filter(e => {
      if (e.dead || e.owner !== 1 || e.kind !== 'unit') return false;
      const s = G.toScreen(e.x, e.y); return s.x >= x0 && s.x <= x1 && s.y - 10 >= y0 - 10 && s.y - 10 <= y1;
    });
    if (found.length) select(found, false);
  }

  // ---------- Placement ----------
  function startPlace(type) {
    if (!G.canAfford(1, G.buildCost(1, type))) { UI.alert('Not enough resources'); flashCost(G.buildCost(1, type)); return; }
    setMode('place');
    const c = G.toWorld(G.W / 2, G.H * 0.45);
    const s = G.BUILDINGS[type].size;
    G.ghost = { type, tx: Math.floor(c.x - s / 2 + 0.5), ty: Math.floor(c.y - s / 2 + 0.5) };
    $('place-hint').textContent = `${G.BUILDINGS[type].name}: tap map to position`;
  }
  function moveGhost(sx, sy) {
    if (!G.ghost) return;
    const w = G.toWorld(sx, sy), s = G.BUILDINGS[G.ghost.type].size;
    G.ghost.tx = Math.floor(w.x - s / 2 + 0.5); G.ghost.ty = Math.floor(w.y - s / 2 + 0.5);
  }
  function confirmPlace(keep) {
    const gh = G.ghost; if (!gh) return;
    if (!gh.ok) { UI.alert("Can't build there"); return; }
    const b = G.placeBuilding(1, gh.type, gh.tx, gh.ty, ownUnits().filter(u => u.type === 'villager'));
    if (!b) { UI.alert('Not enough resources'); flashCost(G.buildCost(1, gh.type)); setMode(null); return; }
    ping(b.x, b.y, '#8f8');
    if (keep && G.canAfford(1, G.buildCost(1, gh.type))) return; // shift-place multiple
    setMode(null);
  }
  $('place-ok').onclick = () => confirmPlace(false);
  $('place-cancel').onclick = () => setMode(null);

  function setMode(m) {
    mode = m;
    if (m !== 'place') G.ghost = null;
    $('place-bar').classList.toggle('hidden', m !== 'place' && m !== 'rally');
    $('place-ok').classList.toggle('hidden', m === 'rally');
    if (m === 'rally') $('place-hint').textContent = 'Tap where new units should gather';
    $('btn-box').classList.toggle('on', m === 'box');
    $('panel').classList.toggle('hidden', m === 'place' || m === 'rally' || !G.selection.length);
    document.body.classList.toggle('has-panel', !$('panel').classList.contains('hidden'));
  }

  function flashCost(cost) { for (const k in cost) if (G.players[1].res[k] < cost[k]) { const el = $('r-' + k); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }

  // ---------- Side buttons ----------
  $('btn-idle').onclick = () => {
    const idle = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === 'villager' && e.task.t === 'idle');
    if (!idle.length) { UI.alert('No idle villagers'); return; }
    const v = idle[idleIdx++ % idle.length];
    select([v], false); G.camera.focus(v.x, v.y);
  };
  $('btn-army').onclick = () => {
    const a = G.ents.filter(e => !e.dead && e.owner === 1 && e.kind === 'unit' && e.type !== 'villager');
    if (!a.length) { UI.alert('No military units yet'); return; }
    select(a, false);
  };
  $('btn-box').onclick = () => setMode(mode === 'box' ? null : 'box');
  $('btn-home').onclick = () => {
    const tc = G.ents.find(e => !e.dead && e.owner === 1 && e.type === 'towncenter') || G.ents.find(e => !e.dead && e.owner === 1);
    if (tc) G.camera.focus(tc.x, tc.y);
  };

  // ---------- Command panel ----------
  function costTxt(c) { return Object.keys(c).map(k => ICON[k] + c[k]).join(' '); }
  function btn(ic, lb, cs, fn, poor) {
    const b = document.createElement('button');
    b.className = 'cmd' + (poor ? ' poor' : '');
    b.innerHTML = `<span class="ic">${ic}</span><span class="lb">${lb}</span>${cs ? `<span class="cs">${cs}</span>` : ''}`;
    b.onclick = e => { e.stopPropagation(); fn(); };
    return b;
  }
  let buildMenu = false;
  function refreshPanel(force) {
    const sel = G.selection.filter(e => !e.dead);
    if (sel.length !== G.selection.length) G.selection = sel;
    const panel = $('panel');
    if (!sel.length || mode === 'place' || mode === 'rally') { panel.classList.add('hidden'); document.body.classList.remove('has-panel'); buildMenu = false; return; }
    panel.classList.remove('hidden'); document.body.classList.add('has-panel');
    document.body.style.setProperty('--panel-h', panel.offsetHeight + 'px');
    const e = sel[0], own = e.owner === 1;
    // info
    if (sel.length > 1) {
      const counts = {}; sel.forEach(u => counts[u.type] = (counts[u.type] || 0) + 1);
      $('sel-icon').textContent = e.def.icon || '⚔️';
      $('sel-name').textContent = `${sel.length} selected`;
      $('sel-sub').textContent = Object.keys(counts).map(k => `${counts[k]} ${(G.UNITS[k] || G.BUILDINGS[k]).name}`).join(', ');
      const hp = sel.reduce((a, u) => a + u.hp, 0) / sel.reduce((a, u) => a + u.maxHp, 0);
      $('sel-hp').firstChild.style.width = (hp * 100) + '%';
      $('sel-hp').style.display = '';
    } else if (e.kind === 'res') {
      $('sel-icon').textContent = { tree: '🌲', berry: '🫐', gold: '🪙', stone: '🪨' }[e.type];
      $('sel-name').textContent = e.def.name;
      $('sel-sub').textContent = `${Math.ceil(e.amount)} ${e.rtype} left`;
      $('sel-hp').style.display = 'none';
    } else {
      $('sel-icon').textContent = e.def.icon || '?';
      const civ = G.CIVS[G.players[e.owner].civ].name;
      $('sel-name').textContent = e.def.name + (own ? '' : ` (${civ})`);
      let sub = `HP ${Math.ceil(e.hp)}/${e.maxHp}`;
      if (e.kind === 'unit') {
        sub += ` · ⚔${e.def.atk} 🛡${e.def.armor}/${e.def.pierce}`;
        if (e.def.ranged) sub += ` · 🎯${e.range}`;
        let job = TASK_TXT[e.task.t] || '';
        if (e.task.t === 'gather') job = { tree: 'Chopping wood', berry: 'Foraging', gold: 'Mining gold', stone: 'Mining stone' }[e.task.rtype];
        if (job) sub += ` · ${job}`;
        if (e.carry && e.carry.amt >= 1) sub += ` · carrying ${Math.floor(e.carry.amt)} ${ICON[e.carry.res]}`;
      } else if (!e.built) sub = `Under construction ${Math.floor(e.progress * 100)}%`;
      else if (e.type === 'farm') sub += ` · ${Math.ceil(e.food)} food left`;
      else if (e.def.pop) { const pc = G.popOf(e.owner); sub += ` · +${e.type === 'house' && G.CIVS[G.players[e.owner].civ].mods.housePop || e.def.pop} pop`; }
      $('sel-sub').textContent = sub;
      $('sel-hp').style.display = '';
      $('sel-hp').firstChild.style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
      $('sel-hp').firstChild.style.background = own ? '' : 'var(--bad)';
    }
    // queue
    const q = $('queue');
    if (own && sel.length === 1 && e.kind === 'building' && e.queue) {
      const key = e.queue.map(x => x.type).join(',');
      if (q.dataset.k !== key + e.id) {
        q.dataset.k = key + e.id; q.innerHTML = '';
        e.queue.forEach((it, i) => {
          const d = document.createElement('button'); d.className = 'qitem'; d.innerHTML = G.UNITS[it.type].icon + (i === 0 ? '<span class="prog"></span>' : '');
          d.onclick = () => { G.cancelTrain(e, i); panelKey = ''; };
          q.appendChild(d);
        });
      }
      const p = q.querySelector('.prog'); if (p && e.queue[0]) p.style.width = (e.qt / G.UNITS[e.queue[0].type].time * 100) + '%';
    } else if (q.innerHTML) { q.innerHTML = ''; q.dataset.k = ''; }

    // commands (rebuilt only when something relevant changes)
    const R = G.players[1].res;
    const key = sel.map(x => x.id).join(',') + '|' + buildMenu + '|' + (e.built ? 1 : 0) + '|' + Math.floor(R.food / 25) + Math.floor(R.wood / 25) + Math.floor(R.gold / 25) + Math.floor(R.stone / 25);
    if (!force && key === panelKey) return;
    panelKey = key;
    const cmds = $('cmds'); cmds.innerHTML = '';
    if (!own) return;
    const units = sel.filter(x => x.kind === 'unit');
    if (units.length) {
      const vils = units.filter(u => u.type === 'villager');
      if (vils.length && buildMenu) {
        for (const t of G.VIL_BUILDS) {
          const c = G.buildCost(1, t);
          cmds.appendChild(btn(G.BUILDINGS[t].icon, G.BUILDINGS[t].name, costTxt(c), () => { buildMenu = false; startPlace(t); }, !G.canAfford(1, c)));
        }
        cmds.appendChild(btn('↩', 'Back', '', () => { buildMenu = false; panelKey = ''; refreshPanel(true); }));
        return;
      }
      if (vils.length) cmds.appendChild(btn('🔨', 'Build', '', () => { buildMenu = true; panelKey = ''; refreshPanel(true); }));
      cmds.appendChild(btn('✋', 'Stop', '', () => { for (const u of units) { u.task = { t: 'idle' }; u.path = []; } }));
      if (vils.length && vils.some(v => v.carry)) cmds.appendChild(btn('📦', 'Drop off', '', () => {
        for (const v of vils) if (v.carry) { const b = G.nearest(v, x => x.kind === 'building' && x.owner === 1 && x.built && x.def.drop && x.def.drop.includes(v.carry.res)); if (b) G.cmdDeposit([v], b); }
      }));
      if (units.length > 1) cmds.appendChild(btn('⛺', 'Keep only', vils.length && vils.length < units.length ? 'soldiers' : '', () => {
        const mil = units.filter(u => u.type !== 'villager'); select(mil.length && mil.length < units.length ? mil : [units[0]], false);
      }));
      return;
    }
    if (e.kind === 'building' && e.built && e.def.trains) {
      for (const t of e.def.trains) {
        const c = G.unitCost(1, t);
        cmds.appendChild(btn(G.UNITS[t].icon, G.UNITS[t].name, costTxt(c), () => {
          for (const b of sel) {
            const r = G.train(b, t);
            if (r === 'pop') { UI.alert('Need more houses!'); break; }
            if (r === 'res') { UI.alert('Not enough resources'); flashCost(c); break; }
          }
          panelKey = '';
        }, !G.canAfford(1, c)));
      }
      cmds.appendChild(btn('🚩', 'Rally point', '', () => setMode('rally')));
    }
    if (e.kind === 'building' && e.owner === 1) {
      const del = btn('🗑️', 'Delete', '', () => {
        if (del.dataset.armed) { G.kill(e); G.onKilled(e); return; }
        del.dataset.armed = '1'; del.querySelector('.lb').textContent = 'Tap again'; del.style.borderColor = 'var(--bad)';
        setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.querySelector('.lb').textContent = 'Delete'; del.style.borderColor = ''; } }, 2500);
      });
      cmds.appendChild(del);
    }
  }

  // ---------- Per-frame UI update ----------
  let uiT = 0;
  UI.update = function (dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (!G.players || $('hud').classList.contains('hidden')) return;
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.15;
      const R = G.players[1].res;
      for (const k of ['food', 'wood', 'gold', 'stone']) $('r-' + k).lastChild.textContent = Math.floor(R[k]);
      const pc = G.popOf(1);
      $('r-pop').lastChild.textContent = `${pc.pop}/${pc.cap}`;
      $('r-pop').style.color = pc.pop >= pc.cap ? '#ff8a7a' : '';
      const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
      $('clock').textContent = `${m}:${String(s).padStart(2, '0')}`;
      const idle = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === 'villager' && e.task.t === 'idle').length;
      const ic = $('idle-count'); ic.textContent = idle || ''; ic.classList.toggle('zero', !idle);
      refreshPanel(false);
    }
    mmT -= dt;
    if (mmT <= 0) { mmT = 0.4; G.drawMinimap($('minimap')); }
    // keyboard panning
    const sp = 700 / G.camera.zoom * dt;
    if (keys.has('a') || keys.has('arrowleft')) G.camera.x -= sp;
    if (keys.has('d') || keys.has('arrowright')) G.camera.x += sp;
    if (keys.has('w') || keys.has('arrowup')) G.camera.y -= sp;
    if (keys.has('s') || keys.has('arrowdown')) G.camera.y += sp;
  };

  // ---------- Input ----------
  const cv = G.canvas;
  const pts = new Map();
  let gesture = null; // {type:'pan'|'pinch'|'box'|'pending', ...}
  let holdTimer = null;
  const keys = new Set();

  function clearHold() { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } }

  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (e.pointerType === 'mouse') {
      if (e.button === 1) gesture = { type: 'pan', lx: e.clientX, ly: e.clientY, moved: true };
      else if (e.button === 2) gesture = { type: 'rclick', x: e.clientX, y: e.clientY };
      else gesture = { type: 'pending', x: e.clientX, y: e.clientY, mouse: true, shift: e.shiftKey };
      return;
    }
    if (pts.size === 1) {
      gesture = { type: 'pending', x: e.clientX, y: e.clientY, t: performance.now() };
      if (mode === 'box') { gesture = { type: 'box' }; G.boxSel = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; return; }
      clearHold();
      holdTimer = setTimeout(() => {
        if (gesture && gesture.type === 'pending' && mode !== 'place') {
          gesture = { type: 'box' }; G.boxSel = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
          if (navigator.vibrate) navigator.vibrate(15);
        }
      }, 420);
    } else if (pts.size === 2) {
      clearHold(); G.boxSel = null;
      const [a, b] = [...pts.values()];
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: G.camera.zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (e.pointerType === 'mouse' && mode === 'place' && G.ghost) moveGhost(e.clientX, e.clientY);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!gesture) return;
    if (gesture.type === 'pending') {
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > 9) {
        clearHold();
        if (gesture.mouse && mode !== 'place') { G.boxSel = { x0: p.sx, y0: p.sy, x1: e.clientX, y1: e.clientY }; gesture = { type: 'box' }; }
        else gesture = { type: 'pan', samples: [] };
      }
    }
    if (gesture.type === 'pan') {
      G.camera.x -= dx / G.camera.zoom; G.camera.y -= dy / G.camera.zoom;
      G.camera.vx = 0; G.camera.vy = 0;
      if (gesture.samples) { gesture.samples.push({ dx, dy, t: performance.now() }); if (gesture.samples.length > 5) gesture.samples.shift(); }
    } else if (gesture.type === 'box') {
      G.boxSel.x1 = e.clientX; G.boxSel.y1 = e.clientY;
    } else if (gesture.type === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const before = G.toWorld(gesture.mx, gesture.my);
      G.camera.zoom = Math.max(0.45, Math.min(2.2, gesture.z * d / gesture.d));
      // keep pinch midpoint anchored, and pan with midpoint movement
      const after = G.toWorld(gesture.mx, gesture.my);
      const pb = G.iso(before.x, before.y), pa = G.iso(after.x, after.y);
      G.camera.x += pb.x - pa.x; G.camera.y += pb.y - pa.y;
      G.camera.x -= (mx - gesture.mx) / G.camera.zoom; G.camera.y -= (my - gesture.my) / G.camera.zoom;
      gesture.mx = mx; gesture.my = my;
    }
  });
  function up(e) {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    clearHold();
    if (!gesture) return;
    if (gesture.type === 'rclick') { tap(e.clientX, e.clientY, { command: true }); gesture = null; return; }
    if (gesture.type === 'pending') tap(e.clientX, e.clientY, { add: gesture.shift, mouse: gesture.mouse });
    else if (gesture.type === 'box') { if (G.boxSel) boxSelect(G.boxSel); G.boxSel = null; if (mode === 'box') setMode(null); }
    else if (gesture.type === 'pan' && gesture.samples && gesture.samples.length) {
      const s = gesture.samples, last = s[s.length - 1];
      if (performance.now() - last.t < 60) {
        const vx = s.reduce((a, b) => a + b.dx, 0) / s.length, vy = s.reduce((a, b) => a + b.dy, 0) / s.length;
        G.camera.vx = -vx * 60 / G.camera.zoom; G.camera.vy = -vy * 60 / G.camera.zoom;
      }
    }
    if (gesture.type === 'pinch' && pts.size === 1) { gesture = { type: 'pan' }; return; } // continue panning with remaining finger
    if (!pts.size) gesture = null;
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); clearHold(); G.boxSel = null; gesture = null; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const before = G.toWorld(e.clientX, e.clientY);
    G.camera.zoom = Math.max(0.45, Math.min(2.2, G.camera.zoom * Math.pow(0.999, e.deltaY)));
    const after = G.toWorld(e.clientX, e.clientY);
    const pb = G.iso(before.x, before.y), pa = G.iso(after.x, after.y);
    G.camera.x += pb.x - pa.x; G.camera.y += pb.y - pa.y;
  }, { passive: false });

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === 'escape') { if (mode) setMode(null); else select([], false); }
    if (k === 'h') $('btn-home').click();
    if (k === '.') $('btn-idle').click();
    if (k === ' ' && UI.lastAttack) { G.camera.focus(UI.lastAttack.x, UI.lastAttack.y); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());

  // minimap: tap/drag to move camera
  const mm = $('minimap');
  let mmDown = false;
  const mmGo = e => { const r = mm.getBoundingClientRect(); const w = G.minimapToWorld(mm, e.clientX - r.left, e.clientY - r.top); G.camera.focus(w.x, w.y); };
  mm.addEventListener('pointerdown', e => { mmDown = true; mm.setPointerCapture(e.pointerId); mmGo(e); });
  mm.addEventListener('pointermove', e => { if (mmDown) mmGo(e); });
  mm.addEventListener('pointerup', () => { mmDown = false; });

  // pause when the app is hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden && !$('hud').classList.contains('hidden') && !G.over) { G.paused = true; $('menu').classList.remove('hidden'); } });

  // boot: show a living map behind the start screen
  G.paused = true;
  G.newGame('britons', 'franks', 7);
  G.buildGround();
  G.revealAll = false;
  G.start();
  // expose for testing
  UI._tap = tap; UI._startGame = startGame; UI._select = select; UI._startPlace = startPlace; UI._confirmPlace = confirmPlace; UI._moveGhost = moveGhost;
})();
