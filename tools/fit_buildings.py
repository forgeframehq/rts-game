"""Re-fit every building sprite to its footprint, the same way tools/process_art.py does.

    python3 tools/fit_buildings.py            # report
    python3 tools/fit_buildings.py --apply    # rewrite assets/manifest.json
    python3 tools/fit_buildings.py --sheet out.png   # every building drawn on its plot

The base of an isometric building is the widest row in the lower 30% of its art: its two
side corners. The diamond's centre sits a quarter of that width above the lowest solid row,
and the art is scaled so that width spans the footprint. Use this after changing a
building's footprint size, or after art was resized by hand.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw
TW, TH = 64, 32
FUDGE = {}   # (farm_spent needed 0.6755 only while fields were measured on their lower 30%)
m = json.load(open('assets/manifest.json'))

def fit(k, d):
    a = np.asarray(Image.open(d['file']).convert('RGBA'))
    solid = a[..., 3] > 128
    rows = np.nonzero(solid.sum(1) > 3)[0]
    h, w = solid.shape
    bottom = rows.max()
    best_w, cx = 0, w / 2
    # a field is flat: its widest row (the side corners) is mid-height, not in the lower 30%
    for y in range(0 if 'farm' in k else int(h * 0.7), bottom + 1):
        cols = np.nonzero(solid[y])[0]
        if len(cols) and cols[-1] - cols[0] > best_w:
            best_w, cx = cols[-1] - cols[0], (cols[-1] + cols[0]) / 2
    ground_y = bottom - best_w / 4.0
    k_ = d['size'] * TW * FUDGE.get(k.split('_', 1)[-1] if k.startswith(('mediterranean_', 'eastasian_')) else k, 1.0) / best_w
    return dict(w=round(w * k_, 2), h=round(h * k_, 2), ax=round(cx * k_, 2), ay=round(ground_y * k_, 2))

keys = [k for k, d in m.items() if isinstance(d, dict) and d.get('size') and 'file' in d
        and not k.startswith(('res_', 'stump', 'fnd_', 'unit'))]
for k in sorted(keys):
    n = fit(k, m[k]); d = m[k]
    moved = abs(n['ax'] - d['ax']) + abs(n['ay'] - d['ay']) + abs(n['w'] - d['w'])
    print(f"{k:32s} w {d['w']:7.1f}->{n['w']:7.1f}  ax {d['ax']:6.1f}->{n['ax']:6.1f}  ay {d['ay']:6.1f}->{n['ay']:6.1f}" + ('  *' if moved > 6 else ''))
    if '--apply' in sys.argv: d.update(n)
if '--apply' in sys.argv:
    json.dump(m, open('assets/manifest.json', 'w'), indent=1)
if '--sheet' in sys.argv:
    out = sys.argv[sys.argv.index('--sheet') + 1]
    tiles = []
    for k in sorted(keys):
        d = m[k]; im = Image.open(d['file']).convert('RGBA').resize((max(1, round(d['w'])), max(1, round(d['h']))))
        bg = Image.new('RGBA', (360, 380), (60, 110, 50, 255)); s = d['size']; cx, cy = 180, 300
        bg.alpha_composite(im, (cx - round(d['ax']), cy - round(d['ay'])))
        dr = ImageDraw.Draw(bg)
        dr.polygon([(cx, cy - s * TH / 2), (cx + s * TW / 2, cy), (cx, cy + s * TH / 2), (cx - s * TW / 2, cy)], outline=(255, 255, 255, 255))
        dr.text((4, 4), k, fill='white'); tiles.append(bg)
    cols = 6; rows_ = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGBA', (360 * cols, 380 * rows_))
    for i, t in enumerate(tiles): sheet.alpha_composite(t, ((i % cols) * 360, (i // cols) * 380))
    sheet.convert('RGB').save(out)
