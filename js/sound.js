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
  S.wake = function () {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  };

  function load() {
    fetch('assets/sound/manifest.json').then(r => r.ok ? r.json() : null).then(m => {
      if (!m) return;                    // no pack yet: stay silent
      manifest = m;
      for (const key in m) {
        if (!SOUNDS[key]) continue;      // ignore anything the game has no use for
        const files = [].concat(m[key]);
        files.forEach((f, i) => {
          fetch('assets/sound/' + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
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
    let gain = def.vol;
    if (x !== undefined && G.toScreen) {
      if (G.isVisible && !G.isVisible(x, y) && !G.revealAll) return;   // not seen, not heard
      const s = G.toScreen(x, y);
      const off = Math.max(0, Math.max(-s.x, s.x - G.W, -s.y, s.y - G.H));
      if (off > 700) return;
      gain *= 1 - Math.min(0.85, off / 800);
    }
    last[key] = now;
    const src = ctx.createBufferSource(); src.buffer = buf;
    src.playbackRate.value = 0.94 + Math.random() * 0.12;   // so repeats don't sound stamped
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(buses[def.bus] || master);
    src.start();
  };

  S.setVolume = function (v) {
    S.volume = v;
    if (master) master.gain.value = v;
  };
  S.setEnabled = function (on) {
    S.enabled = !!on;
    if (on) S.wake();
  };
  S.loaded = () => ready;
})();
