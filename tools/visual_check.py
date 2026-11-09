"""Visual check of every building, for every dynasty and every Age, straight from the game.

    python3 tools/visual_check.py [civ ...]          (default: all seven)

Needs the game served at http://localhost:8123 (python3 -m http.server 8123 in the repo).

For each dynasty and Age it starts a match, places one finished building of every kind the
dynasty can build in that Age on open ground, draws the plot outline under each one, and
screenshots them into a contact sheet: build/visual/<civ>_age<n>.png. It also measures each
sprite against its plot and writes build/visual/report.md with anything that looks off:

- overhang: how much wider the painted sprite is than its plot (a sprite 1.3x its plot is
  trampling its neighbours; the Chola "farm" with a temple on it was 1.4x)
- sink/float: how far the sprite's bottom corner sits from the plot's bottom corner, in tiles
  (positive: the art hangs below the plot and the building looks sunk; negative: it floats)
- missing art: the building fell back to the drawn placeholder (no sprite for this region/tier)
- same as the default Age look: the Age has no art of its own (feudal/castle/imperial usually
  share one look; the Dark Age has its own)

Look at the sheets, not only the numbers: a sprite can measure fine and still be the wrong thing.
"""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'build', 'visual')
CIVS = sys.argv[1:] or ['britons', 'franks', 'byzantines', 'chinese', 'persians', 'incas', 'cholas']
AGES = {1: 'Dark', 2: 'Feudal', 3: 'Castle', 4: 'Imperial'}
CELL = 300   # px per building cell in the sheet, at zoom 1

SETUP = """([civ, age]) => {
  localStorage.setItem('dod.prefs.v1', JSON.stringify({ intro: 'off', dynfilm: 'off' }));
  G.newGame({ players: [{ civ }, { civ: 'franks', ai: 'normal' }], size: 'medium', mode: 'conquest', seed: 11 });
  G.buildGround();
  document.querySelectorAll('.screen').forEach(x => x.classList.add('hidden')); document.getElementById('hud').classList.add('hidden');
  G.paused = true; G.demo = false; G.inGame = true; G.revealAll = true;
  G.players[1].age = age;
  // clear a flat stage in the middle of the map: remove every entity and resource there
  const N = G.MAP, cx = N >> 1, cy = N >> 1, R = 26;
  for (const e of G.ents.slice()) if (Math.abs(e.x - cx) < R && Math.abs(e.y - cy) < R) { e.dead = true; }
  G.ents = G.ents.filter(e => !e.dead);
  for (let y = cy - R; y < cy + R; y++) for (let x = cx - R; x < cx + R; x++) { if (G.terrain) G.terrain[y * N + x] = 0; if (G.block) G.block[y * N + x] = 0; }
  G.buildGround();
  return [cx, cy];
}"""

PLACE = """([type, tx, ty]) => {
  const b = G.addBuilding(type, 1, tx, ty, true); b.built = true; b.hp = b.maxHp;
  const sp = G.buildingSprite(type, 1);
  return { id: b.id, size: b.size, art: !!(sp && sp.art), w: sp ? sp.w : 0, h: sp ? sp.h : 0, ax: sp ? sp.ax : 0, ay: sp ? sp.ay : 0, cv: sp && sp.cv ? [sp.cv.width, sp.cv.height] : null };
}"""

SHOOT = """([tx, ty, size, zoom]) => {
  G.camera.zoom = zoom; G.camera.focus(tx + size / 2, ty + size / 2); G.camera.update(0.1);
  G.render();
  const c = [[tx, ty], [tx + size, ty], [tx + size, ty + size], [tx, ty + size]].map(([x, y]) => { const s = G.toScreen(x, y); return [s.x, s.y]; });
  return { corners: c, dpr: Math.min(2, devicePixelRatio || 1), w: innerWidth, h: innerHeight };
}"""


async def main():
    os.makedirs(OUT, exist_ok=True)
    report = ['# Visual check', '']
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': CELL + 40, 'height': CELL + 140}, device_scale_factor=1)
        errs = []
        page.on('pageerror', lambda e: errs.append(e.message))
        await page.goto('http://localhost:8123/index.html'); await page.wait_for_timeout(5000)
        civs_data = await page.evaluate("() => ({ builds: G.VIL_BUILDS, ages: G.BUILD_AGE, blocks: Object.fromEntries(['britons','franks','byzantines','chinese','persians','incas','cholas'].map(c => [c, G.VIL_BUILDS.filter(t => (G.CIVS[c].mods || {}).noStable && t === 'stable')])), region: G.REGION })")
        for civ in CIVS:
            looks = {}
            for age, agename in AGES.items():
                cx, cy = await page.evaluate(SETUP, [civ, age])
                await page.wait_for_timeout(300)
                types = [t for t in civs_data['builds'] if civs_data['ages'].get(t, 1) <= age and t not in civs_data['blocks'][civ] and t not in ('palisade', 'stonewall', 'gate')]
                cells, rows = [], []
                for i, t in enumerate(types):
                    # spread them over the cleared stage, far enough apart that aprons don't touch
                    gx, gy = cx - 20 + (i % 6) * 7, cy - 20 + (i // 6) * 7
                    info = await page.evaluate(PLACE, [t, gx, gy])
                    shot = await page.evaluate(SHOOT, [gx, gy, info['size'], 1.0 if info['size'] <= 4 else 0.8])
                    await page.wait_for_timeout(60)
                    png = os.path.join(OUT, f'_{civ}_{age}_{t}.png'); await page.screenshot(path=png)
                    im = Image.open(png).convert('RGBA'); dr = ImageDraw.Draw(im)
                    dr.polygon([tuple(c) for c in shot['corners']], outline=(255, 255, 255, 230), width=2)
                    plot_w = info['size'] * 64
                    over = info['w'] / plot_w if plot_w else 0
                    sink = ((info['h'] - info['ay']) - info['size'] * 16) / 32 if info['art'] else 0   # tiles below the plot's bottom corner
                    label = f"{t}  {over:.2f}x  {sink:+.2f}t" + ('' if info['art'] else '  NO ART')
                    dr.rectangle((0, im.height - 22, im.width, im.height), fill=(0, 0, 0, 200)); dr.text((6, im.height - 18), label, fill=(255, 230, 160, 255))
                    cells.append(im); os.remove(png)
                    flag = []
                    if not info['art']: flag.append('no art (placeholder drawn)')
                    if over > 1.15: flag.append(f'sprite {over:.2f}x wider than its plot')
                    if abs(sink) > 0.35: flag.append(f'bottom corner {sink:+.2f} tiles off the plot')
                    if flag: rows.append(f'- {civ} {agename} **{t}**: ' + '; '.join(flag))
                    looks.setdefault(t, {})[age] = (info['cv'], info['w'], info['h'])
                cols = 6; nrows = (len(cells) + cols - 1) // cols
                sheet = Image.new('RGB', (cols * cells[0].width, nrows * cells[0].height + 30), (20, 18, 14)); d2 = ImageDraw.Draw(sheet)
                d2.text((8, 8), f'{civ}  {agename} Age  ({civs_data["region"][civ]} style)  label: type  width/plot  bottom offset in tiles', fill=(255, 220, 140))
                for i, im in enumerate(cells): sheet.paste(im, ((i % cols) * im.width, 30 + (i // cols) * im.height))
                sheet.save(os.path.join(OUT, f'{civ}_age{age}.png'))
                print(f'{civ} {agename}: {len(cells)} buildings', flush=True)
                report += [f'## {civ} {agename} Age', ''] + (rows or ['- nothing flagged']) + ['']
            same = [t for t, by in looks.items() if len(by) > 1 and len({str(v) for v in by.values()}) == 1]
            if same: report += [f'{civ}: one look for every Age: ' + ', '.join(same), '']
            own_dark = [t for t, by in looks.items() if 1 in by and 2 in by and str(by[1]) != str(by[2])]
            if own_dark: report += [f'{civ}: a Dark Age look of its own: ' + ', '.join(own_dark), '']
        await browser.close()
    if errs: report += ['## Page errors', ''] + [f'- {e}' for e in errs]
    open(os.path.join(OUT, 'report.md'), 'w').write('\n'.join(report))
    print('wrote', os.path.join(OUT, 'report.md'))


if __name__ == '__main__':
    asyncio.run(main())
