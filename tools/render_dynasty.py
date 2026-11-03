"""Render one dynasty's own units from their rigged models, reusing the Western jobs.

    python3 tools/render_dynasty.py franks [only,these]

Every Western job (and its upgrade tiers) is re-pointed at the dynasty's own rig and written
as unit3d_<dynasty>_<type>_<sex>[_tN]_<anim>, which js/art.js prefers over the regional set.
Royals drop the code-built crown, mantle and gown: their own regalia is modelled.
Each dynasty's unique unit is rendered on that dynasty's own body.
"""
import json, os, subprocess, sys
R = 'tools/render3d'
D = sys.argv[1]
only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
UNIQUE = {'franks': ('axe', 'militia', 'axethrower'), 'byzantines': ('cata', 'knight', 'cataphract'), 'chinese': ('repeat', 'archer', 'repeater')}
plan = []   # (job file, rig, game type, sex, tier)
for sex in 'mf':
    plan.append(('villager_jobs_f.json', f'{D}_villager_{sex}_rig.glb', 'villager', sex, 0))
for job, rig, typ, tiers in [('sword', 'militia', 'militia', 4), ('spear', 'spearman', 'spearman', 3),
                             ('arch', 'archer', 'archer', 3), ('knight', 'knight', 'knight', 3), ('scout', 'knight', 'scout', 1)]:
    for t in range(tiers):
        plan.append((f'j_{job}' + (f'_t{t}' if t else '') + '.json', f'{D}_{rig}_rig.glb', typ, 'm', t))
plan.append(('j_king.json', f'{D}_king_rig.glb', 'king', 'm', 0))
plan.append(('j_queen.json', f'{D}_queen_rig.glb', 'queen', 'f', 0))
uj, urig, utype = UNIQUE[D]
for t in range(2):
    plan.append((f'j_{uj}' + (f'_t{t}' if t else '') + '.json', f'{D}_{urig}_rig.glb', utype, 'm', t))
if D == 'byzantines': plan.append(('j_cata_hit.json', f'{D}_knight_rig.glb', 'cataphract', 'm', 0))
for jf, rig, typ, sex, t in plan:
    if only and typ not in only: continue
    stem0 = f'unit3d_{D}_{typ}_{sex}' + (f'_t{t}' if t else '')
    man = json.load(open('assets/manifest.json'))
    if '--redo' not in sys.argv and 'hit' not in jf and any(k.startswith(stem0 + '_') for k in man):
        print('have', stem0, flush=True); continue
    j = json.load(open(f'{R}/{jf}'))
    j['model'] = rig
    if typ in ('king', 'queen'):
        for a in j['anims']:
            a['props'] = [p for p in a.get('props', []) if p.get('tool') not in ('crown', 'mantle', 'gown')]
        if typ == 'queen': j['clipsUrl'] = ['villager_m_anim.glb', 'villager_m_anim2.glb'] + [c for c in j.get('clipsUrl', []) if 'villager_m' not in c]
    tmp = f'{R}/_job_{D}{os.environ.get("DRIVE","")[-4:-3]}.json'; json.dump(j, open(tmp, 'w'))
    out = f'build/render/{D}_{typ}_{sex}_t{t}' + ('_hit' if 'hit' in jf else '')
    stem = f'unit3d_{D}_{typ}_{sex}' + (f'_t{t}' if t else '')
    print('render', jf, '->', stem, flush=True)
    r = subprocess.run(['python3', os.environ.get('DRIVE','drive_jobs.py'), os.path.basename(tmp), os.path.abspath(out)], cwd=R, capture_output=True, text=True, timeout=3000)
    if r.returncode: print('RENDER FAIL', jf, r.stderr[-400:], flush=True); continue
    subprocess.run(['python3', 'tools/process_render.py', out, stem, str(j.get('height', 150))], check=True, capture_output=True)
    print('done', stem, flush=True)
os.remove(f'{R}/_job_{D}.json') if os.path.exists(f'{R}/_job_{D}.json') else None
