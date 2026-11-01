"""Turn an AI-generated animation sheet (grid of frames) into a game-ready strip.

Usage: python3 tools/process_sheet.py <sheet.png> <key> <cols> <rows> <mode> [standing_height_px]
mode: stand (upright), bent (farming/foraging), death (falls over)

- Removes a baked background if the image has none.
- Cuts the grid into cells and finds the character in each cell.
- Aligns frames on the feet so the animation doesn't jitter (death keeps one anchor).
- Normalises size so every animation of a character matches (standing height = DISP_H).
- Writes assets/units/<key>.png (2x) and adds frame data to assets/manifest.json.
Prints a consistency report: frame height spread, so drifting sheets can be redone.
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from process_art import remove_background  # noqa: E402

DISP_H = 40.0   # standing character height in display px at zoom 1
OUT_SCALE = 2


def figure_mask(cell):
    solid = cell[..., 3] > 40
    lab, n = ndimage.label(solid)
    if n == 0:
        return None
    sizes = ndimage.sum(solid, lab, range(1, n + 1))
    keep = np.zeros(n + 1, bool)
    big = sizes.max()
    main_i = int(np.argmax(sizes)) + 1
    rgb = cell[..., :3].astype(float)
    for i, s in enumerate(sizes, 1):
        if s < big * 0.02:
            continue
        if i != main_i:
            # drop detached props like bushes (mostly green, not part of the character)
            m = lab == i
            r, g, b = (rgb[..., c][m].mean() for c in range(3))
            if g > r * 1.08 and g > b * 1.05:
                continue
        keep[i] = True
    return keep[lab]


def main(src, key, cols, rows, mode, ref_override=None):
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    a = np.array(Image.open(src).convert('RGBA'))
    if (a[..., 3] == 255).mean() > 0.97:
        a = remove_background(a)
    H, W = a.shape[:2]
    cw, ch = W / cols, H / rows
    frames = []
    for r in range(rows):
        for c in range(cols):
            cell = a[round(r * ch):round((r + 1) * ch), round(c * cw):round((c + 1) * cw)].copy()
            m = figure_mask(cell)
            if m is None or m.sum() < 200:
                continue
            cell[..., 3] = np.where(m, cell[..., 3], 0)
            ys, xs = np.nonzero(m)
            top, bottom, left, right = ys.min(), ys.max(), xs.min(), xs.max()
            low = m[bottom - max(3, int((bottom - top) * 0.18)):bottom + 1]
            foot_x = np.nonzero(low)[1].mean()
            frames.append(dict(img=cell, top=top, bottom=bottom, left=left, right=right, fx=foot_x,
                               h=bottom - top, w=right - left))
    if not frames:
        raise SystemExit('no frames found')
    hs = np.array([f['h'] for f in frames], float)
    if ref_override:
        # same scale for every sheet of a character (its standing height in source px)
        k = DISP_H / ref_override
    elif mode == 'death':
        k = DISP_H / frames[0]['h']
    else:
        k = DISP_H * (0.82 if mode == 'bent' else 1.0) / np.median(hs)
    # anchor: feet line + foot centre (death: first frame's anchor relative to its cell, applied to all)
    if mode == 'death':
        f0 = frames[0]
        for f in frames:
            f['ax'], f['ay'] = f0['fx'], f0['bottom']
    else:
        for f in frames:
            f['ax'], f['ay'] = f['fx'], f['bottom']
    left = max(f['ax'] - f['left'] for f in frames) + 6
    right = max(f['right'] - f['ax'] for f in frames) + 6
    up = max(f['ay'] - f['top'] for f in frames) + 6
    down = max(max(0, f['bottom'] - f['ay']) for f in frames) + 6
    fw, fh = int(left + right), int(up + down)
    n = len(frames)
    sheet = Image.new('RGBA', (fw * n, fh), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        img = Image.fromarray(f['img'])
        frame = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        frame.paste(img, (round(left - f['ax']), round(up - f['ay'])), img)  # paste clips negative offsets
        sheet.paste(frame, (i * fw, 0))
    ow, oh = round(sheet.width * k * OUT_SCALE), round(sheet.height * k * OUT_SCALE)
    sheet = sheet.resize((ow, oh), Image.LANCZOS)
    out_dir = os.path.join(repo, 'assets', 'units')
    os.makedirs(out_dir, exist_ok=True)
    sheet.save(os.path.join(out_dir, key + '.png'), optimize=True)
    man_path = os.path.join(repo, 'assets', 'manifest.json')
    man = json.load(open(man_path))
    man['unit_' + key] = {'file': 'assets/units/' + key + '.png', 'frames': n,
                          'fw': round(fw * k, 2), 'fh': round(fh * k, 2),
                          'ax': round(left * k, 2), 'ay': round(up * k, 2)}
    json.dump(man, open(man_path, 'w'), indent=1)
    spread = (hs.max() - hs.min()) / max(1, np.median(hs))
    print(f'{key}: {n} frames, height spread {spread:.0%}, frame {fw * k:.0f}x{fh * k:.0f}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5],
         float(sys.argv[6]) if len(sys.argv) > 6 else None)
