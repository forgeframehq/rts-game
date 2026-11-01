"""Turn 3D-rendered sprite sheets (frames across, 8 directions down) into game-ready sheets.

Usage: python3 tools/process_render.py <render_dir> <key_prefix> [standing_px] [anim,anim,...]
Example: python3 tools/process_render.py out_m unit3d_britons_villager_m 150

For every <anim>.png + <anim>.json in <render_dir> (made by tools/render3d/drive_jobs.py):
- crops every frame to one shared box (so animation keeps its alignment) per animation
- scales so a standing character is DISP_H display px tall (the render's `height` is standing_px)
- writes assets/units/<key_prefix>_<anim>.png (2x) and an entry in assets/manifest.json:
  frames, rows (8 directions: S SE E NE N NW W SW), fw/fh/ax/ay in display px (ax/ay = foot anchor)
"""
import json
import os
import sys

import numpy as np
from PIL import Image

DISP_H = 40.0
OUT_SCALE = 2


def main(rdir, prefix, standing_px=150.0, only=None):
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(repo, 'assets', 'units')
    os.makedirs(out_dir, exist_ok=True)
    man_path = os.path.join(repo, 'assets', 'manifest.json')
    man = json.load(open(man_path))
    k = DISP_H / standing_px            # display px per render px
    names = sorted(f[:-5] for f in os.listdir(rdir) if f.endswith('.json'))
    for name in names:
        if only and name not in only:
            continue
        meta = json.load(open(f'{rdir}/{name}.json'))
        im = Image.open(f'{rdir}/{name}.png').convert('RGBA')
        F, n, rows = meta['frame'], meta['frames'], meta['dirs']
        a = np.array(im)[..., 3] > 12
        ys, xs = np.nonzero(a)
        pad = 3
        # shared crop box across all frames and directions (within one frame cell)
        cell_x = xs % F
        cell_y = ys % F
        x0, x1 = max(0, cell_x.min() - pad), min(F, cell_x.max() + 1 + pad)
        y0, y1 = max(0, cell_y.min() - pad), min(F, cell_y.max() + 1 + pad)
        cw, ch = x1 - x0, y1 - y0
        sheet = Image.new('RGBA', (cw * n, ch * rows), (0, 0, 0, 0))
        for r in range(rows):
            for c in range(n):
                cell = im.crop((c * F + x0, r * F + y0, c * F + x1, r * F + y1))
                sheet.paste(cell, (c * cw, r * ch))
        ow, oh = round(sheet.width * k * OUT_SCALE), round(sheet.height * k * OUT_SCALE)
        sheet = sheet.resize((ow, oh), Image.LANCZOS)
        key = f'{prefix}_{name}'
        sheet.save(os.path.join(out_dir, key + '.png'), optimize=True)
        ax, ay = meta['anchor']['x'] - x0, meta['anchor']['y'] - y0
        man[key] = {'file': f'assets/units/{key}.png', 'frames': n, 'rows': rows,
                    'fw': round(cw * k, 2), 'fh': round(ch * k, 2), 'ax': round(ax * k, 2), 'ay': round(ay * k, 2)}
        print(f'{key}: {n}x{rows} frames, {ow}x{oh}px, cell {cw * k:.0f}x{ch * k:.0f}')
    json.dump(man, open(man_path, 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 150.0,
         sys.argv[4].split(',') if len(sys.argv) > 4 else None)
