"""Plant every unit animation on its feet.

For each sheet in assets/manifest.json (unit3d_*), measures where the feet are in each of
the 8 directions (the centre of the lowest band of the figure, median over frames) and
stores the correction from the sheet's anchor as `fo`: [[dx, dy] x 8] in display px.
art.js drawFrame3 shifts each frame by it, so a unit's feet sit on its shadow whatever the
pose; without it, the shooting archer jumped sideways off his spot between poses.

Run after adding or re-rendering unit art:  python3 tools/foot_anchor.py
"""
import json
from PIL import Image
import numpy as np

M = json.load(open('assets/manifest.json'))
imgs = {}
n = 0
for k, d in M.items():
    if not k.startswith('unit3d_') or 'frames' not in d or not d.get('sh'):
        continue
    if d['file'] not in imgs:
        imgs[d['file']] = np.array(Image.open(d['file']).convert('RGBA'))[:, :, 3]
    sx, sy = d.get('sx', 0), d.get('sy', 0)
    a = imgs[d['file']][sy:sy + d['sh'], sx:sx + d['sw']]
    cw, ch = d['sw'] / d['frames'], d['sh'] / d['rows']
    death = k.endswith('_death')
    fo = []
    for r in range(d['rows']):
        ys, xs = [], []
        for f in range(d['frames'] if not death else 1):   # a fall: plant the first frame only
            c = a[int(r * ch):int((r + 1) * ch), int(f * cw):int((f + 1) * cw)] > 128
            yy = np.where(c.any(axis=1))[0]
            if not len(yy):
                continue
            bot, top = yy[-1], yy[0]
            band = c[max(0, bot - max(2, int((bot - top) * 0.10))):bot + 1]
            x = np.where(band.any(axis=0))[0]
            ys.append(bot / ch * d['fh'])
            xs.append((x.min() + x.max()) / 2 / cw * d['fw'])
        if not ys:
            fo.append([0, 0]); continue
        # keep the sheet's own small "sole" lift (~2 px) so units don't sink: only correct x, and y beyond 2 px
        dx = float(np.median(xs)) - d['ax']
        dy = float(np.median(ys)) - d['ay'] - 2
        fo.append([round(dx, 1), round(dy, 1) if abs(dy) > 1 else 0])
    d['fo'] = fo
    n += 1
json.dump(M, open('assets/manifest.json', 'w'), indent=1)
print(n, 'sheets planted')
