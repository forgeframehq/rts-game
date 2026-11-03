"""Turn source building art into game-ready sprites.

Usage: python3 tools/process_art.py <folder with source PNGs> [region]

With a region (mediterranean, eastasian) the sprites are saved under that region's
name - mediterranean_house, eastasian_barracks - which the game prefers for the
dynasties of that region, falling back to the shared western set.

- Removes baked white/checkerboard backgrounds.
- Finds the building's footprint (widest part of its base) and ground point.
- Scales so the footprint matches the tile grid, saves to assets/ at 2x display size.
- Copies the originals to assets/source/.
- Writes assets/manifest.json with anchor points the game uses to place each sprite.
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

TW = 64  # tile width in display px (matches G.TW)
OUT_SCALE = 2  # store at 2x for sharp phones

# source file stem -> (game key, footprint tiles, footprint fudge)
ASSETS = {
    'house': ('house', 2, 1.0),
    'town_center': ('towncenter', 4, 1.0),
    'barracks': ('barracks', 3, 1.0),
    'archery_range': ('range', 3, 1.0),
    'stable': ('stable', 3, 1.0),
    'mill': ('mill', 2, 1.0),
    'lumber_camp': ('lumbercamp', 2, 1.0),
    'mining_camp': ('miningcamp', 2, 1.0),
    'farm': ('farm', 3, 1.0),
    # the harvested field's fence sits lower, so the footprint detector reads it wide;
    # this fudge lines it up exactly with the standing crop it replaces
    'farm_spent': ('farm_spent', 2, 0.6755),
    'watch_tower': ('tower', 1, 1.0),
    'blacksmith': ('blacksmith', 3, 1.0),
    'siege_workshop': ('siegeworkshop', 4, 1.0),
    'monastery': ('monastery', 3, 1.0),
    'castle': ('castle', 4, 1.0),
    'university': ('university', 3, 1.0),
    'construction_site_1x1': ('fnd_1', 1, 1.0),
    'construction_site_2x2': ('fnd_2', 2, 1.0),
    'construction_site_3x3': ('fnd_3', 3, 1.0),
    'construction_site_4x4': ('fnd_4', 4, 1.0),
}


def remove_background(a):
    """a: HxWx4 uint8. Clears near-white, colourless background connected to the border."""
    rgb = a[..., :3].astype(int)
    mn, mx = rgb.min(-1), rgb.max(-1)
    bg = (mn >= 226) & (mx - mn <= 8)
    lab, n = ndimage.label(bg)
    if n:
        sizes = ndimage.sum(bg, lab, range(1, n + 1))
        border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
        kill = np.zeros(n + 1, bool)
        for i in range(1, n + 1):
            if i in border or sizes[i - 1] > 1500:
                kill[i] = True
        rm = kill[lab]
    else:
        rm = np.zeros(bg.shape, bool)
    alpha = a[..., 3].astype(float)
    alpha[rm] = 0
    # soften the light halo left around the edge
    ring = ndimage.binary_dilation(rm, iterations=2) & ~rm
    light = (mn >= 200) & (mx - mn <= 22)
    halo = ring & light
    alpha[halo] *= np.clip((255 - mn[halo]) / 55.0, 0, 1)
    a[..., 3] = alpha.astype(np.uint8)
    return a


# Assets drawn exactly to the master spec: 1x1 footprint, 384x512 canvas,
# footprint centre at (192, 384). No measuring needed. stem -> (game key, display scale)
SPEC_1X1 = {
    '01_oak_tree_full': ('res_tree_0', 1.2),
    '02_oak_tree_variant': ('res_tree_1', 1.2),
    '03_pine_tree_tall': ('res_tree_2', 1.2),
    '04_pine_tree_variant': ('res_tree_3', 1.2),
    '05_berry_bush': ('res_berry', 1.0),
    '06_gold_ore_deposit': ('res_gold', 1.05),
    '07_stone_quarry_deposit': ('res_stone', 1.05),
    '08_tree_stump_chopped': ('stump', 0.9),
}


def process_spec(src_dir, out_dir, keep, manifest):
    for stem, (key, f) in SPEC_1X1.items():
        path = os.path.join(src_dir, stem + '.png')
        if not os.path.exists(path):
            continue
        keep_source(path, keep, stem)
        im = Image.open(path).convert('RGBA')
        k = TW / 256.0 * f  # display px per source px
        out = im.resize((round(im.width * k * OUT_SCALE), round(im.height * k * OUT_SCALE)), Image.LANCZOS)
        out.save(os.path.join(out_dir, key + '.png'), optimize=True)
        manifest[key] = {'file': 'assets/' + key + '.png', 'size': 1,
                         'w': round(im.width * k, 2), 'h': round(im.height * k, 2),
                         'ax': round(192 * k, 2), 'ay': round(384 * k, 2)}
        print(f'{key:12s} {out.width}x{out.height}')


def keep_source(path, keep_dir, stem):
    """Keep the generated original as a reference, but not at 2048px: a few of those
    outweigh the whole game. Shrunk to 1024 and saved as JPEG it is ~5% of the size and
    still perfectly good to re-generate or re-process from."""
    im = Image.open(path).convert('RGBA')
    if max(im.size) <= 1100 and os.path.getsize(path) < 600_000:
        shutil.copy(path, os.path.join(keep_dir, stem + '.png'))
        return
    if max(im.size) > 1024:
        im.thumbnail((1024, 1024), Image.LANCZOS)
    bg = Image.new('RGB', im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[3])
    bg.save(os.path.join(keep_dir, stem + '.jpg'), quality=88, optimize=True)


def process(src_dir, repo, region=None, tier=None):
    pre = region + '_' if region else ''
    suf = '_' + tier if tier else ''   # Age tier: house_dark, mediterranean_mill_dark
    out_dir = os.path.join(repo, 'assets')
    keep = os.path.join(out_dir, 'source', region) if region else os.path.join(out_dir, 'source')
    os.makedirs(keep, exist_ok=True)
    manifest_path = os.path.join(out_dir, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for stem, (key, size, fudge) in ASSETS.items():
        path = os.path.join(src_dir, stem + '.png')
        if not os.path.exists(path):
            continue
        keep_source(path, keep, stem + suf)
        im = Image.open(path).convert('RGBA')
        a = np.array(im)
        if a[..., 3].min() == 255 or (a[..., 3] == 255).mean() > 0.97:
            a = remove_background(a)
        a[..., 3][a[..., 3] < 12] = 0
        ys, xs = np.nonzero(a[..., 3] > 0)
        a = a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        h, w = a.shape[:2]
        solid = a[..., 3] > 128
        # bottom of the art = lowest row with real content
        rows = np.nonzero(solid.sum(1) > 3)[0]
        bottom = rows.max()
        # footprint width = widest row in the lower 30% of the art
        best_w, cx = 0, w / 2
        for y in range(int(h * 0.7), bottom + 1):
            cols = np.nonzero(solid[y])[0]
            if len(cols) and cols[-1] - cols[0] > best_w:
                best_w, cx = cols[-1] - cols[0], (cols[-1] + cols[0]) / 2
        ground_y = bottom - best_w / 4.0  # centre of the footprint diamond
        disp_scale = size * TW * fudge / best_w  # display px per source px
        ow, oh = max(1, round(w * disp_scale * OUT_SCALE)), max(1, round(h * disp_scale * OUT_SCALE))
        out = Image.fromarray(a).resize((ow, oh), Image.LANCZOS)
        fname = pre + key + suf + '.png'
        out.save(os.path.join(out_dir, fname), optimize=True)
        manifest[pre + key + suf] = {
            'file': 'assets/' + fname,
            'size': size,
            'w': round(w * disp_scale, 2), 'h': round(h * disp_scale, 2),
            'ax': round(cx * disp_scale, 2), 'ay': round(ground_y * disp_scale, 2),
        }
        print(f'{pre + key + suf:24s} {ow}x{oh}  footprint {best_w}px of {w}px')
    if not region and not tier:   # trees, ore and bushes are shared by every region
        process_spec(src_dir, out_dir, keep, manifest)
    json.dump(manifest, open(manifest_path, 'w'), indent=1)


if __name__ == '__main__':
    process(sys.argv[1], os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != '-' else None,
            sys.argv[3] if len(sys.argv) > 3 else None)
