"""Build per-region building icons from the regional building art already in the repo.

    python3 tools/make_region_icons.py

No image generation and no API: every regional building is already painted and packed
into assets/bpack_<region>_<n>.png. An icon is just that sprite cropped out of its pack,
its magenta team-colour dyed to the menu blue, trimmed and scaled into a 160x160 box --
the same size as the hand-painted western icons in assets/ui/icons/.

Writes assets/ui/icons/<region>_<building>.png for every region but western, which keeps
the painted originals. js/ui.js looks for the regional file first and falls back to the
western one, so a missing file is never an error.
"""
import json, os
import numpy as np
from PIL import Image

PX = 160          # icon box, matching the painted western icons
PAD = 10          # breathing room inside the box
TEAM = (47, 111, 214)   # #2f6fd6, the blue the painted icons use

REGIONS = ['mediterranean', 'eastasian', 'middleeast', 'americas', 'indian']
# every building that has a painted icon; walls and gates are drawn in code, so they have
# no regional art and keep the shared icon
BUILDINGS = ['towncenter', 'house', 'mill', 'lumbercamp', 'miningcamp', 'farm', 'barracks',
             'range', 'stable', 'blacksmith', 'monastery', 'siegeworkshop', 'university',
             'infirmary', 'castle', 'tower']


def dye(rgb):
    """Team-colour pass, the same test art.js uses: red and blue both well above green."""
    d = rgb.astype(np.float32)
    r, g, b = d[..., 0], d[..., 1], d[..., 2]
    lo = np.minimum(r, b)
    m = np.clip((lo - g - 18) / 40, 0, 1) * np.clip(1 - (np.abs(r - b) - 70) / 80, 0, 1)
    lum = np.minimum(1.35, (r + b) / 2 / 210)
    for i, t in enumerate(TEAM):
        d[..., i] = d[..., i] + (np.minimum(255, t * lum) - d[..., i]) * m
    return d.clip(0, 255).astype(np.uint8)


def icon(entry):
    im = Image.open(entry['file']).convert('RGBA')
    if 'sx' in entry:   # cut it out of its pack
        im = im.crop((entry['sx'], entry['sy'], entry['sx'] + entry['sw'], entry['sy'] + entry['sh']))
    a = np.array(im)
    a[..., :3] = dye(a[..., :3])
    im = Image.fromarray(a)
    bb = im.getbbox()
    if not bb:
        return None
    im = im.crop(bb)
    w, h = im.size
    k = min((PX - PAD * 2) / w, (PX - PAD * 2) / h)
    im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    out = Image.new('RGBA', (PX, PX), (0, 0, 0, 0))
    out.paste(im, ((PX - im.size[0]) // 2, (PX - im.size[1]) // 2), im)
    return out


def main():
    man = json.load(open('assets/manifest.json'))
    os.makedirs('assets/ui/icons', exist_ok=True)
    made = skipped = 0
    for region in REGIONS:
        for b in BUILDINGS:
            key = f'{region}_{b}'
            if key not in man:        # e.g. the Incas have no Stable
                skipped += 1
                continue
            im = icon(man[key])
            if im is None:
                skipped += 1
                continue
            im.save(f'assets/ui/icons/{key}.png', optimize=True)
            made += 1
    print(f'{made} icons written, {skipped} skipped (no regional art)')


if __name__ == '__main__':
    main()
