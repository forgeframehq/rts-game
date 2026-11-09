"""Make every building sit on its tile square: fix the angle where it can be fixed, list the rest.

    python3 tools/footprint_fix.py                 report only
    python3 tools/footprint_fix.py --apply         squash too-steep sprites in the manifest, write the repaint job
    KIE_KEY=... python3 tools/footprint_fix.py --apply --run   ...and generate the repaints (~6 credits each)

Two kinds of misfit come out of tools/footprint_check.py:

1. ANGLE. The grid is 2:1 (ground edges at slope 0.50). Many sprites were painted from a higher
   camera, with ground edges at 0.6–0.7, so a 2:1 plot can never lie on their base however they
   are scaled or moved: the yard tips toward the viewer. A vertical squash of 0.5/slope puts the
   base on the grid (the renderer scales width and height independently, so this is a manifest
   change: h and ay). Done for sprites whose base is clean (little of it off the two edges) and
   whose slope is at least 0.57; the squash is clamped to 0.72.
2. SHAPE. A base that is a rectangle or an L (the Dark Age barracks with its hall and yard) or has
   much of its silhouette off both edges cannot be made square by any transform: it goes into the
   repaint job tools/art_jobs/footprint_fix.json, with the original prompt plus a footprint clause.

Afterwards: python3 tools/ingest_art.py build/art/footprint_fix (for repaints), then
tools/visual_check.py and tools/footprint_check.py again.
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import footprint_check as fc

ROOT = fc.ROOT
JOB = os.path.join(ROOT, 'tools', 'art_jobs', 'footprint_fix.json')
OUTDIR = 'build/art/footprint_fix'
WIDTH_MIN, TILT_MAX = 0.80, 0.40
STEEP, MIN_SQUASH = 0.57, 0.72

# manifest key stem -> (gen_art stem, assets/source file) as ingest_art.py expects
STEM = {'range': 'range', 'towncenter': 'town_center', 'lumbercamp': 'lumbercamp', 'miningcamp': 'miningcamp', 'siegeworkshop': 'siege_workshop'}
SRC = {'range': 'archery_range', 'towncenter': 'town_center', 'lumbercamp': 'lumber_camp', 'miningcamp': 'mining_camp', 'siegeworkshop': 'siege_workshop', 'tower': 'watch_tower'}
PREFIX = {'western': 'w', 'mediterranean': 'med', 'eastasian': 'ea', 'middleeast': 'me', 'americas': 'am', 'indian': 'in'}

FOOTPRINT = (" THE FOOTPRINT IS THE WHOLE POINT: the building and everything that belongs to it (yard, fence, "
             "steps, shed, lean-to) must fit inside ONE square plot exactly the size and shape of the reference's, "
             "seen from the same corner-on 2:1 isometric angle, so that the painted ground edges run along the "
             "reference's ground edges. No long halls, no L-shapes, no yard sticking out in front of the square. "
             "A compact square-based building, like a mining camp or a house.")


def original_prompt(key):
    """The prompt this sprite was first made with, if a job file still has it."""
    base = fc.base_type(key); region = fc.region_of(key); dark = key.endswith('_dark')
    gen = STEM.get(base, base)
    want = {f"{PREFIX[region]}_{gen}{'_dark' if dark else ''}", f"{PREFIX[region]}_{SRC.get(base, base)}{'_dark' if dark else ''}"}
    for f in sorted(os.listdir(os.path.join(ROOT, 'tools', 'art_jobs'))):
        try: d = json.load(open(os.path.join(ROOT, 'tools', 'art_jobs', f)))
        except Exception: continue
        for j in d.get('jobs', []):
            if j[0] in want: return j[2]
    return None


def main(apply, run):
    man = json.load(open(fc.MAN))
    from PIL import Image
    offenders, squashes = [], []
    packs = {}
    for k, d in man.items():
        if not isinstance(d, dict) or 'size' not in d or 'w' not in d or 'ax' not in d: continue
        if k.startswith(('u/', 'res_', 'fnd_', 'stage')) or k == 'stump' or '_s1' in k or '_s2' in k: continue
        if fc.base_type(k) in fc.SKIP_TYPES: continue
        path = os.path.join(ROOT, d['file'])
        if path not in packs: packs[path] = Image.open(path).convert('RGBA')
        im = packs[path]
        if 'sx' in d: im = im.crop((d['sx'], d['sy'], d['sx'] + d['sw'], d['sy'] + d['sh']))
        m = fc.measure(d, im)
        if not m: continue
        bw = (m['right'][0] - m['left'][0]) / (d['size'] * fc.TW)
        if m['slope'] >= STEEP and m['tilt'] <= 0.3 and not d.get('_squash'):
            f = max(MIN_SQUASH, 0.5 / m['slope'])
            squashes.append((k, m['slope'], f))
            if apply:
                bottom = d['ay'] + d['size'] * fc.TH / 2          # the painted bottom corner sits here already
                d['h'] = round(d['h'] * f, 2); d['ay'] = round(bottom * f - d['size'] * fc.TH / 2, 2); d['_squash'] = round(f, 3)
                if 'chim' in d: d['chim'] = [d['chim'][0], round(d['chim'][1] * f, 1)]
            continue
        why = []
        if m['tilt'] > TILT_MAX: why.append(f'{m["tilt"]:.0%} of the base off its two edges (L-shape or yard at another angle)')
        elif bw < WIDTH_MIN and m['slope'] < STEEP: why.append(f'base {bw:.2f}x of the plot (rectangular footprint)')
        if why: offenders.append((k, why))
    jobs = []
    for k, why in offenders:
        base = fc.base_type(k); region = fc.region_of(k); dark = k.endswith('_dark')
        stem = f"{PREFIX[region]}_{STEM.get(base, base)}{'_dark' if dark else ''}"
        # the reference is the western source of the same building: a square footprint on the grid
        ref = SRC.get(base, base) + ('_dark' if dark else '') + '.png'
        if not os.path.exists(os.path.join(ROOT, 'assets', 'source', ref)): ref = SRC.get(base, base) + '.png'
        p = original_prompt(k) or f"Repaint this {base.replace('_', ' ')} in the {region} style already used by this dynasty's other buildings."
        jobs.append([stem, ref, p.rstrip() + FOOTPRINT])
    json.dump({'out': OUTDIR, 'jobs': jobs}, open(JOB, 'w'), indent=1)
    print(f'{len(squashes)} sprites painted too steep' + (' — squashed in the manifest:' if apply else ' (run with --apply to squash):'))
    for k, sl, f in squashes: print(f'  {k:36s} slope {sl:.2f} -> x{f:.2f} vertically')
    if apply: json.dump(man, open(fc.MAN, 'w'), indent=1)
    print(f'{len(offenders)} sprites need repainting (about {6 * len(offenders)} Kie credits):')
    for k, why in offenders: print(f'  {k:36s} {"; ".join(why)}')
    print(f'job file: {os.path.relpath(JOB, ROOT)}')
    if run:
        if not os.environ.get('KIE_KEY'): sys.exit('set KIE_KEY to generate')
        subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'gen_art.py'), JOB], check=True, cwd=ROOT)


if __name__ == '__main__':
    main('--apply' in sys.argv, '--run' in sys.argv)
