// Writes godot/data/gamedata.json from js/data.js, so the Godot edition uses the same numbers.
// Run from the repo root: node tools/export_godot_data.mjs
import fs from 'node:fs';
globalThis.window = globalThis; globalThis.G = {};
(0, eval)(fs.readFileSync('js/data.js', 'utf8'));
const out = {};
for (const k of Object.keys(G)) if (typeof G[k] !== 'function') out[k] = G[k];
fs.mkdirSync('godot/data', { recursive: true });
fs.writeFileSync('godot/data/gamedata.json', JSON.stringify(out));
console.log('wrote godot/data/gamedata.json', Object.keys(out).length, 'tables');
