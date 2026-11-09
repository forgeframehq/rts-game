// Sound. Everything is optional: with no files in assets/sound/ the game is silent and
// behaves exactly as before, so a missing pack can never break a battle.
//
// Files are plain .ogg/.mp3/.wav in assets/sound/, named after the keys in SOUNDS below.
// Drop them in, list them in assets/sound/manifest.json, and they play. See that file.
(function () {
  const S = {};
  G.sound = S;

  // key -> how it behaves. vol is relative; throttle is the least time between two of the
  // same sound, which is what stops twenty archers loosing at once from becoming a bang.
  const SOUNDS = {
    // interface
    click:      { vol: 0.5, throttle: 0.04, bus: 'ui' },
    select:     { vol: 0.5, throttle: 0.06, bus: 'ui' },
    command:    { vol: 0.5, throttle: 0.06, bus: 'ui' },
    error:      { vol: 0.6, throttle: 0.25, bus: 'ui' },
    open:       { vol: 0.45, throttle: 0.15, bus: 'ui' },
    back:       { vol: 0.45, throttle: 0.15, bus: 'ui' },
    toggle:     { vol: 0.45, throttle: 0.04, bus: 'ui' },
    coin:       { vol: 0.5, throttle: 0.3, bus: 'ui' },
    // villagers at work
    chop:       { vol: 0.45, throttle: 0.14, bus: 'work' },
    mine:       { vol: 0.45, throttle: 0.14, bus: 'work' },
    farm:       { vol: 0.4,  throttle: 0.2,  bus: 'work' },
    build:      { vol: 0.5,  throttle: 0.14, bus: 'work' },
    place:      { vol: 0.6,  throttle: 0.1,  bus: 'work' },
    complete:   { vol: 0.7,  throttle: 0.1,  bus: 'work' },
    // battle
    sword:      { vol: 0.5, throttle: 0.07, bus: 'combat' },
    spear:      { vol: 0.5, throttle: 0.07, bus: 'combat' },
    bow:        { vol: 0.45, throttle: 0.06, bus: 'combat' },
    bolt:       { vol: 0.45, throttle: 0.06, bus: 'combat' },
    axethrow:   { vol: 0.5, throttle: 0.08, bus: 'combat' },
    ram:        { vol: 0.8, throttle: 0.3,  bus: 'combat' },
    trebuchet:  { vol: 0.8, throttle: 0.4,  bus: 'combat' },
    stonehit:   { vol: 0.8, throttle: 0.3,  bus: 'combat' },
    die:        { vol: 0.5, throttle: 0.12, bus: 'combat' },
    buildingdown: { vol: 0.9, throttle: 0.4, bus: 'combat' },
    heal:       { vol: 0.4, throttle: 0.5,  bus: 'combat' },
    slash:      { vol: 0.5, throttle: 0.07, bus: 'combat' },
    armor:      { vol: 0.45, throttle: 0.1, bus: 'combat' },
    arrowhit:   { vol: 0.4, throttle: 0.08, bus: 'combat' },
    horse:      { vol: 0.5, throttle: 1.5, bus: 'combat' },
    gallop:     { vol: 0.5, throttle: 1.2, bus: 'combat' },
    charge:     { vol: 0.8, throttle: 2.0, bus: 'combat' },
    march:      { vol: 0.4, throttle: 2.5, bus: 'combat' },
    fire:       { vol: 0.35, throttle: 3.0, bus: 'combat' },
    special:    { vol: 0.8, throttle: 1.0, bus: 'combat' },
    ack:        { vol: 0.55, throttle: 1.2, bus: 'ui' },
    ack_f:      { vol: 0.55, throttle: 1.2, bus: 'ui' },
    die_f:      { vol: 0.5, throttle: 0.12, bus: 'combat' },
    capture:    { vol: 0.9, throttle: 2.0, bus: 'alert' },
    record:     { vol: 0.9, throttle: 2.0, bus: 'alert' },
    // moments
    train:      { vol: 0.5, throttle: 0.1, bus: 'alert' },
    research:   { vol: 0.6, throttle: 0.2, bus: 'alert' },
    ageup:      { vol: 0.9, throttle: 1.0, bus: 'alert' },
    bell:       { vol: 0.8, throttle: 1.0, bus: 'alert' },
    attacked:   { vol: 0.8, throttle: 4.0, bus: 'alert' },
    kingdown:   { vol: 1.0, throttle: 2.0, bus: 'alert' },
    victory:    { vol: 0.9, throttle: 5.0, bus: 'alert' },
    defeat:     { vol: 0.9, throttle: 5.0, bus: 'alert' }
  };
  S.SOUNDS = SOUNDS;

  let ctx = null, master = null, buses = {}, buffers = {}, manifest = null, ready = false;
  const last = {};                       // key -> when it last played
  S.enabled = true;
  S.volume = 0.7;

  // Phones refuse to make a sound until the player has touched the screen, so the audio
  // context is built on the first real gesture rather than at load.
  function init() {
    if (ctx || !window.AudioContext && !window.webkitAudioContext) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = S.volume; master.connect(ctx.destination);
    for (const b of ['ui', 'work', 'combat', 'alert']) {
      buses[b] = ctx.createGain(); buses[b].gain.value = 1; buses[b].connect(master);
    }
    load();
  }
  S.loadedKeys = () => Object.keys(buffers).length;
  S.wake = function () {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    S.startMusic();                    // the first touch is also what lets music begin
  };

  function load() {
    fetch('assets/sound/manifest.json').then(r => r.ok ? r.json() : null).then(m => {
      if (!m) return;                    // no pack yet: stay silent
      manifest = m;
      if (m.music) lists.peace = [].concat(m.music);
      if (m.battleMusic) lists.battle = [].concat(m.battleMusic);
      if (m.menuMusic) lists.menu = [].concat(m.menuMusic);
      if (m.civMusic) civMusic = m.civMusic;
      general = lists.peace.slice();
      if (S.musicLoaded()) {
        for (const k in lists) { order[k] = []; at[k] = 0; }   // shuffled on first pick, never opening on last time's track
        if (!lists.menu.length) mood = 'peace';
        S.startMusic();
      }
      // every short effect comes in one bundle (tools/pack_sfx.py); single files are the fallback
      const packed = fetch('assets/sound/sfx_pack.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
      const bytes = f => packed.then(P => P[f] ? Uint8Array.from(atob(P[f]), c => c.charCodeAt(0)).buffer
        : fetch('assets/sound/' + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject()));
      for (const key in m) {
        if (!SOUNDS[key]) continue;      // ignore anything the game has no use for
        const files = [].concat(m[key]);
        files.forEach((f, i) => {
          bytes(f)
            .then(b => ctx.decodeAudioData(b))
            .then(buf => { (buffers[key] = buffers[key] || [])[i] = buf; ready = true; })
            .catch(() => {});            // a missing or broken file is simply never heard
        });
      }
    }).catch(() => {});
  }

  // play a named sound. at (x, y) in tiles makes it quieter off-screen and silent in the fog.
  S.play = function (key, x, y) {
    if (!S.enabled || !ctx || !ready) return;
    const def = SOUNDS[key]; if (!def) return;
    const now = ctx.currentTime;
    if (last[key] !== undefined && now - last[key] < (def.throttle || 0)) return;
    const list = buffers[key]; if (!list || !list.length) return;
    const buf = list[(Math.random() * list.length) | 0]; if (!buf) return;
    let gain = def.vol * (0.88 + Math.random() * 0.24);   // a little louder or softer every time
    if (x !== undefined && G.toScreen) {
      if (G.isVisible && !G.isVisible(x, y) && !G.revealAll) return;   // not seen, not heard
      const s = G.toScreen(x, y);
      const off = Math.max(0, Math.max(-s.x, s.x - G.W, -s.y, s.y - G.H));
      if (off > 700) return;
      gain *= 1 - Math.min(0.85, off / 800);
    }
    last[key] = now;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = 0.93 + Math.random() * 0.14;   // a little higher or lower too, so repeats never sound stamped
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(buses[def.bus] || master);
    src.start();
  };

  // ---- ambience: a quiet looping bed for each kind of map, under the music ----
  const AMB = { grasslands: 'meadow', goldrush: 'meadow', fortress: 'meadow', blackforest: 'forest', greatlake: 'river', twinrivers: 'river', desertoasis: 'desert', highlands: 'highland' };
  let amb = null;
  S.ambient = function (map) {
    const want = map ? 'assets/sound/sfx/amb_' + (AMB[map] || 'meadow') + '_1.mp3' : null;
    if (amb && amb.dataset.src === want) return;
    if (amb) { amb.pause(); amb = null; }
    if (!want || !S.enabled) return;
    amb = new Audio(want); amb.dataset.src = want; amb.loop = true; amb.volume = Math.min(1, 0.1 * S.volume);
    const p = amb.play(); if (p && p.catch) p.catch(() => {});
  };
  // ---- music ----------------------------------------------------------------
  // Played through an <audio> element rather than the audio graph on purpose: decoding a
  // three-minute track into a buffer costs about 60 MB of memory, which is not something
  // to spend on a phone. An element streams it instead.
  //
  // The tracks are normalised to about -24 LUFS by tools/prep_music.py, well under the
  // -16 they are mastered at, and the volume below takes another step off that, so the
  // music sits behind the game rather than over it.
  // Two moods, two playlists, and a crossfade between them: the peaceful set plays while
  // the town works, and the battle set takes over when the player is in a fight. Two
  // elements exist so one can come up while the other goes down, rather than cutting.
  const lists = { menu: [], peace: [], battle: [] };
  // each dynasty has its own peaceful themes: a match opens on one of them, then shuffles
  // through the general peaceful music and that dynasty's other theme
  let civMusic = {}, general = [], civFirst = null;
  S._music = () => ({ peace: lists.peace.slice(), civFirst, playing: deck[cur] && deck[cur].getAttribute('src') });
  S.setCiv = function (civ) {
    const own = (civMusic[civ] || []);
    if (!general.length && lists.peace.length) general = lists.peace.filter(f => !Object.values(civMusic).flat().includes(f));
    lists.peace = general.concat(own);
    order.peace = []; at.peace = 0;
    civFirst = own.length ? own[Math.floor(Math.random() * own.length)] : null;
  };
  let deck = [], cur = 0;
  let order = { menu: [], peace: [], battle: [] }, at = { menu: 0, peace: 0, battle: 0 };
  let mood = 'menu', scene = 'menu', fades = [null, null], lastFight = -1e9, moodTimer = null;
  S.musicEnabled = true;
  // 0.75 against files normalised to -24.4 LUFS puts the music out at about -26.9 LUFS:
  // present on a phone speaker, but a clear step under the game. Soft is -31.3.
  S.musicVolume = 0.5;
  const CALM_AFTER = 12;      // seconds without a blow before the fighting is over
  const CROSSFADE = 5;      // seconds to hand over between moods

  function shuffle(n) {              // play in a different order each session
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  // a set with nothing in it falls back to the peaceful one, so a half-filled pack still plays
  function pick(m) {
    if (m === 'peace' && civFirst) { const f = civFirst; civFirst = null; if (lists.peace.length) { order.peace = shuffle(lists.peace.length).filter(i => lists.peace[i] !== f); at.peace = 0; } return f; }
    const key = lists[m].length ? m : 'peace';
    const l = lists[key];
    if (!l.length) return null;
    if (at[key] >= order[key].length) {
      order[key] = shuffle(l.length); at[key] = 0;
      // never open a session on the track the last one opened on
      let lastF = null; try { lastF = localStorage.getItem('dod.lastTrack.' + key); } catch (e) { /* none */ }
      if (l.length > 1 && l[order[key][0]] === lastF) order[key].push(order[key].shift());
      try { localStorage.setItem('dod.lastTrack.' + key, l[order[key][0]]); } catch (e) { /* ignore */ }
    }
    return l[order[key][at[key]++]];
  }
  function makeDeck(i) {
    if (deck[i]) return deck[i];
    const a = new Audio();
    a.preload = 'none';
    // a few seconds before a track ends the next one fades in over it, so there is never a hard stop
    a.addEventListener('timeupdate', () => { if (i === cur && !a.handing && a.duration && a.duration - a.currentTime < 6) { a.handing = true; play(mood, 6); } });
    a.addEventListener('playing', () => { a.handing = false; });
    a.addEventListener('ended', () => { if (i === cur && !a.handing) play(mood, 4); });
    a.addEventListener('error', () => { if (i === cur) setTimeout(() => play(mood, 1.5), 2000); });
    deck[i] = a;
    return a;
  }
  // ramp an element's own volume, since music is not in the audio graph
  function fade(i, to, secs, stop) {
    const a = deck[i]; if (!a) return;
    if (fades[i]) clearInterval(fades[i]);
    const from = a.volume, t0 = performance.now(), ms = Math.max(1, secs * 1000);
    fades[i] = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      const e = k * k * (3 - 2 * k);   // ease in and out: no sudden jump at either end
      a.volume = Math.max(0, Math.min(1, from + (to - from) * e));
      if (k >= 1) { clearInterval(fades[i]); fades[i] = null; if (stop) { a.pause(); a.removeAttribute('src'); a.load(); } }
    }, 50);
  }
  // the town music sits furthest back: it plays for most of a match and must never crowd it
  const MOOD_VOL = { menu: 1, peace: 0.95, battle: 1 };
  function vol(m) { return S.musicEnabled ? S.musicVolume * (MOOD_VOL[m || mood] || 1) : 0; }

  // start a track of this mood on the free deck, handing over from whatever is playing
  function play(m, fadeIn) {
    if (!S.musicEnabled) return;
    const file = pick(m); if (!file) return;
    const other = cur, next = 1 - cur;
    const a = makeDeck(next);
    a.src = 'assets/sound/music/' + file;
    a.volume = 0;
    // hand over cleanly: the old track fades right down first, then the new one rises,
    // rather than two pieces of music playing over each other in the middle
    const busy = deck[other] && !deck[other].paused && deck[other].volume > 0.01;
    if (busy) fade(other, 0, fadeIn * 0.6, true);
    const start = () => {
      if (cur !== next || a.getAttribute('src') !== 'assets/sound/music/' + file) return;   // superseded
      // only one piece of music at a time: whatever else is still sounding goes, even if a
      // quick run of scene changes (Restart passes through the menu) left it behind
      deck.forEach((d, j) => { if (j !== next && d && !d.paused && !fades[j]) fade(j, 0, 0.8, true); });
      if (S.away) return;   // the app went to the background before this track began; coming back starts it
      const pr = a.play();
      if (pr && pr.catch) pr.catch(() => {});   // refused until a gesture; wake() retries
      fade(next, vol(m), fadeIn);
    };
    cur = next;
    if (busy) setTimeout(start, fadeIn * 450); else start();
  }

  function setMood(m) {
    if (m === mood) return;
    mood = m;
    if (S.musicEnabled && deck.length) play(m, CROSSFADE);
  }
  // called from the game whenever the player strikes or is struck
  S.fighting = function () {
    if (scene !== 'game') return;
    lastFight = (typeof G !== 'undefined' && G.time) || (performance.now() / 1000);
    if (mood !== 'battle' && lists.battle.length) setMood('battle');
  };
  // the title screen has its own theme; a battle is forgotten on the way back out to it
  S.setScene = function (which) {
    if (scene === which) return;
    scene = which;
    lastFight = -1e9;
    setMood(which === 'menu' ? 'menu' : 'peace');
  };
  function watchMood() {
    if (moodTimer) return;
    moodTimer = setInterval(() => {
      const now = (typeof G !== 'undefined' && G.time) || (performance.now() / 1000);
      if (scene === 'game' && mood === 'battle' && now - lastFight > CALM_AFTER) setMood('peace');
    }, 1000);
  }

  // a film is playing: the music steps aside and comes back when it ends
  S.hush = function (on) {
    S.hushed = !!on;
    if (on) deck.forEach((a, i) => { if (a && !a.paused) { fade(i, 0, 0.6); setTimeout(() => { if (S.hushed) a.pause(); }, 700); } });
    else S.startMusic();
  };
  S.startMusic = function () {
    if (!S.musicEnabled || !S.musicLoaded() || S.hushed) return;
    watchMood();
    const a = deck[cur];
    if (a && a.src) { if (a.paused) { a.play().catch(() => {}); fade(cur, vol(), 4.0); } return; }
    play(mood, 7);   // the first music rises slowly from silence
  };
  S.setMusicEnabled = function (on) {
    S.musicEnabled = !!on;
    if (!on) { deck.forEach((a, i) => a && fade(i, 0, 1.0)); }
    else S.startMusic();
  };
  S.setMusicVolume = function (v) {
    S.musicVolume = v;
    const a = deck[cur];
    if (a && !a.paused) fade(cur, vol(), 1.2);
  };
  // a game in a hidden tab should not be playing music at someone
  // ...nor ambience or effects: everything goes quiet when the app is in the background
  // Both music decks are silenced, not just the current one: leaving mid-crossfade used to
  // leave the outgoing track playing in the background.
  S.away = false;
  function setAway(away) {
    if (away === S.away) return;
    S.away = away;
    if (away) {
      deck.forEach((d, j) => { if (fades[j]) { clearInterval(fades[j]); fades[j] = null; } if (d) d.pause(); });
      if (amb) amb.pause();
      if (ctx && ctx.state === 'running') ctx.suspend();
    } else {
      // only the current track comes back, rising from silence
      deck.forEach((d, j) => { if (d && j !== cur) { d.volume = 0; d.pause(); } });
      const a = deck[cur];
      if (a && S.musicEnabled && a.getAttribute('src') && !S.hushed) { a.volume = 0; a.play().catch(() => {}); fade(cur, vol(), 1.5); }
      if (amb && S.enabled) amb.play().catch(() => {});
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }
  }
  document.addEventListener('visibilitychange', () => setAway(document.hidden));
  window.addEventListener('pagehide', () => setAway(true));
  // In the Android app, Capacitor reports the app going to the background directly; the
  // WebView's visibility event alone was not reliable there.
  try {
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App && App.addListener) App.addListener('appStateChange', st => setAway(!st.isActive));
  } catch (e) { /* not in the app */ }

  S.setVolume = function (v) {
    S.volume = v;
    if (master) master.gain.value = v;
    if (amb) amb.volume = Math.min(1, 0.1 * v);
  };
  S.setEnabled = function (on) {
    S.enabled = !!on;
    if (on) S.wake();
  };
  S.loaded = () => ready;
  S.musicLoaded = () => lists.menu.length + lists.peace.length + lists.battle.length;
  // what is playing, for the options screen and for checking the mix
  S.nowPlaying = () => (deck[cur] && deck[cur].src)
    ? { track: deck[cur].src.split('/').pop(), mood, paused: deck[cur].paused,
        volume: +deck[cur].volume.toFixed(3) }
    : null;
  // Fetch the track list as the page opens, not on the first tap: otherwise the first tap is
  // usually Quick Match, the game has begun before the list arrives, and the title theme is
  // skipped for the town music. (The audio itself still waits for a tap, as browsers require.)
  S.preload = load;
})();
