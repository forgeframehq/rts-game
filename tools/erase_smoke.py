"""Erase smoke painted into building sprites and record where it rose from.

Usage: python3 tools/erase_smoke.py [key ...]        (no keys: every building in the manifest)

The generated art sometimes paints a plume of smoke over a chimney. Painted smoke never
moves, which looks dead next to the live plume render.js draws, so this finds it (soft,
grey, semi-transparent blobs in the upper part of the sprite, not joined to the building)
and clears it, both in single-file sprites and inside the packed bpack_<region>_<n>.png
sheets. Where it found smoke it writes `chim: [dx, dy]` to the manifest entry, the mouth
of the chimney in display px relative to the sprite's anchor, so the live plume can start
exactly there. Run it again after ingesting new art; sprites without smoke are left alone.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAN = os.path.join(REPO, 'assets', 'manifest.json')


def smoke_mask(a):
    """Boolean mask of painted smoke in an RGBA array, or None."""
    A = a[..., 3]; r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1)
    grey = (sat < 0.18) & (mx > 140) & (A > 8)
    lab, n = ndi.label(grey, structure=np.ones((3, 3)))
    H = A.shape[0]
    out = np.zeros_like(grey)
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if len(ys) < 100 or ys.max() > H * 0.42: continue
        al = A[ys, xs]
        if (al < 240).mean() < 0.25 or al.mean() > 235: continue   # a solid stone wall, not smoke
        comp = lab == i
        ring = ndi.binary_dilation(comp, structure=np.ones((3, 3))) & ~comp
        if (A[ring] >= 250).mean() > 0.3: continue   # leans on solid masonry: a chimney top, not smoke
        out[ys, xs] = True
    if not out.any(): return None
    # stray wisps: small grey flecks floating free in the sky above the roof, touching nothing solid
    for i in range(1, n + 1):
        comp = lab == i
        ys = np.where(comp.any(1))[0]
        if comp.sum() < 6 or ys.max() > H * 0.42 or out[comp].any(): continue
        ring = ndi.binary_dilation(comp, structure=np.ones((5, 5))) & ~comp
        if not (A[ring] >= 250).any(): out |= comp
    # take the soft fringe with it, but never a solid pixel of the building
    ring = ndi.binary_dilation(out, structure=np.ones((3, 3))) & ~out & (A < 170)
    return out | ring


def main(keys):
    man = json.load(open(MAN))
    keys = keys or [k for k, d in man.items() if isinstance(d, dict) and 'file' in d and 'w' in d and 'ax' in d and not k.startswith('u/')]
    packs = {}
    changed = 0
    for k in keys:
        d = man[k]
        path = os.path.join(REPO, d['file'])
        if path not in packs: packs[path] = Image.open(path).convert('RGBA')
        im = packs[path]
        box = (d['sx'], d['sy'], d['sx'] + d['sw'], d['sy'] + d['sh']) if 'sx' in d else (0, 0, im.width, im.height)
        a = np.array(im.crop(box))
        mask = smoke_mask(a)
        if mask is None: continue
        ys, xs = np.where(mask)
        # the chimney mouth: the bottom of the plume, at its horizontal middle down there
        low = ys >= ys.max() - 6
        cx, cy = xs[low].mean(), ys.max()
        a[mask] = 0
        im.paste(Image.fromarray(a), box[:2])
        scale = d['w'] / (box[2] - box[0])   # display px per sheet px
        d['chim'] = [round(float(cx * scale - d['ax']), 1), round(float(cy * scale - d['ay']), 1)]
        print(f'{k:36s} cleared {int(mask.sum()):5d} px, chimney at {d["chim"]}')
        changed += 1
        packs[path].dirty = True
    for path, im in packs.items():
        if getattr(im, 'dirty', False): im.save(path, optimize=True)
    if changed:
        json.dump(man, open(MAN, 'w'), indent=1)
    print(f'{changed} sprite(s) changed')


if __name__ == '__main__':
    main(sys.argv[1:])
