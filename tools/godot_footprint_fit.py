"""Godot edition: make the buildings whose painted base is the wrong shape still sit inside their plot.

The 25 sprites in tools/footprint_repaint.txt are long halls, L shapes or yards that no anchor can
put on a square; they wait for a repaint. Until then this measures each one's painted base (the rectangle
that bounds it on the ground, from its lowest corner and its leftmost and rightmost pixels), shrinks the sprite until the
longer edge fits the plot, and centres the base on the plot. A long hall ends up smaller than its
neighbours, but nothing spills over other tiles. Writes godot/data/footprint_fit.json
({key: {w, h, ax, ay}}), which view/art.gd lays over the manifest, and a contact sheet to check by eye.

    python3 tools/godot_footprint_fit.py
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
man = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
keys = [l.strip() for l in open(os.path.join(ROOT, 'tools', 'footprint_repaint.txt')) if l.strip() and not l.startswith('#')]
cache = {}

def sprite(d):
    f = d['file']
    if f not in cache: cache[f] = Image.open(os.path.join(ROOT, f)).convert('RGBA')
    im = cache[f]
    if 'sx' in d: im = im.crop((d['sx'], d['sy'], d['sx'] + d['sw'], d['sy'] + d['sh']))
    return im.resize((round(d['w']), round(d['h'])), Image.LANCZOS)

def measure(im):
    a = np.array(im)[:, :, 3] > 100
    h, w = a.shape
    cols = np.where(a.any(axis=0))[0]
    low = np.full(w, -1)
    for x in cols: low[x] = np.where(a[:, x])[0].max()
    by = low.max(); bx = int(np.median(np.where(low >= by - 1)[0]))
    # The footprint's bounding rectangle: its left and right corners are the leftmost and rightmost
    # painted pixels, whatever the shape inside (an L-shaped hall and yard included). Roof eaves
    # add a few pixels, which only errs on the side of fitting.
    lx, rx = int(cols.min()), int(cols.max())
    return bx, by, (bx - lx) / 32.0, (rx - bx) / 32.0      # edge lengths in tiles

out = {}; tiles = []
for k in keys:
    if k not in man: continue
    d = man[k]; S = d['size']; im = sprite(d)
    bx, by, a, b = measure(im)
    a = max(a, 1.0); b = max(b, 1.0)
    s = min(1.0, S / a, S / b)
    cx = bx - a * 16 + b * 16; cy = by - (a + b) * 8      # the middle of the painted base
    out[k] = {'w': round(d['w'] * s, 2), 'h': round(d['h'] * s, 2), 'ax': round(cx * s, 2), 'ay': round(cy * s, 2)}
    # overlay: old plot (red) and new plot (white) on the sprite
    pad = 110; cv = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (70, 110, 60, 255)); cv.alpha_composite(im, (pad, pad))
    dr = ImageDraw.Draw(cv)
    def dia(ax, ay, size, col):
        p = [(ax, ay - size * 16), (ax + size * 32, ay), (ax, ay + size * 16), (ax - size * 32, ay)]
        dr.line([(x + pad, y + pad) for x, y in p + p[:1]], fill=col, width=2)
    dia(d['ax'], d['ay'], S, (255, 60, 60, 255)); dia(cx, cy, S / s, (255, 255, 255, 255))
    dr.text((6, 4), f'{k}  a={a:.1f} b={b:.1f} S={S} scale={s:.2f}', fill=(255, 255, 255, 255))
    tiles.append(cv.resize((cv.width * 300 // max(cv.size), cv.height * 300 // max(cv.size))))
json.dump(out, open(os.path.join(ROOT, 'godot', 'data', 'footprint_fit.json'), 'w'), indent=1)
W = 5; sheet = Image.new('RGB', (W * 300, ((len(tiles) + W - 1) // W) * 300), (30, 30, 30))
for i, t in enumerate(tiles): sheet.paste(t, ((i % W) * 300, (i // W) * 300))
os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True); sheet.save(os.path.join(ROOT, 'build', 'godot_footprint_fit.png'))
for k, v in out.items(): print(k, 'scale', round(v['w'] / man[k]['w'], 2))
