"""Unit portrait atlas for a dynasty, one Kie image per dynasty.

    KIE_KEY=... python3 tools/make_portrait_atlas.py <civ>            generate build/art/portraits/<civ>.png
    python3 tools/make_portrait_atlas.py <civ> --cut                   cut it into assets/ui/icons/atlas_<civ>.jpg

The four original dynasties' portraits are 6x4 grids of 128 px cells (assets/ui/icons/atlas_<civ>.jpg,
indexed in atlas.json as u/<civ>_<unit> -> [civ, col, row]). Rather than 22 separate images, this
asks the GPT image-to-image model to redraw the Britons grid as the new dynasty, cell by cell, in
one picture (about 6 credits), then cuts that picture into the same cells. Cells the dynasty has no
unit for (the Incas have no cavalry) are asked to stay empty and are not indexed.
"""
import json, os, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'build', 'art', 'portraits')
ATLAS = os.path.join(ROOT, 'assets', 'ui', 'icons', 'atlas.json')

# the grid, as the Britons atlas has it: (col, row) -> unit key; the dynasty's unique unit and its
# elite take the longbowman cells
GRID = {(0, 0): 'arbalester', (1, 0): 'archer', (2, 0): 'cavalier', (3, 0): 'champion', (4, 0): 'crossbow', (5, 0): 'UNIQUE_ELITE',
        (0, 1): 'halberdier', (1, 1): 'king', (2, 1): 'knight', (3, 1): 'UNIQUE', (4, 1): 'longsword', (5, 1): 'manatarms',
        (0, 2): 'militia', (1, 2): 'monk', (2, 2): 'paladin', (3, 2): 'pikeman', (4, 2): 'queen', (5, 2): 'scout',
        (0, 3): 'spearman', (1, 3): 'villager', (2, 3): 'villager_f', (3, 3): 'villagers'}

# what each cell shows, per dynasty. Team colour stays the deep blue of the reference.
CIVS = {
    'persians': {
        'unique': ('elephant', 'eliteelephant'), 'no': [],
        'style': 'Sasanian Persians, 6th century: dark hair and beards, bronze skin, lamellar and scale armour, pointed and domed helmets, rich patterned silks, gold and turquoise ornament',
        'cells': {
            'arbalester': 'a veteran Persian archer in scale armour and a domed helmet with a mail aventail, a composite bow and full quiver',
            'archer': 'a young Persian archer in a quilted coat and a soft cap, a composite bow',
            'cavalier': 'a heavy Persian horseman in full scale armour on an armoured horse, a long lance',
            'champion': 'an elite Persian swordsman in gilded lamellar armour and a crested helmet, a long straight sword',
            'crossbow': 'a Persian archer in a lamellar cuirass and a pointed helmet, a composite bow drawn',
            'UNIQUE_ELITE': 'an armoured war elephant with a gilded howdah tower and archers, its mahout in a gold helmet',
            'halberdier': 'a Persian spearman in heavy scale armour with a long spear and a tall wicker shield',
            'king': 'the Persian Shah, a stern bearded king in a tall jewelled crown with golden wings, purple and gold robes',
            'knight': 'a Persian cavalryman in scale armour on a horse with blue caparison, a lance and a round shield',
            'UNIQUE': 'a war elephant with a wooden howdah and a mahout, blue cloth over its back',
            'longsword': 'a Persian swordsman in lamellar armour and a pointed helmet with a blue plume, a sword and shield',
            'manatarms': 'a Persian soldier in a quilted coat with iron shoulder plates and a simple helmet, a sword',
            'militia': 'a Persian levy in a blue tunic and leather cap with a short sword',
            'monk': 'a Zoroastrian priest in white robes and a white cloth mask over his mouth, holding a sacred fire barsom',
            'paladin': 'a Persian cataphract in full gilded armour, horse and rider both armoured, a heavy lance',
            'pikeman': 'a Persian spearman in a scale shirt and a domed helmet with a long spear',
            'queen': 'the Persian Shahbanu, a queen in a gold diadem and a veil, purple and gold silk, jewels',
            'scout': 'a Persian light horseman in a blue tunic on a fast horse with a bow',
            'spearman': 'a Persian spearman in a quilted coat and soft cap with a spear and wicker shield',
            'villager': 'a Persian farmer, a dark-bearded man in a blue tunic and trousers holding an axe',
            'villager_f': 'a Persian woman in a blue dress and headscarf carrying a basket',
            'villagers': 'a Persian man and woman side by side, the man with an axe, the woman with a basket',
        }},
    'incas': {
        'unique': ('kamayuk', 'elitekamayuk'), 'no': ['scout', 'knight', 'cavalier', 'paladin'],
        'style': 'Incas of the Andes, 15th century: bronze skin, black hair cut straight, quilted cotton armour, woven tunics with geometric tocapu patterns, gold ear spools, feather headdresses, slings and star-headed maces',
        'cells': {
            'arbalester': 'a veteran Inca slinger in a feathered headdress and quilted armour, a sling and a bag of stones',
            'archer': 'a young Inca slinger in a woven tunic and headband, a sling',
            'cavalier': 'EMPTY',
            'champion': 'an elite Inca warrior in a gold chest plate and a tall feather headdress with a star-headed mace',
            'crossbow': 'an Inca slinger in quilted armour and a wooden helmet, a sling whirling',
            'UNIQUE_ELITE': 'an elite Inca kamayuk in gold-trimmed quilted armour and a feather crest with a very long hooked spear',
            'halberdier': 'an Inca warrior in heavy quilted armour and a wooden helmet with a long spear and a wooden shield',
            'king': 'the Sapa Inca, a king in a red fringe crown with gold and feathers, a gold sun disc on his chest, rich tocapu robes',
            'knight': 'EMPTY',
            'UNIQUE': 'an Inca kamayuk warrior in quilted armour with a very long hooked spear',
            'longsword': 'an Inca warrior in quilted armour and a wooden helmet with a star-headed mace and a shield',
            'manatarms': 'an Inca soldier in a woven tunic with a star-headed mace',
            'militia': 'an Inca levy in a blue woven tunic with a wooden club',
            'monk': 'an Inca priest in white and gold robes with a gold sun disc, a ceremonial staff',
            'paladin': 'EMPTY',
            'pikeman': 'an Inca spearman in quilted armour and a feather headband with a long spear',
            'queen': 'the Coya, an Inca queen in a fine woven blue dress, gold pins and a feathered headdress',
            'scout': 'EMPTY',
            'spearman': 'an Inca spearman in a woven tunic with a spear and a small round shield',
            'villager': 'an Inca farmer, a man in a blue woven tunic and cap holding a foot plough',
            'villager_f': 'an Inca woman in a blue woven dress with a shawl pinned by a gold tupu, carrying a basket',
            'villagers': 'an Inca man and woman side by side, the man with a tool, the woman with a basket',
        }},
    'cholas': {
        'unique': ('templeguard', 'elitetempleguard'), 'no': [],
        'style': 'Chola dynasty of South India, 11th century: brown skin, black hair, bare torsos or quilted cotton, dhotis and sashes, gold jewellery, bronze breastplates, turbans and jewelled crowns, curved swords and tall shields',
        'cells': {
            'arbalester': 'a veteran Chola archer in a bronze breastplate and a turban with a tall longbow and quiver',
            'archer': 'a young Chola archer in a blue dhoti and sash with a bamboo bow',
            'cavalier': 'a Chola heavy horseman in bronze scale armour on a caparisoned horse with a lance',
            'champion': 'an elite Chola warrior in gilded bronze armour and a jewelled turban with a curved sword',
            'crossbow': 'a Chola archer in quilted armour and a turban drawing a longbow',
            'UNIQUE_ELITE': 'an elite Chola temple guard in gilded bronze armour with a curved sword and tall shield, a tiger emblem',
            'halberdier': 'a Chola spearman in heavy quilted armour with a long spear and a tall shield',
            'king': 'the Chola Raja, a king in a tall jewelled gold crown and gold ornaments, blue and gold silk',
            'knight': 'a Chola cavalryman in a bronze breastplate on a horse with blue caparison, lance and shield',
            'UNIQUE': 'a Chola temple guard in bronze breastplate and blue sash with a curved sword and tall shield',
            'longsword': 'a Chola swordsman in bronze armour and a turban with a curved sword and shield',
            'manatarms': 'a Chola soldier in quilted cotton armour with a curved sword',
            'militia': 'a Chola levy in a blue dhoti and sash with a short sword',
            'monk': 'a Hindu temple priest with a shaved head and sacred thread, white dhoti, holding a brass lamp',
            'paladin': 'a Chola cavalry champion in full gilded armour on an armoured horse with a heavy lance',
            'pikeman': 'a Chola spearman in a quilted coat and turban with a long spear',
            'queen': 'the Chola Rani, a queen in a gold crown, heavy gold jewellery and a blue and gold silk sari',
            'scout': 'a Chola light horseman in a blue tunic and turban on a fast horse',
            'spearman': 'a Chola spearman in a blue dhoti with a spear and a round shield',
            'villager': 'a Chola farmer, a man in a blue dhoti and turban holding an axe',
            'villager_f': 'a Chola woman in a blue sari carrying a basket',
            'villagers': 'a Chola man and woman side by side, the man with an axe, the woman with a basket',
        }},
}


def prompt(civ):
    c = CIVS[civ]
    rows = []
    for r in range(4):
        cells = []
        for col in range(6):
            u = GRID.get((col, r))
            if u is None: cells.append('plain dark background, empty'); continue
            d = c['cells'][u]
            cells.append('plain dark background, empty' if d == 'EMPTY' or u in c['no'] else d)
        rows.append(f'Row {r + 1}, left to right: ' + '; '.join(cells) + '.')
    return (f'Redraw this grid of portraits as {c["style"]}. Keep EXACTLY the same 6 columns by 4 rows of equal square cells, '
            'the same thin dark gaps between cells, the same plain very dark background in every cell, the same three-quarter-length '
            'framing with the head near the top of each cell, the same hand-painted semi-realistic Age of Empires 2 portrait style and '
            'the same lighting from the upper left. Every cell holds ONE person (or one mounted rider, or one elephant with rider) looking '
            'toward the viewer. Blue remains the team colour on cloth. ' + ' '.join(rows) +
            ' The last two cells of row 4 stay plain dark background, empty. No text, no letters, no borders, no frames.')


def generate(civ):
    jobs = {'out': OUT, 'jobs': [[civ, 'repo:assets/ui/icons/atlas_britons.jpg', prompt(civ), '']]}
    path = os.path.join(OUT, f'_{civ}_job.json'); os.makedirs(OUT, exist_ok=True)
    json.dump(jobs, open(path, 'w'))
    env = dict(os.environ, KIE_ASPECT='3:2')
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'gen_art.py'), path], check=True, env=env, cwd=ROOT)


def cut(civ):
    c = CIVS[civ]
    im = Image.open(os.path.join(OUT, f'{civ}.png')).convert('RGB').resize((768, 512), Image.LANCZOS)
    im.save(os.path.join(ROOT, 'assets', 'ui', 'icons', f'atlas_{civ}.jpg'), quality=88, optimize=True)
    idx = json.load(open(ATLAS))
    idx = {k: v for k, v in idx.items() if not k.startswith(f'u/{civ}_')}
    for (col, row), u in GRID.items():
        key = {'UNIQUE': c['unique'][0], 'UNIQUE_ELITE': c['unique'][1]}.get(u, u)
        if u in c['no']: continue
        idx[f'u/{civ}_{key}'] = [civ, col, row]
    json.dump(idx, open(ATLAS, 'w'), separators=(',', ':'))
    print(f'atlas_{civ}.jpg written, {sum(1 for k in idx if k.startswith(f"u/{civ}_"))} portraits indexed')


if __name__ == '__main__':
    civ = sys.argv[1]
    if '--cut' in sys.argv: cut(civ)
    else: generate(civ)
