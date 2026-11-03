// Save and resume a match using browser storage.
(function () {
  const KEY = 'dod.save.v1';

  function store() { try { return window.localStorage; } catch (e) { return null; } }

  G.hasSave = function () {
    const s = store(); if (!s) return null;
    try { const raw = s.getItem(KEY); if (!raw) return null; const d = JSON.parse(raw); return { time: d.time, civ: d.players[1].civ, savedAt: d.savedAt }; } catch (e) { return null; }
  };
  G.clearSave = function () { const s = store(); if (s) try { s.removeItem(KEY); } catch (e) { /* ignore */ } };

  G.saveGame = function () {
    if (G.tutorial && G.tutorial.on) return;
    const s = store();
    if (!s || !G.players || G.over || !G.ents.length || G.demo) return false;
    const ents = G.ents.filter(e => !e.dead).map(e => {
      const o = {};
      for (const k in e) if (k !== 'def') o[k] = e[k];
      if (e.garrison) o.garrison = e.garrison.map(u => { const g = {}; for (const k in u) if (k !== 'def') g[k] = u[k]; return g; });
      return o;
    });
    const data = {
      v: 1, savedAt: Date.now(), time: G.time, config: G.config, rules: G.rules, map: G.MAP,
      terrain: Array.from(G.terrain), explored: Array.from(G.explored),
      players: G.players, ents, decals: G.decals,
      ais: (G.ais || []).map(a => ({ p: a.p, level: a.level, waveN: a.waveN, nextAttack: a.nextAttack, rb: a.rb || 0, lowT: a.lowT || 0, hideT: a.hideT || 0 })),
      cam: { x: G.camera.x, y: G.camera.y, zoom: G.camera.zoom }
    };
    try { s.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  };

  G.loadGame = function () {
    const s = store(); if (!s) return false;
    let d;
    try { d = JSON.parse(s.getItem(KEY)); } catch (e) { return false; }
    if (!d || d.v !== 1) return false;
    G.config = d.config; G.rules = d.rules; G.MAP = d.map;
    G.initMap(d.config.seed || 1);
    G.terrain.set(d.terrain); G.explored.set(d.explored);
    G.players = d.players;
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
    G.time = d.time; G.over = null; if (G.resetTimeWarnings) G.resetTimeWarnings();
    G.revealAll = G.rules.reveal === 'all';
    G.ais = d.ais.map(x => { const a = G.makeAI(); a.level = x.level; a.init(x.p); a.waveN = x.waveN; a.nextAttack = x.nextAttack; a.rb = x.rb; a.lowT = x.lowT || 0; a.hideT = x.hideT || 0; return a; });
    G.updateFog();
    G.camera.x = d.cam.x; G.camera.y = d.cam.y; G.camera.zoom = d.cam.zoom;
    if (G.ui) G.ui.reset();
    return true;
  };
})();
