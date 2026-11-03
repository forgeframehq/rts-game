// Learn to Play: a short guided match. The player leads the Britons against a small Frankish
// outpost on a small map. A coach card at the top gives one task at a time, a gold ring and
// arrow mark what to tap in the world, and the matching button in the panel glows. Each step
// moves on by itself the moment the player has done it. Resources are topped up as needed so
// the lesson never stalls on an empty stockpile.
(function () {
  const T = G.tutorial = { on: false, i: 0 };
  const P = 1, FOE = 2;
  const mine = pred => G.ents.filter(e => !e.dead && e.owner === P && pred(e));
  const count = t => mine(e => e.type === t).length;
  const vils = () => mine(e => e.type === 'villager');
  const tc = () => mine(e => e.type === 'towncenter')[0];
  const near = (from, pred, r) => G.nearest(from, pred, r || 30);
  const grant = c => { const R = G.players[P].res; for (const k in c) R[k] = Math.max(R[k], c[k]); };
  const gathering = rt => vils().some(v => (v.task.t === 'gather' && v.task.rtype === rt) || (v.task.t === 'return' && v.task.back && v.task.back.rtype === rt));
  let start = {};

  // text: what to do. target(): where the ring goes. glow: panel button label to light up.
  // done(): true once the player has done it. next: a "Next" button instead of a check.
  const STEPS = [
    { title: 'Welcome, my liege', next: true,
      text: 'You lead the <b>Britons</b>. This short match teaches the basics. Drag the map to look around and use <b>+</b> / <b>−</b> to zoom.' },
    { title: 'Select a villager',
      text: 'Tap one of your <b>villagers</b> to select it.',
      target: () => vils()[0], done: () => G.selection.some(e => e.type === 'villager') },
    { title: 'Gather food',
      text: 'With the villager selected, tap the <b>berry bush</b>. Villagers gather and carry food back to the Town Center.',
      target: () => near(tc(), e => e.kind === 'res' && e.type === 'berry'), done: () => gathering('berry') },
    { title: 'Gather wood',
      text: 'Select another villager and tap a <b>tree</b> to chop wood.',
      target: () => near(tc(), e => e.kind === 'res' && e.type === 'tree'), done: () => gathering('tree') },
    { title: 'Train a villager',
      text: 'Tap your <b>Town Center</b>, then <b>Villager</b>. More villagers means a bigger economy: keep the Town Center busy all game!',
      target: () => tc(), glow: 'Villager', enter: () => grant({ food: 100 }),
      done: () => vils().length > start.vils || (tc() && tc().queue.some(q => q.type === 'villager')) },
    { title: 'Build a House',
      text: 'Each House lets you have 5 more people. Select a villager, tap <b>Build</b>, then <b>House</b>, and tap the ground to place it.',
      glow: ['Build', 'House'], enter: () => grant({ wood: 60 }), done: () => count('house') > start.house },
    { title: 'Build a Lumber Camp',
      text: 'Woodcutters walk all the way home with every load. Build a <b>Lumber Camp</b> right next to the trees so they walk less.',
      target: () => near(tc(), e => e.kind === 'res' && e.type === 'tree'), glow: ['Build', 'Lumber Camp'],
      enter: () => grant({ wood: 120 }), done: () => count('lumbercamp') > 0 },
    { title: 'Construction',
      text: 'Your villagers are building. <b>More builders finish faster</b>: select another villager and tap the building site to help.',
      target: () => mine(e => e.kind === 'building' && !e.built)[0],
      done: () => mine(e => (e.type === 'house' || e.type === 'lumbercamp') && !e.built).length === 0 },
    { title: 'Build a Barracks',
      text: 'Time for soldiers. Select a villager and build a <b>Barracks</b> near your Town Center.',
      glow: ['Build', 'Barracks'], enter: () => grant({ wood: 200 }),
      done: () => mine(e => e.type === 'barracks' && e.built).length > 0,
      hint: () => count('barracks') ? 'Waiting for the Barracks to finish…' : null },
    { title: 'Train soldiers',
      text: 'Tap the <b>Barracks</b> and train <b>3 Swordsmen</b>. Tap the button three times to queue them.',
      target: () => mine(e => e.type === 'barracks')[0], glow: 'Swordsman', enter: () => grant({ food: 220, gold: 80 }),
      done: () => count('militia') >= 3, hint: () => `Swordsmen ready: ${count('militia')} / 3` },
    { title: 'Defend your town!',
      text: 'Frankish raiders are coming! Tap <b>⚔️</b> on the left to select your whole army, then tap an <b>enemy</b> to attack.',
      side: 'btn-army', enter: () => spawnRaid(),
      target: () => raiders()[0], done: () => !raiders().length,
      hint: () => raiders().length ? `Raiders left: ${raiders().length}` : null },
    { title: 'Know your soldiers', next: true,
      text: 'Every soldier has a counter. <b>Spearmen</b> beat cavalry, <b>Archers</b> beat foot soldiers from range, and <b>Knights</b> run down archers. Mix your army!' },
    { title: 'Advance through the Ages', next: true,
      text: 'In a full game, build up your economy and tap <b>Feudal Age</b> on the Town Center. Each new Age unlocks buildings, soldiers and upgrades at the Blacksmith and University.' },
    { title: 'Destroy the outpost',
      text: 'Now take the fight to them. Select your army and attack the <b>Frankish outpost</b>. Swordsmen are good at knocking buildings down.',
      side: 'btn-army', enter: () => { grant({ food: 120, gold: 40 }); },
      target: () => G.ents.find(e => !e.dead && e.owner === FOE && e.kind === 'building'),
      done: () => !G.players[FOE].alive }
  ];

  let raidIds = [];
  const raiders = () => raidIds.map(id => G.byId.get(id)).filter(e => e && !e.dead);
  function spawnRaid() {
    const o = T.outpost, home = tc(); if (!o || !home) return;
    raidIds = [];
    for (let k = 0; k < 2; k++) {
      const f = G.nearestFree(Math.round(o.x - 3 + k), Math.round(o.y + 3), 6);
      const u = G.addUnit('militia', FOE, f.x + 0.5, f.y + 0.5);
      u.hp = u.maxHp = 35;   // weaker than the player's swordsmen: a first fight to win
      raidIds.push(u.id);
    }
    G.cmdAttack(raiders(), home); for (const u of raiders()) u.task.forced = true;
    if (G.sound) G.sound.play('attacked');
  }

  T.start = function () {
    G.clearSave();
    G.newGame({ players: [{ civ: 'britons' }, { civ: 'franks', ai: 'easy' }], size: 'small', res: 'standard', reveal: 'explored', shape: 'rect', mode: 'conquest', seed: 4242 });
    G.ais = [];                                           // the outpost does not play
    const home = tc(), foeTc = G.ents.find(e => e.owner === FOE && e.type === 'towncenter');
    // the outpost: a Barracks and a House part way between the two towns
    const ox = Math.round(home.x + (foeTc.x - home.x) * 0.45), oy = Math.round(home.y + (foeTc.y - home.y) * 0.45);
    const spot = (s, x, y) => { for (let r = 0; r < 12; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (G.areaFree(x + i - 1, y + j - 1, s + 2)) return { x: x + i, y: y + j }; return { x, y }; };
    const b1 = spot(3, ox, oy); const bar = G.addBuilding('barracks', FOE, b1.x, b1.y, true);
    const h1 = spot(2, ox + 4, oy - 1); G.addBuilding('house', FOE, h1.x, h1.y, true);
    T.outpost = bar;
    for (const e of G.ents.slice()) if (!e.dead && e.owner === FOE && (e.type === 'towncenter' || e.kind === 'unit')) G.kill(e);
    G.corpses = []; G.effects = [];
    G.buildGround();
    T.on = true; T.last = true; T.i = -1; document.body.classList.add('tut-on');
    start = { vils: vils().length, house: count('house') };
    if (G.camera) G.camera.focus(home.x + 1, home.y + 3);
    go(0);
  };
  T.stop = function () { T.on = false; document.body.classList.remove('tut-on'); UI_glow(null); $('tut').classList.add('hidden'); };

  const $ = id => document.getElementById(id);
  function UI_glow(lbl) { if (G.ui) G.ui.tutGlow = lbl; }
  function go(i) {
    T.i = i; const s = STEPS[i]; if (!s) return;
    if (s.enter) s.enter();
    if (s.title === 'Train a villager') start.vils = vils().length;
    const card = $('tut'); card.classList.remove('hidden');
    $('tut-step').textContent = `Step ${i + 1} of ${STEPS.length}`;
    $('tut-title').textContent = s.title;
    $('tut-text').innerHTML = s.text;
    $('tut-next').classList.toggle('hidden', !s.next);
    $('tut-hint').textContent = '';
    card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
    document.querySelectorAll('.sidebtn.tut-glow').forEach(b => b.classList.remove('tut-glow'));
    if (s.side) $(s.side).classList.add('tut-glow');
    if (G.sound && i) G.sound.play('research');
  }
  function advance() { go(T.i + 1); }

  // called every frame from the game loop
  T.update = function () {
    if (!T.on) return;
    const s = STEPS[T.i]; if (!s) return;
    // which panel button to light: a multi-step path (Build → House) lights the next one along
    let g = s.glow || null;
    if (Array.isArray(g)) g = document.querySelector('#cmds .cmd .lb') && [...document.querySelectorAll('#cmds .cmd .lb')].some(l => l.textContent === g[1]) ? g[1] : g[0];
    UI_glow(g);
    if (s.hint) { const h = s.hint(); $('tut-hint').textContent = h || ''; }
    if (!s.next && s.done && s.done()) advance();
  };
  // gold ring and bouncing arrow over the thing to tap
  G.drawTutorial = function (ctx) {
    if (!T.on || G.over) return;
    const s = STEPS[T.i]; if (!s || !s.target) return;
    const t = s.target(); if (!t) return;
    const sz = t.size || 1, cx = t.kind === 'building' ? t.tx + sz / 2 : t.x, cy = t.kind === 'building' ? t.ty + sz / 2 : t.y;
    const p = G.toScreen(cx, cy), z = G.camera.zoom, ph = performance.now() / 1000;
    const r = (14 + sz * 18) * z * (1 + 0.08 * Math.sin(ph * 5));
    ctx.save();
    ctx.strokeStyle = 'rgba(255,214,90,0.95)'; ctx.lineWidth = 3; ctx.shadowColor = '#ffcc33'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    const ay = p.y - (30 + sz * 26) * z - 8 * Math.abs(Math.sin(ph * 4));
    ctx.fillStyle = '#ffd65a'; ctx.beginPath(); ctx.moveTo(p.x, ay + 18); ctx.lineTo(p.x - 12, ay); ctx.lineTo(p.x - 5, ay); ctx.lineTo(p.x - 5, ay - 16);
    ctx.lineTo(p.x + 5, ay - 16); ctx.lineTo(p.x + 5, ay); ctx.lineTo(p.x + 12, ay); ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  document.addEventListener('DOMContentLoaded', () => {});
  window.addEventListener('load', () => {
    $('tut-next').onclick = e => { e.stopPropagation(); advance(); };
    $('tut-skip').onclick = e => { e.stopPropagation(); T.stop(); };
  });
})();
