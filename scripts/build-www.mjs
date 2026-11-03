// Copies just the files the game needs into www/, the folder the Android app is packed from.
// Source art, tools and generation output stay out of the app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const KEEP = ['index.html', 'style.css', 'icon.svg', 'manifest.json', 'js', 'assets'];
const SKIP = ['assets/source'];
rmSync('www', { recursive: true, force: true }); mkdirSync('www');
for (const p of KEEP) cpSync(p, 'www/' + p, { recursive: true, filter: s => !SKIP.some(x => s.replace(/\\/g, '/').startsWith(x)) });
console.log('www/ ready');
