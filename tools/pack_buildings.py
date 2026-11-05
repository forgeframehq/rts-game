"""Pack each regional building set into a few images, so the game downloads (and the web build
publishes) a handful of files per style instead of ~22.

    python3 tools/pack_buildings.py [region ...]     # default: every regional style

Buildings whose manifest key starts with <region>_ are stacked into assets/bpack_<region>_<n>.png
(under 4096 px tall, the safe texture size on older phones; a set that would be taller is split).
Each manifest entry keeps its own size/anchor and gains `sx, sy, sw, sh`: where its picture sits
in the packed image. js/art.js already cuts packed pictures back out (as it does unit sheets).
The single files are deleted afterwards; run tools/ingest_art.py again to recreate them.
"""
import json, os, sys
from PIL import Image

MAX_H = 4096
REGIONS = sys.argv[1:] or ['mediterranean', 'eastasian', 'middleeast', 'americas', 'indian']
man = json.load(open('assets/manifest.json'))
for reg in REGIONS:
    keys = sorted(k for k, d in man.items() if k.startswith(reg + '_') and isinstance(d, dict)
                  and d.get('file', '').startswith('assets/') and 'sh' not in d and not d['file'].startswith('assets/units/'))
    if not keys:
        continue
    imgs = {k: Image.open(man[k]['file']).convert('RGBA') for k in keys}
    groups, cur, h = [], [], 0
    for k in keys:
        if cur and h + imgs[k].height > MAX_H:
            groups.append(cur); cur, h = [], 0
        cur.append(k); h += imgs[k].height
    if cur:
        groups.append(cur)
    old = set()
    for n, g in enumerate(groups):
        W, H = max(imgs[k].width for k in g), sum(imgs[k].height for k in g)
        sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0)); y = 0
        out = f'assets/bpack_{reg}_{n}.png'
        for k in g:
            im = imgs[k]; sheet.paste(im, (0, y))
            old.add(man[k]['file'])
            man[k].update(file=out, sx=0, sy=y, sw=im.width, sh=im.height); y += im.height
        sheet.save(out, optimize=True)
        print(out, f'{W}x{H}', len(g), 'buildings', f'{os.path.getsize(out) / 1e6:.1f} MB')
    for f in old:
        if os.path.exists(f) and not any(d.get('file') == f for d in man.values() if isinstance(d, dict)):
            os.remove(f)
json.dump(man, open('assets/manifest.json', 'w'), indent=1)
