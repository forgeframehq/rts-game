"""Cut a generated icon out of its background and size it for the command panel.

Usage: python3 tools/cut_icon.py <in.png> <name> [more.png name ...]
       python3 tools/cut_icon.py --preview        (contact sheet of assets/ui/icons)

Icons made by tools/gen_art.py come back as a portrait on a flat dark background. The
panel draws them over the button art, so they need an alpha cutout, 160x160, like the
hand-made set in assets/ui/icons/.

The background is found by the median of a border strip — not by one corner, because a
bright patch in a corner skews the reference colour and the mask then takes half the
figure with it — and only the dark region connected to the border is removed, so dark
armour or hair inside the figure survives. The cut edge is feathered so it does not look
stamped out.

Remember to add the name to the ICONS set in js/ui.js, or the panel falls back to emoji.
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO, 'assets', 'ui', 'icons')
SIZE = 160
TOL = 42          # colour distance (summed over RGB) still counted as background
FEATHER = 3       # px of soft edge


def cut(src, name):
    a = np.asarray(Image.open(src).convert('RGB')).astype(float)
    h, w = a.shape[:2]
    border = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3),
                             a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg_col = np.median(border, axis=0)
    d = np.abs(a - bg_col).sum(-1)
    lab, n = ndimage.label(d < TOL)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    rm = np.isin(lab, list(edge))
    alpha = np.where(rm, 0.0, 1.0)
    ring = ndimage.binary_dilation(rm, iterations=FEATHER) & ~rm
    alpha[ring] = np.clip((d[ring] - TOL) / 46.0, 0, 1)
    if alpha.mean() > 0.97:
        print(f'  ! {name}: background not found (is it flat?) — left uncut')
    im = Image.fromarray(np.dstack([a, alpha * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(alpha > 0.25)
    im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    iw, ih = im.size
    m = int(max(iw, ih) * 1.06)
    sq = Image.new('RGBA', (m, m))
    sq.alpha_composite(im, ((m - iw) // 2, (m - ih) // 2))
    os.makedirs(OUT, exist_ok=True)
    sq.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(OUT, name + '.png'), optimize=True)
    print(f'  {name}: kept {100 * (alpha > 0.25).mean():.0f}% of the frame')


def preview(path='icons_preview.png'):
    """On a light background, so a halo or a missed background shows up."""
    names = sorted(f[:-4] for f in os.listdir(OUT) if f.endswith('.png'))
    cols = 8
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 170, rows * 170), (170, 160, 145, 255))
    for i, n in enumerate(names):
        sheet.alpha_composite(Image.open(os.path.join(OUT, n + '.png')).convert('RGBA'),
                              ((i % cols) * 170 + 5, (i // cols) * 170 + 5))
    sheet.convert('RGB').save(path)
    print(f'{len(names)} icons -> {path}')


if __name__ == '__main__':
    if sys.argv[1] == '--preview':
        preview(sys.argv[2] if len(sys.argv) > 2 else 'icons_preview.png')
    else:
        args = sys.argv[1:]
        for src, name in zip(args[::2], args[1::2]):
            cut(src, name)
