// HUD, command panel, touch/mouse input, menus.
// The preview page wraps the game with its own viewport tag, one that allows page zoom, so a
// pinch could zoom the whole page instead of the map. Force the game's own setting, and never
// let a two-finger move reach the browser.
for (const m of document.querySelectorAll('meta[name=viewport]'))
  m.content = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
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
  const PREF_DEFAULTS = { speed: '1', gfx: 'high', hp: 'damaged', orient: 'auto', setup: null, quickAI: 'normal', sound: 'full', music: 'normal', autovil: 'off', idlealert: 'on', attackalert: 'on', camspeed: '1', btnsize: 'normal', haptics: 'on', grid: 'on', mmsize: 'small' };
  const prefs = { ...PREF_DEFAULTS };
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
    if (G.sound) {
      const v = prefs.sound === undefined ? 'full' : prefs.sound;
      G.sound.setEnabled(v !== 'off');
      G.sound.setVolume(v === 'quiet' ? 0.35 : 0.75);
      const mv = prefs.music === undefined ? 'normal' : prefs.music;
      G.sound.setMusicEnabled(mv !== 'off');
      G.sound.setMusicVolume(mv === 'soft' ? 0.3 : 0.5);
    }
    G.gfxLow = prefs.gfx === 'low';
    G.hpAlways = prefs.hp === 'always';
    G.noGrid = prefs.grid === 'off';
    document.body.classList.toggle('bigbtn', prefs.btnsize === 'large');
    document.body.classList.toggle('mm-large', prefs.mmsize === 'large');
    lockOrientation();
    G.resize();
    [...$('speed').children].forEach(x => x.classList.toggle('on', +x.dataset.s === G.speed));
    document.querySelectorAll('[data-pref]').forEach(seg => [...seg.children].forEach(x => x.classList.toggle('on', x.dataset.v === String(prefs[seg.dataset.pref]))));
  }
  document.addEventListener('click', e => {
    if (G.sound && e.target.closest('button')) G.sound.play('click');
  }, true);
  document.querySelectorAll('[data-pref]').forEach(seg => seg.addEventListener('click', e => {
    const v = e.target.closest('button') && e.target.closest('button').dataset.v; if (!v) return;
    prefs[seg.dataset.pref] = v; savePrefs(); applyPrefs();
  }));

  // a phone will not play anything until the player has touched the screen, so the first
  // gesture of the session is what starts the audio
  // gesture of the session is what starts the audio. Keep listening until music is actually
  // playing: if the track list was still loading on the first tap, the next tap starts it.
  if (G.sound && G.sound.preload) G.sound.preload();
  $('tap-begin').onclick = () => { if (G.sound) G.sound.wake(); $('start').classList.add('begun'); };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, function wake() {
    if (!G.sound) return;
    G.sound.wake();
    const np = G.sound.nowPlaying();
    if ((np && !np.paused) || !G.sound.musicEnabled) ['pointerdown', 'keydown'].forEach(e2 => window.removeEventListener(e2, wake));
  }));

  // ---------- Screens ----------
  const SCREENS = ['start', 'quick', 'skirmish', 'dynasties', 'options', 'help', 'menu', 'over', 'picker'];
  function show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (G.sound && (id === 'start' || id === 'over')) G.sound.setScene('menu');
    if (id === 'start') refreshContinue();
  }
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => show('start'));
  function enterGame() {
    if (G.sound) G.sound.setScene('game');
    for (const s of SCREENS) $(s).classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.paused = false; G.demo = false; saveT = 20;
    G.inGame = true; if (prefs.orient !== 'auto') lockOrientation();
  }
  function toMenu() {
    if (G.tutorial && G.tutorial.on) { G.tutorial.stop(); G.over = 'quit'; }
    if (!G.over) G.saveGame();
    G.paused = true; G.demo = true; G.inGame = false;
    $('hud').classList.add('hidden');
    show('start');
  }
  function refreshContinue() {
    let s = G.hasSave();
    if (s && s.time < 60) s = null;   // a game left in its first minute isn't worth resuming
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
  $('m-tut').onclick = () => { G.tutorial.start(); enterGame(); };
  const _ss = startSkirmish; startSkirmish = cfg => { G.tutorial.last = false; _ss(cfg); };
  $('m-options').onclick = () => show('options');
  $('btn-resetprefs').onclick = () => { const keep = prefs.setup; Object.assign(prefs, PREF_DEFAULTS, { setup: keep }); savePrefs(); applyPrefs(); UI.alert('Settings reset'); };
  $('btn-replaytut').onclick = () => { G.tutorial.start(); enterGame(); };
  const delBtn = $('btn-delsave');
  delBtn.onclick = () => {
    if (!G.hasSave()) { delBtn.textContent = 'No saved game'; setTimeout(() => delBtn.textContent = 'Delete saved game', 1500); return; }
    if (delBtn.dataset.armed) { G.clearSave(); delete delBtn.dataset.armed; delBtn.textContent = 'Deleted'; setTimeout(() => delBtn.textContent = 'Delete saved game', 1500); return; }
    delBtn.dataset.armed = '1'; delBtn.textContent = 'Tap again to delete';
    setTimeout(() => { if (delBtn.dataset.armed) { delete delBtn.dataset.armed; delBtn.textContent = 'Delete saved game'; } }, 2500);
  };

  // ---------- Skirmish setup ----------
  const TEAM_COL = ['#6b5a3e', '#3b6fd6', '#c0392b', '#2e8b57', '#c9a227'];
  const DIFF_TXT = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };
  const crestOf = civ => civ === 'random' ? '' : `assets/ui/crest_${civ}.png`;
  const shield = (n) => `<svg viewBox="0 0 24 28" class="shield"><path d="M12 1 L22 4 V13 C22 20 17 25 12 27 C7 25 2 20 2 13 V4 Z" fill="${TEAM_COL[n]}" stroke="#f0cf7a" stroke-width="1.6"/><text x="12" y="18" text-anchor="middle" font-size="11" font-weight="700" fill="#fff4d6">${n ? n : '–'}</text></svg>`;
  // the dynasty picker: game-styled cards instead of the phone's own list
  function pickCiv(cur, done) {
    const grid = $('pick-grid'); grid.innerHTML = '';
    for (const k of ['random', ...Object.keys(G.CIVS)]) {
      const c = G.CIVS[k], b = document.createElement('button');
      b.className = 'pcard' + (k === cur ? ' on' : '');
      b.innerHTML = (k === 'random' ? '<div class="qcrest">?</div>' : `<img src="${crestOf(k)}" alt="">`) +
        `<b>${k === 'random' ? 'Random' : c.name}</b><em>${k === 'random' ? 'Surprise me' : c.role}</em>` +
        `<small>${k === 'random' ? 'A dynasty is drawn when the battle starts.' : c.bonuses.slice(0, 2).join(' · ')}</small>`;
      b.onclick = () => { $('picker').classList.add('hidden'); done(k); };
      grid.appendChild(b);
    }
    $('picker').classList.remove('hidden');
  }
  $('pick-cancel').onclick = () => $('picker').classList.add('hidden');
  $('picker').onclick = e => { if (e.target.id === 'picker') $('picker').classList.add('hidden'); };
  const setup = prefs.setup || {
    slots: [
      { type: 'human', civ: 'britons', team: 0 },
      { type: 'ai', civ: 'random', team: 0, ai: 'normal' },
      { type: 'closed', civ: 'random', team: 0, ai: 'normal' },
      { type: 'closed', civ: 'random', team: 0, ai: 'normal' }
    ],
    size: 'medium', res: 'standard', pop: '200', reveal: 'normal', shape: 'rect', mode: 'conquest', time: '0', age: '1'
  };
  if (!setup.shape) setup.shape = 'rect';
  if (!setup.mode) setup.mode = 'conquest';   // saved setups from before Regicide existed
  if (setup.time == null) setup.time = '0';     // ...and from before the time limit
  if (setup.age == null) setup.age = '1';
  function renderSlots() {
    const box = $('slots'); box.innerHTML = '';
    setup.slots.forEach((sl, i) => {
      const row = document.createElement('div');
      if (sl.type === 'closed') {
        row.className = 'slot seat';
        row.innerHTML = `<i class="gem" style="--c:${G.PLAYER_COLORS[i + 1]}"></i><span>+ Add computer player</span>`;
        row.onclick = () => { sl.type = 'ai'; sl.ai = sl.ai || 'normal'; renderSlots(); };
        box.appendChild(row); return;
      }
      const c = G.CIVS[sl.civ];
      row.className = 'slot pl';
      row.innerHTML = `<i class="gem" style="--c:${G.PLAYER_COLORS[i + 1]}"></i>` +
        `<button class="civpick">${sl.civ === 'random' ? '<div class="qcrest sm">?</div>' : `<img src="${crestOf(sl.civ)}" alt="">`}` +
        `<span><small class="who">${i === 0 ? 'You' : 'Computer'}</small><b>${c ? c.name : 'Random'}</b><em>${c ? c.role : 'Any dynasty'}</em></span></button>` +
        `<div class="badges"><button class="badge team" aria-label="Team">${shield(sl.team || 0)}<small>Team</small></button>` +
        (sl.type === 'ai' ? `<button class="badge diff d-${sl.ai}">${DIFF_TXT[sl.ai] || 'Normal'}</button>` : '') +
        (i > 1 ? `<button class="badge xbtn" aria-label="Remove player">✕</button>` : '') + `</div>`;
      row.querySelector('.civpick').onclick = () => pickCiv(sl.civ, k => { sl.civ = k; renderSlots(); });
      row.querySelector('.team').onclick = () => { sl.team = ((sl.team || 0) + 1) % 5; renderSlots(); };
      const d = row.querySelector('.diff'); if (d) d.onclick = () => { const o = ['easy', 'normal', 'hard']; sl.ai = o[(o.indexOf(sl.ai) + 1) % 3]; renderSlots(); };
      const x = row.querySelector('.xbtn'); if (x) x.onclick = () => { sl.type = 'closed'; renderSlots(); };
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
    setup[seg.dataset.opt] = b.dataset.v;
    renderSlots();
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
    G.newGame({ players, size: cfg.size, res: cfg.res, pop: +cfg.pop, reveal: cfg.reveal, shape: cfg.shape || 'rect', mode: cfg.mode || 'conquest', time: +cfg.time || 0, startAge: +cfg.age || 1 });
    G.buildGround();
    enterGame();
    const foes = Object.keys(G.players).filter(id => G.enemies(1, +id)).map(id => G.CIVS[G.players[id].civ].name);
    UI.alert((G.rules.mode === 'regicide' ? '👑 Regicide: lose your King and Queen and you lose. ' : '')
      + (G.rules.time ? `⏳ ${G.rules.time} min limit. ` : '')
      + (G.rules.startAge > 1 ? `Starting in the ${G.AGES[G.rules.startAge].name}. ` : '')
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
      // a smaller map and Regicide keep a Quick Match to roughly 15–20 minutes
      size: 'small', res: 'high', pop: '200', reveal: 'normal', shape: 'rect', mode: 'regicide', time: 0
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
  let dynView = 'history';
  document.querySelectorAll('.dyn-view button').forEach(b => b.onclick = () => {
    dynView = b.dataset.v; document.querySelectorAll('.dyn-view button').forEach(x => x.classList.toggle('on', x === b));
    $('dyn-page').classList.toggle('hidden', dynView !== 'history'); $('dyn-treepage').classList.toggle('hidden', dynView !== 'tree');
    document.querySelector('#dynasties .sheet').classList.toggle('wide', dynView === 'tree');
  });
  function showDyn(k) {
    dynSel = k; const c = G.CIVS[k];
    [...tabs.children].forEach(x => x.classList.toggle('on', x.dataset.civ === k));
    $('dyn-crest').src = `assets/ui/crest_${k}.png`;
    $('dyn-name').textContent = c.name;
    $('dyn-role').textContent = c.role + ' dynasty';
    $('dyn-history').textContent = c.history;
    $('dyn-bonuses').innerHTML = c.bonuses.map(x => `<li>${x}</li>`).join('');
    $('dyn-unique').textContent = c.unique ? c.unique.text : 'Arrives with the next update, alongside the Ages system.';
    buildTree(k);
  }
  // ---- tech tree, laid out like AoE2's: one column per building, one row per Age ----
  const TREE_COLS = ['towncenter', 'mill', 'lumbercamp', 'miningcamp', 'barracks', 'range', 'stable', 'siegeworkshop', 'blacksmith', 'monastery', 'university', 'castle'];
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  const fmtCost = c => Object.entries(c || {}).map(([k, v]) => `${v} ${k}`).join(', ');
  function buildTree(civ) {
    const uniq = G.CIVS[civ].unique && G.CIVS[civ].unique.type;
    const cols = TREE_COLS.map(b => {
      const B = G.BUILDINGS[b], cells = [[], [], [], [], []];
      cells[G.BUILD_AGE[b] || 1].push({ kind: 'bld', icon: b, name: B.name, info: `${B.name}: costs ${fmtCost(B.cost)}.` });
      const lines = b === 'castle' ? (uniq ? [uniq] : []) : (B.trains || []);
      for (const u of lines) {
        const U = G.UNITS[u];
        cells[u === uniq ? 3 : (G.UNIT_AGE[u] || 1)].push({ kind: u === uniq ? 'uniq' : 'unit', icon: u, name: U.name, info: `${U.name}: ${fmtCost(U.cost)}. ${U.hp} HP, ${U.atk} attack${U.range > 1 ? `, range ${U.range}` : ''}.` });
        for (const id in G.UPGRADES) { const up = G.UPGRADES[id]; if (up.line === u) cells[up.age].push({ kind: u === uniq ? 'uniq' : 'unit', icon: u, name: up.name, info: `${up.name} (upgrade): ${fmtCost(up.cost)}. ${up.stats.hp ? up.stats.hp + ' HP, ' : ''}${up.stats.atk ? up.stats.atk + ' attack' : ''}.` }); }
      }
      for (const id in G.TECHS) {
        const t = G.TECHS[id];
        if ((t.at || 'blacksmith') !== b || (t.civ && t.civ !== civ)) continue;
        cells[t.age].push({ kind: t.civ ? 'dyn' : 'tech', icon: t.icon, name: t.name, info: `${t.name}: ${t.desc}. Costs ${fmtCost(t.cost)}.` });
      }
      return { b, cells };
    });
    const tree = $('dyn-tree'); tree.innerHTML = '';
    tree.style.gridTemplateColumns = `64px repeat(${cols.length}, max-content)`;
    for (let a = 1; a <= 4; a++) {
      const lab = document.createElement('div'); lab.className = 'age-lab';
      lab.innerHTML = `<i>${ROMAN[a]}</i><span>${G.AGES[a].short}</span>`; tree.appendChild(lab);
      for (const c of cols) {
        const cell = document.createElement('div'); cell.className = 'tcell a' + a;
        for (const it of c.cells[a]) {
          const t = document.createElement('button'); t.className = 'tile ' + it.kind;
          t.innerHTML = `<img src="assets/ui/icons/${it.icon}.png" alt="" onerror="this.style.visibility='hidden'"><span>${it.name}</span>`;
          t.onclick = () => { tree.querySelectorAll('.tile.sel').forEach(x => x.classList.remove('sel')); t.classList.add('sel'); $('tree-info').textContent = it.info; };
          cell.appendChild(t);
        }
        tree.appendChild(cell);
      }
    }
    $('tree-info').textContent = 'Tap anything in the tree to see what it does.';
  }

  // ---------- Pause & game over ----------
  $('btn-again').onclick = () => { if (G.tutorial.last) { G.tutorial.start(); enterGame(); } else if (lastConfig) startSkirmish(lastConfig); else show('start'); };
  $('btn-over-menu').onclick = () => { $('hud').classList.add('hidden'); G.demo = true; show('start'); };
  $('btn-menu').onclick = () => { G.paused = true; G.saveGame(); $('menu').classList.remove('hidden'); };
  $('btn-resume').onclick = () => { G.paused = false; $('menu').classList.add('hidden'); };
  $('btn-restart').onclick = () => { $('menu').classList.add('hidden'); if (lastConfig) startSkirmish(lastConfig); else if (G.config) { G.clearSave(); G.newGame({ ...G.config, seed: 0 }); G.buildGround(); enterGame(); } };
  $('btn-quit').onclick = () => { $('menu').classList.add('hidden'); toMenu(); };
  $('speed').onclick = e => { const s = e.target.dataset.s; if (!s) return; prefs.speed = s; savePrefs(); applyPrefs(); };

  UI.reset = function () { G.selection = []; mode = null; G.ghost = null; panelKey = ''; $('place-bar').classList.add('hidden'); $('btn-box').classList.remove('on'); refreshPanel(true); };
  UI.alert = function (msg) {
    if (G.sound && /^[⚠️💀🚫]|Not enough|Need more|Busy|already/i.test(msg)) G.sound.play('error'); const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = 2.5; };
  UI.gameOver = function (res) {
    if (G.sound) G.sound.play(res === 'victory' ? 'victory' : 'defeat');
    const p = G.players[1];
    const tut = G.tutorial && G.tutorial.on; if (tut) G.tutorial.stop();
    $('over-title').textContent = tut ? (res === 'victory' ? '🎓 Tutorial complete!' : 'Tutorial over: try again!') : (G.overReason === 'time' ? "⏳ Time's up — " : '') + (res === 'victory' ? '👑 Victory!' : '💀 Defeat');
    const m = Math.floor(G.time / 60), s = Math.floor(G.time % 60);
    const scores = Object.keys(G.players).map(id => `<span style="color:${G.PLAYER_COLORS[id]}">${+id === 1 ? 'You' : G.CIVS[G.players[id].civ].name}</span> ${G.scoreOf(+id)}`).join(' · ');
    $('over-stats').innerHTML = `Time: ${m}:${String(s).padStart(2, '0')}<br>Enemies defeated: ${p.killed}<br>Units & buildings lost: ${p.lost}<br>` +
      `Gathered: 🍖${p.gathered.food} 🪵${p.gathered.wood} 🪙${p.gathered.gold} 🪨${p.gathered.stone}<br>Score: ${scores}`;
    G.clearSave();
    setTimeout(() => $('over').classList.remove('hidden'), 900);
  };
  let royalAlertT = -99;
  G.onHit = function (att, t) {
    // the royals matter more than anything else: warn even when they're on screen
    if (t.owner === 1 && t.def.cls === 'hero' && G.enemies(att.owner, 1) && G.time - royalAlertT > 8) {
      royalAlertT = G.time; lastAlertT = G.time;
      if (G.sound) G.sound.play('attacked'); if (navigator.vibrate && prefs.haptics !== 'off') navigator.vibrate([60, 40, 60]);
      UI.alert(`👑 Your ${t.def.name} is under attack! Garrison them in the Town Center.`);
      UI.lastAttack = { x: t.x, y: t.y };
      return;
    }
    if (t.owner === 1 && G.enemies(att.owner, 1) && G.time - lastAlertT > 12 && prefs.attackalert !== 'off') {
      const s = G.toScreen(t.x, t.y);
      if (s.x < 0 || s.y < 0 || s.x > G.W || s.y > G.H) { lastAlertT = G.time; if (G.sound) G.sound.play('attacked'); UI.alert(t.kind === 'building' ? `⚠️ Your ${t.def.name} is under attack!` : '⚠️ Your units are under attack!'); UI.lastAttack = { x: t.x, y: t.y }; }
    }
  };
  G.onDeposit = function (u, c) {
    if (u.owner === 1 && G.isVisible(u.x, u.y)) G.effects.push({ t: 'text', x: u.x, y: u.y, text: `+${Math.round(c.amt)} ${ICON[c.res]}`, col: '#fff', life: 1.2 });
  };
  G.onResearched = function (p, name) { if (p === 1) { if (G.sound) G.sound.play('research'); UI.alert(`⚒ ${name} researched!`); panelKey = ''; } };
  G.onAgeUp = function (p, to) {
    if (p === 1) UI.alert(`🎉 You reached the ${G.AGES[to].name}! ${G.AGES[to].bonus}`);
    else UI.alert(`${G.PLAYER_COLOR_NAMES[p] || 'Enemy'} (${G.CIVS[G.players[p].civ].name}) reached the ${G.AGES[to].name}`);
    panelKey = '';
  };
  UI.onKilled = function (e) { if (G.selection.includes(e)) { G.selection = G.selection.filter(x => x !== e); panelKey = ''; } };

  // ---------- Selection helpers ----------
  function select(list, add) {
    UI.resTab = false;   // a newly selected building opens on its Train page
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
    if (G.sound && G.selection.length) G.sound.play('select');
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

  function ping(x, y, col) { G.effects.push({ t: 'ping', x, y, col, life: 0.6 }); if (G.sound) G.sound.play('command'); }
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
    lastWhy = '';
  }
  // Say what is in the way of a building, so a red footprint is never a mystery.
  let lastWhy = '';
  UI.placeWhy = function (why) {
    if (mode !== 'place' || !G.ghost || why === lastWhy) return;
    lastWhy = why;
    const nm = G.BUILDINGS[G.ghost.type].name;
    $('place-hint').textContent = why ? `${nm}: blocked by ${why}` : `${nm}: tap the map to move it`;
  };
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
  // Zoom buttons: a pinch can be taken by the app the game is shown in, so zoom never
  // depends on it. Each tap eases the camera in or out about the middle of the screen.
  let zoomAnim = null;
  function zoomBy(f) {
    const from = G.camera.zoom, to = Math.max(G.minZoom || 0.45, Math.min(2.2, from * f)), t0 = performance.now();
    if (zoomAnim) cancelAnimationFrame(zoomAnim);
    const step = now => {
      const k = Math.min(1, (now - t0) / 180), e = 1 - (1 - k) * (1 - k);
      G.camera.zoom = from + (to - from) * e;
      if (k < 1) zoomAnim = requestAnimationFrame(step); else zoomAnim = null;
    };
    zoomAnim = requestAnimationFrame(step);
  }
  $('btn-zin').onclick = () => zoomBy(1.3);
  $('btn-zout').onclick = () => zoomBy(1 / 1.3);
  applyMap();
  $('btn-home').onclick = () => {
    const tc = G.ents.find(e => !e.dead && e.owner === 1 && e.type === 'towncenter') || G.ents.find(e => !e.dead && e.owner === 1);
    if (tc) G.camera.focus(tc.x, tc.y);
  };

  // ---------- Command panel ----------
  // ---- painted icons (assets/ui/icons) ----
  const ICONP = 'assets/ui/icons/';
  const ICONS = new Set('research university blacksmith castle ageup archer army attack axethrower barracks bell box build cataphract clock delete dropoff farm food garrison gear gold home house idle king knight laurel longbowman lumbercamp menu militia mill miningcamp monastery monk pop queen rally ram range repeater scout siegeworkshop spearman stable stone stop tower towncenter trebuchet ungarrison villager villager_f wood'.split(' '));
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
    if (UI.tutGlow && lb === UI.tutGlow) b.classList.add('tut-glow');
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
    if (own && sel.length === 1 && e.kind === 'building' && e.queue && (e.queue.length || !(e.garrison && e.garrison.length))) {
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
    } else if (own && sel.length === 1 && e.kind === 'building' && e.garrison && e.garrison.length) {
      // who is sheltering inside: a portrait each, the royals marked; tap one to send it out
      const key = 'g' + e.garrison.map(u => u.id).join(',');
      if (q.dataset.k !== key + e.id) {
        q.dataset.k = key + e.id; q.innerHTML = '';
        for (const u of e.garrison) {
          const d = document.createElement('button'); d.className = 'qitem' + (u.def.cls === 'hero' ? ' royal' : '');
          d.title = 'Send out ' + u.def.name;
          d.innerHTML = iconHTML('i:' + (u.type === 'villager' && u.sex === 'f' ? 'villager_f' : u.type)) + (u.def.cls === 'hero' ? '<span class="crown">👑</span>' : '');
          d.onclick = () => { G.ungarrison(e, x => x === u); panelKey = ''; q.dataset.k = ''; };
          q.appendChild(d);
        }
      }
    } else if (q.innerHTML) { q.innerHTML = ''; q.dataset.k = ''; }

    // commands (rebuilt only when something relevant changes)
    const R = G.players[1].res;
    const key = sel.map(x => x.id).join(',') + '|' + buildMenu + '|' + (e.built ? 1 : 0) + '|' + (e.garrison ? e.garrison.length : 0) + '|' + (e.aging ? 1 : 0) + G.ageOf(1) + (e.research ? e.research.id : '') + (UI.resTab ? 'R' : 'T') + JSON.stringify(G.players[1].up || {}) + Object.keys(G.players[1].techs || {}).length + '|' + Math.floor(R.food / 25) + Math.floor(R.wood / 25) + Math.floor(R.gold / 25) + Math.floor(R.stone / 25);
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
        cmds.appendChild(btn('🛡️', 'Garrison', hasCastle && canHide.some(u => u.type !== 'villager' && u.def.cls !== 'hero') ? 'Castle' : 'Town Center', () => {
          let full = 0;
          for (const u of canHide) {
            const b = G.nearest(u, e => (e.type === 'castle' || e.type === 'towncenter') && G.canGarrison(u, e));
            if (b) G.garrisonTo(u, b); else full++;
          }
          if (full) UI.alert(hasCastle ? 'No room left inside' : 'No room in a Town Center');
        }));
      }
      cmds.appendChild(btn('✋', 'Stop', '', () => { for (const u of units) { u.task = { t: 'idle' }; u.path = []; } }));
      // formation, for a group with soldiers in it: tap to cycle line, staggered, box
      if (units.filter(u => u.type !== 'villager').length >= 2) {
        const pl = G.players[1], cur = pl.formation || 'line', NAMES = { line: 'Line', staggered: 'Staggered', box: 'Box' };
        cmds.appendChild(btn('i:army', 'Formation', NAMES[cur], () => {
          pl.formation = G.FORMATIONS[(G.FORMATIONS.indexOf(cur) + 1) % G.FORMATIONS.length];
          UI.alert(`Formation: ${NAMES[pl.formation]}` + (pl.formation === 'box' ? ' (archers and royals inside a ring of soldiers)' : pl.formation === 'staggered' ? ' (spread out against arrows and siege)' : ''));
          panelKey = ''; refreshPanel(true);
        }));
      }
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
    if (e.kind === 'building' && e.built) {
      // Two pages, so an upgrade never looks like a unit: Train (units, rally point) and
      // Research (this building's upgrades and techs, done ones ticked, locked ones greyed).
      const trains = G.trainsFor(e), mine = e.owner === 1;
      const res = mine ? G.researchesFor(e) : [], done = mine ? G.researchedAt(e) : [];
      const hasRes = mine && (res.length || done.length || e.research);
      const resPage = hasRes && (!trains.length || UI.resTab);
      if (hasRes && trains.length) {
        const n = res.filter(r => !r.why).length;
        const tb = btn(resPage ? '⚔️' : 'i:research', resPage ? 'Train' : 'Research', resPage ? 'units' : (n ? n + ' available' : 'upgrades'),
          () => { UI.resTab = !UI.resTab; panelKey = ''; refreshPanel(true); });
        tb.classList.add('tab'); cmds.appendChild(tb);
      }
      if (!resPage && trains.length) {
        for (const t of trains) {
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
      }
      if (resPage) {
        if (e.research) {
          const rd = e.research.kind === 'up' ? G.UPGRADES[e.research.id] : G.TECHS[e.research.id];
          cmds.appendChild(btn('⏹', 'Cancel', rd.name, () => { G.cancelResearch(e); panelKey = ''; }));
        } else for (const r of res) {
          const ic = r.kind === 'up' ? 'i:' + r.def.line + (r.why ? '|lock' : '') : 'i:' + r.def.icon + (r.why ? '|lock' : '');
          const b = btn(ic, r.def.name, r.why || costTxt(r.def.cost), () => {
            if (r.why) { UI.alert(`${r.def.name} needs the ${G.AGES[r.def.age].name}`); return; }
            const ok = G.startResearch(e, r.id);
            if (ok === 'res') { UI.alert('Not enough resources'); flashCost(r.def.cost); }
            else if (!ok) UI.alert('Already researching');
            else if (r.def.desc) UI.alert(`Researching ${r.def.name}: ${r.def.desc}`);
            panelKey = '';
          }, !!r.why || !G.canAfford(1, r.def.cost));
          b.classList.add('research');
          if (r.def.desc) b.title = r.def.desc;
          cmds.appendChild(b);
        }
        for (const id of done) {
          const t = G.TECHS[id], b = btn('i:' + t.icon, t.name, '✓ done', () => UI.alert(`${t.name}: ${t.desc || 'researched'}`), true);
          b.classList.add('research', 'done'); cmds.appendChild(b);
        }
      }
      if (e.type === 'towncenter' && e.owner === 1) {
        const nx = G.AGES[G.ageOf(1) + 1];
        if (e.aging) cmds.appendChild(btn('⏹', 'Cancel', G.AGES[e.aging.to].short + ' Age', () => { G.cancelAge(e); panelKey = ''; }));
        else if (nx) {
          const why = G.ageBlock(1, e);
          cmds.appendChild(btn('⬆️', nx.short + ' Age', why ? 'locked' : costTxt(G.ageCost(1, G.ageOf(1) + 1)), () => {
            const r = G.advanceAge(e);
            if (r === 'res') { UI.alert('Not enough resources'); flashCost(G.ageCost(1, G.ageOf(1) + 1)); }
            else if (!r) UI.alert(G.ageBlock(1, e) || 'Cannot advance now');
            else UI.alert(`Advancing to the ${nx.name}…`);
            panelKey = '';
          }, !!why || !G.canAfford(1, G.ageCost(1, G.ageOf(1) + 1))));
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
      let ct = `${m}:${String(s).padStart(2, '0')}`;
      if (G.rules && G.rules.time) {   // with a time limit the clock counts down instead
        const left = Math.max(0, G.rules.time * 60 - G.time), lm = Math.floor(left / 60), ls = Math.floor(left % 60);
        ct = `<i style="font-style:normal;${left < 60 ? 'color:#ff7b6b' : ''}">⏳${lm}:${String(ls).padStart(2, '0')}</i>`;
      }
      $('clock').innerHTML = `<b>${G.AGES[G.ageOf(1)].short}</b><span>${ct}</span>`;
      const idle = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === 'villager' && e.task.t === 'idle').length;
      const ic = $('idle-count'); ic.textContent = idle || ''; ic.classList.toggle('zero', !idle);
      if (idle > (UI.lastIdle || 0) && prefs.idlealert !== 'off' && G.time > 5) { if (G.sound) G.sound.play('select'); $('btn-idle').classList.remove('flash'); void $('btn-idle').offsetWidth; $('btn-idle').classList.add('flash'); }
      UI.lastIdle = idle;
      // keep the Town Center training villagers (Options), up to the chosen number
      const av = +prefs.autovil || 0;
      if (av && !G.over) for (const b of G.ents) if (!b.dead && b.owner === 1 && b.type === 'towncenter' && b.built && !b.queue.length && !b.aging && !b.research) {
        const nv = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === 'villager').length, pc = G.popOf(1);
        if (nv < av && pc.pop < pc.cap && G.canAfford(1, G.unitCost(1, 'villager'))) G.train(b, 'villager');
      }
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
    // A new first touch always starts clean. A phone can lose a finger's "up" (the app the
    // game sits in takes it), and a stale finger left here made every later tap look like
    // half of a two-finger gesture, so nothing could be tapped.
    if (e.isPrimary) { pts.clear(); gesture = null; clearHold(); G.boxSel = null; }
    // Pinch is gone (it glitched in the app); the zoom buttons zoom. A second finger is ignored.
    if (e.pointerType !== 'mouse' && pts.size >= 1) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
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
          if (navigator.vibrate && prefs.haptics !== 'off') navigator.vibrate(15);
        }
      }, 420);
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
      const cs = +prefs.camspeed || 1; G.camera.x -= dx * cs / G.camera.zoom; G.camera.y -= dy * cs / G.camera.zoom;
      G.camera.vx = 0; G.camera.vy = 0;
      if (gesture.samples) { gesture.samples.push({ dx, dy, t: performance.now() }); if (gesture.samples.length > 5) gesture.samples.shift(); }
    } else if (gesture.type === 'box') {
      G.boxSel.x1 = e.clientX; G.boxSel.y1 = e.clientY;
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
  G.newGame({ seed: 7, demo: true });
  G.buildGround();
  applyPrefs();
  refreshContinue();
  if (G.loadArt) G.loadArt();
  G.start();
  // expose for testing
  UI._tap = tap; UI._startSkirmish = startSkirmish; UI._setup = setup; UI._show = show; UI._select = select; UI._startPlace = startPlace; UI._confirmPlace = confirmPlace; UI._moveGhost = moveGhost;
})();
