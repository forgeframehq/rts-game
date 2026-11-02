"""Quantise sprite sheets to a palette, which is most of the game's download.

Usage: python3 tools/shrink_sprites.py [--apply] [path ...]
       (no --apply reports what it would save and changes nothing)

The 3D renders come out as 24-bit PNGs, and a phone has to fetch every one before the
first battle. A sprite sheet is flat shaded with a limited range of colour, so a 255-entry
palette holds it at about a fifth of the size and an average error of 4 or 5 levels out of
255, which is invisible at the size a unit is drawn.

The magenta team colour and the per-dynasty villager dye both find their pixels by
threshold, so the one thing that matters is that quantising does not drag a magenta pixel
out of range or soften a hard alpha edge into a halo. Both are checked here: run with no
--apply and it reports the worst magenta drift and the alpha error it would introduce.
"""
import io, json, os, sys
import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COLORS = 255          # one entry is kept for full transparency
RAMP = 16             # brightness steps the team colour is collapsed to (see snap_magenta)


def magenta_mask(a):
    """The same test js/art.js uses to find team colour, so we measure what it will see."""
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    lo = np.minimum(r, b)
    m = np.clip((lo - g - 18) / 40, 0, 1) * np.clip(1 - (np.abs(r - b) - 70) / 80, 0, 1)
    return m


def snap_magenta(im):
    """Put every team-colour pixel on a pure magenta ramp before quantising.

    The game replaces these pixels with the player's colour and keeps only their
    brightness — lum = (r + b) / 2 / 210 in js/art.js — so their exact hue carries no
    information. Snapping them to (L, 0, L) preserves that brightness exactly, makes them
    unmistakable to the mask, and collapses a smear of near-magentas into one line in
    colour space, which costs the palette far less. Without this, one magenta pixel in
    twenty-five on a villager quantises away from the mask and renders as a raw pink
    speck on the unit.
    """
    a = np.asarray(im).astype(int).copy()
    m = magenta_mask(a)
    strong = m > 0.5
    if strong.any():
        # a coarse ramp survives quantising far better than a smooth one: with 16 steps
        # the quantiser keeps them as entries, with 48 it starts merging them away
        step = 255 / (RAMP - 1)
        L = (np.round(((a[..., 0] + a[..., 2]) / 2) / step) * step).astype(int)
        a[..., 0] = np.where(strong, L, a[..., 0])
        a[..., 1] = np.where(strong, 0, a[..., 1])
        a[..., 2] = np.where(strong, L, a[..., 2])
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def shrink(path, apply=False):
    before = os.path.getsize(path)
    im = Image.open(path)
    if im.mode != 'RGBA':
        im = im.convert('RGBA')
    src = snap_magenta(im)
    q = src.quantize(colors=COLORS, method=Image.FASTOCTREE, dither=Image.Dither.NONE)
    buf = io.BytesIO()
    q.save(buf, 'PNG', optimize=True)
    after = buf.tell()
    a = np.asarray(im).astype(int)
    b = np.asarray(q.convert('RGBA')).astype(int)
    # drift is measured against the ORIGINAL, so snapping cannot hide a problem
    vis = a[..., 3] > 40
    err = np.abs(a[..., :3] - b[..., :3])[vis].mean() if vis.any() else 0.0
    aerr = np.abs(a[..., 3] - b[..., 3]).mean()
    # how far the team-colour mask moves, where it matters
    m0, m1 = magenta_mask(a), magenta_mask(b)
    drift = np.abs(m0 - m1)[vis].max() if vis.any() else 0.0
    if apply and after < before:
        buf.seek(0)
        open(path, 'wb').write(buf.read())
    return before, after, err, aerr, drift


def main(apply, paths):
    files = []
    for p in paths:
        p = os.path.join(REPO, p) if not os.path.isabs(p) else p
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                files += [os.path.join(root, n) for n in names if n.endswith('.png')]
        elif p.endswith('.png'):
            files.append(p)
    tot0 = tot1 = 0
    worst_err = worst_alpha = worst_drift = 0.0
    worst_name = ''
    for f in sorted(files):
        b0, b1, err, aerr, drift = shrink(f, apply)
        tot0 += b0; tot1 += min(b1, b0)
        if err > worst_err:
            worst_err, worst_name = err, os.path.basename(f)
        worst_alpha = max(worst_alpha, aerr)
        worst_drift = max(worst_drift, drift)
    print(f'{len(files)} files: {tot0/1e6:.1f} MB -> {tot1/1e6:.1f} MB  ({100*tot1/max(tot0,1):.0f}%)')
    print(f'worst colour error {worst_err:.2f}/255 ({worst_name})')
    print(f'worst alpha error  {worst_alpha:.3f}/255')
    print(f'worst team-colour mask drift {worst_drift:.3f} (0 = the recolour sees exactly the same pixels)')
    if not apply:
        print('\nnothing written — pass --apply to do it')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--apply']
    # only the sprites the game downloads; assets/source holds references, not assets
    main('--apply' in sys.argv, args or ['assets/units', 'assets/ui/icons'] + 
         [os.path.join('assets', f) for f in os.listdir(os.path.join(REPO, 'assets')) if f.endswith('.png')])
