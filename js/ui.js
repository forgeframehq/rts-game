// HUD, command panel, touch/mouse input, menus.
(function () {
  const $ = id => document.getElementById(id);
  const UI = G.ui = {};
  const ICON = { food: '🍖', wood: '🪵', gold: '🪙', stone: '🪨' };
  const TASK_TXT = { idle: 'Idle', move: 'Moving', attack: 'Attacking', build: 'Building', farm: 'Farming', return: 'Delivering', garrison: 'Taking shelter' };
  G.selection = [];
  let mode = null; // null | 'place' | 'rally' | 'box'
  let panelKey = '', toastT = 0, idleIdx = 0, mmT = 0, lastAlertT = -99, saveT = 20;

  // ---------- Preferences ----------
  const PREF_KEY = 'dod.prefs.v1';
  const prefs = { speed: '1', gfx: 'high', hp: 'damaged', orient: 'auto', setup: null, quickAI: 'normal' };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  // Screen orientation: the game plays in both. Locking works where the browser allows it
  // (Android in full screen or as an installed app); elsewhere the phone's own rotation decides.
  function lockOrientation() {
    const o = screen.orientation;
    if (!o) return;
    if (prefs.orient === 'auto') { try { o.unlock(); } catch (e) { /* not supported */ } return; }
    const go = () => o.lock(prefs.orient).catch(() => { /* needs full screen or unsupported */ });
    if (!document.fullscreenElement && document.documentElement.requestFullscreen && G.inGame)
      document.documentElement.requestFullscreen().then(go).catch(go);
    else go();
  }
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
  function applyPrefs() {
    G.speed = +prefs.speed || 1;
    G.gfxLow = prefs.gfx === 'low';
    G.hpAlways = prefs.hp === 'always';
    lockOrientation();
    G.resize();
    [...$('speed').children].forEach(x => x.classList.toggle('on', +x.dataset.s === G.speed));
    document.querySelectorAll('[data-pref]').forEach(seg => [...seg.children].forEach(x => x.classList.toggle('on', x.dataset.v === String(prefs[seg.dataset.pref]))));
  }
  document.querySelectorAll('[data-pref]').forEach(seg => seg.addEventListener('click', e => {
    const v = e.target.closest('button') && e.target.closest('button').dataset.v; if (!v) return;
    prefs[seg.dataset.pref] = v; savePrefs(); applyPrefs();
  }));

  // ---------- Screens ----------
  const SCREENS = ['start', 'quick', 'skirmish', 'dynasties', 'options', 'help', 'menu', 'over'];
  function show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (id === 'start') refreshContinue();
  }
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('start'));
  function enterGame() {
    for (const s of SCREENS) $(s).classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.paused = false; G.demo = false; saveT = 20;
    G.inGame = true; if (prefs.orient !== 'auto') lockOrientation();
  }
  function toMenu() {
    if (!G.over) G.saveGame();
    G.paused = true; G.demo = true; G.inGame = false;
    $('hud').classList.add('hidden');
    show('start');
  }
  function refreshContinue() {
    const s = G.hasSave();
    $('m-continue').classList.toggle('hidden', !s);
    $('m-skirmish').classList.toggle('primary', !s);
    if (s) {
      const m = Math.floor(s.time / 60);
      $('m-continue-sub').textContent = `${G.CIVS[s.civ] ? G.CIVS[s.civ].name : ''} · ${m} min played`;
    }
  }
  $('m-continue').onclick = () => {
    if (G.loadGame()) { G.buildGround(); enterGame(); UI.alert('Game resumed'); }
    else { UI.alert('Saved game could not be loaded'); refreshContinue(); }
  };
  $('m-skirmish').onclick = () => { renderSlots(); show('skirmish'); };
  $('m-dynasties').onclick = () => { showDyn(dynSel); show('dynasties'); };
  $('m-learn').onclick = () => show('help');
  $('m-options').onclick = () => show('options');
  const delBtn = $('btn-delsave');
  delBtn.onclick = () => {
    if (!G.hasSave()) { delBtn.textContent = 'No saved game'; setTimeout(() => delBtn.textContent = 'Delete saved game', 1500); return; }
    if (delBtn.dataset.armed) { G.clearSave(); delete delBtn.dataset.armed; delBtn.textContent = 'Deleted'; setTimeout(() => delBtn.textContent = 'Delete saved game', 1500); return; }
    delBtn.dataset.armed = '1'; delBtn.textContent = 'Tap again to delete';
    setTimeout(() => { if (delBtn.dataset.armed) { delete delBtn.dataset.armed; delBtn.textContent = 'Delete saved game'; } }, 2500);
  };

  // ---------- Skirmish setup ----------
  const civOpts = () => `<option value="random">Random</option>` + Object.keys(G.CIVS).map(k => `<option value="${k}">${G.CIVS[k].name}</option>`).join('');
  const setup = prefs.setup || {
    slots: [
      { type: 'human', civ: 'britons', team: 0 },
      { type: 'ai', civ: 'random', team: 0, ai: 'normal' },
      { type: 'closed', civ: 'random', team: 0, ai: 'normal' },
      { type: 'closed', civ: 'random', team: 0, ai: 'normal' }
    ],
    size: 'medium', res: 'standard', pop: '200', reveal: 'normal', shape: 'rect', mode: 'conquest'
  };
  if (!setup.shape) setup.shape = 'rect';
  if (!setup.mode) setup.mode = 'conquest';   // saved setups from before Regicide existed
  function renderSlots() {
    const box = $('slots'); box.innerHTML = '';
    setup.slots.forEach((sl, i) => {
      const row = document.createElement('div');
      row.className = 'slot' + (sl.type === 'closed' ? ' closed' : '');
      const who = i === 0 ? `<span class="who">You</span>`
        : `<select data-k="type" aria-label="Player ${i + 1}">${i === 1 ? '' : '<option value="closed">Closed</option>'}<option value="ai">Computer</option></select>`;
      row.innerHTML = `<i class="dot" style="background:${G.PLAYER_COLORS[i + 1]}"></i>${who}` + (sl.type === 'closed' ? '' :
        `<img class="mini-crest" src="assets/ui/crest_${sl.civ === 'random' ? 'britons' : sl.civ}.png" alt="" ${sl.civ === 'random' ? 'style="filter:grayscale(1) brightness(.6)"' : ''}>` +
        `<select data-k="civ" aria-label="Dynasty">${civOpts()}</select>` +
        `<select data-k="team" aria-label="Team"><option value="0">No team</option><option value="1">Team 1</option><option value="2">Team 2</option><option value="3">Team 3</option><option value="4">Team 4</option></select>` +
        (sl.type === 'ai' ? `<select data-k="ai" aria-label="Difficulty"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select>` : ''));
      row.querySelectorAll('select').forEach(sel => {
        sel.value = String(sl[sel.dataset.k]);
        sel.onchange = () => { sl[sel.dataset.k] = sel.dataset.k === 'team' ? +sel.value : sel.value; renderSlots(); };
      });
      box.appendChild(row);
    });
    document.querySelectorAll('[data-opt]').forEach(seg => [...seg.children].forEach(x => x.classList.toggle('on', x.dataset.v === String(setup[seg.dataset.opt]))));
    validate();
  }
  function validate() {
    const act = setup.slots.map((s, i) => ({ ...s, id: i + 1 })).filter(s => s.type !== 'closed');
    const me = act[0];
    const foes = act.filter(s => s.id !== 1 && !(me.team > 0 && s.team === me.team));
    const ok = foes.length > 0;
    $('btn-start').disabled = !ok;
    const big = act.length > 2 && setup.size === 'small';
    $('rule-hint').textContent = !ok ? 'Everyone is on your team. Put at least one computer player on another team.'
      : big ? 'Tip: Medium or Large maps give 3–4 players more room.' : `${act.length} players · ${foes.length} ${foes.length === 1 ? 'enemy' : 'enemies'}`;
  }
  document.querySelectorAll('[data-opt]').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setup[seg.dataset.opt] = b.dataset.v; renderSlots();
  }));
  let lastConfig = null;
  function startSkirmish(cfg) {
    lastConfig = cfg;
    const used = new Set();
    const players = cfg.slots.filter(s => s.type !== 'closed').map(s => {
      let civ = s.civ;
      if (civ === 'random') { const pool = Object.keys(G.CIVS).filter(k => !used.has(k)); civ = pool[Math.floor(Math.random() * pool.length)] || 'britons'; }
      used.add(civ);
      return { civ, team: s.team || 0, ai: s.type === 'ai' ? s.ai : null };
    });
    G.clearSave();
    G.newGame({ players, size: cfg.size, res: cfg.res, pop: +cfg.pop, reveal: cfg.reveal, shape: cfg.shape || 'rect', mode: cfg.mode || 'conquest' });
    G.buildGround();
    enterGame();
    const foes = Object.keys(G.players).filter(id => G.enemies(1, +id)).map(id => G.CIVS[G.players[id].civ].name);
    UI.alert((G.rules.mode === 'regicide' ? '👑 Regicide: guard your King, kill theirs. ' : '')
      + `You lead the ${G.CIVS[G.players[1].civ].name}. Enemies: ${foes.join(', ')}`);
  }
  $('btn-start').onclick = () => { prefs.setup = setup; savePrefs(); startSkirmish(JSON.parse(JSON.stringify(setup))); };

  // Quick Match: pick a difficulty and go. One opponent, high resources, so you are
  // fighting within a couple of minutes instead of gathering for ten. Keeps your last civ.
  $('m-quick').onclick = () => {
    const lvl = prefs.quickAI || 'normal';
    document.querySelectorAll('#quick .qd').forEach(b => b.classList.toggle('primary', b.dataset.ai === lvl));
    show('quick');
  };
  document.querySelectorAll('#quick .qd').forEach(b => b.onclick = () => {
    prefs.quickAI = b.dataset.ai; savePrefs();
    startSkirmish({
      slots: [
        { type: 'human', civ: (prefs.setup && prefs.setup.slots[0].civ) || 'britons', team: 0 },
        { type: 'ai', civ: 'random', team: 0, ai: b.dataset.ai },
        { type: 'closed', civ: 'random', team: 0, ai: 'normal' },
        { type: 'closed', civ: 'random', team: 0, ai: 'normal' }
      ],
      size: 'medium', res: 'high', pop: '200', reveal: 'normal', shape: 'rect'
    });
  });

  // ---------- Dynasties ----------
  let dynSel = 'britons';
  const tabs = $('dyn-tabs');
  for (const k in G.CIVS) {
    const b = document.createElement('button');
    b.className = 'civ'; b.dataset.civ = k;
    b.innerHTML = `<img src="assets/ui/crest_${k}.png" alt=""><span>${G.CIVS[k].name}</span>`;
    b.onclick = () => showDyn(k);
    tabs.appendChild(b);
  }
  function showDyn(k) {
    dynSel = k; const c = G.CIVS[k];
    [...tabs.children].forEach(x => x.classList.toggle('on', x.dataset.civ === k));
    $('dyn-crest').src = `assets/ui/crest_${k}.png`;
    $('dyn-name').textContent = c.name;
    $('dyn-role').textContent = c.role + ' dynasty';
    $('dyn-history').textContent = c.history;
    $('dyn-bonuses').innerHTML = c.bonuses.map(x => `<li>${x}</li>`).join('');
    $('dyn-unique').textContent = c.unique ? c.unique.text : 'Arrives with the next update, alongside the Ages system.';
  }

  // ---------- Pause & game over ----------
  $('btn-again').onclick = () => { if (lastConfig) startSkirmish(lastConfig); else show('start'); };
  $('btn-over-menu').onclick = () => { $('hud').classList.add('hidden'); G.demo = true; show('start'); };
  $('btn-menu').onclick = () => { G.paused = true; G.saveGame(); $('menu').classList.remove('hidden'); };
  $('btn-resume').onclick = () => { G.paused = false; $('menu').classList.add('hidden'); };
  $('btn-restart').onclick = () => { $('menu').classList.add('hidden'); if (lastConfig) startSkirmish(lastConfig); else if (G.config) { G.clearSave(); G.newGame({ ...G.config, seed: 0 }); G.buildGround(); enterGame(); } };
  $('btn-quit').onclick = () => { $('menu').classList.add('hidden'); toMenu(); };
  $('speed').onclick = e => { const s = e.target.dataset.s; if (!s) return; prefs.speed = s; savePrefs(); applyPrefs(); };

  UI.reset = function () { G.selection = []; mode = null; G.ghost = null; panelKey = ''; $('place-bar').classList.add('hidden'); $('btn-box').classList.remove('on'); refreshPanel(true); };
  UI.alert = function (msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = 2.5; };
  UI.gameOver = function (res) {
    const p = G.players[1];
    $('over-title').textContent = res === 'victory' ? '👑 Victory!' : '💀 Defeat';
    const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
    $('over-stats').innerHTML = `Time: ${m}:${String(s).padStart(2, '0')}<br>Enemies defeated: ${p.killed}<br>Units & buildings lost: ${p.lost}<br>` +
      `Gathered: 🍖${p.gathered.food} 🪵${p.gathered.wood} 🪙${p.gathered.gold} 🪨${p.gathered.stone}`;
    G.clearSave();
    setTimeout(() => $('over').classList.remove('hidden'), 900);
  };
  G.onHit = function (att, t) {
    if (t.owner === 1 && G.enemies(att.owner, 1) && G.time - lastAlertT > 12) {
      const s = G.toScreen(t.x, t.y);
      if (s.x < 0 || s.y < 0 || s.x > G.W || s.y > G.H) { lastAlertT = G.time; UI.alert(t.kind === 'building' ? `⚠️ Your ${t.def.name} is under attack!` : '⚠️ Your units are under attack!'); UI.lastAttack = { x: t.x, y: t.y }; }
    }
  };
  G.onDeposit = function (u, c) {
    if (u.owner === 1 && G.isVisible(u.x, u.y)) G.effects.push({ t: 'text', x: u.x, y: u.y, text: `+${Math.round(c.amt)} ${ICON[c.res]}`, col: '#fff', life: 1.2 });
  };
  G.onResearched = function (p, name) { if (p === 1) { UI.alert(`⚒ ${name} researched!`); panelKey = ''; } };
  G.onAgeUp = function (p, to) {
    if (p === 1) UI.alert(`🎉 You reached the ${G.AGES[to].name}! ${G.AGES[to].bonus}`);
    else UI.alert(`${G.PLAYER_COLOR_NAMES[p] || 'Enemy'} (${G.CIVS[G.players[p].civ].name}) reached the ${G.AGES[to].name}`);
    panelKey = '';
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
      const r = (G.mounted(e) ? 22 : 18) * Math.max(z, 0.8);
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
  function outline(e, col) { if (e && !e.dead && e.kind !== 'unit') G.effects.push({ t: 'target', id: e.id, col, life: 0.9 }); }
  // Acknowledge an order: ping the ground and outline the tree/farm/building it landed on,
  // so a tap that did nothing is never silent.
  function cmdFx(r, x, y) {
    const t = G.cmdTarget;
    if (r === 'farm-busy') { UI.alert('Every farm is already being worked'); outline(t, '#f5c242'); return; }
    const col = r === 'attack' ? '#ff5a4a' : r === 'move' ? '#fff' : '#8f8';
    outline(t, col);
    const on = t && !t.dead && t.kind !== 'unit';
    ping(on ? t.x : x, on ? t.y : y, col);
    if (r === 'gather-moved') UI.alert('That farm is taken — sent to the nearest free one');
  }

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
      if (units.length) { const r = G.cmdSmart(units, w.x, w.y, target); cmdFx(r, w.x, w.y); }
      else if (G.selection[0] && G.selection[0].kind === 'building' && G.selection[0].owner === 1 && G.trainsFor(G.selection[0]).length) {
        G.selection[0].rally = { x: w.x, y: w.y, id: target && target.kind === 'res' ? target.id : 0 }; ping(w.x, w.y, '#fff');
      }
      return;
    }

    if (target && target.owner === 1) {
      // villagers + own foundation/farm/damaged building => work on it
      const vils = units.filter(u => u.type === 'villager');
      if (target.kind === 'building' && vils.length && !G.selection.includes(target) && (!target.built || target.hp < target.maxHp || target.type === 'farm')) {
        const r = G.cmdSmart(vils, target.x, target.y, target); cmdFx(r, target.x, target.y); return;
      }
      if (dbl && target.kind === 'unit') { // select all of this type on screen
        const same = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === target.type && onScreen(e));
        select(same, false); return;
      }
      select([target], opts.add); return;
    }
    if (units.length) {   // tap anywhere = command (move, gather, attack); use the Deselect button to clear
      const r = G.cmdSmart(units, w.x, w.y, target);
      cmdFx(r, w.x, w.y);
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
    $('place-hint').textContent = `${G.BUILDINGS[type].name}: tap the map to move it`;
  }
  function moveGhost(sx, sy) {
    if (!G.ghost) return;
    const w = G.toWorld(sx, sy), s = G.BUILDINGS[G.ghost.type].size;
    G.ghost.tx = Math.floor(w.x - s / 2 + 0.5); G.ghost.ty = Math.floor(w.y - s / 2 + 0.5);
  }
  function confirmPlace(keep) {
    const gh = G.ghost; if (!gh) return;
    if (!gh.ok) {   // nudge to the nearest open spot instead of just refusing
      const s = G.BUILDINGS[gh.type].size;
      const fits = (x, y) => G.areaFree(x, y, s) && G.isExplored(x + s / 2, y + s / 2);
      for (let r = 1; r <= 5; r++) {
        let best = null, bd = 1e9;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r || !fits(gh.tx + i, gh.ty + j)) continue;
          const d = i * i + j * j; if (d < bd) { bd = d; best = [i, j]; }
        }
        if (best) { gh.tx += best[0]; gh.ty += best[1]; gh.ok = true; UI.alert('Moved to the nearest open spot. Tap Build again'); return; }
      }
      UI.alert("No room here. Something is in the way (red tiles)"); return;
    }
    const b = G.placeBuilding(1, gh.type, gh.tx, gh.ty, ownUnits().filter(u => u.type === 'villager'));
    if (!b) { UI.alert('Not enough resources'); flashCost(G.buildCost(1, gh.type)); setMode(null); return; }
    ping(b.x, b.y, '#8f8');
    if (keep && G.canAfford(1, G.buildCost(1, gh.type))) return; // shift-place multiple
    setMode(null); select([], false);
  }
  $('place-ok').onclick = () => confirmPlace(false);
  $('place-cancel').onclick = () => setMode(null);

  function setMode(m) {
    mode = m;
    if (m !== 'place') G.ghost = null;
    $('place-bar').classList.toggle('hidden', m !== 'place' && m !== 'rally' && m !== 'move');
    $('place-ok').classList.toggle('hidden', m === 'rally' || m === 'move');
    if (m === 'move') $('place-hint').textContent = 'Tap where to move';
    if (m === 'rally') $('place-hint').textContent = 'Tap where new units should gather';
    $('btn-box').classList.toggle('on', m === 'box');
    $('panel').classList.toggle('hidden', m === 'place' || m === 'rally' || m === 'move' || !G.selection.length);
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
  // Army button: 1st tap selects every soldier and jumps to the biggest group;
  // more taps within a few seconds cycle through the other groups (soldiers within ~6 tiles of each other).
  let armyCycle = { t: -99, i: 0 };
  function armyGroups(a) {
    const left = a.slice(), groups = [];
    while (left.length) {
      const g = [left.pop()];
      for (let k = 0; k < g.length; k++) for (let j = left.length - 1; j >= 0; j--)
        if (Math.hypot(left[j].x - g[k].x, left[j].y - g[k].y) < 6) g.push(left.splice(j, 1)[0]);
      groups.push(g);
    }
    return groups.sort((p, q) => q.length - p.length);
  }
  const focusGroup = g => { let x = 0, y = 0; for (const u of g) { x += u.x; y += u.y; } G.camera.focus(x / g.length, y / g.length); };
  $('btn-army').onclick = () => {
    const a = G.ents.filter(e => !e.dead && e.owner === 1 && e.kind === 'unit' && e.type !== 'villager');
    if (!a.length) { UI.alert('No soldiers yet'); return; }
    const groups = armyGroups(a), now = performance.now();
    if (now - armyCycle.t > 4000) {
      armyCycle = { t: now, i: 0 };
      select(a, false); focusGroup(groups[0]);
      UI.alert(groups.length > 1 ? `${a.length} soldiers in ${groups.length} groups. Tap again for the next group` : `${a.length} soldiers`);
    } else {
      armyCycle.t = now; armyCycle.i = (armyCycle.i + 1) % groups.length;
      const g = groups[armyCycle.i]; select(g, false); focusGroup(g);
      UI.alert(`Group ${armyCycle.i + 1} of ${groups.length}: ${g.length} soldier${g.length > 1 ? 's' : ''}`);
    }
  };
  $('btn-box').onclick = () => setMode(mode === 'box' ? null : 'box');
  // minimap on/off (remembered)
  function applyMap() { document.body.classList.toggle('mm-off', !!prefs.mmOff); $('btn-map').classList.toggle('on', !prefs.mmOff); }
  $('btn-map').onclick = () => { prefs.mmOff = !prefs.mmOff; savePrefs(); applyMap(); };
  applyMap();
  $('btn-home').onclick = () => {
    const tc = G.ents.find(e => !e.dead && e.owner === 1 && e.type === 'towncenter') || G.ents.find(e => !e.dead && e.owner === 1);
    if (tc) G.camera.focus(tc.x, tc.y);
  };

  // ---------- Command panel ----------
  // ---- painted icons (assets/ui/icons) ----
  const ICONP = 'assets/ui/icons/';
  const ICONS = new Set('blacksmith castle ageup archer army attack axethrower barracks bell box build cataphract clock delete dropoff farm food garrison gear gold home house idle knight laurel longbowman lumbercamp menu militia mill miningcamp monastery monk pop rally ram range repeater scout siegeworkshop spearman stable stone stop tower towncenter trebuchet ungarrison villager villager_f wood'.split(' '));
  const EMOJI_ICON = { '🔨': 'build', '🛡️': 'garrison', '✋': 'stop', '📦': 'dropoff', '🚩': 'rally', '⬆️': 'ageup', '🔔': 'bell', '🚪': 'ungarrison', '🗑️': 'delete', '⛺': 'army', '⏹': 'stop', '↩': 'menu' };
  function iconHTML(ic) {
    if (ic && ic.startsWith('i:')) {
      const [n, lock] = ic.slice(2).split('|');
      if (ICONS.has(n)) return `<img class="ico${lock ? ' locked' : ''}" src="${ICONP}${n}.png" alt="" draggable="false">` + (lock ? '<span class="lock">🔒</span>' : '');
      return `<span class="glyph">${(G.UNITS[n] || G.BUILDINGS[n] || {}).icon || '?'}</span>`;
    }
    const n = EMOJI_ICON[ic];
    return n ? `<img class="ico" src="${ICONP}${n}.png" alt="" draggable="false">` : `<span class="glyph">${ic}</span>`;
  }
  G.iconHTML = iconHTML;
  function selIcon(e) {
    if (e.kind === 'res') return iconHTML('i:' + { tree: 'wood', berry: 'food', gold: 'gold', stone: 'stone' }[e.type]);
    return iconHTML('i:' + (e.type === 'villager' && e.sex === 'f' ? 'villager_f' : e.type));
  }
  function costTxt(c) { return Object.keys(c).map(k => `<img class="ci" src="${ICONP}${k}.png" alt="${k}">${c[k]}`).join(' '); }
  function btn(ic, lb, cs, fn, poor) {
    const b = document.createElement('button');
    b.className = 'cmd' + (poor ? ' poor' : '');
    b.innerHTML = `<span class="ic">${iconHTML(ic)}</span><span class="lb">${lb}</span>${cs ? `<span class="cs">${cs}</span>` : ''}`;
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
      $('sel-icon').innerHTML = selIcon(e);
      $('sel-name').textContent = `${sel.length} selected`;
      $('sel-sub').textContent = Object.keys(counts).map(k => `${counts[k]} ${(G.UNITS[k] || G.BUILDINGS[k]).name}`).join(', ');
      const hp = sel.reduce((a, u) => a + u.hp, 0) / sel.reduce((a, u) => a + u.maxHp, 0);
      $('sel-hp').firstChild.style.width = (hp * 100) + '%';
      $('sel-hp').style.display = '';
    } else if (e.kind === 'res') {
      $('sel-icon').innerHTML = selIcon(e);
      $('sel-name').textContent = e.def.name;
      $('sel-sub').textContent = `${Math.ceil(e.amount)} ${e.rtype} left`;
      $('sel-hp').style.display = 'none';
    } else {
      $('sel-icon').innerHTML = selIcon(e);
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
      else if (e.type === 'farm') sub += e.food > 0 ? ` · ${Math.ceil(e.food)} food left` : ' · Fallow — re-sow it';
      if (e.aging) sub += ` · ${G.AGES[e.aging.to].name} ${Math.floor(e.aging.t / G.AGES[e.aging.to].time * 100)}%`;
      if (e.research) { const rd = e.research.kind === 'up' ? G.UPGRADES[e.research.id] : G.TECHS[e.research.id]; sub += ` · ${rd.name} ${Math.floor(e.research.t / rd.time * 100)}%`; }
      if (e.garrison && e.garrison.length) sub += ` · ${e.garrison.length}/${e.def.garrison} inside`;
      if (e.def.pop) { const pc = G.popOf(e.owner); sub += ` · +${e.type === 'house' && G.CIVS[G.players[e.owner].civ].mods.housePop || e.def.pop} pop`; }
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
          const d = document.createElement('button'); d.className = 'qitem'; d.innerHTML = iconHTML('i:' + it.type) + (i === 0 ? '<span class="prog"></span>' : '');
          d.onclick = () => { G.cancelTrain(e, i); panelKey = ''; };
          q.appendChild(d);
        });
      }
      const p = q.querySelector('.prog'); if (p && e.queue[0]) p.style.width = (e.qt / G.UNITS[e.queue[0].type].time * 100) + '%';
    } else if (q.innerHTML) { q.innerHTML = ''; q.dataset.k = ''; }

    // commands (rebuilt only when something relevant changes)
    const R = G.players[1].res;
    const key = sel.map(x => x.id).join(',') + '|' + buildMenu + '|' + (e.built ? 1 : 0) + '|' + (e.garrison ? e.garrison.length : 0) + '|' + (e.aging ? 1 : 0) + G.ageOf(1) + (e.research ? e.research.id : '') + JSON.stringify(G.players[1].up || {}) + Object.keys(G.players[1].techs || {}).length + '|' + Math.floor(R.food / 25) + Math.floor(R.wood / 25) + Math.floor(R.gold / 25) + Math.floor(R.stone / 25);
    if (!force && key === panelKey) return;
    panelKey = key;
    const cmds = $('cmds'); cmds.innerHTML = '';
    cmds.appendChild(btn('✖', 'Deselect', '', () => { buildMenu = false; select([], false); }));
    if (!own) return;
    const units = sel.filter(x => x.kind === 'unit');
    if (units.length) {
      const vils = units.filter(u => u.type === 'villager');
      if (vils.length && buildMenu) {
        for (const t of G.VIL_BUILDS) {
          const c = G.buildCost(1, t);
          if (!G.canBuildType(1, t)) { cmds.appendChild(btn('i:' + t + '|lock', G.BUILDINGS[t].name, G.AGES[G.BUILD_AGE[t]].short + ' Age', () => UI.alert(`${G.BUILDINGS[t].name} needs the ${G.AGES[G.BUILD_AGE[t]].name}`), true)); continue; }
          cmds.appendChild(btn('i:' + t, G.BUILDINGS[t].name, costTxt(c), () => { buildMenu = false; startPlace(t); }, !G.canAfford(1, c)));
        }
        cmds.appendChild(btn('↩', 'Back', '', () => { buildMenu = false; panelKey = ''; refreshPanel(true); }));
        return;
      }
      if (vils.length) cmds.appendChild(btn('🔨', 'Build', '', () => { buildMenu = true; panelKey = ''; refreshPanel(true); }));
      // villagers shelter in a Town Center or Castle; soldiers only in a Castle
      const canHide = units.filter(u => G.ents.some(e => !e.dead && e.owner === 1 && G.canGarrison(u, e)));
      if (canHide.length) {
        const hasCastle = G.ents.some(e => !e.dead && e.owner === 1 && e.type === 'castle' && e.built);
        cmds.appendChild(btn('🛡️', 'Garrison', hasCastle && canHide.some(u => u.type !== 'villager') ? 'Castle' : 'Town Center', () => {
          let full = 0;
          for (const u of canHide) {
            const b = G.nearest(u, e => (e.type === 'castle' || e.type === 'towncenter') && G.canGarrison(u, e));
            if (b) G.garrisonTo(u, b); else full++;
          }
          if (full) UI.alert(hasCastle ? 'No room left inside' : 'No room in a Town Center');
        }));
      }
      cmds.appendChild(btn('✋', 'Stop', '', () => { for (const u of units) { u.task = { t: 'idle' }; u.path = []; } }));
      if (vils.length && vils.some(v => v.carry)) cmds.appendChild(btn('📦', 'Drop off', '', () => {
        for (const v of vils) if (v.carry) { const b = G.nearest(v, x => x.kind === 'building' && x.owner === 1 && x.built && x.def.drop && x.def.drop.includes(v.carry.res)); if (b) G.cmdDeposit([v], b); }
      }));
      if (units.length > 1) cmds.appendChild(btn('⛺', 'Keep only', vils.length && vils.length < units.length ? 'soldiers' : '', () => {
        const mil = units.filter(u => u.type !== 'villager'); select(mil.length && mil.length < units.length ? mil : [units[0]], false);
      }));
      return;
    }
    // a spent farm keeps its field — sow it again rather than building a new one
    const spent = sel.filter(x => G.farmSpent(x) && x.owner === 1);
    if (spent.length) {
      const rc = G.resowCost(1);
      cmds.appendChild(btn('i:farm', spent.length > 1 ? `Re-sow ${spent.length}` : 'Re-sow', costTxt(rc), () => {
        let done = 0;
        for (const f of spent) if (G.resowFarm(f, 1)) done++;
        if (!done) { UI.alert('Not enough wood to sow'); flashCost(rc); }
        panelKey = '';
      }, !G.canAfford(1, rc)));
    }
    if (e.kind === 'building' && e.built && G.trainsFor(e).length) {
      for (const t of G.trainsFor(e)) {
        const c = G.unitCost(1, t);
        if (!G.canTrainType(1, t)) { cmds.appendChild(btn('i:' + t + '|lock', G.UNITS[t].name, G.AGES[G.UNIT_AGE[t]].short + ' Age', () => UI.alert(`${G.UNITS[t].name} needs the ${G.AGES[G.UNIT_AGE[t]].name}`), true)); continue; }
        cmds.appendChild(btn('i:' + t, G.unitDef(1, t).name, costTxt(c), () => {
          for (const b of sel) {
            const r = G.train(b, t);
            if (r === 'pop') { UI.alert('Need more houses!'); break; }
            if (r === 'busy') { UI.alert(b.research ? 'Busy researching' : 'Town Center is advancing to the next Age'); break; }
            if (r === 'res') { UI.alert('Not enough resources'); flashCost(c); break; }
          }
          panelKey = '';
        }, !G.canAfford(1, c)));
      }
      cmds.appendChild(btn('🚩', 'Rally point', '', () => setMode('rally')));
      if (e.owner === 1 && e.built) {
        if (e.research) {
          const rd = e.research.kind === 'up' ? G.UPGRADES[e.research.id] : G.TECHS[e.research.id];
          cmds.appendChild(btn('⏹', 'Cancel', rd.name, () => { G.cancelResearch(e); panelKey = ''; }));
        } else for (const r of G.researchesFor(e)) {
          const ic = r.kind === 'up' ? 'i:' + r.def.line + (r.why ? '|lock' : '') : 'i:' + r.def.icon + (r.why ? '|lock' : '');
          const b = btn(ic, r.def.name, r.why || costTxt(r.def.cost), () => {
            if (r.why) { UI.alert(`${r.def.name} needs the ${G.AGES[r.def.age].name}`); return; }
            const ok = G.startResearch(e, r.id);
            if (ok === 'res') { UI.alert('Not enough resources'); flashCost(r.def.cost); }
            else if (!ok) UI.alert('Already researching');
            panelKey = '';
          }, !!r.why || !G.canAfford(1, r.def.cost));
          b.classList.add('research'); cmds.appendChild(b);
        }
      }
      if (e.type === 'towncenter' && e.owner === 1) {
        const nx = G.AGES[G.ageOf(1) + 1];
        if (e.aging) cmds.appendChild(btn('⏹', 'Cancel', G.AGES[e.aging.to].short + ' Age', () => { G.cancelAge(e); panelKey = ''; }));
        else if (nx) {
          const why = G.ageBlock(1, e);
          cmds.appendChild(btn('⬆️', nx.short + ' Age', why ? 'locked' : costTxt(nx.cost), () => {
            const r = G.advanceAge(e);
            if (r === 'res') { UI.alert('Not enough resources'); flashCost(nx.cost); }
            else if (!r) UI.alert(G.ageBlock(1, e) || 'Cannot advance now');
            else UI.alert(`Advancing to the ${nx.name}…`);
            panelKey = '';
          }, !!why || !G.canAfford(1, nx.cost)));
        }
      }
      if (e.def.garrison && e.owner === 1) {
        cmds.appendChild(btn('🔔', 'Ring bell', 'all villagers in', () => { G.ringBell(1); UI.alert('Villagers, take shelter!'); panelKey = ''; }));
        const n = (e.garrison || []).length;
        if (n) cmds.appendChild(btn('🚪', 'Ungarrison', n + ' inside', () => { for (const b of sel) if (b.garrison) G.ungarrison(b); panelKey = ''; }));
      }
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
      $('clock').innerHTML = `<b>${G.AGES[G.ageOf(1)].short}</b><span>${m}:${String(s).padStart(2, '0')}</span>`;
      const idle = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === 'villager' && e.task.t === 'idle').length;
      const ic = $('idle-count'); ic.textContent = idle || ''; ic.classList.toggle('zero', !idle);
      const na = G.ents.filter(e => !e.dead && e.owner === 1 && e.kind === 'unit' && e.type !== 'villager').length;
      const ac = $('army-count'); ac.textContent = na || ''; ac.classList.toggle('zero', !na);
      refreshPanel(false);
    }
    if (!G.paused && !G.over && !G.demo) { saveT -= dt; if (saveT <= 0) { saveT = 20; G.saveGame(); } }
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
      G.camera.zoom = Math.max(G.minZoom || 0.45, Math.min(2.2, gesture.z * d / gesture.d));
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
    G.camera.zoom = Math.max(G.minZoom || 0.45, Math.min(2.2, G.camera.zoom * Math.pow(0.999, e.deltaY)));
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
  const mmGo = e => { const r = mm.getBoundingClientRect(); const k = mm.clientWidth / r.width; const w = G.minimapToWorld(mm, (e.clientX - r.left) * k, (e.clientY - r.top) * k); G.camera.focus(w.x, w.y); };
  mm.addEventListener('pointerdown', e => { mmDown = true; mm.setPointerCapture(e.pointerId); mmGo(e); });
  mm.addEventListener('pointermove', e => { if (mmDown) mmGo(e); });
  mm.addEventListener('pointerup', () => { mmDown = false; });

  // pause when the app is hidden
  document.addEventListener('visibilitychange', () => { if (document.hidden && !$('hud').classList.contains('hidden') && !G.over) { G.paused = true; G.saveGame(); $('menu').classList.remove('hidden'); } });
  window.addEventListener('pagehide', () => { if (!$('hud').classList.contains('hidden') && !G.over) G.saveGame(); });

  // boot: show a living map behind the start screen
  G.paused = true; G.demo = true;
  G.newGame({ seed: 7 });
  G.buildGround();
  applyPrefs();
  refreshContinue();
  if (G.loadArt) G.loadArt();
  G.start();
  // expose for testing
  UI._tap = tap; UI._startSkirmish = startSkirmish; UI._setup = setup; UI._show = show; UI._select = select; UI._startPlace = startPlace; UI._confirmPlace = confirmPlace; UI._moveGhost = moveGhost;
})();
