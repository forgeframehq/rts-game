import numpy as np, os, sys
from PIL import Image
from scipy import ndimage
S = sys.argv[1]; OUT = sys.argv[2]; os.makedirs(OUT + '/icons', exist_ok=True)
def key(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    k = g - np.maximum(r, b)
    alpha = np.clip(1 - (k - 25) / 60, 0, 1)
    spill = k > 15
    g2 = np.where(spill, np.maximum(r, b) + np.clip(k, 0, 15), g)
    rgba = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')
def comps(im, n):
    al = np.asarray(im)[..., 3] > 40
    al = ndimage.binary_closing(al, iterations=6)
    lab, cnt = ndimage.label(al)
    sl = ndimage.find_objects(lab)
    sizes = [(((s[0].stop - s[0].start) * (s[1].stop - s[1].start)), s) for s in sl]
    big = [s for _, s in sorted(sizes, key=lambda x: -x[0])[:n]]
    # reading order: rows by y then x
    big.sort(key=lambda s: (round((s[0].start + s[0].stop) / 2 / (im.height / 3.2)), s[1].start))
    return big
def save_icon(im, s, name, size=128, pad=0.06):
    c = im.crop((s[1].start, s[0].start, s[1].stop, s[0].stop))
    w, h = c.size; m = max(w, h); P = int(m * pad)
    sq = Image.new('RGBA', (m + 2 * P, m + 2 * P)); sq.paste(c, ((m - w) // 2 + P, (m - h) // 2 + P))
    sq.resize((size, size), Image.LANCZOS).save(f'{OUT}/icons/{name}.png', optimize=True)
NAMES = {
 's_res': 'food wood gold stone pop clock gear menu laurel',
 's_cmd': 'build stop garrison rally bell ungarrison ageup delete dropoff',
 's_bld': 'house mill lumbercamp miningcamp farm barracks range stable tower',
 's_unit': 'villager militia spearman archer knight longbowman villager_f towncenter attack',
 'o_side': 'idle army box home'}
for sheet, names in NAMES.items():
    im = key(f'{S}/{sheet}.png'); names = names.split()
    cs = comps(im, len(names))
    if sheet == 'o_side': cs.sort(key=lambda s: (round(s[0].start / 150), s[1].start))
    for s, nm in zip(cs, names): save_icon(im, s, nm, 160 if sheet in ('s_unit', 's_bld') else 128)
    print(sheet, len(cs))
for o, w in [('o_ribbon', 900), ('o_button', 900), ('o_corner', 220)]:
    im = key(f'{S}/{o}.png'); bb = im.getbbox(); c = im.crop(bb)
    c.resize((w, round(c.height * w / c.width)), Image.LANCZOS).save(f'{OUT}/{o[2:]}.png', optimize=True); print(o, c.size)
