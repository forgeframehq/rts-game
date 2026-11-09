"""Footprint check: does the painted base of each building sit on the tile square it occupies?

    python3 tools/footprint_check.py              report + overlay sheets

A REPORT, NOT A FIX. --apply exists but is unsafe and off by default: the measurement cannot
tell a porch or front steps (which stand below the plot's bottom corner by design) from a base
that is painted too low, and a yard wall drawn at a slightly different angle reads as a narrow
base. Read the sheets. A building whose base does not follow the grid's 2:1 lines needs
regenerating with the reference-locked prompt; no anchor or scale fixes a painting's angle.

The map plot is a size x size diamond: bottom corner at (ax, ay + size*TH/2), left corner at
(ax - size*TW/2, ay), right corner at (ax + size*TW/2, ay) in the sprite's display pixels. The
painted base is read from the sprite's own alpha: the lowest opaque pixel is the painted bottom
corner, and the leftmost and rightmost opaque pixels within the diamond's own height above it
are the painted side corners (that band holds walls and plinths, not roof eaves).

For every building the report gives, in tiles:
  width     painted base width / plot width (1.00 = the walls span the plot exactly)
  bottom    how far the painted bottom corner is from the plot's (x, y)
  left/right  how far the painted side corners are from the plot's
  tilt      the share of the lower silhouette that follows neither base line; a high share means
            the picture was painted from another angle and scaling cannot fix it: that sprite
            needs regenerating with the reference-locked prompt.

--apply rescales so the painted base spans the plot (times EAVE, a hair wider, since a base
with no overhang at all looks pinched) and moves the anchor so the painted bottom corner lands
on the plot's bottom corner. Farms, walls, resources and the foundation frames are left alone.
Overlay sheets: build/footprint/<region>.png (plot diamond white, painted base red).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAN = os.path.join(ROOT, 'assets', 'manifest.json')
OUT = os.path.join(ROOT, 'build', 'footprint')
TW, TH = 64, 32
EAVE = 1.04
SKIP_TYPES = ('farm', 'farm_spent', 'palisade', 'stonewall', 'gate', 'mill')   # mills: the sails
REGIONS = ['western', 'mediterranean', 'eastasian', 'middleeast', 'americas', 'indian']


def region_of(key):
    for r in REGIONS[1:]:
        if key.startswith(r + '_'): return r
    return 'western'


def base_type(key):
    k = key
    for r in REGIONS[1:]:
        if k.startswith(r + '_'): k = k[len(r) + 1:]
    for t in ('_dark', '_feudal', '_castle', '_imp'):
        if k.endswith(t): k = k[:-len(t)]
    return k


def _fit(xs, ys):
    """Least-squares line through (xs, ys), twice, dropping points more than 3 px off the first fit."""
    if len(xs) < 4: return None
    A = np.vstack([xs, np.ones_like(xs)]).T
    m, c = np.linalg.lstsq(A, ys, rcond=None)[0]
    keep = np.abs(ys - (m * xs + c)) <= 3
    if keep.sum() >= 4:
        m, c = np.linalg.lstsq(A[keep], ys[keep], rcond=None)[0]
    return m, c, keep


def measure(d, im):
    """Painted base in display px relative to the sprite's top-left, from the lower silhouette.
    Each side of the painted bottom corner, the lowest opaque pixel per column traces the ground
    edge of the base (steps, porches and yard walls all stand on the ground; eaves hang above it).
    A line is fitted to each side; where they meet is the painted bottom corner, and the outermost
    column that still lies on its line is a side corner. The lines' slope is the angle the picture
    was painted at: the grid is 2:1, so a slope of 0.5 is right and 0.62 is too steep (a drawing
    from a higher camera), which a vertical squash of 0.5/0.62 corrects."""
    a = np.array(im)[..., 3]
    H, W = a.shape
    sx, sy = d['w'] / W, d['h'] / H          # display px per image px
    solid = a > 150
    cols = np.where(solid.any(0))[0]
    if not len(cols): return None
    low = np.array([np.where(solid[:, x])[0].max() for x in cols], dtype=float)
    xs = cols.astype(float)
    band = low >= low.max() - d['size'] * TH / sy * 1.2
    xs, low = xs[band], low[band]
    bottom_cols = xs[low >= low.max() - 1.5]; xb0 = float(np.median(bottom_cols))
    L = xs < xb0 - 3; R = xs > xb0 + 3
    fl = _fit(xs[L], low[L]) if L.sum() >= 4 else None
    fr = _fit(xs[R], low[R]) if R.sum() >= 4 else None
    if not fl or not fr: return None
    (mL, cL, kL), (mR, cR, kR) = fl, fr
    if abs(mL - mR) < 1e-6: return None
    xb = (cR - cL) / (mL - mR); yb = mL * xb + cL
    onL = xs[L][kL]; onR = xs[R][kR]
    xl = onL.min() if len(onL) else xb; xr = onR.max() if len(onR) else xb
    yl = mL * xl + cL; yr = mR * xr + cR
    slope = (abs(mL) + abs(mR)) / 2
    # how much of the base between the corners strays from the two lines (an L-shape or a yard
    # at another angle leaves a lot of silhouette off both lines)
    inside = (xs > xl) & (xs < xr)
    resid = np.minimum(np.abs(low - (mL * xs + cL)), np.abs(low - (mR * xs + cR)))
    off = float(np.mean(resid[inside] > 6)) if inside.any() else 0.0
    return { 'bottom': (xb * sx, yb * sy), 'left': (xl * sx, yl * sy), 'right': (xr * sx, yr * sy),
             'slope': slope * sy / sx, 'tilt': off }


def main(apply):
    man = json.load(open(MAN))
    os.makedirs(OUT, exist_ok=True)
    rows, tiles = [], {r: [] for r in REGIONS}
    changed = 0
    packs = {}
    for k, d in man.items():
        if not isinstance(d, dict) or 'size' not in d or 'w' not in d or 'ax' not in d: continue
        if k.startswith(('u/', 'res_', 'fnd_', 'stage')) or k == 'stump' or '_s1' in k or '_s2' in k: continue
        if base_type(k) in SKIP_TYPES: continue
        path = os.path.join(ROOT, d['file'])
        if path not in packs: packs[path] = Image.open(path).convert('RGBA')
        im = packs[path]
        if 'sx' in d: im = im.crop((d['sx'], d['sy'], d['sx'] + d['sw'], d['sy'] + d['sh']))
        m = measure(d, im)
        if not m: continue
        size = d['size']
        plot = { 'bottom': (d['ax'], d['ay'] + size * TH / 2), 'left': (d['ax'] - size * TW / 2, d['ay']), 'right': (d['ax'] + size * TW / 2, d['ay']) }
        bw = (m['right'][0] - m['left'][0]) / (size * TW)
        err = { c: ((m[c][0] - plot[c][0]) / TW, (m[c][1] - plot[c][1]) / TH) for c in plot }
        tilt = (m['slope'], m['tilt'])
        flag = []
        if abs(bw - 1) > 0.08: flag.append(f'width {bw:.2f}x')
        if abs(err['bottom'][0]) > 0.12 or abs(err['bottom'][1]) > 0.12: flag.append(f'bottom off ({err["bottom"][0]:+.2f}, {err["bottom"][1]:+.2f})')
        if abs(m['slope'] - 0.5) > 0.04: flag.append(f'angle: base slope {m["slope"]:.2f} (grid is 0.50)')
        if m['tilt'] > 0.4: flag.append(f'base shape: {m["tilt"]:.0%} of it off the two edges REPAINT')
        rows.append((k, bw, err, tilt, flag))
        if apply and flag and not any('REPAINT' in f for f in flag) and (abs(bw - 1) > 0.04 or abs(err['bottom'][0]) > 0.08 or abs(err['bottom'][1]) > 0.08):
            f = EAVE / bw
            # scale about the top-left, then put the painted bottom corner on the plot's bottom corner
            nw, nh = d['w'] * f, d['h'] * f
            bx, by = m['bottom'][0] * f, m['bottom'][1] * f
            d['w'], d['h'] = round(nw, 2), round(nh, 2)
            d['ax'] = round(bx, 2); d['ay'] = round(by - size * TH / 2, 2)
            if 'chim' in d: d['chim'] = [round(d['chim'][0] * f, 1), round(d['chim'][1] * f, 1)]
            d['_fit'] = round(f, 3); changed += 1
        # overlay tile
        t = im.copy(); t.thumbnail((200, 200)); k2 = t.width / im.width
        tile = Image.new('RGBA', (210, 230), (28, 26, 22, 255)); tile.paste(t, (5, 5), t); dr = ImageDraw.Draw(tile)
        px = lambda p: (5 + p[0] / d['w'] * im.width * k2, 5 + p[1] / d['h'] * im.height * k2)
        P = {c: px(plot[c]) for c in plot}; top = (P['bottom'][0], P['bottom'][1] - size * TH / d['h'] * im.height * k2)
        dr.polygon([P['left'], top, P['right'], P['bottom']], outline=(255, 255, 255, 220))
        for c in ('bottom', 'left', 'right'): x, y = px(m[c]); dr.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 60, 60, 255))
        dr.line([px(m['left']), px(m['bottom']), px(m['right'])], fill=(255, 60, 60, 200), width=1)
        dr.text((4, 212), f'{k[:26]} {bw:.2f}x' + (' !' if flag else ''), fill=(255, 220, 140, 255))
        tiles[region_of(k)].append(tile)
    for r, ts in tiles.items():
        if not ts: continue
        cols = 8; n = (len(ts) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * 210, n * 230), (20, 18, 14))
        for i, t in enumerate(ts): sheet.paste(t, ((i % cols) * 210, (i // cols) * 230))
        sheet.save(os.path.join(OUT, f'{r}.png'))
    rep = ['# Footprint check', '', f'{len(rows)} building sprites. width = painted base / plot; offsets in tiles.', '']
    for k, bw, err, tilt, flag in sorted(rows, key=lambda x: (-len(x[4]), x[0])):
        rep.append(f"- {'**' if flag else ''}{k}{'**' if flag else ''}: width {bw:.2f}x, bottom ({err['bottom'][0]:+.2f}, {err['bottom'][1]:+.2f}), left ({err['left'][0]:+.2f}, {err['left'][1]:+.2f}), right ({err['right'][0]:+.2f}, {err['right'][1]:+.2f}), slope {tilt[0]:.2f}, off-edge {tilt[1]:.0%}" + (f"  ← {'; '.join(flag)}" if flag else ''))
    open(os.path.join(OUT, 'report.md'), 'w').write('\n'.join(rep))
    flagged = [r for r in rows if r[4]]
    print(f'{len(rows)} sprites, {len(flagged)} flagged; sheets in build/footprint/')
    for k, bw, err, tilt, flag in sorted(flagged, key=lambda x: x[0]): print(f'  {k:36s} {"; ".join(flag)}')
    if apply:
        json.dump(man, open(MAN, 'w'), indent=1); print(f'manifest written: {changed} sprites refitted to their painted base')


if __name__ == '__main__':
    main('--apply' in sys.argv and '--i-know' in sys.argv)
