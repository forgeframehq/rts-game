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
  const PREF_DEFAULTS = { speed: '1', gfx: 'high', hp: 'damaged', orient: 'auto', setup: null, quickAI: 'normal', intro: 'first', dynfilm: 'on', sound: 'full', music: 'normal', autovil: 'off', idlealert: 'on', attackalert: 'on', camspeed: '1', btnsize: 'normal', haptics: 'on', grid: 'on', mmsize: 'small', reseed: 'on', tips: 'on', voice: 'on' };
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
    G.autoReseed = prefs.reseed !== 'off';
    G.speed = +prefs.speed || 1;
    if (G.sound) {
      const v = prefs.sound === undefined ? 'full' : prefs.sound;
      G.sound.setEnabled(v !== 'off');
      G.sound.setVolume(v === 'quiet' ? 0.35 : 0.75);
      const mv = prefs.music === undefined ? 'normal' : prefs.music;
      G.sound.setMusicEnabled(mv !== 'off');
      G.sound.setMusicVolume(mv === 'soft' ? 0.3 : 0.55);
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
    const b = e.target.closest('button, .slot.seat, .savecard, [data-snd]'); if (!G.sound || !b) return;
    if (b.classList.contains('seat')) { G.sound.play('open'); return; }   // adding a player
    // a sound that says what the tap did: back, a switch, opening a screen, or a plain click
    G.sound.play(b.hasAttribute('data-back') || b.id === 'res-menu' ? 'back' : b.closest('.seg, .swatches, [data-pref], .res-tabs') ? 'toggle' : /^(m-|btn-p|btn-menu|btn-obj)/.test(b.id) ? 'open' : 'click');
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
  // ---------- Cinema ----------
  // One overlay plays the intro and the dynasty films, full screen, with a Skip button.
  // Videos load only when played, so the menu never waits on them.
  let cineDone = null;
  // tall screens get the portrait cut of each film, wide screens the landscape one
  const film = name => `assets/video/${name}${innerHeight > innerWidth ? '_p' : ''}.mp4`;
  function playFilm(src, title, done) {
    const v = $('cine-v'), box = $('cine');
    cineDone = () => { cineDone = null; done && done(); box.classList.add('out'); if (G.sound) G.sound.hush(false);
      setTimeout(() => { v.pause(); v.removeAttribute('src'); v.load(); box.classList.add('hidden'); box.classList.remove('out'); $('cine-title').classList.add('hidden'); }, 900); };
    if (G.sound) G.sound.hush(true);
    box.classList.remove('hidden'); box.classList.remove('show-skip');
    $('cine-title').classList.add('hidden');
    if (title) { $('cine-crest').src = title.crest; $('cine-name').textContent = title.name; $('cine-role').textContent = title.role; }
    v.poster = src.replace('.mp4', '.jpg'); box.style.backgroundImage = `url(${v.poster})`; v.classList.remove('playing');
    v.onplaying = () => v.classList.add('playing');
    v.src = src; v.currentTime = 0; v.muted = !(G.sound && G.sound.enabled);
    v.onended = () => cineDone && cineDone();
    v.onerror = () => cineDone && cineDone();   // a film that can't load must never block the game
    v.ontimeupdate = () => { if (title && v.currentTime > 1.2) $('cine-title').classList.remove('hidden'); };
    const p = v.play(); if (p) p.catch(() => { v.muted = true; v.play().catch(() => cineDone && cineDone()); });
    box.classList.add('show-skip');
  }
  $('cine-skip').onclick = e => { e.stopPropagation(); cineDone && cineDone(); };
  $('cine').onclick = () => $('cine').classList.add('show-skip');
  UI.playDynFilm = (civ, done) => {
    if (prefs.dynfilm === 'off' || !G.CIVS[civ]) return done();
    const c = G.CIVS[civ];
    playFilm(film('dyn_' + civ), { crest: `assets/ui/crest_${civ}.png`, name: 'The ' + c.name, role: c.role + ' · ' + c.bonuses[0] }, done);
  };
  let introSeen = false; try { introSeen = !!localStorage.getItem('dod.intro'); } catch (e) { /* ignore */ }
  const INTRO = false;   // no intro film for now: the game opens straight on the title screen
  if (INTRO && (prefs.intro === 'always' || (prefs.intro !== 'off' && !introSeen))) { const l = document.createElement('link'); l.rel = 'preload'; l.as = 'video'; l.href = film('intro'); document.head.appendChild(l); }
  $('start').addEventListener('click', e => { if (!$('start').classList.contains('begun') && e.target.id !== 'tap-begin') $('tap-begin').click(); });
  $('tap-begin').onclick = () => {
    if (G.sound) G.sound.wake();
    const show = () => $('start').classList.add('begun');
    if (INTRO && (prefs.intro === 'always' || (prefs.intro !== 'off' && !introSeen))) {
      introSeen = true; try { localStorage.setItem('dod.intro', '1'); } catch (e) { /* ignore */ }
      playFilm(film('intro'), null, show);
    } else show();
  };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, function wake() {
    if (!G.sound) return;
    G.sound.wake();
    const np = G.sound.nowPlaying();
    if ((np && !np.paused) || !G.sound.musicEnabled) ['pointerdown', 'keydown'].forEach(e2 => window.removeEventListener(e2, wake));
  }));

  // ---------- Screens ----------
  const SCREENS = ['start', 'quick', 'skirmish', 'dynasties', 'options', 'help', 'menu', 'over', 'picker', 'saves', 'results', 'brief'];
  function show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (G.sound && (id === 'start' || id === 'over')) G.sound.setScene('menu');
    if (id === 'start') refreshContinue();
  }
  // Back goes to the main menu, or straight back to the pause menu when a sheet was opened mid-game
  document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { if (UI.backToSkirmish && !$('quick').classList.contains('hidden')) { UI.backToSkirmish = false; show('skirmish'); return; } if (UI.backToPause) { UI.backToPause = false; for (const id of SCREENS) $(id).classList.add('hidden'); $('menu').classList.remove('hidden'); } else show('start'); });
  function enterGame() {
    if (G.sound) { if (G.sound.setCiv && G.players && G.players[1]) G.sound.setCiv(G.players[1].civ); G.sound.setScene('game'); if (G.sound.ambient) G.sound.ambient(G.rules && G.rules.map); }
    for (const s of SCREENS) $(s).classList.add('hidden');
    $('hud').classList.remove('hidden');
    G.paused = false; G.demo = false; saveT = 20;
    G.inGame = true; if (prefs.orient !== 'auto') lockOrientation();
  }
  function toMenu() {
    if (G.tutorial && G.tutorial.on) { G.tutorial.stop(); G.over = 'quit'; }
    if (!G.over) G.saveGame();
    G.paused = true; G.demo = true; G.inGame = false;
    if (G.sound && G.sound.ambient) G.sound.ambient(null);
    $('hud').classList.add('hidden');
    show('start');
  }
  function refreshContinue() {
    let s = G.hasSave();
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
  $('m-skirmish').onclick = () => { renderSlots(); quickSub(); show('skirmish'); };
  $('m-dynasties').onclick = () => { showDyn(dynSel); show('dynasties'); };
  $('m-learn').onclick = () => show('help');
  $('m-tut').onclick = () => { G.tutorial.start(); enterGame(); };
  const _ss = startSkirmish; startSkirmish = (cfg, film) => { G.tutorial.last = false; _ss(cfg, film); };
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
    size: 'medium', res: 'standard', pop: '200', reveal: 'normal', shape: 'diamond', mode: 'conquest', time: '0', age: '1'
  };
  setup.shape = 'diamond';   // the classic AoE diamond is the only map shape
  if (!setup.mode) setup.mode = 'conquest';   // saved setups from before Regicide existed
  if (setup.time == null) setup.time = '0';     // ...and from before the time limit
  if (setup.age == null) setup.age = '1';
  if (setup.teamColors == null) setup.teamColors = 'off';
  if (setup.map == null) setup.map = 'grasslands';
  if (setup.mode === 'tcrush') setup.mode = 'capture';          // the old Town Center mode became Capture
  if (setup.wave == null) setup.wave = '60';
  if (setup.neutral == null) setup.neutral = 'off';
  if (setup.raidLvl == null) setup.raidLvl = 'normal';
  const RAID_TXT = { easy: 'Easy', normal: 'Normal', hard: 'Hard', brutal: 'Brutal' };
  const bestWave = () => { try { return (JSON.parse(localStorage.getItem('dod.records.v1') || '{}').bestWave || {})[setup.raidLvl] || 0; } catch (e) { return 0; } };
  const slotColor = i => { const sl = setup.slots[i]; if (setup.teamColors === 'on' && sl.team > 0) return sl.team - 1; return sl.color != null ? sl.color : i; };
  function renderSlots() {
    const box = $('slots'); box.innerHTML = '';
    const surv = setup.mode === 'survival';
    if (surv) {
      const rr = document.createElement('div'); rr.className = 'slot pl raiders';
      rr.innerHTML = `<i class="gem" style="--c:#7a1a12"></i><button class="civpick"><div class="qcrest sm">⚔</div><span><small class="who">Enemy</small><b>Raiders</b><em>${bestWave() ? 'Your best: wave ' + bestWave() : 'Waves grow every round'}</em></span></button>` +
        `<div class="badges"><button class="badge diff d-${setup.raidLvl}">${RAID_TXT[setup.raidLvl]}</button></div>`;
      rr.querySelector('.diff').onclick = () => { const o = ['easy', 'normal', 'hard', 'brutal']; setup.raidLvl = o[(o.indexOf(setup.raidLvl) + 1) % 4]; renderSlots(); };
      box.appendChild(rr);
    }
    setup.slots.forEach((sl, i) => { if (sl.color == null) sl.color = i; });
    setup.slots.forEach((sl, i) => {
      const row = document.createElement('div'), col = G.PALETTE[slotColor(i)][1];
      if (sl.type === 'closed') {
        row.className = 'slot seat';
        row.innerHTML = `<i class="gem" style="--c:${col}"></i><span>+ Add ${surv ? 'computer ally' : 'computer player'}</span>`;
        row.onclick = () => { sl.type = 'ai'; sl.ai = sl.ai || 'normal'; renderSlots(); };
        box.appendChild(row); return;
      }
      const c = G.CIVS[sl.civ], R = G.ROYALS[sl.civ] || G.ROYALS.britons, sug = R.names[0];
      row.className = 'slot pl';
      row.innerHTML = `<button class="gem gembtn" style="--c:${col}" aria-label="Colour"></button>` +
        `<button class="civpick">${sl.civ === 'random' ? '<div class="qcrest sm">?</div>' : `<img src="${crestOf(sl.civ)}" alt="">`}` +
        `<span><small class="who">${i === 0 ? 'You' : surv ? 'Ally' : 'Computer'}</small><b>${c ? c.name : 'Random'}</b><em>${c ? c.role : 'Any dynasty'}</em></span></button>` +
        `<div class="badges">` + (i === 0 ? `<button class="badge crown" aria-label="Royal names">👑<small>Names</small></button>` : '') +
        (surv ? '' : `<button class="badge team" aria-label="Team"><b class="tnum">${sl.team || '–'}</b><small>Team</small></button>`) +
        (sl.type === 'ai' ? `<button class="badge diff d-${sl.ai}">${DIFF_TXT[sl.ai] || 'Normal'}</button>` : '') +
        (i > 1 ? `<button class="badge xbtn" aria-label="Remove player">✕</button>` : '') + `</div>`;
      // the colour row and the royal names open beneath the player when asked for
      if (sl._open === 'color') {
        const taken = new Set(setup.slots.filter((o, j) => j !== i && o.type !== 'closed').map((o, j2) => slotColor(setup.slots.indexOf(o))));
        const sw = document.createElement('div'); sw.className = 'swatches';
        sw.innerHTML = (setup.teamColors === 'on' && sl.team > 0 ? '<p class="hint">Team colours are on: everyone on this team shares one colour.</p>' :
          G.PALETTE.map(([n, h], k) => `<button class="sw${k === slotColor(i) ? ' on' : ''}${taken.has(k) ? ' taken' : ''}" style="--c:${h}" data-k="${k}" aria-label="${n}" ${taken.has(k) ? 'disabled' : ''}></button>`).join(''));
        sw.onclick = e => { const k = e.target.dataset && e.target.dataset.k; if (k == null) return; sl.color = +k; sl._open = null; renderSlots(); };
        row.appendChild(sw);
      }
      if (sl._open === 'names') {
        const nm = document.createElement('div'); nm.className = 'royalnames';
        nm.innerHTML = `<label>${R.king}<input maxlength="16" data-k="kingName" placeholder="${sug[0]}" value="${(sl.kingName || '').replace(/"/g, '')}"></label>` +
          `<label>${R.queen}<input maxlength="16" data-k="queenName" placeholder="${sug[1]}" value="${(sl.queenName || '').replace(/"/g, '')}"></label>` +
          `<p class="hint">Leave blank for a historical name. Your royals take the field in Regicide; their names appear in alerts and on the results screen.</p>`;
        nm.querySelectorAll('input').forEach(inp => { inp.oninput = () => { sl[inp.dataset.k] = inp.value.trim(); }; inp.onclick = e => e.stopPropagation(); });
        row.appendChild(nm);
      }
      row.querySelector('.gembtn').onclick = () => { sl._open = sl._open === 'color' ? null : 'color'; renderSlots(); };
      const cr = row.querySelector('.crown'); if (cr) cr.onclick = () => { sl._open = sl._open === 'names' ? null : 'names'; renderSlots(); };
      row.querySelector('.civpick').onclick = () => pickCiv(sl.civ, k => { sl.civ = k; renderSlots(); });
      if (row.querySelector('.team')) row.querySelector('.team').onclick = () => { sl.team = ((sl.team || 0) + 1) % 5; renderSlots(); };
      const d = row.querySelector('.diff'); if (d) d.onclick = () => { const o = ['easy', 'normal', 'hard']; sl.ai = o[(o.indexOf(sl.ai) + 1) % 3]; renderSlots(); };
      const x = row.querySelector('.xbtn'); if (x) x.onclick = () => { sl.type = 'closed'; renderSlots(); };
      box.appendChild(row);
    });
    document.querySelectorAll('[data-opt]').forEach(seg => [...seg.children].forEach(x => x.classList.toggle('on', x.dataset.v === String(setup[seg.dataset.opt]))));
    // settings that don't apply to this mode are hidden
    document.querySelectorAll('#skirmish .opt[data-modes]').forEach(o => o.classList.toggle('hidden', !o.dataset.modes.split(' ').includes(setup.mode)));
    if ($('map-hint')) $('map-hint').textContent = setup.map === 'random' ? 'A surprise: one of the eight maps, revealed when the battle starts.' : (G.MAPS[setup.map] || G.MAPS.grasslands).desc;
    validate(); if ($('qm-sub')) quickSub();
  }
  function validate() {
    const act = setup.slots.map((s, i) => ({ ...s, id: i + 1 })).filter(s => s.type !== 'closed');
    const me = act[0];
    const foes = act.filter(s => s.id !== 1 && !(me.team > 0 && s.team === me.team));
    const surv = setup.mode === 'survival', ok = surv || foes.length > 0;
    $('btn-start').disabled = !ok;
    const big = act.length > 2 && setup.size === 'small';
    G.MODE_TXT = { conquest: 'Destroy every enemy building and unit.', regicide: 'Kill the enemy King and Queen. Protect your own.',
      capture: 'Wear an enemy Town Center down until it shows a white flag, then stand your soldiers beside it to take it over. Hold every Town Center, or hold an enemy\'s for 3 minutes, to win.',
      survival: 'Raiders attack in waves that grow every round; every 5th wave brings siege. Survive as many as you can. Lose your last Town Center and it is over.',
      empirewars: 'Everyone starts in the Feudal Age with a working town: 20 villagers already at work, farms, houses and a barracks. Fighting starts in minutes.' };
    $('mode-hint').textContent = G.MODE_TXT[setup.mode] || '';
    $('rule-hint').textContent = surv ? `You${act.length > 1 ? ' and ' + (act.length - 1) + ' ' + (act.length > 2 ? 'allies' : 'ally') : ''} against the Raiders` : !ok ? 'Everyone is on your team. Put at least one computer player on another team.'
      : big ? 'Tip: Medium or Large maps give 3–4 players more room.' : `${act.length} players · ${foes.length} ${foes.length === 1 ? 'enemy' : 'enemies'}`;
  }
  document.querySelectorAll('[data-opt]').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    setup[seg.dataset.opt] = b.dataset.v;
    renderSlots();
  }));
  let lastConfig = null;
  function startSkirmish(cfg, film) {
    lastConfig = cfg;
    const used = new Set();
    const players = cfg.slots.filter(s => s.type !== 'closed').map(s => {
      let civ = s.civ;
      if (civ === 'random') { const pool = Object.keys(G.CIVS).filter(k => !used.has(k)); civ = pool[Math.floor(Math.random() * pool.length)] || 'britons'; }
      used.add(civ);
      return { civ, team: cfg.mode === 'survival' ? 1 : (s.team || 0), ai: s.type === 'ai' ? s.ai : null, color: s.color, kingName: s.kingName, queenName: s.queenName };
    });
    // from the menus (not a restart) the player's dynasty film plays first
    if (film && UI.playDynFilm) return UI.playDynFilm(players[0].civ, () => launch(cfg, players));
    launch(cfg, players);
  }
  function launch(cfg, players) {
    G.clearSave();
    G.newGame({ players, size: cfg.size, res: cfg.res, pop: +cfg.pop, reveal: cfg.reveal, shape: 'diamond', mode: cfg.mode || 'conquest', teamColors: cfg.teamColors === 'on', map: cfg.map || 'grasslands', time: cfg.mode === 'survival' ? 0 : +cfg.time || 0, startAge: cfg.mode === 'empirewars' ? 2 : +cfg.age || 1, wave: +cfg.wave || 60, neutral: cfg.neutral === 'on', raidLvl: cfg.raidLvl || 'normal' });
    G.buildGround();
    enterGame();
    if (UI.onMatchStart) UI.onMatchStart();
    const foes = Object.keys(G.players).filter(id => G.enemies(1, +id)).map(id => G.players[id].raider ? 'the Raiders' : G.CIVS[G.players[id].civ].name);
    UI.alert((G.rules.mode === 'regicide' ? '👑 Regicide: lose your King and Queen and you lose. ' : '')
      + (G.rules.time ? `⏳ ${G.rules.time} min limit. ` : '')
      + (G.rules.startAge > 1 ? `Starting in the ${G.AGES[G.rules.startAge].name}. ` : '')
      + `You lead the ${G.CIVS[G.players[1].civ].name}. Enemies: ${foes.join(', ')}`);
  }
  $('btn-start').onclick = () => { prefs.setup = setup; savePrefs(); startSkirmish(JSON.parse(JSON.stringify(setup)), true); };

  // Quick Match: pick a difficulty and go. One opponent, high resources, so you are
  // fighting within a couple of minutes instead of gathering for ten. Keeps your last civ.
  // Quick Match plays your dynasty against one computer at the difficulty set on its row below
  const qmLevel = () => { const ai = setup.slots.find((sl, i) => i > 0 && sl.type === 'ai'); return (ai && ai.ai) || prefs.quickAI || 'normal'; };
  const quickSub = () => { $('qm-sub').textContent = `${G.CIVS[(setup.slots[0] && setup.slots[0].civ !== 'random' && setup.slots[0].civ) || 'britons'].name} vs a ${DIFF_TXT[qmLevel()] || 'Normal'} computer · Regicide · small map`; };
  const quickGo = lvl => {
    prefs.quickAI = lvl; savePrefs();
    startSkirmish({
      slots: [
        { type: 'human', civ: (prefs.setup && prefs.setup.slots[0].civ) || 'britons', team: 0 },
        { type: 'ai', civ: 'random', team: 0, ai: b.dataset.ai },
        { type: 'closed', civ: 'random', team: 0, ai: 'normal' },
        { type: 'closed', civ: 'random', team: 0, ai: 'normal' }
      ],
      // a smaller map and Regicide keep a Quick Match to roughly 15–20 minutes
      size: 'small', res: 'high', pop: '200', reveal: 'normal', shape: 'diamond', mode: 'regicide', time: 0, map: 'grasslands'
    }, true);
  };
  $('qm-go').onclick = () => quickGo(qmLevel());
  document.querySelectorAll('#quick .qd').forEach(b => b.onclick = () => quickGo(b.dataset.ai));

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
  const TREE_COLS = ['towncenter', 'mill', 'lumbercamp', 'miningcamp', 'barracks', 'range', 'stable', 'siegeworkshop', 'blacksmith', 'infirmary', 'monastery', 'university', 'castle'];
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  const fmtCost = c => Object.entries(c || {}).map(([k, v]) => `${v} ${k}`).join(', ');
  (function dragScroll(el) {
    let sx = null, sl = 0, moved = false;
    el.addEventListener('pointerdown', e => { sx = e.clientX; sl = el.scrollLeft; moved = false; });
    el.addEventListener('pointermove', e => { if (sx == null) return; const dx = e.clientX - sx; if (Math.abs(dx) > 6) moved = true; el.scrollLeft = sl - dx; });
    const end = () => { sx = null; }; ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, end));
    el.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  })($('tree-wrap'));
  const civPor = (civ, u, tier) => { const L = LINES[u]; if (L) u = L[Math.min(L.length - 1, tier)]; else if (!SOLO.has(u)) return null; return ATL[`u/${civ}_${u}`] || null; };
  function buildTree(civ) {
    const uniq = G.CIVS[civ].unique && G.CIVS[civ].unique.type;
    const cols = TREE_COLS.map(b => {
      const B = G.BUILDINGS[b], cells = [[], [], [], [], []];
      cells[G.BUILD_AGE[b] || 1].push({ kind: 'bld', icon: b, name: B.name, info: `${B.name}: costs ${fmtCost(B.cost)}.` });
      const lines = b === 'castle' ? (uniq ? [uniq] : []) : (B.trains || []);
      for (const u of lines) {
        const U = G.UNITS[u];
        cells[u === uniq ? 3 : (G.UNIT_AGE[u] || 1)].push({ kind: u === uniq ? 'uniq' : 'unit', icon: u, src: civPor(civ, u === 'villager' ? 'villagers' : u, 0), name: U.name, info: `${U.name}: ${fmtCost(U.cost)}. ${U.hp} HP, ${U.atk} attack${U.range > 1 ? `, range ${U.range}` : ''}.` });
        for (const id in G.UPGRADES) { const up = G.UPGRADES[id]; if (up.line === u) cells[up.age].push({ kind: u === uniq ? 'uniq' : 'unit', icon: u, src: civPor(civ, u, up.tier), name: up.name, info: `${up.name} (upgrade): ${fmtCost(up.cost)}. ${up.stats.hp ? up.stats.hp + ' HP, ' : ''}${up.stats.atk ? up.stats.atk + ' attack' : ''}.` }); }
      }
      for (const id in G.TECHS) {
        const t = G.TECHS[id];
        if ((t.at || 'blacksmith') !== b || (t.civ && t.civ !== civ)) continue;
        cells[t.age].push({ kind: t.civ ? 'dyn' : 'tech', icon: t.icon, src: G.techIcon(id), name: t.name, info: `${t.name}: ${t.desc}. Costs ${fmtCost(t.cost)}.` });
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
          t.innerHTML = `<img src="${it.src || `assets/ui/icons/${it.icon}.png`}" alt="" onerror="this.onerror=null;this.src='assets/ui/icons/${it.icon}.png'"><span>${it.name}</span>`;
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
  // the game opens it itself when the player switches to another app (game.js)
  UI.openPause = () => { if (!$('hud').classList.contains('hidden') && $('menu').classList.contains('hidden')) $('btn-menu').onclick(); else G.paused = true; };
  $('btn-resume').onclick = () => { G.paused = false; $('menu').classList.add('hidden'); };
  $('btn-restart').onclick = () => { $('menu').classList.add('hidden'); if (lastConfig) startSkirmish(lastConfig); else if (G.config) { G.clearSave(); G.newGame({ ...G.config, seed: 0 }); G.buildGround(); enterGame(); } };
  $('btn-quit').onclick = () => { $('menu').classList.add('hidden'); toMenu(); };
  $('speed').onclick = e => { const s = e.target.dataset.s; if (!s) return; prefs.speed = s; savePrefs(); applyPrefs(); };

  UI.reset = function () { if (UI.resetGroups) { UI.resetGroups(); UI.resetTips(); } if ($('wavebar')) $('wavebar').classList.add('hidden'); G.selection = []; mode = null; G.ghost = null; panelKey = ''; $('place-bar').classList.add('hidden'); $('btn-box').classList.remove('on'); refreshPanel(true); };
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
    if (!tut && UI.results) return UI.results(res);
    setTimeout(() => $('over').classList.remove('hidden'), 900);
  };
  let royalAlertT = -99;
  G.onHit = function (att, t) {
    // the royals matter more than anything else: warn even when they're on screen
    if (t.owner === 1 && t.def.cls === 'hero' && G.enemies(att.owner, 1) && G.time - royalAlertT > 8) {
      royalAlertT = G.time; lastAlertT = G.time;
      if (G.sound) G.sound.play('attacked'); if (navigator.vibrate && prefs.haptics !== 'off') navigator.vibrate([60, 40, 60]);
      UI.alert(`👑 ${G.royalName(1, t.type)} is under attack! Garrison them in the Town Center.`);
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
    if (G.sound && G.selection.length) G.sound.play(G.selection.some(e => e.kind === 'unit' && e.def.cls === 'cav' && e.owner === 1) ? 'horse' : 'select');
  }
  // haptics: a buzz for moments that matter (Options can turn it off)
  // haptics for a finished building
  const prevBuilt = G.onBuilt; G.onBuilt = b => { if (prevBuilt) prevBuilt(b); if (b.owner === 1 && G.ui) UI.buzz(35); };
  UI.buzz = p => { try { if (navigator.vibrate && prefs.haptics !== 'off') navigator.vibrate(p); } catch (e) { /* not supported */ } };
  // Siege Survival: which wave, and how long until the next
  UI.waveBar = function (S, left) {
    const el = $('wavebar'); el.classList.remove('hidden');
    el.innerHTML = S.active ? `⚔️ Wave <b>${S.wave}</b> · ${left} raider${left === 1 ? '' : 's'} left`
      : `🛡️ Wave <b>${S.wave + 1}</b> in ${Math.max(0, Math.ceil(S.next - G.time))}s` + (S.done ? ` · survived ${S.done}` : '');
    el.classList.toggle('fight', !!S.active);
  };
  // ---- Special cooldown on the button, refreshed every second ----
  function spCool() {
    const el = document.querySelector('.cmd.special .sp-cool'); if (!el) return;
    const sold = ownUnits().filter(u => G.specialOf && G.specialOf(u)); if (!sold.length) return;
    const ready = sold.filter(G.specialReady).length;
    el.textContent = ready ? (ready === sold.length ? 'Ready' : `${ready} ready`) : `${Math.ceil(Math.min(...sold.map(u => u.spReady - G.time)))}s`;
    const btnEl = el.closest('.cmd'); if (btnEl.classList.contains('cooling') && ready) UI.buzz(20);   // ready again
    btnEl.classList.toggle('cooling', !ready);
  }
  setInterval(spCool, 500);
  // ---- formation card ----
  const FORM_NAMES = { line: 'Line', box: 'Box', staggered: 'Staggered', wedge: 'Wedge' };
  const FORM_TXT = { line: 'Melee in front, archers behind, cavalry on the ends. For open battles.', box: 'Melee around the outside, archers and siege safe inside. For escorts and defence.', staggered: 'Spread out with gaps. Fewer men hit by arrows, rocks and fire.', wedge: 'Cavalry at the point, infantry behind. For breaking through a line.' };
  function openForm(units) {
    const card = $('formcard'), grid = card.querySelector('.fgrid'); grid.innerHTML = '';
    const cur = units[0].form || G.players[1].formation || 'line';
    for (const k of G.FORMATIONS) {
      const b = document.createElement('button'); b.className = 'fopt' + (k === cur ? ' on' : '');
      b.innerHTML = `<canvas width="150" height="110"></canvas><b>${FORM_NAMES[k]}</b><small>${FORM_TXT[k]}</small>`;
      drawFormPreview(b.querySelector('canvas'), units, k);
      b.onclick = () => { for (const u of units) u.form = k; G.players[1].formation = k; card.classList.add('hidden'); UI.alert(`Formation: ${FORM_NAMES[k]}`); panelKey = ''; refreshPanel(true); };
      grid.appendChild(b);
    }
    card.classList.remove('hidden');
  }
  // the selected army as shapes: squares melee, triangles archers, diamonds cavalry, blocks siege
  function drawFormPreview(cv, units, kind) {
    const x = cv.getContext('2d'), W = cv.width, H = cv.height, list = G.formationOrder(units, kind), sl = G.formationSlots(list, kind);
    let mx = 0.5, my = 0.5; for (const o of sl) { mx = Math.max(mx, Math.abs(o.ox)); my = Math.max(my, Math.abs(o.oy)); }
    const k = Math.min((W - 24) / (mx * 2 + 1), (H - 30) / (my * 2 + 1), 18), r = Math.max(2.5, Math.min(6, k * 0.32));
    x.clearRect(0, 0, W, H);
    x.fillStyle = 'rgba(255,215,106,0.5)'; x.beginPath(); x.moveTo(W / 2, 4); x.lineTo(W / 2 - 6, 12); x.lineTo(W / 2 + 6, 12); x.fill();   // the way they face
    list.forEach((u, i) => {
      const px = W / 2 + sl[i].ox * k, py = H / 2 + 6 - sl[i].oy * k;
      x.beginPath();
      if (u.def.siege) { x.fillStyle = '#b9b2a6'; x.fillRect(px - r, py - r * 0.7, r * 2, r * 1.4); return; }
      if (u.def.ranged) { x.fillStyle = '#7fd1ff'; x.moveTo(px, py - r); x.lineTo(px + r, py + r); x.lineTo(px - r, py + r); }
      else if (u.def.cls === 'cav') { x.fillStyle = '#ffd76a'; x.moveTo(px, py - r * 1.2); x.lineTo(px + r, py); x.lineTo(px, py + r * 1.2); x.lineTo(px - r, py); }
      else { x.fillStyle = u.type === 'villager' ? '#c9b48a' : '#ff8a7a'; x.rect(px - r * 0.85, py - r * 0.85, r * 1.7, r * 1.7); }
      x.fill();
    });
  }
  // send villagers to the nearest source of a resource (food: a free farm first, then berries)
  function sendTo(vils, k) {
    const v = vils[0];
    if (k === 'food') { const f = G.freeFarmNear(v.x, v.y, 1); if (f) { G.cmdSmart(vils.slice(0, 1), f.x, f.y, f); outline(f, '#7dff7a'); if (vils.length > 1) sendTo(vils.slice(1), 'food'); panelKey = ''; return; } }
    const type = { food: 'berry', wood: 'tree', gold: 'gold', stone: 'stone' }[k];
    const r = G.nearest(v, e => e.kind === 'res' && e.type === type && e.amount > 0 && (G.revealAll || G.isExplored(e.tx, e.ty)), 999);
    if (!r) { UI.alert(`No ${k} found yet: explore with a scout`); return; }
    G.cmdGather(vils, r); outline(r, '#7dff7a'); ping(r.x, r.y, '#7dff7a'); panelKey = '';
    if (G.sound) G.sound.play('command');
  }
  // ---- Army buttons 1-3: hold to save the selection, tap to select it, double-tap to jump to it ----
  const groups = [[], [], []]; let grpTap = { g: -1, t: 0 };
  document.querySelectorAll('.grp').forEach(b => {
    const g = +b.dataset.g; let hold = null, held = false;
    b.onpointerdown = () => { held = false; hold = setTimeout(() => {
      held = true; const units = G.selection.filter(e => e.kind === 'unit' && e.owner === 1);
      if (!units.length) { UI.alert('Select some units first, then hold a number to save them'); return; }
      groups[g] = units.map(u => u.id); for (const u of units) u.grp = g;
      b.classList.add('set'); UI.alert(`Army ${g + 1} saved: ${units.length} unit${units.length === 1 ? '' : 's'}`); UI.buzz(30);
    }, 500); };
    b.onpointerup = b.onpointerleave = () => clearTimeout(hold);
    b.oncontextmenu = e => e.preventDefault();
    b.onclick = e => {
      e.stopPropagation(); if (held) return;
      const units = groups[g].map(id => G.byId.get(id)).filter(u => u && !u.dead && u.owner === 1);
      if (!units.length) { UI.alert(`Hold ${g + 1} to save your selected army there`); b.classList.remove('set'); return; }
      const now = performance.now(), dbl = grpTap.g === g && now - grpTap.t < 400; grpTap = { g, t: now };
      select(units, false);
      if (dbl) { const cx = units.reduce((a, u) => a + u.x, 0) / units.length, cy = units.reduce((a, u) => a + u.y, 0) / units.length; G.camera.focus(cx, cy); }
    };
  });
  UI.resetGroups = () => { for (const g of groups) g.length = 0; document.querySelectorAll('.grp').forEach(b => b.classList.remove('set')); };
  // ---- enemy spotted: the first time an enemy army comes into view ----
  let spotT = -99; const seen = new Set();
  function spotCheck() {
    if (G.time - spotT < 40 || (G.tutorial && G.tutorial.on)) return;
    const fresh = G.ents.filter(e => !e.dead && e.kind === 'unit' && e.type !== 'villager' && G.enemies(1, e.owner) && !seen.has(e.id) && G.isVisible(e.x, e.y));
    for (const e of fresh) seen.add(e.id);
    if (fresh.length < 3) return;
    const cx = fresh.reduce((a, u) => a + u.x, 0) / fresh.length, cy = fresh.reduce((a, u) => a + u.y, 0) / fresh.length;
    spotT = G.time; G.spotted = { x: cx, y: cy, until: G.time + 8 };
    toastJump(`👁️ Enemy army spotted (${fresh.length}): tap to look`, cx, cy);
    UI.buzz([40, 40, 40]);
  }
  // a toast you can tap to jump the camera
  function toastJump(msg, x, y) { UI.alert(msg); const t = $('toast'); t.classList.add('jump'); t.onclick = () => { G.camera.focus(x, y); t.classList.remove('show'); }; setTimeout(() => { t.classList.remove('jump'); t.onclick = null; }, 2600); }
  // ---- tips in the first few games ----
  let tipT = 40; const tipsSaid = new Set();
  function gameTips(dt) {
    if (prefs.tips === 'off' || (G.tutorial && G.tutorial.on) || G.demo) return;
    let games = 0; try { games = JSON.parse(localStorage.getItem('dod.records.v1') || '{}').games || 0; } catch (e) { /* none */ }
    if (games >= 4) return;
    tipT -= dt; if (tipT > 0) return; tipT = 45;
    const me = G.players[1], tc = G.ents.find(e => !e.dead && e.owner === 1 && e.type === 'towncenter'), pc = G.popOf(1);
    const idle = G.ents.filter(e => !e.dead && e.owner === 1 && e.type === 'villager' && e.task.t === 'idle').length;
    const foeCav = G.ents.some(e => !e.dead && e.def && e.def.cls === 'cav' && G.enemies(1, e.owner) && G.isVisible(e.x, e.y));
    const tips = [
      ['tcidle', tc && !tc.queue.length && G.time < 900, '💡 Your Town Center is idle: keep training villagers. Hold the Villager button to queue 5.'],
      ['pop', pc.pop >= pc.cap - 1, '💡 You are out of housing: build a House (+5 population).'],
      ['idle', idle > 0, '💡 Idle villagers! Tap the villager button on the right: it suggests a job.'],
      ['barracks', G.time > 360 && !G.ents.some(e => !e.dead && e.owner === 1 && e.type === 'barracks'), '💡 Build a Barracks to raise soldiers before the enemy comes.'],
      ['spears', foeCav, '💡 Enemy cavalry spotted: Spearmen beat cavalry, and their Special (Brace) hurts a charge.'],
      ['special', G.ents.some(e => !e.dead && e.owner === 1 && e.kind === 'unit' && e.type !== 'villager'), '💡 Select soldiers and tap ⭐ Special for their move: Volley, Charge, Brace or Rush.'],
      ['groups', G.time > 420, '💡 Hold 1, 2 or 3 on the right to save an army, then tap to select it again.'],
      ['age', me.age === 1 && G.time > 600, '💡 Advance to the Feudal Age at your Town Center for new buildings and soldiers.']
    ];
    const t = tips.find(([k, ok]) => ok && !tipsSaid.has(k));
    if (t) { tipsSaid.add(t[0]); UI.alert(t[2]); }
  }
  UI.resetTips = () => { tipsSaid.clear(); tipT = 40; seen.clear(); spotT = -99; };
  const ownUnits = () => G.selection.filter(e => e.kind === 'unit' && e.owner === 1);

  function pick(sx, sy) {
    const z = G.camera.zoom;
    // with soldiers or villagers selected, an enemy under the finger always wins over a friend
    // standing beside it, so a tap on an enemy villager attacks it instead of selecting your own man
    const preferFoe = ownUnits().length > 0;
    let best = null, bd = 1e9, foe = null, fd = 1e9;
    for (const e of G.ents) {
      if (e.dead || e.kind !== 'unit') continue;
      if (e.owner !== 1 && !G.isVisible(e.x, e.y)) continue;
      // the whole figure is the target, feet to head, with a little extra room for a fingertip
      const s = G.toScreen(e.x, e.y), k = Math.max(z, 0.8), hgt = (G.mounted(e) ? 52 : 40) * k, half = (G.mounted(e) ? 20 : 14) * k + 6;
      const dx = Math.abs(sx - s.x), up = s.y - sy;
      if (dx > half || up < -10 * k || up > hgt + 8) continue;
      const d = Math.hypot(dx, up - hgt / 2);
      if (d < bd) { bd = d; best = e; }
      if (preferFoe && G.enemies(1, e.owner) && d < fd) { fd = d; foe = e; }
    }
    if (foe) return foe;
    if (best) return best;
    // resources: the whole bush, rock or tree you can see is the target, not just the tile under it
    let rb = null, rd = 1e9;
    for (const e of G.ents) {
      if (e.dead || e.kind !== 'res') continue;
      if (!G.revealAll && !G.isExplored(e.tx, e.ty)) continue;
      const g = G.toScreen(e.tx + 0.5, e.ty + 0.5), tall = e.type === 'tree';
      const top = (tall ? 62 : 26) * z, half = (tall ? 18 : 22) * z + 6;
      const dx = Math.abs(sx - g.x), up = g.y - sy;
      if (dx > half || up < -12 * z - 4 || up > top) continue;
      const d = Math.hypot(dx, up - top / 3);
      if (d < rd) { rd = d; rb = e; }
    }
    if (rb) {
      // a building drawn in front of the resource still wins
      const w = G.toWorld(sx, sy), id = G.inMap(w.x | 0, w.y | 0) ? G.block[G.idx(w.x | 0, w.y | 0)] : 0, b = id && G.byId.get(id);
      if (!(b && b.kind === 'building')) return rb;
    }
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
  function outline(e, col) {
    if (!e || e.dead) return;
    G.flash.set(e.id, { col, t: G.realTime() });   // the target glows: white rim on buildings and resources, ring and chevron on units
    if (e.kind !== 'unit') G.effects.push({ t: 'target', id: e.id, col, life: 0.9 });
  }
  // Acknowledge an order: ping the ground and outline the tree/farm/building it landed on,
  // so a tap that did nothing is never silent.
  function cmdFx(r, x, y) {
    const t = G.cmdTarget;
    const vs = ownUnits().filter(u => u.type === 'villager');
    if (G.sound && vs.length) G.sound.play(vs.filter(v => v.sex === 'f').length > vs.length / 2 ? 'ack_f' : 'ack');   // a woman answers in a woman's voice
    else if (G.sound && r === 'move' && ownUnits().length >= 4) G.sound.play('march');
    if (r === 'farm-busy') { UI.alert('Every farm is already being worked'); outline(t, '#f5c242'); return; }
    const col = r === 'attack' ? '#ff4a3a' : r === 'build' ? '#ffd34a' : r === 'move' ? '#ffffff' : '#7dff7a';
    outline(t, col);
    const on = t && !t.dead && t.kind !== 'unit';
    ping(on ? t.x : x, on ? t.y : y, col);
    if (r === 'gather-moved') UI.alert('That farm is taken — sent to the nearest free one');
  }

  // ---------- Tap logic ----------
  let lastTap = { t: 0, x: 0, y: 0, id: 0 };
  function tap(sx, sy, opts) {
    opts = opts || {};
    // the off-screen selection arrow: jump back to what you have selected
    if (G.selArrow && Math.hypot(sx - G.selArrow.x, sy - G.selArrow.y) < 26 && mode !== 'place') { G.camera.focus(G.selArrow.wx, G.selArrow.wy); if (G.sound) G.sound.play('click'); return; }
    const w = G.toWorld(sx, sy);
    if (mode === 'place') {
      if (G.ghost && G.ghost.wall && !G.ghost.start) {   // first tap: where the wall starts
        moveGhost(sx, sy); G.ghost.start = { tx: G.ghost.tx, ty: G.ghost.ty }; G.ghost.line = [G.ghost.start];
        $('place-hint').textContent = `${G.BUILDINGS[G.ghost.type].name}: now tap where it ends`; return;
      }
      moveGhost(sx, sy); if (opts.mouse) { G.render(); confirmPlace(opts.add); } return;
    }
    const target = pick(sx, sy);
    if (mode === 'rally') {
      const b = G.selection[0];
      if (b && b.kind === 'building') { b.rally = { x: w.x, y: w.y, id: target && target.kind === 'res' ? target.id : 0 }; ping(w.x, w.y, '#fff'); }
      setMode(null); return;
    }
    const units = ownUnits();
    if (mode === 'guard') {
      const sold = units.filter(u => u.type !== 'villager' && !u.def.heal && u !== target);
      if (target && target.owner === 1 && (target.kind === 'unit' || target.kind === 'building') && sold.length) {
        G.cmdGuard(sold, target); outline(target, '#6fc3ff'); ping(target.x, target.y, '#6fc3ff');
        if (G.sound) G.sound.play('command'); UI.alert(`🛡 Guarding the ${target.def.name || 'unit'}`);
      } else UI.alert('Tap one of your own units or buildings');
      setMode(null); refreshPanel(true); return;
    }
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
    // double-tap empty ground: every soldier of yours you can see
    if (dbl) { const army = G.ents.filter(e => !e.dead && e.owner === 1 && e.kind === 'unit' && e.type !== 'villager' && e.def.cls !== 'hero' && onScreen(e)); if (army.length) { select(army, false); UI.alert(`${army.length} soldier${army.length === 1 ? '' : 's'} selected`); return; } }
    select([], false);
  }
  // on screen AND not hidden under the HUD (top bar, side buttons, minimap, command panel), so a
  // double-tap only ever picks units you can actually see
  const onScreen = e => {
    const s = G.toScreen(e.x, e.y), y = s.y - 12;   // the body, not the feet
    if (s.x < 4 || y < 4 || s.x > innerWidth - 4 || s.y > innerHeight - 4) return false;
    for (const id of ['topbar', 'side', 'minimap', 'panel', 'place-bar']) {
      const el = $(id); if (!el || el.classList.contains('hidden') || !el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (s.x >= r.left && s.x <= r.right && y >= r.top && y <= r.bottom) return false;
    }
    return true;
  };

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
    if (G.BUILDINGS[type].wall && type !== 'gate') { G.ghost.wall = true; $('place-hint').textContent = `${G.BUILDINGS[type].name}: tap where the wall starts`; }
    lastWhy = '';
  }
  // a wall line from one tile to another, every piece touching the next by a side (no gaps at corners)
  // Walls run straight along the ground grid. If the end isn't on the same line, the wall goes
  // straight along the longer side first, then turns one corner to reach it (no zigzags).
  function wallLine(a, b) {
    const out = [{ tx: a.tx, ty: a.ty }]; let x = a.tx, y = a.ty;
    const dx = b.tx - a.tx, dy = b.ty - a.ty, xFirst = Math.abs(dx) >= Math.abs(dy);
    const run = (axis) => { while ((axis === 'x' ? x !== b.tx : y !== b.ty) && out.length < 40) { if (axis === 'x') x += Math.sign(dx); else y += Math.sign(dy); out.push({ tx: x, ty: y }); } };
    if (xFirst) { run('x'); run('y'); } else { run('y'); run('x'); }
    return out;
  }
  function wallHint() {
    const gh = G.ghost, n = gh.line ? gh.line.length : 1, c = G.buildCost(1, gh.type), tot = {};
    for (const k in c) tot[k] = c[k] * n;
    const short = Object.keys(tot).some(k => G.players[1].res[k] < tot[k]);
    $('place-hint').textContent = `${G.BUILDINGS[gh.type].name}: ${n} piece${n === 1 ? '' : 's'} · ${Object.entries(tot).map(([k, v]) => v + ' ' + k).join(' · ')}${short ? ' (you can afford fewer)' : ''}. Tap Build`;
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
    if (G.ghost.wall && G.ghost.start) { G.ghost.line = wallLine(G.ghost.start, { tx: Math.floor(w.x), ty: Math.floor(w.y) }); wallHint(); return; }
    G.ghost.tx = Math.floor(w.x - s / 2 + 0.5); G.ghost.ty = Math.floor(w.y - s / 2 + 0.5);
    // fields snap flush beside a nearby field, in line with it, so rows of farms are easy with a finger
    if (G.ghost.type === 'farm') {
      const fx = w.x - s / 2, fy = w.y - s / 2; let best = null, bd = 1.6;
      for (const f of G.ents) {
        if (f.dead || f.type !== 'farm' || f.owner !== 1) continue;
        for (const [ox, oy] of [[f.size, 0], [-s, 0], [0, f.size], [0, -s]]) {
          const tx = f.tx + ox, ty = f.ty + oy, d = Math.hypot(tx - fx, ty - fy);
          if (d < bd && !G.farmOverlap(tx, ty, s)) { bd = d; best = [tx, ty]; }
        }
      }
      if (best) { G.ghost.tx = best[0]; G.ghost.ty = best[1]; }
    }
  }
  function confirmPlace(keep) {
    const gh = G.ghost; if (!gh) return;
    if (gh.wall) {
      if (!gh.line) { UI.alert('Tap where the wall starts, then where it ends'); return; }
      const vils = ownUnits().filter(u => u.type === 'villager');
      let placed = 0, blocked = 0, poor = false;
      for (const t of gh.line) {
        if (!G.canAfford(1, G.buildCost(1, gh.type))) { poor = true; break; }
        const b = G.placeBuilding(1, gh.type, t.tx, t.ty, placed === 0 ? vils : null);
        if (b) placed++; else blocked++;
      }
      if (!placed) { UI.alert(poor ? 'Not enough resources' : 'Something is in the way (red tiles)'); if (poor) flashCost(G.buildCost(1, gh.type)); return; }
      const last = gh.line[gh.line.length - 1]; ping(last.tx + 0.5, last.ty + 0.5, '#8f8');
      UI.alert(`Wall: ${placed} piece${placed === 1 ? '' : 's'} laid out` + (blocked ? `, ${blocked} blocked` : '') + (poor ? ', ran out of resources' : ''));
      const builders = ownUnits().filter(u => u.type === 'villager');
      setMode(null); buildMenu = false; select(builders, false); return;
    }
    if (!gh.ok) {   // nudge to the nearest open spot instead of just refusing
      const s = G.BUILDINGS[gh.type].size;
      const fits = (x, y) => G.areaFree(x, y, s) && !G.farmOverlap(x, y, s) && G.isExplored(x + s / 2, y + s / 2) && !(G.ruleBlock && G.ruleBlock(1, gh.type, x, y));
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
    // the builders stay selected, so the next order doesn't mean selecting them all again
    const builders = ownUnits().filter(u => u.type === 'villager');
    setMode(null); buildMenu = false; select(builders, false);
  }
  $('place-ok').onclick = () => confirmPlace(false);
  $('place-cancel').onclick = () => setMode(null);

  function setMode(m) {
    mode = m;
    if (m !== 'place') G.ghost = null;
    $('place-bar').classList.toggle('hidden', m !== 'place' && m !== 'rally' && m !== 'move' && m !== 'guard');
    $('place-ok').classList.toggle('hidden', m === 'rally' || m === 'move' || m === 'guard');
    if (m === 'move') $('place-hint').textContent = 'Tap where to move';
    if (m === 'guard') $('place-hint').textContent = 'Tap a unit or building to guard';
    if (m === 'rally') $('place-hint').textContent = 'Tap where new units should gather';
    $('btn-box').classList.toggle('on', m === 'box');
    $('panel').classList.toggle('hidden', m === 'place' || m === 'rally' || m === 'move' || m === 'guard' || !G.selection.length);
    document.body.classList.toggle('has-panel', !$('panel').classList.contains('hidden'));
  }

  function flashCost(cost) { for (const k in cost) if (G.players[1].res[k] < cost[k]) { const el = $('r-' + k); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); } }

  // ---------- Population card: tap the population counter to see who is doing what ----------
  $('r-pop').style.cursor = 'pointer';
  $('r-pop').onclick = e => {
    e.stopPropagation();
    const el = $('popcard');
    if (!el.classList.contains('hidden')) { el.classList.add('hidden'); return; }
    const mine = G.ents.filter(u => !u.dead && u.owner === 1 && u.kind === 'unit');
    const inside = G.ents.filter(b => !b.dead && b.owner === 1 && b.garrison).reduce((n, b) => n + b.garrison.filter(g => !g.dead).length, 0);
    const vils = mine.filter(u => u.type === 'villager');
    const job = { food: 0, wood: 0, gold: 0, stone: 0, build: 0, idle: 0 };
    for (const v of vils) {
      const t = v.task.t;
      if (t === 'farm') job.food++;
      else if (t === 'gather') { const r = G.byId.get(v.task.id), k = r && G.RES[r.type] ? G.RES[r.type].res : v.task.rtype; job[k === 'tree' || k === 'wood' ? 'wood' : k === 'gold' ? 'gold' : k === 'stone' ? 'stone' : 'food']++; }
      else if (t === 'return') job[v.carry ? (v.carry.res === 'tree' ? 'wood' : v.carry.res === 'berry' ? 'food' : v.carry.res in job ? v.carry.res : 'food') : 'idle']++;
      else if (t === 'build' || t === 'repair') job.build++;
      else if (t === 'idle') job.idle++;
      else job.build++;
    }
    const army = {};
    for (const u of mine) if (u.type !== 'villager') { const n = u.def.name || u.type; army[n] = (army[n] || 0) + 1; }
    const pc = G.popOf(1);
    const row = (ic, lb, n) => `<li><span>${ic} ${lb}</span><b>${n}</b></li>`;
    el.innerHTML = `<h4>Population ${pc.pop}/${pc.cap}</h4>` +
      `<h5>Villagers · ${vils.length}</h5><ul>` +
      row('🌾', 'Food', job.food) + row('🪵', 'Wood', job.wood) + row('🪙', 'Gold', job.gold) + row('🪨', 'Stone', job.stone) + row('🔨', 'Building', job.build) +
      (job.idle ? `<li class="idle"><span>💤 Idle</span><b>${job.idle}</b></li>` : '') + '</ul>' +
      `<h5>Army · ${mine.length - vils.length}</h5><ul>` + (Object.keys(army).length ? Object.entries(army).sort((a, b) => b[1] - a[1]).map(([k, n]) => row('⚔️', k, n)).join('') : '<li><span>No soldiers yet</span></li>') + '</ul>' +
      (inside ? `<p>🛡 ${inside} sheltering inside buildings</p>` : '') + '<p class="hint">Tap anywhere to close</p>';
    el.classList.remove('hidden');
  };
  document.addEventListener('pointerdown', ev => { const el = $('popcard'); if (el && !el.classList.contains('hidden') && !el.contains(ev.target) && ev.target.closest && !ev.target.closest('#r-pop')) el.classList.add('hidden'); }, true);

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
  const ICONS = new Set('back cancel gate guard heal infirmary palisade special stonewall research university blacksmith castle ageup archer army attack axethrower barracks bell box build cataphract clock delete dropoff farm food garrison gear gold home house idle king knight laurel longbowman lumbercamp menu militia mill miningcamp monastery monk pop queen rally ram range repeater scout siegeworkshop spearman stable stone stop tower towncenter trebuchet ungarrison villager villager_f wood'.split(' '));
  const EMOJI_ICON = { '🔨': 'build', '🛡️': 'garrison', '✋': 'stop', '📦': 'dropoff', '🚩': 'rally', '⬆️': 'ageup', '🔔': 'bell', '🚪': 'ungarrison', '🗑️': 'delete', '⛺': 'army', '⏹': 'stop', '↩': 'menu' };
  // per-dynasty portraits: each unit line shows its current rank (Militia -> Man-at-Arms -> ...)
  const LINES = { militia: ['militia', 'manatarms', 'longsword', 'champion'], spearman: ['spearman', 'pikeman', 'halberdier'], archer: ['archer', 'crossbow', 'arbalester'],
    knight: ['knight', 'cavalier', 'paladin'], longbowman: ['longbowman', 'elitelongbowman'], axethrower: ['axethrower', 'eliteaxethrower'], cataphract: ['cataphract', 'elitecataphract'], repeater: ['repeater', 'eliterepeater'] };
  const SOLO = new Set(['scout', 'monk', 'king', 'queen', 'villager', 'villager_f', 'villagers']);
  const UPKEY = { elitelongbow: 'elitelongbowman', eliteaxe: 'eliteaxethrower', elitecata: 'elitecataphract' };
  const TECHIC = new Set('architecture arrowslits beardedaxe blastfurnace bodkin bowsaw bracer chainmail chivalry doublebit fletching forging fortwalls goldmining goldshaft greatwall greekfire handcart heavyplow horsecollar ironcasting logistica loom masonry platemail rocketry scalemail stonemining treadmill warwolf wheelbarrow yeomen'.split(' '));
  // portraits and tech icons come packed in a few atlas images; each is cut into its own small
  // image once loaded (until then the plain painted icon shows)
  const ATL = {};
  fetch('assets/ui/icons/atlas.json').then(r => r.json()).then(idx => {
    const groups = {}; for (const k in idx) (groups[idx[k][0]] = groups[idx[k][0]] || []).push(k);
    for (const g in groups) {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
        for (const k of groups[g]) { const [, cx, cy] = idx[k]; x.drawImage(im, cx * 128, cy * 128, 128, 128, 0, 0, 128, 128); try { ATL[k] = c.toDataURL('image/jpeg', 0.9); } catch (e) { /* no pixel access */ } }
        panelKey = '';
      };
      im.src = `assets/ui/icons/atlas_${g}.jpg`;
    }
  }).catch(() => {});
  // portrait image for a unit of this owner; tier forces a rank (for upgrade buttons)
  G.portrait = function (owner, type, tier) {
    const p = G.players && G.players[owner || 1]; if (!p) return null;
    let k = type;
    if (LINES[type]) k = LINES[type][Math.min(LINES[type].length - 1, tier != null ? tier : ((p.up && p.up[type]) || 0))];
    else if (!SOLO.has(type)) return null;
    return ATL[`u/${p.civ}_${k}`] || null;
  };
  G.techIcon = id => ATL['t/' + id] || null;
  function iconHTML(ic, owner) {
    if (ic && ic.startsWith('u:')) {   // u:<type>[@tier][|lock]  a dynasty portrait
      const [body, lock] = ic.slice(2).split('|'), [t, tier] = body.split('@'), src = G.portrait(owner || 1, t, tier != null ? +tier : null);
      if (src) return `<img class="ico por${lock ? ' locked' : ''}" src="${src}" alt="" draggable="false" onerror="this.onerror=null;this.src='${ICONP}${ICONS.has(t) ? t : 'army'}.png'">` + (lock ? '<span class="lock">🔒</span>' : '');
      ic = 'i:' + (t === 'villagers' ? 'villager' : t) + (lock ? '|lock' : '');
    }
    if (ic && ic.startsWith('t:')) {
      const [id, lock] = ic.slice(2).split('|'), src = G.techIcon(id);
      if (src) return `<img class="ico por${lock ? ' locked' : ''}" src="${src}" alt="" draggable="false">` + (lock ? '<span class="lock">🔒</span>' : '');
      ic = 'i:' + ((G.TECHS[id] && G.TECHS[id].icon) || 'research') + (lock ? '|lock' : '');
    }
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
    if (e.kind === 'unit') return iconHTML('u:' + (e.type === 'villager' && e.sex === 'f' ? 'villager_f' : e.type), e.owner);
    return iconHTML('i:' + e.type);
  }
  function costTxt(c) { return Object.keys(c).map(k => `<img class="ci" src="${ICONP}${k}.png" alt="${k}">${c[k]}`).join(' '); }
  // ---- press and hold any command for an explanation ----
  const CMD_TIPS = {
    'Deselect': 'Clear your selection.', 'Back': 'Back to the previous set of buttons.',
    'Build': 'Choose a building for the selected villagers to construct.',
    'Garrison': 'Send the selected units inside a building for protection. Garrisoned villagers make a Town Center shoot more arrows.',
    'Stop': 'Stop whatever the selected units are doing.', 'Stance': 'Tap to switch: Aggressive chases anywhere, Defensive (the default) fights nearby enemies then comes back, Stand Ground holds the spot, No Attack never fights.', 'Make gate': 'Turns this piece of wall into a gate on the same spot. A villager comes to build it.', 'Guard': 'Then tap a unit or building of yours: these soldiers stay by it and fight off anything that comes near.', 'Heal': 'Wounded soldiers go to the nearest Infirmary and heal inside. Ungarrison them when they are well.', 'Formation': 'Choose how this army lines up: Line, Box, Staggered or Wedge, with a preview of your own troops.',
    'Drop off': 'Carry what the villager holds to the nearest drop site.', 'Keep only': 'Keep just this kind of unit selected.',
    'Re-sow': 'Replant a harvested farm so it produces food again.', 'Rally point': 'Pick where newly trained units gather.',
    'Cancel': 'Cancel and get the resources back.', 'Ring bell': 'Send every villager into the nearest building to shelter from attack.',
    'Ungarrison': 'Send everyone back out of this building.', 'Delete': 'Destroy this. Tap twice to confirm.',
    'Train': 'Show the units this building trains.', 'Research': 'Show the technologies this building can research.'
  };
  const costLine = c => Object.entries(c || {}).map(([k, v]) => `${v} ${k}`).join(' · ');
  function tipFor(lb) {
    lb = String(lb).replace(/<[^>]*>/g, '').trim();
    if (CMD_TIPS[lb]) return { t: lb, d: CMD_TIPS[lb] };
    if (G.SPECIALS) { const sp = Object.values(G.SPECIALS).filter(x => lb.includes(x.name)); if (sp.length || /^Special/.test(lb)) { const all = sp.length ? sp : [...new Set(ownUnits().map(G.specialOf).filter(Boolean))].map(k => G.SPECIALS[k]); return { t: '⭐ Special', d: all.map(x => `${x.icon} ${x.name}: ${x.desc}`).join(' ') + ' Recharges in 30 s.' }; } }
    if (/^Re-sow/.test(lb)) return { t: 'Re-sow', d: CMD_TIPS['Re-sow'] };
    for (const id in G.TECHS) { const t = G.TECHS[id]; if (t.name === lb) return { t: t.name, d: t.desc + '.', c: costLine(t.cost), a: G.AGES[t.age].name }; }
    for (const id in G.UPGRADES) { const t = G.UPGRADES[id]; if (t.name === lb) { const U = G.UNITS[t.line]; return { t: t.name, d: `Upgrades every ${U.name} you own and train: ${t.stats.hp ? t.stats.hp + ' HP, ' : ''}${t.stats.atk ? t.stats.atk + ' attack' : 'stronger'}.`, c: costLine(t.cost), a: G.AGES[t.age].name }; } }
    for (const k in G.UNITS) { const U = G.UNITS[k]; if (U.name === lb || (G.unitDef && G.unitDef(1, k).name === lb)) {
      const D = G.unitDef ? G.unitDef(1, k) : U, good = { spearman: 'Strong against cavalry.', archer: 'Shoots from range; good against foot soldiers.', knight: 'Fast and tough; runs down archers.', militia: 'Solid foot soldier; good at knocking down buildings.', scout: 'Very fast; scouts the map and raids.', villager: 'Gathers resources and builds.', monk: 'Heals your units.', ram: 'Smashes buildings; arrows barely hurt it.', trebuchet: 'Hurls boulders at buildings from very far away.' }[k] || '';
      return { t: D.name, d: `${good} ${D.hp} HP, ${D.atk} attack${D.range > 1 ? ', range ' + D.range : ''}.`.trim(), c: costLine(G.unitCost ? G.unitCost(1, k) : U.cost) }; } }
    for (const k in G.BUILDINGS) { const B = G.BUILDINGS[k]; if (B.name === lb) {
      const what = { house: 'Adds 5 population.', mill: 'Drop-off for food; researches farming upgrades.', lumbercamp: 'Drop-off for wood; build it by a forest.', miningcamp: 'Drop-off for gold and stone; build it by a mine.', farm: 'Endless food once berries run out.', barracks: 'Trains Swordsmen and Spearmen.', range: 'Trains Archers.', stable: 'Trains Scouts and Knights.', blacksmith: 'Researches attack and armour for your army.', monastery: 'Trains Monks, who heal.', infirmary: 'Wounded units sheltered inside heal fast. One per player (two in the Imperial Age). Can\'t be built with enemy soldiers nearby.', siegeworkshop: 'Builds Rams and Trebuchets.', university: 'Researches building and tower upgrades.', castle: 'Mighty fortress; trains your dynasty\'s unique unit.', tower: 'Shoots arrows at nearby enemies.', towncenter: 'Trains villagers and is a drop-off for everything.', palisade: 'Cheap wooden wall.', stonewall: 'Strong stone wall.', gate: 'A wall your own units can pass through.' }[k] || '';
      return { t: B.name, d: what, c: costLine(B.cost), a: G.BUILD_AGE[k] > 1 ? G.AGES[G.BUILD_AGE[k]].name : null }; } }
    const ag = G.AGES.find(a => a && (a.short + ' Age' === lb || a.name === lb));
    if (ag) return { t: ag.name, d: (ag.bonus || '') + (ag.needs ? ` Needs 2 of: ${ag.needs.map(n => G.BUILDINGS[n].name).join(', ')}.` : ''), c: costLine(ag.cost) };
    return null;
  }
  let tipTimer = null, tipShown = false, tipAuto = null;
  document.addEventListener('pointerup', () => { if (!$('tip') || $('tip').classList.contains('hidden')) return; setTimeout(hideTip, 1800); }, true);
  function showTip(b, tip) {
    const el = $('tip'); if (!el || !tip || !b.isConnected) return;
    el.innerHTML = `<b>${tip.t}</b>${tip.a ? `<em>${tip.a}</em>` : ''}<p>${tip.d}</p>${tip.c ? `<small>${tip.c}</small>` : ''}`;
    el.classList.remove('hidden');
    const r = b.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    el.style.top = Math.max(8, r.top - h - 10) + 'px';
    clearTimeout(tipAuto); tipAuto = setTimeout(hideTip, 4000);   // never stays up for good
    tipShown = true; if (navigator.vibrate && prefs.haptics !== 'off') navigator.vibrate(10);
  }
  function hideTip() { clearTimeout(tipTimer); tipTimer = null; const el = $('tip'); if (el) el.classList.add('hidden'); }
  function holdTip(b, lb) {
    b.addEventListener('pointerdown', () => { tipShown = false; clearTimeout(tipTimer); tipTimer = setTimeout(() => {
      if (b.hold5) { tipShown = true; b.hold5(); UI.buzz(30); return; }   // hold a Train button: queue five
      showTip(b, tipFor(lb)); }, 450); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { clearTimeout(tipTimer); if (tipShown) setTimeout(hideTip, ev === 'pointerup' ? 1800 : 0); });
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('mouseenter', () => { const t = tipFor(lb); if (t) b.title = t.t + ': ' + t.d; });
  }
  function btn(ic, lb, cs, fn, poor) {
    const b = document.createElement('button');
    b.className = 'cmd' + (poor ? ' poor' : '');
    b.innerHTML = `<span class="ic">${iconHTML(ic)}</span><span class="lb">${lb}</span>${cs ? `<span class="cs">${cs}</span>` : ''}`;
    if (UI.tutGlow && lb === UI.tutGlow) b.classList.add('tut-glow');
    b.onclick = e => { e.stopPropagation(); if (tipShown) { tipShown = false; return; } fn(); };   // a long press explains, it doesn't press
    holdTip(b, lb);
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
      $('sel-name').textContent = (e.def.cls === 'hero' ? G.royalName(e.owner, e.type) : e.def.name) + (own ? '' : ` (${civ})`);
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
          const d = document.createElement('button'); d.className = 'qitem'; d.innerHTML = iconHTML((G.UNITS[it.type] ? 'u:' + (it.type === 'villager' ? 'villagers' : it.type) : 'i:' + it.type), 1) + (i === 0 ? '<span class="prog"></span>' : '');
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
          d.innerHTML = iconHTML('u:' + (u.type === 'villager' && u.sex === 'f' ? 'villager_f' : u.type), u.owner) + (u.def.cls === 'hero' ? '<span class="crown">👑</span>' : '');
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
          if (G.atBuildLimit(1, t) && G.ageOf(1) >= (G.BUILD_AGE[t] || 1)) { cmds.appendChild(btn('i:' + t + '|lock', G.BUILDINGS[t].name, `${G.buildLimit(1, t)}/${G.buildLimit(1, t)} built`, () => UI.alert(`You can only have ${G.buildLimit(1, t)} ${G.BUILDINGS[t].name}${G.buildLimit(1, t) > 1 ? 's' : ''}` + (G.buildLimit(1, t) < 2 ? ' (two in the Imperial Age)' : '')), true)); continue; }
          if (!G.canBuildType(1, t)) { cmds.appendChild(btn('i:' + t + '|lock', G.BUILDINGS[t].name, G.AGES[G.BUILD_AGE[t]].short + ' Age', () => UI.alert(`${G.BUILDINGS[t].name} needs the ${G.AGES[G.BUILD_AGE[t]].name}`), true)); continue; }
          const lim = G.buildLimit(1, t), cnt = lim ? ` · ${G.ents.filter(e => !e.dead && e.owner === 1 && e.type === t).length}/${lim} built` : '';
          cmds.appendChild(btn('i:' + t, G.BUILDINGS[t].name, costTxt(c) + cnt, () => { buildMenu = false; startPlace(t); }, !G.canAfford(1, c)));
        }
        cmds.appendChild(btn('i:back', 'Back', '', () => { buildMenu = false; panelKey = ''; refreshPanel(true); }));
        return;
      }
      if (vils.length && vils.every(v => v.task.t === 'idle')) {
        // idle villagers: suggest a job, one tap to send them
        const R = G.players[1].res, need = ['food', 'wood', 'gold', 'stone'].sort((a, b) => R[a] - R[b])[0];
        const JOBS = { food: ['i:food', 'Food'], wood: ['i:wood', 'Wood'], gold: ['i:gold', 'Gold'], stone: ['i:stone', 'Stone'] };
        const site = G.ents.filter(b => !b.dead && b.owner === 1 && b.kind === 'building' && b.type !== 'farm' && (!b.built || b.hp < b.maxHp * 0.95)).sort((a, b) => G.dist(a, vils[0]) - G.dist(b, vils[0]))[0];
        if (site) cmds.appendChild(btn('i:build', site.built ? 'Repair' : 'Help build', site.def.name, () => { G.cmdBuild(vils, site); outline(site, '#ffd34a'); panelKey = ''; }));
        for (const k of [need, ...['food', 'wood', 'gold', 'stone'].filter(x => x !== need)]) {
          const b = btn(JOBS[k][0], JOBS[k][1], k === need ? '<b class="need">Needed</b>' : '', () => sendTo(vils, k));
          if (k === need) b.classList.add('suggest');
          cmds.appendChild(b);
        }
      }
      if (vils.length) cmds.appendChild(btn('i:build', 'Build', '', () => { buildMenu = true; panelKey = ''; refreshPanel(true); }));
      // villagers shelter in a Town Center or Castle; soldiers only in a Castle
      const canHide = units.filter(u => G.ents.some(e => !e.dead && e.owner === 1 && G.canGarrison(u, e)));
      if (canHide.length) {
        const hasCastle = G.ents.some(e => !e.dead && e.owner === 1 && e.type === 'castle' && e.built);
        cmds.appendChild(btn('i:garrison', 'Garrison', hasCastle && canHide.some(u => u.type !== 'villager' && u.def.cls !== 'hero') ? 'Castle' : 'Town Center', () => {
          let full = 0;
          for (const u of canHide) {
            const b = G.nearest(u, e => (e.type === 'castle' || e.type === 'towncenter' || e.type === 'infirmary') && G.canGarrison(u, e));
            if (b) G.garrisonTo(u, b); else full++;
          }
          if (full) UI.alert(hasCastle ? 'No room left inside' : 'No room in a Town Center');
        }));
      }
      cmds.appendChild(btn('i:stop', 'Stop', '', () => { for (const u of units) { u.task = { t: 'idle' }; u.path = []; } }));
      // 🛡 Guard: tap a unit or building of yours, and these soldiers stay by it and fight off anything that comes near
      const guards = units.filter(u => u.type !== 'villager' && !u.def.heal);
      if (guards.length) cmds.appendChild(btn('i:guard', 'Guard', '', () => setMode('guard')));
      // stance: tap to cycle Aggressive → Defensive → Stand Ground → No Attack
      if (guards.length) {
        const ST = { aggressive: ['i:attack', 'Aggressive'], defensive: ['i:guard', 'Defensive'], stand: ['i:stop', 'Stand Ground'], passive: ['i:cancel', 'No Attack'] };
        const cur = G.stanceOf(guards[0]), mixed = guards.some(u => G.stanceOf(u) !== cur);
        cmds.appendChild(btn(ST[cur][0], 'Stance', mixed ? 'mixed' : ST[cur][1], () => {
          const next = G.STANCES[(G.STANCES.indexOf(cur) + 1) % G.STANCES.length];
          for (const u of guards) u.stance = next;
          UI.alert({ aggressive: '⚔ Aggressive: chases enemies anywhere', defensive: '🛡 Defensive: fights nearby enemies, then comes back', stand: '✋ Stand Ground: holds this spot, fights only what is in reach', passive: '🚫 No Attack: never fights back' }[next]);
          panelKey = ''; refreshPanel(true);
        }));
      }
      // 🏥 Heal: wounded soldiers go to the nearest Monastery and heal inside
      const hurt = guards.filter(u => u.hp < u.maxHp * 0.95 && !u.def.siege);
      if (hurt.length && G.ents.some(e => !e.dead && e.owner === 1 && e.type === 'infirmary' && e.built)) cmds.appendChild(btn('i:heal', 'Heal', 'Infirmary', () => {
        let full = 0;
        for (const u of hurt) { const b = G.nearest(u, e => e.type === 'infirmary' && G.canGarrison(u, e)); if (b) G.garrisonTo(u, b); else full++; }
        if (full) UI.alert('The Infirmary is full'); else if (G.sound) G.sound.play('command');
      }));
      // ⭐ Special: one button for every soldier's move
      const sold = units.filter(u => G.specialOf && G.specialOf(u));
      if (sold.length) {
        const kinds = [...new Set(sold.map(G.specialOf))], names = kinds.map(k => G.SPECIALS[k].name);
        const b = btn('i:special', names.length > 2 ? 'Special ×' + names.length : names.join(' + '), '<span class="sp-cool"></span>', () => {
          const n = G.useSpecial(sold);
          if (!n) UI.alert(sold.some(G.specialReady) ? 'Nothing in range to use it on yet' : 'Still recharging');
          else { UI.buzz(25); if (G.sound) G.sound.play('command'); }
          spCool();
        });
        b.classList.add('special'); b.dataset.tip = kinds.map(k => `${G.SPECIALS[k].icon} ${G.SPECIALS[k].name}: ${G.SPECIALS[k].desc}`).join('\n');
        cmds.appendChild(b); spCool();
      }
      // formation, for a group with soldiers in it: a card with a live preview of this army in each shape
      if (units.filter(u => u.type !== 'villager').length >= 2) {
        const cur = units[0].form || G.players[1].formation || 'line';
        cmds.appendChild(btn('i:army', 'Formation', FORM_NAMES[cur], () => openForm(units)));
      }
      if (vils.length && vils.some(v => v.carry)) cmds.appendChild(btn('i:dropoff', 'Drop off', '', () => {
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
          if (!G.canTrainType(1, t)) { cmds.appendChild(btn('u:' + (t === 'villager' ? 'villagers' : t) + '|lock', G.UNITS[t].name, G.AGES[G.UNIT_AGE[t]].short + ' Age', () => UI.alert(`${G.UNITS[t].name} needs the ${G.AGES[G.UNIT_AGE[t]].name}`), true)); continue; }
          const trainOnce = () => {
            for (const b of sel) {
              const r = G.train(b, t);
              if (r === 'pop') { UI.alert('Need more houses!'); return false; }
              if (r === 'busy') { UI.alert(b.research ? 'Busy researching' : 'Town Center is advancing to the next Age'); return false; }
              if (r === 'res') { UI.alert('Not enough resources'); flashCost(c); return false; }
            }
            panelKey = ''; return true;
          };
          const tb = btn('u:' + (t === 'villager' ? 'villagers' : t), G.unitDef(1, t).name, costTxt(c), trainOnce, !G.canAfford(1, c));
          tb.hold5 = () => { let n = 0; for (let i = 0; i < 5; i++) { if (!trainOnce()) break; n++; } if (n) UI.alert(`Queued ${n} × ${G.unitDef(1, t).name}`); };
          cmds.appendChild(tb);
        }
        cmds.appendChild(btn('i:rally', 'Rally point', '', () => setMode('rally')));
      }
      if (resPage) {
        if (e.research) {
          const rd = e.research.kind === 'up' ? G.UPGRADES[e.research.id] : G.TECHS[e.research.id];
          cmds.appendChild(btn('i:cancel', 'Cancel', rd.name, () => { G.cancelResearch(e); panelKey = ''; }));
        } else for (const r of res) {
          const ic = r.kind === 'up' ? 'u:' + r.def.line + '@' + r.def.tier + (r.why ? '|lock' : '') : 't:' + r.id + (r.why ? '|lock' : '');
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
          const t = G.TECHS[id], b = btn('t:' + id, t.name, '✓ done', () => UI.alert(`${t.name}: ${t.desc || 'researched'}`), true);
          b.classList.add('research', 'done'); cmds.appendChild(b);
        }
      }
      if (e.type === 'towncenter' && e.owner === 1) {
        const nx = G.AGES[G.ageOf(1) + 1];
        if (e.aging) cmds.appendChild(btn('i:cancel', 'Cancel', G.AGES[e.aging.to].short + ' Age', () => { G.cancelAge(e); panelKey = ''; }));
        else if (nx) {
          const why = G.ageBlock(1, e);
          cmds.appendChild(btn('i:ageup', nx.short + ' Age', why ? 'locked' : costTxt(G.ageCost(1, G.ageOf(1) + 1)), () => {
            const r = G.advanceAge(e);
            if (r === 'res') { UI.alert('Not enough resources'); flashCost(G.ageCost(1, G.ageOf(1) + 1)); }
            else if (!r) UI.alert(G.ageBlock(1, e) || 'Cannot advance now');
            else UI.alert(`Advancing to the ${nx.name}…`);
            panelKey = '';
          }, !!why || !G.canAfford(1, G.ageCost(1, G.ageOf(1) + 1))));
        }
      }
      if (e.def.garrison && e.owner === 1) {
        cmds.appendChild(btn('i:bell', 'Ring bell', 'all villagers in', () => { G.ringBell(1); UI.alert('Villagers, take shelter!'); panelKey = ''; }));
        const n = (e.garrison || []).length;
        if (n) cmds.appendChild(btn('i:ungarrison', 'Ungarrison', n + ' inside', () => { for (const b of sel) if (b.garrison) G.ungarrison(b); panelKey = ''; }));
      }
    }
    if (e.kind === 'building' && e.owner === 1) {
      // a finished wall piece can become a gate where it stands
      if (own && e.def.wall && e.type !== 'gate' && e.built && sel.length === 1) {
        const gc = G.buildCost(1, 'gate');
        if (!G.canBuildType(1, 'gate')) cmds.appendChild(btn('i:gate|lock', 'Make gate', G.AGES[G.BUILD_AGE.gate].short + ' Age', () => UI.alert(`Gates need the ${G.AGES[G.BUILD_AGE.gate].name}`), true));
        else cmds.appendChild(btn('i:gate', 'Make gate', costTxt(gc), () => {
          const r = G.wallToGate(e);
          if (r === 'cost') { UI.alert('Not enough resources'); flashCost(gc); return; }
          if (typeof r === 'string') { UI.alert("Can't make a gate here"); return; }
          select([r], false); UI.alert('Gate laid out: a villager is on the way to build it'); if (G.sound) G.sound.play('place');
        }, !G.canAfford(1, gc)));
      }
      const del = btn('i:delete', 'Delete', '', () => {
        const nope = G.deleteBlock && G.deleteBlock(e); if (nope) { UI.alert(nope); return; }
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
    if (G.players && G.players[1] && !G.over && !G.paused && G.ents.length) { spotCheck(); gameTips(dt); }
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
      if (Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > (gesture.mouse ? 9 : 16)) {
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
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;   // typing a name, not commanding
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
  UI._enterGame = enterGame; UI._toMenu = toMenu; UI._prefs = prefs; UI._savePrefs = savePrefs; UI._applyPrefs = applyPrefs; UI._refreshContinue = refreshContinue; UI._showDyn = k => showDyn(k); UI._lastConfig = () => lastConfig;
  UI._tap = tap; UI._startSkirmish = startSkirmish; UI._setup = setup; UI._show = show; UI._select = select; UI._startPlace = startPlace; UI._confirmPlace = confirmPlace; UI._moveGhost = moveGhost;
})();
