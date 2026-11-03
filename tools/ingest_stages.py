"""Turn painted construction stages into game sprites, in their own index.

    python3 tools/ingest_stages.py build/art/stages

Each <building key>_s1.png (bare frame) and _s2.png (half built) is cut from its white
background, measured for its footprint the way tools/process_art.py measures a building
(widest row of the lower 30%), scaled to the building's footprint and written to
assets/stages/. Their entries go in assets/stages.json, not the main manifest, so this can
run while unit renders are updating assets/manifest.json.
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from process_art import remove_background, TW, OUT_SCALE
src = sys.argv[1]
man = json.load(open('assets/manifest.json'))
os.makedirs('assets/stages', exist_ok=True)
out = json.load(open('assets/stages.json')) if os.path.exists('assets/stages.json') else {}
for f in sorted(os.listdir(src)):
    if not f.endswith('.png') or '_s' not in f: continue
    key = f[:-4]; base = key.rsplit('_s', 1)[0]
    if base not in man: print('no building', base); continue
    size = man[base]['size']
    a = np.array(Image.open(os.path.join(src, f)).convert('RGBA'))
    a = remove_background(a)
    a[..., 3][a[..., 3] < 12] = 0
    ys, xs = np.nonzero(a[..., 3] > 0)
    a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = a.shape[:2]; solid = a[..., 3] > 128
    bottom = np.nonzero(solid.sum(1) > 3)[0].max()
    best_w, cx = 0, w / 2
    for y in range(int(h * 0.7), bottom + 1):
        cols = np.nonzero(solid[y])[0]
        if len(cols) and cols[-1] - cols[0] > best_w: best_w, cx = cols[-1] - cols[0], (cols[-1] + cols[0]) / 2
    k = size * TW / best_w
    ow, oh = max(1, round(w * k * OUT_SCALE)), max(1, round(h * k * OUT_SCALE))
    Image.fromarray(a).resize((ow, oh), Image.LANCZOS).save(f'assets/stages/{key}.png', optimize=True)
    out[key] = {'file': f'assets/stages/{key}.png', 'size': size, 'w': round(w * k, 2), 'h': round(h * k, 2),
                'ax': round(cx * k, 2), 'ay': round((bottom - best_w / 4) * k, 2)}
    print(f'{key:36s} footprint {best_w}px of {w}px')
json.dump(out, open('assets/stages.json', 'w'), indent=1)
