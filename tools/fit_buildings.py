"""Fit building sprites to their footprint: size and anchor taken from the opaque pixels.

A building's front corner (lowest opaque pixel) should sit on the front corner of its
footprint diamond, centred left-to-right, and the art should be no wider than its
footprint plus a little overhang. Art that was ingested oversized or pinned off-centre
(the Dark Age longhouses, the farm) is corrected; art that already fits barely moves.

    python3 tools/fit_buildings.py            # report
    python3 tools/fit_buildings.py --apply    # rewrite assets/manifest.json
"""
import json, sys
from PIL import Image
TW, TH, OVER = 64, 32, 1.12
m = json.load(open('assets/manifest.json'))
apply = '--apply' in sys.argv
for k, d in m.items():
    if not isinstance(d, dict) or not d.get('size') or k.startswith(('res_', 'stump', 'fnd_')) or 'file' not in d:
        continue
    im = Image.open(d['file']).convert('RGBA')
    sx, sy = im.width / d['w'], im.height / d['h']
    a = im.getchannel('A').point(lambda v: 255 if v > 200 else 0)
    x0, y0, x1, y1 = a.getbbox()
    bw = (x1 - x0) / sx
    s = d['size']
    k_ = min(1.0, s * TW * OVER / bw)
    w, h = d['w'] * k_, d['h'] * k_
    ax = (x0 + x1) / 2 / sx * k_
    ay = y1 / sy * k_ - s * TH / 2 * 0.9          # ground centre sits half a diamond above the front corner
    moved = abs(ax - d['ax']) + abs(ay - d['ay']) + abs(w - d['w'])
    flag = '  <-- fixed' if moved > 12 else ''
    print(f"{k:34s} scale {k_:.2f} ax {d['ax']:.0f}->{ax:.0f} ay {d['ay']:.0f}->{ay:.0f}{flag}")
    if apply and moved > 12:
        d.update(w=round(w, 2), h=round(h, 2), ax=round(ax, 2), ay=round(ay, 2))
if apply:
    json.dump(m, open('assets/manifest.json', 'w'), indent=1)
