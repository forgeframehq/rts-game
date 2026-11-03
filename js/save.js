// Saving and loading.
//  - The autosave lives in localStorage (synchronous, so it can be written as the page closes).
//  - Named save slots (up to 10) live in IndexedDB, which has room for many full matches.
// Both hold the same snapshot; Continue loads whichever is newest.
(function () {
  const KEY = 'dod.save.v1', MAX_SLOTS = 10;

  function store() { try { return window.localStorage; } catch (e) { return null; } }

  // ---------- snapshot ----------
  // a one-line description of where the match stands, shown in the saved-games list
  G.matchMeta = function () {
    const me = G.players[1], foes = Object.keys(G.players).filter(id => G.enemies(1, +id)).map(id => G.players[id].civ);
    let progress = '';
    if (G.rules.mode === 'regicide') {
      const left = []; for (const id in G.players) if (G.enemies(1, +id) && G.players[id].alive) for (const t of ['king', 'queen']) if (G.royal(+id, t)) left.push(G.royalName(+id, t));
      progress = left.length ? 'Still standing: ' + left.join(', ') : '';
    } else if (G.rules.mode === 'tcrush') {
      const n = G.ents.filter(e => !e.dead && e.type === 'towncenter' && G.enemies(1, e.owner)).length;
      progress = `${n} enemy Town Center${n === 1 ? '' : 's'} left`;
    } else {
      const n = G.ents.filter(e => !e.dead && e.kind === 'building' && G.enemies(1, e.owner)).length;
      progress = `${n} enemy building${n === 1 ? '' : 's'} left`;
    }
    return { civ: me.civ, foes, mode: G.rules.mode, map: G.rules.map || 'grasslands', size: G.rules.size, age: me.age, time: Math.round(G.time), progress };
  };
  G.snapshot = function () {
    const ents = G.ents.filter(e => !e.dead).map(e => {
      const o = {};
      for (const k in e) if (k !== 'def') o[k] = e[k];
      if (e.garrison) o.garrison = e.garrison.map(u => { const g = {}; for (const k in u) if (k !== 'def') g[k] = u[k]; return g; });
      return o;
    });
    return {
      v: 1, savedAt: Date.now(), time: G.time, config: G.config, rules: G.rules, map: G.MAP, meta: G.matchMeta(),
      terrain: Array.from(G.terrain), explored: Array.from(G.explored),
      players: G.players, ents, decals: G.decals,
      ais: (G.ais || []).map(a => ({ p: a.p, level: a.level, waveN: a.waveN, nextAttack: a.nextAttack, rb: a.rb || 0, lowT: a.lowT || 0, hideT: a.hideT || 0 })),
      cam: { x: G.camera.x, y: G.camera.y, zoom: G.camera.zoom }
    };
  };
  const canSave = () => !(G.tutorial && G.tutorial.on) && G.players && !G.over && G.ents.length && !G.demo;

  G.restore = function (d) {
    if (!d || d.v !== 1) return false;
    G.config = d.config; G.rules = d.rules; G.MAP = d.map;
    G.initMap(d.config.seed || 1);
    G.terrain.set(d.terrain); G.explored.set(d.explored);
    G.players = d.players;
    if (G.applyColors) G.applyColors();
    if (G.loadCivArt) for (const id in G.players) G.loadCivArt(G.players[id].civ);
    G.ents = []; G.byId = new Map(); G.projs = []; G.effects = []; G.decals = d.decals || []; G.corpses = [];
    let maxId = 0;
    for (const o of d.ents) {
      o.def = o.kind === 'unit' ? (G.UNITS[o.type] && G.unitDef(o.owner, o.type)) : o.kind === 'building' ? G.BUILDINGS[o.type] : G.RES[o.type];
      if (!o.def) continue;
      G.ents.push(o); G.byId.set(o.id, o); maxId = Math.max(maxId, o.id);
      if (o.garrison) for (const g of o.garrison) { g.def = G.unitDef(g.owner, g.type); G.byId.set(g.id, g); maxId = Math.max(maxId, g.id); }
      if (o.kind !== 'unit' && o.type !== 'farm') G.setBlock(o, o.id);
    }
    G.setNextId(maxId + 1);
    if (G.applyTerrainBlocks) G.applyTerrainBlocks();
    G.time = d.time; G.over = null; if (G.resetTimeWarnings) G.resetTimeWarnings();
    G.revealAll = G.rules.reveal === 'all';
    G.ais = d.ais.map(x => { const a = G.makeAI(); a.level = x.level; a.init(x.p); a.waveN = x.waveN; a.nextAttack = x.nextAttack; a.rb = x.rb; a.lowT = x.lowT || 0; a.hideT = x.hideT || 0; return a; });
    G.updateFog();
    G.camera.x = d.cam.x; G.camera.y = d.cam.y; G.camera.zoom = d.cam.zoom;
    if (G.ui) G.ui.reset();
    return true;
  };

  // ---------- autosave (localStorage) ----------
  G.hasSave = function () {
    const s = store(); if (!s) return null;
    try { const raw = s.getItem(KEY); if (!raw) return null; const d = JSON.parse(raw); return { time: d.time, civ: d.players[1].civ, savedAt: d.savedAt, meta: d.meta }; } catch (e) { return null; }
  };
  G.clearSave = function () { const s = store(); if (s) try { s.removeItem(KEY); } catch (e) { /* ignore */ } };
  G.saveGame = function () {
    const s = store(); if (!s || !canSave()) return false;
    try { s.setItem(KEY, JSON.stringify(G.snapshot())); return true; } catch (e) { return false; }
  };
  G.loadGame = function () {
    const s = store(); if (!s) return false;
    try { return G.restore(JSON.parse(s.getItem(KEY))); } catch (e) { return false; }
  };

  // ---------- save slots (IndexedDB) ----------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      const r = indexedDB.open('dod', 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('saves')) d.createObjectStore('saves', { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  const tx = (mode, fn) => db().then(d => new Promise((res, rej) => { const t = d.transaction('saves', mode), st = t.objectStore('saves'); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }));
  G.slots = {
    MAX: MAX_SLOTS,
    // newest first; entries carry only the summary, not the whole match
    list: () => tx('readonly', st => st.getAll()).then(all => (all || []).map(x => ({ id: x.id, name: x.name, savedAt: x.data.savedAt, meta: x.data.meta })).sort((a, b) => b.savedAt - a.savedAt)).catch(() => []),
    save: (name, id) => {
      if (!canSave()) return Promise.resolve(null);
      const data = G.snapshot(), rec = { id: id || 'slot' + Date.now(), name: name || G.autoName(data.meta), data };
      return tx('readwrite', st => st.put(rec)).then(() => rec.id);
    },
    load: id => tx('readonly', st => st.get(id)).then(rec => rec ? G.restore(rec.data) : false),
    remove: id => tx('readwrite', st => st.delete(id)),
    rename: (id, name) => tx('readwrite', st => { const g = st.get(id); g.onsuccess = () => { if (g.result) { g.result.name = name; st.put(g.result); } }; return g; })
  };
  G.autoName = m => `${G.CIVS[m.civ] ? G.CIVS[m.civ].name : ''} vs ${m.foes.map(c => G.CIVS[c] ? G.CIVS[c].name : c).join(', ')} – ${G.AGES[m.age].name}`;
})();
