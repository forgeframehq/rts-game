// Screens around a match: the briefing before it, objectives during it, the pause menu,
// saved games, and the AoE2-style results screen after it.
(function () {
  const UI = G.ui, $ = id => document.getElementById(id);
  const civName = c => (G.CIVS[c] ? G.CIVS[c].name : c);
  const pName = id => (G.players[id] && G.players[id].raider ? 'Raiders' : civName(G.players[id].civ));
  const crest = c => `assets/ui/crest_${c}.png`;
  const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const MODE = {
    conquest: { name: 'Conquest', icon: '⚔️', goal: 'Destroy every enemy building and unit.', tip: 'Keep your Town Center training villagers; a strong economy wins long games.' },
    regicide: { name: 'Regicide', icon: '👑', goal: 'Kill the enemy King and Queen. Protect your own.', tip: 'When danger comes, garrison your royals in the Town Center (select them, then Garrison).' },
    capture: { name: 'Capture', icon: '🏰', goal: 'Beat enemy Town Centers down to a white flag, then stand soldiers beside them to take them over. Hold every Town Center, or an enemy home Town Center for 3 minutes.', tip: 'Defenders standing at the walls freeze a capture. Repair a beaten Town Center quickly, and keep soldiers home.' },
    survival: { name: 'Siege Survival', icon: '🛡️', goal: 'Hold out against growing waves of raiders. Lose your last Town Center and it is over.', tip: 'Build walls and towers between waves, and keep training soldiers: every 5th wave brings siege.' },
    empirewars: { name: 'Empire Wars', icon: '⚡', goal: 'Destroy every enemy building and unit. Everyone starts in the Feudal Age with a working town.', tip: 'Your villagers are already at work: train soldiers at the barracks straight away.' },
    tcrush: { name: 'Capture', icon: '🏰', goal: 'Take every enemy Town Center.', tip: '' }
  };
  G.MODES = MODE;
  const mode = () => MODE[(G.rules && G.rules.mode) || 'conquest'] || MODE.conquest;
  const mapName = k => (G.MAPS && G.MAPS[k] ? G.MAPS[k].name : (k || 'Grasslands').replace(/^\w/, c => c.toUpperCase()));

  // ---------- objectives ----------
  function progressLines() {
    const out = [];
    for (const id in G.players) {
      if (!G.enemies(1, +id)) continue;
      const p = G.players[id], col = G.PLAYER_COLORS[id], nm = `<b style="color:${col}">${civName(p.civ)}</b>`;
      if (p.raider) { const S = G.surv || {}; out.push(`🛡️ Waves survived: <b>${S.done || 0}</b>${S.active ? ` · wave ${S.wave} attacking` : ''}`); continue; }
      if (!p.alive) { out.push(`${nm} ✔ defeated`); continue; }
      if (G.rules.mode === 'capture') { const n = G.ents.filter(e => !e.dead && e.type === 'towncenter' && e.owner === +id).length, h = G.ents.filter(e => !e.dead && e.type === 'towncenter' && e.owner === 1 && e.homeOf === +id)[0]; out.push(`${nm}: ${n} Town Center${n === 1 ? '' : 's'}${h ? ` · you hold their home: ${Math.floor((G.CAPTURE.HOLD - (h.hold || 0)) / 60)}:${String(Math.floor((G.CAPTURE.HOLD - (h.hold || 0)) % 60)).padStart(2, '0')} to win` : ''}`); continue; }
      if (G.rules.mode === 'regicide') out.push(`${nm}: ` + ['king', 'queen'].map(t => (G.royal(+id, t) ? '✖ ' : '✔ ') + G.royalName(+id, t)).join(' · '));
      else if (G.rules.mode === 'tcrush') { const n = G.ents.filter(e => !e.dead && e.owner === +id && e.type === 'towncenter').length; out.push(`${nm}: ${n} Town Center${n === 1 ? '' : 's'} left`); }
      else { const b = G.ents.filter(e => !e.dead && e.owner === +id && e.kind === 'building').length, u = G.ents.filter(e => !e.dead && e.owner === +id && e.kind === 'unit').length; out.push(`${nm}: ${b} buildings, ${u} units left`); }
    }
    return out;
  }
  function objectiveHTML() {
    const m = mode(), t = G.rules.time ? ` · ⏳ ${clock(Math.max(0, G.rules.time * 60 - G.time))} left` : '';
    return `<div class="obj-goal">${m.icon} <b>${m.name}</b>${t}<br>${m.goal}</div><ul>${progressLines().map(l => `<li>${l}</li>`).join('')}</ul>`;
  }
  let objTimer = null;
  $('btn-obj').onclick = e => {
    e.stopPropagation(); const p = $('objpanel');
    if (!p.classList.contains('hidden')) { p.classList.add('hidden'); clearInterval(objTimer); return; }
    const fill = () => { p.innerHTML = objectiveHTML(); }; fill(); p.classList.remove('hidden');
    clearInterval(objTimer); objTimer = setInterval(fill, 1000);
  };
  $('objpanel').onclick = () => { $('objpanel').classList.add('hidden'); clearInterval(objTimer); };
  // milestones: when a Town Center falls in Conquest, say what is left to do
  const prevKilled = G.onKilled;
  G.onKilled = function (e) {
    prevKilled(e);
    if (G.over || !G.ui || !e || G.time < 1 || (G.tutorial && G.tutorial.on) || e.type !== 'towncenter' || !G.enemies(1, e.owner) || !G.players[e.owner]) return;
    if (G.rules.mode === 'conquest') {
      const n = G.ents.filter(x => !x.dead && x.owner === e.owner && x.kind === 'building').length;
      if (n) UI.alert(`🏚️ The ${civName(G.players[e.owner].civ)}' Town Center has fallen! Destroy their remaining ${n} building${n === 1 ? '' : 's'}.`);
    }
  };

  // ---------- briefing ----------
  UI.onMatchStart = function () {
    if (G.tutorial && G.tutorial.on) return;
    const m = mode(), me = G.players[1];
    const foes = Object.keys(G.players).filter(id => G.enemies(1, +id)), allies = Object.keys(G.players).filter(id => +id !== 1 && !G.enemies(1, +id));
    $('brief-mode').textContent = m.name;
    const who = id => `<span class="bchip"><img src="${crest(G.players[id].civ)}" alt=""><b style="color:${G.PLAYER_COLORS[id]}">${pName(id)}</b></span>`;
    $('brief-body').innerHTML = `<div class="brief-goal">${m.icon} ${m.goal}</div>` +
      `<div class="brief-sides"><div><small>You lead</small>${who(1)}</div>${allies.length ? `<div><small>Allies</small>${allies.map(who).join('')}</div>` : ''}<div><small>Enemies</small>${foes.map(who).join('')}</div></div>` +
      `<p class="brief-meta">${mapName(G.rules.map)} · ${G.rules.size} map${G.rules.time ? ` · ⏳ ${G.rules.time} min limit` : ''}${G.rules.startAge > 1 ? ` · starting in the ${G.AGES[G.rules.startAge].name}` : ''}</p>` +
      (G.rules.mode === 'regicide' ? `<p class="brief-meta">Your royals: <b>${G.royalName(1, 'king')}</b> and <b>${G.royalName(1, 'queen')}</b></p>` : '') +
      `<p class="brief-tip">💡 ${m.tip}</p>`;
    G.paused = true; $('brief').classList.remove('hidden');
  };
  $('brief-go').onclick = () => { $('brief').classList.add('hidden'); G.paused = false; };

  // ---------- pause menu ----------
  const openPause = () => {
    const me = G.players[1]; if (!me) return;
    const rows = Object.keys(G.players).map(id => `<span style="color:${G.PLAYER_COLORS[id]}">${+id === 1 ? 'You' : pName(id)} ${G.scoreOf(+id)}</span>`).join(' · ');
    $('pause-summary').innerHTML = `<div class="ps-top"><img src="${crest(me.civ)}" alt=""><div><b>${civName(me.civ)}</b><small>${mode().name} · ${mapName(G.rules.map)} · ${G.AGES[me.age].name} · ${clock(G.time)}</small></div></div><div class="ps-scores">${rows}</div>`;
    $('pause-objective').innerHTML = `${mode().icon} ${mode().goal}`;
    $('btn-resign').textContent = 'Resign'; delete $('btn-resign').dataset.armed;
  };
  $('btn-menu').addEventListener('click', openPause);
  const fromPause = id => { UI.backToPause = true; $('menu').classList.add('hidden'); $(id).classList.remove('hidden'); };
  $('btn-poptions').onclick = () => fromPause('options');
  $('btn-phelp').onclick = () => fromPause('help');
  $('btn-ptree').onclick = () => { UI._showDyn(G.players[1].civ); fromPause('dynasties'); const t = document.querySelectorAll('.dyn-view button')[1]; if (t) t.click(); };
  $('btn-psave').onclick = () => { G.slots.list().then(l => { if (l.length >= G.slots.MAX) { UI.alert(`You have ${G.slots.MAX} saves already: delete one under Saved Games first`); return; } G.slots.save().then(id => UI.alert(id ? '💾 Game saved' : 'Could not save here')); }); };
  $('btn-resign').onclick = () => {
    const b = $('btn-resign');
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to resign'; return; }
    $('menu').classList.add('hidden'); G.paused = false; G.resign(1);
  };

  // ---------- saved games ----------
  const ago = ms => { const s = (Date.now() - ms) / 1000; return s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : new Date(ms).toLocaleDateString(); };
  function saveCard(entry, isAuto) {
    const m = entry.meta || {}, M = MODE[m.mode] || MODE.conquest, b = document.createElement('button');
    b.className = 'savecard';
    b.innerHTML = `<img src="${crest(m.civ || 'britons')}" alt=""><div><b>${isAuto ? '⟳ Autosave' : entry.name}</b>` +
      `<small>${M.icon} ${M.name} · ${mapName(m.map)} · ${m.age ? G.AGES[m.age].name : ''} · ${clock(m.time || 0)}</small>` +
      `<small>${civName(m.civ)} vs ${(m.foes || []).map(civName).join(', ')}${m.progress ? ' · ' + m.progress : ''}</small><em>${ago(entry.savedAt)}</em></div>`;
    let hold = null, held = false;
    b.onpointerdown = () => { held = false; if (isAuto) return; hold = setTimeout(() => { held = true; manage(entry); }, 550); };
    b.onpointerup = b.onpointerleave = () => clearTimeout(hold);
    b.oncontextmenu = e => e.preventDefault();
    b.onclick = () => { if (held) return; const ok = isAuto ? Promise.resolve(G.loadGame()) : G.slots.load(entry.id); ok.then(r => { if (r) { G.buildGround(); UI._enterGame(); UI.alert('Game loaded'); } else UI.alert('That save could not be loaded'); }); };
    return b;
  }
  function manage(entry) {
    const box = document.createElement('div'); box.className = 'savemanage';
    box.innerHTML = `<input maxlength="40" value="${entry.name.replace(/"/g, '')}"><button class="plain sm-rename">Rename</button><button class="plain sm-del">Delete</button><button class="plain sm-x">Cancel</button>`;
    const inp = box.querySelector('input'); inp.onclick = e => e.stopPropagation();
    box.querySelector('.sm-rename').onclick = () => G.slots.rename(entry.id, inp.value.trim() || entry.name).then(renderSaves);
    const del = box.querySelector('.sm-del');
    del.onclick = () => { if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = 'Tap to confirm'; return; } G.slots.remove(entry.id).then(renderSaves); };
    box.querySelector('.sm-x').onclick = renderSaves;
    const list = $('save-list'); list.prepend(box);
  }
  function renderSaves() {
    const list = $('save-list'); list.innerHTML = '';
    const auto = G.hasSave();
    if (auto) list.appendChild(saveCard({ name: 'Autosave', savedAt: auto.savedAt, meta: auto.meta || { civ: auto.civ, time: auto.time } }, true));
    G.slots.list().then(l => { for (const e of l) list.appendChild(saveCard(e, false)); if (!auto && !l.length) list.innerHTML = '<p class="hint">No saved games yet. Use Save game in the pause menu during a match.</p>'; });
  }
  $('m-saves').onclick = () => { renderSaves(); UI._show('saves'); };
  // Continue loads whichever save is newest, autosave or slot
  async function newest() {
    const auto = G.hasSave(), l = await G.slots.list(), s = l[0];
    if (s && (!auto || s.savedAt > auto.savedAt)) return { slot: s };
    return auto ? { auto } : null;
  }
  async function updateContinue() {
    const n = await newest(), btn = $('m-continue');
    btn.classList.toggle('hidden', !n); $('m-skirmish').classList.toggle('primary', !n);
    if (!n) return;
    const m = n.slot ? n.slot.meta : (n.auto.meta || { civ: n.auto.civ, time: n.auto.time });
    $('m-continue-sub').textContent = `${civName(m.civ)} · ${(MODE[m.mode] || MODE.conquest).name} · ${Math.floor((m.time || 0) / 60)} min played`;
    btn.onclick = () => (n.slot ? G.slots.load(n.slot.id) : Promise.resolve(G.loadGame())).then(r => { if (r) { G.buildGround(); UI._enterGame(); UI.alert('Game resumed'); } else UI.alert('Saved game could not be loaded'); });
  }
  new MutationObserver(() => { if (!$('start').classList.contains('hidden')) updateContinue(); }).observe($('start'), { attributes: true, attributeFilter: ['class'] });
  updateContinue();

  // ---------- results ----------
  const REC_KEY = 'dod.records.v1';
  const loadRec = () => { try { return JSON.parse(localStorage.getItem(REC_KEY) || '{}'); } catch (e) { return {}; } };
  const saveRec = r => { try { localStorage.setItem(REC_KEY, JSON.stringify(r)); } catch (e) { /* ignore */ } };
  let resTab = 'summary';
  function sideRows(fn) {
    const ids = Object.keys(G.players);
    const winSide = id => (G.over === 'victory' ? !G.enemies(1, +id) : G.enemies(1, +id));
    return ids.map(id => { const p = G.players[id];
      return `<tr><td class="rp"><img src="${crest(p.civ)}" alt=""><b style="color:${G.PLAYER_COLORS[id]}">${+id === 1 ? 'You' : pName(id)}</b>${winSide(id) ? ' 👑' : ''}</td>${fn(p, +id)}</tr>`; }).join('');
  }
  const st = p => p.stats || {};
  function resPage() {
    const ages = p => [2, 3, 4].map(a => (st(p).ageT && st(p).ageT[a] != null ? clock(st(p).ageT[a]) : '–'));
    let html = '';
    if (resTab === 'summary') html = `<table class="rt"><tr><th></th><th>Total</th><th>Military</th><th>Economy</th><th>Technology</th><th>Society</th></tr>` +
      sideRows((p, id) => { const s = G.scoreParts(id); return `<td><b>${G.scoreOf(id)}</b></td><td>${s.military}</td><td>${s.economy}</td><td>${s.technology}</td><td>${s.society}</td>`; }) + '</table>';
    if (resTab === 'military') html = `<table class="rt"><tr><th></th><th>Units killed</th><th>Units lost</th><th>Buildings razed</th><th>Buildings lost</th><th>Largest army</th>${G.rules.mode === 'capture' ? '<th>TCs captured</th><th>TCs lost</th>' : ''}</tr>` +
      sideRows(p => `<td>${st(p).unitsKilled || 0}</td><td>${st(p).unitsLost || 0}</td><td>${st(p).razed || 0}</td><td>${st(p).bldLost || 0}</td><td>${st(p).peakArmy || 0}</td>${G.rules.mode === 'capture' ? `<td>${st(p).tcCaptured || 0}</td><td>${st(p).tcLost || 0}</td>` : ''}`) + '</table>' +
      (() => { const k = st(G.players[1]).killsBy || {}, top = Object.entries(k).sort((a, b) => b[1] - a[1]).slice(0, 6);
        return top.length ? `<p class="hint">Your kills by unit: ${top.map(([t, n]) => `${(G.UNITS[t] || { name: t }).name} ${n}`).join(' · ')}</p>` : ''; })();
    if (resTab === 'economy') html = `<table class="rt"><tr><th></th><th>Food</th><th>Wood</th><th>Gold</th><th>Stone</th><th>Spent</th><th>Peak villagers</th><th>Feudal</th><th>Castle</th><th>Imperial</th></tr>` +
      sideRows(p => { const g = p.gathered, a = ages(p); return `<td>${g.food}</td><td>${g.wood}</td><td>${g.gold}</td><td>${g.stone}</td><td>${st(p).spent || 0}</td><td>${st(p).peakVils || 0}</td><td>${a[0]}</td><td>${a[1]}</td><td>${a[2]}</td>`; }) + '</table>';
    if (resTab === 'tech') html = `<table class="rt"><tr><th></th><th>Technologies</th><th>Unit upgrades</th><th>Final Age</th></tr>` +
      sideRows(p => `<td>${Object.keys(p.techs || {}).length}</td><td>${Object.values(p.up || {}).reduce((a, b) => a + b, 0)}</td><td>${G.AGES[p.age].name}</td>`) + '</table>';
    if (resTab === 'replay') html = '<canvas id="res-replay" width="640" height="340"></canvas><p class="hint" id="replay-t"></p>';
    if (resTab === 'timeline') html = '<canvas id="res-chart" width="900" height="320"></canvas><div class="chart-key">' +
      Object.keys(G.players).map(id => `<span><i style="background:${G.PLAYER_COLORS[id]}"></i>${+id === 1 ? 'You' : pName(id)}</span>`).join('') + '</div>';
    $('res-page').innerHTML = `<div class="rt-wrap">${html}</div>`;
    if (resTab === 'timeline') drawChart();
    if (resTab === 'replay') playReplay();
  }
  // the whole match in ten seconds, on a map: towns spread, armies march, Town Centers fall
  let replayRaf = 0;
  function playReplay() {
    cancelAnimationFrame(replayRaf);
    const cv = $('res-replay'); if (!cv) return;
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, N = G.MAP, frames = G.replay || [];
    if (!frames.length) { $('replay-t').textContent = 'No replay for this match.'; return; }
    const sx = W / (2 * N), sy = H / (2 * N);
    const toP = (x, y) => [(x - y + N) * sx, (x + y) * sy];
    const ground = document.createElement('canvas'); ground.width = W; ground.height = H; const gc = ground.getContext('2d');
    gc.fillStyle = '#4f7a30'; gc.beginPath(); gc.moveTo(W / 2, 0); gc.lineTo(W, H / 2); gc.lineTo(W / 2, H); gc.lineTo(0, H / 2); gc.closePath(); gc.fill();
    const TC = { 5: '#2f6a96', 6: '#5aa0a8', 7: '#cdb37a', 8: '#7d7468' };
    for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { const t = TC[G.terrain[y * N + x]]; if (t) { gc.fillStyle = t; const [px, py] = toP(x, y); gc.fillRect(px - sx, py, sx * 2, sy * 2); } }
    const t0 = performance.now(), DUR = 10000;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / DUR), fi = Math.min(frames.length - 1, Math.floor(k * frames.length)), fr = frames[fi];
      c.clearRect(0, 0, W, H); c.drawImage(ground, 0, 0);
      for (let i = 0; i < fr.length; i += 4) {
        const [px, py] = toP(fr[i] / 2, fr[i + 1] / 2), kind = fr[i + 3];
        c.fillStyle = G.PLAYER_COLORS[fr[i + 2]] || '#fff';
        if (kind === 2) { c.fillRect(px - 5, py - 4, 10, 8); c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(px - 5, py - 4, 10, 8); }
        else if (kind === 1) c.fillRect(px - 2.5, py - 2, 5, 4);
        else { c.beginPath(); c.arc(px, py, 1.6, 0, 7); c.fill(); }
      }
      const t = fi * 6; $('replay-t').textContent = `${clock(t)} · tap Replay to watch again`;
      if (k < 1) replayRaf = requestAnimationFrame(step);
    };
    step();
  }
  function drawChart() {
    const cv = $('res-chart'), c = cv.getContext('2d'), W = cv.width, H = cv.height, P = 36;
    const lines = Object.keys(G.players).map(id => ({ id, pts: [[0, 0], ...(st(G.players[id]).timeline || []), [Math.round(G.time), G.scoreOf(+id)]] }));
    const maxT = Math.max(60, G.time), maxS = Math.max(100, ...lines.flatMap(l => l.pts.map(p => p[1])));
    c.clearRect(0, 0, W, H); c.strokeStyle = 'rgba(233,196,106,0.25)'; c.fillStyle = '#cdb98a'; c.font = '14px serif'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = H - P - (H - 2 * P) * i / 4; c.beginPath(); c.moveTo(P, y); c.lineTo(W - 10, y); c.stroke(); c.fillText(Math.round(maxS * i / 4), 2, y + 4); }
    for (let i = 0; i <= 4; i++) { const x = P + (W - P - 10) * i / 4; c.fillText(clock(maxT * i / 4), x - 14, H - 10); }
    for (const l of lines) {
      c.strokeStyle = G.PLAYER_COLORS[l.id]; c.lineWidth = 3; c.beginPath();
      l.pts.forEach(([t, s], i) => { const x = P + (W - P - 10) * t / maxT, y = H - P - (H - 2 * P) * s / maxS; i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      // Age-up markers
      const at = st(G.players[l.id]).ageT || {};
      for (const a in at) { const x = P + (W - P - 10) * at[a] / maxT; c.fillStyle = G.PLAYER_COLORS[l.id]; c.beginPath(); c.arc(x, H - P - 6, 5, 0, 7); c.fill(); }
    }
  }
  document.querySelectorAll('.res-tabs button').forEach(b => b.onclick = () => { resTab = b.dataset.t; document.querySelectorAll('.res-tabs button').forEach(x => x.classList.toggle('on', x === b)); resPage(); });
  UI.results = function (res) {
    const me = G.players[1], win = res === 'victory', SV = G.surv;
    const why = SV ? `Your town held for ${SV.done} wave${SV.done === 1 ? '' : 's'}` : G.overReason === 'hold' ? (win ? 'You held an enemy home Town Center for 3 minutes' : 'The enemy held your home Town Center for 3 minutes') : G.overReason === 'alltc' ? (win ? 'Every Town Center on the map is yours' : 'The enemy took every Town Center') : G.overReason === 'time' ? "Time's up: highest score wins" : (win ? { empirewars: 'All enemies destroyed', capture: 'Every enemy has fallen', conquest: 'All enemies destroyed', regicide: 'The enemy royals have fallen', tcrush: 'Every enemy Town Center is destroyed' } : { conquest: 'Your dynasty has been destroyed', regicide: 'Your King and Queen have fallen', tcrush: 'Your Town Centers have fallen' })[G.rules.mode] || '';
    $('res-banner').innerHTML = `<div class="rb ${win || SV ? 'win' : 'lose'}"><img src="${crest(me.civ)}" alt=""><h3 class="ribbon">${SV ? `Wave ${SV.done}` : win ? 'Victory' : 'Defeat'}</h3><p>${why} · ${clock(G.time)} · ${mode().name} on ${mapName(G.rules.map)}</p></div>`;
    // personal records on this device
    const r = loadRec(), news = [];
    r.games = (r.games || 0) + 1;
    if (win) {
      r.wins = (r.wins || 0) + 1; r.byCiv = r.byCiv || {}; r.byCiv[me.civ] = (r.byCiv[me.civ] || 0) + 1;
      const lvl = Object.values(G.players).filter(p => p.ai).map(p => p.ai).sort().pop() || 'normal'; r.byLvl = r.byLvl || {}; r.byLvl[lvl] = (r.byLvl[lvl] || 0) + 1;
      if (!r.fastest || G.time < r.fastest) { if (r.fastest) news.push('Fastest victory'); r.fastest = Math.round(G.time); }
    }
    const army = st(me).peakArmy || 0; if (army > (r.bigArmy || 0)) { if (r.bigArmy) news.push('Largest army'); r.bigArmy = army; }
    const sc = G.scoreOf(1); if (sc > (r.best || 0)) { if (r.best) news.push('Highest score'); r.best = sc; }
    if (SV) { r.bestWave = r.bestWave || {}; if (SV.done > (r.bestWave[SV.lvl] || 0)) { news.push(`Best Siege Survival (${SV.lvl}): wave ${SV.done}`); r.bestWave[SV.lvl] = SV.done; } }
    saveRec(r);
    if (news.length && G.sound) setTimeout(() => G.sound.play('record'), 1800);
    if (G.sound && G.sound.ambient) G.sound.ambient(null);
    $('res-records').innerHTML = (news.length ? `<div class="newrec">🏅 New record! ${news.join(' · ')}</div>` : '') +
      `<p class="hint">Your records: ${r.wins || 0} wins from ${r.games} games · best score ${r.best || 0} · largest army ${r.bigArmy || 0}${r.fastest ? ' · fastest win ' + clock(r.fastest) : ''}</p>`;
    resTab = 'summary'; document.querySelectorAll('.res-tabs button').forEach(x => x.classList.toggle('on', x.dataset.t === 'summary')); resPage();
    setTimeout(() => { $('hud').classList.add('hidden'); UI._show('results'); document.body.classList.toggle('res-win', win); }, 1200);
  };
  $('res-again').onclick = () => $('btn-again').click();
  $('res-menu').onclick = () => { G.demo = true; UI._show('start'); };
})();
