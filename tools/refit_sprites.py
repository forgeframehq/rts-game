"""Refit building sprites that were painted wider than their plot.

    python3 tools/refit_sprites.py            report only
    python3 tools/refit_sprites.py --apply    rewrite the manifest

process_art.py sizes a sprite so that "the widest row in its lower 30%" spans the plot. For a
courtyard compound (a barracks or a range with a yard and a gatehouse in front) that row is
the gatehouse, so the whole compound comes out far too big and tramples its neighbours.
tools/visual_check.py measures this as width/plot. This scales every building sprite over
LIMIT down to TARGET (a sloped roof's eaves may still overhang a little), moving its anchor
so the bottom corner of the art stays on the bottom corner of the plot. Only the manifest
changes: the pixels are drawn scaled, and the Dark Age variant and construction stages of a
refitted building are scaled by the same factor so they still line up.

Windmills are left alone: their sails are meant to reach past the plot.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAN = os.path.join(ROOT, 'assets', 'manifest.json')
TW, TH = 64, 32
LIMIT, TARGET = 1.3, 1.1
SKIP = ('mill',)


def main(apply):
    man = json.load(open(MAN))
    done = []
    for k, d in list(man.items()):
        if not isinstance(d, dict) or 'size' not in d or 'w' not in d or k.startswith('u/') or k.startswith('res_') or k == 'stump': continue   # trees and mines are meant to spill over their tile
        if '_s1' in k or '_s2' in k or any(k.endswith(s) or k.endswith(s + '_dark') for s in SKIP): continue
        plot = d['size'] * TW
        over = d['w'] / plot
        if over <= LIMIT: continue
        f = TARGET * plot / d['w']
        # the same factor for every sprite of this building: the key itself, its Age tiers
        fam = [k]   # construction stages (assets/stages.json) are fitted on their own and already sit on the plot
        for x in fam:
            e = man[x]
            if e.get('_refit'): continue
            ow = e['w']
            e['w'] = round(e['w'] * f, 2); e['h'] = round(e['h'] * f, 2); e['ax'] = round(e['ax'] * f, 2)
            # keep the art's bottom corner on the plot's bottom corner (the anchor is the plot's centre)
            e['ay'] = round(e['h'] - e['size'] * TH / 2, 2) if 'size' in e else round(e['ay'] * f, 2)
            if 'chim' in e: e['chim'] = [round(e['chim'][0] * f, 1), round(e['chim'][1] * f, 1)]
            e['_refit'] = round(f, 3)
            done.append((x, over, f, ow, e['w']))
    for x, over, f, ow, nw in done:
        print(f'{x:40s} was {over:.2f}x the plot: x{f:.3f}  {ow:.0f} -> {nw:.0f} px')
    if apply:
        json.dump(man, open(MAN, 'w'), indent=1)
        print(f'manifest written, {len(done)} entries refitted')
    else:
        print(f'{len(done)} entries would change; run with --apply')


if __name__ == '__main__':
    main('--apply' in sys.argv)
