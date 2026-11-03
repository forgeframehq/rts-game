"""Turn the painted ground textures into seamless 256px tiles for the game.

    python3 tools/make_ground.py build/art/ground

Each picture is made seamless (blended with a copy of itself shifted by half, weighted so
the seams of each fall in the solid middle of the other), toned to the map's colour so
units still stand out on it, and written to assets/ground/<name>.jpg.
"""
import sys, os
import numpy as np
from PIL import Image
SRC = sys.argv[1]; OUT = 'assets/ground'; os.makedirs(OUT, exist_ok=True)
# target mean colours: close to the old palette, a touch richer
TARGET = {'grass_a': (98, 142, 60), 'grass_b': (116, 140, 64), 'dirt': (146, 118, 80), 'forest_floor': (70, 92, 44)}
S = 512
yy, xx = np.mgrid[0:S, 0:S] / S
w = (np.sin(np.pi * xx) * np.sin(np.pi * yy))[..., None] ** 0.8     # 1 in the middle, 0 at the edges
for k, tgt in TARGET.items():
    a = np.asarray(Image.open(f'{SRC}/{k}.png').convert('RGB').resize((S, S), Image.LANCZOS)).astype(np.float32)
    b = np.roll(np.roll(a, S // 2, 0), S // 2, 1)
    wb = np.roll(np.roll(w, S // 2, 0), S // 2, 1)
    m = (a * w + b * wb) / (w + wb + 1e-6)
    # keep the detail, lower its contrast a little, move the mean to the target
    mean = m.reshape(-1, 3).mean(0)
    m = (m - mean) * 0.8 + np.array(tgt, np.float32)
    im = Image.fromarray(np.clip(m, 0, 255).astype(np.uint8)).resize((256, 256), Image.LANCZOS)
    im.save(f'{OUT}/{k}.jpg', quality=88)
    print(k, os.path.getsize(f'{OUT}/{k}.jpg'))
