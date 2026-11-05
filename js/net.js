// Multiplayer: two phones, one match, joined with a 4-letter room code.
//
// Lockstep, as AoE2 does it: both phones run the whole game, and only the players' orders
// travel. Time is cut into turns of 0.1 s; an order given now is scheduled DELAY turns ahead,
// sent to the other phone, and both phones carry it out at the start of that same turn. A phone
// only plays a turn once it holds both players' orders for it, so the two games never drift.
// The simulation's few random numbers come from G.rand, seeded from the match, so they agree too.
// Every HASH_EVERY turns each phone sends a fingerprint of its game; a mismatch is reported.
//
// Each phone is player 1 to itself (newGame's `me`), so the rest of the game's
// "player 1 = you" code works unchanged. Orders carry owners as slots, not player numbers.
(function () {
  // ---------- shared random numbers (mulberry32) ----------
  let seed = 1;
  G.rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  G.seedRand = v => { seed = (v | 0) || 1; };

  const STEP = 1 / 30, STEPS = 3, TURN = STEP * STEPS, DELAY = 3, HASH_EVERY = 50;
  const N = G.net = { on: false, role: null, me: 0, code: null, ws: null, peer: false };
  // the relay: the deployed Cloudflare Worker, or ws://localhost:8787 for testing (localStorage dod.relay)
  N.RELAY = 'wss://dod-relay.forgeframe.workers.dev';
  const relayUrl = () => { try { return localStorage.getItem('dod.relay') || N.RELAY; } catch (e) { return N.RELAY; } };

  // ---------- orders ----------
  // Everything the player does to the game goes through G.order(name, ...args). Alone, it acts at
  // once. In a network match it is checked (so the screen can answer at once: "need more houses"),
  // queued, and carried out on both phones a few turns later.
  const OWNER_ARG = { placeBuilding: 0, ringBell: 0, resign: 0, setReseed: 0 };   // which argument is a player number
  const slotOf = num => { for (let i = 0; i < 2; i++) if (G.slotNum(i) === num) return i; return 0; };
  const enc = (v, owner) => owner ? { $p: slotOf(v) }
    : v && typeof v === 'object' && v.id && (v.kind === 'unit' || v.kind === 'building' || v.kind === 'res') ? { $e: v.id }
    : Array.isArray(v) ? v.map(x => enc(x)) : v;
  const dec = v => v && typeof v === 'object' ? ('$e' in v ? G.byId.get(v.$e) || null : '$p' in v ? G.slotNum(v.$p) : Array.isArray(v) ? v.map(dec) : v) : v;
  // what the order would answer if carried out now, without changing anything
  function predict(name, a) {
    switch (name) {
      case 'train': {
        const [b, type] = a; if (!b || !b.built || !G.trainsFor(b).includes(type) || !G.canTrainType(1, type)) return false;
        if (b.aging || b.research) return 'busy';
        const { pop, cap } = G.popOf(1); if (pop + (b.netQ || 0) >= cap) return 'pop';
        return G.canAfford(1, G.unitCost(1, type)) ? true : 'res';
      }
      case 'placeBuilding': {
        const [, type, tx, ty] = a, def = G.BUILDINGS[type];
        if (!G.canBuildType(1, type) || !G.areaFree(tx, ty, def.size) || G.farmOverlap(tx, ty, def.size) || (G.ruleBlock && G.ruleBlock(1, type, tx, ty))) return null;
        return G.canAfford(1, G.buildCost(1, type)) ? { x: tx + def.size / 2, y: ty + def.size / 2, pending: true } : null;
      }
      case 'startResearch': { const [b, id] = a; const r = G.researchesFor(b).find(x => x.id === id); if (!r || r.why || b.research || b.aging) return false; return G.canAfford(1, r.def.cost) ? true : 'res'; }
      case 'advanceAge': { const [tc] = a; if (G.ageBlock(1, tc)) return false; return G.canAfford(1, G.ageCost(1, G.ageOf(1) + 1)) ? true : 'res'; }
      case 'wallToGate': { const [w] = a; if (!G.canBuildType(1, 'gate')) return 'age'; return G.canAfford(1, G.buildCost(1, 'gate')) ? w : 'cost'; }
      case 'useSpecial': return a[0].filter(u => G.specialReady(u) && G.specialOf(u)).length;
      case 'cmdSmart': return 'move';
      default: return true;
    }
  }
  G.order = function (name, ...args) {
    if (!N.on) return G[name](...args);
    if (G.over) return false;
    const r = predict(name, args);
    if (r === false || r === null || r === 'pop' || r === 'res' || r === 'busy' || r === 'cost' || r === 'age') return r;
    if (name === 'train' && args[0]) args[0].netQ = (args[0].netQ || 0) + 1;   // so auto-villagers don't queue twice while in flight
    N.out.push([name, args.map((v, i) => enc(v, OWNER_ARG[name] === i))]);
    return r;
  };
  function run(name, args) {
    const a = args.map(dec);
    if (name === 'train' && a[0]) a[0].netQ = Math.max(0, (a[0].netQ || 0) - 1);
    if (a.some((v, i) => v === null && args[i] && args[i].$e)) return;   // a unit or building that died meanwhile
    try { G[name](...a); } catch (e) { console.warn('order failed', name, e); }
  }

  // ---------- turns ----------
  let inbox = {}, sendTurn = 0, acc = 0, waitT = 0, hashes = {};
  function put(n, slot, cmds) { (inbox[n] = inbox[n] || [null, null])[slot] = cmds; }
  function flush() {
    // keep DELAY turns of our own orders in flight ahead of the turn being played
    while (sendTurn <= N.turn + DELAY) {
      const cmds = N.out; N.out = [];
      put(sendTurn, N.me, cmds);
      send({ t: 'turn', n: sendTurn, c: cmds });
      sendTurn++;
    }
  }
  function fingerprint() {
    let h = 0;
    const mix = v => { h = (Math.imul(h ^ (v | 0), 2654435761) + 0x9e3779b9) | 0; };
    for (const e of G.ents) if (!e.dead) { mix(e.id); mix(e.x * 1000); mix(e.y * 1000); mix(e.hp * 10); }
    for (let i = 0; i < 2; i++) { const p = G.players[G.slotNum(i)]; if (p) for (const k of ['food', 'wood', 'gold', 'stone']) mix(p.res[k] * 10); }
    return h >>> 0;
  }
  N.frame = function (real) {
    if (!G.ents.length) return;
    acc = Math.min(acc + real, TURN * 10);   // after a stall, catch up a second's worth at most
    flush();
    let played = 0;
    while (acc >= TURN && !G.over) {
      const box = inbox[N.turn];
      if (!box || !box[0] || !box[1]) break;   // still waiting for the other phone's orders
      for (const s of [0, 1]) for (const [name, args] of box[s]) run(name, args);   // host's first, the same on both phones
      for (let i = 0; i < STEPS; i++) G.step(STEP);
      delete inbox[N.turn];
      if (N.turn % HASH_EVERY === 0) { const h = fingerprint(); hashes[N.turn] = h; send({ t: 'hash', n: N.turn, h }); check(N.turn); }
      N.turn++; acc -= TURN; played++;
      flush();
    }
    // waiting on the other phone: say so after a moment, and give up after a long silence
    waitT = played ? 0 : waitT + real;
    if (G.ui && G.ui.netWait) G.ui.netWait(waitT > 1.2 && !G.over ? (N.peer ? 'Waiting for your opponent…' : 'Your opponent has left') : null);
  };
  const theirs = {};
  function check(n) {
    if (hashes[n] === undefined || theirs[n] === undefined) return;
    if (hashes[n] !== theirs[n] && !N.desync) { N.desync = n; console.warn('desync at turn', n); if (G.ui) G.ui.alert('⚠️ The two games are out of step. Please report this match.'); send({ t: 'desync', n }); }
    delete hashes[n]; delete theirs[n];
  }

  // ---------- the connection ----------
  const listeners = new Set();
  N.listen = fn => { listeners.add(fn); return () => listeners.delete(fn); };
  const emit = m => { for (const fn of listeners) try { fn(m); } catch (e) { console.warn(e); } };
  function send(m) { if (N.ws && N.ws.readyState === 1) N.ws.send(JSON.stringify(m)); }
  N.send = send;
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  N.newCode = () => Array.from({ length: 4 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  N.connect = function (code, role) {
    N.close();
    N.code = code.toUpperCase(); N.role = role; N.me = role === 'host' ? 0 : 1; N.peer = false;
    return new Promise(res => {
      let done = false; const fin = r => { if (!done) { done = true; res(r); } };
      let ws; try { ws = new WebSocket(relayUrl().replace(/\/$/, '') + '/room/' + N.code + '?role=' + role); } catch (e) { return fin({ ok: false, why: 'Could not reach the game server.' }); }
      N.ws = ws;
      const t = setTimeout(() => fin({ ok: false, why: 'Could not reach the game server. Check your connection.' }), 8000);
      ws.onmessage = ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        if (m.t === 'error') { clearTimeout(t); fin({ ok: false, why: m.why }); return; }
        if (m.t === 'joined') { clearTimeout(t); N.peer = !!m.peer; fin({ ok: true }); }
        if (m.t === 'peer') { N.peer = m.on; if (!m.on && N.on && !G.over) peerLeft(); }
        if (m.t === 'turn') put(m.n, 1 - N.me, m.c);
        if (m.t === 'hash') { theirs[m.n] = m.h; check(m.n); }
        if (m.t === 'bye' && N.on && !G.over) peerLeft(true);
        emit(m);
      };
      ws.onclose = () => { clearTimeout(t); fin({ ok: false, why: 'Lost the connection to the game server.' }); if (N.ws === ws) { N.peer = false; if (N.on && !G.over) peerLeft(); emit({ t: 'closed' }); } };
      ws.onerror = () => {};
    });
  };
  N.close = function () { if (N.ws) { try { send({ t: 'bye' }); N.ws.onclose = null; N.ws.close(); } catch (e) { /* ignore */ } } N.ws = null; N.peer = false; };
  // the other player left mid-match: they forfeit
  function peerLeft(said) {
    if (!N.on || G.over) return;
    if (G.ui) G.ui.alert(said ? 'Your opponent left the match. You win!' : 'Your opponent disconnected. You win!');
    for (const id in G.players) if (+id !== 1) G.players[id].alive = false;
    G.over = 'victory'; G.overReason = 'left'; if (G.ui) G.ui.gameOver('victory');
  }

  // ---------- starting and ending a match ----------
  // cfg is the host's setup ({ seed, map, size, mode, players: [{ civ }, { civ }] }); both phones call this
  N.begin = function (cfg) {
    inbox = {}; hashes = {}; for (const k in theirs) delete theirs[k];
    N.out = []; N.turn = 0; sendTurn = 0; acc = 0; waitT = 0; N.desync = 0;
    for (let n = 0; n < DELAY; n++) { put(n, 0, []); put(n, 1, []); }   // the first turns hold no orders
    sendTurn = DELAY;
    G.speed = 1; G.paused = false;
    G.newGame(Object.assign({}, cfg, { me: N.me, net: true }));
    N.on = true;
    // each player's own farm setting travels as an order like any other
    N.out.push(['setReseed', [{ $p: N.me }, G.autoReseed !== false]]);
  };
  N.end = function () { N.on = false; N.close(); };
})();
