"""Pack each unit's animation sheets into one image, so the game downloads ~90 files, not ~540.

    python3 tools/pack_units.py            # pack every assets/units sheet listed in the manifest
    python3 tools/pack_units.py --unpack   # (not needed: the originals are kept in git history)

Sheets are grouped by unit (unit3d_<civ>_<type>_<sex>[_tN], or unit_<civ>_<type>_<sex>) and
stacked top to bottom in assets/units/pack_<group>.png. Each manifest entry keeps its own
frames/rows/anchor and gains `sx, sy, sw, sh`: where its sheet sits in the packed image (in
the stored pixels). js/art.js cuts the sheet back out when it loads. The packed image stays
under 8192 px tall, the safe texture limit on phones; a group that would be taller is split.
"""
import json, os, re
from PIL import Image
MAX_H = 8192
man = json.load(open('assets/manifest.json'))
groups = {}
for k, d in man.items():
    if not isinstance(d, dict) or not d.get('file', '').startswith('assets/units/') or 'sy' in d: continue
    m = re.match(r'^(unit3d_[a-z]+_[a-z]+_[mf](?:_t\d)?|unit_[a-z]+_[a-z]+_[mf])_', k)
    if not m: continue
    groups.setdefault(m.group(1), []).append(k)
packed = 0; removed = set()
for g, keys in sorted(groups.items()):
    keys.sort(); part = 0; batch = []; h = 0
    def flush(batch, part):
        global packed
        if not batch: return
        ims = [(k, Image.open(man[k]['file']).convert('RGBA')) for k in batch]
        W = max(im.width for _, im in ims); H = sum(im.height for _, im in ims)
        out = Image.new('RGBA', (W, H), (0, 0, 0, 0)); y = 0
        name = f'assets/units/pack_{g}' + (f'_{part}' if part else '') + '.png'
        for k, im in ims:
            out.paste(im, (0, y))
            removed.add(man[k]['file'])
            man[k].update(file=name, sx=0, sy=y, sw=im.width, sh=im.height); y += im.height
        out.save(name, optimize=True); packed += 1
    for k in keys:
        hh = Image.open(man[k]['file']).height
        if batch and h + hh > MAX_H: flush(batch, part); part += 1; batch = []; h = 0
        batch.append(k); h += hh
    flush(batch, part)
still = {d['file'] for d in man.values() if isinstance(d, dict) and 'file' in d}
for f in removed - still:
    if os.path.exists(f): os.remove(f)
json.dump(man, open('assets/manifest.json', 'w'), indent=1)
print(f'{packed} packed images from {len(removed)} sheets')
