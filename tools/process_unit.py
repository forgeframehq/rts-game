"""Turn a horizontal unit animation strip into a game-ready sprite strip.

Usage: python3 tools/process_unit.py <strip.png> <key> <frames> [display_height]
Example: python3 tools/process_unit.py villager_walk.png villager_walk 8 40

- Slices the strip into equal-width frames.
- Aligns every frame on the character's head (x) and feet (y) so it doesn't jitter.
- Scales to the display height (px at zoom 1), stores at 2x, writes assets/units/<key>.png.
- Adds frame size and anchor (feet position) to assets/manifest.json.
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

OUT_SCALE = 2


def main(src, key, frames, disp_h=40.0):
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_dir = os.path.join(repo, 'assets', 'units')
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.join(repo, 'assets', 'source', 'units'), exist_ok=True)
    shutil.copy(src, os.path.join(repo, 'assets', 'source', 'units', key + '.png'))
    a = np.array(Image.open(src).convert('RGBA'))
    H, W = a.shape[:2]
    step = W / frames
    cells = []
    for i in range(frames):
        x0, x1 = round(i * step), round((i + 1) * step)
        c = a[:, x0:x1].copy()
        solid = c[..., 3] > 40
        ys = np.nonzero(solid.any(1))[0]
        top, bottom = ys.min(), ys.max()
        upper = solid[top:top + int((bottom - top) * 0.45)]
        head_x = np.nonzero(upper)[1].mean()
        cells.append((c, top, bottom, head_x))
    char_h = np.median([b - t for _, t, b, _ in cells])
    k = disp_h / char_h  # display px per source px
    # common frame box around the anchor (head x, feet y)
    left = max(hx for _, _, _, hx in cells)
    right = max(c.shape[1] - hx for c, _, _, hx in cells)
    up = max(b for _, _, b, _ in cells) - min(t for _, t, _, _ in cells) + 6
    fw, fh = int(left + right) + 4, int(up) + 10
    ax, ay = left + 2, up + 4  # anchor inside the frame (feet line)
    sheet = Image.new('RGBA', (fw * frames, fh), (0, 0, 0, 0))
    for i, (c, top, bottom, hx) in enumerate(cells):
        img = Image.fromarray(c)
        ox = round(i * fw + ax - hx)
        oy = round(ay - bottom)
        sheet.alpha_composite(img, (max(0, ox), max(0, oy)), (max(0, -ox), max(0, -oy)))
    ow, oh = round(sheet.width * k * OUT_SCALE), round(sheet.height * k * OUT_SCALE)
    sheet = sheet.resize((ow, oh), Image.LANCZOS)
    sheet.save(os.path.join(out_dir, key + '.png'), optimize=True)
    man_path = os.path.join(repo, 'assets', 'manifest.json')
    man = json.load(open(man_path))
    man['unit_' + key] = {'file': 'assets/units/' + key + '.png', 'frames': frames,
                          'fw': round(fw * k, 2), 'fh': round(fh * k, 2),
                          'ax': round(ax * k, 2), 'ay': round(ay * k, 2)}
    json.dump(man, open(man_path, 'w'), indent=1)
    print(key, sheet.size, 'frame', round(fw * k, 1), 'x', round(fh * k, 1))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), float(sys.argv[4]) if len(sys.argv) > 4 else 40.0)
